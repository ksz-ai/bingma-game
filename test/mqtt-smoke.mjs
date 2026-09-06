/* MQTT 中继冒烟测试：验证 EMQX 公共 broker 连通性、保留消息、QoS1、LWT 遗嘱 */
import mqtt from "mqtt";

const BROKER = "wss://broker-cn.emqx.io:8084/mqtt";
const NS = "bingma/v1/smoke/";
const sleep = ms => new Promise(r => setTimeout(r, ms));

function conn(clientId, will) {
  return new Promise((res, rej) => {
    const c = mqtt.connect(BROKER, {
      clientId, clean: true, reconnectPeriod: 0, connectTimeout: 8000, will,
    });
    const to = setTimeout(() => rej(new Error("connect timeout")), 9000);
    c.on("connect", () => { clearTimeout(to); res(c); });
    c.on("error", e => { clearTimeout(to); rej(e); });
  });
}
const sub = (c, t) => new Promise(r => c.subscribe(t, { qos: 1 }, r));
const pub = (c, t, m) => new Promise((res, rej) =>
  c.publish(t, JSON.stringify(m), { retain: true, qos: 1 }, e => (e ? rej(e) : res())));

let p2Seen = null, p1Seen = null;
const waitFor = async (fn, label, ms = 8000) => {
  const t0 = Date.now();
  for (;;) {
    if (fn()) return Date.now() - t0;
    if (Date.now() - t0 > ms)
      throw new Error("timeout: " + label +
        " (p1sees=" + JSON.stringify(p2Seen) + " p2sees=" + JSON.stringify(p1Seen) + ")");
    await sleep(200);
  }
};

const code = "S" + Math.random().toString(36).slice(2, 6).toUpperCase();
const t1 = NS + code + "/p1", t2 = NS + code + "/p2";

console.log("connecting to " + BROKER + " ...");
const p1 = await conn("bm_smoke_a" + Math.random().toString(36).slice(2, 6),
  { topic: t1, payload: '{"v":1,"bye":1}', retain: true, qos: 0 });
const p2 = await conn("bm_smoke_b" + Math.random().toString(36).slice(2, 6),
  { topic: t2, payload: '{"v":1,"bye":1}', retain: true, qos: 0 });
console.log("connected, room " + code);

p1.on("message", (t, m) => { if (t === t2) p2Seen = JSON.parse(m.toString()); });
p2.on("message", (t, m) => { if (t === t1) p1Seen = JSON.parse(m.toString()); });
await sub(p1, t2);
await sub(p2, t1);
await sleep(600);
if (p1Seen || p2Seen) throw new Error("new room should be empty, got leftover retained");

await pub(p1, t1, { v: 1, t: Date.now(), tok: "tokA", bye: 0, round: 1, commit: null, reveal: null, ack: 0 });
console.log("STEP1 claim exchange: OK (" + (await waitFor(() => p1Seen && p1Seen.tok === "tokA", "p1 claim")) + "ms)");

await pub(p2, t2, { v: 1, t: Date.now(), tok: "tokB", bye: 0, round: 1, commit: null, reveal: null, ack: 0 });
console.log("STEP2 join exchange: OK (" + (await waitFor(() => p2Seen && p2Seen.tok === "tokB", "p2 join")) + "ms)");

await pub(p1, t1, { v: 1, t: Date.now(), tok: "tokA", bye: 0, round: 1, commit: "hashA", reveal: { move: "breath", nonce: "n1" }, ack: 0 });
await pub(p2, t2, { v: 1, t: Date.now(), tok: "tokB", bye: 0, round: 1, commit: "hashB", reveal: { move: "breath", nonce: "n2" }, ack: 0 });
await waitFor(() => p1Seen && p1Seen.commit === "hashA" && p2Seen && p2Seen.commit === "hashB", "commit exchange");
await waitFor(() => p1Seen.reveal && p1Seen.reveal.nonce === "n1" && p2Seen.reveal && p2Seen.reveal.move === "breath", "reveal exchange");
console.log("STEP3 commit+reveal (qos1) exchange: OK");

p2.stream.destroy();
await waitFor(() => p2Seen && p2Seen.bye === 1, "LWT bye", 10000);
console.log("STEP4 last-will bye on abrupt disconnect: OK");

await new Promise(r => p1.publish(t1, "", { retain: true }, r));
await new Promise(r => p1.publish(t2, "", { retain: true }, r));
await sleep(300);
p1.end(true);
console.log("ALL MQTT SMOKE TESTS PASSED");
process.exit(0);
