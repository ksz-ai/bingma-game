/* ══════════ 对手 AI：按难度盲选招式（看不到玩家选择） ══════════ */
import { ACTIONS, SKILLS, S } from "./state.js";
import { pick } from "./util.js";

export function aiChoose() {
  const d = S.selectedDiff, qi = () => S.gs.ai.qi;
  const pq = S.gs.player.qi, pp = S.gs.player.pos, ash = S.gs.ai.shield;
  const afford = names => names.filter(n => qi() >= ACTIONS[n].cost);

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
  // 困难
  if (qi() >= 7) return "万剑归宗";
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
