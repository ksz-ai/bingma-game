/* ══════════ 渲染：每帧把 S 刷到 DOM ══════════ */
import { $, now } from "./util.js";
import { SKILLS, POS_NAMES, heroCost, S } from "./state.js";

/* ══════════ 角色剪影：按江湖名号切换不同水墨造型 ══════════ */
/* 三个角色共用一套人体比例（viewBox 64x72），头-躯干-四肢连续闭合，
   整体矮壮有力，武器收在轮廓内，避免被卡片或棋子圆圈裁切 */
const HERO_SKIN = {
  swordsman:
    /* 云隐剑客：束发髻、宽袍、背剑 */
    '<g fill="#191714">' +
      /* 发髻 */
      '<circle cx="32" cy="7" r="3.8"/>' +
      '<path d="M29,4 q3,-4 6,0 q-2,2 -6,0 Z"/>' +
      /* 头部 */
      '<circle cx="32" cy="13.5" r="7.4"/>' +
      /* 躯干+双腿（一体，矮壮） */
      '<path d="M24,20 Q32,18 40,20 Q43,26 42,34 L44,48 L49,68 L40,68 L38,52 L36,68 L28,68 L26,52 L24,68 L15,68 L20,48 L21,34 Q20,26 24,20 Z"/>' +
      /* 左臂 */
      '<path d="M23,23 Q16,28 15,37 L19,38 Q21,31 26,27 Z"/>' +
      /* 右臂按剑 */
      '<path d="M41,23 Q48,28 49,36 L45,37 Q43,31 38,27 Z"/>' +
      /* 剑柄 */
      '<circle cx="45" cy="26" r="3"/>' +
    "</g>" +
    /* 长剑背于身后 */
    '<path d="M45,26 L56,7" stroke="#38332B" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '<path d="M54,10 L58,5 L56,12 Z" fill="#38332B"/>' +
    /* 腰带与剑穗 */
    '<path d="M22,42 L42,40" stroke="#A63A2B" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '<path d="M37,42 q3,5 1,12" stroke="#A63A2B" stroke-width="2" stroke-linecap="round" fill="none"/>',
  monk:
    /* 铁衣武僧：光头、宽肩、合十、手持短禅杖 */
    '<g fill="#191714">' +
      /* 光头 */
      '<circle cx="32" cy="12.5" r="7.8"/>' +
      /* 耳朵 */
      '<ellipse cx="23" cy="13.5" rx="2.2" ry="3.2"/>' +
      '<ellipse cx="41" cy="13.5" rx="2.2" ry="3.2"/>' +
      /* 躯干+双腿（最宽最矮） */
      '<path d="M20,21 Q32,18 44,21 Q48,28 47,36 L49,50 L53,68 L43,68 L41,54 L39,68 L31,68 L29,54 L27,68 L17,68 L20,50 L21,36 Q20,28 20,21 Z"/>' +
      /* 合十的双臂 */
      '<path d="M25,25 L32,43 L39,25 Q35,23 32,24 Q29,23 25,25 Z"/>' +
      '<path d="M28,25 L32,39 L36,25" fill="none" stroke="#38332B" stroke-width="1.2"/>' +
    "</g>" +
    /* 袈裟 */
    '<path d="M19,37 Q32,33 45,37 L44,52 Q32,56 20,52 Z" fill="#191714"/>' +
    '<path d="M22,40 Q32,37 42,40" stroke="#8A6D3B" stroke-width="1.5" fill="none"/>' +
    '<path d="M21,46 Q32,43 43,46" stroke="#8A6D3B" stroke-width="1.5" fill="none"/>' +
    /* 佛珠 */
    '<circle cx="32" cy="32" r="2" fill="#8A6D3B"/>' +
    '<circle cx="27" cy="34" r="1.8" fill="#8A6D3B"/>' +
    '<circle cx="37" cy="34" r="1.8" fill="#8A6D3B"/>' +
    '<circle cx="32" cy="38" r="2" fill="#8A6D3B"/>' +
    /* 短禅杖（竖立身侧，不超出 viewBox） */
    '<path d="M50,18 L50,68" stroke="#191714" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M46,26 h8 M46,36 h8 M46,46 h8" stroke="#8A6D3B" stroke-width="1.5"/>' +
    '<path d="M46,16 q6,-5 12,0 q-6,5 -12,0 Z" fill="#8A6D3B"/>',
  assassin:
    /* 暗影刺客：兜帽、蒙面、前倾、右手前探短刃 */
    '<g fill="#191714">' +
      /* 兜帽 */
      '<path d="M20,11 Q22,-2 32,-2 Q42,-2 44,11 Q45,18 41,22 Q37,27 32,27 Q27,27 23,22 Q19,18 20,11 Z"/>' +
      /* 面罩 */
      '<path d="M24,15 Q28,13 32,15 Q36,13 40,15 Q38,21 32,22 Q26,21 24,15 Z"/>' +
      '<ellipse cx="27" cy="16" rx="1.8" ry="1.1" fill="#F2ECDD"/>' +
      '<ellipse cx="37" cy="16" rx="1.8" ry="1.1" fill="#F2ECDD"/>' +
      /* 躯干+双腿（一体，前倾） */
      '<path d="M23,24 Q32,22 41,24 Q43,31 42,39 L44,51 L48,68 L39,68 L37,54 L35,68 L28,68 L26,54 L24,68 L15,68 L19,51 L20,39 Q19,31 23,24 Z"/>' +
      /* 后收左臂 */
      '<path d="M22,27 Q15,33 15,42 L19,42 Q20,35 26,30 Z"/>' +
      /* 前探右臂+短刃 */
      '<path d="M41,27 Q49,31 51,39 L47,41 Q45,35 39,31 Z"/>' +
      '<path d="M50,38 L60,35" stroke="#38332B" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
      '<path d="M49,37 L53,35 L52,41 Z" fill="#191714"/>' +
    "</g>" +
    /* 腰带 */
    '<path d="M22,46 L42,44" stroke="#A63A2B" stroke-width="2.8" stroke-linecap="round" fill="none"/>' +
    '<path d="M38,45 q3,5 1,12" stroke="#A63A2B" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
    /* 袖箭管 */
    '<path d="M42,29 L51,32" stroke="#38332B" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
};
const DEFAULT_SKIN = "swordsman";

export function skinSVG(heroId, mirror) {
  const inner = HERO_SKIN[heroId] || HERO_SKIN[DEFAULT_SKIN];
  const body = mirror
    ? '<g transform="translate(64,0) scale(-1,1)">' + inner + "</g>"
    : inner;
  return '<svg viewBox="0 0 64 72" aria-hidden="true">' + body + "</svg>";
}

function pipsHTML(n) {
  let h = "";
  for (let i = 0; i < Math.min(n, 5); i++) h += '<span class="pip"></span>';
  if (n > 5) h += '<span class="pip-more">+' + (n - 5) + "</span>";
  return h;
}

function renderCards() {
  $("pq-num").textContent = S.gs.player.qi;
  $("aq-num").textContent = S.gs.ai.qi;
  $("pq-fill").style.width = Math.min(S.gs.player.qi / 10, 1) * 100 + "%";
  $("aq-fill").style.width = Math.min(S.gs.ai.qi / 10, 1) * 100 + "%";
  $("p-pips").innerHTML = pipsHTML(S.gs.player.shield);
  $("a-pips").innerHTML = pipsHTML(S.gs.ai.shield);
}

function renderTokens() {
  [["player", "tok-p"], ["ai", "tok-a"]].forEach(([side, id]) => {
    const st = S.gs[side], tok = $(id);
    tok.classList.remove("pos-sky", "pos-ground", "pos-underground");
    tok.classList.add("pos-" + st.pos);
    tok.querySelector(".pname").textContent = POS_NAMES[st.pos];
    tok.classList.toggle("shielded", st.shield > 0);
    tok.querySelector(".sbadge").textContent = "罡" + st.shield;
    /* 按角色切换剪影；仅当角色变化时重建，避免每帧改写 DOM */
    const herId = (st.hero && st.hero.id) || DEFAULT_SKIN;
    if (tok.dataset.skin !== herId) {
      tok.querySelector(".circle").innerHTML = skinSVG(herId, side === "ai");
      tok.dataset.skin = herId;
    }
  });
  $("tok-a").querySelector(".qmark").style.display =
    (S.phase === "select" || S.phase === "waiting") ? "flex" : "none";
}

function renderHeader() {
  $("round-label").textContent = "第 " + S.gs.round + " 回合";
  const ratio = Math.max(0, Math.min(1, S.timer / S.timerMax));
  const fill = $("timer-fill");
  fill.style.width = ratio * 100 + "%";
  fill.style.background = ratio > 0.4 ? "#38332B" : ratio > 0.2 ? "#8A6D3B" : "#A63A2B";
  let txt = "回合结算", col = "#A63A2B";
  if (S.phase === "select") { txt = "请出招"; col = "#6B6355"; }
  else if (S.phase === "waiting") {
    txt = S.gameMode === "pvp"
      ? "已出 [" + S.pending + "] · 等待对手…"
      : "已出 [" + S.pending + "] · 对手蓄势中…";
    col = "#A63A2B";
  } else if (S.phase === "sync") { txt = "对手收招中…"; col = "#6B6355"; }
  $("status").textContent = txt;
  $("status").style.color = col;
}

function renderSkills() {
  const nodes = $("skills").children;
  SKILLS.forEach(([name], i) => {
    const b = nodes[i];
    const cost = heroCost(S.gs.player.hero, name);
    b.classList.toggle("locked", S.gs.player.qi < cost);
    b.classList.toggle("selected", name === S.pending);
    const tag = b.querySelector(".sk-cost");
    if (tag) tag.textContent = cost ? cost + "气" : "免费";
  });
}

function renderLog() {
  const box = $("logbox");
  if (S.phase === "reveal" && S.report) {
    box.className = "settle";
    let h = '<div class="vs-row"><span class="vp">你 · ' + S.report.pm +
            '</span><span class="vv">对 决</span><span class="va">对手 · ' + S.report.am + "</span></div><hr>";
    const lines = S.report.lines.slice(0, 2);
    if (lines.length) {
      lines.forEach((m, i) => { h += '<div class="' + (i === 0 ? "l1" : "l2") + '">› ' + m + "</div>"; });
    } else {
      h += '<div class="old" style="text-align:center">双方对峙，风平浪静</div>';
    }
    box.innerHTML = h;
  } else {
    box.className = "";
    const maxLines = window.matchMedia("(max-width:760px)").matches ? 2 : 4;
    const entries = S.gs.log.slice(-maxLines);
    if (!entries.length) { box.innerHTML = ""; return; }
    box.innerHTML = entries.map((m, i) =>
      '<div class="' + (i < entries.length - 1 ? "old" : "newest") + '">› ' + m + "</div>"
    ).join("");
  }
}

function renderFeedback() {
  const el = $("feedback"), remain = S.fbUntil - now();
  if (S.fbMsg && remain > 0) {
    el.textContent = S.fbMsg;
    el.style.opacity = Math.max(0, Math.min(1, remain / 0.4));
  } else el.style.opacity = 0;
}

/* ══════════ 剧情模式 UI：目标条 + 对白层 ══════════ */
function renderStoryUI() {
  const bar = $("goal-bar"), dlg = $("dialog");
  if (S.storyMode && S.storyGoal) {
    bar.classList.remove("hidden");
    bar.querySelector(".g-text").textContent = S.storyGoal.text;
  } else {
    bar.classList.add("hidden");
  }
  if (!S.storyMode || S.storyPhase !== "select") {
    /* 对白可见性由 setDialogAdvance 控制；这里不强制隐藏 */
  }
}

let dialogLines = [], dialogOnDone = null, dialogIdx = -1;
export function showDialog(lines, onDone) {
  dialogLines = lines || [];
  dialogOnDone = onDone || null;
  dialogIdx = -1;
  advanceDialog();
}
function advanceDialog() {
  dialogIdx++;
  if (dialogIdx >= dialogLines.length) {
    $("dialog").classList.add("hidden");
    const cb = dialogOnDone; dialogOnDone = null;
    cb && cb();
    return;
  }
  const ln = dialogLines[dialogIdx];
  $("dialog").classList.remove("hidden");
  $("dialog").querySelector(".dlg-who").textContent = ln.who || "";
  $("dialog").querySelector(".dlg-text").textContent = ln.text || "";
}
export function bindDialogClicks() {
  const dlg = $("dialog");
  if (!dlg) return;
  dlg.addEventListener("click", () => advanceDialog());
}

export function render() {
  if (S.mode === "menu") {
    document.querySelectorAll(".diff-btn").forEach(b =>
      b.classList.toggle("hot", b.dataset.d === S.selectedDiff));
    document.querySelectorAll(".hero-btn").forEach(b =>
      b.classList.toggle("hot", b.dataset.id === S.hero.id));
    return;
  }
  renderHeader();
  renderCards();
  renderTokens();
  renderSkills();
  renderLog();
  renderFeedback();
  renderStoryUI();
}
