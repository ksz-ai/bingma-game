/* ══════════ 特效：招式动画、伤害数字、相抵碰撞 ══════════ */
import { $ } from "./util.js";
import { S } from "./state.js";

export function spawnDmgFx() {
  [["player", S.report.pd], ["ai", S.report.ad]].forEach(([side, dmg]) => {
    if (dmg <= 0) return;
    const tok = $(side === "player" ? "tok-p" : "tok-a");
    const el = document.createElement("div");
    el.className = "dmgnum";
    el.textContent = "-" + dmg;
    tok.appendChild(el);
    setTimeout(() => el.remove(), 1300);
    const ink = document.createElement("div");
    ink.className = "fx-ink";
    tok.appendChild(ink);
    setTimeout(() => ink.remove(), 850);
  });
}

/* ══════════ 招式特效：依招式名生成对应动画 ══════════ */
const other = s => (s === "player" ? "ai" : "player");

function tokCenter(side) {
  const c = $(side === "player" ? "tok-p" : "tok-a").querySelector(".circle").getBoundingClientRect();
  const a = $("arena").getBoundingClientRect();
  return { x: c.left + c.width / 2 - a.left, y: c.top + c.height / 2 - a.top };
}

function zoneY(pos) {
  return { sky: 0.17, ground: 0.5, underground: 0.83 }[pos] * $("arena").clientHeight;
}

function addFx(el, x, y, life) {
  el.classList.add("skfx");
  el.style.left = x + "px";
  el.style.top = y + "px";
  $("arena").appendChild(el);
  setTimeout(() => el.remove(), life);
}

function shakeArena() {
  const a = $("arena");
  a.classList.remove("arena-shake");
  void a.offsetWidth;
  a.classList.add("arena-shake");
  setTimeout(() => a.classList.remove("arena-shake"), 460);
}

/* 吐纳 · 气旋内聚，白雾升腾 */
function fxTuna(side) {
  const p = tokCenter(side);
  const ring = document.createElement("div");
  ring.className = "fx-gather";
  addFx(ring, p.x, p.y, 1250);
  for (let i = 0; i < 3; i++) {
    const w = document.createElement("div");
    w.className = "fx-wisp";
    w.style.animationDelay = (0.12 + i * 0.22) + "s";
    addFx(w, p.x + (i - 1) * 17, p.y + 6, 2100);
  }
}

/* 轻功 · 墨痕弧线，掠影而上 */
function fxLeap(side) {
  const a = $("arena");
  const from = tokCenter(side);
  const to = { x: from.x, y: zoneY(S.gs[side].pos) };
  const dir = side === "player" ? 1 : -1;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "fx-trail");
  svg.setAttribute("viewBox", "0 0 " + a.clientWidth + " " + a.clientHeight);
  const path = document.createElementNS(ns, "path");
  const cx = (from.x + to.x) / 2 - dir * 46;
  const cy = Math.min(from.y, to.y) - 26;
  path.setAttribute("d", "M" + from.x + "," + from.y + " Q" + cx + "," + cy + " " + to.x + "," + to.y);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "rgba(25,23,20,.6)");
  path.setAttribute("stroke-width", "3");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  a.appendChild(svg);
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  path.animate(
    [
      { strokeDashoffset: len + "px", opacity: 0.85 },
      { strokeDashoffset: "0px", opacity: 0.85, offset: 0.55 },
      { strokeDashoffset: "0px", opacity: 0 },
    ],
    { duration: 750, easing: "ease-out", fill: "forwards" }
  );
  setTimeout(() => svg.remove(), 820);
}

/* 遁地 · 涟漪荡开，水珠四溅 */
function fxDive(side) {
  const from = tokCenter(side);
  const surfY = zoneY("underground") - $("arena").clientHeight * 0.09;
  for (let i = 0; i < 3; i++) {
    const r = document.createElement("div");
    r.className = "fx-ripple";
    const s = 46 + i * 18;
    r.style.width = s + "px";
    r.style.height = s * 0.32 + "px";
    r.style.animationDelay = (i * 0.14) + "s";
    addFx(r, from.x, surfY, 1500);
  }
  for (let i = 0; i < 5; i++) {
    const d = document.createElement("div");
    d.className = "fx-drop";
    d.style.setProperty("--dx", (Math.random() * 44 - 22) + "px");
    d.style.setProperty("--dy", (-14 - Math.random() * 22) + "px");
    d.style.animationDelay = (Math.random() * 0.12) + "s";
    addFx(d, from.x + (Math.random() * 24 - 12), surfY, 950);
  }
}

/* 袖箭 · 一线寒芒直取要害，落空则掠影而过（只打平地，不追位移目标） */
function fxDart(side) {
  const foeSide = other(side);
  const gy = zoneY("ground");
  const from = { x: tokCenter(side).x, y: gy };
  const to = { x: tokCenter(foeSide).x, y: gy };
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const dart = document.createElement("div");
  dart.className = "fx-dart";
  dart.style.setProperty("--ang", Math.atan2(dy, dx) * 180 / Math.PI + "deg");
  const hit = !S.clashed && S.gs[foeSide].pos === "ground";
  dart.style.setProperty("--dist", (hit ? dist : dist + 80) + "px");
  if (!hit) dart.classList.add("miss");
  addFx(dart, from.x, from.y, 800);
  if (hit) {
    setTimeout(() => {
      const h = document.createElement("div");
      h.className = "fx-hit";
      addFx(h, to.x, to.y, 550);
    }, 280);
  }
}

/* 剑风 · 弧月剑气连掠 */
function fxSlash(side) {
  const from = tokCenter(side), to = tokCenter(other(side));
  const dx = to.x - from.x, dy = to.y - from.y;
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("div");
    s.className = "fx-slash";
    const size = 64 + i * 16;
    s.style.width = size + "px";
    s.style.height = size + "px";
    s.style.setProperty("--r0", (i * 40 - 30) + "deg");
    s.style.setProperty("--r1", (i * 40 + 110) + "deg");
    s.style.animationDelay = (i * 0.07) + "s";
    addFx(s, from.x + dx * (0.34 + i * 0.17), from.y + dy * (0.34 + i * 0.17) - 6, 950);
  }
  for (let i = 0; i < 2; i++) {
    const st = document.createElement("div");
    st.className = "fx-streak";
    st.style.width = Math.abs(dx) * 0.7 + "px";
    st.style.setProperty("--dx", dx + "px");
    st.style.animationDelay = (0.05 + i * 0.1) + "s";
    addFx(st, (from.x + to.x) / 2, from.y + dy * (0.4 + i * 0.25) + (i ? 10 : -10), 850);
  }
}

/* 震山掌 · 震波扩散，地动山摇 */
function fxPalm(side) {
  if (S.clashed) return; /* 相抵时由 fxClash 表现碰撞 */
  const to = tokCenter(other(side));
  [[0, 60], [0.12, 92]].forEach(([delay, size]) => {
    const s = document.createElement("div");
    s.className = "fx-shock";
    s.style.width = size + "px";
    s.style.height = size + "px";
    s.style.animationDelay = delay + "s";
    addFx(s, to.x, to.y, 1050);
  });
  const q = document.createElement("div");
  q.className = "fx-quake";
  q.style.width = "130px";
  q.style.height = "46px";
  addFx(q, to.x, to.y + 26, 900);
  const h = document.createElement("div");
  h.className = "fx-hit";
  addFx(h, to.x, to.y, 550);
  shakeArena();
}

/* 金钟罩 · 金钟覆体，光圈外扩 */
function fxBell(side) {
  const p = tokCenter(side);
  const dome = document.createElement("div");
  dome.className = "fx-belldome";
  addFx(dome, p.x, p.y, 1400);
  [0, 0.25].forEach(delay => {
    const r = document.createElement("div");
    r.className = "fx-bellring";
    r.style.width = "92px";
    r.style.height = "92px";
    r.style.animationDelay = delay + "s";
    addFx(r, p.x, p.y, 1550);
  });
}

/* 万剑归宗 · 剑雨倾天，白光炸裂 */
function fxWanjian(side) {
  const a = $("arena");
  const to = tokCenter(other(side));
  const flash = document.createElement("div");
  flash.className = "fx-flash";
  flash.style.setProperty("--fx", (to.x / a.clientWidth * 100) + "%");
  flash.style.setProperty("--fy", (to.y / a.clientHeight * 100) + "%");
  addFx(flash, 0, 0, 850);
  for (let i = 0; i < 12; i++) {
    const s = document.createElement("div");
    s.className = "fx-sword";
    s.style.height = (26 + Math.random() * 18) + "px";
    s.style.setProperty("--fall", -(to.y + 70 + Math.random() * 60) + "px");
    s.style.setProperty("--delay", (Math.random() * 0.3) + "s");
    s.style.setProperty("--dur", (0.55 + Math.random() * 0.25) + "s");
    addFx(s, to.x + (Math.random() * 170 - 85), to.y + (Math.random() * 30 - 15), 1600);
  }
  setTimeout(() => {
    const h = document.createElement("div");
    h.className = "fx-hit";
    h.style.width = "70px";
    h.style.height = "70px";
    addFx(h, to.x, to.y, 600);
    shakeArena();
  }, 420);
}

/* 相抵 · 两招相撞：交叉剑痕 + 火星四溅 + 朱砂"抵"字 */
export function fxClash() {
  const a = tokCenter("player"), b = tokCenter("ai");
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  [45, -45].forEach((rot, i) => {
    const x = document.createElement("div");
    x.className = "fx-clash-x";
    x.style.setProperty("--rot", rot + "deg");
    x.style.animationDelay = (i * 0.04) + "s";
    addFx(x, mx, my, 750);
  });
  const ring = document.createElement("div");
  ring.className = "fx-shock";
  ring.style.width = "54px"; ring.style.height = "54px";
  ring.style.borderColor = "rgba(166,58,43,.85)";
  addFx(ring, mx, my, 800);
  for (let i = 0; i < 8; i++) {
    const s = document.createElement("div");
    s.className = "fx-drop";
    const ang = i / 8 * Math.PI * 2;
    s.style.setProperty("--dx", Math.cos(ang) * 34 + "px");
    s.style.setProperty("--dy", Math.sin(ang) * 26 + "px");
    addFx(s, mx, my, 700);
  }
  const ch = document.createElement("div");
  ch.className = "fx-clash-char";
  ch.textContent = "抵";
  addFx(ch, mx, my - 6, 1100);
}

const SKILL_FX = {
  "吐纳": fxTuna, "轻功": fxLeap, "遁地": fxDive, "袖箭": fxDart,
  "剑风": fxSlash, "震山掌": fxPalm, "金钟罩": fxBell, "万剑归宗": fxWanjian,
};

/* 各招式特效的完整播放时长（毫秒），用于决定揭晓阶段的停留时间 */
export const FX_DUR = {
  "吐纳": 2100, "轻功": 820, "遁地": 1500, "袖箭": 800,
  "剑风": 950, "震山掌": 1100, "金钟罩": 1550, "万剑归宗": 1600,
};

export function spawnSkillFx() {
  if (SKILL_FX[S.report.pm]) SKILL_FX[S.report.pm]("player");
  setTimeout(() => {
    if (S.report && SKILL_FX[S.report.am]) SKILL_FX[S.report.am]("ai");
  }, 240);
}
