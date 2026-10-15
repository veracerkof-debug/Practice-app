package app.practice.beta;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

// Работа в фоне: пока в приложении что-то идёт (сессия, метроном, пэды, медиа, помодоро, секундомер), Android не
// замораживает его — служба на переднем плане с тихим уведомлением. Касание уведомления открывает приложение.
// Останавливается сама приложением, когда всё выключено. Ничего не отправляет и не записывает.
public class KeepAliveService extends Service {
    static final String CHANNEL = "melete_background";
    static final int NOTE_ID = 7101;
    private PowerManager.WakeLock lock;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // Кнопки управления звуком в уведомлении (PlayerPlugin, src/core/player.js)
    static final String A_TOGGLE = "melete.player.TOGGLE", A_DOWN = "melete.player.DOWN", A_UP = "melete.player.UP";
    static volatile String lastTitle = "Melete", lastText = "";
    static volatile boolean running = false;

    private static PendingIntent action(Context c, String a, int code) {
        Intent i = new Intent(c, KeepAliveService.class).setAction(a);
        return PendingIntent.getService(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static Notification build(Context c, String title, String text) {
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pi);
        // пока что-то звучит — «Пауза / Продолжить», «Тише», «Громче»
        if (PlayerPlugin.notifyCtl && PlayerPlugin.sounding()) {
            boolean playing = PlayerPlugin.playing();
            b.addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? PlayerPlugin.label("pause", "Pause") : PlayerPlugin.label("play", "Play"), action(c, A_TOGGLE, 1));
            b.addAction(0, PlayerPlugin.label("down", "−"), action(c, A_DOWN, 2));
            b.addAction(0, PlayerPlugin.label("up", "+"), action(c, A_UP, 3));
        }
        return b.build();
    }

    // Состояние сменилось (пауза, источники) — уведомление перерисовывается, если служба идёт
    static void refresh(Context c) {
        if (!running) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) { try { nm.notify(NOTE_ID, build(c, lastTitle, lastText)); } catch (Exception ignored) { } }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent != null ? intent.getAction() : null;
        if (A_TOGGLE.equals(a)) { PlayerPlugin.emit("toggle", null, 0); return START_NOT_STICKY; }
        if (A_DOWN.equals(a)) { PlayerPlugin.emit("down", null, 0); return START_NOT_STICKY; }
        if (A_UP.equals(a)) { PlayerPlugin.emit("up", null, 0); return START_NOT_STICKY; }
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "Melete";
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "";
        String channelName = intent != null && intent.getStringExtra("channel") != null ? intent.getStringExtra("channel") : "Melete";
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, channelName, NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
        lastTitle = title; lastText = text; running = true;
        Notification note = build(this, title, text);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTE_ID, note);
        // процессор не засыпает при погасшем экране, пока идёт занятие (не дольше 6 часов на всякий случай)
        if (lock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "melete:background");
                lock.setReferenceCounted(false);
                lock.acquire(6 * 60 * 60 * 1000L);
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        super.onDestroy();
    }
}
