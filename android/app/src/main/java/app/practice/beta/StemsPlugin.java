package app.practice.beta;

import android.content.Context;
import android.os.PowerManager;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

// «Дорожки» нативно (Demucs.java, ONNX Runtime на всех ядрах): WebView не даёт WebAssembly больше одного потока,
// а здесь считают все ядра — в разы быстрее. Протокол: begin() → push({ ch, b64 }) кусками float32 LE обоих
// каналов → run() (ход — событие progress { f }) → { files: { drums, bass, other, vocals } } — файлы float32 LE
// с чередованием L R в кэше, JS читает их по Capacitor.convertFileSrc и кладёт в медиатеку; clean() — убрать.
// Модель из assets (public/models/…) один раз копируется в files/models: ONNX Runtime читает файл по пути.
// На время счёта — частичный wake lock: экран можно гасить, приложение не закрывать.
@CapacitorPlugin(name = "Stems")
public class StemsPlugin extends Plugin {
    private static final String MODEL = "models/demucs/htdemucs_embedded.onnx";
    private FileOutputStream[] ins = new FileOutputStream[2];
    private volatile Demucs job = null;
    private volatile boolean busy = false;

    private File dir() { return new File(getContext().getCacheDir(), "stems"); }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("threads", Math.max(1, Runtime.getRuntime().availableProcessors()));
        call.resolve(r);
    }

    @PluginMethod
    public void begin(PluginCall call) {
        if (busy) { call.reject("busy"); return; }
        try {
            closeIns();
            File d = dir();
            wipe(d);
            if (!d.isDirectory() && !d.mkdirs()) throw new Exception("mkdir");
            for (int c = 0; c < 2; c++) ins[c] = new FileOutputStream(new File(d, "in" + c + ".f32"));
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void push(PluginCall call) {
        int ch = call.getInt("ch", 0);
        String b64 = call.getString("b64", "");
        try {
            if (ins[ch] == null) throw new Exception("not begun");
            ins[ch].write(Base64.decode(b64, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void run(PluginCall call) {
        if (busy) { call.reject("busy"); return; }
        busy = true;
        final File d = dir();
        try { closeIns(); } catch (Exception e) { busy = false; call.reject(e.getMessage()); return; }
        final long total = new File(d, "in0.f32").length() / 4;
        if (total <= 0) { busy = false; call.reject("empty"); return; }
        final Context ctx = getContext();
        Thread th = new Thread(() -> {
            PowerManager.WakeLock lock = null;
            Demucs dm = null;
            try {
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                if (pm != null) { lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "melete:stems"); lock.acquire(3 * 60 * 60 * 1000L); }
                File model = modelFile(ctx);
                int threads = Math.max(1, Math.min(8, Runtime.getRuntime().availableProcessors()));
                dm = new Demucs(model.getAbsolutePath(), threads);
                job = dm;
                File out = new File(d, "out");
                dm.separate(new File(d, "in0.f32"), new File(d, "in1.f32"), total, out, (f) -> { JSObject p = new JSObject(); p.put("f", f); notifyListeners("progress", p); });
                JSObject files = new JSObject();
                for (String part : Demucs.PARTS) files.put(part, new File(out, part + ".f32").getAbsolutePath());
                JSObject r = new JSObject();
                r.put("files", files);
                r.put("total", total);
                r.put("threads", threads);
                call.resolve(r);
            } catch (Throwable e) {
                String m = e.getMessage();
                call.reject(m == null ? e.getClass().getSimpleName() : m);
            } finally {
                job = null; busy = false;
                if (dm != null) dm.close();
                if (lock != null && lock.isHeld()) lock.release();
            }
        }, "stems");
        th.setPriority(Thread.NORM_PRIORITY);
        th.start();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Demucs j = job;
        if (j != null) j.cancel();
        call.resolve();
    }

    @PluginMethod
    public void clean(PluginCall call) {
        if (!busy) { try { closeIns(); } catch (Exception e) { /* ignore */ } wipe(dir()); }
        call.resolve();
    }

    private void closeIns() throws Exception {
        for (int c = 0; c < 2; c++) if (ins[c] != null) { ins[c].close(); ins[c] = null; }
    }

    private static void wipe(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) wipe(k);
        f.delete();
    }

    // Модель — файл в files/models (из assets один раз; размер сверяется, чтобы обновление приложения подменило файл)
    private static File modelFile(Context ctx) throws Exception {
        File dst = new File(ctx.getFilesDir(), MODEL);
        long size;
        try (InputStream in = ctx.getAssets().open("public/" + MODEL)) { size = in.available(); }
        if (dst.isFile() && dst.length() > 0 && (size <= 0 || dst.length() == size)) return dst;
        File parent = dst.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new Exception("mkdir");
        File tmp = new File(dst.getPath() + ".part");
        try (InputStream in = ctx.getAssets().open("public/" + MODEL); OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        if (!tmp.renameTo(dst)) throw new Exception("rename");
        return dst;
    }
}
