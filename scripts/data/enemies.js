/**
 * enemies.js - 第一章敌人数据
 */

export const ENEMIES_CH1 = {
  // 小怪
  wild_cat: {
    id: 'wild_cat',
    name: '野猫',
    maxHp: 30,
    atk: 8,
    def: 3,
    spd: 9,
    exp: 10,
    gold: 5,
    skills: [{ name: '抓挠', power: 1.0, type: 'attack' }],
    drop: [{ id: 'fish', name: '小鱼干', chance: 0.3 }]
  },
  slime_cat: {
    id: 'slime_cat',
    name: '史莱姆猫',
    maxHp: 40,
    atk: 6,
    def: 5,
    spd: 6,
    exp: 12,
    gold: 8,
    skills: [{ name: '黏液喷射', power: 0.9, type: 'attack', effect: 'slow' }],
    drop: [{ id: 'gel', name: '黏液', chance: 0.2 }]
  },
  shadow_mouse: {
    id: 'shadow_mouse',
    name: '暗影鼠',
    maxHp: 25,
    atk: 10,
    def: 2,
    spd: 14,
    exp: 8,
    gold: 4,
    skills: [{ name: '暗影咬', power: 1.1, type: 'attack' }],
    drop: [{ id: 'cheese', name: '奶酪', chance: 0.4 }]
  },
  // 精英怪
  stray_leader: {
    id: 'stray_leader',
    name: '流浪猫首领',
    maxHp: 80,
    atk: 14,
    def: 8,
    spd: 10,
    exp: 30,
    gold: 20,
    isElite: true,
    skills: [
      { name: '利爪连击', power: 1.2, type: 'attack' },
      { name: '召唤小弟', power: 0, type: 'summon', summonId: 'wild_cat' },
      { name: '怒吼', power: 0.5, type: 'attack', target: 'all', effect: 'stun' }
    ],
    drop: [{ id: 'cat_collar', name: '猫项圈', chance: 0.5 }]
  },
  // Boss
  dark_cat_king: {
    id: 'dark_cat_king',
    name: '暗影猫王',
    maxHp: 200,
    atk: 18,
    def: 12,
    spd: 11,
    exp: 100,
    gold: 50,
    isBoss: true,
    skills: [
      { name: '暗影爪击', power: 1.3, type: 'attack' },
      { name: '暗影领域', power: 0.8, type: 'attack', target: 'all' },
      { name: '生命吸取', power: 1.0, type: 'attack', effect: 'drain' },
      { name: '暗影爆发', power: 2.0, type: 'attack' }
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
