package app.practice.beta;

import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Защита игры от системных жестов: у многих оболочек (Xiaomi, Honor, Huawei, Samsung) касание тремя пальцами
// или проведение ими — снимок экрана, и на пианино или пэдах аккорд превращается в скриншот. Отключить сам жест
// приложение не может — но пока открыт инструмент, окно помечается «защищённым» (FLAG_SECURE): снимок
// не сохраняется и не мешает игре. Инструмент закрыт — снимать экран снова можно.
@CapacitorPlugin(name = "Guard")
public class GuardPlugin extends Plugin {
    @PluginMethod
    public void secure(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    // Полный экран инструмента: системные панели (статус и навигация) скрыты, появляются от края жестом и прячутся снова
    @PluginMethod
    public void immersive(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView());
            if (on) {
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
            } else c.show(WindowInsetsCompat.Type.systemBars());
            call.resolve();
        });
    }
}
