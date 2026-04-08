/**
 * enemies.js - 第一章敌人数据
 */

// 敌人等级成长率（每升一级增加的百分比）
const ENEMY_GROWTH_RATE = {
  normal: { hp: 0.08, atk: 0.05, def: 0.05, spd: 0.02 },   // 小怪
  elite: { hp: 0.10, atk: 0.07, def: 0.07, spd: 0.03 },    // 精英
  boss: { hp: 0.12, atk: 0.08, def: 0.08, spd: 0.04 }      // Boss
}

/**
 * 根据等级计算敌人最终属性
 * @param {Object} enemyData - 敌人基础数据
 * @param {number} level - 敌人等级（默认为1）
 * @returns {Object} 最终敌人数据
 */
export function getEnemyByLevel(enemyData, level = 1) {
  if (!enemyData) return null

  // 确定敌人类型（用于成长率）
  const enemyType = enemyData.isBoss ? 'boss' : (enemyData.isElite ? 'elite' : 'normal')
  const growth = ENEMY_GROWTH_RATE[enemyType]

  // 计算等级加成后的属性
  const levelMultiplier = (level - 1)
  const finalEnemy = {
    ...enemyData,
    level: level,
    
    // 应用等级加成
    maxHp: Math.floor(enemyData.maxHp * (1 + growth.hp * levelMultiplier)),
    atk: Math.floor(enemyData.atk * (1 + growth.atk * levelMultiplier)),
    def: Math.floor(enemyData.def * (1 + growth.def * levelMultiplier)),
    spd: Math.floor(enemyData.spd * (1 + growth.spd * levelMultiplier)),
    
    // 暴击率（小怪5%，精英10%，Boss15%，每级+1%）
    crit: (enemyData.isBoss ? 0.15 : (enemyData.isElite ? 0.10 : 0.05)) + level * 0.01,
    
    // 装备加成（Boss和精英自带装备加成）
    equipment: enemyData.equipment || null
  }

  // 应用装备加成（如果有）
  if (finalEnemy.equipment) {
    const stats = finalEnemy.equipment.stats
    if (stats) {
      if (stats.atk) finalEnemy.atk += stats.atk
      if (stats.def) finalEnemy.def += stats.def
      if (stats.maxHp) {
        finalEnemy.maxHp += stats.maxHp
      }
      if (stats.spd) finalEnemy.spd += stats.spd
      if (stats.crit) finalEnemy.crit += stats.crit
    }
  }

  // 初始化当前HP
  finalEnemy.hp = finalEnemy.maxHp

  console.log(`[Enemy] ${enemyData.name} Lv.${level} - HP:${finalEnemy.maxHp}, ATK:${finalEnemy.atk}, DEF:${finalEnemy.def}, CRIT:${(finalEnemy.crit * 100).toFixed(1)}%`)

  return finalEnemy
}

export const ENEMIES_CH1 = {
  // 小怪 - 加强版
  wild_cat: {
    id: 'wild_cat',
    name: '野猫',
    level: 1,           // 基础等级
    maxHp: 50,       // 30 → 50 (+67%)
    atk: 12,         // 8 → 12 (+50%)
    def: 5,          // 3 → 5 (+67%)
    spd: 9,
    crit: 0.05,      // 基础暴击率 5%
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
    type: 'slime_cat',  // 添加类型标记，用于动画识别
    name: '史莱姆猫',
    level: 2,
    maxHp: 70,       // 40 → 70 (+75%)
    atk: 10,         // 6 → 10 (+67%)
    def: 8,          // 5 → 8 (+60%)
    spd: 6,
    crit: 0.05,
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
    level: 2,
    maxHp: 45,       // 25 → 45 (+80%)
    atk: 15,         // 10 → 15 (+50%)
    def: 4,          // 2 → 4
    spd: 16,         // 14 → 16 (更快)
    crit: 0.08,      // 速度型敌人暴击率稍高
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
    level: 5,
    maxHp: 180,      // 80 → 180 (+125%)
    atk: 24,         // 14 → 24 (+71%)
    def: 14,         // 8 → 14 (+75%)
    spd: 12,         // 10 → 12
    crit: 0.10,      // 精英基础暴击率 10%
    exp: 50,         // 奖励提升
    gold: 35,
    isElite: true,
    equipment: {     // 精英自带装备
      name: '锋利爪套',
      type: 'weapon',
      stats: { atk: 8, crit: 0.05 }
    },
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
    level: 8,
    maxHp: 350,
    atk: 22,
    def: 16,
    spd: 11,
    crit: 0.15,      // Boss基础暴击率 15%
    exp: 150,
    gold: 80,
    isBoss: true,
    isAmy: true,  // 特殊标记：这是艾米的Boss形态
    equipment: {     // Boss自带强力装备
      name: '治愈之冠',
      type: 'accessory',
      stats: { maxHp: 50, def: 6, crit: 0.05 }
    },
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
    level: 10,
    maxHp: 500,      // 200 → 500 (+150%)
    atk: 32,         // 18 → 32 (+78%)
    def: 22,         // 12 → 22 (+83%)
    spd: 13,         // 11 → 13
    crit: 0.20,      // 最终Boss暴击率 20%
    exp: 200,        // 奖励提升
    gold: 120,
    isBoss: true,
    equipment: {     // 最终Boss装备
      name: '暗影王冠',
      type: 'accessory',
      stats: { atk: 15, def: 10, maxHp: 80, crit: 0.05 }
    },
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

// ===== 第二章：魔法塔危机 =====
export const ENEMIES_CH2 = {
  // 小怪
  magic_sprite: {
    id: 'magic_sprite',
    name: '魔法精灵',
    level: 4,
    maxHp: 85,
    atk: 18,
    def: 8,
    spd: 14,
    crit: 0.08,
    exp: 25,
    gold: 15,
    skills: [
      { name: '魔法弹', power: 1.4, type: 'magic' },
      { name: '魔力风暴', power: 1.8, type: 'magic' }
    ],
    drop: [{ id: 'magic_dust', name: '魔法粉尘', chance: 0.3 }]
  },
  stone_golem: {
    id: 'stone_golem',
    name: '石像守卫',
    level: 5,
    maxHp: 120,
    atk: 20,
    def: 15,
    spd: 6,
    crit: 0.05,
    exp: 30,
    gold: 20,
    skills: [
      { name: '岩石冲击', power: 1.5, type: 'attack' },
      { name: '地震', power: 1.2, type: 'attack', target: 'all' }
    ],
    drop: [{ id: 'stone_core', name: '石核', chance: 0.25 }]
  },
  ghost_cat: {
    id: 'ghost_cat',
    name: '幽灵猫',
    level: 5,
    maxHp: 70,
    atk: 22,
    def: 6,
    spd: 18,
    crit: 0.12,
    exp: 28,
    gold: 18,
    skills: [
      { name: '幽灵爪', power: 1.6, type: 'attack' },
      { name: '穿墙袭击', power: 2.0, type: 'attack' }
    ],
    drop: [{ id: 'ghost_essence', name: '幽灵精华', chance: 0.3 }]
  },
  
  // 精英
  tower_guardian: {
    id: 'tower_guardian',
    name: '塔楼守护者',
    level: 6,
    maxHp: 250,
    atk: 30,
    def: 20,
    spd: 10,
    crit: 0.10,
    exp: 70,
    gold: 50,
    isElite: true,
    equipment: {
      name: '守护铠甲',
      type: 'armor',
      stats: { def: 12, maxHp: 40 }
    },
    skills: [
      { name: '守护一击', power: 1.8, type: 'attack' },
      { name: '嘲讽怒吼', power: 0.8, type: 'attack', target: 'all' },
      { name: '钢铁防御', power: 0, type: 'buff', effect: 'defense_up' }
    ],
    drop: [{ id: 'guardian_shield', name: '守护者盾牌', chance: 0.5 }]
  },
  
  // Boss
  crystal_mage: {
    id: 'crystal_mage',
    name: '水晶法师',
    level: 15,  // 修改为15级（原7级）
    maxHp: 400,
    atk: 35,
    def: 18,
    spd: 14,
    crit: 0.18,
    exp: 180,
    gold: 100,
    isBoss: true,
    isAnnie: true,  // 特殊标记：这是安妮的Boss形态
    equipment: {
      name: '水晶法杖',
      type: 'weapon',
      stats: { atk: 20, crit: 0.08 }
    },
    skills: [
      { name: '水晶碎片', power: 1.6, type: 'magic' },
      { name: '水晶风暴', power: 1.4, type: 'magic', target: 'all' },
      { name: '魔力汲取', power: 2.0, type: 'magic', effect: 'drain' },
      { name: '水晶封印', power: 2.8, type: 'magic' }
    ],
    drop: [{ id: 'crystal_heart', name: '水晶之心', chance: 1.0 }],
    dialogue: [
      '你们也是来抢夺水晶之力的吗？',
      '我绝不会让任何人接近塔顶！',
      '这股力量...超出了我的想象...'
    ],
    purifyDialogue: [
      '水晶之力...原来不只是力量...',
      '我一直在追求强大的魔法，却忘记了魔法的真谛...',
      '请让我加入你们，用魔法守护这片大地！'
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
