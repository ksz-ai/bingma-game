/* ══════════ 新手剧情：初入兵马 ══════════
   六幕结构：序幕 → 一课聚气 → 二课走位 → 三课刺击 → 四课护体 → 结业对弈
   每幕绑定一段对白 + 一个具体过关目标 + 脚本对手序列。
   所有结算仍走 settle.js，保证与正式玩法规则一致。 */

export const CHAPTERS = [
  {
    id: "intro",
    title: "序 · 说书",
    type: "dialog",                  // 纯对白幕，无战斗
    tagline: "守枰四十载 · 一段旧话",
    acts: "武林旧事：弈圣立下“同刻落子、同时亮招”的兵马之约，对弈演武场分天、地、水三层。",
    lines: [
      { who: "老枰翁", text: "山门外来了个生面孔。少侠，是来赴兵马大会的？" },
      { who: "老枰翁", text: "入场之前，且容老朽说一段书。老朽姓枰，守这三才演武场，已守了四十年。" },
      { who: "老枰翁", text: "百年前有位高人，人称弈圣。一生三百余战，未尝一败。" },
      { who: "老枰翁", text: "旁人只道他招式通神。他临终却笑道：“吾胜在算，不在打。”" },
      { who: "老枰翁", text: "料敌于先——算中对手下一步，天下招式，皆成你掌中棋子。" },
      { who: "老枰翁", text: "故弈圣立下兵马之约：比武双方不得窥探对方出招，须同刻落子、同时亮招，胜负只在揭晓一瞬。江湖称之——兵马对弈。" },
      { who: "老枰翁", text: "你脚下这座演武场，分天、地、水三层：屋脊为天，平地为地，水底为水。" },
      { who: "老枰翁", text: "想入会？先过老朽五课。木人已备好，请。" },
    ],
  },
  {
    id: "lesson1",
    title: "一课 · 聚气",
    type: "combat",
    tagline: "气沉丹田 · 不疾不徐",
    acts: "对坐木人，不躲不还手；连按三回合「吐纳」（键盘 1），将真气聚至三点。",
    goal: { text: "聚气 · 盘膝吐纳聚起三点真气", kind: "qi", target: 3 },
    roundTime: 12,
    startPlayer: { qi: 0, shield: 0, pos: "ground" },
    /* 木人每回合仅吐纳（永不攻击，教学确定性） */
    script: [ { round: 1, move: "吐纳" }, { round: 2, move: "吐纳" }, { round: 3, move: "吐纳" },
              { round: 4, move: "吐纳" }, { round: 5, move: "吐纳" } ],
    intro: [
      { who: "老枰翁", text: "第一课，聚气。" },
      { who: "老枰翁", text: "武人周身一口真气，是催动一切招式的根本。没气，你连一记袖箭都发不出去。" },
      { who: "老枰翁", text: "与木人对坐一局，只管盘膝吐纳。聚起三点气，此课便过。" },
      { who: "老枰翁", text: "对了——沙漏之内须落子。犹豫不决，便当你吐纳，莫怪。" },
    ],
    pass:  { who: "老枰翁", text: "好。气沉丹田，不疾不徐。记住——江湖上死于心急的，比死于刀下的多。" },
    fail:  null,
  },
  {
    id: "lesson2",
    title: "二课 · 走位",
    type: "combat",
    tagline: "看牌避险 · 一躲一回合",
    acts: "木人每回合先举牌示招：第 1 招「剑风」（扫屋脊+平地）→ 上屋脊躲；第 2 招「震山掌」（扫平地+水底）→ 遁地入水底躲。两招都躲掉即过。",
    goal: { text: "走位 · 看牌避险，连躲两招", kind: "dodge", target: 2 },
    roundTime: 14,
    startPlayer: { qi: 0, shield: 0, pos: "ground" },
    /* 木人本关需放剑风(3气)+震山掌(3气)，配足初始气让它名实相符地出招 */
    startAi: { qi: 6, shield: 0, pos: "ground" },
    /* 木人先举牌示招（resolveMove 前把告示作为 log），再出招 */
    script: [
      { round: 1, banner: "木人举牌：剑风——扫屋脊、平地！", move: "剑风" },
      { round: 2, banner: "木人举牌：震山掌——扫平地、水底！", move: "震山掌" },
    ],
    /* 玩家躲上屋脊躲剑风，躲上屋脊躲震山掌 */
    solve: [
      { round: 1, must: "sky" },        // 剑风：屋脊+平地 → 必须上屋脊
      { round: 2, must: "sky" },        // 震山掌：平地+水底 → 必须上屋脊
    ],
    intro: [
      { who: "老枰翁", text: "第二课，走位。打得过要打，打不过，要躲。" },
      { who: "老枰翁", text: "天、地、水三层，是保命的学问：轻功上屋脊，遁地入水底。落定之后每回合归位平地——躲，要一回一回躲。" },
      { who: "老枰翁", text: "木人不通变通，出招前会亮牌明示。看准它的牌，走到它扫不着的地方去，连躲两招，便算你过关。" },
    ],
    pass:  { who: "老枰翁", text: "好身法。站桩不动的人，在这行当里活不长。" },
    fail:  { who: "老枰翁", text: "唉，着了道。莫慌，牌还是那两张牌，回档重来。" },
  },
  {
    id: "lesson3",
    title: "三课 · 刺击",
    type: "combat",
    tagline: "还手一击 · 一箭中的",
    acts: "开局固定三点气。木人立平地不动；按「袖箭」（键盘 4）一击命中即过。",
    goal: { text: "刺击 · 袖箭命中木人", kind: "hit", move: "袖箭", target: 1 },
    roundTime: 12,
    /* 玩家固定 3 点气，袖箭一击即可命中 */
    startPlayer: { qi: 3, shield: 0, pos: "ground" },
    script: [ { round: 1, move: "吐纳" } ],     // 木人原地吐纳，毫无威胁
    intro: [
      { who: "老枰翁", text: "第三课，还手。" },
      { who: "老枰翁", text: "袖箭，耗一点气，一伤。只是它性子直——只射平地。人在屋脊、水底，箭就落空。" },
      { who: "老枰翁", text: "木人立在平地，一动不动。就一箭，射中它，此课便过。" },
    ],
    pass:  { who: "老枰翁", text: "一箭中的，木屑纷飞！暗器虽小，栽在“小看”二字底下的，从来不少。" },
    fail:  { who: "老枰翁", text: "箭是好箭，气没了。回去攒足了再来。" },
  },
  {
    id: "lesson4",
    title: "四课 · 护体",
    type: "combat",
    tagline: "罡气金身 · 硬接一掌",
    acts: "第 1 回合按「金钟罩」（键盘 7）运罡气护体；第 2 回合立平地把木人的「震山掌」正面接下——上屋脊闪避不算过关。",
    goal: { text: "护体 · 以罡气挡下震山掌", kind: "shield_block", move: "震山掌" },
    roundTime: 14,
    startPlayer: { qi: 3, shield: 0, pos: "ground" },
    /* 木人本关末回合要放震山掌(3气)，配足气：第1回合蓄力吐纳 +1 → 第2回合放3气掌 */
    startAi: { qi: 3, shield: 0, pos: "ground" },
    script: [
      { round: 1, banner: "木人蓄力：震山掌，下回合落地！", move: "吐纳" },
      { round: 2, move: "震山掌" },
    ],
    /* 必须正面硬接：先运罡气，第 2 回合立平地接招（不上屋脊规避） */
    solve: [
      { round: 1, must: "ground", preferMove: "金钟罩" },
      { round: 2, must: "ground" },
    ],
    intro: [
      { who: "老枰翁", text: "第四课，硬接。躲，总有躲不开、也躲不及的时候。" },
      { who: "老枰翁", text: "金钟罩，耗三点气，运罡气护体。罡气跨回合留存，挡得住等值伤害——三伤的掌，须三点罡气才接得下。" },
      { who: "老枰翁", text: "木人这回动真格：一记震山掌，三伤。先运罡气，正面扛下这一记——用罡气接住它，才算过关。" },
    ],
    pass:  { who: "老枰翁", text: "好一尊铁罗汉！罡气是死的，人是活的——揣着它，你就多一条命。" },
    fail:  { who: "老枰翁", text: "躲是躲得妙——可这一课，要你学的是“接”。再来。" },
  },
  {
    id: "final",
    title: "结业 · 对弈",
    type: "combat",
    tagline: "真刀真枪 · 决胜演武场",
    acts: "门中大师兄已在场中等候。一局定胜负——把你学到的吐纳、走位、袖箭、剑风、金钟罩、万剑归宗，全用上。",
    goal: { text: "结业 · 击败门中大师兄", kind: "win" },
    roundTime: 10,
    startPlayer: { qi: 0, shield: 0, pos: "ground" },
    script: "ai",                  // 走真实 AI（简单难度）
    ai: { diff: "简单" },
    intro: [
      { who: "老枰翁", text: "五课之末，无课。" },
      { who: "老枰翁", text: "你门中的大师兄，已在场中等你多时。真刀真枪，一局定胜负——把你学的，全用上。" },
      { who: "老枰翁", text: "临别赠你两句口诀：其一，两招同时命中、伤值相同，互相抵消，谓之相抵；其二，气聚七点，可祭万剑归宗——无遮无拦，一招制胜。" },
      { who: "大师兄", text: "师弟，请。手下不必留情。" },
    ],
    pass:  { who: "大师兄", text: "好功夫。这一局，师兄输得心服。" },
    pass2: { who: "老枰翁", text: "四两拨千斤，你已得了弈圣三分真意。这枚兵马令收好了——持此令者，可览《兵马策》残卷。" },
    pass3: { who: "老枰翁", text: "至于残卷下落……说来话长。且听下回分解。" },
    fail:  { who: "大师兄", text: "师弟，江湖路长。回去再练练，我等你。" },
  },
];

/* 角色 → 结业师兄所属门派（影响剪影） */
export const SENIOR_BY_HERO = {
  swordsman: "swordsman",
  monk:      "monk",
  assassin:  "assassin",
};

/* 进度持久化键 */
export const STORY_PROGRESS_KEY = "bingma.story.progress";

export function loadProgress() {
  try { return parseInt(localStorage.getItem(STORY_PROGRESS_KEY) || "0", 10) || 0; }
  catch (e) { return 0; }
}
export function saveProgress(idx) {
  try { localStorage.setItem(STORY_PROGRESS_KEY, String(idx)); } catch (e) {}
}