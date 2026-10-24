package app.practice.beta;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

// Обновление из GitHub (src/core/update.js): APK скачивает системный загрузчик (ход — в уведомлении, только по Wi-Fi,
// переживает сворачивание), ставит системный установщик — одно касание «Установить» (молча ставить себя вне Play
// Android не даёт). Тот же пакет и тот же ключ подписи — данные приложения остаются
@CapacitorPlugin(name = "Update")
public class UpdatePlugin extends Plugin {
    private static final String NAME = "melete-update.apk";

    private File apk() { return new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), NAME); }
    private DownloadManager dm() { return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE); }

    // { url, wifi } → { id }
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://github.com/veracerkof-debug/")) { call.reject("url"); return; }
        try {
            File f = apk();
            if (f.exists()) f.delete();
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setTitle("Melete");
            r.setMimeType("application/vnd.android.package-archive");
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            r.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, NAME);
            if (call.getBoolean("wifi", true)) r.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI);
            long id = dm().enqueue(r);
            JSObject o = new JSObject();
            o.put("id", id);
            call.resolve(o);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    // { id } → { status: run | wait | done | fail, got, total, reason }
    @PluginMethod
    public void status(PluginCall call) {
        Object v = call.getData().opt("id"); // номер приходит из JS как Integer или Long — getLong принял бы только Long
        long id = v instanceof Number ? ((Number) v).longValue() : -1L;
        JSObject o = new JSObject();
        try (Cursor c = dm().query(new DownloadManager.Query().setFilterById(id))) {
            if (c == null || !c.moveToFirst()) { o.put("status", "fail"); o.put("reason", "gone"); call.resolve(o); return; }
            int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
            o.put("got", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
            o.put("total", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
            o.put("reason", reason);
            if (st == DownloadManager.STATUS_SUCCESSFUL) o.put("status", apk().exists() ? "done" : "fail");
            else if (st == DownloadManager.STATUS_FAILED) o.put("status", "fail");
            else if (st == DownloadManager.STATUS_PAUSED) o.put("status", "wait"); // ждёт Wi-Fi или сеть
            else o.put("status", "run");
            call.resolve(o);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    // { id } — отменить скачивание (потом — заново, по другой сети)
    @PluginMethod
    public void cancel(PluginCall call) {
        Object v = call.getData().opt("id");
        if (v instanceof Number) { try { dm().remove(((Number) v).longValue()); } catch (Exception e) { /* уже нет */ } }
        call.resolve();
    }

    // Можно ли этому приложению ставить пакеты (Android 8+: разрешение «Установка неизвестных приложений»)
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject o = new JSObject();
        o.put("ok", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(o);
    }

    // Открыть настройку разрешения для Melete — один раз
    @PluginMethod
    public void allowInstall(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    // Системный установщик со скачанным APK
    @PluginMethod
    public void install(PluginCall call) {
        File f = apk();
        if (!f.exists()) { call.reject("no file"); return; }
        try {
            Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(u, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
}
