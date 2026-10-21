package app.practice.beta;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.HashMap;
import java.util.Map;

// Разделение записи на дорожки нативным ONNX Runtime (все ядра), модели HTDemucs «STFT снаружи»: четыре дорожки
// (timcsy/demucs-web-onnx: входы «input» волна и «x» спектр [1,4,2048,336] — L re, L im, R re, R im) и шесть
// (Andremi/audioweb-models: «mix» и «spec» [1,2,2048,336,2] — канал, бин, кадр, re/im); раскладка берётся из формы
// второго входа, число дорожек — из формы выхода. Чистая Java без Android — то же, что src/audio/demucs.js делает
// в WebAssembly: сегменты по 7,8 с с перекрытием 1/4, спектрограмма (Ханн 4096, шаг 1024, отражённые поля), выходы —
// волна и комплексная маска → обратное STFT, сумма, склейка окном. Вход — два файла float32 LE (левый, правый),
// выход — по файлу float32 LE с чередованием каналов на дорожку (порядок — как у модели).
// Память: один сегмент за раз, готовые куски пишутся в файл сразу — песня любой длины не держится в куче.
public final class Demucs {
    public static final int SR = 44100, N = 343980, FFT = 4096, HOP = 1024, BINS = 2048, FRAMES = 336;
    public static final int STRIDE = (int) Math.floor(N * 0.75);
    public static final String[] PARTS4 = { "drums", "bass", "other", "vocals" };
    public static final String[] PARTS6 = { "drums", "bass", "other", "vocals", "guitar", "piano" };
    public static String[] partsOf(int n) { return n == 6 ? PARTS6 : PARTS4; }

    public interface Progress { void at(double frac); }

    private final OrtEnvironment env;
    private final OrtSession session;
    private final String waveName, specName;
    private final boolean interleaved; // спектр [1,2,2048,336,2] (6 дорожек) против [1,4,2048,336]
    private volatile boolean cancelled = false;
    private int stems = 4; // известно после первого сегмента (по форме выхода)
    public int stems() { return stems; }

    public Demucs(String modelPath, int threads) throws Exception {
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setIntraOpNumThreads(Math.max(1, threads));
        o.setInterOpNumThreads(1);
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        o.setCPUArenaAllocator(false); // без арены: память возвращается после каждого сегмента (иначе растёт до гигабайт)
        o.setMemoryPatternOptimization(false);
        session = env.createSession(modelPath, o);
        String w = null, sp = null; boolean il = false;
        for (Map.Entry<String, ai.onnxruntime.NodeInfo> e : session.getInputInfo().entrySet()) {
            long[] d = ((ai.onnxruntime.TensorInfo) e.getValue().getInfo()).getShape();
            if (d.length == 3) w = e.getKey(); else { sp = e.getKey(); il = d.length == 5; }
        }
        if (w == null || sp == null) throw new Exception("model inputs");
        waveName = w; specName = sp; interleaved = il;
    }

    public void cancel() { cancelled = true; }

    public void close() { try { session.close(); } catch (Exception e) { /* ignore */ } }

    /* ---------- БПФ ---------- */

    private static float[] hann;
    private static float[] twR, twI;
    private static int[] rev;

    private static synchronized void tables() {
        if (hann != null) return;
        hann = new float[FFT];
        for (int i = 0; i < FFT; i++) hann[i] = (float) (0.5 * (1 - Math.cos(2 * Math.PI * i / FFT)));
        twR = new float[FFT / 2]; twI = new float[FFT / 2];
        for (int k = 0; k < FFT / 2; k++) { double a = -2 * Math.PI * k / FFT; twR[k] = (float) Math.cos(a); twI[k] = (float) Math.sin(a); }
        int bits = 12; rev = new int[FFT];
        for (int i = 0; i < FFT; i++) { int r = 0, n = i; for (int b = 0; b < bits; b++) { r = (r << 1) | (n & 1); n >>= 1; } rev[i] = r; }
    }

    // Прямое (inverse=false, мнимая часть входа 0) и обратное (inverse=true, делит на n) преобразование на месте
    private static void fft(float[] re, float[] im, boolean inverse) {
        for (int i = 0; i < FFT; i++) { int j = rev[i]; if (j > i) { float t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
        for (int size = 2; size <= FFT; size <<= 1) {
            int half = size >> 1, step = FFT / size;
            for (int i = 0; i < FFT; i += size) {
                for (int j = 0; j < half; j++) {
                    int k = j * step; float tr = twR[k], ti = inverse ? -twI[k] : twI[k];
                    int a = i + j, b = a + half;
                    float or = re[b] * tr - im[b] * ti, oi = re[b] * ti + im[b] * tr;
                    re[b] = re[a] - or; im[b] = im[a] - oi; re[a] += or; im[a] += oi;
                }
            }
        }
        if (inverse) for (int i = 0; i < FFT; i++) { re[i] /= FFT; im[i] /= FFT; }
    }

    private static float[] reflectPad(float[] s, int left, int right) {
        int len = s.length; float[] o = new float[left + len + right];
        for (int i = 0; i < left; i++) o[i] = s[Math.min(left - i, len - 1)];
        System.arraycopy(s, 0, o, left, len);
        for (int i = 0; i < right; i++) o[left + len + i] = s[Math.max(0, len - 2 - i)];
        return o;
    }

    // Спектр канала: поля 1536/1620, центрирование 2048, кадры 2…337, бины 0…2047. Раскладка — через смещения и шаг:
    // планарная (reOff/imOff — начала плоскостей re и im, stride 1) или чередование (re и im рядом, stride 2)
    private static void spectrum(float[] ch, float[] spec, int reOff, int imOff, int stride, float[] re, float[] im) {
        int le = (N + HOP - 1) / HOP, pad = (HOP / 2) * 3, padRight = pad + le * HOP - N;
        float[] x = reflectPad(reflectPad(ch, pad, padRight), FFT / 2, FFT / 2);
        float scale = (float) (1.0 / Math.sqrt(FFT));
        for (int f = 0; f < FRAMES; f++) {
            int start = (f + 2) * HOP;
            for (int i = 0; i < FFT; i++) { re[i] = x[start + i] * hann[i]; im[i] = 0; }
            fft(re, im, false);
            for (int b = 0; b < BINS; b++) { int k = (b * FRAMES + f) * stride; spec[reOff + k] = re[b] * scale; spec[imOff + k] = im[b] * scale; }
        }
    }

    // Обратное STFT маски одного канала (bins×frames, кадры сдвинуты на 2) → N отсчётов (прибавляются к out)
    private static void ispec(FloatBuffer freq, int reOff, int imOff, float[] out, float[] re, float[] im, float[] acc, float[] wsum) {
        int frames = FRAMES + 4, len = (frames - 1) * HOP + FFT;
        java.util.Arrays.fill(acc, 0, len, 0f); java.util.Arrays.fill(wsum, 0, len, 0f);
        float scale = (float) Math.sqrt(FFT);
        for (int f = 0; f < frames; f++) {
            java.util.Arrays.fill(re, 0f); java.util.Arrays.fill(im, 0f);
            int sf = f - 2;
            if (sf >= 0 && sf < FRAMES) {
                for (int b = 0; b < BINS; b++) { re[b] = freq.get(reOff + b * FRAMES + sf); im[b] = freq.get(imOff + b * FRAMES + sf); }
                for (int k = 1; k < BINS; k++) { re[FFT - k] = re[k]; im[FFT - k] = -im[k]; } // бин 2048 — ноль
            }
            fft(re, im, true);
            int start = f * HOP;
            for (int i = 0; i < FFT && start + i < len; i++) { acc[start + i] += re[i] * hann[i] * scale; wsum[start + i] += hann[i] * hann[i]; }
        }
        int off = FFT / 2 + (HOP / 2) * 3;
        for (int i = 0; i < N; i++) { float w = wsum[off + i]; out[i] += w > 1e-8f ? acc[off + i] / w : 0f; }
    }

    /* ---------- разделение ---------- */

    private static int readSeg(RandomAccessFile f, long start, int n, float[] dst, byte[] tmp) throws Exception {
        java.util.Arrays.fill(dst, 0f);
        f.seek(start * 4L);
        int got = 0, need = n * 4;
        while (got < need) { int r = f.read(tmp, got, need - got); if (r <= 0) break; got += r; }
        ByteBuffer.wrap(tmp, 0, got).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(dst, 0, got / 4);
        return got / 4;
    }

    // inL, inR — файлы float32 LE; total — отсчётов; outDir — куда класть <part>.f32 (чередование L R)
    public void separate(File inL, File inR, long total, File outDir, Progress progress) throws Exception { separate(inL, inR, total, outDir, progress, false); }
    // hq — «ночное» качество: шаг окна N/2 вместо 3N/4 и три прохода на сегмент со случайным сдвигом окна до 0,5 с
    // (как shifts у Demucs: положения окна усредняются, края дорожек чище); время ≈ ×4,5
    public void separate(File inL, File inR, long total, File outDir, Progress progress, boolean hq) throws Exception {
        tables();
        if (!outDir.isDirectory() && !outDir.mkdirs()) throw new Exception("outdir");
        final int stride = hq ? N / 2 : STRIDE, passes = hq ? 3 : 1, MAXOFF = SR / 2, BUF = N + MAXOFF;
        int segs = Math.max(1, (int) Math.ceil((double) total / stride)); // столько раз пройдёт цикл по start
        float[] wave = new float[2 * N], spec = new float[4 * BINS * FRAMES];
        float[] re = new float[FFT], im = new float[FFT], acc = new float[(FRAMES + 3) * HOP + FFT], wsum = new float[acc.length];
        float[] seg = new float[N]; // одна дорожка, один канал после суммы ветвей
        float[][][] sum = null; // накопление с окном (перекрытие с соседями и сдвинутыми проходами); размер — по числу дорожек
        float[] wt = new float[BUF];
        byte[] tmp = new byte[N * 4];
        byte[] outBytes = new byte[stride * 8];
        RandomAccessFile[] outs = null;
        java.util.Random rnd = new java.util.Random(7);
        try (RandomAccessFile fl = new RandomAccessFile(inL, "r"); RandomAccessFile fr = new RandomAccessFile(inR, "r")) {
            long[] shape1 = { 1, 2, N }, shape2 = interleaved ? new long[] { 1, 2, BINS, FRAMES, 2 } : new long[] { 1, 4, BINS, FRAMES };
            int idx = 0;
            float half = stride * 0.5f;
            for (long start = 0; start < total; start += stride, idx++) {
              for (int pass = 0; pass < passes; pass++) {
                if (cancelled) throw new Exception("cancel");
                int off = pass == 0 ? 0 : (int) Math.min(rnd.nextInt(MAXOFF), Math.max(0, total - start - 1));
                long at = start + off;
                if (at >= total) continue;
                int len = (int) Math.min(N, total - at);
                readSeg(fl, at, len, wave, tmp);
                float[] left = new float[N]; System.arraycopy(wave, 0, left, 0, N);
                readSeg(fr, at, len, seg, tmp);
                float[] right = new float[N]; System.arraycopy(seg, 0, right, 0, N);
                System.arraycopy(left, 0, wave, 0, N); System.arraycopy(right, 0, wave, N, N);
                if (interleaved) { spectrum(left, spec, 0, 1, 2, re, im); spectrum(right, spec, 2 * BINS * FRAMES, 2 * BINS * FRAMES + 1, 2, re, im); }
                else { spectrum(left, spec, 0, BINS * FRAMES, 1, re, im); spectrum(right, spec, 2 * BINS * FRAMES, 3 * BINS * FRAMES, 1, re, im); }
                Map<String, OnnxTensor> feeds = new HashMap<>();
                FloatBuffer timeOut, freqOut;
                try (OnnxTensor t1 = OnnxTensor.createTensor(env, FloatBuffer.wrap(wave), shape1);
                     OnnxTensor t2 = OnnxTensor.createTensor(env, FloatBuffer.wrap(spec), shape2)) {
                    feeds.put(waveName, t1); feeds.put(specName, t2);
                    try (OrtSession.Result r = session.run(feeds)) {
                        FloatBuffer tb = null, fb = null;
                        for (Map.Entry<String, OnnxValue> e : r) {
                            OnnxTensor t = (OnnxTensor) e.getValue();
                            long[] d = t.getInfo().getShape();
                            if (d.length == 4 && d[2] == 2) { tb = t.getFloatBuffer(); stems = (int) d[1]; } else if (d.length == 5 && d[2] == 4) fb = t.getFloatBuffer();
                        }
                        if (tb == null) throw new Exception("no time output");
                        timeOut = tb; freqOut = fb;
                    }
                }
                if (sum == null) {
                    sum = new float[stems][2][BUF];
                    outs = new RandomAccessFile[stems];
                    String[] parts = partsOf(stems);
                    for (int k = 0; k < stems; k++) { outs[k] = new RandomAccessFile(new File(outDir, parts[k] + ".f32"), "rw"); outs[k].setLength(0); }
                }
                // окно склейки: подъём и спад по половине шага
                for (int i = 0; i < len; i++) wt[off + i] += Math.min(Math.min(i / half, (len - i) / half), 1f);
                int trackStride = 4 * BINS * FRAMES;
                for (int k = 0; k < stems; k++) {
                    for (int ch = 0; ch < 2; ch++) {
                        int tOff = (k * 2 + ch) * N;
                        for (int i = 0; i < N; i++) seg[i] = timeOut.get(tOff + i);
                        if (freqOut != null) ispec(freqOut, k * trackStride + (ch * 2) * BINS * FRAMES, k * trackStride + (ch * 2 + 1) * BINS * FRAMES, seg, re, im, acc, wsum);
                        float[] s = sum[k][ch];
                        for (int i = 0; i < len; i++) s[off + i] += seg[i] * Math.min(Math.min(i / half, (len - i) / half), 1f);
                    }
                }
                if (progress != null) progress.at(Math.min(1.0, (idx + (pass + 1) / (double) passes) / segs));
              }
                if (sum == null) continue;
                // готово всё до начала следующего сегмента — в файл; остаток сдвигаем к началу
                int done = (int) Math.min(stride, total - start);
                ByteBuffer bb = ByteBuffer.wrap(outBytes).order(ByteOrder.LITTLE_ENDIAN);
                for (int k = 0; k < stems; k++) {
                    bb.clear();
                    float[] l = sum[k][0], rr = sum[k][1];
                    for (int i = 0; i < done; i++) { float w = wt[i] > 0 ? wt[i] : 1f; bb.putFloat(l[i] / w); bb.putFloat(rr[i] / w); }
                    outs[k].write(outBytes, 0, done * 8);
                    for (int ch = 0; ch < 2; ch++) { float[] s = sum[k][ch]; System.arraycopy(s, stride, s, 0, BUF - stride); java.util.Arrays.fill(s, BUF - stride, BUF, 0f); }
                }
                System.arraycopy(wt, stride, wt, 0, BUF - stride); java.util.Arrays.fill(wt, BUF - stride, BUF, 0f);
            }
        } finally {
            if (outs != null) for (RandomAccessFile o : outs) if (o != null) try { o.close(); } catch (Exception e) { /* ignore */ }
        }
    }
}
