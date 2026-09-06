# 兵马 · 江湖对弈

一款水墨武侠风格的回合制对战小游戏。黑白为墨，朱砂点睛，剑客剪影执子对弈，古琴拨弦为号。支持人机对弈与跨设备联机对战。

## 玩法

每回合双方同时出一招（限时 10 秒），招式在结算阶段互相碰撞：

- **吐纳**：聚气，攒下内力（气）
- **剑风 / 袖箭 / 震山掌** 等攻击招式：消耗气，对对手造成伤害
- **同时命中的攻击会相撞：伤值相同互相抵消，伤值更高者压过低者、照常命中**，剑气纵横，胜负一念
- 一方气血归零，对局结束

## 特性

- 水墨武侠 UI：宣纸底色、书法字体、SVG 剑客剪影
- 古琴音效：基于 Karplus-Strong 拨弦合成实时生成，无需音频文件，八种招式各有专属音色
- 人机对弈：三档难度 AI
- **联机对战**：凭 4 位房号邀请好友，电脑手机均可加入
- 单文件构建产物：`npm run build` 后得到一个可双击打开的 `dist/index.html`

## 技术栈

- [Vite](https://vitejs.dev/) + 原生 JavaScript 模块（无框架）
- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)：打包为单 HTML 文件
- [MQTT.js](https://github.com/mqttjs/MQTT.js) + [EMQX 公共服务器](https://www.emqx.com/zh/mqtt/public-mqtt5-broker)：联机对战消息中继
- Web Crypto API（SHA-256）：联机防作弊

### 联机对战是怎么工作的

没有自建游戏服务器。两名玩家的浏览器同时连接一个公共 MQTT 服务器（消息中继），房间状态以「保留消息」形式存在服务器上：

1. 房主创建房间，得到 5 位房号
2. 对方输入房号加入，双方各自订阅对方的「格子」（MQTT 主题）
3. 出招时先发布招式的 SHA-256 哈希（承诺），双方都承诺后才交换明文（亮牌）——谁也无法偷看后改招
4. 双方浏览器各自本地结算：输入相同，结果必然相同
5. 断线有容错：MQTT 自动重连（约 2.5s），出招会等待重连送达；对手失联超过 30s 才判离场，短暂切后台/网络抖动不会中断对局

## 快速开始

```bash
npm install     # 安装依赖
npm run dev     # 本地开发（热更新）
npm run build   # 构建单文件产物到 dist/
npm run preview # 本地预览构建产物
```

## 目录结构

```
├── index.html        # 入口页面
├── src/
│   ├── main.js       # 入口：UI 事件绑定、界面切换
│   ├── engine.js     # 游戏流程状态机（选招→等待→结算→揭晓）
│   ├── state.js      # 全局状态
│   ├── settle.js     # 规则结算：伤害、位移、相抵判定
│   ├── ai.js         # 人机 AI 决策
│   ├── net.js        # 联机客户端（MQTT + 承诺亮牌协议）
│   ├── audio.js      # 古琴音效合成
│   ├── fx.js         # 技能特效动画
│   ├── render.js     # 画面渲染
│   └── style.css     # 水墨风格样式
└── test/
    ├── settle-test.mjs        # 对决规则（压制/相抵/闪避）断言
    └── net-reconnect-test.mjs # 断线重连恢复测试
```

## 部署

推送到 `main` 分支后，GitHub Actions 自动构建并发布到 GitHub Pages（单文件构建产物）。

在线试玩：https://ksz-ai.github.io/bingma-game/

## License

MIT
