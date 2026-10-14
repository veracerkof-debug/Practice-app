package app.practice.beta;

import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

// Обмен с командой (src/core/share.js): файл .melete уходит через системное «Поделиться» — человек сам выбирает
// приложение и получателя; файл, открытый в Melete (из Telegram, почты, файлового менеджера), передаётся в приложение
// событием "file". Приложение само ничего не отправляет и не скачивает.
@CapacitorPlugin(name = "Share")
public class SharePlugin extends Plugin {

    private static final int MAX = 120 * 1024 * 1024;

    @Override
    public void load() {
        Intent i = getActivity().getIntent();
        if (i != null) take(i);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        take(intent);
    }

    // Файл из намерения (открыть / поделиться) → событие "file" { name, data (base64) }; хранится, пока его не примут
    private void take(Intent intent) {
        String a = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(a)) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(a)) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;
        // одно и то же намерение не обрабатывается дважды (поворот экрана, возврат в приложение)
        intent.setAction(null);
        final Uri u = uri;
        new Thread(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(u)) {
                if (in == null) return;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n, total = 0;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > MAX) return;
                    out.write(buf, 0, n);
                }
                JSObject ret = new JSObject();
                ret.put("name", nameOf(u));
                ret.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                notifyListeners("file", ret, true);
            } catch (Exception e) {
                // не прочитался — ничего не делаем
            }
        }).start();
    }

    private String nameOf(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception e) {
            // без имени
        }
        String p = uri.getLastPathSegment();
        return p == null ? "file" : p;
    }

    // Отправить файл: { name, data (base64), title } → системный выбор приложения
    @PluginMethod
    public void send(PluginCall call) {
        String name = call.getString("name", "songs.melete").replaceAll("[\\\\/:*?\"<>|]", "_");
        String data = call.getString("data", "");
        String title = call.getString("title", "Melete");
        String text = call.getString("text", "");
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists()) dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/octet-stream");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            if (!text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
