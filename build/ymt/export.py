# YourMT3+ (Chang и др., 2024; код GPL-3.0, веса Apache-2.0) → две модели ONNX для src-tauri/src/notes.rs.
# Источник — Space mimbres/YourMT3 на Hugging Face (клон с LFS: amt/src, model_helper.py, контрольная точка
# amt/logs/2024/mc13_256_g4_all_v7_mt3f_sqr_rms_moe_wf4_n8k2_silu_rope_rp_b36_nops/checkpoints/last.ckpt).
# Нужны torch, torchaudio, transformers 4.45, lightning, einops, onnx, onnxruntime. wandb (сетевая телеметрия
# обучения) не ставится — подменяется пустым модулем.
# Запуск:  python export.py <папка клона Space> <куда положить .onnx>
# Что меняется против оригинала (результат тот же, токен в токен — проверка в конце и build/ymt/check.py):
#  — спектр |STFT| свёрткой с базисом косинусов и синусов (ONNX не экспортирует комплексный STFT);
#  — смесь экспертов плотно: все 8 экспертов, вес невыбранных — ноль (вместо NonZero и выборки по индексам);
#  — шаг декодера вручную с кешем [P,L,2,N,H,DK] (позиции снаружи — шаг дописывается в конец буфера);
#    ключи и значения перекрёстного внимания считает кодировщик один раз на кусок.
import sys, os, types
SPACE, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
os.makedirs(OUT, exist_ok=True)
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
if not os.path.exists('amt/logs'): os.makedirs('amt', exist_ok=True); os.symlink('../logs', 'amt/logs')  # оригинал ищет amt/logs от amt/
sys.argv = ['x']
import numpy as np, torch
from model_helper import load_model_checkpoint
import torch.nn as nn, torch.nn.functional as F
ck = "mc13_256_g4_all_v7_mt3f_sqr_rms_moe_wf4_n8k2_silu_rope_rp_b36_nops@last.ckpt"
args = [ck, '-p', '2024', '-tk', 'mc13_full_plus_256', '-dec', 'multi-t5', '-nl', '26', '-enc', 'perceiver-tf', '-sqr', '1', '-ff', 'moe', '-wf', '4', '-nmoe', '8', '-kmoe', '2', '-act', 'silu', '-epe', 'rope', '-rp', '1', '-ac', 'spec', '-hop', '300', '-atc', '1', '-pr', '32']
m = load_model_checkpoint(args=args, device='cpu').eval()
for p in m.parameters(): p.requires_grad_(False)
PE = m.decoder.decoder.additive_pe.weight.detach().clone()
dec = m.decoder.decoder  # T5StackYMT3
K = m.decoder.num_channels
blocks = dec.block
H = blocks[0].layer[0].SelfAttention.n_heads; DK = blocks[0].layer[0].SelfAttention.key_value_proj_dim
print('K', K, 'H', H, 'DK', DK, 'layers', len(blocks))

NF, HOP = 2048, 300
_n = torch.arange(NF, dtype=torch.float64); _k = torch.arange(1, NF // 2 + 1, dtype=torch.float64)
_w = torch.hann_window(NF, dtype=torch.float64)
_ang = 2 * np.pi * _k[:, None] * _n[None, :] / NF
BASIS = torch.cat([torch.cos(_ang) * _w, -torch.sin(_ang) * _w]).float()[:, None, :]  # (2048,1,2048), без DC
def spec(x):
    # |STFT| как в torchaudio (center, reflect), без DC; log; minmax по всему кадру — STFT свёрткой для ONNX
    x = F.pad(x, (NF // 2, NF // 2), mode='reflect')
    y = F.conv1d(x, BASIS, stride=HOP)  # (B,2048,T)
    re, im = y[:, :NF // 2], y[:, NF // 2:]
    mag = torch.sqrt(re * re + im * im).transpose(1, 2)  # (B,T,F)
    l = torch.log(mag + 1e-5)
    mx = l.amax(dim=(1, 2), keepdim=True); mn = l.amin(dim=(1, 2), keepdim=True)
    return (l - mn) / (mx - mn + 0.008)

from model.ff_layer import MixtralSparseMoeBlock
def dense_moe(self, h):
    # то же, что маршрутизация top-2, но плотно: все эксперты, вес нуль у невыбранных — экспортируется без NonZero
    b, t, d = h.shape; h = h.reshape(-1, d)
    lg = self.gate(h); w = F.softmax(lg, dim=1, dtype=torch.float)
    v, _ = torch.topk(w, self.top_k, dim=-1)
    w = w * (w >= v[:, -1:]).to(w.dtype); w = w / w.sum(-1, keepdim=True)
    out = 0
    for e, ex in enumerate(self.experts): out = out + ex(h) * w[:, e:e + 1]
    return out.reshape(b, t, d), lg
_orig_moe = MixtralSparseMoeBlock.forward

class Enc(nn.Module):
    # волна (B,1,32767) → ключи и значения перекрёстного внимания всех слоёв (L,2,B*K,H,T,DK)
    def forward(self, x):
        x = spec(x); x = m.pre_encoder(x)
        e = m.encoder(inputs_embeds=x)["last_hidden_state"]
        e = m.pre_decoder(e)  # (B,K,T,D)
        b, k, t, d = e.shape
        e = e.reshape(b * k, t, d)
        out = []
        for blk in blocks:
            a = blk.layer[1].EncDecAttention
            kk = a.k(e).view(b * k, t, H, DK).transpose(1, 2)
            vv = a.v(e).view(b * k, t, H, DK).transpose(1, 2)
            out.append(torch.stack([kk, vv]))
        return torch.stack(out)

def attn(a, q_in, k, v):
    n = q_in.shape[0]
    q = a.q(q_in).view(n, 1, H, DK).transpose(1, 2)  # (N,H,1,DK)
    s = torch.matmul(q, k.transpose(2, 3))  # T5: без деления на корень
    p = F.softmax(s.float(), dim=-1).type_as(s)
    o = torch.matmul(p, v).transpose(1, 2).reshape(n, 1, H * DK)
    return a.o(o)

class Step(nn.Module):
    # один шаг: id (N,1), прошлое (L,2,N,H,P,DK), перекрёстное (L,2,N,H,T,DK) → следующий id (N,1), новые k,v (L,2,N,H,1,DK)
    def forward(self, ids, past, cross):
        # past: (P,L,2,N,H,DK) — позиции снаружи: новый шаг дописывается в конец без перекладки
        P = past.shape[0]
        h = m.embed_tokens(ids)  # (N,1,D)
        pe = PE[P:P + 1]
        h = h + pe
        news = []
        for i, blk in enumerate(blocks):
            sa = blk.layer[0]
            x = sa.layer_norm(h)
            a = sa.SelfAttention
            n = x.shape[0]
            kn = a.k(x).view(n, 1, H, DK).transpose(1, 2); vn = a.v(x).view(n, 1, H, DK).transpose(1, 2)
            kk = torch.cat([past[:, i, 0].permute(1, 2, 0, 3), kn], 2); vv = torch.cat([past[:, i, 1].permute(1, 2, 0, 3), vn], 2)
            h = h + attn(a, x, kk, vv)
            news.append(torch.stack([kn[:, :, 0], vn[:, :, 0]]))  # (2,N,H,DK)
            ca = blk.layer[1]
            h = h + attn(ca.EncDecAttention, ca.layer_norm(h), cross[i, 0], cross[i, 1])
            h = blk.layer[2](h)  # T5LayerFF: норма, gated-gelu, остаток
        h = dec.final_layer_norm(h)
        lg = m.lm_head(h)  # (N,1,V)
        return lg.argmax(-1), torch.stack(news)[None]  # (1,L,2,N,H,DK)

enc, step = Enc().eval(), Step().eval()
# проверка: свой шаговый цикл против оригинального task_cond_dec_generate
sr = 16000; tt = np.arange(32767) / sr  # проверочный звук: гамма затухающими звуками с гармониками и бас
d = np.zeros_like(tt)
for i, p in enumerate([60, 62, 64, 65, 67, 69, 71, 72]):
    n = tt >= i * 0.25; f = 440 * 2 ** ((p - 69) / 12); e = np.exp(-(tt[n] - i * 0.25) * 4)
    d[n] += sum(np.sin(2 * np.pi * f * k * tt[n]) / k ** 1.5 for k in range(1, 8)) * e * 0.3
d += 0.35 * (np.sin(2 * np.pi * 65.4 * tt) + 0.3 * np.sin(4 * np.pi * 65.4 * tt)) * np.exp(-tt * 1.5)
x = torch.tensor(d, dtype=torch.float32).reshape(1, 1, 32767)
with torch.no_grad():
    print('spec diff', (spec(x) - m.spectrogram(x)).abs().max().item())
    ref = m.inference(x)  # (1,K,L)
    MixtralSparseMoeBlock.forward = dense_moe
    cross = enc(x)
    N = cross.shape[2]
    past = torch.zeros(0, len(blocks), 2, N, H, DK)
    ids = torch.zeros(N, 1, dtype=torch.long); seq = [ids]
    for s in range(ref.shape[-1]):
        ids, kv = step(ids, past, cross); past = torch.cat([past, kv], 0); seq.append(ids)
    mine = torch.cat(seq, 1)[:, 1:]  # без <bos>
print('ref', ref.shape, 'mine', mine.shape)
r = ref[0]; L = min(r.shape[1], mine.shape[1])
eos_ok = True
for c in range(K):
    rr = r[c].tolist(); mm = mine[c, :L].tolist()
    e = rr.index(1) if 1 in rr else len(rr)
    same = rr[:e + 1] == mm[:e + 1]
    eos_ok &= same
    print(c, 'len', e, 'same', same, rr[:12])
print('ALL SAME', eos_ok)

with torch.no_grad():
    torch.onnx.export(enc, (x,), OUT + '/ymt_enc.onnx', input_names=['wave'], output_names=['cross'],
                      dynamic_axes={'wave': {0: 'b'}, 'cross': {2: 'n'}}, opset_version=17, dynamo=False)
    p1 = torch.zeros(3, len(blocks), 2, N, H, DK)
    torch.onnx.export(step, (torch.zeros(N, 1, dtype=torch.long), p1, cross), OUT + '/ymt_dec.onnx',
                      input_names=['ids', 'past', 'cross'], output_names=['next', 'kv'],
                      dynamic_axes={'ids': {0: 'n'}, 'past': {0: 'p', 3: 'n'}, 'cross': {2: 'n'}, 'next': {0: 'n'}, 'kv': {3: 'n'}},
                      opset_version=17, dynamo=False)
print('exported')
