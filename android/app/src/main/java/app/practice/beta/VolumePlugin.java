package app.practice.beta;

import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Громкость устройства для музыки и медиа: приложение предупреждает, если звука почти нет.
// Только чтение — громкость не меняется.
@CapacitorPlugin(name = "Volume")
public class VolumePlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        JSObject r = new JSObject();
        if (am == null) {
            call.reject("unavailable");
            return;
        }
        int cur = am.getStreamVolume(AudioManager.STREAM_MUSIC);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        r.put("level", max > 0 ? (double) cur / max : 0.0);
        r.put("muted", cur == 0);
        call.resolve(r);
    }
}
