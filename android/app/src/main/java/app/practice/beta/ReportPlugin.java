package app.practice.beta;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

// Отчёт о проблеме (src/core/report.js): текст сохраняется файлом во временную папку приложения и открывается
// системный выбор «Поделиться» — человек сам выбирает Telegram, почту или другое приложение и получателя.
// Приложение само ничего не отправляет.
@CapacitorPlugin(name = "Report")
public class ReportPlugin extends Plugin {

    // Последнее падение приложения (CrashLog): { text } — пусто, если не падало; clear — стереть после чтения
    @PluginMethod
    public void lastCrash(PluginCall call) {
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        r.put("text", CrashLog.read(getContext(), call.getBoolean("clear", false)));
        call.resolve(r);
    }

    @PluginMethod
    public void file(PluginCall call) {
        String name = call.getString("name", "melete-report.txt").replaceAll("[^A-Za-z0-9._-]", "_");
        String text = call.getString("text", "");
        String title = call.getString("title", "Melete");
        String body = call.getString("body", "");
        String email = call.getString("email", null);
        try {
            File dir = new File(getContext().getCacheDir(), "reports");
            if (!dir.exists()) dir.mkdirs();
            // старые отчёты не копятся
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TEXT, body);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            if (email != null) send.putExtra(Intent.EXTRA_EMAIL, new String[] { email });
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
