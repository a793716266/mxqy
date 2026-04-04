/**
 * enemies.js - 第一章敌人数据
 */

export const ENEMIES_CH1 = {
  // 小怪 - 加强版
  wild_cat: {
    id: 'wild_cat',
    name: '野猫',
    maxHp: 50,       // 30 → 50 (+67%)
    atk: 12,         // 8 → 12 (+50%)
    def: 5,          // 3 → 5 (+67%)
    spd: 9,
    exp: 15,         // 奖励提升
    gold: 8,
    skills: [
      { name: '抓挠', power: 1.2, type: 'attack' },          // 1.0 → 1.2
      { name: '狂抓', power: 1.5, type: 'attack' }           // 新增技能
    ],
    drop: [{ id: 'fish', name: '小鱼干', chance: 0.3 }]
  },
  slime_cat: {
    id: 'slime_cat',
    name: '史莱姆猫',
    maxHp: 70,       // 40 → 70 (+75%)
    atk: 10,         // 6 → 10 (+67%)
    def: 8,          // 5 → 8 (+60%)
    spd: 6,
    exp: 18,         // 奖励提升
    gold: 12,
    skills: [
      { name: '黏液喷射', power: 1.1, type: 'attack', effect: 'slow' },  // 0.9 → 1.1
      { name: '黏液包裹', power: 1.3, type: 'attack', effect: 'slow' }   // 新增技能
    ],
    drop: [{ id: 'gel', name: '黏液', chance: 0.2 }]
  },
  shadow_mouse: {
    id: 'shadow_mouse',
    name: '暗影鼠',
    maxHp: 45,       // 25 → 45 (+80%)
    atk: 15,         // 10 → 15 (+50%)
    def: 4,          // 2 → 4
    spd: 16,         // 14 → 16 (更快)
    exp: 12,         // 奖励提升
    gold: 6,
    skills: [
      { name: '暗影咬', power: 1.3, type: 'attack' },        // 1.1 → 1.3
      { name: '暗影突袭', power: 1.8, type: 'attack' }       // 新增高伤技能
    ],
    drop: [{ id: 'cheese', name: '奶酪', chance: 0.4 }]
  },
  // 精英怪 - 大幅加强
  stray_leader: {
    id: 'stray_leader',
    name: '流浪猫首领',
    maxHp: 180,      // 80 → 180 (+125%)
    atk: 24,         // 14 → 24 (+71%)
    def: 14,         // 8 → 14 (+75%)
    spd: 12,         // 10 → 12
    exp: 50,         // 奖励提升
    gold: 35,
    isElite: true,
    skills: [
      { name: '利爪连击', power: 1.5, type: 'attack' },      // 1.2 → 1.5
      { name: '召唤小弟', power: 0, type: 'summon', summonId: 'wild_cat' },
      { name: '怒吼', power: 1.0, type: 'attack', target: 'all', effect: 'stun' },  // 0.5 → 1.0
      { name: '撕裂', power: 2.0, type: 'attack' }           // 新增强力技能
    ],
    drop: [{ id: 'cat_collar', name: '猫项圈', chance: 0.5 }]
  },
  // Boss - 阳光草原
  lost_healer_cat: {
    id: 'lost_healer_cat',
    name: '迷途的治愈猫',
    maxHp: 350,
    atk: 22,
    def: 16,
    spd: 11,
    exp: 150,
    gold: 80,
    isBoss: true,
    isAmy: true,  // 特殊标记：这是艾米的Boss形态
    skills: [
      { name: '治愈之爪', power: 1.3, type: 'attack' },
      { name: '生命波纹', power: 0.8, type: 'attack', target: 'all' },
      { name: '自我治愈', power: 0, type: 'heal_self', healAmount: 40 },
      { name: '净化之光', power: 1.6, type: 'magic' },
      { name: '治愈冲击', power: 2.2, type: 'magic' }
    ],
    drop: [{ id: 'healing_herb', name: '治愈草药', chance: 1.0 }],
    dialogue: [
      '你们...为什么要闯入这里？',
      '我只是想守护这片草原的和平...',
      '真正的力量...是治愈与守护吗...'
    ],
    purifyDialogue: [
      '你们的眼神...如此温暖...',
      '我一直在寻找这样的羁绊...',
      '请让我加入你们，一起守护这片大地！'
    ]
  },
  // Boss - 暗影洞穴
  dark_cat_king: {
    id: 'dark_cat_king',
    name: '暗影猫王',
    maxHp: 500,      // 200 → 500 (+150%)
    atk: 32,         // 18 → 32 (+78%)
    def: 22,         // 12 → 22 (+83%)
    spd: 13,         // 11 → 13
    exp: 200,        // 奖励提升
    gold: 120,
    isBoss: true,
    skills: [
      { name: '暗影爪击', power: 1.8, type: 'attack' },      // 1.3 → 1.8
      { name: '暗影领域', power: 1.2, type: 'attack', target: 'all' },  // 0.8 → 1.2
      { name: '生命吸取', power: 1.5, type: 'attack', effect: 'drain' }, // 1.0 → 1.5
      { name: '暗影爆发', power: 2.5, type: 'attack' },      // 2.0 → 2.5
      { name: '暗影之怒', power: 3.0, type: 'attack' }       // 新增大招
    ],
    drop: [{ id: 'dark_gem', name: '暗影宝石', chance: 1.0 }],
    dialogue: [
      '哼，你竟敢闯入我的领地！',
      '喵星的光芒...让我来熄灭它！',
      '可恶...这股力量...'
    ]
  }
}

// 地图节点配置
export const MAP_NODES = {
  // 第一章
  'ch1_town': {
    id: 'ch1_town',
    name: '喵星小镇',
    type: 'town',
    bg: 'images/backgrounds/bg_town.png',
    x: 100, y: 400,
    connections: ['ch1_road1'],
    npc: [
      { name: '猫村长', dialogue: '臻宝，草原上有危险的野猫出没，请帮忙处理！' },
      { name: '商人猫', type: 'shop' }
    ]
  },
  'ch1_road1': {
    id: 'ch1_road1',
    name: '小镇外围',
    type: 'road',
    bg: 'images/backgrounds/bg_grassland.png',
    x: 250, y: 350,
    connections: ['ch1_town', 'ch1_road2'],
    encounters: [
      { enemy: 'wild_cat', chance: 0.3 },
      { enemy: 'shadow_mouse', chance: 0.2 }
    ]
  },
  'ch1_road2': {
    id: 'ch1_road2',
    name: '草原深处',
    type: 'road',
    bg: 'images/backgrounds/bg_grassland.png',
    x: 400, y: 300,
    connections: ['ch1_road1', 'ch1_road3'],
    encounters: [
      { enemy: 'wild_cat', chance: 0.3 },
      { enemy: 'slime_cat', chance: 0.3 }
    ]
  },
  'ch1_road3': {
    id: 'ch1_road3',
    name: '森林入口',
    type: 'road',
    bg: 'images/backgrounds/bg_forest.png',
    x: 550, y: 280,
    connections: ['ch1_road2', 'ch1_boss'],
    encounters: [
      { enemy: 'slime_cat', chance: 0.3 },
      { enemy: 'shadow_mouse', chance: 0.3 }
    ]
  },
  'ch1_boss': {
    id: 'ch1_boss',
    name: '暗影巢穴',
    type: 'boss',
    bg: 'images/backgrounds/bg_boss.png',
    x: 650, y: 250,
    connections: ['ch1_road3'],
    boss: 'dark_cat_king',
    defeated: false
  }
}
