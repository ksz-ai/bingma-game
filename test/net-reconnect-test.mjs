/* 联机断线恢复测试：双模块实例（query 隔离状态）模拟双客户端
   验证：短暂断线 → 自动重连 → 状态恢复，全程不出现"对手离开"误判 */
let failed = 0;
function check(label, cond) {
  if (cond) console.log("PASS  " + label);
  else { failed++; console.log("FAIL  " + label); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const A = await import(new URL("../src/net.js?client=A", import.meta.url).href);
const B = await import(new URL("../src/net.js?client=B", import.meta.url).href);

let lastA = null, lastB = null;
const errs = [];
const pollA = st => { lastA = st; }, pollB = st => { lastB = st; };

/* 1. 建房 + 加入，互相可见 */
const code = await A.createRoom();
A.startPolling(pollA, e => errs.push("A:" + e.message));
await B.joinRoom(code);
B.startPolling(pollB, e => errs.push("B:" + e.message));
await sleep(1500);
check("建房加入成功，双方互相可见", !!(lastA && lastA.peerJoined && lastB && lastB.peerJoined));

/* 2. 承诺-亮牌协议：未亮牌前对方只可见哈希 */
const nA = A.randNonce(), nB = B.randNonce();
await A.commitMove("吐纳", nA);
await B.commitMove("袖箭", nB);
await sleep(900);
check("承诺可见（哈希）", !!(lastB && lastB.peerCommit && !lastB.peerReveal));

await A.revealMove("吐纳", nA);
await B.revealMove("袖箭", nB);
await sleep(900);
check("亮牌后明文可见", !!(lastB && lastB.peerReveal && lastB.peerReveal.move === "吐纳"));

/* 3. 双方确认 → 回合推进 */
await A.nextRound();
await B.nextRound();
await sleep(1200);
check("回合推进到 2", lastA.round === 2 && lastB.round === 2);

/* 4. 硬断 B 的底层连接（触发遗嘱消息，mqtt.js 将在 2.5s 后自动重连） */
const bc = B._debug().client;
try { bc.stream && bc.stream.destroy && bc.stream.destroy(); } catch {}
try { bc.stream && bc.stream.terminate && bc.stream.terminate(); } catch {}
await sleep(500);
check("底层连接已切断", !bc.connected);

/* 断线瞬间立刻出招：应等待重连后送达而非立即失败（旧代码此处直接 reject → 闪退） */
let committed = false;
B.commitMove("剑风", B.randNonce()).then(() => committed = true).catch(() => {});

let sawLeft = false, waited = 0;   // A 全程不应看到"对手离开"（遗嘱 bye 无 tok 被过滤）
while (waited < 20000 && !committed) {
  await sleep(500); waited += 500;
  if (lastA && !lastA.peerJoined) sawLeft = true;
}
check("断线期间 A 不误判对手离开", !sawLeft);
check("断线时出招在重连后送达（" + waited + "ms）", committed);
const peerT = A._debug().peer && A._debug().peer.t;
check("重连后心跳恢复（A 看到新鲜的 B 状态）", !!peerT && Date.now() - peerT < 5000);
check("重连后 A 仍能收到 B 的承诺", !!(lastA && lastA.peerCommit));

A.stopPolling(); B.stopPolling();
await A.leaveRoom();
await B.leaveRoom();
console.log(failed ? "\n" + failed + " CASE(S) FAILED" : "\nALL NET RECONNECT TESTS PASSED");
process.exit(failed ? 1 : 0);
