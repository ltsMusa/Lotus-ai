package com.lotusai.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Keeps Lotus AI alive while an answer is being made or a model is being
 * downloaded, so switching to another app does not cut the work off.
 *
 * Android only allows this with a foreground service, which must show an
 * ongoing notification — that is the "Lotus AI · yanıt hazırlıyor" line.
 * The page (js/notify.js) starts it when work begins and stops it when the
 * work ends; it also sends a heartbeat every ~45 s. If the heartbeat stops
 * (page crashed, WebView gone) the service stops itself, so it can never
 * linger by mistake.
 */
public class LotusService extends Service {

    private static final String EXTRA_TEXT = "text";
    private static final String EXTRA_PERCENT = "percent";

    /** No heartbeat for this long → stop. */
    private static final long IDLE_STOP_MS = 150 * 1000L;

    private static LotusService running;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private final Runnable idleStop = new Runnable() {
        @Override
        public void run() {
            stopSelf();
        }
    };

    // ------------------------------------------------------
    // CALLED FROM MainActivity (UI thread)
    // ------------------------------------------------------

    /** Starts the service, or just refreshes it when it is already running. */
    static void keepAlive(Context context, String text, int percent) {

        LotusService service = running;

        // Already running: update in place. Starting a foreground service again from
        // the background is not allowed on newer Android, and is not needed.
        if (service != null) {
            service.refresh(text, percent);
            return;
        }

        Intent intent = new Intent(context, LotusService.class);

        intent.putExtra(EXTRA_TEXT, text);
        intent.putExtra(EXTRA_PERCENT, percent);

        try {

            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }

        } catch (Exception ignored) {
            // Started from the background on Android 12+, or blocked by the system:
            // the answer still arrives, the app just may not survive in the background.
        }
    }

    static void stop(Context context) {

        context.stopService(new Intent(context, LotusService.class));
    }

    // ------------------------------------------------------
    // SERVICE
    // ------------------------------------------------------

    @Override
    public void onCreate() {

        super.onCreate();

        running = this;
    }

    @Override
    public IBinder onBind(Intent intent) {

        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {

        String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;
        int percent = intent != null ? intent.getIntExtra(EXTRA_PERCENT, -1) : -1;

        Notifier.ensureChannels(this);

        Notification notification = Notifier.service(this, text != null && text.length() > 0 ? text : "Lotus AI çalışıyor", percent);

        try {

            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(Notifier.ID_SERVICE, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(Notifier.ID_SERVICE, notification);
            }

        } catch (Exception e) {
            // The system refused (permission or background-start rule): do not stay half-started.
            stopSelf();

            return START_NOT_STICKY;
        }

        scheduleIdleStop();

        return START_NOT_STICKY;
    }

    private void refresh(String text, int percent) {

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager != null) {
            manager.notify(
                Notifier.ID_SERVICE,
                Notifier.service(this, text != null && text.length() > 0 ? text : "Lotus AI çalışıyor", percent));
        }

        scheduleIdleStop();
    }

    private void scheduleIdleStop() {

        handler.removeCallbacks(idleStop);
        handler.postDelayed(idleStop, IDLE_STOP_MS);
    }

    // Android 15 limits "dataSync" services to about 6 hours and then calls this;
    // Android 14 calls the one-argument form. Not marked @Override so the project
    // still compiles against an older android.jar.
    public void onTimeout(int startId) {

        stopSelf();
    }

    public void onTimeout(int startId, int foregroundServiceType) {

        stopSelf();
    }

    @Override
    public void onDestroy() {

        handler.removeCallbacks(idleStop);

        if (running == this) running = null;

        stopForeground(true);

        super.onDestroy();
    }
}
