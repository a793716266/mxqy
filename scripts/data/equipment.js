/**
 * equipment.js - 装备数据定义
 */

// 装备稀有度
export const RARITY = {
  COMMON: 'common',      // 普通 - 白色
  RARE: 'rare',          // 稀有 - 蓝色
  EPIC: 'epic',          // 史诗 - 紫色
  LEGENDARY: 'legendary' // 传说 - 橙色
}

// 稀有度配置
export const RARITY_CONFIG = {
  common: {
    name: '普通',
    color: '#95a5a6',
    multiplier: 1.0,
    dropRate: 0.6
  },
  rare: {
    name: '稀有',
    color: '#3498db',
    multiplier: 1.3,
    dropRate: 0.25
  },
  epic: {
    name: '史诗',
    color: '#9b59b6',
    multiplier: 1.6,
    dropRate: 0.12
  },
  legendary: {
    name: '传说',
    color: '#f39c12',
    multiplier: 2.0,
    dropRate: 0.03
  }
}

// 装备类型
export const EQUIP_TYPE = {
  WEAPON: 'weapon',    // 武器
  ARMOR: 'armor',      // 防具
  ACCESSORY: 'accessory' // 饰品
}

// 装备类型配置
export const EQUIP_TYPE_CONFIG = {
  weapon: {
    name: '武器',
    icon: '⚔️',
    primaryStats: ['atk']
  },
  armor: {
    name: '防具',
    icon: '🛡️',
    primaryStats: ['def', 'maxHp']
  },
  accessory: {
    name: '饰品',
    icon: '💍',
    primaryStats: ['spd', 'maxMp', 'crit']
  }
}

// 装备数据 - 第一章装备
export const EQUIPMENT_CH1 = {
  // ========== 武器 ==========
  // 普通武器
  rusty_sword: {
    id: 'rusty_sword',
    name: '生锈的短剑',
    type: 'weapon',
    rarity: 'common',
    desc: '一把略显陈旧的短剑',
    stats: {
      atk: 5
    },
    price: 50,
    sellPrice: 20
  },
  wooden_staff: {
    id: 'wooden_staff',
    name: '木制法杖',
    type: 'weapon',
    rarity: 'common',
    desc: '简单的木制法杖，适合新手法师',
    stats: {
      atk: 4,
      maxMp: 10
    },
    price: 60,
    sellPrice: 25
  },
  
  // 稀有武器
  sharp_blade: {
    id: 'sharp_blade',
    name: '锋利的长剑',
    type: 'weapon',
    rarity: 'rare',
    desc: '经过精心打磨的长剑，锋利无比',
    stats: {
      atk: 12,
      crit: 0.05
    },
    price: 200,
    sellPrice: 80
  },
  magic_wand: {
    id: 'magic_wand',
    name: '魔法之杖',
    type: 'weapon',
    rarity: 'rare',
    desc: '蕴含魔力的法杖',
    stats: {
      atk: 10,
      maxMp: 25
    },
    price: 220,
    sellPrice: 90
  },
  
  // 史诗武器
  flame_sword: {
    id: 'flame_sword',
    name: '炎之剑',
    type: 'weapon',
    rarity: 'epic',
    desc: '缠绕着火焰的魔法剑',
    stats: {
      atk: 20,
      crit: 0.08,
      maxHp: 20
    },
    price: 600,
    sellPrice: 240
  },
  
  // 传说武器
  sunlight_blade: {
    id: 'sunlight_blade',
    name: '阳光之刃',
    type: 'weapon',
    rarity: 'legendary',
    desc: '阳光草原的守护神兵，散发着温暖的光芒',
    stats: {
      atk: 300,
      def: 8,
      crit: 0.12,
      maxHp: 50
    },
    price: 1500,
    sellPrice: 600
  },
  
  // ========== 防具 ==========
  // 普通防具
  leather_armor: {
    id: 'leather_armor',
    name: '皮甲',
    type: 'armor',
    rarity: 'common',
    desc: '简单的皮革护甲',
    stats: {
      def: 4,
      maxHp: 15
    },
    price: 50,
    sellPrice: 20
  },
  cloth_robe: {
    id: 'cloth_robe',
    name: '布袍',
    type: 'armor',
    rarity: 'common',
    desc: '普通的布制长袍',
    stats: {
      def: 2,
      maxHp: 10,
      maxMp: 15
    },
    price: 60,
    sellPrice: 25
  },
  
  // 稀有防具
  chain_mail: {
    id: 'chain_mail',
    name: '锁子甲',
    type: 'armor',
    rarity: 'rare',
    desc: '由铁环编织的护甲',
    stats: {
      def: 10,
      maxHp: 40
    },
    price: 250,
    sellPrice: 100
  },
  magic_robe: {
    id: 'magic_robe',
    name: '魔法长袍',
    type: 'armor',
    rarity: 'rare',
    desc: '附有魔法防御的长袍',
    stats: {
      def: 6,
      maxHp: 25,
      maxMp: 35
    },
    price: 280,
    sellPrice: 110
  },
  
  // 史诗防具
  guardian_armor: {
    id: 'guardian_armor',
    name: '守护者铠甲',
    type: 'armor',
    rarity: 'epic',
    desc: '古代守护者留下的铠甲',
    stats: {
      def: 18,
      maxHp: 80,
      spd: -2
    },
    price: 700,
    sellPrice: 280
  },
  
  // 传说防具
  sunlight_armor: {
    id: 'sunlight_armor',
    name: '阳光圣甲',
    type: 'armor',
    rarity: 'legendary',
    desc: '阳光草原的守护圣甲，闪耀着神圣的光辉',
    stats: {
      def: 25,
      maxHp: 120,
      spd: 3
    },
    price: 1600,
    sellPrice: 640
  },
  
  // ========== 饰品 ==========
  // 普通饰品
  simple_ring: {
    id: 'simple_ring',
    name: '普通戒指',
    type: 'accessory',
    rarity: 'common',
    desc: '一枚简单的戒指',
    stats: {
      spd: 2
    },
    price: 40,
    sellPrice: 15
  },
  lucky_charm: {
    id: 'lucky_charm',
    name: '幸运符',
    type: 'accessory',
    rarity: 'common',
    desc: '带来好运的小饰物',
    stats: {
      crit: 0.03,
      spd: 1
    },
    price: 50,
    sellPrice: 20
  },
  
  // 稀有饰品
  swift_boots: {
    id: 'swift_boots',
    name: '疾风之靴',
    type: 'accessory',
    rarity: 'rare',
    desc: '穿上后身轻如燕',
    stats: {
      spd: 6,
      crit: 0.05
    },
    price: 230,
    sellPrice: 90
  },
  mana_crystal: {
    id: 'mana_crystal',
    name: '魔力水晶',
    type: 'accessory',
    rarity: 'rare',
    desc: '蕴含魔力的水晶',
    stats: {
      maxMp: 40,
      atk: 5
    },
    price: 250,
    sellPrice: 100
  },
  
  // 史诗饰品
  hero_medal: {
    id: 'hero_medal',
    name: '英雄勋章',
    type: 'accessory',
    rarity: 'epic',
    desc: '授予英雄的荣誉勋章',
    stats: {
      atk: 8,
      def: 8,
      spd: 4,
      crit: 0.08
    },
    price: 800,
    sellPrice: 320
  },
  
  // 传说饰品
  sunlight_pendant: {
    id: 'sunlight_pendant',
    name: '阳光吊坠',
    type: 'accessory',
    rarity: 'legendary',
    desc: '阳光草原的祝福，温暖人心',
    stats: {
      maxHp: 80,
      maxMp: 60,
      spd: 8,
      crit: 0.10
    },
    price: 1800,
    sellPrice: 720
  }
}

// Boss掉落表
export const BOSS_DROPS = {
  lost_healer_cat: [
    { id: 'sunlight_blade', rate: 0.15 },      // 阳光之刃
    { id: 'sunlight_armor', rate: 0.15 },      // 阳光圣甲
    { id: 'sunlight_pendant', rate: 0.20 },    // 阳光吊坠
    { id: 'flame_sword', rate: 0.35 },         // 炎之剑
    { id: 'guardian_armor', rate: 0.35 },      // 守护者铠甲
    { id: 'hero_medal', rate: 0.30 }           // 英雄勋章
  ],
  stray_leader: [
    { id: 'sharp_blade', rate: 0.40 },         // 锋利长剑
    { id: 'chain_mail', rate: 0.40 },          // 锁子甲
    { id: 'swift_boots', rate: 0.35 },         // 疾风之靴
    { id: 'flame_sword', rate: 0.10 },         // 炎之剑（低概率）
    { id: 'guardian_armor', rate: 0.10 }       // 守护者铠甲（低概率）
  ],
  dark_cat_king: [
    { id: 'sunlight_blade', rate: 0.25 },      // 阳光之刃
    { id: 'sunlight_armor', rate: 0.25 },      // 阳光圣甲
    { id: 'sunlight_pendant', rate: 0.30 },    // 阳光吊坠
    { id: 'flame_sword', rate: 0.40 },         // 炎之剑
    { id: 'guardian_armor', rate: 0.40 },      // 守护者铠甲
    { id: 'hero_medal', rate: 0.50 }           // 英雄勋章
  ]
}

// 小怪掉落表（随机装备）
export const ENEMY_DROP_TABLE = {
  common: [
    { id: 'rusty_sword', rate: 0.10 },
    { id: 'wooden_staff', rate: 0.10 },
    { id: 'leather_armor', rate: 0.10 },
    { id: 'cloth_robe', rate: 0.10 },
    { id: 'simple_ring', rate: 0.10 },
    { id: 'lucky_charm', rate: 0.10 }
  ],
  rare: [
    { id: 'sharp_blade', rate: 0.05 },
    { id: 'magic_wand', rate: 0.05 },
    { id: 'chain_mail', rate: 0.05 },
    { id: 'magic_robe', rate: 0.05 },
    { id: 'swift_boots', rate: 0.05 },
    { id: 'mana_crystal', rate: 0.05 }
  ],
  epic: [
    { id: 'flame_sword', rate: 0.02 },
    { id: 'guardian_armor', rate: 0.02 },
    { id: 'hero_medal', rate: 0.02 }
  ]
}

/**
 * 根据稀有度随机获取装备
 */
export function getRandomEquipment(rarity = 'common') {
  const dropTable = ENEMY_DROP_TABLE[rarity]
  if (!dropTable || dropTable.length === 0) return null
  
  const roll = Math.random()
  let cumulative = 0
  
  for (const drop of dropTable) {
    cumulative += drop.rate
    if (roll < cumulative) {
      return EQUIPMENT_CH1[drop.id]
    }
  }
  
  return null
}

/**
 * Boss掉落装备
 */
export function getBossDrop(bossId) {
  const dropTable = BOSS_DROPS[bossId]
  if (!dropTable || dropTable.length === 0) return null
  
  // Boss必定掉落一件装备
  const roll = Math.random()
  let cumulative = 0
  
  for (const drop of dropTable) {
    cumulative += drop.rate
    if (roll < cumulative) {
      return EQUIPMENT_CH1[drop.id]
    }
  }
  
  // 如果没有掉落，随机返回一件
  const randomDrop = dropTable[Math.floor(Math.random() * dropTable.length)]
  return EQUIPMENT_CH1[randomDrop.id]
}
