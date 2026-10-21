// Разделение записи на дорожки нативно (Windows): HTDemucs в ONNX Runtime на всех ядрах — тот же алгоритм, что в
// Demucs.java (Android) и demucs.js (браузер): спектр снаружи модели (окно Ханна 4096, шаг 1024, отражённые поля),
// модель отдаёт волну и комплексную маску → обратное STFT, сумма ветвей, склейка окном по сегментам ~7,8 с;
// hq — шаг окна N/2 и три прохода со случайным сдвигом. Вход — два канала float32 в памяти, выход — по файлу
// float32 LE с чередованием L R на дорожку (порядок — как у модели); память — один сегмент за раз.
// Без Tauri: чистый движок, команды — в lib.rs.
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use realfft::num_complex::Complex;
use realfft::{ComplexToReal, RealFftPlanner, RealToComplex};

pub const SR: usize = 44100;
pub const N: usize = 343980;
const FFT: usize = 4096;
const HOP: usize = 1024;
const BINS: usize = 2048;
const FRAMES: usize = 336;
const STRIDE: usize = (N * 3) / 4;
pub const PARTS4: [&str; 4] = ["drums", "bass", "other", "vocals"];
pub const PARTS6: [&str; 6] = ["drums", "bass", "other", "vocals", "guitar", "piano"];
pub fn parts_of(n: usize) -> &'static [&'static str] { if n == 6 { &PARTS6 } else { &PARTS4 } }

pub struct Demucs {
    session: Session,
    wave_name: String,
    spec_name: String,
    interleaved: bool, // спектр [1,2,2048,336,2] (6 дорожек) против [1,4,2048,336]
    pub stems: usize,
    hann: Vec<f32>,
    fwd: Arc<dyn RealToComplex<f32>>,
    inv: Arc<dyn ComplexToReal<f32>>,
}

fn reflect_pad(s: &[f32], left: usize, right: usize) -> Vec<f32> {
    let len = s.len();
    let mut o = vec![0f32; left + len + right];
    for i in 0..left { o[i] = s[(left - i).min(len - 1)]; }
    o[left..left + len].copy_from_slice(s);
    for i in 0..right { o[left + len + i] = s[(len as isize - 2 - i as isize).max(0) as usize]; }
    o
}

impl Demucs {
    // model — байты ONNX; threads — потоков на вычисления
    pub fn new(model: &[u8], threads: usize) -> Result<Demucs, String> {
        let env = crate::ort_env()?;
        let session = Session::builder(env).map_err(|e| e.to_string())?
            .with_intra_threads(threads.max(1)).map_err(|e| e.to_string())?
            .with_inter_threads(1).map_err(|e| e.to_string())?
            .with_optimization_level(GraphOptimizationLevel::Level3).map_err(|e| e.to_string())?
            .with_memory_pattern(false).map_err(|e| e.to_string())?
            .commit_from_memory(model).map_err(|e| e.to_string())?;
        let (mut wave_name, mut spec_name, mut interleaved) = (None, None, false);
        for o in session.inputs() {
            let rank = o.dtype().tensor_shape().map(|s| s.len()).unwrap_or(0);
            if rank == 3 { wave_name = Some(o.name().to_string()); } else if rank >= 4 { spec_name = Some(o.name().to_string()); interleaved = rank == 5; }
        }
        let (wave_name, spec_name) = match (wave_name, spec_name) { (Some(w), Some(s)) => (w, s), _ => return Err("model inputs".into()) };
        let hann: Vec<f32> = (0..FFT).map(|i| (0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / FFT as f64).cos())) as f32).collect();
        let mut planner = RealFftPlanner::<f32>::new();
        Ok(Demucs { session, wave_name, spec_name, interleaved, stems: 4, hann, fwd: planner.plan_fft_forward(FFT), inv: planner.plan_fft_inverse(FFT) })
    }

    // Спектр канала: поля 1536/1620, центрирование 2048, кадры 2…337, бины 0…2047; раскладка — смещения и шаг
    fn spectrum(&self, ch: &[f32], spec: &mut [f32], re_off: usize, im_off: usize, stride: usize) {
        let le = (N + HOP - 1) / HOP;
        let pad = (HOP / 2) * 3;
        let pad_right = pad + le * HOP - N;
        let x = reflect_pad(&reflect_pad(ch, pad, pad_right), FFT / 2, FFT / 2);
        let scale = 1.0 / (FFT as f32).sqrt();
        let mut inp = vec![0f32; FFT];
        let mut out = vec![Complex::new(0f32, 0f32); FFT / 2 + 1];
        for f in 0..FRAMES {
            let start = (f + 2) * HOP;
            for i in 0..FFT { inp[i] = x[start + i] * self.hann[i]; }
            let _ = self.fwd.process(&mut inp, &mut out);
            for b in 0..BINS { let k = (b * FRAMES + f) * stride; spec[re_off + k] = out[b].re * scale; spec[im_off + k] = out[b].im * scale; }
        }
    }

    // Обратное STFT маски одного канала (bins×frames, кадры сдвинуты на 2) → N отсчётов (прибавляются к out)
    fn ispec(&self, freq: &[f32], re_off: usize, im_off: usize, out: &mut [f32], acc: &mut [f32], wsum: &mut [f32]) {
        let frames = FRAMES + 4;
        let len = (frames - 1) * HOP + FFT;
        acc[..len].fill(0.0); wsum[..len].fill(0.0);
        let scale = 1.0 / (FFT as f32).sqrt(); // realfft: обратное без нормировки (×FFT), у Java — /FFT и ×√FFT
        let mut inp = vec![Complex::new(0f32, 0f32); FFT / 2 + 1];
        let mut tmp = vec![0f32; FFT];
        for f in 0..frames {
            inp.fill(Complex::new(0.0, 0.0));
            let sf = f as isize - 2;
            if sf >= 0 && (sf as usize) < FRAMES {
                let sf = sf as usize;
                for b in 0..BINS { inp[b] = Complex::new(freq[re_off + b * FRAMES + sf], freq[im_off + b * FRAMES + sf]); }
                inp[0].im = 0.0; // мнимая часть нулевого бина и бин 2048 — нули (требование обратного преобразования)
            }
            let _ = self.inv.process(&mut inp, &mut tmp);
            let start = f * HOP;
            for i in 0..FFT { if start + i >= len { break; } acc[start + i] += tmp[i] * self.hann[i] * scale; wsum[start + i] += self.hann[i] * self.hann[i]; }
        }
        let off = FFT / 2 + (HOP / 2) * 3;
        for i in 0..N { let w = wsum[off + i]; out[i] += if w > 1e-8 { acc[off + i] / w } else { 0.0 }; }
    }

    // left, right — вся запись; out_dir — куда класть <part>.f32; progress(0…1); cancelled — флаг отмены
    pub fn separate(&mut self, left: &[f32], right: &[f32], out_dir: &Path, hq: bool, cancelled: &AtomicBool, progress: &mut dyn FnMut(f64)) -> Result<(), String> {
        std::fs::create_dir_all(out_dir).map_err(|e| e.to_string())?;
        let total = left.len().min(right.len());
        if total == 0 { return Err("empty".into()); }
        let (stride, passes, maxoff) = if hq { (N / 2, 3usize, SR / 2) } else { (STRIDE, 1usize, SR / 2) };
        let buf_len = N + maxoff;
        let segs = ((total + stride - 1) / stride).max(1);
        let mut wave = vec![0f32; 2 * N];
        let mut spec = vec![0f32; 4 * BINS * FRAMES];
        let mut acc = vec![0f32; (FRAMES + 3) * HOP + FFT];
        let mut wsum = vec![0f32; acc.len()];
        let mut seg = vec![0f32; N];
        let mut sum: Vec<[Vec<f32>; 2]> = Vec::new();
        let mut wt = vec![0f32; buf_len];
        let mut outs: Vec<BufWriter<File>> = Vec::new();
        let mut rnd: u64 = 7;
        let half = stride as f32 * 0.5;
        let win = |i: usize, len: usize| -> f32 { (i as f32 / half).min((len - i) as f32 / half).min(1.0) };
        let shape1 = vec![1i64, 2, N as i64];
        let shape2: Vec<i64> = if self.interleaved { vec![1, 2, BINS as i64, FRAMES as i64, 2] } else { vec![1, 4, BINS as i64, FRAMES as i64] };
        let mut start = 0usize;
        let mut idx = 0usize;
        while start < total {
            for pass in 0..passes {
                if cancelled.load(Ordering::Relaxed) { return Err("cancel".into()); }
                let off = if pass == 0 { 0 } else { rnd = rnd.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); ((rnd >> 33) as usize % maxoff).min(total - start - 1) };
                let at = start + off;
                if at >= total { continue; }
                let len = N.min(total - at);
                wave.fill(0.0);
                wave[..len].copy_from_slice(&left[at..at + len]);
                wave[N..N + len].copy_from_slice(&right[at..at + len]);
                let (l, r) = wave.split_at(N);
                let (l, r) = (l.to_vec(), r.to_vec());
                if self.interleaved { self.spectrum(&l, &mut spec, 0, 1, 2); self.spectrum(&r, &mut spec, 2 * BINS * FRAMES, 2 * BINS * FRAMES + 1, 2); }
                else { self.spectrum(&l, &mut spec, 0, BINS * FRAMES, 1); self.spectrum(&r, &mut spec, 2 * BINS * FRAMES, 3 * BINS * FRAMES, 1); }
                let t1 = Tensor::<f32>::from_array((shape1.clone(), wave.clone())).map_err(|e| e.to_string())?;
                let t2 = Tensor::<f32>::from_array((shape2.clone(), spec.clone())).map_err(|e| e.to_string())?;
                let res = self.session.run(ort::inputs![self.wave_name.as_str() => t1, self.spec_name.as_str() => t2]).map_err(|e| e.to_string())?;
                let (mut time, mut freq): (Option<Vec<f32>>, Option<Vec<f32>>) = (None, None);
                for (_, v) in res.iter() {
                    if let Ok((shape, data)) = v.try_extract_tensor::<f32>() {
                        let d: &[i64] = shape;
                        if d.len() == 4 && d[2] == 2 { self.stems = d[1] as usize; time = Some(data.to_vec()); }
                        else if d.len() == 5 && d[2] == 4 { freq = Some(data.to_vec()); }
                    }
                }
                drop(res);
                let time = time.ok_or("no time output")?;
                if sum.is_empty() {
                    for k in 0..self.stems {
                        sum.push([vec![0f32; buf_len], vec![0f32; buf_len]]);
                        let f = File::create(out_dir.join(format!("{}.f32", parts_of(self.stems)[k]))).map_err(|e| e.to_string())?;
                        outs.push(BufWriter::new(f));
                    }
                }
                for i in 0..len { wt[off + i] += win(i, len); }
                let track_stride = 4 * BINS * FRAMES;
                for k in 0..self.stems {
                    for ch in 0..2 {
                        let t_off = (k * 2 + ch) * N;
                        seg.copy_from_slice(&time[t_off..t_off + N]);
                        if let Some(fq) = &freq { self.ispec(fq, k * track_stride + (ch * 2) * BINS * FRAMES, k * track_stride + (ch * 2 + 1) * BINS * FRAMES, &mut seg, &mut acc, &mut wsum); }
                        let s = &mut sum[k][ch];
                        for i in 0..len { s[off + i] += seg[i] * win(i, len); }
                    }
                }
                progress(((idx as f64 + (pass + 1) as f64 / passes as f64) / segs as f64).min(1.0));
            }
            if sum.is_empty() { start += stride; idx += 1; continue; }
            // готово всё до начала следующего сегмента — в файл; остаток сдвигаем к началу
            let done = stride.min(total - start);
            let mut bytes = Vec::with_capacity(done * 8);
            for k in 0..self.stems {
                bytes.clear();
                for i in 0..done { let w = if wt[i] > 0.0 { wt[i] } else { 1.0 }; bytes.extend_from_slice(&(sum[k][0][i] / w).to_le_bytes()); bytes.extend_from_slice(&(sum[k][1][i] / w).to_le_bytes()); }
                outs[k].write_all(&bytes).map_err(|e| e.to_string())?;
                for ch in 0..2 { let s = &mut sum[k][ch]; s.copy_within(stride..buf_len, 0); s[buf_len - stride..].fill(0.0); }
            }
            wt.copy_within(stride..buf_len, 0); wt[buf_len - stride..].fill(0.0);
            start += stride; idx += 1;
        }
        for o in outs.iter_mut() { o.flush().map_err(|e| e.to_string())?; }
        Ok(())
    }
}
