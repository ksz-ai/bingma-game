/* 对决规则测试：压制 / 相抵 / 闪避 / 终结招 矩阵 */
import { S, newState } from "../src/state.js";
import { resolveCombat } from "../src/settle.js";

let failed = 0;
function setup({ pShield = 0, aShield = 0, pQi = 9, aQi = 9, pPos = "ground", aPos = "ground" } = {}) {
  S.gs = newState();
  S.gs.player.shield = pShield; S.gs.ai.shield = aShield;
  S.gs.player.qi = pQi; S.gs.ai.qi = aQi;
  S.gs.player.pos = pPos; S.gs.ai.pos = aPos;
}
function check(label, cond) {
  if (cond) console.log("PASS  " + label);
  else { failed++; console.log("FAIL  " + label); }
}

/* 1. 3伤 vs 1伤（用户报告的平局场景）：高伤压制，弱方作废 → 强方独胜 */
setup();
S.pending = "剑风"; S.aiMove = "袖箭";
let r = resolveCombat("剑风", "袖箭");
check("3v1: 非相抵", !r.clashed);
check("3v1: 弱方攻击作废", r.cancelled.ai && !r.cancelled.player);
check("3v1: 强方无伤存活", S.gs.player.shield === 0 && !S.gs.dead.player);
check("3v1: 弱方被击倒", S.gs.dead.ai);
check("3v1: 双方照常扣气", S.gs.player.qi === 6 && S.gs.ai.qi === 8);

/* 2. 反向：1伤 vs 3伤 */
setup();
S.pending = "袖箭"; S.aiMove = "震山掌";
r = resolveCombat("袖箭", "震山掌");
check("1v3: 我方攻击作废", r.cancelled.player && !r.cancelled.ai);
check("1v3: 我方被击倒、对手无伤", S.gs.dead.player && !S.gs.dead.ai);

/* 3. 相同伤值 → 相抵（原逻辑保留） */
setup();
S.pending = "袖箭"; S.aiMove = "袖箭";
r = resolveCombat("袖箭", "袖箭");
check("同伤: 相抵", r.clashed && !r.cancelled.player && !r.cancelled.ai);
check("同伤: 双方无伤", !S.gs.dead.player && !S.gs.dead.ai);

/* 4. 剑风 vs 震山掌（同为3伤，平地重叠）→ 相抵 */
setup();
S.pending = "剑风"; S.aiMove = "震山掌";
r = resolveCombat("剑风", "震山掌");
check("剑风vs震山掌: 相抵", r.clashed && !S.gs.dead.player && !S.gs.dead.ai);

/* 5. 轻功闪避：玩家跃屋脊，震山掌只打平地/水底 → 双方无伤 */
setup();
S.pending = "轻功"; S.aiMove = "震山掌";
r = resolveCombat("轻功", "震山掌");
check("闪避: 不触发相抵/压制", !r.clashed && !r.cancelled.player && !r.cancelled.ai);
check("闪避: 玩家在屋脊且无伤", S.gs.player.pos === "sky" && !S.gs.dead.player);

/* 6. 万剑归宗与普通攻击同回合：两败俱伤（既有行为不变） */
setup({ pQi: 7 });
S.pending = "万剑归宗"; S.aiMove = "袖箭";
r = resolveCombat("万剑归宗", "袖箭");
check("终结招: 对手被万剑归宗击倒", S.gs.dead.ai);
check("终结招: 同回合袖箭仍命中（同归）", S.gs.dead.player);

/* 7. 非攻击对非攻击：吐纳 vs 金钟罩，各自生效 */
setup();
S.pending = "吐纳"; S.aiMove = "金钟罩";
r = resolveCombat("吐纳", "金钟罩");
check("辅助招: 无碰撞", !r.clashed && !r.cancelled.player && !r.cancelled.ai);
check("辅助招: 气+1 与罡气+3 生效", S.gs.player.qi === 10 && S.gs.ai.shield === 3);

console.log(failed ? "\n" + failed + " CASE(S) FAILED" : "\nALL SETTLE TESTS PASSED");
process.exit(failed ? 1 : 0);
