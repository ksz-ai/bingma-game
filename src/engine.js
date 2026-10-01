/* ══════════ 流程引擎：选招 → 等待 → 结算 → 揭晓 → 结束 ══════════
   pve：等待 0.7s 后本地 AI 出招并结算
   pvp：出招即发承诺哈希，等对手也承诺后亮牌，双方各收招式本地结算（纯函数，结果一致）
   story：剧情模式，对手按章节脚本出招，达到目标即过关，结算后剧情自检 */
import { $, now } from "./util.js";
import { ACTIONS, HEROES, heroById, heroCost, ROUND_TIME, WAIT_TIME, REVEAL_TIME, PVP_ROUND_TIME, S, setFeedback, newState, logMsg } from "./state.js";
import { resolveCombat } from "./settle.js";
import { aiChoose } from "./ai.js";
import { skillSound, SFX, thud, clang, startBgm, stopBgm } from "./audio.js";
import { spawnDmgFx, spawnSkillFx, fxClash, FX_DUR } from "./fx.js";
import * as net from "./net.js";
import { CHAPTERS, loadProgress, saveProgress } from "./story.js";
import { showDialog as renderShowDialog, render } from "./render.js";

export function trySelect(name) {
  /* 剧情对白显示时禁止出招 */
  const dlg = document.getElementById("dialog");
  if (dlg && !dlg.classList.contains("hidden")) return;
  if (S.pending !== null) { setFeedback("招式已定，静待分晓…"); return; }
  const cost = heroCost(S.gs.player.hero, name);
  if (S.gs.player.qi < cost) { setFeedback(name + "需 " + cost + " 点气！"); SFX.invalid(); return; }
  S.pending = name;
  skillSound(name);
  if (S.gameMode === "pvp") {
    S.myNonce = net.randNonce();
    S.revealSent = false;
    net.commitMove(name, S.myNonce).catch(() => pvpAbort("网络不稳，未能出招，返回客栈"));
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
  /* 实际承受伤害 = 招式伤值 − 我方盾吸收的部分（盾满则被吸收完全归零） */
  const dmgOf = m => ({ "袖箭": 1, "剑风": 3, "震山掌": 3 })[m] || 0;
  const hitOf = (side, m) => {
    const foe = S.gs[side === "player" ? "ai" : "player"];
    if (m === "袖箭")   return foe.pos === "ground";
    if (m === "剑风")   return foe.pos === "sky" || foe.pos === "ground";
    if (m === "震山掌") return foe.pos === "ground" || foe.pos === "underground";
    return false;
  };
  const absorbed = (preShield, dmg) => Math.min(preShield, dmg);
  const pd = hitOf("ai", am)     ? Math.max(0, dmgOf(am) - absorbed(pS, dmgOf(am))) : 0;
  const ad = hitOf("player", pm) ? Math.max(0, dmgOf(pm) - absorbed(aS, dmgOf(pm))) : 0;
  S.report = {
    pm, am,
    pd, ad,
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
  /* 剧情自检：判定过关/失败，仅在 storyMode 触发 */
  if (S.storyMode) storyCheckDodge();
  if (S.storyMode && S.storyResolveHook) {
    setTimeout(() => S.storyResolveHook && S.storyResolveHook(), 60);
  }
}

function nextRoundReset(round) {
  S.gs.round = round;
  S.gs.player.pos = "ground"; S.gs.ai.pos = "ground";
  S.report = null; S.phase = "select"; S.timer = S.timerMax;
  setFeedback("第 " + round + " 回合", 1.0);
}

export function update(dt) {
  if (S.result) return;
  /* 剧情对白显示时暂停游戏计时——对白点完才开始倒计时 */
  const dlgOpen = S.storyMode && !document.getElementById("dialog").classList.contains("hidden");
  if (S.phase === "select") {
    if (!dlgOpen) S.timer -= dt;
    if (S.timer <= 0) {
      setFeedback("犹豫败北，自动吐纳");
      trySelect("吐纳");
    }
  } else if (S.phase === "waiting" && S.gameMode === "pve") {
    if (now() - S.waitStart >= WAIT_TIME) settle(S.pending, storyMove() || aiChoose());
  } else if (S.phase === "waiting" && S.gameMode === "pvp") {
    if (now() - S.waitStart > 90) return pvpAbort("对手迟迟未出招，已返回客栈");
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

  if (!st.peerJoined) {
    const joinTime = S.pvpJoinTime || (S.pvpJoinTime = now());
    if (now() - joinTime > 3) return pvpAbort("对手已离开，对局结束");
    return;  // 3 秒缓冲期，允许 MQTT 连接初期抖动
  }
  if (!st.peerSeen) {   // 短暂失联：等对方从锁屏/切后台/网络波动中回来，90s 才判掉线
    if (S.peerStaleSince) {
      if (now() - S.peerStaleSince > 3 && now() - S.peerStaleSince <= 90)
        setFeedback("对手暂离，等待归来…", 1.5);
      else if (now() - S.peerStaleSince > 90) return pvpAbort("对手长时间未归，已返回客栈");
    } else S.peerStaleSince = now();
  } else {
    if (S.peerStaleSince) setFeedback("对手已重新连上", 1.2);
    S.peerStaleSince = 0;
  }

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
	  if (!S.isReconnecting) {
	    if (++S.netErr > 8) pvpAbort("网络不稳，已返回客栈");
	  }
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
  $("btn-retry").style.display = (pvp || S.storyMode) ? "none" : "";
  $("ov-hint").textContent = pvp ? "M 回客栈" : "R 再战 · M 回菜单";
  ov.classList.remove("hidden");
  if (res === "win") SFX.win(); else if (res === "lose") SFX.lose(); else SFX.draw();
}

export function startGame(mode = "pve") {
  stopBgm();
  S.gameMode = mode;
  S.timerMax = mode === "pvp" ? PVP_ROUND_TIME : ROUND_TIME;
  /* PvE：我方用所选角色，对手随机一名身份；PvP：双方各自携带所选角色，经握手同步后本地结算一致 */
  let ph = HEROES[0], ah = HEROES[0];
  if (mode === "pve") {
    ph = S.hero;
    ah = HEROES[Math.floor(Math.random() * HEROES.length)];
  } else {
    ph = heroById(S.hero.id) || HEROES[0];
    ah = heroById(net.peerHeroId()) || HEROES[0];
  }
  S.gs = newState(ph, ah);
  S.phase = "select"; S.pending = null; S.aiMove = null;
  S.timer = S.timerMax; S.report = null; S.result = null; S.fbMsg = null;
  S.pendingResult = null; S.revealDur = REVEAL_TIME;
  S.clashed = false;
  S.cancelled = { player: false, ai: false };
  S.myNonce = null; S.revealSent = false; S.peerStaleSince = 0; S.netErr = 0;
	  S.pvpJoinTime = 0; S.isReconnecting = false;
  $("p-name").textContent = ph.name + " · 你";
  $("ai-name").textContent = mode === "pvp" ? "对手 · 联机" : "对手 · " + ah.name + " · " + S.selectedDiff;
  $("fx").innerHTML = "";
  $("overlay").classList.add("hidden");
  $("menu-scr").classList.add("hidden");
  $("game-scr").classList.remove("hidden");
  S.mode = "game";
  SFX.start();
}

/* ══════════ 剧情模式 ══════════
   主菜单「初入兵马」→ openStory()：只打开关卡选择界面，不开局、不进游戏循环。
   选择界面按「入局 / 复通此关」→ enterStoryChapter(idx) → startStory(idx) 才真正开局：
   纯对白幕直接放对白；战斗幕先放引入对白，点完才开始倒计时出招。
   通关 / 失败 / 中途退出 → backToStorySelect() 返回关卡选择界面并默认选中下一关。
   storyMove()：waiting 阶段从脚本取出本回合对手招式。 */
export function openStory() {
  S.mode = "story";
  S.storyMode = false;
  S.storyResolveHook = null;
  S.result = null;
  $("overlay").classList.add("hidden");
  $("menu-scr").classList.add("hidden");
  $("game-scr").classList.add("hidden");
  $("story-scr").classList.remove("hidden");
  buildStoryChapterList();
  /* 默认选中第一个未通关的关（全部通关则选中最后一关） */
  selectStoryChapter(Math.min(loadProgress(), getChapters().length - 1));
  SFX.tap();
}

export function startStory(idx) {
  const ch = CHAPTERS[idx];
  if (!ch) return openStory();
  stopBgm();
  S.storyMode = true;
  S.storyChapter = idx;
  S.storyScript = Array.isArray(ch.script) ? ch.script : null;
  S.storyScriptIdx = 0;
  S.storyAiDiff = (ch.ai && ch.ai.diff) || "简单";
  S.storyAi = ch.script === "ai";
  S.storyGoal = ch.goal || null;
  S.storySolve = ch.solve || null;
  S.storyDodgeCount = 0;
  S.gameMode = "pve";
  S.timerMax = ch.roundTime || ROUND_TIME;
  const ph = S.hero;
  const ah = HEROES[0];                     // 木人占位用首个标准角色
  S.gs = newState(ph, ah);
  if (ch.startPlayer) {
    S.gs.player.qi = ch.startPlayer.qi;
    S.gs.player.shield = ch.startPlayer.shield;
    S.gs.player.pos = ch.startPlayer.pos;
  }
  if (ch.startAi) {
    S.gs.ai.qi = ch.startAi.qi;
    S.gs.ai.shield = ch.startAi.shield;
    S.gs.ai.pos = ch.startAi.pos;
  }
  S.phase = "select"; S.pending = null; S.aiMove = null;
  S.timer = S.timerMax; S.report = null; S.result = null; S.fbMsg = null;
  S.pendingResult = null; S.revealDur = REVEAL_TIME;
  S.clashed = false;
  S.cancelled = { player: false, ai: false };
  S.myNonce = null; S.revealSent = false; S.peerStaleSince = 0; S.netErr = 0;
  $("p-name").textContent = ph.name + " · 你";
  $("ai-name").textContent = ch.title || "木人";
  $("fx").innerHTML = "";
  $("overlay").classList.add("hidden");
  $("menu-scr").classList.add("hidden");
  $("story-scr").classList.add("hidden");
  $("game-scr").classList.remove("hidden");
  S.mode = "game";
  SFX.start();
  /* 自检钩子：每回合结算后判定通关/失败。
     关键：过程性目标（聚气/走位/命中/护体）未达标时，只要对局尚未结束、
     且剧本未走完，就静默进入下一回合继续玩——绝不能当场判失败重开，
     否则教学关会无限循环。但剧本若已走完仍未达标，则判失败重开。 */
  S.storyResolveHook = () => {
    const result = S.pendingResult;
    const g = S.storyGoal;
    if (!g) return;
    const pm = S.report ? S.report.pm : null;
    let pass = false;
    let settled = !!result;                 // 对局是否已自然结束（有胜负）
    if (g.kind === "win")            pass = result === "win";
    else if (g.kind === "qi")        pass = S.gs.player.qi >= g.target;
    else if (g.kind === "dodge")     pass = (S.storyDodgeCount || 0) >= g.target;
    else if (g.kind === "hit")       pass = !!(S.report && pm === g.move && S.report.ad > 0);
    else if (g.kind === "shield_block") {
      /* 硬接守护：仅当木人本回合真出了目标招（震山掌）才判定——挡下则过，躲开/被杀则重来 */
      if (S.aiMove === g.move) {
        settled = true;
        pass = !!(S.report && S.gs.player.pos === "ground" && S.report.pd === 0 && S.gs.dead.player !== true);
      }
    }
    /* 剧本式关卡：当回合超过剧本长度仍未达成 → 判失败（剧本已走完，无悬念） */
    if (!pass && !settled && Array.isArray(S.storyScript)) {
      const lastRound = S.storyScript.reduce((m, x) => Math.max(m, x.round), 0);
      if (S.gs.round >= lastRound) settled = true;
    }
    if (pass) return void setTimeout(passStory, 400);
    if (settled) setTimeout(failStory, 400);   // 对局已结束仍未达标 → 回关卡选择
    /* 否则：对局未结束 → 静默继续下一回合 */
  };
  /* 纯对白幕：放完对白即算此关通关；战斗幕：引入对白点完才开始选招计时 */
  if (ch.type === "dialog") {
    showDialog(ch.lines, () => storyChapterDone(idx));
  } else {
    showDialog(ch.intro, () => { S.phase = "select"; S.timer = S.timerMax; render(); });
  }
  render();
}

/* ══════════ 故事界面（独立路由） ══════════ */
let storySelectedIdx = 0;

/* 一幕结束回到关卡选择界面：selIdx 为返回后默认选中的关 */
function backToStorySelect(selIdx) {
  S.storyMode = false;
  S.storyResolveHook = null;
  S.result = null;
  S.mode = "story";
  $("overlay").classList.add("hidden");
  $("game-scr").classList.add("hidden");
  $("story-scr").classList.remove("hidden");
  buildStoryChapterList();
  selectStoryChapter(Math.max(0, Math.min(selIdx, getChapters().length - 1)));
  startBgm();
}

/* 对白幕放完：记进度（只增不减），回选择界面并选中下一关 */
function storyChapterDone(idx) {
  saveProgress(Math.max(idx + 1, loadProgress()));
  backToStorySelect(idx + 1);
}

function buildStoryChapterList() {
  const ul = $("story-chap-list");
  if (!ul) return;
  ul.innerHTML = "";
  const progress = loadProgress();        // 已通关关数（含正在打的那一关之前的）
  const total = getChapters().length;
  getChapters().forEach((ch, idx) => {
    const li = document.createElement("li");
    li.className = "sch";
    /* 解锁规则：已通关的关（idx < progress）可随时复通；
       紧邻下一关（idx === progress）可挑战；其余未开。 */
    const unlocked = idx <= Math.max(0, progress);
    const passed = idx < progress;
    if (!unlocked) li.classList.add("locked");
    li.dataset.idx = String(idx);
    li.innerHTML =
      '<span class="sch-name">' + ch.title + '</span>' +
      '<span class="sch-status">' + (passed ? "已过" : (unlocked ? "" : "未开")) + '</span>';
    li.addEventListener("click", () => {
      if (li.classList.contains("locked")) return;
      selectStoryChapter(idx);
    });
    ul.appendChild(li);
  });
  /* progress 永远不超过 total（saveProgress 端已 clamp，这里兜底） */
  void total;
}

function selectStoryChapter(idx) {
  storySelectedIdx = idx;
  S.storyChapter = idx;
  /* 视觉高亮当前选中 */
  document.querySelectorAll("#story-chap-list .sch").forEach((el, i) => {
    el.classList.toggle("active", i === idx);
  });
  /* 渲染右侧详情 */
  const ch = getChapters()[idx];
  if (!ch) return;
  $("sd-num").textContent = "第 " + (idx + 1) + " 课";
  $("sd-title").textContent = ch.title;
  $("sd-tagline").textContent = ch.tagline || "";
  $("sd-goal").textContent = ch.goal ? ch.goal.text : "听一段江湖往事";
  $("sd-acts").innerHTML = ch.acts
    ? ch.acts.replace(/「/g, '<span class="hl">「').replace(/」/g, '」</span>')
    : "";
  /* 入局按钮：未通关或已通关都可点（已通关显示"复通此关"） */
  const passed = idx < loadProgress();
  const enterBtn = $("sd-enter");
  enterBtn.textContent = passed ? "复 通 此 关 (Enter)" : "入 局 (Enter)";
}

export function storyBack() {
  S.mode = "menu";
  $("story-scr").classList.add("hidden");
  $("menu-scr").classList.remove("hidden");
  SFX.tap();
  startBgm();
}

/* 从故事界面"入局/复通此关"按钮进入实际对局（对白幕同样可入） */
export function enterStoryChapter(idx) {
  const ch = getChapters()[idx];
  if (!ch) return;
  if (idx > loadProgress()) return;      // 未解锁的关不可入
  startStory(idx);
}

/* 剧情战斗中 ESC 中途退出：回关卡选择界面，不记进度 */
export function exitStory() {
  backToStorySelect(S.storyChapter);
}

/* 对白推进的回调：直接交给 render.showDialog */
function showDialog(lines, onDone) {
  renderShowDialog(lines, onDone);
}
function passStory() {
  if (!S.storyMode || S.mode !== "game") return;
  const ch = CHAPTERS[S.storyChapter];
  const idx = S.storyChapter;
  /* 通关后存"已通关数"= 当前关索引 + 1，只增不减 */
  saveProgress(Math.max(idx + 1, loadProgress()));
  const lines = [];
  if (ch.pass)  lines.push(ch.pass);
  if (ch.pass2) lines.push(ch.pass2);
  if (ch.pass3) lines.push(ch.pass3);
  $("overlay").classList.add("hidden");   // 防止胜负遮罩压住通关对白
  showDialog(lines, () => backToStorySelect(idx + 1));
}
function failStory() {
  if (!S.storyMode || S.mode !== "game") return;
  const ch = CHAPTERS[S.storyChapter];
  const idx = S.storyChapter;
  $("overlay").classList.add("hidden");
  if (ch.fail) showDialog([ch.fail], () => backToStorySelect(idx));
  else backToStorySelect(idx);
}

/* 剧情每回合对手出招：脚本模式按表查找，AI 模式返回 null（让 aiChoose 接手） */
export function storyMove() {
  if (!S.storyMode) return null;
  if (S.storyAi) return null;
  const r = S.gs.round;
  const sc = (S.storyScript || []).find(x => x.round === r);
  if (!sc) return null;
  /* 举牌告示作为本回合第一条 log（在该回合首次 renderLog 时显示） */
  if (sc.banner) {
    S.gs.log.push("【" + sc.banner + "】");
  }
  /* 兜底：脚本招气不足时回退吐纳，绝不"没气硬放大招" */
  const aiMove = sc.move;
  if (heroCost(S.gs.ai.hero, aiMove) > S.gs.ai.qi) return "吐纳";
  return aiMove;
}

/* 剧情二课走位：玩家位置须落在 avoid 集合之外，记一次成功躲避 */
export function storyCheckDodge() {
  if (!S.storyMode) return;
  if (S.storyGoal && S.storyGoal.kind === "dodge") {
    const sc = (S.storyScript || []).find(x => x.round === S.gs.round);
    if (!sc) return;
    const aiMove = sc.move;
    /* 落点：袖箭仅中平地、剑风扫屋脊+平地、震山掌扫平地+水底 → 玩家存活即躲掉 */
    if (aiMove === "袖箭" && S.gs.player.pos !== "ground") S.storyDodgeCount = (S.storyDodgeCount || 0) + 1;
    else if (aiMove === "剑风" && S.gs.player.pos !== "sky" && S.gs.player.pos !== "ground") S.storyDodgeCount = (S.storyDodgeCount || 0) + 1;
    else if (aiMove === "震山掌" && S.gs.player.pos !== "ground" && S.gs.player.pos !== "underground") S.storyDodgeCount = (S.storyDodgeCount || 0) + 1;
  }
}

export function getStoryProgress() { return loadProgress(); }
export function getChapters() { return CHAPTERS; }

export function toMenu() {
  if (S.gameMode === "pvp") net.leaveRoom();
  S.mode = "menu"; S.result = null; S.gameMode = "pve";
  S.storyMode = false; S.storyResolveHook = null;
  $("overlay").classList.add("hidden");
  $("game-scr").classList.add("hidden");
  $("menu-scr").classList.remove("hidden");
  const sp = document.getElementById("story-picker");
  if (sp) sp.classList.add("hidden");
  const ss = document.getElementById("story-scr");
  if (ss) ss.classList.add("hidden");
  SFX.tap();
  startBgm();
}
