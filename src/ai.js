/* ══════════ 对手 AI：按难度盲选招式（看不到玩家本回合选择） ══════════
   简单/中等：原启发式；困难：升级为"读心"——记招 + 马尔可夫预测 + 反制表，
   预测置信不足或未触发剥削时回退到原困难启发式，保证下限不弱于旧版。 */
import { ACTIONS, SKILLS, S, heroCost, logMsg } from "./state.js";
import { pick } from "./util.js";
import { newMemory, recordMove, predict, counterMove, wanjianShouldFire } from "./mind.js";

export const CONF_THRESHOLD = 0.45;   /* 置信阈值：预测多铁才信 */
export const EXPLOIT_RATE  = 0.65;    /* 剥削率：信了之后多常出反制 */

let mem = newMemory();
let lastPred = null;        /* 上一回合的预测（结算时对答案用） */
let lastPredRound = -1;     /* 预测针对的回合号，防止跨回合误比对 */
let lastExploit = false;    /* 上回合是否真的按预测出了反制招 */
let tauntCooldown = 0;

export function resetAiMemory() {
  mem = newMemory();
  lastPred = null; lastPredRound = -1; lastExploit = false; tauntCooldown = 0;
}

/* PvE 每回合结算后由 engine.settle 调用：记录玩家实际出招，并对上回合预测对答案 */
export function aiAfterSettle(pm) {
  if (lastPred && lastPredRound === S.gs.round && S.aiDebug) {
    logMsg("【读心】预测 " + lastPred.move + "(" + lastPred.prob.toFixed(2) + ") 实际 " + pm +
      (pm === lastPred.move ? " ✓" : " ✗"));
  }
  /* 预测命中且确按预测出招 → 概率性挑衅一句（有冷却，不刷屏） */
  if (lastPred && lastPredRound === S.gs.round && pm === lastPred.move && lastExploit) {
    if (tauntCooldown <= 0 && Math.random() < 0.6) {
      logMsg(pick([
        "对手抚掌冷笑：『故技重施，我已候你多时。』",
        "对手沉声道：『你出招的路数，我已看穿三分。』",
      ]));
      tauntCooldown = 3;
    }
  }
  recordMove(mem, pm);
  lastPred = null; lastPredRound = -1; lastExploit = false;
  if (tauntCooldown > 0) tauntCooldown--;
}

/* 原三档启发式（简单/中等 原样保留；困难作为读心的回退底） */
function legacyChoose(d) {
  const qi = () => S.gs.ai.qi;
  const pq = S.gs.player.qi, pp = S.gs.player.pos, ash = S.gs.ai.shield;
  const afford = names => names.filter(n => qi() >= heroCost(S.gs.ai.hero, n));

  if (d === "简单") {
    const pool = afford(SKILLS.map(s => s[0]));
    return pick(pool.length ? pool : ["吐纳"]);
  }
  if (d === "中等") {
    if (qi() >= 7) return "万剑归宗";
    if (qi() >= 3) {
      if (pp === "sky") return "剑风";
      if (pp === "underground") return "震山掌";
      return pick(["袖箭", "剑风", "震山掌"]);
    }
    if (qi() >= 1) return Math.random() < 0.6 ? "袖箭" : "吐纳";
    return "吐纳";
  }
  /* 困难底：原逻辑去掉盲目万剑（时机改由读心层智能接管） */
  if (pq >= 5 && Math.random() < 0.25) return pick(["轻功", "遁地"]);
  if (qi() >= 3) {
    if (pp === "sky") return "剑风";
    if (pp === "underground") return "震山掌";
    if (ash < 2 && Math.random() < 0.3) return "金钟罩";
    return pick(["袖箭", "剑风"]);
  }
  if (qi() >= 1) return (pp === "ground" && Math.random() < 0.7) ? "袖箭" : "吐纳";
  return "吐纳";
}

/* 困难·读心：万剑时机 → 预测反制 → 回退启发式 */
function hardMind() {
  const ai = S.gs.ai, pl = S.gs.player;
  const pr = predict(mem, { qi: pl.qi, hero: pl.hero });
  lastPred = pr;
  lastPredRound = S.gs.round;

  if (wanjianShouldFire(pr.move, pr.prob, CONF_THRESHOLD, ai.qi, ai.hero, ai.shield))
    return "万剑归宗";

  if (pr.prob >= CONF_THRESHOLD && Math.random() < EXPLOIT_RATE) {
    const c = counterMove(pr.move, {
      aiQi: ai.qi, aiHero: ai.hero, aiShield: ai.shield, plShield: pl.shield,
    });
    if (c) { lastExploit = true; return c; }
  }
  return legacyChoose("困难");
}

export function aiChoose() {
  const d = S.storyMode ? (S.storyAiDiff || "简单") : S.selectedDiff;
  if (d === "困难" && !S.storyMode) return hardMind();
  return legacyChoose(d);
}
