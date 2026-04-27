/**
 * tower-config.js - 闯关战斗所有常量与配置
 *
 * 从 tower-battle.js 中提取的全部静态配置：
 * - 品质颜色/名称/掉落概率
 * - 复活时间表/经验表
 * - 精灵帧映射（角色+怪物）
 * - 命中特效定义
 * - 技能视觉参数
 * - Debuff 配置
 * - 战前卡牌池
 * - Buff/稀有度配置
 */

// ========== 品质系统 ==========
const QUALITY_COLORS = {
  legendary: '#ff8c00',
  epic: '#a335ee',
  rare: '#0070dd',
  uncommon: '#1eff00',
  common: '#9d9d9d'
}

const QUALITY_NAMES = {
  legendary: '传说',
  epic: '史诗',
  rare: '稀有',
  uncommon: '优良',
  common: '普通'
}

const QUALITY_DROP_CHANCE = {
  legendary: 0.1,
  epic: 0.1,
  rare: 0.2,
  uncommon: 0.15,
  common: 0.45
}

const DROP_LIFETIME = 8000 // 8秒拾取时限

// ========== 复活/经验表 ==========
const RESPAWN_TABLE = {}
for (let lv = 1; lv <= 100; lv++) RESPAWN_TABLE[lv] = lv * 2

const EXP_TABLE = []
for (let lv = 1; lv <= 50; lv++) EXP_TABLE[lv] = Math.floor(120 * Math.pow(1.18, lv))

// ========== 分包路径 ==========
const PKG = 'subpackages/battle/'

// ========== 角色精灵帧映射 ==========
const HERO_SPRITES = {
  zhenbao: {
    walk: [
      'HERO_ZHENBAO_WALK_01', 'HERO_ZHENBAO_WALK_02', 'HERO_ZHENBAO_WALK_03',
      'HERO_ZHENBAO_WALK_04', 'HERO_ZHENBAO_WALK_05', 'HERO_ZHENBAO_WALK_06',
      'HERO_ZHENBAO_WALK_07', 'HERO_ZHENBAO_WALK_08'
    ],
    idle: [
      'HERO_ZHENBAO_IDLE_01', 'HERO_ZHENBAO_IDLE_02', 'HERO_ZHENBAO_IDLE_03',
      'HERO_ZHENBAO_IDLE_04', 'HERO_ZHENBAO_IDLE_05', 'HERO_ZHENBAO_IDLE_06',
      'HERO_ZHENBAO_IDLE_07', 'HERO_ZHENBAO_IDLE_08'
    ],
    attack: [
      'HERO_ZHENBAO_ATTACK_01', 'HERO_ZHENBAO_ATTACK_02', 'HERO_ZHENBAO_ATTACK_03',
      'HERO_ZHENBAO_ATTACK_04', 'HERO_ZHENBAO_ATTACK_05', 'HERO_ZHENBAO_ATTACK_06',
      'HERO_ZHENBAO_ATTACK_07', 'HERO_ZHENBAO_ATTACK_08'
    ],
    slash: [
      'HERO_ZHENBAO_SLASH_01', 'HERO_ZHENBAO_SLASH_02', 'HERO_ZHENBAO_SLASH_03',
      'HERO_ZHENBAO_SLASH_04', 'HERO_ZHENBAO_SLASH_05', 'HERO_ZHENBAO_SLASH_06',
      'HERO_ZHENBAO_SLASH_07', 'HERO_ZHENBAO_SLASH_08', 'HERO_ZHENBAO_SLASH_09',
      'HERO_ZHENBAO_SLASH_10', 'HERO_ZHENBAO_SLASH_11', 'HERO_ZHENBAO_SLASH_12',
      'HERO_ZHENBAO_SLASH_13'
    ],
    shield: [
      'HERO_ZHENBAO_SHIELD_01', 'HERO_ZHENBAO_SHIELD_02', 'HERO_ZHENBAO_SHIELD_03',
      'HERO_ZHENBAO_SHIELD_04', 'HERO_ZHENBAO_SHIELD_05', 'HERO_ZHENBAO_SHIELD_06',
      'HERO_ZHENBAO_SHIELD_07', 'HERO_ZHENBAO_SHIELD_08'
    ],
    buff: [
      'HERO_ZHENBAO_BUFF_01', 'HERO_ZHENBAO_BUFF_02', 'HERO_ZHENBAO_BUFF_03',
      'HERO_ZHENBAO_BUFF_04', 'HERO_ZHENBAO_BUFF_05', 'HERO_ZHENBAO_BUFF_06',
      'HERO_ZHENBAO_BUFF_07', 'HERO_ZHENBAO_BUFF_08'
    ],
    frameRate: { walk: 150, idle: 300, attack: 80, slash: 70, shield: 90, buff: 100 }
  },
  lixiaobao: {
    walk: [
      'HERO_LIXIAOBAO_WALK_01', 'HERO_LIXIAOBAO_WALK_02', 'HERO_LIXIAOBAO_WALK_03',
      'HERO_LIXIAOBAO_WALK_04', 'HERO_LIXIAOBAO_WALK_05', 'HERO_LIXIAOBAO_WALK_06',
      'HERO_LIXIAOBAO_WALK_07', 'HERO_LIXIAOBAO_WALK_08'
    ],
    idle: [
      'HERO_LIXIAOBAO_IDLE_01', 'HERO_LIXIAOBAO_IDLE_02', 'HERO_LIXIAOBAO_IDLE_03',
      'HERO_LIXIAOBAO_IDLE_04', 'HERO_LIXIAOBAO_IDLE_05', 'HERO_LIXIAOBAO_IDLE_06',
      'HERO_LIXIAOBAO_IDLE_07', 'HERO_LIXIAOBAO_IDLE_08'
    ],
    cast_attack: [
      'HERO_LIXIAOBAO_CAST_ATK_01', 'HERO_LIXIAOBAO_CAST_ATK_02', 'HERO_LIXIAOBAO_CAST_ATK_03',
      'HERO_LIXIAOBAO_CAST_ATK_04', 'HERO_LIXIAOBAO_CAST_ATK_05'
    ],
    cast_ice: [
      'HERO_LIXIAOBAO_ICE_01', 'HERO_LIXIAOBAO_ICE_02', 'HERO_LIXIAOBAO_ICE_03',
      'HERO_LIXIAOBAO_ICE_04', 'HERO_LIXIAOBAO_ICE_05', 'HERO_LIXIAOBAO_ICE_06',
      'HERO_LIXIAOBAO_ICE_07', 'HERO_LIXIAOBAO_ICE_08'
    ],
    cast_lightning: [
      'HERO_LIXIAOBAO_LIGHTNING_01', 'HERO_LIXIAOBAO_LIGHTNING_02', 'HERO_LIXIAOBAO_LIGHTNING_03',
      'HERO_LIXIAOBAO_LIGHTNING_04', 'HERO_LIXIAOBAO_LIGHTNING_05', 'HERO_LIXIAOBAO_LIGHTNING_06',
      'HERO_LIXIAOBAO_LIGHTNING_07', 'HERO_LIXIAOBAO_LIGHTNING_08'
    ],
    frameRate: { walk: 150, idle: 300, attack: 80, cast_attack: 90, cast_fireball: 100, cast_ice: 120, cast_lightning: 80 }
  },
  cat: {
    walk: [
      'CAT_WALK_01', 'CAT_WALK_02', 'CAT_WALK_03', 'CAT_WALK_04', 'CAT_WALK_05',
      'CAT_WALK_06', 'CAT_WALK_07', 'CAT_WALK_08', 'CAT_WALK_09', 'CAT_WALK_10',
      'CAT_WALK_11', 'CAT_WALK_12'
    ],
    idle: [
      'CAT_IDLE_01', 'CAT_IDLE_02', 'CAT_IDLE_03', 'CAT_IDLE_04',
      'CAT_IDLE_05', 'CAT_IDLE_06', 'CAT_IDLE_07', 'CAT_IDLE_08'
    ],
    attack: [
      'CAT_WALK_01', 'CAT_WALK_02', 'CAT_WALK_03', 'CAT_WALK_04', 'CAT_WALK_05',
      'CAT_WALK_06', 'CAT_WALK_07', 'CAT_WALK_08', 'CAT_WALK_09', 'CAT_WALK_10'
    ],
    cast: [
      'CAT_WALK_01', 'CAT_WALK_02', 'CAT_WALK_03', 'CAT_WALK_04', 'CAT_WALK_05',
      'CAT_WALK_06', 'CAT_WALK_07', 'CAT_WALK_08'
    ],
    frameRate: { walk: 120, idle: 250, attack: 65, cast: 90 }
  }
}

// ========== 怪物精灵映射 ==========
const MONSTER_SPRITES = {
  slime: {
    type: 'slime_cat',
    idle: ['SLIME_CAT_IDLE_1', 'SLIME_CAT_IDLE_2', 'SLIME_CAT_IDLE_3', 'SLIME_CAT_IDLE_4', 'SLIME_CAT_IDLE_5', 'SLIME_CAT_IDLE_6', 'SLIME_CAT_IDLE_7'],
    attack: ['SLIME_CAT_ATTACK_0008', 'SLIME_CAT_ATTACK_0010', 'SLIME_CAT_ATTACK_0012', 'SLIME_CAT_ATTACK_0014', 'SLIME_CAT_ATTACK_0016', 'SLIME_CAT_ATTACK_0018', 'SLIME_CAT_ATTACK_0020', 'SLIME_CAT_ATTACK_0022'],
    skill: ['SLIME_CAT_SKILL_0050', 'SLIME_CAT_SKILL_0053', 'SLIME_CAT_SKILL_0056', 'SLIME_CAT_SKILL_0059', 'SLIME_CAT_SKILL_0062', 'SLIME_CAT_SKILL_0065', 'SLIME_CAT_SKILL_0068', 'SLIME_CAT_SKILL_0071', 'SLIME_CAT_SKILL_0074', 'SLIME_CAT_SKILL_0077', 'SLIME_CAT_SKILL_0080'],
    walk: ['SLIME_CAT_WALK_01', 'SLIME_CAT_WALK_02', 'SLIME_CAT_WALK_03', 'SLIME_CAT_WALK_04', 'SLIME_CAT_WALK_05', 'SLIME_CAT_WALK_06', 'SLIME_CAT_WALK_07', 'SLIME_CAT_WALK_08', 'SLIME_CAT_WALK_09', 'SLIME_CAT_WALK_10', 'SLIME_CAT_WALK_11', 'SLIME_CAT_WALK_12'],
    frameRate: { idle: 300, attack: 120, skill: 180, walk: 140 },
    scale: 1.2,
    pounceSkill: {
      name: '黏液扑击',
      cooldown: 10000,
      range: 500,
      aoeRadius: 100,
      rootChance: 0.30,
      rootDuration: 2500,
      power: 1.5,
      dashSpeed: 600,
      preDashTime: 800,
      damageFrame: 3,
    },
  },
  goblin: {
    type: 'shadow_mouse',
    idle: ['SHADOW_MOUSE_IDLE_01', 'SHADOW_MOUSE_IDLE_02', 'SHADOW_MOUSE_IDLE_03', 'SHADOW_MOUSE_IDLE_04', 'SHADOW_MOUSE_IDLE_05', 'SHADOW_MOUSE_IDLE_06'],
    attack: ['SHADOW_MOUSE_ATTACK_01', 'SHADOW_MOUSE_ATTACK_02', 'SHADOW_MOUSE_ATTACK_03', 'SHADOW_MOUSE_ATTACK_04', 'SHADOW_MOUSE_ATTACK_05', 'SHADOW_MOUSE_ATTACK_06', 'SHADOW_MOUSE_ATTACK_07'],
    skill: [
      'SHADOW_MOUSE_SKILL_01','SHADOW_MOUSE_SKILL_02','SHADOW_MOUSE_SKILL_03',
      'SHADOW_MOUSE_SKILL_04','SHADOW_MOUSE_SKILL_05','SHADOW_MOUSE_SKILL_06',
      'SHADOW_MOUSE_SKILL_07','SHADOW_MOUSE_SKILL_08','SHADOW_MOUSE_SKILL_09',
      'SHADOW_MOUSE_SKILL_10','SHADOW_MOUSE_SKILL_11','SHADOW_MOUSE_SKILL_12'
    ],
    walk: ['SHADOW_MOUSE_WALK_01', 'SHADOW_MOUSE_WALK_02', 'SHADOW_MOUSE_WALK_03', 'SHADOW_MOUSE_WALK_04', 'SHADOW_MOUSE_WALK_05', 'SHADOW_MOUSE_WALK_06', 'SHADOW_MOUSE_WALK_07', 'SHADOW_MOUSE_WALK_08', 'SHADOW_MOUSE_WALK_09', 'SHADOW_MOUSE_WALK_10', 'SHADOW_MOUSE_WALK_11', 'SHADOW_MOUSE_WALK_12'],
    frameRate: { idle: 280, attack: 100, skill: 120, walk: 130 },
    scale: 1.0,
    biteSkill: {
      name: '暗影咬',
      cooldown: 15000,
      range: 140,
      power: 1.4,
      hitCount: 3,
      preBiteTime: 1000,
      chargeFrameRate: 330,
      attackFrameRate: 110,
    },
    stealthSkill: {
      name: '暗影突袭',
      cooldown: 20000,
      stealthDuration: 5000,
      speedBoost: 1.8,
    },
  },
  orc: {
    type: 'slime_cat',
    idle: ['SLIME_CAT_IDLE_1', 'SLIME_CAT_IDLE_2', 'SLIME_CAT_IDLE_3', 'SLIME_CAT_IDLE_4', 'SLIME_CAT_IDLE_5', 'SLIME_CAT_IDLE_6', 'SLIME_CAT_IDLE_7'],
    attack: ['SLIME_CAT_ATTACK_0008', 'SLIME_CAT_ATTACK_0010', 'SLIME_CAT_ATTACK_0012', 'SLIME_CAT_ATTACK_0014', 'SLIME_CAT_ATTACK_0016', 'SLIME_CAT_ATTACK_0018', 'SLIME_CAT_ATTACK_0020', 'SLIME_CAT_ATTACK_0022'],
    walk: ['SLIME_CAT_WALK_01', 'SLIME_CAT_WALK_02', 'SLIME_CAT_WALK_03', 'SLIME_CAT_WALK_04', 'SLIME_CAT_WALK_05', 'SLIME_CAT_WALK_06', 'SLIME_CAT_WALK_07', 'SLIME_CAT_WALK_08', 'SLIME_CAT_WALK_09', 'SLIME_CAT_WALK_10', 'SLIME_CAT_WALK_11', 'SLIME_CAT_WALK_12'],
    frameRate: { idle: 280, attack: 100, walk: 130, cast: 150 },
    scale: 1.5,
    tint: '#8b5e3c',
    silenceSkill: {
      name: '禁止喧哗',
      cooldown: 20000,
      range: 300,
      dmgReduction: 0.30,
      duration: 5000,
      castTime: 800,
    },
    transformSkill: {
      name: '幻化',
      hpThreshold: 0.35,
      atkBoost: 0.80,
      defBoost: 1.00,
      spdBoost: 0.50,
      atkSpeedBoost: 0.60,
      castTime: 1200,
      duration: 99999999,
    },
  },
  wolf: {
    type: 'shadow_mouse',
    idle: ['SHADOW_MOUSE_IDLE_01', 'SHADOW_MOUSE_IDLE_02', 'SHADOW_MOUSE_IDLE_03', 'SHADOW_MOUSE_IDLE_04', 'SHADOW_MOUSE_IDLE_05', 'SHADOW_MOUSE_IDLE_06'],
    attack: ['SHADOW_MOUSE_ATTACK_01', 'SHADOW_MOUSE_ATTACK_02', 'SHADOW_MOUSE_ATTACK_03', 'SHADOW_MOUSE_ATTACK_04', 'SHADOW_MOUSE_ATTACK_05', 'SHADOW_MOUSE_ATTACK_06', 'SHADOW_MOUSE_ATTACK_07'],
    walk: ['SHADOW_MOUSE_WALK_01', 'SHADOW_MOUSE_WALK_02', 'SHADOW_MOUSE_WALK_03', 'SHADOW_MOUSE_WALK_04', 'SHADOW_MOUSE_WALK_05', 'SHADOW_MOUSE_WALK_06', 'SHADOW_MOUSE_WALK_07', 'SHADOW_MOUSE_WALK_08', 'SHADOW_MOUSE_WALK_09', 'SHADOW_MOUSE_WALK_10', 'SHADOW_MOUSE_WALK_11', 'SHADOW_MOUSE_WALK_12'],
    frameRate: { idle: 200, attack: 70, walk: 100 },
    scale: 1.1,
    tint: '#7a7a7a'
  },
  undead: {
    type: 'shadow_mouse',
    idle: ['SHADOW_MOUSE_IDLE_01', 'SHADOW_MOUSE_IDLE_02', 'SHADOW_MOUSE_IDLE_03', 'SHADOW_MOUSE_IDLE_04', 'SHADOW_MOUSE_IDLE_05', 'SHADOW_MOUSE_IDLE_06'],
    attack: ['SHADOW_MOUSE_ATTACK_01', 'SHADOW_MOUSE_ATTACK_02', 'SHADOW_MOUSE_ATTACK_03', 'SHADOW_MOUSE_ATTACK_04', 'SHADOW_MOUSE_ATTACK_05', 'SHADOW_MOUSE_ATTACK_06', 'SHADOW_MOUSE_ATTACK_07'],
    walk: ['SHADOW_MOUSE_WALK_01', 'SHADOW_MOUSE_WALK_02', 'SHADOW_MOUSE_WALK_03', 'SHADOW_MOUSE_WALK_04', 'SHADOW_MOUSE_WALK_05', 'SHADOW_MOUSE_WALK_06', 'SHADOW_MOUSE_WALK_07', 'SHADOW_MOUSE_WALK_08', 'SHADOW_MOUSE_WALK_09', 'SHADOW_MOUSE_WALK_10', 'SHADOW_MOUSE_WALK_11', 'SHADOW_MOUSE_WALK_12'],
    frameRate: { idle: 350, attack: 140, walk: 160 },
    scale: 1.15,
    tint: '#9b8fb4'
  },
  demon: {
    type: 'slime_cat',
    idle: ['SLIME_CAT_IDLE_1', 'SLIME_CAT_IDLE_2', 'SLIME_CAT_IDLE_3', 'SLIME_CAT_IDLE_4', 'SLIME_CAT_IDLE_5', 'SLIME_CAT_IDLE_6', 'SLIME_CAT_IDLE_7'],
    attack: ['SLIME_CAT_ATTACK_0008', 'SLIME_CAT_ATTACK_0010', 'SLIME_CAT_ATTACK_0012', 'SLIME_CAT_ATTACK_0014', 'SLIME_CAT_ATTACK_0016', 'SLIME_CAT_ATTACK_0018', 'SLIME_CAT_ATTACK_0020', 'SLIME_CAT_ATTACK_0022'],
    walk: ['SLIME_CAT_WALK_01', 'SLIME_CAT_WALK_02', 'SLIME_CAT_WALK_03', 'SLIME_CAT_WALK_04', 'SLIME_CAT_WALK_05', 'SLIME_CAT_WALK_06', 'SLIME_CAT_WALK_07', 'SLIME_CAT_WALK_08', 'SLIME_CAT_WALK_09', 'SLIME_CAT_WALK_10', 'SLIME_CAT_WALK_11', 'SLIME_CAT_WALK_12'],
    frameRate: { idle: 250, attack: 90, walk: 110 },
    scale: 1.6,
    tint: '#c0392b'
  },
  dragon: {
    type: 'slime_cat',
    idle: ['SLIME_CAT_IDLE_1', 'SLIME_CAT_IDLE_2', 'SLIME_CAT_IDLE_3', 'SLIME_CAT_IDLE_4', 'SLIME_CAT_IDLE_5', 'SLIME_CAT_IDLE_6', 'SLIME_CAT_IDLE_7'],
    attack: ['SLIME_CAT_ATTACK_0008', 'SLIME_CAT_ATTACK_0010', 'SLIME_CAT_ATTACK_0012', 'SLIME_CAT_ATTACK_0014', 'SLIME_CAT_ATTACK_0016', 'SLIME_CAT_ATTACK_0018', 'SLIME_CAT_ATTACK_0020', 'SLIME_CAT_ATTACK_0022'],
    walk: ['SLIME_CAT_WALK_01', 'SLIME_CAT_WALK_02', 'SLIME_CAT_WALK_03', 'SLIME_CAT_WALK_04', 'SLIME_CAT_WALK_05', 'SLIME_CAT_WALK_06', 'SLIME_CAT_WALK_07', 'SLIME_CAT_WALK_08', 'SLIME_CAT_WALK_09', 'SLIME_CAT_WALK_10', 'SLIME_CAT_WALK_11', 'SLIME_CAT_WALK_12'],
    frameRate: { idle: 300, attack: 130, walk: 150 },
    scale: 2.0,
    tint: '#e74c3c'
  }
}

// ========== 命中特效帧定义 ==========
const HIT_EFFECTS = {
  fireball: {
    frames: [
      'LXB_HIT_FIREBALL_01','LXB_HIT_FIREBALL_02','LXB_HIT_FIREBALL_03',
      'LXB_HIT_FIREBALL_04','LXB_HIT_FIREBALL_05','LXB_HIT_FIREBALL_06',
      'LXB_HIT_FIREBALL_07','LXB_HIT_FIREBALL_08','LXB_HIT_FIREBALL_09',
      'LXB_HIT_FIREBALL_10','LXB_HIT_FIREBALL_11','LXB_HIT_FIREBALL_12',
      'LXB_HIT_FIREBALL_13','LXB_HIT_FIREBALL_14','LXB_HIT_FIREBALL_15',
      'LXB_HIT_FIREBALL_16','LXB_HIT_FIREBALL_17','LXB_HIT_FIREBALL_18',
      'LXB_HIT_FIREBALL_19','LXB_HIT_FIREBALL_20','LXB_HIT_FIREBALL_21',
      'LXB_HIT_FIREBALL_22','LXB_HIT_FIREBALL_23','LXB_HIT_FIREBALL_24'
    ],
    frameRate: 20
  },
  ice: {
    frames: [
      'LXB_HIT_ICE_01','LXB_HIT_ICE_02','LXB_HIT_ICE_03','LXB_HIT_ICE_04',
      'LXB_HIT_ICE_05','LXB_HIT_ICE_06','LXB_HIT_ICE_07','LXB_HIT_ICE_08',
      'LXB_HIT_ICE_09','LXB_HIT_ICE_10','LXB_HIT_ICE_11'
    ],
    frameRate: 44
  },
  lightning: {
    frames: [
      'LXB_HIT_LIGHTNING_01','LXB_HIT_LIGHTNING_02','LXB_HIT_LIGHTNING_03',
      'LXB_HIT_LIGHTNING_04','LXB_HIT_LIGHTNING_05','LXB_HIT_LIGHTNING_06',
      'LXB_HIT_LIGHTNING_07','LXB_HIT_LIGHTNING_08','LXB_HIT_LIGHTNING_09',
      'LXB_HIT_LIGHTNING_10','LXB_HIT_LIGHTNING_11','LXB_HIT_LIGHTNING_12'
    ],
    frameRate: 40
  }
}

// ========== 技能视觉参数 ==========
const SKILL_VISUAL = {
  fireball: {
    beamBaseSize: 260,
    beamSpacing: 50,
    hitFrameSize: 170,
    charHitBaseSize: 150,
    castStartYOffset: -130,
    castStartXOffset: 60,
    castAnchorRatio: 0.12,
  },
  ice: {
    beamBaseSize: 120,
    beamSpacing: 22,
    hitFrameSize: 100,
    charHitBaseSize: 90,
    castStartYOffset: 0,
    castStartXOffset: 0,
    castAnchorRatio: 0.5,
  },
  lightning: {
    beamBaseSize: 120,
    beamSpacing: 22,
    hitFrameSize: 220,
    charHitBaseSize: 100,
    castStartYOffset: 0,
    castStartXOffset: 0,
    castAnchorRatio: 0.5,
  },
  get(hitType) {
    return this[hitType] || this.ice
  }
}

// ========== 灼烧Debuff配置 ==========
const BURN_DEBUFF = {
  id: 'burn',
  name: '灼烧',
  duration: 3000,
  tickInterval: 500,
  damageRatio: 0.05,
  damageBoost: 1.10,
  color: '#ff6600',
  auraColor: 'rgba(255,100,0,0.35)',
}

// ========== 战前卡牌池 ==========
const CARD_POOL = [
  // 攻击类
  { id: 'atk_boost_1', name: '锋利之刃', desc: '全体攻击+15%', icon: '\u2694', color: '#e74c3c', effect: { type: 'atk_mul', value: 0.15 } },
  { id: 'atk_boost_2', name: '狂暴之力', desc: '全体攻击+25%', icon: '\uD83D\uDD25', color: '#ff4444', effect: { type: 'atk_mul', value: 0.25 }, rare: true },
  { id: 'crit_card', name: '致命一击', desc: '暴击率+20%', icon: '\uD83D\uDCA5', color: '#f39c12', effect: { type: 'crit', value: 0.2 } },
  { id: 'spd_boost', name: '疾风步', desc: '全体速度+20%', icon: '\uD83D\uDC28', color: '#3498db', effect: { type: 'spd_mul', value: 0.2 } },
  // 防御类
  { id: 'def_boost_1', name: '铁壁守护', desc: '全体防御+20%', icon: '\uD83D\uDEE1', color: '#3498db', effect: { type: 'def_mul', value: 0.2 } },
  { id: 'def_boost_2', name: '不朽意志', desc: '全体防御+35%', icon: '\uD83D\uDEE0', color: '#2980b9', effect: { type: 'def_mul', value: 0.35 }, rare: true },
  { id: 'hp_boost_1', name: '生命源泉', desc: '全体生命+20%', icon: '\u2764', color: '#2ecc71', effect: { type: 'hp_mul', value: 0.2 } },
  { id: 'hp_boost_2', name: '巨人之血', desc: '全体生命+35%', icon: '\u2764\uFE0F', color: '#27ae60', effect: { type: 'hp_mul', value: 0.35 }, rare: true },
  // 功能类
  { id: 'exp_boost', name: '知识结晶', desc: '经验获取+50%', icon: '\uD83D\uDCD6', color: '#9b59b6', effect: { type: 'exp_mul', value: 0.5 } },
  { id: 'drop_boost', name: '幸运之星', desc: '装备掉率+30%（高品质概率提升）', icon: '\uD83C\uDF40', color: '#f1c40f', effect: { type: 'drop_rare', value: 0.3 } },
  { id: 'respawn_fast', name: '不死鸟羽', desc: '复活速度-40%', icon: '\uD83D\uDD54', color: '#e67e22', effect: { type: 'respawn_faster', value: 0.4 } },
  { id: 'start_mp', name: '魔力涌动', desc: '开局MP全满', icon: '\u2728', color: '#9b59b6', effect: { type: 'full_mp', value: 1 } },
  // 经济类
  { id: 'gold_start', name: '金币祝福', desc: '额外获得金币奖励', icon: '\uD83D\uDCB0', color: '#f1c40f', effect: { type: 'gold_bonus', value: 200 } },
]

// ========== Buff技能配置 ==========
const BUFF_CONFIG = {
  war_cry:   { name: '战吼',  desc: '全体攻击+30%', duration: 8000, atkMult: 0.30, color: '#ff9500', icon: '\uD83D\uDCE3', auraColor: '#ffa040' },
  berserk:   { name: '狂暴', desc: '自身攻击+50%', duration: 10000, atkMult: 0.50, color: '#ff3333', icon: '\uD83D\uDD25', auraColor: '#ff4422' },
  gear_second: { name: '二档', desc: '速度攻击提升', duration: 8000, atkMult: 0.25, spdMult: 0.20, color: '#e74c3c', icon: '\uD83D\uDC28', auraColor: '#ff6b35' },
}

// ========== 稀有度配置 ==========
const RARITY_CONFIG = {
  normal:   { scale: 1.0, label: '', color: '#ffffff', expMult: 1.0, namePrefix: '' },
  elite:    { scale: 2.0, label: '\u3010精英\u3011', color: '#ff8c00', expMult: 2.5, namePrefix: '精英' },
  lord:     { scale: 5.0, label: '\u3010领主\u3011', color: '#ff2222', expMult: 10.0, namePrefix: '领主' }
}

module.exports = {
  QUALITY_COLORS,
  QUALITY_NAMES,
  QUALITY_DROP_CHANCE,
  DROP_LIFETIME,
  RESPAWN_TABLE,
  EXP_TABLE,
  PKG,
  HERO_SPRITES,
  MONSTER_SPRITES,
  HIT_EFFECTS,
  SKILL_VISUAL,
  BURN_DEBUFF,
  CARD_POOL,
  BUFF_CONFIG,
  RARITY_CONFIG,
}
