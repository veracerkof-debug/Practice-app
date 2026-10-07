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

// onHands(hands, t) — каждый кадр: hands — [{ lm: 21 точка с зеркальным x }]
export async function startHands(video, onHands) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { const e = new Error('nocam'); e.reason = 'nocam'; throw e; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
  } catch (e) { e.reason = reasonOf(e); throw e; }
  let lm;
  try { lm = await landmarker(); } catch (e) { stream.getTracks().forEach((tr) => tr.stop()); e.reason = 'model'; throw e; }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => {});

  let stopped = false, lastT = -1, raf = 0;
  const loop = () => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastT) {
      lastT = video.currentTime;
      const t = performance.now();
      let r = null;
      try { r = lm.detectForVideo(video, t); } catch { /* кадр пропускается */ }
      const hands = (r && r.landmarks ? r.landmarks : []).map((pts) => ({ lm: pts.map((p) => ({ x: 1 - p.x, y: p.y })) }));
      onHands(hands, t);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((tr) => tr.stop());
      video.srcObject = null;
    },
  };
}
