package com.gordeyville.shop;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;

import java.io.File;

/** Foreground service so recording keeps going with the screen off or the phone in a pocket. */
public class RecorderService extends Service {
    private static final String CHANNEL = "gvc_rec";
    private static MediaRecorder rec;
    private static String path;
    static long startedAt = 0;
    static long lastDurationMs = 0;

    static boolean isRecording() { return rec != null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Recording", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class);
        open.putExtra("gvc_tab", "todo");
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 7, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification n = b.setContentTitle("GVC Shop is recording")
            .setContentText("Open the app and tap Stop when you're done.")
            .setSmallIcon(android.R.drawable.presence_audio_online)
            .setOngoing(true)
            .setContentIntent(pi)
            .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(42, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(42, n);

        if (rec == null) {
            try {
                File f = new File(getCacheDir(), "rec-" + System.currentTimeMillis() + ".m4a");
                path = f.getAbsolutePath();
                MediaRecorder r = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
                r.setAudioSource(MediaRecorder.AudioSource.MIC);
                r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                r.setAudioChannels(1);
                r.setAudioSamplingRate(16000);
                r.setAudioEncodingBitRate(32000);   // ~14 MB per hour, under Whisper's 25 MB limit up to ~1.7 h
                r.setMaxDuration(100 * 60 * 1000);  // stop at 100 minutes
                r.setOutputFile(path);
                r.prepare();
                r.start();
                rec = r;
                startedAt = System.currentTimeMillis();
            } catch (Exception e) {
                rec = null;
                stopSelf();
            }
        }
        return START_NOT_STICKY;
    }

    /** Stops recording and the service; returns the file path or null. */
    static synchronized String stopRecording(Context ctx) {
        if (rec == null) return null;
        try { rec.stop(); } catch (Exception ignored) {}
        try { rec.release(); } catch (Exception ignored) {}
        rec = null;
        lastDurationMs = System.currentTimeMillis() - startedAt;
        startedAt = 0;
        ctx.stopService(new Intent(ctx, RecorderService.class));
        return path;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
