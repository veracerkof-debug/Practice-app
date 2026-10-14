package app.practice.beta;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Иконка приложения на выбор (src/ui/appicons.js): у каждой — своя activity-ярлык в AndroidManifest.xml
// (IconActivities.java), включена ровно одна. Лаунчер обновляет значок сам, обычно через несколько секунд.
@CapacitorPlugin(name = "Icon")
public class IconPlugin extends Plugin {
    private static final String[] IDS = {"melete", "meletiy", "note", "clef", "fork", "keys", "classic"};

    private static String alias(String id) {
        return ".Icon" + Character.toUpperCase(id.charAt(0)) + id.substring(1);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String want = call.getString("id", "meletiy");
        boolean known = false;
        for (String id : IDS) if (id.equals(want)) known = true;
        if (!known) { call.reject("unknown icon"); return; }
        PackageManager pm = getContext().getPackageManager();
        // пакет установки (у dev-сборки — свой) и пакет классов (namespace) могут различаться
        String pkg = getContext().getPackageName(), cls = IconPlugin.class.getPackage().getName();
        try {
            // сначала включается нужный, потом выключаются остальные — чтобы ни на миг не остаться без значка
            pm.setComponentEnabledSetting(new ComponentName(pkg, cls + alias(want)), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (String id : IDS) {
                if (id.equals(want)) continue;
                pm.setComponentEnabledSetting(new ComponentName(pkg, cls + alias(id)), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
            JSObject r = new JSObject();
            r.put("id", want);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
