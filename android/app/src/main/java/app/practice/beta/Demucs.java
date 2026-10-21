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

// Разделение записи на дорожки нативным ONNX Runtime (все ядра), модель HTDemucs в сборке timcsy/demucs-web-onnx
// (STFT снаружи). Чистая Java без Android — то же, что demucs-web (src/audio/stems.worker.js) делает в WebAssembly:
// сегменты по 7,8 с с перекрытием 1/4, спектрограмма (Ханн 4096, шаг 1024, отражённые поля), входы «input» (волна)
// и «x» (спектр), выходы — волна и комплексная маска → обратное STFT, сумма, склейка окном. Вход — два файла
// float32 LE (левый, правый), выход — четыре файла float32 LE с чередованием каналов (drums, bass, other, vocals).
// Память: один сегмент за раз, готовые куски пишутся в файл сразу — песня любой длины не держится в куче.
public final class Demucs {
    public static final int SR = 44100, N = 343980, FFT = 4096, HOP = 1024, BINS = 2048, FRAMES = 336;
    public static final int STRIDE = (int) Math.floor(N * 0.75);
    public static final String[] PARTS = { "drums", "bass", "other", "vocals" };

    public interface Progress { void at(double frac); }

    private final OrtEnvironment env;
    private final OrtSession session;
    private volatile boolean cancelled = false;

    public Demucs(String modelPath, int threads) throws Exception {
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setIntraOpNumThreads(Math.max(1, threads));
        o.setInterOpNumThreads(1);
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        o.setCPUArenaAllocator(false); // без арены: память возвращается после каждого сегмента (иначе растёт до гигабайт)
        o.setMemoryPatternOptimization(false);
        session = env.createSession(modelPath, o);
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

    // Спектр канала как в demucs-web: поля 1536/1620, центрирование 2048, кадры 2…337, бины 0…2047 → spec[c][b][f]
    private static void spectrum(float[] ch, float[] spec, int reOff, int imOff, float[] re, float[] im) {
        int le = (N + HOP - 1) / HOP, pad = (HOP / 2) * 3, padRight = pad + le * HOP - N;
        float[] x = reflectPad(reflectPad(ch, pad, padRight), FFT / 2, FFT / 2);
        float scale = (float) (1.0 / Math.sqrt(FFT));
        for (int f = 0; f < FRAMES; f++) {
            int start = (f + 2) * HOP;
            for (int i = 0; i < FFT; i++) { re[i] = x[start + i] * hann[i]; im[i] = 0; }
            fft(re, im, false);
            for (int b = 0; b < BINS; b++) { spec[reOff + b * FRAMES + f] = re[b] * scale; spec[imOff + b * FRAMES + f] = im[b] * scale; }
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
    public void separate(File inL, File inR, long total, File outDir, Progress progress) throws Exception {
        tables();
        if (!outDir.isDirectory() && !outDir.mkdirs()) throw new Exception("outdir");
        int segs = total <= N ? 1 : (int) Math.ceil((double) (total - N) / STRIDE) + 1;
        float[] wave = new float[2 * N], spec = new float[4 * BINS * FRAMES];
        float[] re = new float[FFT], im = new float[FFT], acc = new float[(FRAMES + 3) * HOP + FFT], wsum = new float[acc.length];
        float[] seg = new float[N]; // одна дорожка, один канал после суммы ветвей
        float[][][] sum = new float[4][2][N]; // накопление с окном для текущего сегмента (перекрытие с предыдущим)
        float[] wt = new float[N];
        byte[] tmp = new byte[N * 4];
        byte[] outBytes = new byte[STRIDE * 8];
        RandomAccessFile[] outs = new RandomAccessFile[4];
        try (RandomAccessFile fl = new RandomAccessFile(inL, "r"); RandomAccessFile fr = new RandomAccessFile(inR, "r")) {
            for (int k = 0; k < 4; k++) outs[k] = new RandomAccessFile(new File(outDir, PARTS[k] + ".f32"), "rw");
            for (int k = 0; k < 4; k++) outs[k].setLength(0);
            long[] shape1 = { 1, 2, N }, shape2 = { 1, 4, BINS, FRAMES };
            int idx = 0;
            for (long start = 0; start < total; start += STRIDE, idx++) {
                if (cancelled) throw new Exception("cancel");
                int len = (int) Math.min(N, total - start);
                readSeg(fl, start, len, wave, tmp);
                float[] left = new float[N]; System.arraycopy(wave, 0, left, 0, N);
                readSeg(fr, start, len, seg, tmp);
                float[] right = new float[N]; System.arraycopy(seg, 0, right, 0, N);
                System.arraycopy(left, 0, wave, 0, N); System.arraycopy(right, 0, wave, N, N);
                spectrum(left, spec, 0, BINS * FRAMES, re, im);
                spectrum(right, spec, 2 * BINS * FRAMES, 3 * BINS * FRAMES, re, im);
                Map<String, OnnxTensor> feeds = new HashMap<>();
                FloatBuffer timeOut, freqOut;
                try (OnnxTensor t1 = OnnxTensor.createTensor(env, FloatBuffer.wrap(wave), shape1);
                     OnnxTensor t2 = OnnxTensor.createTensor(env, FloatBuffer.wrap(spec), shape2)) {
                    feeds.put(session.getInputNames().iterator().next(), t1);
                    for (String n : session.getInputNames()) if (!feeds.containsKey(n)) feeds.put(n, t2);
                    try (OrtSession.Result r = session.run(feeds)) {
                        FloatBuffer tb = null, fb = null;
                        for (Map.Entry<String, OnnxValue> e : r) {
                            OnnxTensor t = (OnnxTensor) e.getValue();
                            long[] d = t.getInfo().getShape();
                            if (d.length == 4 && d[2] == 2) tb = t.getFloatBuffer(); else if (d.length == 5 && d[2] == 4) fb = t.getFloatBuffer();
                        }
                        if (tb == null) throw new Exception("no time output");
                        timeOut = tb; freqOut = fb;
                    }
                }
                // окно склейки: подъём и спад по половине шага
                float half = STRIDE * 0.5f;
                for (int i = 0; i < len; i++) wt[i] += Math.min(Math.min(i / half, (len - i) / half), 1f);
                int trackStride = 4 * BINS * FRAMES;
                for (int k = 0; k < 4; k++) {
                    for (int ch = 0; ch < 2; ch++) {
                        int tOff = (k * 2 + ch) * N;
                        for (int i = 0; i < N; i++) seg[i] = timeOut.get(tOff + i);
                        if (freqOut != null) ispec(freqOut, k * trackStride + (ch * 2) * BINS * FRAMES, k * trackStride + (ch * 2 + 1) * BINS * FRAMES, seg, re, im, acc, wsum);
                        float[] s = sum[k][ch];
                        for (int i = 0; i < len; i++) s[i] += seg[i] * Math.min(Math.min(i / half, (len - i) / half), 1f);
                    }
                }
                // готово всё до начала следующего сегмента — в файл; остаток сдвигаем к началу
                int done = (int) Math.min(STRIDE, total - start);
                ByteBuffer bb = ByteBuffer.wrap(outBytes).order(ByteOrder.LITTLE_ENDIAN);
                for (int k = 0; k < 4; k++) {
                    bb.clear();
                    float[] l = sum[k][0], rr = sum[k][1];
                    for (int i = 0; i < done; i++) { float w = wt[i] > 0 ? wt[i] : 1f; bb.putFloat(l[i] / w); bb.putFloat(rr[i] / w); }
                    outs[k].write(outBytes, 0, done * 8);
                    for (int ch = 0; ch < 2; ch++) { float[] s = sum[k][ch]; System.arraycopy(s, STRIDE, s, 0, N - STRIDE); java.util.Arrays.fill(s, N - STRIDE, N, 0f); }
                }
                System.arraycopy(wt, STRIDE, wt, 0, N - STRIDE); java.util.Arrays.fill(wt, N - STRIDE, N, 0f);
                if (progress != null) progress.at((idx + 1) / (double) segs);
            }
        } finally {
            for (RandomAccessFile o : outs) if (o != null) try { o.close(); } catch (Exception e) { /* ignore */ }
        }
    }
}
