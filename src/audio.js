/* ══════════ 古琴音效（Karplus-Strong 拨弦合成，五声音阶） ══════════ */
import { $ } from "./util.js";

let audioCtx = null, sfxMaster = null, muted = false;

function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    audioCtx = new AC();
    sfxMaster = audioCtx.createGain();
    sfxMaster.gain.value = muted ? 0 : 0.5;
    sfxMaster.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

const PENTA = [130.8, 146.8, 164.8, 196.0, 220.0, 261.6, 293.7, 329.6]; // 宫商角徵羽

export function pluck(freq, when = 0, gain = 0.8, dur = 1.5, lpMul = 6, dest = null) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / freq));
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    ring[idx] = 0.5 * (cur + ring[(idx + 1) % N]) * 0.996;
    out[i] = cur;
    idx = (idx + 1) % N;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
  lp.frequency.value = Math.min(freq * lpMul, 4200);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(lp); lp.connect(g); g.connect(dest || sfxMaster);
  src.start(t0); src.stop(t0 + dur);
}

function strum(freqs, gap = 0.06, gain = 0.7) {
  freqs.forEach((f, i) => pluck(f, i * gap, gain));
}

export function thud(when = 0, gain = 0.8) {
  const ctx = ensureAudio(); if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(120, t0);
  o.frequency.exponentialRampToValueAtTime(45, t0 + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
  o.connect(g); g.connect(sfxMaster);
  o.start(t0); o.stop(t0 + 0.32);
}

function bell(freq, when = 0, gain = 0.4, dur = 2.0) {
  const ctx = ensureAudio(); if (!ctx) return;
  const t0 = ctx.currentTime + when;
  [[1, 1], [2.76, 0.45], [5.4, 0.2]].forEach(([m, a]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = freq * m;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * a, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(sfxMaster);
    o.start(t0); o.stop(t0 + dur);
  });
}

/* 兵刃相击的铛声：带通噪声 + 高频余韵 */
function clang(when = 0) {
  const ctx = ensureAudio(); if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
  src.connect(bp); bp.connect(g); g.connect(sfxMaster);
  src.start(t0);
  bell(1568, when, 0.1, 0.7);
}

/* 八招各一色：吐纳绵长、轻功上扬、遁地沉郁、袖箭短促、
   剑风连掠、震山掌重击、金钟罩钟鸣、万剑归宗扫弦 */
export function skillSound(name, when = 0) {
  switch (name) {
    case "吐纳": pluck(196, when, .3, 2.0, 3); pluck(392, when + .06, .1, 1.6, 3); break;
    case "轻功": pluck(523.3, when, .4, .6, 9); pluck(659.3, when + .07, .35, .6, 9); pluck(784, when + .14, .3, .7, 9); break;
    case "遁地": pluck(98, when, .65, .9, 2.2); pluck(73.4, when + .1, .45, 1.1, 2); break;
    case "袖箭": pluck(1318.5, when, .45, .22, 12); pluck(880, when + .03, .25, .28, 10); break;
    case "剑风": [293.7, 370, 440, 587.3].forEach((f, i) => pluck(f, when + i * .05, .45, .6, 8)); break;
    case "震山掌": thud(when, .8); pluck(65.4, when, .8, 1.1, 2.5); break;
    case "金钟罩": bell(587.3, when, .4, 2.0); bell(880, when + .1, .15, 1.6); break;
    case "万剑归宗":
      PENTA.forEach((f, i) => pluck(f, when + i * .04, .7, 1.2, 9));
      thud(when + .35, .9); bell(1174.7, when + .42, .22, 1.8);
      break;
  }
}

export const SFX = {
  tap()     { pluck(PENTA[2], 0, 0.4, 0.8); },
  invalid() { pluck(87.3, 0, 0.5, 0.5); },
  win()     { strum([PENTA[0], PENTA[2], PENTA[4], PENTA[5], PENTA[7]], 0.09, 0.8); },
  lose()    { [PENTA[4], PENTA[2], PENTA[1], PENTA[0]].forEach((f, i) => pluck(f, i * 0.15, 0.6, 1.3)); },
  draw()    { strum([PENTA[2], PENTA[4]], 0.1, 0.6); },
  start()   { strum([PENTA[0], PENTA[4], PENTA[2]], 0.07, 0.7); },
};

export function toggleMute() {
  muted = !muted;
  if (sfxMaster) sfxMaster.gain.value = muted ? 0 : 0.5;
  $("btn-sound").textContent = muted ? "静" : "音";
  if (!muted) SFX.tap();
}

/* ══════════ 主页背景音乐 · 古琴即兴散韵 ══════════ */
let bgmOn = false, bgmTimer = null, bgmGain = null, bgmLast = -1;
const BGM_NOTES = [130.8, 146.8, 164.8, 196.0, 220.0, 261.6, 293.7];

export function isBgmOn() { return bgmOn; }

function ensureBgmGain() {
  const ctx = ensureAudio();
  if (!ctx) return null;
  if (!bgmGain) {
    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0;
    bgmGain.connect(sfxMaster);
  }
  return bgmGain;
}

function bgmPhrase() {
  if (!bgmOn) return;
  let t = 0.15;
  const n = 2 + Math.floor(Math.random() * 3);   // 一句两三音至四音
  for (let i = 0; i < n; i++) {
    let idx;
    do { idx = Math.floor(Math.random() * BGM_NOTES.length); } while (idx === bgmLast);
    bgmLast = idx;
    const f = BGM_NOTES[idx];
    pluck(f, t, 0.22 + Math.random() * 0.08, 2.6 + Math.random(), 3, bgmGain);
    if (Math.random() < 0.3) pluck(f * 2, t + 0.07, 0.06, 1.8, 3, bgmGain); // 泛音点缀
    t += 0.55 + Math.random() * 0.9;
  }
  if (Math.random() < 0.35) pluck(65.4, t, 0.16, 3.6, 2, bgmGain);           // 低音宫音铺底
  bgmTimer = setTimeout(bgmPhrase, (t + 1.6 + Math.random() * 1.8) * 1000);
}

export function startBgm() {
  if (bgmOn) return;
  const g = ensureBgmGain();
  if (!g) return;
  bgmOn = true;
  const t0 = audioCtx.currentTime;
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(g.gain.value, t0);
  g.gain.linearRampToValueAtTime(1, t0 + 1.2);
  bgmPhrase();
}

export function stopBgm() {
  if (!bgmOn) return;
  bgmOn = false;
  if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = null; }
  if (bgmGain && audioCtx) {
    const t0 = audioCtx.currentTime;
    bgmGain.gain.cancelScheduledValues(t0);
    bgmGain.gain.setValueAtTime(bgmGain.gain.value, t0);
    bgmGain.gain.linearRampToValueAtTime(0, t0 + 0.5);
  }
}

export { clang };
