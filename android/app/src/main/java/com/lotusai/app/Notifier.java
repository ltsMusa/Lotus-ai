package com.lotusai.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Notification channels and builders shared by MainActivity (replies, alerts)
 * and LotusService (the ongoing "çalışıyor" notification).
 *
 * Written against API 29 (what AIDE ships); anything newer is behind a
 * Build.VERSION.SDK_INT check or looked up by name.
 */
final class Notifier {

    static final String CHANNEL_SERVICE = "lotus_service";
    static final String CHANNEL_REPLY = "lotus_reply";
    static final String CHANNEL_DOWNLOAD = "lotus_download";
    static final String CHANNEL_ALERT = "lotus_alert";

    static final int ID_SERVICE = 1001;

    // Lotus accent color (matches the default theme).
    private static final int ACCENT = 0xFFB14CFF;

    private Notifier() {
    }

    /** JS kind ("reply" | "download" | "alert") → channel id. */
    static String channelFor(String kind) {

        if ("reply".equals(kind)) return CHANNEL_REPLY;
        if ("download".equals(kind)) return CHANNEL_DOWNLOAD;

        return CHANNEL_ALERT;
    }

    static void ensureChannels(Context context) {

        if (Build.VERSION.SDK_INT < 26) return;

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager == null) return;

        manager.createNotificationChannel(channel(
            CHANNEL_SERVICE, "Arka planda çalışıyor",
            "Lotus AI yanıt hazırlarken ya da model indirirken görünen sürekli bildirim.",
            NotificationManager.IMPORTANCE_LOW));

        manager.createNotificationChannel(channel(
            CHANNEL_REPLY, "Yanıt hazır",
            "Uygulamadan çıktığında yanıtın ya da görselin hazır olduğunu söyler.",
            NotificationManager.IMPORTANCE_DEFAULT));

        manager.createNotificationChannel(channel(
            CHANNEL_DOWNLOAD, "Model indirme",
            "Lotus Mini modelinin indirme durumu.",
            NotificationManager.IMPORTANCE_LOW));

        manager.createNotificationChannel(channel(
            CHANNEL_ALERT, "Uyarılar",
            "Limit doldu, sağlayıcı değişti, cihaz ısındı ya da bir hata oldu.",
            NotificationManager.IMPORTANCE_DEFAULT));
    }

    private static NotificationChannel channel(String id, String name, String description, int importance) {

        NotificationChannel channel = new NotificationChannel(id, name, importance);

        channel.setDescription(description);

        return channel;
    }

    private static int smallIcon(Context context) {

        // Looked up by name so a stale generated R class can never break the build.
        int id = context.getResources().getIdentifier("ic_stat_lotus", "drawable", context.getPackageName());

        return id != 0 ? id : android.R.drawable.stat_notify_chat;
    }

    /** Tapping a notification brings the running app back (it never starts a second copy). */
    private static PendingIntent openApp(Context context) {

        Intent intent = new Intent(context, MainActivity.class);

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;

        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;

        return PendingIntent.getActivity(context, 0, intent, flags);
    }

    private static Notification.Builder builder(Context context, String channelId) {

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(context, channelId)
            : new Notification.Builder(context);

        builder.setSmallIcon(smallIcon(context));
        builder.setColor(ACCENT);
        builder.setContentIntent(openApp(context));

        return builder;
    }

    /**
     * The ongoing notification of the foreground service.
     * @param percent 0–100 shows a progress bar, a negative number shows none.
     */
    static Notification service(Context context, String text, int percent) {

        Notification.Builder builder = builder(context, CHANNEL_SERVICE);

        builder.setContentTitle("Lotus AI");
        builder.setContentText(text);
        builder.setOngoing(true);
        builder.setOnlyAlertOnce(true);
        builder.setCategory(Notification.CATEGORY_SERVICE);

        if (Build.VERSION.SDK_INT < 26) builder.setPriority(Notification.PRIORITY_LOW);

        if (percent >= 0) builder.setProgress(100, Math.min(100, percent), false);

        return builder.build();
    }

    /** A one-off notification (reply ready, download finished, alert). */
    static void post(Context context, String kind, int id, String title, String body) {

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager == null) return;

        ensureChannels(context);

        Notification.Builder builder = builder(context, channelFor(kind));

        builder.setContentTitle(title);
        builder.setContentText(body);
        builder.setStyle(new Notification.BigTextStyle().bigText(body));
        builder.setAutoCancel(true);
        // Answers can be private: the lock screen shows only the title unless the user allows more.
        builder.setVisibility(Notification.VISIBILITY_PRIVATE);

        if (Build.VERSION.SDK_INT < 26) {
            builder.setPriority(Notification.PRIORITY_DEFAULT);
            builder.setDefaults(Notification.DEFAULT_SOUND);
        }

        manager.notify(id, builder.build());
    }
}
