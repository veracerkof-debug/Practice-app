# Сверка моделей ONNX с оригиналом YourMT3+ на любой записи: токены torch (model_helper, по куску) против алгоритма
# src-tauri/src/notes.rs (пачки кусков, кеш [P,L,2,N,H,DK], выбывание закончивших строк) в onnxruntime.
# Запуск:  python check.py <папка клона Space> <папка с ymt_enc.onnx и ymt_dec.onnx> <запись.wav>
# Ожидается «расхождений 0». Rust-сторона проверяется тем же: YMT_DIR=<папка .onnx> YMT_WAV=<сырой float32 16 кГц>
# cargo test --lib ymt_tokens → rust_tokens.json рядом с моделями (сравнить с ref_tokens.json отсюда).
import sys, os, types, json, time
SPACE, ONNX, WAV = (os.path.abspath(a) for a in sys.argv[1:4])
class _N:
    def __getattr__(self, k):
        if k.startswith('__'): raise AttributeError(k)
        return _N()
    def __call__(self, *a, **k): return _N()
def _wb(k):
    if k.startswith('__'): raise AttributeError(k)
    return _N()
wb = types.ModuleType('wandb'); wb.__getattr__ = _wb; sys.modules['wandb'] = wb
sys.path.append(os.path.join(SPACE, 'amt/src')); sys.path.append(SPACE)
os.chdir(os.path.join(SPACE, 'amt'))
if not os.path.exists('amt/logs'): os.makedirs('amt', exist_ok=True); os.symlink('../logs', 'amt/logs')
sys.argv = ['x']
import numpy as np, torch, soundfile as sf, onnxruntime as ort
from math import gcd
from scipy.signal import resample_poly
from model_helper import load_model_checkpoint

SEG, K, L, H, DK, MAXLEN, B = 32767, 13, 8, 6, 64, 1024, 4
d, sr = sf.read(WAV, dtype='float32', always_2d=True); d = d.mean(1)
g = gcd(16000, sr); x = resample_poly(d, 16000 // g, sr // g).astype(np.float32)
n = -(-len(x) // SEG); x = np.pad(x, (0, n * SEG - len(x))); segs = x.reshape(n, 1, SEG)

ck = "mc13_256_g4_all_v7_mt3f_sqr_rms_moe_wf4_n8k2_silu_rope_rp_b36_nops@last.ckpt"
args = [ck, '-p', '2024', '-tk', 'mc13_full_plus_256', '-dec', 'multi-t5', '-nl', '26', '-enc', 'perceiver-tf', '-sqr', '1', '-ff', 'moe', '-wf', '4', '-nmoe', '8', '-kmoe', '2', '-act', 'silu', '-epe', 'rope', '-rp', '1', '-ac', 'spec', '-hop', '300', '-atc', '1', '-pr', '32']
m = load_model_checkpoint(args=args, device='cpu')
t0 = time.time()
with torch.no_grad(): toks, _ = m.inference_file(bsz=1, audio_segments=torch.tensor(segs))
ref = [[[int(v) for v in b[0, c]] for c in range(K)] for b in toks]
print('torch', round(time.time() - t0, 1), 'с')

so = ort.SessionOptions(); so.intra_op_num_threads = 4
enc = ort.InferenceSession(os.path.join(ONNX, 'ymt_enc.onnx'), so); dec = ort.InferenceSession(os.path.join(ONNX, 'ymt_dec.onnx'), so)
t0 = time.time(); out = [None] * n
for s0 in range(0, n, B):
    b = min(B, n - s0)
    cross = enc.run(None, {'wave': segs[s0:s0 + b]})[0]
    rows = b * K; got = [[] for _ in range(rows)]; alive = list(range(rows))
    past = np.zeros((0, L, 2, rows, H, DK), np.float32); ids = np.zeros((rows, 1), np.int64)
    for step in range(MAXLEN - 1):
        nx, kv = dec.run(None, {'ids': ids, 'past': past, 'cross': cross}); nx = nx.reshape(-1)
        for j, a in enumerate(alive): got[a].append(int(nx[j]))
        past = np.concatenate([past, kv], 0); keep = nx != 1
        if not keep.all():
            alive = [a for a, k in zip(alive, keep) if k]
            if not alive: break
            past = past[:, :, :, keep]; cross = cross[:, :, keep]; nx = nx[keep]
        ids = nx.reshape(-1, 1).astype(np.int64)
    for i in range(b): out[s0 + i] = got[i * K:(i + 1) * K]
print('onnx', round(time.time() - t0, 1), 'с, кусков', n)
bad = 0
for s in range(n):
    for c in range(K):
        r = ref[s][c]; e = r.index(1) + 1 if 1 in r else len(r)
        bad += r[:e] != out[s][c][:e]
print('расхождений', bad, 'из', n * K)
json.dump(ref, open(os.path.join(ONNX, 'ref_tokens.json'), 'w'))
