// Камера и распознавание рук. MediaPipe Hand Landmarker (Apache-2.0) работает целиком на устройстве: движок
// (WebAssembly) и модель лежат в приложении (build/mediapipe.js), кадры никуда не отправляются и не сохраняются.
// Загружается только когда камеру включили.

const asset = (p) => new URL('mediapipe/' + p, document.baseURI).href;
let landP = null;

async function landmarker() {
  if (landP) return landP;
  landP = (async () => {
    const { HandLandmarker } = await import('@mediapipe/tasks-vision');
    const files = { wasmLoaderPath: asset('vision_wasm_internal.js'), wasmBinaryPath: asset('vision_wasm_internal.wasm') };
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: asset('hand_landmarker.task'), delegate }, runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    // видеокарта быстрее; если её нет (или WebGL недоступен) — процессор
    try { return await HandLandmarker.createFromOptions(files, opts('GPU')); } catch { return HandLandmarker.createFromOptions(files, opts('CPU')); }
  })().catch((e) => { landP = null; throw e; });
  return landP;
}

// Ошибка камеры понятным словом: denied | nocam | fail
const reasonOf = (e) => (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied'
  : e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') ? 'nocam' : 'fail');

// onHands(hands, t) — каждый кадр: hands — [{ lm: 21 точка с зеркальным x, w: объёмные точки, ar }].
// facing: 'user' — передняя камера, 'environment' — задняя. Обе смотрят на играющего, поэтому руки и картинка
// отражаются одинаково (правая рука — справа), и всё, что считается по рукам, от камеры не зависит
export async function startHands(video, onHands, { facing = 'user' } = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { const e = new Error('nocam'); e.reason = 'nocam'; throw e; }
  // сначала камера и картинка (человек сразу видит себя), модель — следом: её запуск занимает поток,
  // и если начать одновременно, первый кадр ждёт модель. Руки начинают ловиться, как только модель готова.
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
  } catch (e) { e.reason = reasonOf(e); throw e; }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.play().catch(() => {});
  await new Promise((ok) => { if (video.readyState >= 2) ok(); else { video.addEventListener('loadeddata', ok, { once: true }); setTimeout(ok, 700); } });
  await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0))); // дать кадру нарисоваться
  const lmP = landmarker();
  let lm;
  try { lm = await lmP; } catch (e) { stream.getTracks().forEach((tr) => tr.stop()); video.srcObject = null; e.reason = 'model'; throw e; }

  let stopped = false, lastT = -1, raf = 0;
  const loop = () => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastT) {
      lastT = video.currentTime;
      const t = performance.now();
      let r = null;
      try { r = lm.detectForVideo(video, t); } catch { /* кадр пропускается */ }
      // lm — точки в кадре (доли, x зеркальный), w — объёмные точки в метрах (тоже зеркально), ar — пропорции кадра
      const ar = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
      const world = (r && r.worldLandmarks) || [];
      const hands = (r && r.landmarks ? r.landmarks : []).map((pts, i) => ({
        lm: pts.map((p) => ({ x: 1 - p.x, y: p.y })),
        w: world[i] ? world[i].map((p) => ({ x: -p.x, y: p.y, z: p.z })) : null,
        ar,
      }));
      onHands(hands, t);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const track = stream.getVideoTracks()[0];
  const caps = (track && track.getCapabilities) ? track.getCapabilities() : {};
  let torchOn = false;
  const torchC = () => (caps.torch ? { advanced: [{ torch: torchOn }] } : {});
  return {
    // фонарик (вспышка задней камеры в режиме света); у передней его обычно нет
    hasTorch: !!caps.torch,
    torch(on) {
      if (!caps.torch) return Promise.resolve(false);
      torchOn = !!on;
      return track.applyConstraints({ advanced: [{ torch: torchOn }] }).then(() => true, () => false);
    },
    // крупный кадр (режим «Гитара»: гриф целиком — далеко, при 640 точках он слишком тонкий) или обычный
    hd(on) {
      if (!track || !track.applyConstraints) return Promise.resolve();
      // фонарик — тем же вызовом: новые ограничения без него погасили бы свет
      return track.applyConstraints({ ...(on ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 640 }, height: { ideal: 480 } }), frameRate: { ideal: 30 }, ...torchC() }).catch(() => {});
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((tr) => tr.stop());
      video.srcObject = null;
    },
  };
}
