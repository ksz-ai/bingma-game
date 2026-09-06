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
