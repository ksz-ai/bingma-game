/* ══════════ 渲染：每帧把 S 刷到 DOM ══════════ */
import { $, now } from "./util.js";
import { SKILLS, POS_NAMES, S } from "./state.js";

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
  SKILLS.forEach(([name, , cost], i) => {
    const b = nodes[i];
    const affordable = S.gs.player.qi >= cost;
    b.classList.toggle("locked", !affordable);
    b.classList.toggle("selected", name === S.pending);
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

export function render() {
  if (S.mode === "menu") {
    document.querySelectorAll(".diff-btn").forEach(b =>
      b.classList.toggle("hot", b.dataset.d === S.selectedDiff));
    return;
  }
  renderHeader();
  renderCards();
  renderTokens();
  renderSkills();
  renderLog();
  renderFeedback();
}
