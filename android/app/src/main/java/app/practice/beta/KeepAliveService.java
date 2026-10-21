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
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.widget.RemoteViews;
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
    static volatile String lastTitle = "Melete", lastText = "", lastIcon = "";
    static final int ACCENT = 0xFF9C7242; // цвет акцента приложения (src/styles/tokens.css)
    static volatile boolean running = false;
    // Моргание: лицо в уведомлении живое — раз в несколько секунд на миг закрытые глаза (кадр mn_<f|m>_<лицо>_blink);
    // два обновления уведомления без звука и без всплытия (setOnlyAlertOnce) — экран и батарею не трогает
    static final long BLINK_EVERY = 6500, BLINK_MS = 180;
    static volatile boolean blink = false;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable blinker = new Runnable() {
        @Override public void run() {
            if (!running) return;
            blink = !blink;
            if (blink && faceId(KeepAliveService.this, lastIcon + "_blink") == 0) { blink = false; ui.postDelayed(this, BLINK_EVERY); return; }
            refresh(KeepAliveService.this);
            ui.postDelayed(this, blink ? BLINK_MS : BLINK_EVERY);
        }
    };

    private static PendingIntent action(Context c, String a, int code) {
        Intent i = new Intent(c, KeepAliveService.class).setAction(a);
        return PendingIntent.getService(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // Лицо маскота (res/drawable-nodpi/ns_<f|m>_<лицо>.png, build/notifyicons.mjs) или 0 — без маскота
    static int faceId(Context c, String icon) {
        if (icon == null || icon.isEmpty()) return 0;
        return c.getResources().getIdentifier(icon, "drawable", c.getPackageName());
    }

    static Notification build(Context c, String title, String text, String icon) {
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        int face = faceId(c, blink ? icon + "_blink" : icon);
        if (face == 0) face = faceId(c, icon);
        // Лицо маскота — одно: маленьким значком (строка состояния и слева в шторке, Android красит его цветом
        // акцента); оно моргает (blinker). Без маскота — нота ic_stat_melete. Большой картинки нет
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(face != 0 ? face : R.drawable.ic_stat_melete)
            .setColor(ACCENT)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pi);
        // пока что-то звучит — значки «Тише», «Пауза / Продолжить», «Громче» (своя разметка: обычные кнопки
        // уведомления на Android 7+ показывают только слова)
        if (PlayerPlugin.notifyCtl && PlayerPlugin.sounding()) {
            boolean playing = PlayerPlugin.playing();
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.note_ctl);
            v.setTextViewText(R.id.nc_title, title);
            v.setTextViewText(R.id.nc_text, text);
            v.setViewVisibility(R.id.nc_text, text.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
            if (face != 0) v.setImageViewResource(R.id.nc_face, face);
            v.setViewVisibility(R.id.nc_face, face != 0 ? android.view.View.VISIBLE : android.view.View.GONE);
            v.setImageViewResource(R.id.nc_toggle, playing ? R.drawable.ic_ctl_pause : R.drawable.ic_ctl_play);
            v.setOnClickPendingIntent(R.id.nc_toggle, action(c, A_TOGGLE, 1));
            v.setOnClickPendingIntent(R.id.nc_down, action(c, A_DOWN, 2));
            v.setOnClickPendingIntent(R.id.nc_up, action(c, A_UP, 3));
            v.setContentDescription(R.id.nc_toggle, playing ? PlayerPlugin.label("pause", "Pause") : PlayerPlugin.label("play", "Play"));
            v.setContentDescription(R.id.nc_down, PlayerPlugin.label("down", "Quieter"));
            v.setContentDescription(R.id.nc_up, PlayerPlugin.label("up", "Louder"));
            b.setStyle(new NotificationCompat.DecoratedCustomViewStyle()).setCustomContentView(v).setCustomBigContentView(v);
        }
        return b.build();
    }

    // Состояние сменилось (пауза, источники) — уведомление перерисовывается, если служба идёт
    static void refresh(Context c) {
        if (!running) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) { try { nm.notify(NOTE_ID, build(c, lastTitle, lastText, lastIcon)); } catch (Exception ignored) { } }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        CrashLog.install(this);
        String a = intent != null ? intent.getAction() : null;
        if (A_TOGGLE.equals(a)) { PlayerPlugin.emit("toggle", null, 0); return START_NOT_STICKY; }
        if (A_DOWN.equals(a)) { PlayerPlugin.emit("down", null, 0); return START_NOT_STICKY; }
        if (A_UP.equals(a)) { PlayerPlugin.emit("up", null, 0); return START_NOT_STICKY; }
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "Melete";
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "";
        String channelName = intent != null && intent.getStringExtra("channel") != null ? intent.getStringExtra("channel") : "Melete";
        String icon = intent != null && intent.getStringExtra("icon") != null ? intent.getStringExtra("icon") : "";
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, channelName, NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
        lastTitle = title; lastText = text; lastIcon = icon; running = true; blink = false;
        Notification note = build(this, title, text, icon);
        ui.removeCallbacks(blinker);
        if (!icon.isEmpty()) ui.postDelayed(blinker, BLINK_EVERY);
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
        ui.removeCallbacks(blinker);
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        super.onDestroy();
    }
}
