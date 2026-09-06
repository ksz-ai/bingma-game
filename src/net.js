/* ══════════ 联机客户端：公共 MQTT 中继（EMQX 免费公共服务器） ══════════
   serverless 函数无状态，房间状态改存 broker 的保留消息：
   每人一个主题 bingma/v1/<房号>/p1|p2，发布自己最新状态（retain），
   订阅对方主题即时收状态。承诺-亮牌防偷看：先发哈希，双方都承诺后才亮明文。 */
import mqtt from "mqtt";

const BROKER = "wss://broker-cn.emqx.io:8084/mqtt";
const NS = "bingma/v1/";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 5;
const PEER_STALE = 8000;    // 对方状态超过此毫秒数视为掉线
const BEAT_MS = 3000;       // 心跳：定期重发自己状态（刷新对方视角的在线时间）
const TICK_MS = 1000;

let client = null, code = null, you = null, token = null;
let my = null;              // 我方最新状态（自己发布的内容）
let peer = null;            // 对方最新状态（订阅所得）
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
  return new Promise((resolve, reject) => {
    if (!client || !client.connected) return reject(new Error("联机连接未就绪"));
    my.t = Date.now();
    client.publish(myTopic(), JSON.stringify(my),
      { retain: true, qos: 1 }, err => (err ? reject(err) : resolve()));
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKER, {
      clientId: "bm_" + Math.random().toString(36).slice(2, 12),
      clean: true, keepalive: 30,
      reconnectPeriod: 2500, connectTimeout: 8000,
      will: { topic: myTopic(), payload: JSON.stringify({ v: 1, bye: 1 }),
              retain: true, qos: 0 },
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
    c.on("close", () => { if (settled && onErrorCb) onErrorCb(new Error("联机连接中断，重连中…")); });
  });
}

function onMessage(t, payload) {
  if (probing || !code || t !== peerTopic()) return;
  let m; try { m = JSON.parse(payload.toString()); } catch { return; }
  if (!m || typeof m !== "object" || !m.tok) return;
  if (!pinnedPeerTok && !m.bye) pinnedPeerTok = m.tok;
  if (pinnedPeerTok && m.tok !== pinnedPeerTok) return;  // 非锁定对手的消息一律忽略
  peer = m;
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
  client = null; my = null; peer = null; pinnedPeerTok = null;
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
  if (!host || host.bye || Date.now() - (host.t || 0) > PEER_STALE)
    return fail("房号不存在或已过期");
  if (other && !other.bye && Date.now() - (other.t || 0) < PEER_STALE)
    return fail("房间已有人，无法加入");
  peer = host; pinnedPeerTok = host.tok;
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
  client = null; my = null; peer = null; pinnedPeerTok = null;
  code = null; you = null; token = null;
  if (!c) return;
  await new Promise(r => {
    let done = false;
    const fin = () => { if (!done) { done = true; try { c.end(); } catch {} r(); } };
    setTimeout(fin, 600);
    try {
      if (c.connected) c.publish(t, bye, { retain: true, qos: 0 }, fin);
      else fin();
    } catch { fin(); }
  });
}

export function startPolling(onState, onError) {
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
  onStateCb = null; onErrorCb = null;
}

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
  return {
    ok: true, you, round: my ? my.round : 1,
    peerJoined: !!live,
    peerSeen: !!live && Date.now() - (peer.t || 0) < PEER_STALE,
    myAck: !!(my && my.ack), peerAck: !!(live && peer.ack),
    myCommit: my ? my.commit : null,
    peerCommit: live ? peer.commit : null,
    myReveal: my ? my.reveal : null,
    peerReveal: live ? peer.reveal : null,
  };
}
