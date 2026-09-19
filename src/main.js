/* ══════════ 入口：DOM 构建、输入绑定、主循环 ══════════ */
import "./style.css";
import { $ } from "./util.js";
import { SKILLS, KEYMAP, DIFFS, HEROES, S } from "./state.js";
import { trySelect, startGame, toMenu, update, handleNetState, handleNetError, startStory, getChapters } from "./engine.js";
import { SFX, toggleMute, startBgm, isBgmOn } from "./audio.js";
import { render, bindDialogClicks, showDialog } from "./render.js";
import { skinSVG } from "./render.js";
import * as net from "./net.js";
import { loadProgress } from "./story.js";

bindDialogClicks();

/* ══════════ 菜单规则表 ══════════ */
function buildMenu() {
  const rules = [
    ["吐纳(1)", "气 +1"],
    ["轻功(2) / 遁地(3)", "上屋脊、入水底避险，每回合归位"],
    ["袖箭(4)", "耗 1 气 · 1 伤 · 仅中平地"],
    ["剑风(5) / 震山掌(6)", "耗 3 气 · 3 伤 · 各扫两处"],
    ["金钟罩(7)", "耗 3 气 · 罡气 +3，跨回合保留"],
    ["万剑归宗(8)", "耗 7 气 · 一招制胜！"],
    ["相抵", "两招同时命中且伤值相同，互不受伤"],
    ["胜负", "罡气挡不住伤害，当即落败"],
  ];
  const wrap = $("rule-rows");
  rules.forEach(([n, d]) => {
    const row = document.createElement("div");
    row.className = "rule-row";
    row.innerHTML = '<span class="rn">' + n + '</span><span class="rd">' + d + "</span>";
    wrap.appendChild(row);
  });
}
buildMenu();

/* ══════════ 角色选择构建 ══════════ */
function buildHeroRow() {
  const wrap = $("hero-row");
  HEROES.forEach(h => {
    const b = document.createElement("button");
    b.className = "hero-btn";
    b.dataset.id = h.id;
    b.innerHTML =
      '<span class="hm">' + skinSVG(h.id, false) + '</span>' +
      '<span class="hv">' + h.name + '</span>' +
      '<span class="ht">' + h.tagline + "</span>";
    b.addEventListener("click", () => {
      S.hero = h; SFX.tap(); render();
      const el = $("hero-desc");
      if (el) el.textContent = h.desc;
    });
    wrap.appendChild(b);
  });
  const d = $("hero-desc");
  if (d) d.textContent = HEROES[0].desc;
}
buildHeroRow();

/* ══════════ 技能按钮构建 ══════════ */
SKILLS.forEach(([name, key, cost, desc]) => {
  const b = document.createElement("button");
  b.className = "skill";
  b.innerHTML =
    '<span class="sk-name">' + name + '</span>' +
    '<span class="sk-cost">' + (cost ? cost + "气" : "免费") + '</span>' +
    '<span class="sk-desc">' + desc + '</span>' +
    '<span class="sk-key">' + key + "</span>";
  b.addEventListener("click", () => {
    if (S.mode === "game" && !S.result && S.phase === "select") trySelect(name);
  });
  $("skills").appendChild(b);
});

/* ══════════ 输入绑定 ══════════ */
document.querySelectorAll(".diff-btn").forEach(b =>
  b.addEventListener("click", () => { S.selectedDiff = b.dataset.d; SFX.tap(); }));

/* 浏览器限制音频须在用户交互后启动：首次点按即在主页奏琴 */
function onFirstGesture() { if (S.mode === "menu" && !isBgmOn()) startBgm(); }
addEventListener("pointerdown", onFirstGesture);
addEventListener("keydown", onFirstGesture);

$("btn-start").addEventListener("click", () => startGame());
$("btn-retry").addEventListener("click", () => startGame());
$("btn-menu").addEventListener("click", toMenu);
$("btn-sound").addEventListener("click", toggleMute);

/* ══════════ 剧情入口：关卡选择面板 ══════════
   点「初入兵马」不再直接开打，而是弹面板选具体关卡；
   持久化进度用于解锁（已通关即视为解锁），未通关关卡灰显不能点。 */
function openStoryPicker() {
  const picker = $("story-picker");
  const grid = $("sp-grid");
  grid.innerHTML = "";
  const progress = loadProgress();        // 已通关的最高章节编号（CHAPTERS.length 表示全通关）
  const chapters = getChapters();
  chapters.forEach((ch, idx) => {
    const card = document.createElement("button");
    card.className = "sp-card";
    const unlocked = idx === 0 || idx < progress;
    const passed = idx < progress;
    if (!unlocked) card.classList.add("locked");
    if (passed) card.classList.add("passed");
    const goal = ch.goal ? ch.goal.text : (ch.type === "dialog" ? "听一段江湖往事" : "自由对弈");
    card.innerHTML =
      '<span class="sp-check">✓</span>' +
      '<span class="sp-name">' + ch.title + '</span>' +
      '<span class="sp-goal">' + goal + '</span>';
    card.disabled = !unlocked;
    card.addEventListener("click", () => {
      if (card.disabled) return;
      picker.classList.add("hidden");
      startStory(idx);
    });
    grid.appendChild(card);
  });
  picker.classList.remove("hidden");
  SFX.tap();
}
$("btn-story").addEventListener("click", openStoryPicker);
$("sp-close").addEventListener("click", () => $("story-picker").classList.add("hidden"));

/* Esc 关闭关卡面板 */
function maybeCloseStoryPicker(e) {
  if (e.key === "Escape" && !$("story-picker").classList.contains("hidden")) {
    $("story-picker").classList.add("hidden");
    e.preventDefault();
  }
}
addEventListener("keydown", maybeCloseStoryPicker);

/* ══════════ 联机大厅 ══════════ */
let inLobby = false;

function showLobby() {
  inLobby = true;
  $("menu-scr").classList.add("hidden");
  $("lobby-scr").classList.remove("hidden");
  $("lobby-home").classList.remove("hidden");
  $("lobby-wait").classList.add("hidden");
  lobbyStatus("");
  $("join-code").value = "";
}

function backFromLobby() {
  inLobby = false;
  net.leaveRoom();
  $("lobby-scr").classList.add("hidden");
  $("menu-scr").classList.remove("hidden");
  SFX.tap();
}

function lobbyStatus(msg, err = false) {
  const el = $("lobby-status");
  if (!msg) { el.textContent = "等待对手加入…"; el.className = ""; return; }
  el.textContent = msg;
  el.className = err ? "err" : "";
}

function enterPvp() {
	  inLobby = false;
	  $("lobby-scr").classList.add("hidden");
	  startGame("pvp");
	  net.startPolling(handleNetState, handleNetError, () => {
	    S.isReconnecting = false;
	    S.netErr = 0;
	  });
	}

$("btn-pvp").addEventListener("click", showLobby);
$("btn-lobby-back").addEventListener("click", backFromLobby);

$("btn-host").addEventListener("click", async () => {
  try {
    const code = await net.createRoom();
    $("lobby-home").classList.add("hidden");
    $("lobby-wait").classList.remove("hidden");
    $("room-code").textContent = code;
    lobbyStatus("等待对手加入…把房号发给对方");
    net.startPolling(st => { if (st.peerJoined) { net.stopPolling(); enterPvp(); } }, () => {});
  } catch (e) { lobbyStatus(e.message, true); }
});

$("btn-join").addEventListener("click", async () => {
  const code = $("join-code").value.trim();
  if (code.length !== 5) { $("join-code").focus(); return; }
  try {
    await net.joinRoom(code);
    enterPvp();
  } catch (e) {
    lobbyStatus(e.message, true);
    $("join-code").value = "";
    $("join-code").focus();
  }
});

$("join-code").addEventListener("keydown", e => {
  if (e.key === "Enter") $("btn-join").click();
  e.stopPropagation();
});

addEventListener("keydown", e => {
  if (S.mode === "menu") {
    if (inLobby) {
      if (e.key === "Escape") backFromLobby();
      return;
    }
    if (e.key === "s" || e.key === "S" || e.key === "Enter" || e.key === " ") startGame();
    else if (e.key === "n" || e.key === "N") showLobby();
    else if (e.key === "t" || e.key === "T") openStoryPicker();
    else if (e.key === "d" || e.key === "D" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      S.selectedDiff = DIFFS[(DIFFS.indexOf(S.selectedDiff) + 1) % DIFFS.length];
      SFX.tap();
    }
    return;
  }
  if (e.key === "Escape") {
    /* 剧情对白显示时：ESC 跳过整段对白（不退出游戏）；否则回菜单 */
    const dlg = $("dialog");
    if (S.storyMode && dlg && !dlg.classList.contains("hidden")) {
      dlg.click();
      return;
    }
    toMenu();
    return;
  }
  if (S.result) {
    if (e.key === "r" || e.key === "R") startGame();
    else if (e.key === "m" || e.key === "M") toMenu();
    return;
  }
  if (S.phase !== "select") return;
  const name = KEYMAP[e.key];
  if (name) trySelect(name);
});

/* ══════════ 自适应缩放 + 主循环 ══════════ */
const mqMobile = matchMedia("(max-width: 760px)");
function updateHint() {
  $("hint").textContent = mqMobile.matches
    ? "点击招式牌出招"
    : "数字键或点击招式牌出招 · ESC 收剑回菜单";
}
function fit() {
  if (mqMobile.matches) { $("stage").style.transform = "none"; }
  else {
    const s = Math.min(innerWidth / 800, innerHeight / 600, 1);
    $("stage").style.transform = "scale(" + s + ")";
  }
  updateHint();
}
addEventListener("resize", fit);
if (mqMobile.addEventListener) mqMobile.addEventListener("change", fit);
fit();

let last = performance.now();
function tick(t) {
  const dt = Math.min((t - last) / 1000, 0.1);
  last = t;
  if (S.mode === "game") update(dt);
  render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

if (location.hash.startsWith("#game")) {
  // 调试用：#game 直接进入游戏；?hero=xxx 指定我方角色
  const h = new URLSearchParams(location.search).get("hero");
  if (h) { const found = HEROES.find(x => x.id === h); if (found) S.hero = found; }
  startGame();
}
