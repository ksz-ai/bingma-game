/* ══════════ 联机客户端：公共 MQTT 中继（EMQX 免费公共服务器） ══════════
   serverless 函数无状态，房间状态改存 broker 的保留消息：
   每人一个主题 bingma/v1/<房号>/p1|p2，发布自己最新状态（retain），
   订阅对方主题即时收状态。承诺-亮牌防偷看：先发哈希，双方都承诺后才亮明文。 */
import mqtt from "mqtt";

const BROKER = "wss://broker-cn.emqx.io:8084/mqtt";
const NS = "bingma/v1/";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 5;
const PEER_STALE = 15000;   // 超过此毫秒数未收到对方消息视为失联（心跳 3s，容忍连丢 5 拍）
const HOST_STALE = 180000;  // 加入时房主状态的最大年龄（只挡真正死掉的幽灵房间；在线与否由收信时刻判断）
const PUB_WAIT = 12000;     // 断线时发布重试上限：mqtt.js 每 2.5s 自动重连，抖动不该判死
const BEAT_MS = 3000;       // 心跳：定期重发自己状态（刷新对方视角的在线时间）
const TICK_MS = 1000;

let client = null, code = null, you = null, token = null;
let my = null;              // 我方最新状态（自己发布的内容）
let peer = null;            // 对方最新状态（订阅所得）
let peerLastRecv = 0;       // 本机最近一次收到对方消息的时刻（不受对方设备时钟影响）
let pinnedPeerTok = null;   // 锁定的对手身份，防止第三者冒名顶替
let onStateCb = null, onErrorCb = null;
let beatTimer = 0, tickTimer = 0;
let probing = false;

const genCode = () => Array.from({ length: CODE_LEN }, () =>
  CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const genToken = () => Math.random().toString(36).slice(2, 12);
const topic = side => NS + code + "/" + side;
const myTopic = () => topic(you);
const peerTopic = () => topic(you === "p1" ? "p2" : "p1");

export async function moveHash(move, nonce) {
  const buf = await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(move + "|" + nonce));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function randNonce() { return Math.random().toString(36).slice(2, 12); }
export function roomCode() { return code; }

function freshState(round) {
  return { v: 1, t: Date.now(), tok: token, bye: 0, round,
           commit: null, reveal: null, ack: 0 };
}

function publishMy() {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("联机连接未就绪"));
    const retry = () => (Date.now() - started > PUB_WAIT ? fail() : setTimeout(attempt, 300));
    const attempt = () => {
      if (!client) return reject(new Error("房间已失效"));
      if (!client.connected) return retry();      // 断线重连中：等待而非立刻失败，出招不因抖动作废
      let done = false;
      const watchdog = setTimeout(() => {          // 发布恰逢断线时回执会丢：3s 无确认则重试
        if (done) return;
        done = true; retry();
      }, 3000);
      my.t = Date.now();
      client.publish(myTopic(), JSON.stringify(my),
        { retain: true, qos: 1 }, err => {
          if (done) return;
          done = true; clearTimeout(watchdog);
          if (err) return retry();
          resolve();
        });
    };
    attempt();
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKER, {
      clientId: "bm_" + Math.random().toString(36).slice(2, 12),
      clean: true, keepalive: 30,
      reconnectPeriod: 2500, connectTimeout: 8000,
      /* 遗嘱故意不带 tok：断线触发的 bye 会被对方过滤器忽略（无 tok），
         走"失联→宽限→重连恢复"路径；主动离场（leaveRoom）的 bye 才带 tok */
      will: { topic: myTopic(), payload: JSON.stringify({ v: 1, bye: 1 }),
              retain: true, qos: 1 },
    });
    let settled = false;
    const to = setTimeout(() => {
      if (settled) return; settled = true;
      c.end(true); reject(new Error("联机服务器连接超时，请稍后再试"));
    }, 9000);
    c.on("connect", () => {
      if (settled) return; settled = true; clearTimeout(to); resolve(c);
    });
    c.on("error", e => {
      if (settled) return; settled = true; clearTimeout(to);
      c.end(true); reject(new Error("联机服务器连接失败"));
    });
    c.on("message", onMessage);
    c.on("close", () => {
    S.isReconnecting = true;  // 标记重连状态，engine 层不累积错误计数
    if (settled && onErrorCb) onErrorCb(new Error("联机连接中断，重连中…"));
  });
    c.on("connect", () => {
    if (my && !probing) {
      publishMy().catch(() => {});
      if (onReconnectCb) onReconnectCb();
    }
  });  // 重连成功立即补发状态并通知引擎
  });
}

function onMessage(t, payload) {
  if (probing || !code || t !== peerTopic()) return;
  let m; try { m = JSON.parse(payload.toString()); } catch { return; }
  if (!m || typeof m !== "object" || !m.tok) return;   // 无 tok：断线遗嘱，走失联宽限路径
  if (m.bye) {                                          // 对手主动退出：释放对手位，好让新人接管
    if (!pinnedPeerTok || m.tok === pinnedPeerTok) { peer = null; pinnedPeerTok = null; }
    tick(); return;
  }
  if (!pinnedPeerTok) pinnedPeerTok = m.tok;
  if (m.tok !== pinnedPeerTok) return;  // 非锁定对手的消息一律忽略
  peer = m;
  peerLastRecv = Date.now();
  tick();
}

/* 订阅若干主题并等待一小段时间，收集保留消息（用于建房查重 / 加入前验房） */
function probeRetained(c, topics, ms) {
  return new Promise(resolve => {
    const got = {};
    const h = (t, p) => { got[t] = p.toString(); };
    c.on("message", h);
    c.subscribe(topics, { qos: 0 }, () => {
      setTimeout(() => {
        c.unsubscribe(topics);
        c.off("message", h);
        resolve(got);
      }, ms);
    });
  });
}
const parseState = raw => {
  if (!raw) return null;
  try { const m = JSON.parse(raw); return m && typeof m === "object" ? m : null; }
  catch { return null; }
};

async function tearDown() {
  stopPolling();
  if (client) { try { client.end(); } catch { /* 已断开 */ } }
  client = null; my = null; peer = null; peerLastRecv = 0; pinnedPeerTok = null;
}

export async function createRoom() {
  await tearDown();
  for (let attempt = 0; attempt < 6; attempt++) {
    code = genCode(); you = "p1"; token = genToken();
    peer = null; pinnedPeerTok = null;
    client = await connect();
    probing = true;
    const got = await probeRetained(client, [topic("p1"), topic("p2")], 1200);
    probing = false;
    if (Object.keys(got).length) {   // 房号已被占用（含残留），换号重试
      client.end(); client = null; continue;
    }
    client.subscribe(peerTopic(), { qos: 1 });
    my = freshState(1);
    await publishMy();
    return code;
  }
  code = null; you = null; token = null;
  throw new Error("房号分配失败，请重试");
}

export async function joinRoom(inputCode) {
  await tearDown();
  code = String(inputCode || "").trim().toUpperCase();
  if (code.length !== CODE_LEN) throw new Error("房号须为 " + CODE_LEN + " 位");
  you = "p2"; token = genToken(); peer = null; pinnedPeerTok = null;
  client = await connect();
  probing = true;
  const got = await probeRetained(client, [topic("p1"), topic("p2")], 1500);
  probing = false;
  const host = parseState(got[topic("p1")]);
  const other = parseState(got[topic("p2")]);
  const fail = msg => { client.end(); client = null; code = null; you = null; token = null; throw new Error(msg); };
  if (!host || host.bye || Date.now() - (host.t || 0) > HOST_STALE)
    return fail("房号不存在或已过期");
  if (other && !other.bye && Date.now() - (other.t || 0) < PEER_STALE)
    return fail("房间已有人，无法加入");
  peer = host; pinnedPeerTok = host.tok; peerLastRecv = Date.now();
  client.subscribe(peerTopic(), { qos: 1 });
  my = freshState(1);
  await publishMy();
  return code;
}

export async function commitMove(move, nonce) {
  if (!my) throw new Error("房间已失效");
  my.commit = await moveHash(move, nonce);
  my.reveal = null; my.ack = 0;
  await publishMy();
}

export async function revealMove(move, nonce) {
  if (!my) throw new Error("房间已失效");
  my.reveal = { move, nonce };
  await publishMy();
}

export async function nextRound() {
  if (!my) throw new Error("房间已失效");
  my.ack = 1;
  await publishMy();
}

export async function leaveRoom() {
  stopPolling();
  const c = client, t = code ? myTopic() : null;
  const bye = JSON.stringify({ v: 1, bye: 1, tok: token });
  client = null; my = null; peer = null; peerLastRecv = 0; pinnedPeerTok = null;
  code = null; you = null; token = null;
  if (!c) return;
  await new Promise(r => {
    let done = false;
    const fin = () => { if (!done) { done = true; try { c.end(); } catch {} r(); } };
    setTimeout(fin, 600);
    try {
      if (c.connected) c.publish(t, bye, { retain: true, qos: 1 }, fin);
      else fin();
    } catch { fin(); }
  });
}

export function startPolling(onState, onError, onReconnect) {
  onStateCb = onState; onErrorCb = onError;
  clearInterval(beatTimer); clearInterval(tickTimer);
  beatTimer = setInterval(() => {
    if (my && client && client.connected) publishMy().catch(() => {});
  }, BEAT_MS);
  tickTimer = setInterval(tick, TICK_MS);
  tick();
}

export function stopPolling() {
	  clearInterval(beatTimer); clearInterval(tickTimer);
	  beatTimer = 0; tickTimer = 0;
	  onStateCb = null; onErrorCb = null; onReconnectCb = null;
	}

/* 手机切后台回前台：立即补心跳，缩短被对方误判失联的窗口 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && my && client) { publishMy().catch(() => {}); tick(); }
  });
}

/* 仅供自动化测试：暴露内部客户端以模拟断线 */
export function _debug() { return { client, my, peer }; }

function tick() {
  if (!my) return;
  /* 回合推进：双方都确认 → 开下一回合；对手已进入更新的回合 → 追平 */
  if (peer && !peer.bye) {
    if (my.ack && my.reveal && peer.ack && peer.reveal && peer.round === my.round) {
      my = freshState(my.round + 1);
      publishMy().catch(() => {});
    } else if (peer.round > my.round) {
      my = freshState(peer.round);
      publishMy().catch(() => {});
    }
  }
  if (onStateCb) onStateCb(buildState());
}

function buildState() {
  const live = peer && !peer.bye;
  /* 在线判定用"本机最后一次收到对方消息的时刻"，与对方设备时钟无关 */
  const seen = !!live && peerLastRecv > 0 && Date.now() - peerLastRecv < PEER_STALE;
  return {
    ok: true, you, round: my ? my.round : 1,
    peerJoined: !!live,
    peerSeen: seen,
    myAck: !!(my && my.ack), peerAck: !!(live && peer.ack),
    myCommit: my ? my.commit : null,
    peerCommit: live ? peer.commit : null,
    myReveal: my ? my.reveal : null,
    peerReveal: live ? peer.reveal : null,
  };
}
