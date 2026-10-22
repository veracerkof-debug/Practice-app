package app.practice.beta;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collections;

// Вокал и инструментал на телефоне — UVR MDX-Net (Main 406, MIT), нативный ONNX Runtime на всех ядрах. Тот же
// алгоритм, что src/audio/mdx.js (сверен с эталоном audio-separator: 87 дБ): STFT 7680 / 1024, Ханн периодический,
// центрирование с отражением, вход [1,4,3072,256] (L re, L im, R re, R im), бины 0–2 — нули; куски по 1024·255 с
// перекрытием 1/4 и симметричным окном Ханна, края куска по 3840 — в отброс. Громкий вход — к пику 0,9 и обратно.
// Вокал = выход × 1,075 (компенсация модели), инструментал = запись − вокал: в сумме — ровно исходная запись.
// hq — «улучшенное»: модель на спектре и на минус-спектре, среднее (как denoise у UVR), время ×2.
// Потоково: готовая часть пишется в файл сразу, песня любой длины не держится в памяти.
public final class Mdx implements Engine {
    static final int NFFT = 7680, HOP = 1024, DIMF = 3072, DIMT = 256, CHUNK = HOP * (DIMT - 1), TRIM = NFFT / 2;
    static final float COMP = 1.075f, PEAK = 0.9f;
    static final int STEP = (int) Math.floor(0.75 * CHUNK);
    static final String[] PARTS = { "vocals", "inst" };

    private final OrtEnvironment env;
    private final OrtSession session;
    private final String inName;
    private volatile boolean cancelled = false;

    public Mdx(String modelPath, int threads) throws Exception {
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setIntraOpNumThreads(Math.max(1, threads));
        o.setInterOpNumThreads(1);
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        o.setCPUArenaAllocator(false);
        o.setMemoryPatternOptimization(false);
        session = env.createSession(modelPath, o);
        inName = session.getInputNames().iterator().next();
    }

    @Override public String[] parts() { return PARTS; }
    @Override public void cancel() { cancelled = true; }
    @Override public void close() { try { session.close(); } catch (Exception e) { /* ignore */ } }

    /* ---------- БПФ размера 7680 (Блюстейн через 16384) ---------- */

    private static final int M = 16384;
    private static double[] cosT, sinT, wr, wi, br, bi, win;
    private static int[] rev;

    private static synchronized void tables() {
        if (win != null) return;
        rev = new int[M]; int bits = 14;
        for (int i = 0; i < M; i++) { int r = 0, x = i; for (int b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
        cosT = new double[M / 2]; sinT = new double[M / 2];
        for (int k = 0; k < M / 2; k++) { cosT[k] = Math.cos(2 * Math.PI * k / M); sinT[k] = -Math.sin(2 * Math.PI * k / M); }
        wr = new double[NFFT]; wi = new double[NFFT];
        for (int k = 0; k < NFFT; k++) { double a = Math.PI * (((long) k * k) % (2L * NFFT)) / NFFT; wr[k] = Math.cos(a); wi[k] = -Math.sin(a); }
        br = new double[M]; bi = new double[M];
        br[0] = wr[0]; bi[0] = -wi[0];
        for (int k = 1; k < NFFT; k++) { br[k] = br[M - k] = wr[k]; bi[k] = bi[M - k] = -wi[k]; }
        p2(br, bi, false);
        win = new double[NFFT];
        for (int i = 0; i < NFFT; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NFFT);
    }
    private static void p2(double[] re, double[] im, boolean inv) {
        for (int i = 0; i < M; i++) { int j = rev[i]; if (j > i) { double t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
        for (int size = 2; size <= M; size <<= 1) {
            int half = size >> 1, step = M / size;
            for (int i = 0; i < M; i += size) {
                for (int j = 0, k = 0; j < half; j++, k += step) {
                    double c = cosT[k], s = inv ? -sinT[k] : sinT[k]; int a = i + j, b = a + half;
                    double tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
                    re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                }
            }
        }
    }
    // Комплексное БПФ размера 7680 на месте; inv — обратное с делением на n
    private static void fft(double[] re, double[] im, boolean inv, double[] ar, double[] ai) {
        double s = inv ? -1 : 1;
        java.util.Arrays.fill(ar, 0); java.util.Arrays.fill(ai, 0);
        for (int k = 0; k < NFFT; k++) { double xr = re[k], xi = im[k] * s; ar[k] = xr * wr[k] - xi * wi[k]; ai[k] = xr * wi[k] + xi * wr[k]; }
        p2(ar, ai, false);
        for (int k = 0; k < M; k++) { double r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
        p2(ar, ai, true);
        double sc = inv ? 1.0 / ((double) M * NFFT) : 1.0 / M;
        for (int k = 0; k < NFFT; k++) { double r = (ar[k] * wr[k] - ai[k] * wi[k]) * sc, i = (ar[k] * wi[k] + ai[k] * wr[k]) * sc; re[k] = r; im[k] = i * s; }
    }
    private static int reflect(int i, int len) { int p = 2 * (len - 1); i = ((i % p) + p) % p; return i < len ? i : p - i; }

    private final double[] re = new double[NFFT], im = new double[NFFT], ar = new double[M], ai = new double[M];

    // Кусок (L, R длиной CHUNK) → вход модели [4, DIMF, DIMT]; sign — минус-спектр для hq
    private void spec(float[] L, float[] R, float[] out, float sign) {
        int plane = DIMF * DIMT;
        java.util.Arrays.fill(out, 0f);
        for (int f = 0; f < DIMT; f++) {
            int st = f * HOP - TRIM;
            for (int i = 0; i < NFFT; i++) { int j = reflect(st + i, CHUNK); re[i] = L[j] * win[i]; im[i] = R[j] * win[i]; }
            fft(re, im, false, ar, ai);
            for (int b = 3; b < DIMF; b++) {
                int nb = (NFFT - b) % NFFT; double zr = re[b], zi = im[b], cr = re[nb], ci = -im[nb]; int o = b * DIMT + f;
                out[o] = (float) ((zr + cr) / 2) * sign; out[plane + o] = (float) ((zi + ci) / 2) * sign;
                out[2 * plane + o] = (float) ((zi - ci) / 2) * sign; out[3 * plane + o] = (float) (-(zr - cr) / 2) * sign;
            }
        }
    }
    // Выход модели → волна куска (L, R длиной CHUNK); scale — множитель (среднее двух проходов)
    private final double[] accL = new double[CHUNK + NFFT], accR = new double[CHUNK + NFFT], env2 = new double[CHUNK + NFFT];
    private void wave(FloatBuffer y, float[] L, float[] R, boolean add, float scale) {
        int plane = DIMF * DIMT, bins = NFFT / 2 + 1;
        java.util.Arrays.fill(accL, 0); java.util.Arrays.fill(accR, 0); java.util.Arrays.fill(env2, 0);
        for (int f = 0; f < DIMT; f++) {
            java.util.Arrays.fill(re, 0); java.util.Arrays.fill(im, 0);
            for (int b = 0; b < DIMF; b++) {
                int o = b * DIMT + f; double lr = y.get(o), li = b > 0 ? y.get(plane + o) : 0, rr = y.get(2 * plane + o), ri = b > 0 ? y.get(3 * plane + o) : 0;
                re[b] += lr - ri; im[b] += li + rr;
                if (b > 0 && b < bins - 1) { int nb = NFFT - b; re[nb] += lr + ri; im[nb] += -li + rr; }
            }
            fft(re, im, true, ar, ai);
            int st = f * HOP;
            for (int i = 0; i < NFFT; i++) { double w = win[i]; accL[st + i] += re[i] * w; accR[st + i] += im[i] * w; env2[st + i] += w * w; }
        }
        for (int n = 0; n < CHUNK; n++) {
            double e = env2[n + TRIM]; float l = e > 1e-11 ? (float) (accL[n + TRIM] / e) : 0f, r = e > 1e-11 ? (float) (accR[n + TRIM] / e) : 0f;
            if (add) { L[n] += l * scale; R[n] += r * scale; } else { L[n] = l * scale; R[n] = r * scale; }
        }
    }
    private FloatBuffer runModel(float[] spec) throws Exception {
        try (OnnxTensor t = OnnxTensor.createTensor(env, FloatBuffer.wrap(spec), new long[] { 1, 4, DIMF, DIMT });
             OrtSession.Result r = session.run(Collections.singletonMap(inName, t))) {
            FloatBuffer src = ((OnnxTensor) r.get(0)).getFloatBuffer();
            FloatBuffer copy = FloatBuffer.allocate(src.remaining()); copy.put(src); copy.flip();
            return copy;
        }
    }

    private static float peakOf(RandomAccessFile f, long total, byte[] tmp) throws Exception {
        float pk = 0; f.seek(0); long left = total;
        while (left > 0) { int n = (int) Math.min(left, tmp.length / 4); f.readFully(tmp, 0, n * 4); FloatBuffer b = ByteBuffer.wrap(tmp, 0, n * 4).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer(); for (int i = 0; i < n; i++) pk = Math.max(pk, Math.abs(b.get(i))); left -= n; }
        return pk;
    }
    // Отсчёты записи [from, from+n) (за пределами — нули) → dst
    private static void read(RandomAccessFile f, long total, long from, int n, float[] dst, byte[] tmp) throws Exception {
        java.util.Arrays.fill(dst, 0, n, 0f);
        long a = Math.max(0, from), b = Math.min(total, from + n);
        if (b <= a) return;
        f.seek(a * 4); int cnt = (int) (b - a); f.readFully(tmp, 0, cnt * 4);
        ByteBuffer.wrap(tmp, 0, cnt * 4).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(dst, (int) (a - from), cnt);
    }

    @Override
    public void separate(File inL, File inR, long total, File outDir, Progress progress, boolean hq) throws Exception {
        tables();
        if (!outDir.isDirectory() && !outDir.mkdirs()) throw new Exception("outdir");
        int gen = CHUNK - 2 * TRIM;
        long pad = gen + TRIM - (total % gen), mixLen = TRIM + total + pad;
        int n = (int) ((mixLen + STEP - 1) / STEP);
        byte[] tmp = new byte[CHUNK * 4];
        float[] cL = new float[CHUNK], cR = new float[CHUNK], oL = new float[CHUNK], oR = new float[CHUNK], sp = new float[4 * DIMF * DIMT];
        float[] hw = new float[CHUNK];
        // накопление на окне [base, base + CHUNK + STEP) в координатах смеси
        int BUF = CHUNK + STEP;
        float[] rL = new float[BUF], rR = new float[BUF], dv = new float[BUF];
        long base = 0, written = 0; // written — сколько отсчётов записи уже в файлах
        try (RandomAccessFile fl = new RandomAccessFile(inL, "r"); RandomAccessFile fr = new RandomAccessFile(inR, "r");
             RandomAccessFile ov = new RandomAccessFile(new File(outDir, "vocals.f32"), "rw"); RandomAccessFile oi = new RandomAccessFile(new File(outDir, "inst.f32"), "rw")) {
            ov.setLength(0); oi.setLength(0);
            float pk = Math.max(peakOf(fl, total, tmp), peakOf(fr, total, tmp));
            float g = pk > PEAK ? PEAK / pk : 1f, k = COMP / g;
            float[] xL = new float[STEP], xR = new float[STEP], ins = new float[STEP];
            ByteBuffer vb = ByteBuffer.allocate(STEP * 8).order(ByteOrder.LITTLE_ENDIAN), ib = ByteBuffer.allocate(STEP * 8).order(ByteOrder.LITTLE_ENDIAN);
            int idx = 0;
            for (long s = 0; s < mixLen; s += STEP, idx++) {
                if (cancelled) throw new Exception("cancel");
                int act = (int) Math.min(CHUNK, mixLen - s);
                read(fl, total, s - TRIM, act, cL, tmp); read(fr, total, s - TRIM, act, cR, tmp);
                java.util.Arrays.fill(cL, act, CHUNK, 0f); java.util.Arrays.fill(cR, act, CHUNK, 0f);
                for (int i = 0; i < act; i++) { cL[i] *= g; cR[i] *= g; }
                spec(cL, cR, sp, 1f);
                wave(runModel(sp), oL, oR, false, hq ? 0.5f : 1f);
                if (hq) { if (cancelled) throw new Exception("cancel"); spec(cL, cR, sp, -1f); wave(runModel(sp), oL, oR, true, -0.5f); }
                for (int i = 0; i < act; i++) hw[i] = act == 1 ? 1f : (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (act - 1)));
                int off = (int) (s - base);
                for (int i = 0; i < act; i++) { rL[off + i] += oL[i] * hw[i]; rR[off + i] += oR[i] * hw[i]; dv[off + i] += hw[i]; }
                // всё до начала следующего куска — готово: в файлы (координаты записи = смеси − TRIM)
                long ready = Math.min(s + STEP, mixLen);
                long from = Math.max(base, TRIM + written), to = Math.min(ready, TRIM + total);
                if (to > from) {
                    int cnt = (int) (to - from);
                    read(fl, total, from - TRIM, cnt, xL, tmp); read(fr, total, from - TRIM, cnt, xR, tmp);
                    vb.clear(); ib.clear();
                    for (int i = 0; i < cnt; i++) {
                        int j = (int) (from - base) + i; float d = dv[j];
                        float a = d > 0 ? rL[j] / d * k : 0f, b = d > 0 ? rR[j] / d * k : 0f;
                        vb.putFloat(a); vb.putFloat(b); ib.putFloat(xL[i] - a); ib.putFloat(xR[i] - b);
                    }
                    ov.write(vb.array(), 0, cnt * 8); oi.write(ib.array(), 0, cnt * 8);
                    written += cnt;
                }
                // сдвинуть окно накопления на шаг
                int sh = (int) Math.min(STEP, ready - base);
                System.arraycopy(rL, sh, rL, 0, BUF - sh); java.util.Arrays.fill(rL, BUF - sh, BUF, 0f);
                System.arraycopy(rR, sh, rR, 0, BUF - sh); java.util.Arrays.fill(rR, BUF - sh, BUF, 0f);
                System.arraycopy(dv, sh, dv, 0, BUF - sh); java.util.Arrays.fill(dv, BUF - sh, BUF, 0f);
                base += sh;
                if (progress != null) progress.at(Math.min(1.0, (idx + 1) / (double) n));
            }
        }
    }
}
