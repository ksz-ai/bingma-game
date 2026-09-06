/* ══════════ 常量与全局可变状态 ══════════
   所有跨模块共享的可变状态收拢在单一对象 S 里，
   各模块 import S 后读写 S.xxx，避免导出可变绑定无法赋值的问题。 */
import { now } from "./util.js";

export const SKILLS = [
  ["吐纳", "1", 0, "气 +1"],
  ["轻功", "2", 0, "跃上屋脊避险"],
  ["遁地", "3", 0, "潜入水底避险"],
  ["袖箭", "4", 1, "1 伤 · 仅中平地"],
  ["剑风", "5", 3, "3 伤 · 屋脊+平地"],
  ["震山掌", "6", 3, "3 伤 · 平地+水底"],
  ["金钟罩", "7", 3, "罡气 +3"],
  ["万剑归宗", "8", 7, "一招制胜"],
];
export const ACTIONS = {};
for (const [n, , c] of SKILLS) ACTIONS[n] = { cost: c };
export const KEYMAP = {};
for (const [n, k] of SKILLS) KEYMAP[k] = n;

export const ROUND_TIME = 5.0, WAIT_TIME = 0.7, REVEAL_TIME = 1.9;
export const PVP_ROUND_TIME = 10.0;
export const DIFFS = ["简单", "中等", "困难"];
export const POS_NAMES = { ground: "平地", sky: "屋脊", underground: "水底" };

export const S = {
  mode: "menu",            // menu | game
  gameMode: "pve",         // pve | pvp
  selectedDiff: "简单",
  gs: null,
  phase: "select",         // select | waiting | reveal | over | sync(pvp)
  pending: null, aiMove: null,
  timer: ROUND_TIME, timerMax: ROUND_TIME, waitStart: 0, revealStart: 0,
  fbMsg: null, fbUntil: 0,
  report: null, result: null,
  pendingResult: null, revealDur: REVEAL_TIME,
  clashed: false,
  // 联机
  myNonce: null, revealSent: false, peerStaleSince: 0, netErr: 0,
};

export function setFeedback(msg, dur = 1.2) { S.fbMsg = msg; S.fbUntil = now() + dur; }

export function newState() {
  return {
    round: 1, dead: { player: false, ai: false },
    player: { qi: 0, shield: 0, pos: "ground" },
    ai:     { qi: 0, shield: 0, pos: "ground" },
    log: [],
  };
}

export function logMsg(m) { S.gs.log.push(m); if (S.gs.log.length > 4) S.gs.log.shift(); }
