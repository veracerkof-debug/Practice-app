package app.practice.beta;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Сигналы метронома без звука: короткая вибрация и вспышка фонарика в такт.
// Фонарик включается через CameraManager.setTorchMode — разрешение на камеру не нужно, камера не открывается.
@CapacitorPlugin(name = "Pulse")
public class PulsePlugin extends Plugin {
    private String torchId = null;
    private boolean torchChecked = false;

    private Vibrator vibrator() {
        Context c = getContext();
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = (VibratorManager) c.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
    }

    private String torch() {
        if (torchChecked) return torchId;
        torchChecked = true;
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            for (String id : cm.getCameraIdList()) {
                Boolean has = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (has != null && has) { torchId = id; break; }
            }
        } catch (Exception e) { torchId = null; }
        return torchId;
    }

    // Что есть на устройстве: { vibrate, amplitude, torch }
    @PluginMethod
    public void info(PluginCall call) {
        Vibrator v = vibrator();
        JSObject r = new JSObject();
        r.put("vibrate", v != null && v.hasVibrator());
        r.put("amplitude", v != null && Build.VERSION.SDK_INT >= 26 && v.hasAmplitudeControl());
        r.put("torch", torch() != null);
        call.resolve(r);
    }

    // { ms, amp 1…255 }
    @PluginMethod
    public void vibrate(PluginCall call) {
        Vibrator v = vibrator();
        if (v == null || !v.hasVibrator()) { call.resolve(); return; }
        long ms = Math.max(5, Math.min(300, call.getInt("ms", 40)));
        int amp = Math.max(1, Math.min(255, call.getInt("amp", 255)));
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, v.hasAmplitudeControl() ? amp : VibrationEffect.DEFAULT_AMPLITUDE));
        else v.vibrate(ms);
        call.resolve();
    }

    // { on }
    @PluginMethod
    public void torch(PluginCall call) {
        String id = torch();
        if (id == null) { call.resolve(); return; }
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            cm.setTorchMode(id, call.getBoolean("on", false));
        } catch (Exception e) { /* камера занята другим приложением — пропускаем вспышку */ }
        call.resolve();
    }
}
