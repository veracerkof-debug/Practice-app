package app.practice.beta;

import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.HttpURLConnection;
import java.net.URL;

// Проверка часов для подтверждённых часов практики.
// elapsed — время с включения устройства (идёт и во сне, не зависит от настроек даты): если дата на устройстве
// ушла вперёд сильнее, чем этот счётчик, — часы перевели вручную.
// net — дата из интернета: заголовок Date ответа сервера (запрос HEAD, без данных пользователя). Только по нажатию,
// когда часы выглядят сбитыми.
@CapacitorPlugin(name = "Clock")
public class ClockPlugin extends Plugin {
    private static final String[] HOSTS = { "https://musicbrainz.org/", "https://www.wikipedia.org/", "https://www.cloudflare.com/" };

    @PluginMethod
    public void elapsed(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ms", SystemClock.elapsedRealtime());
        r.put("wall", System.currentTimeMillis());
        call.resolve(r);
    }

    @PluginMethod
    public void net(PluginCall call) {
        getBridge().execute(() -> {
            for (String h : HOSTS) {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(h).openConnection();
                    c.setRequestMethod("HEAD");
                    c.setConnectTimeout(6000);
                    c.setReadTimeout(6000);
                    c.setUseCaches(false);
                    c.connect();
                    long d = c.getHeaderFieldDate("Date", 0);
                    if (d > 0) {
                        JSObject r = new JSObject();
                        r.put("ms", d);
                        r.put("wall", System.currentTimeMillis());
                        call.resolve(r);
                        return;
                    }
                } catch (Exception e) {
                    // следующий сервер
                } finally {
                    if (c != null) c.disconnect();
                }
            }
            call.reject("offline");
        });
    }
}
