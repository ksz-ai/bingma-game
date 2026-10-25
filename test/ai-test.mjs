/* 读心 AI 测试：预测器 / 反制表 / 蒙特卡洛（沿用 settle-test.mjs 的直跑风格）
   运行：node test/ai-test.mjs */
import { S, HEROES, newState, heroCost } from "../src/state.js";
import { resolveCombat } from "../src/settle.js";
import { newMemory, recordMove, predict, counterMove, wanjianShouldFire } from "../src/mind.js";
import { aiChoose, aiAfterSettle, resetAiMemory, CONF_THRESHOLD } from "../src/ai.js";

let failed = 0;
function check(label, cond) {
  if (cond) console.log("PASS  " + label);
  else { failed++; console.log("FAIL  " + label); }
}

/* ── 1. 记招与预测 ─────────────────────────────────── */
const mem = newMemory();
/* 「吐纳吐纳→轻功」的二阶规律在序列尾段重复出现，预测器应命中 */
["吐纳", "吐纳", "轻功", "吐纳", "吐纳", "轻功", "吐纳", "吐纳"].forEach(m => recordMove(mem, m));
let pr = predict(mem, { qi: 3, hero: HEROES[0] });
check("预测: 学到「吐纳吐纳→轻功」的二阶规律", pr.move === "轻功" && pr.basis === "order2");
check("预测: 置信度达到阈值", pr.prob >= CONF_THRESHOLD);

const mem2 = newMemory();
["吐纳", "剑风", "吐纳", "剑风", "吐纳"].forEach(m => recordMove(mem2, m));
pr = predict(mem2, { qi: 0, hero: HEROES[0] });
check("可行域: 气 0 时只能免费招，剑风被裁掉", ["吐纳", "轻功", "遁地"].includes(pr.move) && (pr.dist["剑风"] || 0) === 0);

const mem3 = newMemory();
["吐纳", "吐纳", "吐纳", "吐纳", "吐纳"].forEach(m => recordMove(mem3, m));
pr = predict(mem3, { qi: 7, hero: HEROES[0] });
check("万剑先验: 玩家气 7 时万剑进入候选且分走概率", pr.dist["万剑归宗"] > 0);

const mem4 = newMemory();
recordMove(mem4, "吐纳");
pr = predict(mem4, { qi: 3, hero: HEROES[0] });
check("冷启动: 样本不足时给均匀分布且低置信", pr.prob < CONF_THRESHOLD);

/* 刺客玩家：袖箭免费，气 0 也恒可用 */
const mem5 = newMemory();
["袖箭", "袖箭", "袖箭", "袖箭"].forEach(m => recordMove(mem5, m));
pr = predict(mem5, { qi: 0, hero: HEROES.find(h => h.id === "assassin") });
check("英雄感知: 刺客气 0 时仍可预测到免费袖箭", pr.move === "袖箭" && pr.prob >= CONF_THRESHOLD);

/* ── 2. 反制表（按高伤压制规则推导） ───────────────── */
const H0 = HEROES[0];   // 标准剑客
let c = counterMove("吐纳", { aiQi: 3, aiHero: H0, aiShield: 0, plShield: 0 });
check("反制: 预测吐纳+玩家裸身 → 袖箭斩杀", c === "袖箭");
c = counterMove("吐纳", { aiQi: 3, aiHero: H0, aiShield: 0, plShield: 2 });
check("反制: 玩家罡 2 → 3 伤招直接击倒", c === "剑风" || c === "震山掌");
c = counterMove("轻功", { aiQi: 3, aiHero: H0, aiShield: 0, plShield: 0 });
check("反制: 预测轻功上屋脊 → 剑风", c === "剑风");
c = counterMove("遁地", { aiQi: 3, aiHero: H0, aiShield: 0, plShield: 0 });
check("反制: 预测遁地入水底 → 震山掌", c === "震山掌");
c = counterMove("袖箭", { aiQi: 3, aiHero: H0, aiShield: 0, plShield: 0 });
check("反制: 预测袖箭 → 3 伤正面压制而非躲闪", c === "剑风" || c === "震山掌");
c = counterMove("袖箭", { aiQi: 0, aiHero: H0, aiShield: 0, plShield: 0 });
check("反制: 无气对袖箭 → 免费轻功躲", c === "轻功");
c = counterMove("剑风", { aiQi: 7, aiHero: H0, aiShield: 0, plShield: 0 });
check("反制: 预测剑风 → 遁地免伤", c === "遁地");
c = counterMove("震山掌", { aiQi: 7, aiHero: H0, aiShield: 0, plShield: 0 });
check("反制: 预测震山掌 → 轻功免伤", c === "轻功");
c = counterMove("金钟罩", { aiQi: 7, aiHero: H0, aiShield: 0, plShield: 0 });
check("反制: 预测金钟罩 → 吐纳攒气", c === "吐纳");
/* 刺客 AI 袖箭免费：气 0 也能斩杀裸身玩家 */
c = counterMove("吐纳", { aiQi: 0, aiHero: HEROES.find(h => h.id === "assassin"), aiShield: 0, plShield: 0 });
check("反制: 刺客 AI 气 0 仍有免费袖箭", c === "袖箭");

/* ── 3. 万剑时机 ───────────────────────────────────── */
check("万剑: 气不足不放", !wanjianShouldFire("吐纳", 0.9, CONF_THRESHOLD, 6, H0, 0));
check("万剑: 无有效预测时沿用旧策略盲放", wanjianShouldFire("吐纳", 0.1, CONF_THRESHOLD, 7, H0, 0));
check("万剑: 预测到打不穿我的攻击 → 放", wanjianShouldFire("袖箭", 0.9, CONF_THRESHOLD, 7, H0, 1));
check("万剑: 预测到致命攻击 → 收住", !wanjianShouldFire("剑风", 0.9, CONF_THRESHOLD, 7, H0, 0));
check("万剑: 预测对方也放万剑 → 对拼求平", wanjianShouldFire("万剑归宗", 0.9, CONF_THRESHOLD, 7, H0, 9));

/* ── 4. 蒙特卡洛：读心确实惩罚习惯型玩家 ──────────── */
/* 用真实 resolveCombat 对局：习惯型 bot 走「吐纳吐纳轻功吐纳」固定节奏（七成守律） */
function affordable(side, m) { return S.gs[side].qi >= heroCost(S.gs[side].hero, m); }

function habitBot(r) {
  const plan = ["吐纳", "吐纳", "轻功", "吐纳"];
  const m = plan[(r - 1) % plan.length];
  if (Math.random() < 0.7 && affordable("player", m)) return m;
  const pool = ["吐纳", "轻功", "遁地", "袖箭", "剑风", "震山掌", "金钟罩"].filter(x => affordable("player", x));
  return pool[Math.floor(Math.random() * pool.length)] || "吐纳";
}
function randomBot() {
  const pool = ["吐纳", "轻功", "遁地", "袖箭", "剑风", "震山掌", "金钟罩"].filter(x => affordable("player", x));
  return pool[Math.floor(Math.random() * pool.length)] || "吐纳";
}
function playGame(bot) {
  resetAiMemory();
  S.storyMode = false;
  S.selectedDiff = "困难";
  S.gs = newState(HEROES[0], HEROES[0]);
  S.pending = null; S.aiMove = null;
  for (let r = 1; r <= 60; r++) {
    S.gs.round = r;
    const pm = bot(r);
    const am = aiChoose();
    S.pending = pm;
    S.aiMove = am;                    /* 与 engine.settle 一致：结算前先落 aiMove */
    resolveCombat(pm, am);
    S.pending = null;
    aiAfterSettle(pm);
    /* 以 AI 视角计胜负：玩家倒下=win，AI 倒下=lose，同倒=draw */
    if (S.gs.dead.player || S.gs.dead.ai)
      return S.gs.dead.player && S.gs.dead.ai ? "draw" : (S.gs.dead.player ? "win" : "lose");
  }
  return "draw";
}

const N = 400;
function winRate(bot) {
  let w = 0;
  for (let i = 0; i < N; i++) if (playGame(bot) === "win") w++;
  return w / N;
}
const wrHabit = winRate(habitBot);
const wrRandom = winRate(randomBot);
console.log("      观心(困难读心) vs 习惯型: " + (wrHabit * 100).toFixed(1) + "%");
console.log("      观心(困难读心) vs 随机型: " + (wrRandom * 100).toFixed(1) + "%");
check("蒙特卡洛: 对习惯型胜率显著高于随机型 (差≥15pp)", wrHabit - wrRandom >= 0.15);
check("蒙特卡洛: 对随机型不失控 (≥35% 保持基本盘)", wrRandom >= 0.35);

console.log(failed ? "\n" + failed + " CASE(S) FAILED" : "\nALL AI TESTS PASSED");
process.exit(failed ? 1 : 0);
