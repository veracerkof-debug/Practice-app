// Звуковой движок: единый AudioContext, шины, микшер (ROADMAP, этап 1).
let ctx = null;

export function audioContext() {
  ctx ??= new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}
