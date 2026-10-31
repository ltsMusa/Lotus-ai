package com.lotusai.app;

import android.Manifest;
import android.app.ActivityManager;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.app.Activity;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * ==========================================================
 * Lotus AI - Android Wrapper (AIDE / Gradle project)
 * ==========================================================
 * Loads the existing web app (assets/www/index.html — same
 * code as the browser version) into a fullscreen WebView.
 * This file is what makes "tam ekran" (true fullscreen, no
 * status/nav bars) possible — that can't be done from web CSS
 * alone, it needs a native Activity.
 *
 * HOW THE PAGE IS LOADED (important):
 * The web app is made of ES modules (<script type="module">).
 * Chromium refuses to load modules from file:// URLs ("blocked by
 * CORS policy ... origin 'null'"), so loading
 * file:///android_asset/www/index.html gave a page that never got
 * past the splash screen. Instead the page is opened on a private
 * https origin (APP_ORIGIN) and shouldInterceptRequest() answers
 * every request for it straight from assets/www. Nothing is sent
 * over the network for those files, and no extra library is needed.
 *
 * ON-DEVICE AI (Lotus Mini):
 * The page is served with Cross-Origin-Opener-Policy / Embedder-Policy
 * headers so it is "cross-origin isolated" — that is what lets the
 * WebAssembly engine (wllama) use several CPU threads. LotusNative
 * (see NativeBridge below) hands the page the numbers a web page cannot
 * read by itself: total RAM, the system thermal status, battery
 * temperature/level and power-saver mode. js/deviceMonitor.js uses them
 * to pick a smaller local model when the phone gets hot.
 *
 * GOOGLE SIGN-IN: Google blocks OAuth inside a WebView, so the page asks
 * LotusNative.openAuthUrl() to open the sign-in in the phone's browser; the
 * browser comes back through the lotusai://auth link declared in the manifest
 * (onNewIntent below), and the page picks the link up with
 * LotusNative.takePendingAuthUrl(). See js/nativeAuth.js.
 *
 * BACKGROUND + NOTIFICATIONS: LotusNative.keepAlive() runs LotusService (an
 * ongoing notification that keeps the process alive while an answer or a model
 * download is in progress); LotusNative.notify() posts reply / download / alert
 * notifications. See js/notify.js.
 *
 * Honesty notes (read before relying on these):
 * - Sesle yazma (js/speech.js, Web Speech API) needs Google's
 *   online speech recognition service. It sometimes doesn't
 *   work at all inside a bundled WebView (not the real Chrome
 *   app) depending on the device/Android version — this is an
 *   Android platform limitation, not something fixable from
 *   here. Test it on your actual device before relying on it.
 * - The Groq auto-proxy ("/api/chat") only works if you set a
 *   full server URL in Ayarlar → Yapay Zekâ → "Sunucu Proxy
 *   Adresi" (e.g. your Vercel deployment) — a packaged app has
 *   no "same origin" server to call relatively.
 * ==========================================================
 */
public class MainActivity extends Activity {

    // Private origin that only exists inside this app (it is never resolved
    // on the network — every request for it is answered from assets/www).
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_ORIGIN = "https://" + APP_HOST;
    private static final String APP_URL = APP_ORIGIN + "/www/index.html";

    private static final int REQUEST_RECORD_AUDIO_PERMISSION = 200;
    private static final int FILE_CHOOSER_RESULT_CODE = 300;
    private static final int REQUEST_POST_NOTIFICATIONS = 201;

    // Only Supabase's own sign-in address may be opened in the browser by the page.
    private static final String AUTH_HOST_SUFFIX = ".supabase.co";
    private static final String AUTH_PATH_PREFIX = "/auth/v1/authorize";

    // True between onStart and onStop = the app is on screen.
    private volatile boolean inForeground = false;

    // The lotusai://auth?... link the browser returned the user with, until the page takes it.
    private volatile String pendingAuthUrl = null;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {

        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);

        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        webView = new WebView(this);

        // The WebView sits in a plain FrameLayout so that, where Android no longer
        // makes room for the system bars / keyboard itself (see below), the room can
        // be given back as padding of this one view.
        FrameLayout root = new FrameLayout(this);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        applyEdgeToEdgeInsets(root);

        configureWebView();

        // Device power / heat readings for the on-device AI (js/deviceMonitor.js).
        webView.addJavascriptInterface(new NativeBridge(), "LotusNative");

        webView.loadUrl(APP_URL);

        // Started by the sign-in link (the app had been closed while the browser was open).
        captureAuthLink(getIntent());

        requestMicrophonePermissionIfNeeded();
    }

    // ------------------------------------------------------
    // FOREGROUND STATE + RETURN LINKS FROM THE BROWSER
    // ------------------------------------------------------

    @Override
    protected void onStart() {

        super.onStart();

        inForeground = true;
    }

    @Override
    protected void onStop() {

        inForeground = false;

        super.onStop();
    }

    @Override
    protected void onNewIntent(Intent intent) {

        super.onNewIntent(intent);

        setIntent(intent);

        // Back from the browser (or a notification was tapped).
        if (captureAuthLink(intent)) dispatchWebEvent("lotus-native-auth");
    }

    /** Remembers a lotusai://auth link; returns true when the intent carried one. */
    private boolean captureAuthLink(Intent intent) {

        if (intent == null) return false;

        Uri data = intent.getData();

        if (data == null || !"lotusai".equals(data.getScheme()) || !"auth".equals(data.getHost())) return false;

        String link = data.toString();

        // A real link is a few hundred characters; refuse anything absurd.
        if (link.length() > 4000) return false;

        pendingAuthUrl = link;

        return true;
    }

    /** Fires a plain event on window (the name is always one of our own constants). */
    private void dispatchWebEvent(final String name) {

        runOnUiThread(new Runnable() {
            @Override
            public void run() {

                if (webView != null) {
                    webView.evaluateJavascript("window.dispatchEvent(new Event('" + name + "'))", null);
                }
            }
        });
    }

    // ------------------------------------------------------
    // WEBVIEW SETUP
    // ------------------------------------------------------

    private void configureWebView() {

        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);

        // config.js / memory.js / storage.js all rely on localStorage.
        settings.setDomStorageEnabled(true);

        // Nothing is loaded from file:// any more (see the note at the top),
        // so file access can stay off; content:// stays on for the file picker.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);

        // Lets TTS (js/speech.js speechSynthesis) and any future audio
        // start without requiring a tap first.
        settings.setMediaPlaybackRequiresUserGesture(false);

        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {

                // Keep app-internal navigation inside the WebView; anything
                // else (external http/https links) goes to the system
                // browser instead of hijacking the app.
                if (url != null && url.startsWith(APP_ORIGIN + "/")) {
                    return false;
                }

                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    openExternal(url);
                    return true;
                }

                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {

                // null = not ours, WebView does its normal network request.
                return serveAsset(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {

            // window.open(...) / target="_blank" — used by the
            // "API Key Al↗" links (js/settings.js) and the Groq
            // console button (js/chat.js). Without this override,
            // WebView silently does nothing on window.open().
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {

                WebView.HitTestResult result = view.getHitTestResult();

                String url = result != null ? result.getExtra() : null;

                if (url != null) {
                    openExternal(url);
                }

                return false;
            }

            // Mikrofon erişimi — js/speech.js STT (Web Speech API) için.
            @Override
            public void onPermissionRequest(final PermissionRequest request) {

                runOnUiThread(() -> {

                    if (hasRecordAudioPermission()) {
                        request.grant(request.getResources());
                    } else {
                        pendingPermissionRequest = request;
                        requestMicrophonePermissionIfNeeded();
                    }
                });
            }

            // js/attachments.js — <input type="file"> dosya seçici.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {

                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }

                filePathCallback = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    startActivityForResult(Intent.createChooser(intent, "Dosya seç"), FILE_CHOOSER_RESULT_CODE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }

                return true;
            }
        });
    }

    // ------------------------------------------------------
    // EXTERNAL LINKS + EDGE-TO-EDGE (target SDK 35)
    // ------------------------------------------------------

    private void openExternal(String url) {

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
            // No browser installed — nothing sensible to do.
        }
    }

    /**
     * Apps that target Android 15 (API 35) and run on Android 15+ are always drawn
     * edge-to-edge: the system no longer shrinks the window for the status bar,
     * display cutout or on-screen keyboard, so the chat input would end up under
     * the keyboard. There the room is handed back here as padding. On older
     * Android versions or older targets the system already does this, so nothing
     * is changed (that is also why this only runs for target >= 35 on API >= 35).
     */
    private void applyEdgeToEdgeInsets(FrameLayout root) {

        if (Build.VERSION.SDK_INT < 35 || getApplicationInfo().targetSdkVersion < 35) return;

        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        // getSystemWindowInset*() = status/navigation bars + display cutout + keyboard.
        // (Deprecated since API 30 but still correct, and it compiles against any android.jar.)
        root.setOnApplyWindowInsetsListener((view, insets) -> {

            view.setPadding(
                insets.getSystemWindowInsetLeft(),
                insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(),
                insets.getSystemWindowInsetBottom()
            );

            return insets.consumeSystemWindowInsets();
        });

        root.requestApplyInsets();
    }

    // ------------------------------------------------------
    // SERVING assets/www ON THE PRIVATE ORIGIN
    // ------------------------------------------------------

    private WebResourceResponse serveAsset(Uri uri) {

        if (uri == null || !APP_HOST.equalsIgnoreCase(uri.getHost())) return null;

        String path = uri.getPath();

        if (path == null || path.length() == 0 || "/".equals(path)) path = "/www/index.html";

        if (path.endsWith("/")) path = path + "index.html";

        // Only the bundled web app is reachable, and never outside it.
        if (path.contains("..") || !path.startsWith("/www/")) return notFound();

        String assetPath = path.substring(1);

        try {

            InputStream stream = getAssets().open(assetPath);

            String mime = mimeTypeFor(assetPath);

            boolean text = mime.startsWith("text/") || mime.contains("javascript")
                || mime.contains("json") || mime.contains("xml");

            Map<String, String> headers = new HashMap<String, String>();

            // Files change with every app update; never let a stale copy stick.
            headers.put("Cache-Control", "no-cache");

            // Cross-origin isolation = multi-threaded WebAssembly for the local
            // model. "credentialless" keeps ordinary third-party scripts, fonts
            // and images (CDN, Google Fonts) working without special headers.
            headers.put("Cross-Origin-Opener-Policy", "same-origin");
            headers.put("Cross-Origin-Embedder-Policy", "credentialless");

            // A model file bundled into the APK: js/providers/local.js asks for its
            // size (HEAD) before using it, and range requests are not supported.
            if (path.startsWith("/www/models/")) {

                try {
                    headers.put("Content-Length", String.valueOf(stream.available()));
                } catch (IOException ignored) {
                }

                headers.put("Accept-Ranges", "none");
            }

            return new WebResourceResponse(mime, text ? "utf-8" : null, 200, "OK", headers, stream);

        } catch (IOException e) {

            return notFound();
        }
    }

    private WebResourceResponse notFound() {

        byte[] body = "{\"error\":\"not found\"}".getBytes();

        return new WebResourceResponse(
            "application/json", "utf-8", 404, "Not Found",
            new HashMap<String, String>(), new ByteArrayInputStream(body)
        );
    }

    private String mimeTypeFor(String path) {

        int dot = path.lastIndexOf('.');

        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase(Locale.US) : "";

        // ES modules are only accepted with a JavaScript MIME type, so the
        // important ones are spelled out instead of trusting the device.
        switch (ext) {
            case "html": return "text/html";
            case "js":
            case "mjs": return "application/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg":
            case "jpeg": return "image/jpeg";
            case "ico": return "image/x-icon";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            // WebAssembly.instantiateStreaming() refuses any other type.
            case "wasm": return "application/wasm";
            case "txt": return "text/plain";
            default:
                String guessed = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                return guessed != null ? guessed : "application/octet-stream";
        }
    }

    // ------------------------------------------------------
    // NATIVE BRIDGE  (window.LotusNative.getDeviceInfo())
    // ------------------------------------------------------

    private class NativeBridge {

        /** Lets the page tell an old APK (fewer methods) from this one. */
        @JavascriptInterface
        public int bridgeVersion() {

            return 2;
        }

        @JavascriptInterface
        public boolean isForeground() {

            return inForeground;
        }

        // ---------- Google sign-in in the browser ----------

        /** Opens Supabase's sign-in address in the phone's browser. Only that address is accepted. */
        @JavascriptInterface
        public boolean openAuthUrl(String url) {

            final Uri uri;

            try {
                uri = Uri.parse(url);
            } catch (Exception e) {
                return false;
            }

            String host = uri.getHost();
            String path = uri.getPath();

            if (!"https".equals(uri.getScheme()) || host == null || !host.endsWith(AUTH_HOST_SUFFIX)
                || path == null || !path.startsWith(AUTH_PATH_PREFIX)) {
                return false;
            }

            runOnUiThread(new Runnable() {
                @Override
                public void run() {

                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException e) {
                        dispatchWebEvent("lotus-native-auth-failed");
                    }
                }
            });

            return true;
        }

        /** The returned link, once; an empty string when there is none. */
        @JavascriptInterface
        public String takePendingAuthUrl() {

            String link = pendingAuthUrl;

            pendingAuthUrl = null;

            return link == null ? "" : link;
        }

        // ---------- clipboard (API-key helper) ----------

        /** Current clipboard text — only while the app is on screen (Android 10+ allows nothing else). */
        @JavascriptInterface
        public String readClipboard() {

            if (!inForeground) return "";

            try {

                ClipboardManager manager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);

                if (manager == null || !manager.hasPrimaryClip()) return "";

                ClipData clip = manager.getPrimaryClip();

                if (clip == null || clip.getItemCount() == 0) return "";

                CharSequence text = clip.getItemAt(0).coerceToText(MainActivity.this);

                if (text == null) return "";

                String value = text.toString();

                return value.length() > 500 ? value.substring(0, 500) : value;

            } catch (Exception e) {

                return "";
            }
        }

        // ---------- notifications + background ----------

        @JavascriptInterface
        public boolean notificationsAllowed() {

            return areNotificationsAllowed();
        }

        /** Android 13+: the permission dialog. If notifications are switched off in system settings: opens those. */
        @JavascriptInterface
        public void requestNotificationPermission() {

            runOnUiThread(new Runnable() {
                @Override
                public void run() {

                    try {

                        if (Build.VERSION.SDK_INT >= 33 && !hasNotificationPermission()) {
                            requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" }, REQUEST_POST_NOTIFICATIONS);
                            return;
                        }

                        if (!areNotificationsAllowed() && Build.VERSION.SDK_INT >= 26) {
                            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                            startActivity(intent);
                        }

                    } catch (Exception ignored) {
                    }
                }
            });
        }

        /** kind: "reply" | "download" | "alert". Returns false when notifications are not allowed. */
        @JavascriptInterface
        public boolean notify(String kind, String title, String body, int id) {

            if (!areNotificationsAllowed()) return false;

            try {

                Notifier.post(MainActivity.this, kind, id, clip(title, 80), clip(body, 400));

                return true;

            } catch (Exception e) {

                return false;
            }
        }

        /**
         * on = true: run / refresh the foreground service (ongoing notification) with this text;
         * percent 0–100 shows a progress bar, negative none. on = false: stop it.
         */
        @JavascriptInterface
        public void keepAlive(final boolean on, final String text, final int percent) {

            runOnUiThread(new Runnable() {
                @Override
                public void run() {

                    try {

                        if (on) {
                            LotusService.keepAlive(MainActivity.this, clip(text, 120), percent);
                        } else {
                            LotusService.stop(MainActivity.this);
                        }

                    } catch (Exception ignored) {
                    }
                }
            });
        }

        /**
         * One JSON object, read fresh on every call:
         * { ramMB, cores, thermalStatus, batteryTempC, batteryPct, charging, powerSave }
         * thermalStatus follows PowerManager.THERMAL_STATUS_* (0 none … 6 shutdown)
         * and is -1 where the phone (Android < 10) cannot tell.
         */
        @JavascriptInterface
        public String getDeviceInfo() {

            long ramMB = 0;
            int thermalStatus = -1;
            double batteryTempC = 0;
            int batteryPct = -1;
            boolean charging = false;
            boolean powerSave = false;

            try {

                ActivityManager activityManager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);

                if (activityManager != null) {
                    ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
                    activityManager.getMemoryInfo(info);
                    ramMB = info.totalMem / (1024L * 1024L);
                }

            } catch (Exception ignored) {
            }

            try {

                PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);

                if (powerManager != null) {

                    powerSave = powerManager.isPowerSaveMode();

                    // Looked up by name so the project still compiles with an
                    // older android.jar (AIDE ships several).
                    if (Build.VERSION.SDK_INT >= 29) {

                        Object value = PowerManager.class.getMethod("getCurrentThermalStatus").invoke(powerManager);

                        if (value instanceof Integer) thermalStatus = (Integer) value;
                    }
                }

            } catch (Exception ignored) {
            }

            try {

                Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));

                if (battery != null) {

                    int level = battery.getIntExtra("level", -1);
                    int scale = battery.getIntExtra("scale", 100);

                    if (level >= 0 && scale > 0) batteryPct = Math.round(level * 100f / scale);

                    // Reported in tenths of a degree Celsius.
                    int tenths = battery.getIntExtra("temperature", 0);

                    batteryTempC = tenths / 10.0;

                    int plugged = battery.getIntExtra("plugged", 0);

                    charging = plugged != 0;
                }

            } catch (Exception ignored) {
            }

            int cores = Runtime.getRuntime().availableProcessors();

            return "{"
                + "\"ramMB\":" + ramMB
                + ",\"cores\":" + cores
                + ",\"thermalStatus\":" + thermalStatus
                + ",\"batteryTempC\":" + batteryTempC
                + ",\"batteryPct\":" + batteryPct
                + ",\"charging\":" + charging
                + ",\"powerSave\":" + powerSave
                + "}";
        }
    }

    // ------------------------------------------------------
    // NOTIFICATION HELPERS
    // ------------------------------------------------------

    private static String clip(String value, int max) {

        if (value == null) return "";

        return value.length() > max ? value.substring(0, max) : value;
    }

    private boolean hasNotificationPermission() {

        // Looked up by its text: the constant does not exist in an API 29 android.jar.
        return Build.VERSION.SDK_INT < 33
            || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
    }

    private boolean areNotificationsAllowed() {

        try {

            if (!hasNotificationPermission()) return false;

            if (Build.VERSION.SDK_INT < 24) return true;

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            return manager == null || manager.areNotificationsEnabled();

        } catch (Exception e) {

            return false;
        }
    }

    // ------------------------------------------------------
    // FILE CHOOSER RESULT (js/attachments.js)
    // ------------------------------------------------------

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {

        if (requestCode == FILE_CHOOSER_RESULT_CODE) {

            if (filePathCallback == null) {
                super.onActivityResult(requestCode, resultCode, data);
                return;
            }

            Uri[] results = null;

            if (resultCode == Activity.RESULT_OK && data != null) {

                if (data.getClipData() != null) {

                    // Multiple files selected.
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];

                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }

                } else if (data.getData() != null) {

                    // Single file selected.
                    results = new Uri[]{ data.getData() };
                }
            }

            filePathCallback.onReceiveValue(results);
            filePathCallback = null;

            return;
        }

        super.onActivityResult(requestCode, resultCode, data);
    }

    // ------------------------------------------------------
    // MICROPHONE PERMISSION (runtime, Android 6+)
    // ------------------------------------------------------

    private boolean hasRecordAudioPermission() {

        return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestMicrophonePermissionIfNeeded() {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        if (!hasRecordAudioPermission()) {
            requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQUEST_RECORD_AUDIO_PERMISSION);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {

        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQUEST_POST_NOTIFICATIONS) {

            // Let the Settings page refresh its "izin verildi / verilmedi" line.
            dispatchWebEvent("lotus-native-permission");

            return;
        }

        if (requestCode != REQUEST_RECORD_AUDIO_PERMISSION) return;

        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;

        if (pendingPermissionRequest != null) {

            if (granted) {
                pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            } else {
                pendingPermissionRequest.deny();
            }

            pendingPermissionRequest = null;
        }
    }

    // ------------------------------------------------------
    // BACK BUTTON — navigate WebView history instead of exiting
    // ------------------------------------------------------

    @Override
    public void onBackPressed() {

        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // ------------------------------------------------------
    // FULLSCREEN — immersive sticky (hides status + nav bars,
    // reappears briefly on swipe, then auto-hides again)
    // ------------------------------------------------------

    private void applyImmersiveFullscreen() {

        int flags =
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;

        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {

        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) applyImmersiveFullscreen();
    }

    @Override
    protected void onResume() {

        super.onResume();

        applyImmersiveFullscreen();
    }
}
