// Вокал записи моделью Mel-Band RoFormer (веса Kimberley Jensen, MIT; архитектура ByteDance; ONNX-сборка
// audiojs/mel-roformer, fp16, 464 МБ) нативно на компьютере — «улучшенное разделение» на Windows: вокал чище, чем
// у HTDemucs (SDR 12,1 против ~9), остальные дорожки потом считает HTDemucs по инструменталу (запись минус вокал).
// Спектр снаружи модели: окно Ханна 2048, шаг 441, без нормировки, центрирование с отражёнными полями (как
// torch.stft); сегменты 8 с (801 кадр) каждые 4 с, края сегментов гаснут линейно на 10 % длины, запись перед
// нарезкой отражается на 4 с в обе стороны — ровно как demix() в Music-Source-Separation-Training и как эталонная
// реализация @audio/neural-separate (сверка — build/roformer-check, см. DECISIONS). Вход — два канала float32,
// выход — два канала вокала той же длины. Без Tauri: чистый движок, команды — в lib.rs.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use realfft::num_complex::Complex;
use realfft::{ComplexToReal, RealFftPlanner, RealToComplex};

const NFFT: usize = 2048;
const HOP: usize = 441;
const F: usize = NFFT / 2 + 1; // 1025
pub const L: usize = 352800; // 8 с
const T: usize = 1 + L / HOP; // 801
const STEP: usize = L / 2;
const FADE: usize = L / 10;
const BORDER: usize = L - STEP;

pub struct RoFormer {
    session: Session,
    in_name: String,
    hann: Vec<f32>,
    fwd: Arc<dyn RealToComplex<f32>>,
    inv: Arc<dyn ComplexToReal<f32>>,
}

// Индекс отражения numpy/torch: без повтора краевого отсчёта, период 2(n−1); любая ширина полей
fn reflect_index(i: isize, n: usize) -> usize {
    if n <= 1 { return 0; }
    let period = 2 * (n as isize - 1);
    let mut k = ((i % period) + period) % period;
    if k >= n as isize { k = period - k; }
    k as usize
}

impl RoFormer {
    pub fn new(model: &[u8], threads: usize) -> Result<RoFormer, String> {
        let env = crate::ort_env()?;
        let session = Session::builder(env).map_err(|e| e.to_string())?
            .with_intra_threads(threads.max(1)).map_err(|e| e.to_string())?
            .with_inter_threads(1).map_err(|e| e.to_string())?
            .with_optimization_level(GraphOptimizationLevel::Level3).map_err(|e| e.to_string())?
            .with_memory_pattern(false).map_err(|e| e.to_string())?
            .commit_from_memory(model).map_err(|e| e.to_string())?;
        let in_name = session.inputs().first().map(|i| i.name().to_string()).unwrap_or_else(|| "mix_spec".into());
        let hann: Vec<f32> = (0..NFFT).map(|i| (0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / NFFT as f64).cos()) as f32).collect();
        let mut planner = RealFftPlanner::<f32>::new();
        Ok(RoFormer { session, in_name, hann, fwd: planner.plan_fft_forward(NFFT), inv: planner.plan_fft_inverse(NFFT) })
    }

    // STFT сегмента (ровно L отсчётов) → в spec на смещения re_off/im_off: раскладка [F][T]
    fn spectrum(&self, x: &[f32], spec: &mut [f32], re_off: usize, im_off: usize) {
        let pad = NFFT / 2;
        let mut inp = vec![0f32; NFFT];
        let mut out = vec![Complex::new(0f32, 0f32); F];
        for m in 0..T {
            let pos = m as isize * HOP as isize - pad as isize;
            for i in 0..NFFT {
                let p = pos + i as isize;
                let v = if p < 0 || p as usize >= L { x[reflect_index(p, L)] } else { x[p as usize] };
                inp[i] = v * self.hann[i];
            }
            let _ = self.fwd.process(&mut inp, &mut out);
            for f in 0..F { spec[re_off + f * T + m] = out[f].re; spec[im_off + f * T + m] = out[f].im; }
        }
    }
    // Обратное STFT одного канала (раскладка [F][T]) → L отсчётов (взвешенное наложение, деление на огибающую окна)
    fn ispectrum(&self, z: &[f32], re_off: usize, im_off: usize, out: &mut [f32], acc: &mut [f32], env: &[f32]) {
        acc.fill(0.0);
        let mut inp = vec![Complex::new(0f32, 0f32); F];
        let mut tmp = vec![0f32; NFFT];
        let scale = 1.0 / NFFT as f32;
        for m in 0..T {
            for f in 0..F { inp[f] = Complex::new(z[re_off + f * T + m], z[im_off + f * T + m]); }
            inp[0].im = 0.0; inp[F - 1].im = 0.0;
            let _ = self.inv.process(&mut inp, &mut tmp);
            let pos = m * HOP;
            for i in 0..NFFT { acc[pos + i] += tmp[i] * scale * self.hann[i]; }
        }
        let pad = NFFT / 2;
        for i in 0..L { let e = env[pad + i]; out[i] = if e > 1e-8 { acc[pad + i] / e } else { 0.0 }; }
    }

    // Вокал записи: left, right → [левый, правый] той же длины; progress(0…1), cancelled — прервать
    pub fn vocals(&mut self, left: &[f32], right: &[f32], cancelled: &AtomicBool, progress: &mut dyn FnMut(f64)) -> Result<[Vec<f32>; 2], String> {
        let n = left.len().min(right.len());
        if n == 0 { return Err("empty".into()); }
        let wide = n > 2 * BORDER;
        let m = if wide { n + 2 * BORDER } else { n };
        let src = |ch: &[f32], i: usize| -> f32 { if wide { ch[reflect_index(i as isize - BORDER as isize, n)] } else { ch[i] } };
        let mut starts = Vec::new();
        let mut s = 0usize;
        loop { starts.push(s); if s + L >= m { break; } s += STEP; }
        let mut acc = [vec![0f32; m], vec![0f32; m]];
        let mut wsum = vec![0f32; m];
        let mut seg = [vec![0f32; L], vec![0f32; L]];
        let mut spec = vec![0f32; 4 * F * T];
        let mut ola = vec![0f32; (T - 1) * HOP + NFFT];
        let mut env = vec![0f32; (T - 1) * HOP + NFFT];
        for mm in 0..T { for i in 0..NFFT { env[mm * HOP + i] += self.hann[i] * self.hann[i]; } }
        let mut voc = vec![0f32; L];
        let shape = vec![1i64, 4, F as i64, T as i64];
        let last = starts.len() - 1;
        for (k, &start) in starts.iter().enumerate() {
            if cancelled.load(Ordering::Relaxed) { return Err("cancel".into()); }
            let len = L.min(m - start);
            let reflect = len > L / 2;
            for (c, ch) in [left, right].iter().enumerate() {
                for i in 0..L { seg[c][i] = if i < len { src(ch, start + i) } else if reflect { src(ch, start + reflect_index(i as isize, len)) } else { 0.0 }; }
            }
            self.spectrum(&seg[0], &mut spec, 0, F * T);
            self.spectrum(&seg[1], &mut spec, 2 * F * T, 3 * F * T);
            let t = Tensor::<f32>::from_array((shape.clone(), spec.clone())).map_err(|e| e.to_string())?;
            let res = self.session.run(ort::inputs![self.in_name.as_str() => t]).map_err(|e| e.to_string())?;
            let z: Vec<f32> = {
                let (_, v) = res.iter().next().ok_or("no output")?;
                let (_, data) = v.try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
                data.to_vec()
            };
            drop(res);
            for c in 0..2 {
                self.ispectrum(&z, (2 * c) * F * T, (2 * c + 1) * F * T, &mut voc, &mut ola, &env);
                for i in 0..len {
                    let mut w = 1f32;
                    if k > 0 && i < FADE { w = i as f32 / (FADE - 1) as f32; }
                    if k < last && i >= L - FADE { w = w.min((L - 1 - i) as f32 / (FADE - 1) as f32); }
                    if c == 0 { wsum[start + i] += w; }
                    acc[c][start + i] += voc[i] * w;
                }
            }
            progress((k + 1) as f64 / starts.len() as f64);
        }
        let off = if wide { BORDER } else { 0 };
        let mut out = [vec![0f32; n], vec![0f32; n]];
        for c in 0..2 { for i in 0..n { let w = wsum[off + i]; out[c][i] = if w > 0.0 { acc[c][off + i] / w } else { 0.0 }; } }
        Ok(out)
    }
}
