package app.practice.beta;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Работа в фоне (KeepAliveService) и разрешения для неё: уведомления (Android 13+) и снятие ограничения батареи
@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {
    private Intent svc() { return new Intent(getContext(), KeepAliveService.class); }

    @PluginMethod
    public void start(PluginCall call) {
        Intent i = svc();
        i.putExtra("title", call.getString("title", "Melete"));
        i.putExtra("text", call.getString("text", ""));
        i.putExtra("channel", call.getString("channel", "Melete"));
        i.putExtra("icon", call.getString("icon", ""));
        try { ContextCompat.startForegroundService(getContext(), i); call.resolve(); }
        catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(svc());
        call.resolve();
    }

    // { battery: снято ли ограничение батареи, notify: разрешены ли уведомления }
    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        JSObject r = new JSObject();
        r.put("battery", pm != null && Build.VERSION.SDK_INT >= 23 ? pm.isIgnoringBatteryOptimizations(c.getPackageName()) : true);
        r.put("notify", NotificationManagerCompat.from(c).areNotificationsEnabled());
        call.resolve(r);
    }

    // Системный запрос «Разрешить работу в фоне без ограничений»; не вышло — экран настроек батареи
    @PluginMethod
    public void askBattery(PluginCall call) {
        Context c = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
            } catch (Exception ignored) { }
        }
        call.resolve();
    }

    // Уведомления: на Android 13+ — системный запрос; если уже отказано — настройки приложения
    @PluginMethod
    public void askNotify(PluginCall call) {
        Context c = getContext();
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7102);
        } else if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) {
            openAppSettings();
        }
        call.resolve();
    }

    // «Автозапуск» / «Запуск приложений» у оболочек, которые без него снимают будильники закрытого приложения
    // (напоминания не приходят): Honor, Huawei, Xiaomi, Oppo/Realme, Vivo, Samsung. Не нашлось — настройки приложения
    private static final String[][] AUTOSTART = {
        { "com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        { "com.hihonor.systemmanager", "com.hihonor.systemmanager.optimize.process.ProtectActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity" },
        { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
        { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
        { "com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity" },
        { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
        { "com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity" },
    };

    @PluginMethod
    public void autostart(PluginCall call) {
        Context c = getContext();
        for (String[] a : AUTOSTART) {
            try {
                Intent i = new Intent().setComponent(new android.content.ComponentName(a[0], a[1]));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
                JSObject r = new JSObject();
                r.put("opened", a[0]);
                call.resolve(r);
                return;
            } catch (Exception ignored) { }
        }
        openAppSettings();
        call.resolve(new JSObject());
    }

    // Настройки приложения в системе (там — батарея, «Автозапуск», «Работа в фоне» у оболочек вроде Honor и Xiaomi)
    @PluginMethod
    public void openSettings(PluginCall call) { openAppSettings(); call.resolve(); }

    private void openAppSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) { }
    }
}
