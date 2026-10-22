# Модели аккордов компьютера: ChordMini (MIT, github.com/ptnghia-j/ChordMini) → ONNX для src/audio/mir.worker.js.
# Берутся checkpoints/btc_model_best.pth (BTC CL) и checkpoints/2e1d_model_best.pth (ChordNet 2E1D CL); нормировка
# признаков (mean/std из контрольной точки) вшивается в граф, выход — логиты [b, 108, 170] (словарь ChordMini).
# Запуск: из корня клона ChordMini, нужны torch, onnx, onnxruntime:  python export.py  → btc_cl.onnx, chordnet_cl.onnx
# Проверка: выход ONNX против torch на случайном входе (расхождение ~1e-5). Готовые файлы — в ветке models
# (зеркало для сборок), ссылки и sha256 — build/models.json.
import sys, torch, numpy as np
sys.path.insert(0, '.')
from src.utils.hparams import HParams
from src.models.common.checkpoint_loading import load_model

cfg = HParams.load('config/ChordMini.yaml')

class Wrap(torch.nn.Module):
    def __init__(self, m, mean, std):
        super().__init__(); self.m = m; self.mean = float(mean); self.std = float(std)
    def forward(self, x):
        y = self.m((x - self.mean) / (self.std + 1e-8))
        return y[0] if isinstance(y, (tuple, list)) else y  # ChordNet отдаёт ещё и восстановление признаков

for typ, ck, out in [('BTC', 'checkpoints/btc_model_best.pth', 'btc_cl.onnx'), ('ChordNet', 'checkpoints/2e1d_model_best.pth', 'chordnet_cl.onnx')]:
    m, mean, std = load_model(ck, typ, cfg, 'cpu')
    w = Wrap(m.eval(), mean, std).eval()
    x = torch.randn(4, 108, 144) * 2 - 2.3
    with torch.no_grad(): y = w(x)
    torch.onnx.export(w, (x,), out, input_names=['features'], output_names=['logits'], dynamic_axes={'features': {0: 'b'}, 'logits': {0: 'b'}}, opset_version=17, dynamo=False)
    import onnxruntime as ort
    yo = ort.InferenceSession(out).run(None, {'features': x.numpy()})[0]
    print(out, 'расхождение с torch', float(np.abs(yo - y.numpy()).max()))
