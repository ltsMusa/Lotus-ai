package com.lotusai.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.app.Activity;

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

    private static final int REQUEST_RECORD_AUDIO_PERMISSION = 200;
    private static final int FILE_CHOOSER_RESULT_CODE = 300;

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
        setContentView(webView);

        configureWebView();

        webView.loadUrl("file:///android_asset/www/index.html");

        requestMicrophonePermissionIfNeeded();
    }

    // ------------------------------------------------------
    // WEBVIEW SETUP
    // ------------------------------------------------------

    private void configureWebView() {

        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);

        // config.js / memory.js / storage.js all rely on localStorage.
        settings.setDomStorageEnabled(true);

        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // Lets TTS (js/speech.js speechSynthesis) and any future audio
        // start without requiring a tap first.
        settings.setMediaPlaybackRequiresUserGesture(false);

        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {

                // Keep app-internal navigation (file:// assets) inside
                // the WebView; anything else (external http/https links)
                // goes to the system browser instead of hijacking the app.
                if (url != null && url.startsWith("file:///android_asset/")) {
                    return false;
                }

                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    return true;
                }

                return false;
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
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
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
