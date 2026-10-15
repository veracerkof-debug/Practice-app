package app.practice.beta;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

// Управление звуком вне приложения (src/core/player.js): кнопки в уведомлении работы в фоне (KeepAliveService),
// плавающая кнопка поверх других приложений (FloatService) и всплывающее окно — «картинка в картинке» (MainActivity).
// Страница сообщает состояние (update), нажатия уходят странице событием «control» ({ action, bus, value }).
@CapacitorPlugin(name = "Player")
public class PlayerPlugin extends Plugin {
    static PlayerPlugin inst;
    static volatile JSONObject state = new JSONObject();
    static volatile boolean notifyCtl = true, floatOn = true, pipAllowed = false;
    static volatile double aspect = 0.6;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void load() { inst = this; }

    static boolean playing() { return state.optBoolean("playing", true); }
    static boolean sounding() { return state.optBoolean("sounding", false); }
    static String label(String k, String def) {
        JSONObject l = state.optJSONObject("labels");
        String v = l == null ? null : l.optString(k, null);
        return v == null || v.isEmpty() ? def : v;
    }

    // Нажатие в уведомлении или плавающей панели → странице
    static void emit(String action, String bus, double value) {
        PlayerPlugin p = inst;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("action", action);
        if (bus != null) o.put("bus", bus);
        o.put("value", value);
        p.notifyListeners("control", o);
    }

    static void pipChanged(boolean on) {
        PlayerPlugin p = inst;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("on", on);
        p.notifyListeners("pip", o);
    }

    @PluginMethod
    public void update(PluginCall call) {
        try { state = new JSONObject(call.getString("state", "{}")); } catch (Exception e) { state = new JSONObject(); }
        notifyCtl = call.getBoolean("notify", true);
        floatOn = call.getBoolean("float", true);
        pipAllowed = call.getBoolean("pip", false);
        Double a = call.getDouble("aspect");
        if (a != null) aspect = a;
        Context c = getContext();
        KeepAliveService.refresh(c);
        FloatService.refresh();
        if (!floatOn || !sounding()) c.stopService(new Intent(c, FloatService.class));
        call.resolve();
    }

    @PluginMethod
    public void canOverlay(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void askOverlay(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) { }
        call.resolve();
    }

    // Приложение ушло с экрана: если звучит и не стало всплывающим окном — плавающая кнопка
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        main.postDelayed(() -> {
            Activity a = getActivity();
            boolean pip = a != null && Build.VERSION.SDK_INT >= 24 && a.isInPictureInPictureMode();
            boolean ok = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext());
            if (!pip && floatOn && sounding() && ok && !MainActivity.visible) {
                try { getContext().startService(new Intent(getContext(), FloatService.class)); } catch (Exception ignored) { }
            }
        }, 400);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        getContext().stopService(new Intent(getContext(), FloatService.class));
    }
}
