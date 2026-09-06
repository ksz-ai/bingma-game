/* ══════════ 流程引擎：选招 → 等待 → 结算 → 揭晓 → 结束 ══════════
   pve：等待 0.7s 后本地 AI 出招并结算
   pvp：出招即发承诺哈希，等对手也承诺后亮牌，双方各收招式本地结算（纯函数，结果一致） */
import { $, now } from "./util.js";
import { ACTIONS, ROUND_TIME, WAIT_TIME, REVEAL_TIME, PVP_ROUND_TIME, S, setFeedback, newState, logMsg } from "./state.js";
import { resolveCombat } from "./settle.js";
import { aiChoose } from "./ai.js";
import { skillSound, SFX, thud, clang, startBgm, stopBgm } from "./audio.js";
import { spawnDmgFx, spawnSkillFx, fxClash, FX_DUR } from "./fx.js";
import * as net from "./net.js";

export function trySelect(name) {
  if (S.pending !== null) { setFeedback("招式已定，静待分晓…"); return; }
  const cost = ACTIONS[name].cost;
  if (S.gs.player.qi < cost) { setFeedback(name + "需 " + cost + " 点气！"); SFX.invalid(); return; }
  S.pending = name;
  skillSound(name);
  if (S.gameMode === "pvp") {
    S.myNonce = net.randNonce();
    S.revealSent = false;
    net.commitMove(name, S.myNonce).catch(() => pvpAbort("房间已失效，返回客栈"));
  }
  S.phase = "waiting";
  S.waitStart = now();
}

export function settle(pm, am) {
  const pS = S.gs.player.shield, aS = S.gs.ai.shield, base = S.gs.log.length;
  S.aiMove = am;
  const r = resolveCombat(pm, am);
  S.clashed = r.clashed;
  S.cancelled = r.cancelled;

  const raw = S.gs.log.slice(base);
  const combat = raw.filter(x => x.includes("伤") || x.includes("落空") || x.includes("万剑归宗"));
  S.report = {
    pm, am,
    pd: Math.max(0, pS - S.gs.player.shield),
    ad: Math.max(0, aS - S.gs.ai.shield),
    lines: combat.concat(raw.filter(x => !combat.includes(x))),
  };
  S.pending = null;
  spawnDmgFx();

  skillSound(pm, 0);
  skillSound(am, 0.24);
  if (S.clashed) { clang(0.32); setTimeout(fxClash, 300); }
  else if (S.report.pd > 0 || S.report.ad > 0) thud(0.5, 0.5);
  spawnSkillFx();

  /* 终结回合也先走完揭晓：特效播完即弹结算遮罩 */
  const dp = S.gs.dead.player, da = S.gs.dead.ai;
  S.pendingResult = dp || da ? (dp && da ? "draw" : dp ? "lose" : "win") : null;
  const fxSec = m => (FX_DUR[m] || 1000) / 1000;
  const fxDur = Math.max(fxSec(pm), 0.24 + fxSec(am));
  S.revealDur = S.pendingResult ? fxDur + 0.15 : Math.max(REVEAL_TIME, fxDur);
  S.phase = "reveal";
  S.revealStart = now();
}

function nextRoundReset(round) {
  S.gs.round = round;
  S.gs.player.pos = "ground"; S.gs.ai.pos = "ground";
  S.report = null; S.phase = "select"; S.timer = S.timerMax;
  setFeedback("第 " + round + " 回合", 1.0);
}

export function update(dt) {
  if (S.result) return;
  if (S.phase === "select") {
    S.timer -= dt;
    if (S.timer <= 0) {
      setFeedback("犹豫败北，自动吐纳");
      trySelect("吐纳");
    }
  } else if (S.phase === "waiting" && S.gameMode === "pve") {
    if (now() - S.waitStart >= WAIT_TIME) settle(S.pending, aiChoose());
  } else if (S.phase === "waiting" && S.gameMode === "pvp") {
    if (now() - S.waitStart > 45) return pvpAbort("对手迟迟未出招，已返回客栈");
  } else if (S.phase === "reveal") {
    if (now() - S.revealStart >= S.revealDur) {
      if (S.pendingResult) {
        const r = S.pendingResult; S.pendingResult = null;
        S.phase = "over";
        showResult(r);
        return;
      }
      if (S.gameMode === "pvp") {
        net.nextRound().catch(() => {});
        S.phase = "sync";
        return;
      }
      nextRoundReset(S.gs.round + 1);
    }
  }
  /* pvp 的 waiting→结算与 sync→下一回合均由 handleNetState 驱动 */
}

/* ══════════ 联机事件：轮询回调 ══════════ */
let settling = false;   // settle 前有异步验证，防止推送连发导致重入双结算

export async function handleNetState(st) {
  if (S.gameMode !== "pvp" || S.result) return;
  S.netErr = 0;

  if (!st.peerJoined) return pvpAbort("对手已离开，对局结束");
  if (!st.peerSeen) {
    if (!S.peerStaleSince) S.peerStaleSince = now();
    else if (now() - S.peerStaleSince > 10) return pvpAbort("对手掉线，已返回客栈");
  } else S.peerStaleSince = 0;

  if (S.phase === "waiting") {
    if (!S.revealSent && st.peerCommit) {
      S.revealSent = true;
      net.revealMove(S.pending, S.myNonce).catch(() => {});
    }
    if (S.revealSent && st.peerReveal && st.peerCommit && !settling) {
      settling = true;
      try {
        const am = st.peerReveal.move;
        const cost = ACTIONS[am] ? ACTIONS[am].cost : -1;
        const hashOK = await net.moveHash(am, st.peerReveal.nonce) === st.peerCommit;
        if (!hashOK || cost < 0 || cost > S.gs.ai.qi)
          return pvpAbort("对手招式数据异常，对局已终止");
        settle(S.pending, am);
      } finally { settling = false; }
    }
  } else if (S.phase === "sync" && st.round > S.gs.round) {
    nextRoundReset(st.round);
  }
}

export function handleNetError(e) {
  if (S.gameMode !== "pvp" || S.result) return;
  if (++S.netErr > 8) pvpAbort("网络不稳，已返回客栈");
}

function pvpAbort(msg) {
  setFeedback(msg, 4);
  toMenu();
}

/* ══════════ 胜负结算与画面切换 ══════════ */
export function showResult(res) {
  S.result = res;
  const ov = $("overlay"), panel = $("ov-panel");
  panel.className = res;
  $("ov-title").textContent = res === "win" ? "胜" : res === "draw" ? "平" : "败";
  const pvp = S.gameMode === "pvp";
  $("btn-retry").style.display = pvp ? "none" : "";
  $("ov-hint").textContent = pvp ? "M 回客栈" : "R 再战 · M 回菜单";
  ov.classList.remove("hidden");
  if (res === "win") SFX.win(); else if (res === "lose") SFX.lose(); else SFX.draw();
}

export function startGame(mode = "pve") {
  stopBgm();
  S.gameMode = mode;
  S.timerMax = mode === "pvp" ? PVP_ROUND_TIME : ROUND_TIME;
  S.gs = newState();
  S.phase = "select"; S.pending = null; S.aiMove = null;
  S.timer = S.timerMax; S.report = null; S.result = null; S.fbMsg = null;
  S.pendingResult = null; S.revealDur = REVEAL_TIME;
  S.clashed = false;
  S.cancelled = { player: false, ai: false };
  S.myNonce = null; S.revealSent = false; S.peerStaleSince = 0; S.netErr = 0;
  $("ai-name").textContent = mode === "pvp" ? "对手 · 联机" : "对手 · " + S.selectedDiff;
  $("fx").innerHTML = "";
  $("overlay").classList.add("hidden");
  $("menu-scr").classList.add("hidden");
  $("game-scr").classList.remove("hidden");
  S.mode = "game";
  SFX.start();
}

export function toMenu() {
  if (S.gameMode === "pvp") net.leaveRoom();
  S.mode = "menu"; S.result = null; S.gameMode = "pve";
  $("overlay").classList.add("hidden");
  $("game-scr").classList.add("hidden");
  $("menu-scr").classList.remove("hidden");
  SFX.tap();
  startBgm();
}
