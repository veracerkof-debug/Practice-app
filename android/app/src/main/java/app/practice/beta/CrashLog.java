package app.practice.beta;

import android.content.Context;
import android.os.Build;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

// Последнее падение приложения (только техническое: время, поток, стек вызовов — без личного) пишется в файл
// на устройстве; «Отчёт о проблеме» прикладывает его (ReportPlugin.lastCrash), если человек сам отправит отчёт.
// Ставится из MainActivity и служб — они живут в одном процессе, падение любой из них попадёт в файл.
final class CrashLog {
    private static boolean installed = false;
    private CrashLog() { }

    static File file(Context c) { return new File(c.getFilesDir(), "last-crash.txt"); }

    static synchronized void install(Context ctx) {
        if (installed) return;
        installed = true;
        final Context c = ctx.getApplicationContext();
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                String head = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()) +
                    " · Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ") · " + Build.MANUFACTURER + " " + Build.MODEL +
                    " · поток " + t.getName() + "\n";
                try (FileOutputStream out = new FileOutputStream(file(c))) {
                    out.write((head + sw).getBytes(StandardCharsets.UTF_8));
                }
            } catch (Throwable ignored) { }
            if (prev != null) prev.uncaughtException(t, e);
        });
    }

    // Текст последнего падения или "" — и файл стирается, если clear
    static String read(Context c, boolean clear) {
        File f = file(c);
        if (!f.exists()) return "";
        try {
            String s = Build.VERSION.SDK_INT >= 26 ? new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8) : "";
            if (clear) f.delete();
            return s.length() > 20000 ? s.substring(0, 20000) : s;
        } catch (Exception e) { return ""; }
    }
}
