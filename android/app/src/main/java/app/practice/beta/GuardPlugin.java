package app.practice.beta;

import android.view.WindowManager;
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
}
