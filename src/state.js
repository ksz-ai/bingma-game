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

/* ══════════ 可选角色：数值差异通过初始状态 + 招式倾向体现 ══════════
   全部落在现有结算体系里：初始气/罡、吐纳与金钟罩收益、免费招式。
   PvP 联机为保证双方本地结算一致，暂固定使用首个标准角色（见 engine.startGame）。 */
export const HEROES = [
  { id: "swordsman", name: "云隐剑客", tagline: "均衡中庸",
    startQi: 0, startShield: 0, medQi: 1, goldShield: 3, freeMoves: [],
    desc: "剑气如行云，攻守平衡，正是江湖各路相通之基。" },
  { id: "monk", name: "铁衣武僧", tagline: "金身防守",
    startQi: 0, startShield: 2, medQi: 1, goldShield: 4, freeMoves: [],
    desc: "一身铁衣金钟罩，开局自带罡气，愈战愈稳。" },
  { id: "assassin", name: "暗影刺客", tagline: "先手速攻",
    startQi: 2, startShield: 0, medQi: 1, goldShield: 3, freeMoves: ["袖箭"],
    desc: "身快气足，开场即占先手，袖箭来去无踪。" },
];
export const heroById = id => HEROES.find(h => h.id === id);
export const heroCost = (hero, name) =>
  (hero && hero.freeMoves && hero.freeMoves.includes(name)) ? 0 : ACTIONS[name].cost;

export const S = {
  mode: "menu",            // menu | game
  gameMode: "pve",         // pve | pvp
  selectedDiff: "简单",
  hero: HEROES[0],          // 我方当前所选角色
  gs: null,
  phase: "select",         // select | waiting | reveal | over | sync(pvp)
  pending: null, aiMove: null,
  timer: ROUND_TIME, timerMax: ROUND_TIME, waitStart: 0, revealStart: 0,
  fbMsg: null, fbUntil: 0,
  report: null, result: null,
  pendingResult: null, revealDur: REVEAL_TIME,
  clashed: false,
  cancelled: { player: false, ai: false },   // 同时命中时被高伤招式压制作废的一方
  // 联机
	  myNonce: null, revealSent: false, peerStaleSince: 0, netErr: 0,
	  pvpJoinTime: 0, isReconnecting: false,
};

export function setFeedback(msg, dur = 1.2) { S.fbMsg = msg; S.fbUntil = now() + dur; }

export function newState(ph = HEROES[0], ah = HEROES[0]) {
  return {
    round: 1, dead: { player: false, ai: false },
    player: { qi: ph.startQi, shield: ph.startShield, pos: "ground", hero: ph },
    ai:     { qi: ah.startQi, shield: ah.startShield, pos: "ground", hero: ah },
    log: [],
  };
}

export function logMsg(m) { S.gs.log.push(m); if (S.gs.log.length > 4) S.gs.log.shift(); }
