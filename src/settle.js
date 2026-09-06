/* ══════════ 规则结算：纯函数式，只读写 S.gs ══════════ */
import { ACTIONS, S, logMsg } from "./state.js";

export function applyDamage(st, dmg) {
  if (st.shield >= dmg) { st.shield -= dmg; return false; }
  st.shield = 0; return true;
}

export function begin(side, name) {
  if (!(name in ACTIONS)) return false;
  const st = S.gs[side];
  if (st.qi < ACTIONS[name].cost) return false;
  st.qi -= ACTIONS[name].cost;
  return true;
}

export function resolveMove(side) {
  const me = S.gs[side];
  const act = side === "player" ? S.pending : S.aiMove;
  const you = side === "player" ? "你" : "对手";
  if (act === "吐纳")       { me.qi += 1; logMsg(you + "盘膝吐纳，气 +1"); }
  else if (act === "轻功")  { me.pos = "sky"; logMsg(you + "施展轻功，翻上屋脊"); }
  else if (act === "遁地")  { me.pos = "underground"; logMsg(you + "一个翻身，遁入水底"); }
  else if (act === "金钟罩"){ me.shield += 3; logMsg(you + "运起金钟罩，罡气 +3"); }
  else if (act === "万剑归宗") {
    S.gs.dead[side === "player" ? "ai" : "player"] = true;
    logMsg(you + "祭出万剑归宗！！");
  }
}

export function resolveAttack(side) {
  const foeSide = side === "player" ? "ai" : "player";
  const foe = S.gs[foeSide];
  const act = side === "player" ? S.pending : S.aiMove;
  const atk = side === "player" ? "你" : "对手";
  const def = side === "player" ? "对手" : "你";
  if (act === "袖箭") {
    if (foe.pos === "ground") {
      if (applyDamage(foe, 1)) S.gs.dead[foeSide] = true;
      logMsg(atk + "的袖箭命中" + def + "，造成 1 伤");
    } else logMsg(atk + "的袖箭落空（" + def + "不在平地）");
  } else if (act === "剑风") {
    if (foe.pos === "sky" || foe.pos === "ground") {
      if (applyDamage(foe, 3)) S.gs.dead[foeSide] = true;
      logMsg(atk + "的剑风席卷" + def + "，造成 3 伤");
    } else logMsg(atk + "的剑风落空（" + def + "藏于水底）");
  } else if (act === "震山掌") {
    if (foe.pos === "ground" || foe.pos === "underground") {
      if (applyDamage(foe, 3)) S.gs.dead[foeSide] = true;
      logMsg(atk + "的震山掌重击" + def + "，造成 3 伤");
    } else logMsg(atk + "的震山掌落空（" + def + "立在屋脊）");
  }
}

/* 攻击的伤值与是否命中（位置以位移后的为准），用于相抵判定 */
export function attackInfo(side) {
  const act = side === "player" ? S.pending : S.aiMove;
  const foe = S.gs[side === "player" ? "ai" : "player"];
  if (act === "袖箭") return { dmg: 1, hit: foe.pos === "ground" };
  if (act === "剑风") return { dmg: 3, hit: foe.pos === "sky" || foe.pos === "ground" };
  if (act === "震山掌") return { dmg: 3, hit: foe.pos === "ground" || foe.pos === "underground" };
  return { dmg: 0, hit: false };
}

/* 对决核心：扣气、位移、碰撞判定与伤害（纯逻辑，联机双方各自执行，结果一致）
   双方攻击同时命中时：伤值相同 → 互相抵消；伤值更高 → 压制对方，弱方攻击作废 */
export function resolveCombat(pm, am) {
  const pOK = begin("player", pm);
  const aOK = begin("ai", am);
  if (pOK) resolveMove("player");
  if (aOK) resolveMove("ai");
  const pInfo = pOK ? attackInfo("player") : null;
  const aInfo = aOK ? attackInfo("ai") : null;
  const bothHit = !!(pInfo && aInfo && pInfo.hit && aInfo.hit);
  const res = { clashed: false, cancelled: { player: false, ai: false } };
  if (bothHit && pInfo.dmg === aInfo.dmg) {
    res.clashed = true;
    logMsg("铛！你的" + pm + "与对手的" + am + "正面相撞，互相抵消");
  } else if (bothHit && pInfo.dmg > aInfo.dmg) {
    res.cancelled.ai = true;
    logMsg("你的" + pm + "势大力沉，硬生生压过对手的" + am);
    if (pOK) resolveAttack("player");
  } else if (bothHit) {
    res.cancelled.player = true;
    logMsg("对手的" + am + "势大力沉，硬生生压过你的" + pm);
    if (aOK) resolveAttack("ai");
  } else {
    if (pOK) resolveAttack("player");
    if (aOK) resolveAttack("ai");
  }
  return res;
}
