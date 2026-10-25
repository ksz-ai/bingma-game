/* ══════════ 读心模块：记招 → 预测 → 反制（纯函数，不依赖 S/DOM） ══════════
   供困难 AI 使用：记录玩家历史出招，二阶/一阶马尔可夫回退预测下一手，
   再按"高伤压制"规则反选克制招式。只用公开信息（历史招式 + 双方气/罡/英雄），
   绝不窥探玩家本回合的选择——信息对等是兵马对弈的根基。 */
import { ACTIONS, heroCost } from "./state.js";

const DMG = { "袖箭": 1, "剑风": 3, "震山掌": 3 };

export function newMemory() {
  return { seq: [], t1: {}, t2: {}, freq: {} };
}

/* 结算后记录玩家本回合实际招式，维护一阶/二阶转移计数与总频率 */
export function recordMove(mem, move) {
  mem.seq.push(move);
  mem.freq[move] = (mem.freq[move] || 0) + 1;
  const n = mem.seq.length;
  if (n >= 2) {
    const k1 = mem.seq[n - 2];
    (mem.t1[k1] = mem.t1[k1] || {})[move] = (mem.t1[k1][move] || 0) + 1;
  }
  if (n >= 3) {
    const k2 = mem.seq[n - 3] + "|" + mem.seq[n - 2];
    (mem.t2[k2] = mem.t2[k2] || {})[move] = (mem.t2[k2][move] || 0) + 1;
  }
}

const total = d => Object.values(d).reduce((a, b) => a + b, 0);

/* 预测玩家下一招：二阶 → 一阶 → 频率 → 均匀 逐级回退；
   可行域按玩家当前气与其英雄裁剪（出不起的招概率清零），再归一化。
   ctx: { qi, hero } 为玩家当前气与所选英雄。
   返回 { move, prob, basis }，prob 即置信度，由调用方按阈值取舍。 */
export function predict(mem, ctx) {
  const n = mem.seq.length;
  let dist, basis;
  const key2 = n >= 2 ? mem.seq[n - 2] + "|" + mem.seq[n - 1] : null;
  const key1 = n >= 1 ? mem.seq[n - 1] : null;
  if (key2 && mem.t2[key2] && total(mem.t2[key2]) >= 2) { dist = { ...mem.t2[key2] }; basis = "order2"; }
  else if (key1 && mem.t1[key1] && total(mem.t1[key1]) >= 3) { dist = { ...mem.t1[key1] }; basis = "order1"; }
  else if (n >= 4) { dist = { ...mem.freq }; basis = "freq"; }
  else { dist = {}; for (const m of Object.keys(ACTIONS)) dist[m] = 1; basis = "uniform"; }

  /* 情境先验：玩家气够万剑时，这永远是头号威胁，历史数据之外补一笔伪计数 */
  if (ctx.qi >= heroCost(ctx.hero, "万剑归宗")) dist["万剑归宗"] = (dist["万剑归宗"] || 0) + 1;

  let sum = 0;
  const ok = {};
  for (const m of Object.keys(dist)) {
    if (heroCost(ctx.hero, m) > ctx.qi) continue;   // 出不起的招不可能出现
    ok[m] = dist[m];
    sum += dist[m];
  }
  if (sum <= 0) return { move: "吐纳", prob: 0, basis, dist: {} };

  let move = "吐纳", best = -1;
  for (const m of Object.keys(ok)) {
    ok[m] /= sum;
    if (ok[m] > best) { best = ok[m]; move = m; }
  }
  return { move, prob: best, basis, dist: ok };
}

/* 反制表（按"高伤压制"规则推导：双方攻击同时命中时，伤值高者压制低者）。
   预测 → 候选招按序取第一个出得起且有意义的；全不可行返回 null（调用方回退基础策略）。
   ctx: { aiQi, aiHero, aiShield, plShield } 双方气/英雄与罡气。 */
export function counterMove(pred, ctx) {
  const can = m => ctx.aiQi >= heroCost(ctx.aiHero, m);
  const kill = m => (DMG[m] || 0) > ctx.plShield;    // 该招命中能否直接击倒玩家
  const pick3 = () => can("剑风") && kill("剑风") ? "剑风"
    : can("震山掌") && kill("震山掌") ? "震山掌"
    : can("剑风") ? "剑风" : can("震山掌") ? "震山掌" : null;   // 杀（盾<3）或削盾

  switch (pred) {
    case "吐纳":        /* 玩家站平地攒气 → 白送的斩杀/削盾窗口 */
      if (ctx.plShield === 0 && can("袖箭")) return "袖箭";
      return pick3();
    case "轻功":        /* 玩家将上屋脊 → 全场唯一够得着屋脊的攻击 */
      return can("剑风") ? "剑风" : null;
    case "遁地":        /* 玩家将入水底 */
      return can("震山掌") ? "震山掌" : null;
    case "袖箭":        /* 1 伤：以 3 伤正面压制——对方箭作废、我招照常命中 */
      { const c = pick3(); if (c) return c; }
      if (can("袖箭")) return "袖箭";     /* 1v1 相抵，至少不吃箭 */
      return "轻功";                      /* 免费上屋脊躲箭 */
    case "剑风":        /* 3 伤：躲入水底免伤（对轰 3v3 相抵亦可，躲更省） */
      return "遁地";
    case "震山掌":      /* 3 伤：跃上屋脊免伤 */
      return "轻功";
    case "金钟罩":      /* 攻新盾无益，攒气等破绽 */
      return "吐纳";
    case "万剑归宗":    /* 现行规则无解：能对放求平，否则能换一命是一命 */
      if (can("万剑归宗")) return "万剑归宗";
      return pick3();
  }
  return null;
}

/* AI 是否该祭出万剑归宗：出得起，且（预测不可信 → 沿用旧的盲放行为；
   预测可信 → 对方本回合杀不死我）。AI 放万剑时立于平地，三种攻击全能命中它。 */
export function wanjianShouldFire(pred, prob, confThreshold, aiQi, aiHero, aiShield) {
  if (aiQi < heroCost(aiHero, "万剑归宗")) return false;
  if (prob < confThreshold) return true;                       /* 无有效预测：保持旧策略盲放 */
  if (pred === "万剑归宗") return true;                        /* 对拼一记，求平好过单方面落败 */
  return (DMG[pred] || 0) <= aiShield;                         /* 预测到的攻击打不穿我 */
}
