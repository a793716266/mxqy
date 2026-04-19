/**
 * tower-battle.js - 闯关战斗核心（重写版）
 *
 * 核心机制：
 * - ARPG式实时战斗：平A自动 + 技能手动（底部4技能栏）
 * - 波次制战斗：每波怪物消灭后出现虫洞，靠近进入下一波
 * - 最后一波击败BOSS即胜利
 * - 角色死亡后复活，保留等级/装备/技能（类似英雄联盟）
 * - 全员在场角色同时死亡则游戏失败
 * - 击杀怪物获得经验和装备掉落，升级解锁技能
 * - 开局卡牌选择：从3张随机属性卡中选1张
 * - 掉落装备有拾取时限（8秒），需手动点击收集
 * - 装备品质分级特效：传说>史诗>稀有>普通
 *
 * 渲染资源：
 * - 角色：使用真实动画帧精灵（walk/idle/attack/cast）
 * - 怪物：使用真实怪物精灵（slime_cat/shadow_mouse）
 * - 特效：施法帧 + 击中帧粒子
 */

import { getRandomEquipment } from '../../data/equipment.js'

// ========== 常量定义 ==========

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

// 复活时间表（秒） = 等级 * 2
const RESPAWN_TABLE = {}
for (let lv = 1; lv <= 100; lv++) RESPAWN_TABLE[lv] = lv * 2

// 经验值表（每级所需经验）
const EXP_TABLE = []
// 升级经验公式：基数120，每级递增18%（前期需要多只怪才能升一级）
for (let lv = 1; lv <= 50; lv++) EXP_TABLE[lv] = Math.floor(120 * Math.pow(1.18, lv))

// 分包路径前缀
const PKG = 'subpackages/battle/'

// ========== 精灵帧映射表 ==========

/** 角色动画帧 key 列表 */
const HERO_SPRITES = {
  zhenbao: {
    walk: [
      'HERO_ZHENBAO_WALK_03', 'HERO_ZHENBAO_WALK_04', 'HERO_ZHENBAO_WALK_05',
      'HERO_ZHENBAO_WALK_06', 'HERO_ZHENBAO_WALK_07', 'HERO_ZHENBAO_WALK_08',
      'HERO_ZHENBAO_WALK_09', 'HERO_ZHENBAO_WALK_10'
    ],
    idle: [
      'HERO_ZHENBAO_IDLE_01', 'HERO_ZHENBAO_IDLE_02', 'HERO_ZHENBAO_IDLE_03',
      'HERO_ZHENBAO_IDLE_04', 'HERO_ZHENBAO_IDLE_05'
    ],
    // 普攻（4帧轻攻击）
    attack: [
      'HERO_ZHENBAO_ATTACK_01', 'HERO_ZHENBAO_ATTACK_02', 'HERO_ZHENBAO_ATTACK_03',
      'HERO_ZHENBAO_ATTACK_04'
    ],
    // 斩击/大招（13帧重击，用于技能）
    slash: [
      'HERO_ZHENBAO_SLASH_01', 'HERO_ZHENBAO_SLASH_02', 'HERO_ZHENBAO_SLASH_03',
      'HERO_ZHENBAO_SLASH_04', 'HERO_ZHENBAO_SLASH_05', 'HERO_ZHENBAO_SLASH_06',
      'HERO_ZHENBAO_SLASH_07', 'HERO_ZHENBAO_SLASH_08', 'HERO_ZHENBAO_SLASH_09',
      'HERO_ZHENBAO_SLASH_10', 'HERO_ZHENBAO_SLASH_11', 'HERO_ZHENBAO_SLASH_12',
      'HERO_ZHENBAO_SLASH_13'
    ],
    frameRate: { walk: 150, idle: 300, attack: 80, slash: 70 }
  },
  lixiaobao: {
    walk: [
      'HERO_LIXIAOBAO_WALK_0', 'HERO_LIXIAOBAO_WALK_1', 'HERO_LIXIAOBAO_WALK_2',
      'HERO_LIXIAOBAO_WALK_3', 'HERO_LIXIAOBAO_WALK_4', 'HERO_LIXIAOBAO_WALK_5',
      'HERO_LIXIAOBAO_WALK_6', 'HERO_LIXIAOBAO_WALK_7'
    ],
    idle: ['HERO_LIXIAOBAO_IDLE_0', 'HERO_LIXIAOBAO_IDLE_1'],
    // 真实攻击帧：法杖敲击（5帧）
    attack: [
      'HERO_LIXIAOBAO_ATTACK_01', 'HERO_LIXIAOBAO_ATTACK_02', 'HERO_LIXIAOBAO_ATTACK_03',
      'HERO_LIXIAOBAO_ATTACK_04', 'HERO_LIXIAOBAO_ATTACK_05'
    ],
    // 法杖施法（5帧，用于非元素技能）
    cast_attack: [
      'HERO_LIXIAOBAO_CAST_ATK_01', 'HERO_LIXIAOBAO_CAST_ATK_02', 'HERO_LIXIAOBAO_CAST_ATK_03',
      'HERO_LIXIAOBAO_CAST_ATK_04', 'HERO_LIXIAOBAO_CAST_ATK_05'
    ],
    // 火球施法（11帧）
    cast_fireball: [
      'HERO_LIXIAOBAO_FIREBALL_01', 'HERO_LIXIAOBAO_FIREBALL_02', 'HERO_LIXIAOBAO_FIREBALL_03',
      'HERO_LIXIAOBAO_FIREBALL_04', 'HERO_LIXIAOBAO_FIREBALL_05', 'HERO_LIXIAOBAO_FIREBALL_06',
      'HERO_LIXIAOBAO_FIREBALL_07', 'HERO_LIXIAOBAO_FIREBALL_08', 'HERO_LIXIAOBAO_FIREBALL_09',
      'HERO_LIXIAOBAO_FIREBALL_10', 'HERO_LIXIAOBAO_FIREBALL_11'
    ],
    // 冰晶施法（8帧）
    cast_ice: [
      'HERO_LIXIAOBAO_ICE_01', 'HERO_LIXIAOBAO_ICE_02', 'HERO_LIXIAOBAO_ICE_03',
      'HERO_LIXIAOBAO_ICE_04', 'HERO_LIXIAOBAO_ICE_05', 'HERO_LIXIAOBAO_ICE_06',
      'HERO_LIXIAOBAO_ICE_07', 'HERO_LIXIAOBAO_ICE_08'
    ],
    // 雷电施法（15帧，替代流星雨）
    cast_lightning: [
      'HERO_LIXIAOBAO_LIGHTNING_01', 'HERO_LIXIAOBAO_LIGHTNING_02', 'HERO_LIXIAOBAO_LIGHTNING_03',
      'HERO_LIXIAOBAO_LIGHTNING_04', 'HERO_LIXIAOBAO_LIGHTNING_05', 'HERO_LIXIAOBAO_LIGHTNING_06',
      'HERO_LIXIAOBAO_LIGHTNING_07', 'HERO_LIXIAOBAO_LIGHTNING_08', 'HERO_LIXIAOBAO_LIGHTNING_09',
      'HERO_LIXIAOBAO_LIGHTNING_10', 'HERO_LIXIAOBAO_LIGHTNING_11', 'HERO_LIXIAOBAO_LIGHTNING_12',
      'HERO_LIXIAOBAO_LIGHTNING_13', 'HERO_LIXIAOBAO_LIGHTNING_14', 'HERO_LIXIAOBAO_LIGHTNING_15'
    ],
    frameRate: { walk: 150, idle: 300, attack: 80, cast_attack: 90, cast_fireball: 100, cast_ice: 120, cast_lightning: 80 }
  },
  // 路飞、糖果用猫精灵代替
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
    // 普攻+施法都复用walk帧
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

/** 怪物精灵映射 */
const MONSTER_SPRITES = {
  slime: {
    type: 'slime_cat',
    idle: ['SLIME_CAT_IDLE_1', 'SLIME_CAT_IDLE_2', 'SLIME_CAT_IDLE_3', 'SLIME_CAT_IDLE_4', 'SLIME_CAT_IDLE_5', 'SLIME_CAT_IDLE_6', 'SLIME_CAT_IDLE_7'],
    attack: ['SLIME_CAT_ATTACK_0008', 'SLIME_CAT_ATTACK_0010', 'SLIME_CAT_ATTACK_0012', 'SLIME_CAT_ATTACK_0014', 'SLIME_CAT_ATTACK_0016', 'SLIME_CAT_ATTACK_0018', 'SLIME_CAT_ATTACK_0020', 'SLIME_CAT_ATTACK_0022'],
    walk: ['SLIME_CAT_WALK_01', 'SLIME_CAT_WALK_02', 'SLIME_CAT_WALK_03', 'SLIME_CAT_WALK_04', 'SLIME_CAT_WALK_05', 'SLIME_CAT_WALK_06', 'SLIME_CAT_WALK_07', 'SLIME_CAT_WALK_08', 'SLIME_CAT_WALK_09', 'SLIME_CAT_WALK_10', 'SLIME_CAT_WALK_11', 'SLIME_CAT_WALK_12'],
    frameRate: { idle: 300, attack: 120, walk: 140 },
    scale: 1.2
  },
  goblin: {
    type: 'shadow_mouse',
    idle: ['SHADOW_MOUSE_IDLE_01', 'SHADOW_MOUSE_IDLE_02', 'SHADOW_MOUSE_IDLE_03', 'SHADOW_MOUSE_IDLE_04', 'SHADOW_MOUSE_IDLE_05', 'SHADOW_MOUSE_IDLE_06'],
    attack: ['SHADOW_MOUSE_ATTACK_01', 'SHADOW_MOUSE_ATTACK_02', 'SHADOW_MOUSE_ATTACK_03', 'SHADOW_MOUSE_ATTACK_04', 'SHADOW_MOUSE_ATTACK_05', 'SHADOW_MOUSE_ATTACK_06', 'SHADOW_MOUSE_ATTACK_07'],
    walk: ['SHADOW_MOUSE_WALK_01', 'SHADOW_MOUSE_WALK_02', 'SHADOW_MOUSE_WALK_03', 'SHADOW_MOUSE_WALK_04', 'SHADOW_MOUSE_WALK_05', 'SHADOW_MOUSE_WALK_06', 'SHADOW_MOUSE_WALK_07', 'SHADOW_MOUSE_WALK_08', 'SHADOW_MOUSE_WALK_09', 'SHADOW_MOUSE_WALK_10', 'SHADOW_MOUSE_WALK_11', 'SHADOW_MOUSE_WALK_12'],
    frameRate: { idle: 280, attack: 100, walk: 130 },
    scale: 1.0
  },
  orc: {
    type: 'slime_cat',
    idle: ['SLIME_CAT_IDLE_1', 'SLIME_CAT_IDLE_2', 'SLIME_CAT_IDLE_3', 'SLIME_CAT_IDLE_4', 'SLIME_CAT_IDLE_5', 'SLIME_CAT_IDLE_6', 'SLIME_CAT_IDLE_7'],
    attack: ['SLIME_CAT_ATTACK_0008', 'SLIME_CAT_ATTACK_0010', 'SLIME_CAT_ATTACK_0012', 'SLIME_CAT_ATTACK_0014', 'SLIME_CAT_ATTACK_0016', 'SLIME_CAT_ATTACK_0018', 'SLIME_CAT_ATTACK_0020', 'SLIME_CAT_ATTACK_0022'],
    walk: ['SLIME_CAT_WALK_01', 'SLIME_CAT_WALK_02', 'SLIME_CAT_WALK_03', 'SLIME_CAT_WALK_04', 'SLIME_CAT_WALK_05', 'SLIME_CAT_WALK_06', 'SLIME_CAT_WALK_07', 'SLIME_CAT_WALK_08', 'SLIME_CAT_WALK_09', 'SLIME_CAT_WALK_10', 'SLIME_CAT_WALK_11', 'SLIME_CAT_WALK_12'],
    frameRate: { idle: 280, attack: 100, walk: 130 },
    scale: 1.5,
    tint: '#8b5e3c'  // 兽人偏棕色
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

/** 命中特效帧定义（hit帧——在目标位置播放的命中动画） */
const HIT_EFFECTS = {
  // 普攻命中（法杖敲击/物理打击）
  attack: {
    frames: [
      'HERO_LIXIAOBAO_ATTACK_01','HERO_LIXIAOBAO_ATTACK_02','HERO_LIXIAOBAO_ATTACK_03',
      'HERO_LIXIAOBAO_ATTACK_04','HERO_LIXIAOBAO_ATTACK_05'
    ],
    frameRate: 70
  },
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

// ========== 战前卡牌定义 ==========

const CARD_POOL = [
  // === 攻击类 ===
  { id: 'atk_boost_1', name: '锋利之刃', desc: '全体攻击+15%', icon: '⚔', color: '#e74c3c', effect: { type: 'atk_mul', value: 0.15 } },
  { id: 'atk_boost_2', name: '狂暴之力', desc: '全体攻击+25%', icon: '🔥', color: '#ff4444', effect: { type: 'atk_mul', value: 0.25 }, rare: true },
  { id: 'crit_card', name: '致命一击', desc: '暴击率+20%', icon: '💥', color: '#f39c12', effect: { type: 'crit', value: 0.2 } },
  { id: 'spd_boost', name: '疾风步', desc: '全体速度+20%', icon: '💨', color: '#3498db', effect: { type: 'spd_mul', value: 0.2 } },

  // === 防御类 ===
  { id: 'def_boost_1', name: '铁壁守护', desc: '全体防御+20%', icon: '🛡', color: '#3498db', effect: { type: 'def_mul', value: 0.2 } },
  { id: 'def_boost_2', name: '不朽意志', desc: '全体防御+35%', icon: '🏰', color: '#2980b9', effect: { type: 'def_mul', value: 0.35 }, rare: true },
  { id: 'hp_boost_1', name: '生命源泉', desc: '全体生命+20%', icon: '❤', color: '#2ecc71', effect: { type: 'hp_mul', value: 0.2 } },
  { id: 'hp_boost_2', name: '巨人之血', desc: '全体生命+35%', icon: '💚', color: '#27ae60', effect: { type: 'hp_mul', value: 0.35 }, rare: true },

  // === 功能类 ===
  { id: 'exp_boost', name: '知识结晶', desc: '经验获取+50%', icon: '📖', color: '#9b59b6', effect: { type: 'exp_mul', value: 0.5 } },
  { id: 'drop_boost', name: '幸运之星', desc: '装备掉率+30%（高品质概率提升）', icon: '🍀', color: '#f1c40f', effect: { type: 'drop_rare', value: 0.3 } },
  { id: 'respawn_fast', name: '不死鸟羽', desc: '复活速度-40%', icon: '🕊', color: '#e67e22', effect: { type: 'respawn_faster', value: 0.4 } },
  { id: 'start_mp', name: '魔力涌动', desc: '开局MP全满', icon: '✨', color: '#9b59b6', effect: { type: 'full_mp', value: 1 } },

  // === 经济类 ===
  { id: 'gold_start', name: '金币祝福', desc: '额外获得金币奖励', icon: '💰', color: '#f1c40f', effect: { type: 'gold_bonus', value: 200 } },
]

// ========== 主类 ==========

export class TowerBattle {
  constructor(scene, stage, party) {
    this.scene = scene
    this.game = scene.game
    this.ctx = scene.ctx
    // 动态读取尺寸（窗口resize时自动同步，避免右侧错位）
    Object.defineProperties(this, {
      width: { get() { return scene.width } },
      height: { get() { return scene.height } },
      dpr:   { get() { return scene.dpr || 1 } },
    })
    this.stage = stage
    this.party = party

    // 阶段: card_select | battle | victory | defeat
    this.phase = 'card_select'

    // 战斗时间
    this.battleTime = 0
    this.stats = { kills: 0, dropsCollected: 0, time: 0, damageDealt: 0, goldEarned: 0 }

    // 资源管理器引用
    this.assets = this.game.assets

    // 卡牌选择状态
    this._initCardPhase()

    // ===== 虫洞传送系统（替代敌方水晶）=====
    this.wormhole = null
    this._initWormhole()

    // 波次过场动画（黑屏过渡）
    this.transition = {
      active: false,
      alpha: 0,           // 0=透明, 1=全黑
      phase: 'none',      // 'none' | 'fading_out' | 'holding' | 'fading_in'
      timer: 0,
      holdDuration: 600,  // 全黑保持时间(ms)
      callback: null,     // 过渡完成后的回调
    }

    // 刷怪波次系统（10波固定，从右上角区域生成）
    this.spawnQueue = []
    this.spawnTimer = 0
    this.spawnInterval = 2500  // 波次间隔2.5s
    this.waveIndex = 0           // 当前波次（0-9，共10波）
    this.totalWaves = 10        // 总波数
    this.currentWaveMonsters = [] // 当前波次的剩余怪物（未生成的）
    this.waveSpawnedCount = 0   // 当前波已生成数量
    this.waveTotalCount = 0     // 当前波总数量
    this.waveActive = false     // 当前波是否在活跃中
    this.waveCooldownTimer = 0  // 波次间冷却计时器
    this.waveCooldown = 3000    // 波次间冷却3秒
    this.allWavesDone = false   // 所有波次是否已完成
    this._waveClearCooldownActive = false  // 当前波怪物死完后的冷却阶段
    this._firstWaveSpawned = false         // 第一波是否已生成（第一波特殊：直接从中心传送出现）

    // 装备分配面板状态
    this.equipPanel = {
      visible: false,
      item: null,          // 待分配的掉落物引用
      selectedCharIndex: -1,
      animTimer: 0,
    }

    // 波次定义：每波怪物类型和数量（渐进难度）
    this._initWaveDefinitions()

    // 实体数组
    this.monsters = []
    this.droppedItems = []
    this.projectiles = []
    this.effects = []
    this.particles = []

    // 视角/相机
    this.camera = { x: 0, y: 0, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0 }

    // 点击相关
    this.tapPos = null
    this.selectedCharIndex = 0 // 当前选中的角色索引
    this.lastTapTime = 0

    // 技能弧形菜单状态（点击角色后弹出）
    this.skillMenu = {
      visible: false,
      charIndex: -1,     // 哪个角色被选中
      openTimer: 0,
      maxDuration: 3000  // 3秒后自动关闭
    }

    // ===== 底部面板系统 =====
    // 临时装备背包（本场战斗有效，战斗结束清空）
    this.inventory = []           // 装备物品数组（最多8格）
    this.maxInventorySize = 8
    this.gold = 0                 // 战斗临时金币

    // 悬浮提示状态（鼠标悬停在装备上时显示属性）
    this._hoveredItem = null       // { item, x, y, source: 'inventory'|'equipped' }

    // 双击检测：背包槽位
    this._lastTapSlot = null       // { idx, time } 上一次点击的背包格
    this._DOUBLE_TAP_MS = 350      // 双击判定时间窗口（毫秒）
    this._sellTargetIndex = -1     // 用户选中要卖的装备索引（-1=无）

    // 角色装备槽（每个角色3个槽位：武器/防具/饰品）
    for (const c of this.party) {
      c.equippedItems = { weapon: null, armor: null, accessory: null }
    }

    // 战斗策略设置
    this.battleTactics = {
      targetPriority: 'nearest',   // nearest(最近) | lowestHp(最低血) | highestAtk(最高攻击) | ranged(优先远程)
      holdPosition: false,         // 是否坚守位置不移动
    }

    // 角色位置初始化（战斗阶段才调用）
    if (this.phase !== 'card_select') {
      this._initPositions()
      // 启动波次系统（延迟1秒后开始第一波）
      this.waveCooldownTimer = 1000
    }

    // 浮动文字队列（用于升级提示等）
    this.floatingTexts = []
  }

  // ==================== 卡牌选择阶段 ====================

  _initCardPhase() {
    // 从卡池随机抽3张（保证至少1张非稀有）
    const pool = [...CARD_POOL]
    const cards = []
    // 洗牌
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    // 取3张
    cards.push(pool.shift())
    cards.push(pool.shift())
    cards.push(pool.find(c => !c.rare) || pool.shift())

    this.cardPhase = {
      cards,
      selectedIndex: -1,
      confirmed: false,
      animTimer: 0,
      appliedEffects: [] // 已应用的加成效果
    }
  }

  /** 应用选中的卡牌效果到队伍 */
  _applyCardEffect(card) {
    const eff = card.effect
    for (const c of this.party) {
      switch (eff.type) {
        case 'atk_mul':
          c.atk = Math.floor(c.atk * (1 + eff.value))
          break
        case 'def_mul':
          c.def = Math.floor(c.def * (1 + eff.value))
          break
        case 'hp_mul':
          c.maxHp = Math.floor(c.maxHp * (1 + eff.value))
          c.currentHp = c.maxHp
          break
        case 'spd_mul':
          c.spd = Math.floor(c.spd * (1 + eff.value))
          break
        case 'crit':
          c.critChance = (c.critChance || 0) + eff.value
          break
        case 'exp_mul':
          c.expBonus = (c.expBonus || 0) + eff.value
          break
        case 'drop_rare':
          this._dropRareBoost = (this._dropRareBoost || 0) + eff.value
          break
        case 'respawn_faster':
          this._respawnBoost = (this._respawnBoost || 0) + eff.value
          break
        case 'full_mp':
          c.currentMp = c.maxMp
          break
        case 'gold_bonus':
          this.stats.goldEarned += eff.value
          break
      }
    }
    this.cardPhase.appliedEffects.push(card.id)
  }

  /** 确认卡牌选择，进入战斗 */
  _confirmCards() {
    if (this.cardPhase.selectedIndex < 0) return
    const card = this.cardPhase.cards[this.cardPhase.selectedIndex]
    this._applyCardEffect(card)
    this.phase = 'battle'
    this._initPositions()
    // 启动波次系统（延迟1秒后开始第一波）
    this.waveCooldownTimer = 1000
  }

  // ==================== 初始化 ====================

  /**
   * 初始化虫洞（波次结束后出现，靠近进入下一波）
   */
  _initWormhole() {
    this.wormhole = {
      x: this.width * 0.82,
      y: this.height * 0.25,
      radius: 40,
      active: false,           // 是否可见/可交互
      animTimer: 0,           // 旋转动画计时
      pulseTimer: 0,          // 脉冲呼吸计时
      spawnAnim: 0,           // 出现动画进度 (0→1)
      interactRadius: 55,     // 触碰交互半径
    }
  }

  /**
   * 激活虫洞（当前波次怪物全灭后调用）
   */
  _activateWormhole() {
    if (this.wormhole.active) return
    this.wormhole.active = true
    this.wormhole.spawnAnim = 0
    this._addFloatingText(this.wormhole.x, this.wormhole.y - 70,
      '🌀 虫洞已开启！靠近传送', '#a855f7', 3.0)
    console.log(`[Tower] ===== 第${this.waveIndex}波消灭完毕！虫洞已激活 =====`)
  }

  /**
   * 初始化10波波次定义（渐进难度）
   * 波次1-3：纯史莱姆猫
   * 波次4-6：史莱姆猫 + 暗影鼠
   * 波次7-8：+ 兽人/狼等更强怪
   * 波次9：混合大军
   * 波次10：最终决战波
   */
  _initWaveDefinitions() {
    // 每波怪物等级 = 波次×2 + 1（第1波=1级，第2波=3级...第10波=19级）
    // 稀有度：normal(普通) / elite(精英) / lord(领主)
    // 精英怪从第4波开始出现，领主仅在第10波（最后一波）出现
    this.waveDefs = [
      // 第1-3波：纯普通怪，熟悉战斗节奏
      { waveNum: 1, monsters: [
        { type: 'slime',   count: 3 }
      ]},
      { waveNum: 2, monsters: [
        { type: 'slime',   count: 4 }
      ]},
      { waveNum: 3, monsters: [
        { type: 'slime',   count: 5 }
      ]},
      // 第4-6波：出现第二种怪 + 首只精英
      { waveNum: 4, monsters: [
        { type: 'slime',   count: 3 },
        { type: 'goblin',  count: 2 }
      ]},
      { waveNum: 5, monsters: [
        { type: 'slime',   count: 3 },
        { type: 'goblin',  count: 2 },
        { type: 'slime',   count: 1, rarity: 'elite' }       // 首只精英
      ]},
      { waveNum: 6, monsters: [
        { type: 'slime',   count: 2 },
        { type: 'goblin',  count: 4 },
        { type: 'goblin',  count: 1, rarity: 'elite' }       // 精英暗影鼠
      ]},
      // 第7-8波：三种怪混合 + 精英增多
      { waveNum: 7, monsters: [
        { type: 'slime',   count: 2 },
        { type: 'goblin',  count: 3 },
        { type: 'orc',     count: 2 },
        { type: 'orc',     count: 1, rarity: 'elite' }       // 精英兽人
      ]},
      { waveNum: 8, monsters: [
        { type: 'slime',   count: 2 },
        { type: 'goblin',  count: 3 },
        { type: 'orc',     count: 2 },
        { type: 'slime',   count: 1, rarity: 'elite' },
        { type: 'goblin',  count: 1, rarity: 'elite' }
      ]},
      // 第9波：四种怪 + 多只精英，为最终BOSS做铺垫
      { waveNum: 9, monsters: [
        { type: 'slime',   count: 3 },
        { type: 'goblin',  count: 3 },
        { type: 'orc',     count: 2 },
        { type: 'wolf',    count: 1 },
        { type: 'orc',     count: 1, rarity: 'elite' },
        { type: 'wolf',    count: 1, rarity: 'elite' }
      ]},
      // 第10波（最终波）：大量精英 + 1只领主幼龙
      { waveNum: 10, monsters: [
        { type: 'slime',   count: 3 },
        { type: 'goblin',  count: 3 },
        { type: 'orc',     count: 2 },
        { type: 'wolf',    count: 2 },
        { type: 'undead',  count: 1 },
        { type: 'slime',   count: 1, rarity: 'elite' },
        { type: 'goblin',  count: 1, rarity: 'elite' },
        { type: 'orc',     count: 1, rarity: 'elite' },
        { type: 'wolf',    count: 1, rarity: 'elite' },
        { type: 'dragon',  count: 1, rarity: 'lord' }         // ★ 最终领主：幼龙 ★
      ]},
    ]
    // 计算总怪物数用于UI显示
    this.totalMonstersAllWaves = 0
    for (const w of this.waveDefs) {
      for (const m of w.monsters) {
        this.totalMonstersAllWaves += m.count
      }
    }
  }

  /**
   * 获取统一的活动区域（红框内的战场范围）
   * 角色和怪物都必须被限制在此矩形内
   */
  _getBattleArea() {
    const W = this.width
    const H = this.height
    const dpr = this.dpr
    const topBarH = Math.max(H * 0.095, 56)
    const wallThickness = 8
    // ★ 与 _renderBottomPanel 保持一致的底部面板参数
    const bottomMargin = Math.max(8, 12 * dpr)
    const skillBarH   = Math.max(H * 0.055, 40)
    const tacticsBarH = Math.max(H * 0.06, 42)
    const equipBarH   = Math.max(H * 0.22, 170)       // 与渲染实际值一致
    const totalBarH   = tacticsBarH + skillBarH + equipBarH + 8
    const panelY      = H - totalBarH - bottomMargin     // 技能栏顶部Y坐标

    // 原始范围（底部贴合技能栏顶部）
    const rawTop    = topBarH + 28
    const rawBottom = panelY
    // ★ 上方缩进15%（下方紧贴技能栏不缩进）
    const shrinkY = (rawBottom - rawTop) * 0.15

    return {
      left:   wallThickness + 4,
      right:  W - wallThickness - 4,
      top:    rawTop + shrinkY,
      bottom: rawBottom,          // 底部直接贴技能栏
    }
  }

  /** 将实体坐标钳制到活动区域内 */
  _clampToBattleArea(entity) {
    const area = this._getBattleArea()
    entity.x = Math.max(area.left, Math.min(entity.x, area.right))
    entity.y = Math.max(area.top, Math.min(entity.y, area.bottom))
  }

  /** 将目标坐标钳制到活动区域内（用于targetX/targetY） */
  _clampTargetToArea(tx, ty) {
    const area = this._getBattleArea()
    return [
      Math.max(area.left, Math.min(tx, area.right)),
      Math.max(area.top, Math.min(ty, area.bottom)),
    ]
  }

  /** 弹性缓出函数（用于怪物传送入场动画） */
  _easeOutBack(t) {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }

  _initPositions() {
    const W = this.width
    const H = this.height
    const area = this._getBattleArea()
    const safeTop = area.top
    const safeBottom = area.bottom

    const startX = W * 0.12
    const centerY = (safeTop + safeBottom) / 2
    const spacing = Math.min(H * 0.12, (safeBottom - safeTop) / Math.max(1, this.party.length))
    for (let i = 0; i < this.party.length; i++) {
      const c = this.party[i]
      c.x = c.targetX = startX + (i % 2) * 45
      c.y = c.targetY = centerY + (i - this.party.length / 2) * spacing
      // 确保在安全区域内（不被UI遮挡）
      if (c.y < safeTop) c.y = c.targetY = safeTop
      if (c.y > safeBottom) c.y = c.targetY = safeBottom
      c.attackTimer = Math.random() * 500
      c.skillCDs = {}
      c.attackAnimTimer = 0
      c.hurtTimer = 0
      c.hurtFlash = 0
      // 保存基础属性（buff系统需要用于恢复）
      if (c._baseSpd == null) c._baseSpd = c.spd
      // 初始化buff数组
      if (!c.buffs) c.buffs = []
      c.moveSpeed = 120 + (c.spd || 10) * 5
      // 攻击范围：近战角色短距离，法系远程（大范围，覆盖大部分战场）
      c.atkRange = (c.role === 'mage') ? 480 : 55
      c.isDead = false
      c.respawnTimer = 0

      // 动画状态
      c.animState = 'idle'     // idle | walk | attack | cast | dead
      c.animFrame = 0
      c.animTimer = 0
      c.castSkillId = null      // 正在施放的技能ID

      // 朝向（true=朝右，false=朝左）
      c.facingRight = true
      c._facingLocked = false   // 手动朝向锁：点击角色设置朝向后锁定，移动时解锁

      // 自动技能计时
      c.autoSkillTimer = 0     // 自动施法间隔
      c.autoSkillInterval = 5000 // 每5秒自动释放一次技能（优先CD好的）

      // 升级相关
      c.totalExp = 0            // 本场总经验
      c.levelUpFlash = 0       // 升级闪烁
    }
    // 默认选中第一个存活角色
    this.selectedCharIndex = this.party.findIndex(c => !c.isDead) || 0
  }

  // ==================== 刷怪 ====================

  // ==================== 波次系统（10波从水晶生成）====================

  /**
   * 开始新一波次：将波次定义中的怪物加入生成队列
   */
  _startNextWave() {
    if (this.waveIndex >= this.totalWaves || this.allWavesDone) {
      // 所有波次已完成！
      this._onAllWavesComplete()
      return
    }

    const waveDef = this.waveDefs[this.waveIndex]
    if (!waveDef) {
      this.allWavesDone = true
      this._onAllWavesComplete()
      return
    }

    // 构建当前波次的怪物队列（支持 {type, count, rarity} 格式）
    this.currentWaveMonsters = []
    for (const entry of waveDef.monsters) {
      const rarity = entry.rarity || 'normal'
      for (let i = 0; i < entry.count; i++) {
        this.currentWaveMonsters.push({ type: entry.type, rarity: rarity })
      }
    }
    // 打乱顺序让不同类型交错出现
    for (let i = this.currentWaveMonsters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
        ;[this.currentWaveMonsters[i], this.currentWaveMonsters[j]] = [this.currentWaveMonsters[j], this.currentWaveMonsters[i]]
    }
    this.waveSpawnedCount = 0
    this.waveTotalCount = this.currentWaveMonsters.length
    const displayWaveNum = this.waveIndex + 1

    // ===== 一波全部同时生成（不再逐个间隔出现） =====
    for (let i = 0; i < this.currentWaveMonsters.length; i++) {
      const entry = this.currentWaveMonsters[i]
      this._spawnMonster(entry.type, null, null, entry.rarity || 'normal')
      this.waveSpawnedCount++
    }
    console.log(`[Tower] \u23F0 第${displayWaveNum}波开始: ${this.waveTotalCount}只怪物(全部同时出场)`)

    this.waveIndex++
    // 波次标记为非活跃（所有怪物已生成完毕，进入清场阶段）
    this.waveActive = false
  }

  /**
   * 检查是否需要开始新波次或继续生成当前波次的怪物
   * 核心逻辑：当前波怪物全部死亡 → 冷却 → 开始下一波
   */
  _checkWaveSpawn(dt) {
    // 所有波次已完成，不再刷怪
    if (this.allWavesDone) return
    if (this.transition.active) return  // 过场期间不刷怪

    const aliveMonsters = this.monsters.filter(m => !m.isDead).length

    // ★ 第一波特殊处理：卡牌选择后延迟直接从中心传送出现（不需要虫洞）
    if (this.waveIndex === 0 && !this._firstWaveSpawned) {
      this._waveClearCooldownActive = true
      this.waveCooldownTimer -= dt
      if (this.waveCooldownTimer <= 0) {
        this._firstWaveSpawned = true
        this._waveClearCooldownActive = false
        console.log(`[Tower] 🌀 第1波怪物从中心传送出现！`)
        this._startNextWave()   // 直接生成第一波（带传送动画）
      }
      return
    }

    // 还有存活怪物 → 等它们死完（不开始新波）
    if (aliveMonsters > 0) return

    // 所有怪物已死完 → 进入冷却阶段
    if (!this._waveClearCooldownActive) {
      this._waveClearCooldownActive = true
      this.waveCooldownTimer = this.waveCooldown
      console.log(`[Tower] 第${this.waveIndex}波消灭完毕，冷却 ${this.waveCooldown/1000}s...`)
    }

    this.waveCooldownTimer -= dt
    if (this.waveCooldownTimer <= 0) {
      this._waveClearCooldownActive = false
      // ★ 不再自动开始下一波，而是激活虫洞等玩家靠近传送
      if (!this.wormhole.active && !this.transition.active) {
        this._activateWormhole()
      }
    }
  }

  /**
   * 所有波次完成 → 激活虫洞（非最后一波）或直接胜利（最后一波BOSS已死）
   * 新机制：每波结束都出现虫洞，靠近传送进入下一波
   */
  _onAllWavesComplete() {
    if (this.allWavesDone) return  // 防止重复触发
    this.allWavesDone = true

    // 如果是最终波（已击败BOSS），触发胜利
    if (this.waveIndex >= this.totalWaves) {
      this._triggerVictory()
      return
    }

    // 否则激活虫洞让玩家传送到下一波（但allWavesDone时不再激活虫洞）
    // 实际上这个分支不会走到，因为 _checkAllWavesCleared 只在所有波次生成后调用
    console.log('[Tower] ===== 全部波次已完成 =====')
  }

  /**
   * 当前波怪物全部消灭 → 激活虫洞传送
   * 新机制：每波结束都出现虫洞，靠近进入下一波
   */
  _checkAllWavesCleared() {
    if (this.allWavesDone) return
    const noActiveWave = !this.waveActive && !this._waveClearCooldownActive
    const aliveMonsters = this.monsters.filter(m => !m.isDead).length

    if (noActiveWave && aliveMonsters === 0 && this.waveIndex > 0) {
      // 当前波已清空，激活虫洞让玩家进入下一波
      if (!this.wormhole.active && !this.transition.active) {
        this._activateWormhole()
      }
    }

    // 检查是否所有波次都已完成（用于最终胜利判定）
    const wavesSpawned = this.waveIndex >= this.totalWaves
    if (wavesSpawned && noActiveWave && aliveMonsters === 0) {
      // 最终BOSS已被击败 → 胜利！
      if (!this.transition.active) {
        this._triggerVictory()
      }
    }
  }

  _spawnMonsterRandom() {
    // 兼容旧调用：随机生成一只（用于stage自定义waves的情况）
    const types = ['slime', 'goblin']
    const type = types[Math.floor(Math.random() * types.length)]
    this._spawnMonster(type)
  }

  _spawnMonster(type, x, y, rarity) {
    const tmpl = this._getMonsterTemplate(type)
    // ★ 怪物从战场中心偏右区域生成（虫洞传送效果）
    const area = this._getBattleArea()
    const centerX = (area.left + area.right) * 0.6   // 略偏右（敌方侧）
    const centerY = (area.top + area.bottom) * 0.5
    // 用 == null 同时匹配 null 和 undefined
    const useCenterSpawn = (x == null && y == null)
    const cx = useCenterSpawn ? centerX : (x || centerX)
    const cy = useCenterSpawn ? centerY : (y || centerY)

    let defaultX, defaultY
    if (useCenterSpawn) {
      // 中心区域小范围随机分布（紧凑聚集）
      const clusterRadius = 40 + Math.random() * 50
      const angle = Math.random() * Math.PI * 2
      defaultX = cx + Math.cos(angle) * clusterRadius
      defaultY = cy + Math.sin(angle) * clusterRadius
    } else {
      defaultX = cx
      defaultY = cy
    }

    // ★ 分散目标位置：传送到战场右侧后散开到各自目标点
    const spreadCX = area.left + (area.right - area.left) * (0.65 + Math.random() * 0.30)
    const spreadCY = area.top + (area.bottom - area.top) * (0.15 + Math.random() * 0.70)

    // ===== 稀有度与等级计算 =====
    rarity = rarity || 'normal'
    const rcfg = TowerBattle._RARITY_CONFIG[rarity] || TowerBattle._RARITY_CONFIG.normal
    // 等级：第1波=1级，每波+2级（波次从0开始，所以 waveIndex*2+1）
    const monsterLevel = this.waveIndex * 2 + 1
    // 每级属性增长系数（hp+8%, atk+5%, def+4%）
    const lvScaleHp   = 1 + (monsterLevel - 1) * 0.08
    const lvScaleAtk  = 1 + (monsterLevel - 1) * 0.05
    const lvScaleDef  = 1 + (monsterLevel - 1) * 0.04
    // 综合倍率 = 等级倍率 × 稀有度倍率
    const totalHpScale = lvScaleHp * rcfg.scale
    const totalAtkScale = lvScaleAtk * rcfg.scale
    const totalDefScale = lvScaleDef * rcfg.scale

    const finalName = rcfg.namePrefix ? `${rcfg.namePrefix}${tmpl.name}` : tmpl.name
    const m = {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type,
      name: finalName,
      displayName: finalName,       // 显示名称
      rarity: rarity,               //稀有度：normal / elite / lord
      level: monsterLevel,          // 怪物等级
      hp: Math.round(tmpl.hp * totalHpScale),
      maxHp: Math.round(tmpl.hp * totalHpScale),
      atk: Math.round(tmpl.atk * totalAtkScale),
      def: Math.round(tmpl.def * totalDefScale),
      spd: tmpl.spd,
      atkInterval: tmpl.atkInterval,
      atkTimer: Math.random() * 1000,
      x: (x != null) ? x : defaultX,
      y: (y != null) ? y : defaultY,
      targetX: 0, targetY: 0,
      moveSpeed: tmpl.moveSpeed + (rarity === 'lord' ? -8 : rarity === 'elite' ? -3 : 0), // 领主稍慢
      atkRange: tmpl.atkRange + (rarity === 'lord' ? 15 : rarity === 'elite' ? 6 : 0),     // 领主攻距更长
      isRanged: tmpl.isRanged || false,
      skills: tmpl.skills || null,
      scale: rarity === 'lord' ? 1.35 : rarity === 'elite' ? 1.15 : 1.0,                  // 精英/领主体型更大
      hurtTimer: 0,
      hurtFlash: 0,
      isDead: false,
      deathTimer: 0,
      isAttacking: false,
      attackAnimTimer: 0,
      statusEffects: [],
      frozenTimer: 0,
      dropQuality: this._rollDropQuality(rarity),
      dropItem: null,
      hasDropped: false,
      animState: 'idle',
      animFrame: 0,
      animTimer: 0,
      facingRight: false,
      expReward: Math.round((tmpl.expReward || Math.floor(tmpl.hp / 3)) * lvScaleHp * rcfg.expMult),
      // ★ 传送入场动画属性
      spawnAnim: 0,              // 0→1 出现进度（缩放+透明度）
      spawnTimer: 0,             // 传送动画计时器(ms)
      spawnDuration: 500 + Math.random() * 300,  // 每只怪略有错开
      isSpawning: true,          // 是否还在入场动画中
      spreadTargetX: spreadCX,   // 分散后的目标位置（AI正常移动目标）
      spreadTargetY: spreadCY,
    }
    m.targetX = m.x       // 初始位置就是生成点
    m.targetY = m.y
    // 确保分散目标在活动区域内
    const st = { x: m.spreadTargetX, y: m.spreadTargetY }
    this._clampToBattleArea(st)
    m.spreadTargetX = st.x
    m.spreadTargetY = st.y
    this.monsters.push(m)
    return m
  }

  _getMonsterTemplate(type) {
    const templates = {
      // 史莱姆猫 —— 远程攻击，有技能（黏液喷射/包裹，可冻结）
      slime:   { name: '史莱姆猫', hp: 180, atk: 12, def: 10, spd: 15, atkInterval: 3200, isRanged: true,
                   atkRange: 220, moveSpeed: 40, skills: [
                     { name: '黏液喷射', power: 1.2, type: 'magic', effect: 'freeze', freezeChance: 0.25, freezeDuration: 2000, mpCost: 8 },
                     { name: '黏液包裹', power: 1.4, type: 'magic', effect: 'freeze', freezeChance: 0.40, freezeDuration: 3000, mpCost: 15 }
                 ]},
      // 暗影鼠 —— 快速近战
      goblin:  { name: '暗影鼠', hp: 160, atk: 20, def: 14, spd: 27, atkInterval: 1200, isRanged: false,
                   atkRange: 50, moveSpeed: 85, skills: [
                     { name: '暗影咬', power: 1.4, type: 'attack', mpCost: 6 },
                     { name: '暗影突袭', power: 2.0, type: 'attack', mpCost: 18 }
                 ]},
      // 兽人 —— 肉盾近战
      orc:     { name: '兽人', hp: 360, atk: 22, def: 20, spd: 7, atkInterval: 1800, isRanged: false,
                   atkRange: 48, moveSpeed: 45 },
      // 恶狼 —— 快速近战群攻
      wolf:    { name: '恶狼', hp: 200, atk: 19, def: 8, spd: 14, atkInterval: 1000, isRanged: false,
                   atkRange: 55, moveSpeed: 95 },
      // 亡灵 —— 中速近战
      undead:  { name: '亡灵', hp: 300, atk: 18, def: 14, spd: 9, atkInterval: 1600, isRanged: false,
                   atkRange: 50, moveSpeed: 50 },
      // 恶魔 —— 慢但强力近战
      demon:   { name: '恶魔', hp: 560, atk: 28, def: 26, spd: 8, atkInterval: 2000, isRanged: false,
                   atkRange: 52, moveSpeed: 38 },
      // 幼龙 —— BOSS级（领主专用）
      dragon:  { name: '幼龙', hp: 900, atk: 35, def: 36, spd: 4, atkInterval: 2500, isRanged: false,
                   atkRange: 60, moveSpeed: 28 }
    }
    return templates[type] || templates.slime
  }

  // 稀有度配置：属性倍率、名称前缀、颜色、经验倍率
  static _RARITY_CONFIG = {
    normal:   { scale: 1.0, label: '', color: '#ffffff', expMult: 1.0, namePrefix: '' },
    elite:    { scale: 2.0, label: '【精英】', color: '#ff8c00', expMult: 2.5, namePrefix: '精英' },
    lord:     { scale: 5.0, label: '【领主】', color: '#ff2222', expMult: 10.0, namePrefix: '领主' }
  }

  /** 获取装备的所有属性加成行（用于渲染）
   *  返回格式: [{ text: '...', color: '#xxx', size: N }, ...]
   *  新增属性只需在这里添加一行即可 */
  _getEquipStats(item) {
    const lines = []
    if (!item) return lines
    if (item.bonusHp)      lines.push({ text: `\u2764 HP +${item.bonusHp}`, color: '#5ae08a', size: 10 })
    if (item.bonusAtk)     lines.push({ text: `\u2694 ATK +${item.bonusAtk}`, color: '#f08050', size: 10 })
    if (item.bonusMatk)    lines.push({ text: `\u{1F52C} MATK +${item.bonusMatk}`, color: '#a78bfa', size: 10 })
    if (item.bonusDef)     lines.push({ text: `\u{1F6E1} DEF +${item.bonusDef}`, color: '#58b8e8', size: 10 })
    if (item.bonusSpd)     lines.push({ text: `\u26A1 SPD +${item.bonusSpd}`, color: '#e8d850', size: 10 })
    if (item.bonusCrit)    lines.push({ text: `\uD83D\uDCBAT ${Math.round(item.bonusCrit * 100)}%`, color: '#ff69b4', size: 10 })
    if (item.bonusLifesteal) lines.push({ text: `\u2764\uFE0F 吸血 ${Math.round(item.bonusLifesteal * 100)}%`, color: '#ff6b9d', size: 10 })
    if (item.bonusMpRegen) lines.push({ text: `\u{1F4C9} MP/s +${item.bonusMpRegen}`, color: '#74b9ff', size: 10 })
    if (item.bonusHpRegen) lines.push({ text: `\u2764\uFE0F HP/s +${item.bonusHpRegen}`, color: '#55efc4', size: 10 })
    if (item.bonusCdr)     lines.push({ text: `\u23F1\uFE0F CDR +${Math.round(item.bonusCdr * 100)}%`, color: '#a29bfe', size: 10 })
    return lines
  }

  /** 获取装备属性加成文本列表（用于浮动提示）
   *  返回格式: ['+100HP', '+50ATK', ...]
   *  新增属性只需在这里添加一行即可 */
  _getEquipBonusTexts(item) {
    if (!item) return []
    const texts = []
    if (item.bonusHp)      texts.push(`+${item.bonusHp}HP`)
    if (item.bonusAtk)     texts.push(`+${item.bonusAtk}ATK`)
    if (item.bonusMatk)    texts.push(`+${item.bonusMatk}MATK`)
    if (item.bonusDef)     texts.push(`+${item.bonusDef}DEF`)
    if (item.bonusSpd)     texts.push(`+${item.bonusSpd}SPD`)
    if (item.bonusCrit)    texts.push(`+${Math.round(item.bonusCrit * 100)}%爆`)
    if (item.bonusLifesteal) texts.push(`+${Math.round(item.bonusLifesteal * 100)}%吸`)
    if (item.bonusMpRegen) texts.push(`+${item.bonusMpRegen}MP/s`)
    if (item.bonusHpRegen) texts.push(`+${item.bonusHpRegen}HP/s`)
    if (item.bonusCdr)     texts.push(`+${Math.round(item.bonusCdr * 100)}%CDR`)
    return texts
  }

  _rollDropQuality(rarity) {
    const boost = this._dropRareBoost || 0
    // 精英/领主必定掉落更好品质
    const rarityBonus = rarity === 'lord' ? 0.4 : rarity === 'elite' ? 0.2 : 0
    const r = Math.random() * (1 - rarityBonus) + rarityBonus  // 右偏随机
    let cumulative = 0
    for (const [q, p] of Object.entries(QUALITY_DROP_CHANCE)) {
      cumulative += (q === 'legendary' || q === 'epic') ? p * (1 + boost * 0.5) : p
      if (r <= cumulative) return q
    }
    return 'common'
  }

  // ==================== 更新循环 ====================

  update(dt) {
    // Game主循环传入的dt单位是秒，内部逻辑需要毫秒
    const dtMs = dt * 1000

    if (this.phase !== 'battle') {
      if (this.phase === 'card_select') {
        this.cardPhase.animTimer += dtMs
      }
      return
    }
    this.battleTime += dtMs

    this._updateCharacters(dtMs)
    this._updateMonsters(dtMs)
    this._updateSpawner(dtMs)  // 波次刷怪系统
    this._updateBuffs(dtMs)    // BUFF衰减和到期清除
    const invBefore = this.inventory.length
    this._updateDroppedItems(dtMs)
    if (this.inventory.length !== invBefore) {
      console.log(`[⚠️] _updateDroppedItems 导致 inventory 从 ${invBefore} 变为 ${this.inventory.length}`)
    }
    this._updateProjectiles(dtMs)
    this._updateEffects(dtMs)
    this._updateParticles(dtMs)
    this._updateFloatingTexts(dtMs)

    // 虫洞更新（非过场期间）
    if (!this.transition.active) {
      this._updateWormhole(dtMs)
      this._checkWormholeInteraction()
    }

    // 过场动画更新（优先于其他逻辑）
    this._updateTransition(dtMs)

    this._updateCamera(dtMs)
    this._checkWinLose()
  }

  _updateCharacters(dt) {
    // 技能菜单计时
    if (this.skillMenu.visible) {
      const elapsed = Date.now() - this.skillMenu.openTimer
      if (elapsed > this.skillMenu.maxDuration) {
        this.skillMenu.visible = false
      }
    }

    for (let i = 0; i < this.party.length; i++) {
      const c = this.party[i]

      // 死亡倒计时
      if (c.isDead) {
        c.respawnTimer -= dt
        if (c.respawnTimer <= 0) {
          this._respawnChar(c)
        }
        continue
      }

      // 攻击计时
      c.attackTimer -= dt

      // 技能CD递减
      for (const sid in c.skillCDs) {
        if (c.skillCDs[sid] > 0) c.skillCDs[sid] -= dt
      }

      // MP回复（每秒回复 mpRegen 点MP）
      // dt是毫秒，限制最大dt为100ms防止游戏恢复时异常
      const safeDt = Math.min(dt, 100)
      if ((c.mpRegen || 0) > 0 && (c.currentMp || 0) < (c.maxMp || 30)) {
        const mpGain = (c.mpRegen || 0) * safeDt / 1000
        if (isFinite(mpGain)) {
          c.currentMp = Math.min(c.maxMp, (c.currentMp || 0) + mpGain)
        }
      }

      // HP回复（每秒回复 hpRegen 点HP）
      if ((c.hpRegen || 0) > 0 && (c.currentHp || 0) < (c.maxHp || 100) && !c.isDead) {
        const hpGain = (c.hpRegen || 0) * safeDt / 1000
        if (isFinite(hpGain)) {
          c.currentHp = Math.min(c.maxHp, (c.currentHp || 0) + hpGain)
        }
      }

      // 自动技能计时（仅在AI自动模式开启时生效）
      c.autoSkillTimer = (c.autoSkillTimer || 0) - dt
      if (c.autoSkillTimer <= 0 && !c.isDead && c.autoAttackEnabled) {
        c.autoSkillTimer = c.autoSkillInterval || 5000
        this._tryAutoCastSkill(c)
      }

      // 状态效果衰减
      c.hurtFlash = Math.max(0, c.hurtFlash - dt)
      c.hurtTimer = Math.max(0, c.hurtTimer - dt)
      c.levelUpFlash = Math.max(0, c.levelUpFlash - dt)

      // 攻击动画计时
      if (c.attackAnimTimer > 0) {
        c.attackAnimTimer -= dt
        if (c.attackAnimTimer <= 0) {
          c.animState = 'idle'
          c.animFrame = 0
          c.castSkillId = null
          c.isCasting = false // 施法动画结束，解锁（可释放下一个技能）
        }
      }

      // 动画帧更新
      this._updateCharAnim(c, dt)

      // 移动逻辑
      const isMoving = Math.abs(c.x - c.targetX) > 5 || Math.abs(c.y - c.targetY) > 5

      // ===== AI自动寻敌：开启时自动向最近的敌人移动 =====
      // 注意：法师(远程)需要持续追踪敌人位置实现风筝，不受isMoving限制
      // 近战角色只在静止时寻路（避免和手动移动冲突）
      // 坚守位置模式：不移动，只在原地攻击
      const canRunAI = c.autoAttackEnabled && !c.isCasting &&
        (c.role === 'mage' ? true : !isMoving) &&
        !this.battleTactics.holdPosition

      if (canRunAI) {
        const nearestEnemy = this._findNearestEnemy(c)
        if (nearestEnemy) {
          const eDx = nearestEnemy.obj.x - c.x
          const eDy = nearestEnemy.obj.y - c.y
          const eDist = Math.sqrt(eDx * eDx + eDy * eDy)
          const isMage = c.role === 'mage'

          if (isMage) {
            // ===== 法师风筝逻辑：力场推开，保持安全距离 =====
            // 核心原则：绝不贴身，始终与敌人保持在理想距离附近
            const safeDist    = c.atkRange * 0.82   // 安全距离下限（低于此值必须远离）
            const idealDist   = c.atkRange * 0.92   // 理想输出距离
            const approachDist = c.atkRange * 1.05   // 开始靠近的阈值

            const eDirX = eDx / Math.max(eDist, 1)
            const eDirY = eDy / Math.max(eDist, 1)

            if (eDist < safeDist) {
              // ===== 力场直接推开：每帧根据距离差施加排斥力 =====
              // 距离越近推力越大（类似弹簧），确保不会被贴住
              const repelStrength = (safeDist - eDist) * 2.5 + 80
              c.x -= eDirX * repelStrength * (dt / 1000)
              c.y -= eDirY * repelStrength * (dt / 1000)
              // 同步更新target避免移动系统拉回
              c.targetX = c.x - eDirX * 20
              c.targetY = c.y - eDirY * 20
            } else if (eDist > approachDist) {
              // 超出范围：向敌人方向靠近到理想距离
              const ratio = (eDist - idealDist) / Math.max(eDist, 1)
              c.targetX = c.x + eDx * ratio
              c.targetY = c.y + eDy * ratio
            } else {
              // 在[safeDist, approachDist]范围内：安心输出，不移动
              // 如果正在向错误方向移动（朝敌人走去），立刻停止
              const toTargetDx = c.targetX - c.x
              const toTargetDy = c.targetY - c.y
              const dotProduct = toTargetDx * eDirX + toTargetDy * eDirY
              if (dotProduct > 10) { // target在敌人方向 → 停止
                c.targetX = c.x
                c.targetY = c.y
              }
            }

            // 边界钳制（统一活动区域）
            ;[c.targetX, c.targetY] = this._clampTargetToArea(c.targetX, c.targetY)
            // 更新朝向（手动锁定时不覆盖）—— 始终面向敌人
            if (!c._facingLocked && Math.abs(eDx) > 3) {
              c.facingRight = eDx > 0
            }
          } else {
            // ===== 近战角色：走到敌人身边贴身 =====
            if (eDist > c.atkRange + 10) {
              // 目标点：朝敌人方向移动，停在攻击范围内
              const ratio = (eDist - c.atkRange + 15) / eDist
              c.targetX = c.x + eDx * ratio
              c.targetY = c.y + eDy * ratio
              // 边界钳制（统一活动区域）
              ;[c.targetX, c.targetY] = this._clampTargetToArea(c.targetX, c.targetY)
              // 更新朝向（手动锁定时不覆盖）
              if (!c._facingLocked && Math.abs(eDx) > 3) {
                c.facingRight = eDx > 0
              }
            }
          }
        }
      }

      if (isMoving && c.animState === 'idle') {
        c.animState = 'walk'
      } else if (!isMoving && c.animState === 'walk' && c.attackAnimTimer <= 0) {
        c.animState = 'idle'
        c.animFrame = 0
      }

      if (isMoving) {
        const dx = c.targetX - c.x
        const dy = c.targetY - c.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 1) {
          c.x += (dx / dist) * c.moveSpeed * (dt / 1000)
          c.y += (dy / dist) * c.moveSpeed * (dt / 1000)
          // 实际坐标钳制（防止溢出活动区域）
          this._clampToBattleArea(c)
          // 移动中根据方向更新朝向（手动锁定时不覆盖）
          if (!c._facingLocked && Math.abs(dx) > 3) {
            c.facingRight = dx > 0
          }
        }
      }

      // 自动攻击最近敌人（到达攻击范围后自动普攻，不需要AI模式）
      // 注意：移动中不覆盖朝向，避免"倒着走"（移动朝向优先于攻击朝向）
      if (!isMoving && c.attackAnimTimer <= 0 && c.castSkillId === null && c.attackTimer <= 0) {
        const target = this._findNearestEnemy(c)
        if (target) {
          // 根据敌人位置更新朝向（手动锁定时不覆盖，移动时不覆盖）
          const dx2 = target.obj.x - c.x
          if (!c._facingLocked && Math.abs(dx2) > 3) {
            c.facingRight = dx2 > 0
          }

          // 检查是否在攻击范围内
          const dy2 = target.obj.y - c.y
          const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          if (dist2 <= c.atkRange) {
            this._charAttack(c, target)
          }
        }
      }
    }

    // 角色间分离（防止重叠）——在所有角色移动后统一处理
    this._separateCharacters(dt)
  }

  /**
   * 角色间碰撞分离：当两个存活角色距离过近时互相推开
   */
  _separateCharacters(dt) {
    const aliveChars = this.party.filter(c => !c.isDead)
    if (aliveChars.length < 2) return
    const minDist = 120   // 最小间距（像素）——角色宽~100px，需留出间隙
    const pushSpeed = 800 // 推开速度 px/s

    // 多次迭代收敛
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < aliveChars.length; i++) {
        for (let j = i + 1; j < aliveChars.length; j++) {
          const a = aliveChars[i]
          const b = aliveChars[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < minDist && dist > 0.1) {
            const overlap = minDist - dist
            const nx = dx / dist
            const ny = dy / dist
            const pushAmt = Math.min(overlap * 0.6, pushSpeed * dt / 1000)

            // 推开实际位置
            a.x -= nx * pushAmt
            a.y -= ny * pushAmt
            b.x += nx * pushAmt
            b.y += ny * pushAmt

            // 边界钳制（统一活动区域）
            this._clampToBattleArea(a)
            this._clampToBattleArea(b)

            // 对已静止的角色同步修正 target，防止下一帧又被拉回去
            const aArrived = Math.abs(a.x - a.targetX) < 8 && Math.abs(a.y - a.targetY) < 8
            const bArrived = Math.abs(b.x - b.targetX) < 8 && Math.abs(b.y - b.targetY) < 8
            if (aArrived) { a.targetX = a.x; a.targetY = a.y }
            if (bArrived) { b.targetX = b.x; b.targetY = b.y }
          }
        }
      }
    }
  }

  /**
   * 更新角色动画帧
   */
  _updateCharAnim(c, dt) {
    const spriteKey = this._getHeroSpriteKey(c.id)
    const spriteData = HERO_SPRITES[spriteKey]
    if (!spriteData) return

    let state
    if (c.castSkillId && c.attackAnimTimer > 0) {
      state = 'cast_' + c.castSkillId
    } else {
      state = c.animState
    }

    // 状态缺失时逐级fallback
    let frames = spriteData[state]
    if (!frames || frames.length === 0) {
      frames = spriteData['cast_default'] || spriteData['attack'] || spriteData['walk'] || spriteData['idle']
    }
    if (!frames || frames.length === 0) return

    const rate = spriteData.frameRate[state] || spriteData.frameRate['walk'] || spriteData.frameRate['idle'] || 150
    c.animTimer += dt
    if (c.animTimer >= rate) {
      c.animTimer = 0
      c.animFrame = (c.animFrame + 1) % frames.length
    }
  }

  /**
   * 根据角色ID获取对应的精灵key
   */
  _getHeroSpriteKey(id) {
    if (id === 'zhenbao') return 'zhenbao'
    if (id === 'lixiaobao') return 'lixiaobao'
    return 'cat'  // lufei, tangguo 用猫精灵
  }

  /** 获取当前角色应该绘制的图片 */
  _getCharFrameImage(c) {
    const spriteKey = this._getHeroSpriteKey(c.id)
    const spriteData = HERO_SPRITES[spriteKey]
    if (!spriteData) return null

    // 优先级：cast > attack > walk > idle
    let state
    if (c.castSkillId && c.attackAnimTimer > 0) {
      state = 'cast_' + c.castSkillId
    } else {
      state = c.animState
    }

    let frames = spriteData[state]
    
    // 状态缺失时逐级fallback: cast → cast_default → attack → walk → idle → null
    if (!frames || frames.length === 0) {
      frames = spriteData['cast_default'] || spriteData['attack'] || spriteData['walk'] || spriteData['idle']
    }
    if (!frames || frames.length === 0) return null

    const key = frames[Math.min(c.animFrame, frames.length - 1)]
    return this.assets.get(key)
  }

  _findNearestEnemy(char) {
    const t = this.battleTactics
    const cx = char.x, cy = char.y

    // 根据策略筛选怪物
    const aliveMonsters = this.monsters.filter(m => !m.isDead)

    if (aliveMonsters.length === 0) {
      return null  // 无怪物可打
    }

    let target = null

    switch (t.targetPriority) {
      case 'lowestHp': {
        // 优先HP比例最低的（在攻击范围内优先，否则选全局最低血）
        let best = null, bestRatio = Infinity
        for (const m of aliveMonsters) {
          const ratio = m.currentHp / m.maxHp
          if (ratio < bestRatio) { bestRatio = ratio; best = m }
        }
        if (best) {
          const dx = best.x - cx, dy = best.y - cy
          target = { type: 'monster', obj: best, dist: Math.sqrt(dx * dx + dy * dy) }
        }
        break
      }
      case 'ranged': {
        // 优先攻击远程怪物(isRanged)，没有则退回到最近
        let rangedBest = null, rangedDist = Infinity
        for (const m of aliveMonsters) {
          const dx = m.x - cx, dy = m.y - cy, d = Math.sqrt(dx * dx + dy * dy)
          if (m.isRanged && d < rangedDist) { rangedDist = d; rangedBest = m }
        }
        if (rangedBest) {
          target = { type: 'monster', obj: rangedBest, dist: rangedDist }
        } else {
          // 没有远程怪 → 退回最近目标
          break // fall through to default
        }
        break
      }
      case 'nearest':
      default: {
        // 最近的目标（默认行为）
        let nearDist = Infinity, nearM = null
        for (const m of aliveMonsters) {
          const dx = m.x - cx, dy = m.y - cy, d = Math.sqrt(dx * dx + dy * dy)
          if (d < nearDist) { nearDist = d; nearM = m }
        }
        if (nearM) target = { type: 'monster', obj: nearM, dist: nearDist }
        break
      }
    }

    // 如果策略没找到目标 → 返回最近的
    if (!target) {
      let nearDist = Infinity, nearM = null
      for (const m of aliveMonsters) {
        const dx = m.x - cx, dy = m.y - cy, d = Math.sqrt(dx * dx + dy * dy)
        if (d < nearDist) { nearDist = d; nearM = m }
      }
      if (nearM) target = { type: 'monster', obj: nearM, dist: nearDist }
    }

    return target
  }

  _charAttack(char, target) {
    // 远程角色(法系)：普攻=施法姿势+投射物
    // 近战角色(warrior/fighter)：普攻=直接挥砍伤害（无投射物，必须贴身）
    const isRanged = char.role === 'mage'
    if (isRanged) {
      // 远程：施法姿势（cast_attack帧）—— 前摇稍长，体现"读条施法"
      char.animState = 'cast'
      char.castSkillId = 'attack'
      char.attackAnimTimer = 500
    } else {
      // 近战：攻击动作（attack帧或slash帧）
      char.animState = 'attack'
      char.castSkillId = null
      char.attackAnimTimer = 350
    }
    char.animFrame = 0
    char.animTimer = 0
    char.isAttacking = true

    if (!isRanged) {
      // ===== 纯近战：直接造成物理伤害（无需投射物） =====
      // 只有在攻击范围内才造成伤害（已在调用方检查过 dist <= atkRange）
      const dmg = this._calcDamage(this._getEffectiveAtk(char), target.obj.def, false)
      const critChance = char.critChance || 0
      const isCrit = Math.random() < critChance
      const finalDmg = Math.max(1, Math.floor(dmg * (isCrit ? 1.8 : (0.85 + Math.random() * 0.3))))
      this._applyDamage(target.obj, target.type, finalDmg)
      this._applyLifesteal(char, finalDmg)
      const projColor = isCrit ? '#ffff00' : '#ff6b6b'
      this._spawnHitEffect(target.obj.x, target.obj.y, finalDmg, projColor, isCrit)
      // 攻击间隔（根据职业：法师施法读条→攻速加成低；近战挥砍→攻速加成高）
      // 近战：基础800ms，SPD每点减18ms（快速连击感）
      // 法师：基础1400ms，SPD每点仅减8ms（施法需要吟唱/瞄准时间）
      const baseAtkInterval = isRanged ? 1400 : 800
      const spdCoeff = isRanged ? 8 : 18   // ★ 法师spd收益远低于近战 ★
      char.attackTimer = Math.max(baseAtkInterval - (char.spd || 10) * spdCoeff, isRanged ? 900 : 400)
      return
    }

    // ===== 远程：生成法术投射物 =====
    const dmg = this._calcDamage(this._getEffectiveMatk(char), target.obj.def, true)
    const critChance = char.critChance || 0
    const isCrit = Math.random() < critChance
    const finalDmg = Math.max(1, Math.floor(dmg * (isCrit ? 1.8 : (0.85 + Math.random() * 0.3))))
    const projColor = isCrit ? '#ffff00' : '#ff6b6b'
    this.projectiles.push({
      x: char.x, y: char.y,
      targetX: target.obj.x, targetY: target.obj.y,
      target: target.obj,
      targetType: target.type,
      dmg: finalDmg,
      speed: 420,
      color: projColor,
      size: isCrit ? 9 : 6,
      trail: [],
      isCrit,
      ownerRole: char.role || 'fighter',
      onHit: () => {
        this._applyDamage(target.obj, target.type, finalDmg)
        this._applyLifesteal(char, finalDmg)
        this._spawnHitEffect(target.obj.x, target.obj.y, finalDmg, projColor, isCrit)
        this._spawnCharHitEffect(target.obj, char, 'attack')
      }
    })
    // 远程攻击间隔：基础1400ms，SPD影响低（法师吟唱时间）
    const baseRangedInterval = 1400
    char.attackTimer = Math.max(baseRangedInterval - (char.spd || 10) * 8, 900)
  }

  /** 角色命中特效（hit帧）—— 仅元素技能触发 */
  _spawnCharHitEffect(targetObj, attacker, skillId) {
    if (!targetObj || !attacker || !skillId) return
    // 根据技能ID选择命中特效类型（普攻 + 元素技能）
    let hitType = null
    if (attacker.id === 'lixiaobao') {
      if (skillId === 'fireball') hitType = 'fireball'
      else if (skillId === 'ice_shard') hitType = 'ice'
      else if (skillId === 'meteor' || skillId === 'lightning') hitType = 'lightning'
      else if (skillId === 'attack') hitType = 'attack' // 普攻命中
      else if (!skillId) hitType = 'attack' // 兼容：无skillId时默认用attack
    }
    if (!hitType) return

    this.effects.push({
      type: 'char_hit',
      x: targetObj.x,
      y: targetObj.y,
      hitType,
      timer: 0,
      duration: 480,
    })
  }

  /**
   * 自动施法：尝试释放一个CD就绪的技能（按优先级）
   * 近战角色只有在攻击范围内有敌人时才施放
   */
  _tryAutoCastSkill(char) {
    if (!char.skills || char.isDead) return
    if (char.attackAnimTimer > 0 || char.castSkillId || char.isCasting) return

    // 近战角色：必须先确认攻击范围内有敌人才放技能
    if (char.role !== 'mage') {
      const nearTarget = this._findNearestEnemy(char)
      if (!nearTarget) return
      const dx = nearTarget.obj.x - char.x
      const dy = nearTarget.obj.y - char.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      // 范围外不放技能（让近战角色先走过去平A）
      if (dist > char.atkRange + 15) return
    }

    // 找一个CD已好、MP足够的技能（优先高优先级的）
    for (let i = 0; i < char.skills.length; i++) {
      const sk = char.skills[i]
      if (!sk.unlocked && sk.unlockLevel) continue
      if ((char.skillCDs[sk.id] || 0) > 0) continue // CD中
      if ((char.currentMp || 0) < (sk.mpCost || 0)) continue // MP不足

      this._castSkill(char, i)
      return
    }
  }

  /**
   * 施放技能 —— 支持穿透（pierceCount）
   * - 火球术: pierceCount=3，穿透3个敌人
   * - 冰晶术: pierceCount=5，穿透5个敌人
   * - 雷击术: pierceCount=10，穿透10个敌人
   */
  _castSkill(char, skillIdx) {
    const skills = char.skills
    if (!skills || skillIdx >= skills.length) return
    const skill = skills[skillIdx]

    // 正在施法中（上一个技能动画还没结束）—— 等待完成
    if (char.isCasting) return

    // 检查CD和MP
    if ((char.skillCDs[skill.id] || 0) > 0) return
    if ((char.currentMp || 0) < (skill.mpCost || 0)) return

    // 消耗MP
    char.currentMp -= (skill.mpCost || 0)

    // ===== 施法锁定：动画期间不能再放其他技能 =====
    char.isCasting = true

    // 设置施法动画状态
    char.animState = 'cast'
    char.animFrame = 0
    char.animTimer = 0

    // 根据角色和技能类型决定施法特效（每个技能独立动画帧！）
    if (char.id === 'lixiaobao') {
      if (skill.id === 'fireball') char.castSkillId = 'fireball'       // 火球施法(11帧)
      else if (skill.id === 'ice_shard') char.castSkillId = 'ice'       // 冰晶施法(8帧)
      else if (skill.id === 'lightning') char.castSkillId = 'lightning' // 雷电施法(15帧)
      else char.castSkillId = 'attack'
    } else if (char.id === 'zhenbao') {
      char.castSkillId = 'slash'
    } else {
      char.castSkillId = null
    }

    // ===== 动态计算施法动画总时长（根据实际帧数×帧率）=====
    const spriteKey = this._getHeroSpriteKey(char.id)
    const spriteData = HERO_SPRITES[spriteKey]
    let actualAnimDuration = 600 // 默认值
    if (spriteData && char.castSkillId) {
      const castState = 'cast_' + char.castSkillId
      const animFrames = spriteData[castState]
      const animRate = (spriteData.frameRate && spriteData.frameRate[castState]) || 100
      if (animFrames && animFrames.length > 0) {
        actualAnimDuration = animFrames.length * animRate
      }
    }
    char.attackAnimTimer = actualAnimDuration

    // 设置CD（应用cdr冷却缩减，上限40%）
    const baseCd = skill.cd || 5000
    const reducedCd = baseCd * (1 - Math.min(0.4, char.cdr || 0))
    char.skillCDs[skill.id] = reducedCd

    // ===== 近战角色（warrior/fighter） =====
    if (char.role !== 'mage') {
      // ===== BUFF类型技能：战吼/狂暴等 =====
      if (skill.type === 'buff') {
        const castDelay = Math.floor(char.attackAnimTimer * 0.7)
        setTimeout(() => {
          if (this.phase !== 'battle' || char.isDead) return
          this._applyBuffSkill(char, skill)
        }, castDelay)
        return
      }

      // ===== 伤害类型技能：普通攻击/斩击等 =====
      const baseTarget = this._findNearestEnemy(char)
      if (!baseTarget) return

      // 延迟造成近战物理技能伤害（施法动画最后一段生效，视觉同步：动作做完才出伤害）
      const castDelay = Math.floor(char.attackAnimTimer * 0.85)
      setTimeout(() => {
        if (this.phase !== 'battle' || char.isDead) return
        // 近战范围检查：只有攻击范围内的目标才受伤害
        const tgt = baseTarget.obj
        const dx = tgt.x - char.x
        const dy = tgt.y - char.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > (char.atkRange + 20)) return // 超出近战范围则无效

        // 物理技能使用物理攻击
        let baseDmg = this._getEffectiveAtk(char) * (skill.power || 1.0)
        const isMagicSkill = skill.type === 'magic'
        const finalDmg = Math.max(1, Math.floor(this._calcDamage(baseDmg, tgt.def, isMagicSkill) * (0.9 + Math.random() * 0.2)))
        this._applyDamage(tgt, 'monster', finalDmg)
        this._applyLifesteal(char, finalDmg)
        this._spawnSkillHitEffect(tgt.x, tgt.y, finalDmg, '#ff6b6b', skill.id)
      }, castDelay)
      return
    }

    // ===== 远程角色（mage）：法术技能 =====
    // 火球/冰晶：射线贯穿沿途敌人 | 雷击：攻击范围AOE
    const baseTarget = this._findNearestEnemy(char)
    if (!baseTarget) return

    // 法术技能使用法术攻击
    let baseDmg = this._getEffectiveMatk(char) * (skill.power || 1.0)
    const finalDmg = Math.max(1, Math.floor(this._calcDamage(baseDmg, baseTarget.obj.def, true) * (0.9 + Math.random() * 0.2)))

    // 延迟生效（施法动画最后一段才释放）
    const castDelay = Math.floor(char.attackAnimTimer * 0.85)
    setTimeout(() => {
      if (this.phase !== 'battle' || char.isDead) return

      const aliveMonsters = this.monsters.filter(m => !m.isDead)

      // ---- 雷击术：攻击范围内AoE无差别打击 ----
      if (skill.id === 'lightning') {
        const atkRange = char.atkRange || 480
        const hitTargets = aliveMonsters.filter(m => {
          const dx = m.x - char.x, dy = m.y - char.y
          return Math.sqrt(dx*dx + dy*dy) <= atkRange
        })

        for (const t of hitTargets) {
          this._applyDamage(t, 'monster', finalDmg)
          this._applyLifesteal(char, finalDmg)
          this._spawnSkillHitEffect(t.x, t.y, finalDmg, '#ffdd00', skill.id)
        }

        // AoE电圈特效（覆盖整个攻击范围）
        this.effects.push({
          type: 'aoe_lightning',
          x: char.x, y: char.y,
          radius: atkRange,
          timer: 0, duration: 400,
          targets: hitTargets.map(t => ({x: t.x, y: t.y})),
        })
        console.log(`[Tower] ⚡ 雷击AoE: 范围${atkRange}px, 命中${hitTargets.length}个`)
        return
      }

      // ---- 火球术：射线贯穿 + 密排帧动画（火焰喷射）----
      if (skill.id === 'fireball') {
        const pierceCount = skill.pierceCount || 99
        // 方向：朝向最近目标
        const dirX = baseTarget.obj.x - char.x
        const dirY = baseTarget.obj.y - char.y
        const dirLen = Math.sqrt(dirX*dirX + dirY*dirY) || 1
        const nx = dirX / dirLen
        const ny = dirY / dirLen

        // 射线长度限制在攻击范围内
        const atkRange = char.atkRange || 480
        const rayLen = atkRange + 50
        const endX = char.x + nx * rayLen
        const endY = char.y + ny * rayLen

        // 找出射线路径上的所有怪物（按距离排序）
        const rayHits = []
        for (const m of aliveMonsters) {
          const mx = m.x - char.x, my = m.y - char.y
          const projLen = mx * nx + my * ny
          if (projLen < 0) continue
          const perpDist = Math.abs(mx * (-ny) + my * nx)
          const hitRadius = (m.scale || 1) * 28 + 15
          if (perpDist <= hitRadius && projLen <= rayLen) {
            rayHits.push({ monster: m, dist: projLen, perpDist })
          }
        }
        rayHits.sort((a, b) => a.dist - b.dist)
        const hitList = rayHits.slice(0, pierceCount)

        // 技能颜色配置
        const scFb = { main: '#ff4400', trail: '#ffaa33', spark: '#ffdd44' }

        // 造成伤害 + 命中反馈（数字+粒子）
        for (const h of hitList) {
          this._applyDamage(h.monster, 'monster', finalDmg)
          this._applyLifesteal(char, finalDmg)
          this.effects.push({
            type: 'dmg_number',
            x: h.monster.x + (Math.random() - 0.5) * 20,
            y: h.monster.y - 40,
            value: finalDmg,
            color: scFb.main,
            scale: 1.5, life: 1.2, vy: -80
          })
          const burstCount = 4 + Math.floor(Math.random() * 3)
          for (let b = 0; b < burstCount; b++) {
            const angle = Math.random() * Math.PI * 2
            const spd = 40 + Math.random() * 80
            this.effects.push({
              type: 'particle',
              x: h.monster.x + (Math.random() - 0.5) * 30,
              y: h.monster.y + (Math.random() - 0.5) * 30,
              vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 30,
              size: 2 + Math.random() * 3, color: scFb.spark,
              timer: 0, duration: 300 + Math.random() * 300,
            })
          }
        }

        // 火焰喷射光束特效（密排帧动画）
        if (HIT_EFFECTS.fireball) {
          const he = HIT_EFFECTS.fireball
          this.effects.push({
            type: 'skill_beam', startX: char.x, startY: char.y,
            endX, endY, hitType: 'fireball', duration: 500,
            timer: 0, animFrame: 0, animTimer: 0,
          })
        }

        console.log(`[Tower] 火球术 射线(范围${atkRange}px): 贯穿 ${hitList.length} 个`)
        return
      }

      // ---- 冰晶术：DNF冰刃波动剑 —— 逐个大冰刃依次涌出 ----
      if (skill.id === 'ice_shard') {
        const atkRange = char.atkRange || 480
        // 计算攻击方向（朝向最近敌人）
        const dirX = baseTarget.obj.x - char.x
        const dirY = baseTarget.obj.y - char.y
        const dirLen = Math.sqrt(dirX*dirX + dirY*dirY) || 1
        const endX = char.x + (dirX / dirLen) * atkRange
        const endY = char.y + (dirY / dirLen) * atkRange

        if (HIT_EFFECTS.ice) {
          const iceHitData = HIT_EFFECTS.ice
          const frameRate = (iceHitData && iceHitData.frameRate) || 44
          const bladeAnimDur = 11 * frameRate  // 11帧动画时长
          const totalDur = bladeAnimDur * 8 + 1200  // 8刃生成 + 消散
          this.effects.push({
            type: 'ice_wave_sword',
            startX: char.x, startY: char.y,
            endX, endY,
            duration: totalDur,
            timer: 0,
            dmg: finalDmg,
            damageApplied: false,
            char,  // 保存施法角色用于生命偷取
          })
        }

        console.log(`[Tower] 冰晶术 波动剑: 范围${atkRange}px`)
        return
      }

      // ---- 其他法师技能：默认投射物 ----
      const skillColors = {
        fireball: { proj: '#ff6600', hit: '#ff4400' },
        ice_shard: { proj: '#00ccff', hit: '#00aaff' },
        lightning: { proj: '#ffee00', hit: '#ffdd00' },
        default: { proj: '#aa66ff', hit: '#8844ff' }
      }
      const colors = skillColors[skill.id] || skillColors.default
      const pierceCount = skill.pierceCount || 1
      aliveMonsters.sort((a, b) => {
        const da = (a.x-char.x)**2+(a.y-char.y)**2
        const db = (b.x-char.x)**2+(b.y-char.y)**2
        return da - db
      })
      const targets = aliveMonsters.slice(0, pierceCount)
      for (const t of targets) {
        this.projectiles.push({
          x: char.x, y: char.y,
          targetX: t.x, targetY: t.y, target: t,
          targetType: 'monster', dmg: finalDmg,
          speed: 500+Math.random()*100, color: colors.proj,
          size: 10, trail: [], isSkill: true, skillType: skill.id,
          onHit: () => {
            this._applyDamage(t, 'monster', finalDmg)
            this._applyLifesteal(char, finalDmg)
            this._spawnSkillHitEffect(t.x, t.y, finalDmg, colors.hit, skill.id)
          }
        })
      }
    }, castDelay)
  }

  // ========== BUFF技能系统 ==========

  /** 技能配置表：buff持续时间(ms)、倍率、颜色、图标 */
  static _BUFF_CONFIG = {
    war_cry:   { name: '战吼',  desc: '全体攻击+30%', duration: 8000, atkMult: 0.30, color: '#ff9500', icon: '📣', auraColor: '#ffa040' },
    berserk:   { name: '狂暴', desc: '自身攻击+50%', duration: 10000, atkMult: 0.50, color: '#ff3333', icon: '🔥', auraColor: '#ff4422' },
    gear_second: { name: '二档', desc: '速度攻击提升', duration: 8000, atkMult: 0.25, spdMult: 0.20, color: '#e74c3c', icon: '💨', auraColor: '#ff6b35' },
  }

  /**
   * 施放BUFF技能 —— 核心逻辑
   * 战吼(war_cry): 全体友军 +30% 攻击，持续8秒
   * 狂暴(berserk): 自身 +50% 攻击，持续10秒
   */
  _applyBuffSkill(char, skill) {
    const cfg = TowerBattle._BUFF_CONFIG[skill.id]
    if (!cfg) {
      console.warn(`[Tower] ⚠️ 未知buff技能: ${skill.id}`)
      return
    }

    // 确定目标：战吼→全体 / 狂暴→自身
    const targets = skill.id === 'war_cry'
      ? this.party.filter(c => !c.isDead)
      : [char]

    const buffData = {
      id: skill.id,
      name: cfg.name,
      icon: cfg.icon,
      color: cfg.color,
      auraColor: cfg.auraColor,
      startTime: Date.now(),
      duration: cfg.duration,
      atkMult: cfg.atkMult || 0,
      spdMult: cfg.spdMult || 0,
    }

    for (const t of targets) {
      // 初始化buff数组
      if (!t.buffs) t.buffs = []

      // 移除同类型旧buff（不可叠加，刷新）
      t.buffs = t.buffs.filter(b => b.id !== skill.id)
      t.buffs.push({ ...buffData })

      // 应用速度加成（即时生效）
      if (buffData.spdMult > 0) {
        t.spd = Math.floor(t._baseSpd * (1 + buffData.spdMult))
      }
    }

    // ===== 视觉特效 =====
    // 1. 浮动文字提示
    const targetText = skill.id === 'war_cry' ? `📣 ${cfg.name}! 全体+${Math.round(cfg.atkMult * 100)}%攻` : `🔥 ${cfg.name}! +${Math.round(cfg.atkMult * 100)}%攻`
    this._addFloatingText(char.x, char.y - 50, targetText, cfg.color, 2.0)

    // 2. 冲击波扩散效果（战吼更大）
    this.effects.push({
      type: 'buff_shockwave',
      x: char.x, y: char.y,
      color: cfg.auraColor,
      radius: skill.id === 'war_cry' ? 180 : 90,
      timer: 0, duration: 500,
      isAoe: skill.id === 'war_cry',
    })

    // 3. 为每个目标添加光环特效
    for (const t of targets) {
      this.effects.push({
        type: 'buff_aura',
        charId: t.id || t.name,
        x: t.x, y: t.y,
        color: cfg.auraColor,
        buffId: skill.id,
        timer: 0, duration: cfg.duration,
        life: cfg.duration / 1000, maxLife: cfg.duration / 1000,
      })
    }

    // 4. 屏幕震动（狂暴更强）
    this.camera.shakeX = skill.id === 'berserk' ? 5 : 3
    this.camera.shakeY = skill.id === 'berserk' ? 4 : 2

    console.log(`[Tower] 💪 ${char.name} 释放 ${cfg.name}! 目标数=${targets.length}, 持续=${cfg.duration / 1000}s`)
  }

  /** 获取角色有效物理攻击力（基础 + buff加成） */
  _getEffectiveAtk(char) {
    let baseAtk = char.atk || 0
    // 防止NaN
    if (!isFinite(baseAtk)) baseAtk = 1
    if (char.buffs && char.buffs.length > 0) {
      for (const b of char.buffs) {
        const mult = b.atkMult || 0
        baseAtk = Math.floor(baseAtk * (1 + mult))
      }
    }
    return isFinite(baseAtk) ? baseAtk : 1
  }

  /** 获取角色有效法术攻击力（基础 + buff加成） */
  _getEffectiveMatk(char) {
    let baseMatk = char.matk || 0
    // 防止NaN
    if (!isFinite(baseMatk)) baseMatk = 0
    if (char.buffs && char.buffs.length > 0) {
      for (const b of char.buffs) {
        const mult = b.matkMult || 0
        baseMatk = Math.floor(baseMatk * (1 + mult))
      }
    }
    return isFinite(baseMatk) ? baseMatk : 0
  }

  /** 每帧更新所有角色的buff状态（衰减、到期清除） */
  _updateBuffs(dtMs) {
    for (const c of this.party) {
      if (!c.buffs || c.buffs.length === 0) continue

      const now = Date.now()
      const expiredIds = []
      let needRestoreSpd = false

      for (const b of c.buffs) {
        const elapsed = now - b.startTime
        if (elapsed >= b.duration) {
          expiredIds.push(b.id)
          if (b.spdMult > 0) needRestoreSpd = true
        }
      }

      // 清除过期buff
      if (expiredIds.length > 0) {
        c.buffs = c.buffs.filter(b => !expiredIds.includes(b.id))
        // 恢复基础速度（移除所有速度buff后重新计算）
        if (needRestoreSpd && c._baseSpd) {
          let totalSpdMult = 0
          for (const b of c.buffs) totalSpdMult += b.spdMult
          c.spd = Math.floor(c._baseSpd * (1 + totalSpdMult))
        }
        if (expiredIds.length > 0) {
          const names = expiredIds.map(id => (TowerBattle._BUFF_CONFIG[id] || {}).name || id).join(', ')
          this._addFloatingText(c.x, c.y - 40, `⏱ ${names} 消散`, '#888888', 1.2)
          console.log(`[Tower] ⏱ ${c.name} 的 [${names}] 已消失`)
        }
      }

      // 同步buff光环位置到角色当前位置
      for (const b of c.buffs) {
        b.x = c.x; b.y = c.y
      }
    }
  }

  _calcDamage(atk, def, isMagic = false) {
    // 防止NaN输入导致伤害计算出错
    if (!isFinite(atk) || !isFinite(def)) {
      atk = isFinite(atk) ? atk : 1
      def = 0
    }
    if (isMagic) {
      // 法术伤害：受魔法防御影响，防御收益较低
      return Math.max(1, atk - def * 0.3)
    }
    // 物理伤害：受防御影响，防御收益正常
    return Math.max(1, atk - def * 0.5)
  }

  _applyDamage(target, type, dmg) {
    // 防止NaN伤害导致target.hp变成NaN
    if (!isFinite(dmg)) {
      dmg = 0
    }
    target.hp -= dmg
    // 确保hp不会变成NaN或Infinity
    if (!isFinite(target.hp)) {
      target.hp = target.maxHp || 1
    }
    target.hurtTimer = 200
    target.hurtFlash = 150
    target.shakeX = (Math.random() - 0.5) * 10
    target.shakeY = (Math.random() - 0.5) * 10
    this.stats.damageDealt += dmg

    if (target.hp <= 0) {
      if (type === 'monster') this._killMonster(target)
    }
  }

  /** 生命偷取处理（造成伤害时回复） */
  _applyLifesteal(char, dmg) {
    if (!char || char.isDead || !char.lifesteal || char.lifesteal <= 0) return
    if (!isFinite(dmg) || dmg <= 0) return
    const healAmount = Math.floor(dmg * char.lifesteal)
    if (!isFinite(healAmount) || healAmount <= 0) return
    const currentHp = char.currentHp || 0
    const maxHp = char.maxHp || 100
    if (!isFinite(currentHp) || !isFinite(maxHp)) {
      char.currentHp = maxHp
      return
    }
    char.currentHp = Math.min(maxHp, currentHp + healAmount)
    // 显示治疗飘字
    this.effects.push({
      type: 'dmg_number',
      x: char.x + (Math.random() - 0.5) * 20,
      y: char.y - 30,
      value: '+' + healAmount,
      color: '#44ff88',
      size: 14,
      duration: 800,
      vy: -40,
    })
  }

  _killMonster(monster) {
    monster.isDead = true
    monster.deathTimer = 450
    this.stats.kills++

    // 给附近角色分经验
    const aliveChars = this.party.filter(c => !c.isDead)
    const expPerChar = Math.floor(monster.expReward / Math.max(1, aliveChars.length))
    for (const c of aliveChars) {
      const bonus = c.expBonus || 0
      const expGain = Math.floor(expPerChar * (1 + bonus))
      c.totalExp = (c.totalExp || 0) + expGain
      this._checkLevelUp(c, expGain)
    }

    this._spawnDeathEffect(monster.x, monster.y, '#ff6b6b')
    this.camera.shakeX = 3
    this.camera.shakeY = 2

    // 掉落装备
    if (!monster.hasDropped) {
      monster.hasDropped = true
      const item = this._generateDrop(monster)
      console.log('[Tower] 掉落生成:', item ? `${item.name}(${item.quality}) @ (${Math.round(item.x)},${Math.round(item.y)})` : 'NULL')
      if (item) this.droppedItems.push(item)
    }

    // 延迟移除
    setTimeout(() => {
      const idx = this.monsters.indexOf(monster)
      if (idx >= 0) this.monsters.splice(idx, 1)
    }, 480)
  }

  /**
   * 检查并处理角色升级
   */
  _checkLevelUp(char, expGain) {
    while (true) {
      const nextExp = EXP_TABLE[char.level + 1]
      if (!nextExp) break
      if (char.totalExp >= nextExp) {
        char.level++
        // ===== 按职业差异化属性成长 =====
        // 法师：攻击高成长、防御低成长、速度极低成长（远程风筝型）
        // 战士：均衡成长（肉盾近战型）
        // 斗士：攻速双高（敏捷DPS型）
        // 治疗：辅助成长偏生存
        const role = char.role || 'fighter'
        const isMage = role === 'mage'
        const isWarrior = role === 'warrior'

        const hpUp = Math.floor(isMage ? (8 + char.level * 1.5) : (10 + char.level * 2))
        const mpUp = Math.floor((isMage ? 6 : 3) + char.level * (isMage ? 1.2 : 0.6))
        const atkUp = Math.floor(isMage ? (2.5 + char.level * 0.28) : (2 + char.level * 0.18))
        const defUp = Math.floor(isMage ? (0.5 + char.level * 0.08) : (1.2 + char.level * 0.22))
        const spdUp = isMage ? 0.05 : (role === 'fighter' ? 0.15 : 0.12)

        char.maxHp += hpUp
        char.currentHp = Math.min(char.currentHp + hpUp, char.maxHp)
        char.maxMp = (char.maxMp || 30) + mpUp
        char.currentMp = Math.min((char.currentMp || 0) + mpUp, char.maxMp)
        char.atk += atkUp
        char.def = (char.def || 5) + defUp
        char.spd += spdUp

        // 解锁技能检查
        this._checkSkillUnlock(char)

        // 升级视觉反馈
        char.levelUpFlash = 1.5
        this._addFloatingText(char.x, char.y - 40, `⬆ Lv.${char.level}!`, '#ffd700', 2.0)

        // 升级粒子
        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2
          this.particles.push({
            x: char.x, y: char.y,
            vx: Math.cos(angle) * 60,
            vy: Math.sin(angle) * 60,
            size: 4,
            color: '#ffd700',
            life: 1,
            decay: 1.5
          })
        }
      } else {
        break
      }
    }
  }

  /**
   * 检查技能解锁
   */
  _checkSkillUnlock(char) {
    const skills = char.skills
    if (!skills) return
    for (let i = 0; i < skills.length; i++) {
      const s = skills[i]
      if (s.unlockLevel && !s.unlocked && char.level >= s.unlockLevel) {
        s.unlocked = true
        this._addFloatingText(char.x, char.y - 65, `✨ ${s.name}已解锁!`, '#a335ee', 2.5)
      }
    }
  }

  _respawnChar(char) {
    char.isDead = false
    char.currentHp = Math.floor(char.maxHp * 0.5) // 以半血复活
    char.currentMp = Math.floor(char.maxMp * 0.5)
    char.respawnTimer = 0
    // 在活动区域内左侧随机重生
    const area = this._getBattleArea()
    char.x = area.left + 20 + Math.random() * (this.width * 0.15)
    char.y = area.top + Math.random() * (area.bottom - area.top) * 0.5
    // 确保在区域内
    this._clampToBattleArea(char)
    char.targetX = char.x
    char.targetY = char.y
    char.hurtFlash = 0
    char.animState = 'idle'
    char.animFrame = 0
    this._spawnRespawnEffect(char.x, char.y)
  }

  _generateDrop(monster) {
    const quality = monster.dropQuality || 'common'
    const tpl = getRandomEquipment(quality)
    if (!tpl) return null
    return {
      id: `drop_${Date.now()}`,
      templateId: tpl.id,
      quality,
      name: tpl.name,
      slot: tpl.type,
      bonusHp: tpl.stats?.maxHp || 0,
      bonusAtk: tpl.stats?.atk || 0,
      bonusMatk: tpl.stats?.matk || 0,
      bonusDef: tpl.stats?.def || 0,
      bonusSpd: tpl.stats?.spd || 0,
      bonusCrit: tpl.stats?.crit || 0,
      bonusLifesteal: tpl.stats?.lifesteal || 0,
      bonusMpRegen: tpl.stats?.mpRegen || 0,
      bonusHpRegen: tpl.stats?.hpRegen || 0,
      bonusCdr: tpl.stats?.cdr || 0,
      x: monster.x,
      y: monster.y,
      spawnTime: Date.now(),
      lifetime: DROP_LIFETIME,
      remaining: DROP_LIFETIME,
      collected: false,
      collectAnim: 0,
      // 品质光效参数
      glowIntensity: quality === 'legendary' ? 25 : quality === 'epic' ? 18 : quality === 'rare' ? 12 : 6,
      pulseSpeed: quality === 'legendary' ? 3 : quality === 'epic' ? 4 : quality === 'rare' ? 5 : 6
    }
  }

  // ========== 怪物AI ==========

  _updateMonsters(dt) {
    for (const m of this.monsters) {
      if (m.isDead) {
        m.deathTimer -= dt
        continue
      }

      // ===== 传送入场动画 =====
      if (m.isSpawning) {
        m.spawnTimer += dt
        const progress = Math.min(1, m.spawnTimer / m.spawnDuration)
        m.spawnAnim = this._easeOutBack(progress)  // 弹性出现效果
        if (progress >= 1) {
          m.isSpawning = false
          m.spawnAnim = 1
          // 入场完成后开始向分散目标移动
          m.targetX = m.spreadTargetX
          m.targetY = m.spreadTargetY
        }
        // 入场期间不执行AI（只更新动画计时器）
        this._updateMonsterAnim(m, dt)
        continue
      }

      m.hurtFlash = Math.max(0, m.hurtFlash - dt)
      m.hurtTimer = Math.max(0, m.hurtTimer - dt)
      if (m.attackAnimTimer > 0) {
      m.attackAnimTimer -= dt
      if (m.attackAnimTimer <= 0) {
        m.animState = 'idle'
        m.animFrame = 0
        m.isAttacking = false   // 攻击动画结束，重置攻击状态（否则远程怪物只能打一发）
      }
      }

      // ===== 冻结状态效果 =====
      if (m.frozenTimer > 0) {
        m.frozenTimer -= dt
        if (m.frozenTimer > 0) continue
      }

      // 更新怪物动画帧
      this._updateMonsterAnim(m, dt)

      // ===== 选择目标：攻击最近的角色 =====
      const target = this._findNearestChar(m)

      if (!target) continue  // 无目标（理论上不应该发生）

      const dx = target.x - m.x
      const dy = target.y - m.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 根据目标方向更新朝向
      if (Math.abs(dx) > 3) {
        m.facingRight = dx > 0
      }

      if (m.isRanged) {
        // ===== 远程怪物：保持距离 =====
        const minRange = m.atkRange * 0.6
        const maxRange = m.atkRange * 1.1

        if (dist < minRange) {
          m.x -= (dx / dist) * m.moveSpeed * (dt / 1000) * 0.6
          m.y -= (dy / dist) * m.moveSpeed * (dt / 1000) * 0.6
          if (m.animState !== 'walk') { m.animState = 'walk'; m.animFrame = 0 }
        } else if (dist > maxRange) {
          m.x += (dx / dist) * m.moveSpeed * (dt / 1000)
          m.y += (dy / dist) * m.moveSpeed * (dt / 1000)
          if (m.animState !== 'walk') { m.animState = 'walk'; m.animFrame = 0 }
        } else {
          if (m.animState !== 'attack') { m.animState = 'attack'; m.animFrame = 0 }
          m.atkTimer -= dt
          if (m.atkTimer <= 0 && !m.isAttacking) {
            this._monsterRangedAttack(m, target, false)
          }
        }
      } else {
        // ===== 近战怪物：贴身攻击 =====
        if (dist > m.atkRange) {
          m.x += (dx / dist) * m.moveSpeed * (dt / 1000)
          m.y += (dy / dist) * m.moveSpeed * (dt / 1000)
          if (m.animState !== 'walk') { m.animState = 'walk'; m.animFrame = 0 }
        } else {
          if (m.animState !== 'attack') { m.animState = 'attack'; m.animFrame = 0 }
          m.atkTimer -= dt
          if (m.atkTimer <= 0 && !m.isAttacking) {
            this._monsterMeleeAttack(m, target, false)
          }
        }
      }
      // end of movement/attack logic
      // 怪物边界钳制（防止移出活动区域）
      this._clampToBattleArea(m)
    }

    // 检查所有波次怪物是否都死完了 → 触发水晶可攻击
    this._checkAllWavesCleared()
  }

  _updateMonsterAnim(m, dt) {
    const spr = MONSTER_SPRITES[m.type] || MONSTER_SPRITES.slime
    const frames = spr[m.animState] || spr.idle
    if (!frames || frames.length === 0) return
    const rate = spr.frameRate[m.animState] || spr.frameRate.idle || 250
    m.animTimer += dt
    if (m.animTimer >= rate) {
      m.animTimer = 0
      m.animFrame = (m.animFrame + 1) % frames.length
    }
  }

  /** 获取怪物当前帧图片 */
  _getMonsterFrameImage(m) {
    const spr = MONSTER_SPRITES[m.type] || MONSTER_SPRITES.slime
    const frames = spr[m.animState] || spr.idle
    if (!frames || frames.length === 0) return null
    const key = frames[Math.min(m.animFrame, frames.length - 1)]
    return this.assets.get(key)
  }

  _findNearestChar(monster) {
    let nearest = null
    let nearestDist = Infinity
    for (const c of this.party) {
      if (c.isDead) continue
      const dx = c.x - monster.x
      const dy = c.y - monster.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = c
      }
    }
    return nearest
  }

  _monsterMeleeAttack(monster, target, isCrystal = false) {
    monster.isAttacking = true
    monster.attackAnimTimer = 280
    const finalDmg = Math.max(1, Math.floor(monster.atk * (0.85 + Math.random() * 0.3)))

    if (isCrystal) {
      // 攻击己方水晶
      this._homeCrystalTakeDamage(target, finalDmg)
    } else {
      // 攻击角色（有防御减免）
      const dmg = Math.max(1, monster.atk - (target.def || 0) * 0.5)
      const finalDmgChar = Math.floor(dmg * (0.85 + Math.random() * 0.3))
      this._charTakeDamage(target, finalDmgChar)
    }
    this._spawnHitEffect(target.x, target.y, finalDmg, '#ff4444')
    monster.atkTimer = monster.atkInterval
  }

  /**
   * 远程怪物攻击（史莱姆猫）：投射物 + 技能（可能触发冻结）
   */
  _monsterRangedAttack(monster, target, isCrystal = false) {
    monster.isAttacking = true
    monster.attackAnimTimer = 350

    // 决定是否释放技能（有概率使用技能而非普攻）
    const useSkill = monster.skills && monster.skills.length > 0 && Math.random() < 0.45
    let skill = null
    if (useSkill) {
      // 随机选一个技能（MP足够的话）
      const availableSkills = monster.skills.filter(s => !s.mpCost || Math.random() > 0.25)
      skill = availableSkills[Math.floor(Math.random() * availableSkills.length)]
    }

    // 基础伤害
    let baseDmg = Math.max(1, monster.atk)
    if (!isCrystal) {
      baseDmg = Math.max(1, monster.atk - (target.def || 0) * 0.3)  // 远程防御减成更低
    }
    if (skill) baseDmg = Math.floor(baseDmg * (skill.power || 1.2))
    const finalDmg = Math.floor(baseDmg * (0.85 + Math.random() * 0.3))

    // ===== 技能施法特效（在怪物位置显示）=====
    if (skill) {
      const effectColor = skill.effect === 'freeze' ? '#66ccff' : '#ff66aa'
      this._addFloatingText(monster.x, monster.y - 35, `✨ ${skill.name}!`, effectColor, 1.8)
      // 施法光圈特效
      this.effects.push({
        type: 'cast_ring',
        x: monster.x,
        y: monster.y - 15,
        radius: 5,
        maxRadius: 30 + (skill.power || 1) * 12,
        color: effectColor,
        life: 0.6,
        maxLife: 0.6,
      })
    }

    const projColor = skill ? (skill.effect === 'freeze' ? '#55ddff' : '#ff55aa') : '#44aaff'
    const projSize = skill ? 8 : 5

    // 生成投射物飞向目标（角色或己方水晶）
    this.projectiles.push({
      x: monster.x,
      y: monster.y - 10,
      targetX: target.x,
      targetY: target.y,
      target,
      targetType: isCrystal ? 'homeCrystal' : 'char',
      dmg: finalDmg,
      speed: 200 + Math.random() * 80,
      color: projColor,
      size: projSize,
      isSkill: !!skill,
      trail: [],
      skillName: skill?.name || null,
      skillEffect: skill?.effect || null,
      freezeChance: skill?.freezeChance || 0,
      freezeDuration: skill?.freezeDuration || 0,
      onHit: (proj) => {
        if (isCrystal || proj.targetType === 'homeCrystal') {
          this._homeCrystalTakeDamage(target, proj.dmg)
        } else {
          this._charTakeDamage(target, proj.dmg)
        }
        this._spawnHitEffect(target.x, target.y, proj.dmg, proj.color)

        // 命中时如果为技能，显示额外文字提示
        if (proj.skillName) {
          this._addFloatingText(target.x, target.y - 45, `-${proj.dmg} [${proj.skillName}]`, proj.color, 1.6)
        }

        // ===== 冻结效果判定 =====
        if (proj.skillEffect === 'freeze' && proj.freezeChance > 0) {
          if (Math.random() < proj.freezeChance) {
            this._addFloatingText(target.x, target.y - 30, '❄ 冰冻!', '#66ccff', 1.5)
            // 给目标添加frozenTimer状态
            if (!target.statusEffects) target.statusEffects = []
            target.statusEffects.push({ type: 'freeze', duration: proj.freezeDuration })
            target.frozenTimer = proj.freezeDuration
            // 冰冻光环特效
            this.effects.push({
              type: 'freeze_aura',
              x: target.x,
              y: target.y,
              life: proj.freezeDuration / 1000,
              maxLife: proj.freezeDuration / 1000,
            })
          }
        }
      }
    })

    monster.atkTimer = monster.atkInterval
  }

  _charTakeDamage(char, dmg) {
    char.currentHp -= dmg
    char.hurtTimer = 200
    char.hurtFlash = 150
    char.shakeX = (Math.random() - 0.5) * 8
    char.shakeY = (Math.random() - 0.5) * 8
    if (char.currentHp <= 0) this._charDie(char)
  }

  _charDie(char) {
    char.isDead = true
    const respawnSec = RESPAWN_TABLE[char.level] || char.level * 2
    const boost = this._respawnBoost || 0
    char.respawnTimer = respawnSec * 1000 * (1 - boost)
    char.currentHp = 0
    char.animState = 'dead'
    this._spawnDeathEffect(char.x, char.y, '#58a6ff')
    this.camera.shakeX = 5
    this.camera.shakeY = 4

    // 注意：不再因全员死亡自动失败，改为由己方水晶被摧毁触发失败
  }

  // ========== 虫洞传送系统 ==========

  _updateWormhole(dt) {
    const w = this.wormhole
    if (!w.active) return
    w.animTimer += dt / 1000
    w.pulseTimer += dt / 1000
    // 出现动画
    if (w.spawnAnim < 1) {
      w.spawnAnim = Math.min(1, w.spawnAnim + dt / 500)
    }
  }

  /**
   * 检测角色是否靠近虫洞 → 触发过场进入下一波
   */
  _checkWormholeInteraction() {
    const w = this.wormhole
    if (!w.active || this.transition.active || this.allWavesDone) return

    for (const c of this.party) {
      if (c.isDead) continue
      const dx = c.x - w.x
      const dy = c.y - w.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < w.interactRadius) {
        // 触发过场 → 进入下一波
        this._startWaveTransition()
        break
      }
    }
  }

  /**
   * 启动波次过场动画（黑屏过渡）
   */
  _startWaveTransition() {
    const t = this.transition
    t.active = true
    t.phase = 'fading_out'
    t.alpha = 0
    t.timer = 0

    console.log(`[Tower] 🌀 触发虫洞传送，开始过场动画...`)
  }

  /**
   * 更新过场动画状态机
   */
  _updateTransition(dt) {
    const t = this.transition
    if (!t.active) return

    t.timer += dt * 1000  // 转为毫秒

    switch (t.phase) {
      case 'fading_out':
        t.alpha = Math.min(1, t.alpha + dt * 4)
        if (t.alpha >= 1) {
          t.phase = 'holding'
          t.timer = 0
          // 全黑时执行波次切换
          this._executeWaveTransition()
        }
        break
      case 'holding':
        if (t.timer >= t.holdDuration) {
          t.phase = 'fading_in'
          t.timer = 0
        }
        break
      case 'fading_in':
        t.alpha = Math.max(0, t.alpha - dt * 3)
        if (t.alpha <= 0) {
          t.active = false
          t.phase = 'none'
          t.alpha = 0
        }
        break
    }
  }

  /**
   * 过场黑屏时执行的逻辑：启动下一波或触发最终BOSS战
   */
  _executeWaveTransition() {
    // 隐藏虫洞
    this.wormhole.active = false
    this.wormhole.spawnAnim = 0

    if (this.waveIndex >= this.totalWaves) {
      // 所有波次完成 → 最终胜利（击败最后一波BOSS）
      this._onAllWavesComplete()
    } else {
      // 启动下一波
      this._startNextWave()
      console.log(`[Tower] ✨ 过场完成，进入第${this.waveIndex}波`)
    }
  }

  /**
   * 渲染虫洞
   */
  _renderWormhole(ctx) {
    const w = this.wormhole
    if (!w.active) return

    ctx.save()
    ctx.translate(w.x, w.y)

    // 出现动画缩放
    const appearScale = 0.3 + w.spawnAnim * 0.7
    ctx.scale(appearScale, appearScale)

    const animT = w.animTimer
    const pulse = 0.85 + Math.sin(w.pulseTimer * 2.5) * 0.15

    // ===== 外圈：旋转暗紫色光晕 =====
    for (let ring = 3; ring >= 0; ring--) {
      const ringR = w.radius + ring * 18
      const rotOffset = animT * (0.8 - ring * 0.15) * (ring % 2 ? 1 : -1)
      ctx.save()
      ctx.rotate(rotOffset)

      ctx.strokeStyle = `rgba(120, 60, 200, ${0.12 * pulse * (1 - ring * 0.2)})`
      ctx.lineWidth = 2 + ring
      ctx.setLineDash([8 + ring * 4, 6 + ring * 3])
      ctx.beginPath()
      ctx.arc(0, 0, ringR, 0, Math.PI * 2)
      ctx.stroke()

      // 环上的粒子点
      const dotCount = 6 + ring * 2
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + rotOffset * 1.5
        const dx = Math.cos(angle) * ringR
        const dy = Math.sin(angle) * ringR
        ctx.fillStyle = `rgba(160, 100, 255, ${0.5 * pulse})`
        ctx.beginPath()
        ctx.arc(dx, dy, 2 + ring * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    }

    // ===== 核心：黑色漩涡 =====
    // 外层渐变（紫→深蓝→黑）
    for (let layer = 5; layer >= 0; layer--) {
      const lr = w.radius * (0.25 + layer * 0.14)
      const alpha = 0.9 - layer * 0.12
      const hue = 260 + layer * 8 + Math.sin(animT * 2 + layer) * 10
      ctx.fillStyle = `hsla(${hue}, 70%, ${10 + layer * 5}%, ${alpha})`
      ctx.beginPath()
      ctx.arc(0, 0, lr, 0, Math.PI * 2)
      ctx.fill()
    }

    // 中心纯黑（带旋转螺旋效果）
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(0, 0, w.radius * 0.22, 0, Math.PI * 2)
    ctx.fill()

    // 螺旋线条
    ctx.strokeStyle = 'rgba(140, 90, 220, 0.45)'
    ctx.lineWidth = 1.5
    for (let s = 0; s < 3; s++) {
      ctx.beginPath()
      const spiralOffset = (animT * 2.5 + s * 2.1)
      for (let a = 0; a < Math.PI * 4; a += 0.15) {
        const sr = 4 + a * (w.radius * 0.13)
        const sx = Math.cos(a + spiralOffset) * sr
        const sy = Math.sin(a + spiralOffset) * sr
        if (a === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      }
      ctx.stroke()
    }

    // ===== "靠近传送" 提示文字（上下浮动）=====
    const textFloat = Math.sin(animT * 2.5) * 6
    ctx.shadowBlur = 14
    ctx.shadowColor = '#a855f7'
    ctx.fillStyle = '#e0d0ff'
    ctx.font = `bold ${Math.max(11, 12 * this.dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🌀 靠近传送', 0, -w.radius - 20 + textFloat)
    ctx.fillText(`第 ${Math.min(this.waveIndex + 1, this.totalWaves)} 波`, 0, -w.radius - 38 + textFloat)
    ctx.shadowBlur = 0

    // 交互范围提示环（脉冲）
    const hintAlpha = 0.08 + Math.sin(w.pulseTimer * 3) * 0.05
    ctx.strokeStyle = `rgba(168, 85, 247, ${hintAlpha})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, 0, w.interactRadius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.restore()
  }

  /**
   * 渲染过场黑屏遮罩
   */
  _renderTransition(ctx) {
    const t = this.transition
    if (!t.active && t.alpha <= 0) return
    ctx.fillStyle = `rgba(0, 0, 0, ${t.alpha})`
    ctx.fillRect(0, 0, this.width, this.height)

    // 黑屏中央显示文字
    if (t.phase === 'holding' || t.alpha > 0.7) {
      ctx.fillStyle = '#a855f7'
      ctx.font = `bold ${Math.max(18, 22 * this.dpr)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = Math.min(1, t.alpha * 1.5)
      ctx.fillText('⚡ 传送中... ⚡', this.width / 2, this.height / 2)
      ctx.globalAlpha = 1
    }
  }

  // ========== 刷怪调度 ==========

  _updateSpawner(dt) {
    if (this.transition.active) return  // 过场期间不刷怪
    // 使用新的波次系统替代原来的随机刷怪
    this._checkWaveSpawn(dt)
  }

  // ========== 掉落物品 ==========

  _updateDroppedItems(dt) {
    const now = Date.now()
    for (const item of this.droppedItems) {
      if (item.collected) {
        item.collectAnim += dt / 350
        continue
      }
      const age = now - item.spawnTime
      item.remaining = Math.max(0, DROP_LIFETIME - age)
      const timeLeft = item.remaining / 1000
      if (timeLeft < 2.5) item.blink = Math.sin(age / 80 * Math.PI) > 0
    }
    this.droppedItems = this.droppedItems.filter(i => !(i.collected && i.collectAnim >= 1))

    // 过期消失
    const expired = this.droppedItems.filter(i => !i.collected && i.remaining <= 0)
    for (const item of expired) {
      for (let j = 0; j < 6; j++) {
        this.particles.push({
          x: item.x + (Math.random() - 0.5) * 20,
          y: item.y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30,
          size: 2 + Math.random() * 3,
          color: QUALITY_COLORS[item.quality],
          life: 1,
          decay: 2.5
        })
      }
    }
    this.droppedItems = this.droppedItems.filter(i => !(i.remaining <= 0 && !i.collected))
  }

  // ========== 投射物 ==========

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      // ★ 全局超时：防止投射物无限积累（目标死亡/移走后飞不出去）
      if (!p._bornTime) p._bornTime = Date.now()
      const aliveTime = Date.now() - p._bornTime
      if (aliveTime > 4000) { p.hit = true; continue }

      // ★ 冰晶术投射物：速度驱动 + 沿途碰撞（波动剑模式）
      if (p.isIceShard) {
        // 延迟出生
        if (Date.now() - p.bornTime < p.spawnDelay) continue

        // 位移
        const moveDist = p.speed * (dt / 1000)
        p.x += p.vx * (dt / 1000)
        p.y += p.vy * (dt / 1000)
        p.traveled += moveDist

        // 记录轨迹（用于渲染拖尾）
        if (!p.trail) p.trail = []
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 8) p.trail.shift()

        // 帧动画更新
        const iceData = HIT_EFFECTS.ice
        if (iceData && iceData.frames && iceData.frames.length) {
          p.animTimer = (p.animTimer || 0) + dt
          if (p.animTimer >= (iceData.frameRate || 44)) {
            p.animTimer = 0
            p.animFrame = (p.animFrame || 0) + 1
            if ((p.animFrame || 0) >= iceData.frames.length) p.animFrame = 0
          }
        }

        // ★ 沿途碰撞检测：每帧检查是否碰到怪物
        let hitAny = false
        for (const m of this.monsters.filter(m => !m.isDead)) {
          if (p.hitMonsters && p.hitMonsters.has(m)) continue
          const dx = m.x - p.x, dy = m.y - p.y
          const dist = Math.sqrt(dx*dx + dy*dy)
          const hitRadius = (m.scale || 1) * 28 + p.size * 0.5
          if (dist <= hitRadius) {
            // 碰到怪物！造成伤害
            this._applyDamage(m, 'monster', p.dmg)
            if (!p.hitMonsters) p.hitMonsters = new Set()
            p.hitMonsters.add(m)

            // 伤害飘字
            this.effects.push({
              type: 'dmg_number',
              x: m.x + (Math.random() - 0.5) * 16, y: m.y - 35,
              value: p.dmg, color: '#00aaff', scale: 1.3, life: 1.2, vy: -70,
            })
            // 冰晶命中粒子
            for (let b = 0; b < 5; b++) {
              const a = Math.random() * Math.PI * 2
              const spd = 30 + Math.random() * 60
              this.effects.push({ type: 'particle',
                x: m.x + (Math.random()-0.5)*24, y: m.y + (Math.random()-0.5)*24,
                vx: Math.cos(a)*spd, vy: Math.sin(a)*spd-20,
                size: 2+Math.random()*3, color: '#aaddff',
                timer: 0, duration: 250+Math.random()*200,
              })
            }
            hitAny = true
          }
        }

        // 到达最大距离 → 销毁
        if (p.traveled > p.maxDist) {
          p.hit = true
        }
      } else {
        // 默认投射物逻辑（目标导向）
        const dx = p.targetX - p.x
        const dy = p.targetY - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 18) {
          p.hit = true
          if (p.onHit) p.onHit(p)
        } else {
          p.x += (dx / dist) * p.speed * (dt / 1000)
          p.y += (dy / dist) * p.speed * (dt / 1000)
          p.trail.push({ x: p.x, y: p.y })
          if (p.trail.length > 10) p.trail.shift()
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.hit)
  }

  // ========== 特效系统 ==========

  _spawnHitEffect(x, y, dmg, color, isCrit) {
    // 伤害数字
    this.effects.push({
      type: 'dmg_number',
      x: x + (Math.random() - 0.5) * 24,
      y: y - 22,
      value: dmg,
      color: isCrit ? '#ffff00' : color,
      scale: isCrit ? 1.6 : 1,
      life: 1.2,
      vy: -70
    })

    // 击中粒子数量根据暴击调整
    const count = isCrit ? 12 : 6
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * (isCrit ? 120 : 80),
        vy: (Math.random() - 0.5) * (isCrit ? 120 : 80),
        size: 2 + Math.random() * (isCrit ? 4 : 3),
        color,
        life: 1,
        decay: 2 + Math.random()
      })
    }
  }

  // 冰刃波动剑：每帧检测每个冰刃与怪物的碰撞，碰到才造成伤害
  _updateIceWaveBladeCollision(e) {
    const dx = e.endX - e.startX, dy = e.endY - e.startY
    const beamLen = Math.sqrt(dx*dx + dy*dy) || 1
    const bladeNum = 8

    const hitD = HIT_EFFECTS.ice
    const frameRate = (hitD && hitD.frameRate) || 44
    const bladeAnimDur = 11 * frameRate  // 11帧动画总时长

    for (let b = 0; b < bladeNum; b++) {
      const birthTime = e._bladeBirths[b]
      if (e.timer < birthTime) continue  // 还没出生

      const bladeAge = e.timer - birthTime  // 这个刃存在了多久(ms)

      // 刃的固定位置（沿射线方向，从角色到目标）
      const distFromStart = b * (beamLen / (bladeNum - 1))
      const bx = e.startX + (dx / beamLen) * distFromStart
      const by = e.startY + (dy / beamLen) * distFromStart

      // 大小：近小远大（固定分布，不随时间变）
      const sizeRatio = Math.min(1, b / (bladeNum - 1))
      const targetSize = 55 + (110 - 55) * sizeRatio
      const hitRadius = targetSize * 0.5

      // 碰撞检测
      for (const m of this.monsters.filter(m => !m.isDead)) {
        const mdx = m.x - bx, mdy = m.y - by
        if (mdx*mdx + mdy*mdy < (hitRadius + (m.hitRadius || 40)) ** 2) {
          const key = `${b}_${m.id}`
          if (!e._bladeHits[key]) {
            e._bladeHits[key] = true
            this._applyDamage(m, 'monster', e.dmg)
            this._applyLifesteal(e.char, e.dmg)
            this._spawnSkillHitEffect(bx, by, e.dmg, '#00ddff', 'ice_shard')
          }
        }
      }
    }
  }

  _spawnSkillHitEffect(x, y, dmg, color, skillId) {
    this.effects.push({
      type: 'dmg_number',
      x, y: y - 26,
      value: dmg,
      color,
      scale: 1.4,
      life: 1.4,
      vy: -80
    })

    // 技能击中粒子更密集
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const speed = 40 + Math.random() * 80
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color,
        life: 1,
        decay: 1.5 + Math.random()
      })
    }

    // 如果有击中帧特效图片，也添加一个特效对象
    let hitFrames = null
    if (skillId === 'fireball') hitFrames = 'fireball_hit'
    else if (skillId === 'ice_shard') hitFrames = 'ice_hit'
    else if (skillId === 'lightning' || skillId === 'meteor') hitFrames = 'lightning_hit'

    if (hitFrames) {
      this.effects.push({
        type: 'skill_effect_frames',
        x, y,
        skillType: hitFrames,
        frame: 0,
        life: 1.0,  // 总播放时长
        frameRate: 50 // 帧率ms
      })
    }
  }

  _spawnDeathEffect(x, y, color) {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 30 + Math.random() * 80
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 5,
        color,
        life: 1,
        decay: 1 + Math.random()
      })
    }
  }

  _spawnRespawnEffect(x, y) {
    for (let i = 0; i < 25; i++) {
      const angle = (i / 25) * Math.PI * 2
      this.particles.push({
        x: x + Math.cos(angle) * 30,
        y: y + Math.sin(angle) * 30,
        vx: -Math.cos(angle) * 40,
        vy: -Math.sin(angle) * 40,
        size: 4,
        color: '#58a6ff',
        life: 1,
        decay: 1.5
      })
    }
  }

  _updateEffects(dt) {
    for (const e of this.effects) {
      if (e.type === 'dmg_number') {
        e.y += e.vy * (dt / 1000)
        e.life -= dt / 1000
      } else if (e.type === 'particle') {
        // 粒子：移动 + 衰减（防止内存泄漏卡死！）
        if (e.vx !== undefined) { e.x += e.vx * (dt / 1000); e.vy += 200 * (dt / 1000) }
        if (e.vy !== undefined) e.y += e.vy * (dt / 1000)
        if (!e._lifeSet) { e.life = (e.duration || 500) / 1000; e._lifeSet = true; }
        else e.life -= dt / 1000
      } else if (e.type === 'skill_effect_frames') {
        e.life -= dt / 1000
        e.frameTimer = (e.frameTimer || 0) + dt
        if (e.frameTimer >= e.frameRate) {
          e.frameTimer = 0
          e.frame++
        }
      } else if (e.type === 'char_hit') {
        // 命中特效帧更新
        e.timer = (e.timer || 0) + dt
        const hitData = HIT_EFFECTS[e.hitType]
        if (hitData && hitData.frames) {
          const totalFrames = hitData.frames.length
          e.frame = Math.min(Math.floor(e.timer / hitData.frameRate), totalFrames - 1)
          e.life = Math.max(0, e.duration - e.timer)
        }
      } else if (e.type === 'cast_ring' || e.type === 'freeze_aura') {
        // 时间衰减特效
        e.life -= dt / 1000
      } else if (e.type === 'skill_ray') {
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
      } else if (e.type === 'aoe_lightning') {
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
      } else if (e.type === 'skill_beam') {
        // 密排帧动画射线：时间驱动
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
        // 帧动画计时（渲染时只读取，不修改）
        const hitData = HIT_EFFECTS[e.hitType]
        if (hitData && hitData.frames && hitData.frames.length) {
          e.animTimer = (e.animTimer || 0) + dt
          if (e.animTimer >= (hitData.frameRate || 30)) {
            e.animTimer = 0
            e.animFrame = (e.animFrame || 0) + 1
            if ((e.animFrame || 0) >= hitData.frames.length) e.animFrame = 0
          }
        }
      } else if (e.type === 'ice_wave_sword') {
        // ★ 冰刃波动剑：逐刃生成 → 每刃播完11帧动画 → 下一刃 → 全部生成后逐个消失 ★
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
        // 初始化碰撞记录和每刃出生时间
        if (!e._bladeHits) e._bladeHits = {}
        if (!e._bladeBirths) {
          const hitD = HIT_EFFECTS.ice
          const frameRate = (hitD && hitD.frameRate) || 44
          const bladeAnimDur = 11 * frameRate  // 11帧动画总时长(ms)
          const bladeNum = 8
          e._bladeBirths = []
          for (let b = 0; b < bladeNum; b++) {
            e._bladeBirths[b] = b * bladeAnimDur  // 刃b在此时刻(ms)出生
          }
        }
        // 每帧：逐刃检测碰撞
        this._updateIceWaveBladeCollision(e)
      } else if (e.type === 'buff_shockwave') {
        // 冲击波扩散
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
      } else if (e.type === 'buff_aura') {
        // Buff光环：跟随时间衰减
        const elapsed = Date.now() - (e._startTime || 0)
        if (!e._startTime) { e._startTime = Date.now() }
        e.life = Math.max(0, e.maxLife - elapsed / 1000)
        e.timer += dt
      }
    }
    this.effects = this.effects.filter(e => e.life > 0)
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * (dt / 1000)
      p.y += p.vy * (dt / 1000)
      p.vx *= 0.94
      p.vy *= 0.94
      p.life -= p.decay * (dt / 1000)
    }
    this.particles = this.particles.filter(p => p.life > 0)
  }

  /** 浮动文字（升级提示等） */
  _addFloatingText(x, y, text, color, duration) {
    this.floatingTexts.push({ x, y, text, color, life: duration, vy: -40 })
  }

  _updateFloatingTexts(dt) {
    for (const ft of this.floatingTexts) {
      ft.y += ft.vy * (dt / 1000)
      ft.life -= dt / 1000
    }
    this.floatingTexts = this.floatingTexts.filter(ft => ft.life > 0)
  }

  _updateCamera(dt) {
    this.camera.shakeX *= 0.9
    this.camera.shakeY *= 0.9
  }

  // ========== 胜负检测 ==========

  /**
   * 触发胜利（击败最后一波BOSS后调用）
   */
  _triggerVictory() {
    if (this.phase !== 'battle') return
    this.stats.time = this.battleTime
    this.camera.shakeX = 12
    this.camera.shakeY = 12

    // 胜利粒子效果
    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2
      const speed = 100 + Math.random() * 220
      this.particles.push({
        x: this.width / 2, y: this.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 7,
        color: ['#ffd700', '#ff8c00', '#ffffff', '#a855f7'][Math.floor(Math.random() * 4)],
        life: 1,
        decay: 0.4 + Math.random() * 0.6
      })
    }

    this.scene.saveProgress(this.stage.id - 1)
    this.phase = 'victory'
    console.log('[Tower] 🎉 胜利！所有波次已通关！')
  }

  _checkWinLose() {
    // 失败条件：全员死亡且无人可复活
    if (this.phase === 'battle') {
      const allDead = this.party.every(c => c.isDead && c.respawnTimer > 0)
      // 更严格：全员isDead=true且没有复活计时器在跑（或复活时间极长）
      const trulyAllDead = this.party.every(c => c.isDead)
      if (trulyAllDead) {
        // 检查是否所有人都在等待复活且复活还没完成
        const anyoneRespawning = this.party.some(c => c.respawnTimer > 0 && c.respawnTimer < 999999)
        if (!anyoneRespawning || this.party.every(c => c.isDead)) {
          // 延迟失败，给一点缓冲
          setTimeout(() => {
            if (this.phase === 'battle' && this.party.every(c => c.isDead)) {
              this._triggerDefeat()
            }
          }, 1500)
        }
      }
    }
  }

  /**
   * 触发失败（全员阵亡）
   */
  _triggerDefeat() {
    if (this.phase !== 'battle') return
    this.stats.time = this.battleTime
    this.camera.shakeX = 18
    this.camera.shakeY = 18

    console.log('[Tower] ☠️ 全员阵亡！游戏失败！')
    this.phase = 'defeat'
  }

  getStats() {
    return { ...this.stats, time: this.battleTime / 1000 }
  }

  // ========== 输入/触控 ==========

  onTap(x, y) {
    // 卡牌选择阶段
    if (this.phase === 'card_select') {
      this._handleCardTap(x, y)
      return
    }
    // 胜利/失败阶段 → 检测返回按钮
    if (this.phase === 'victory' || this.phase === 'defeat') {
      if (this._backBtnBounds && x >= this._backBtnBounds.x && x <= this._backBtnBounds.x + this._backBtnBounds.w
          && y >= this._backBtnBounds.y && y <= this._backBtnBounds.y + this._backBtnBounds.h) {
        // 设标记，由 TowerScene.update() 统一切换到结算页
        this._backToResult = true
      }
      return
    }
    if (this.phase !== 'battle') return
    this.tapPos = { x, y }
    this.lastTapTime = Date.now()
    console.log(`[Tower] onTap(${Math.round(x)}, ${Math.round(y)}), droppedItems=${this.droppedItems.length}, inventory=${this.inventory.length}/${this.maxInventorySize}, equipPanel=${this.equipPanel.visible}`)

    // 1. 优先检查掉落物 → 收集到背包
    console.log(`[Tower] 进入掉落物检测: equipPanel=${this.equipPanel.visible}, items=${this.droppedItems.length}`)
    if (!this.equipPanel.visible) {
      console.log(`[Tower] equipPanel未显示，开始遍历 ${this.droppedItems.length} 个掉落物`)
      for (let idx = 0; idx < this.droppedItems.length; idx++) {
        const item = this.droppedItems[idx]
        console.log(`[Tower] [${idx}] ${item ? item.name : 'NULL'} collected=${item?.collected}`)
        if (!item || item.collected) continue
        const dx = x - item.x
        const dy = y - item.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        console.log(`[Tower] 掉落物: ${item.name} @ (${Math.round(item.x)},${Math.round(item.y)}) 距离=${Math.round(dist)}`)
        if (dist < 80) {
          // 收集到背包（满8格时提示）
          if (this.inventory.length < this.maxInventorySize) {
            // 复制装备数据到背包（不含collected标记）
            const invItem = {
              name: item.name, quality: item.quality, slot: item.slot,
              level: item.level || 1,
              bonusHp: item.bonusHp, bonusAtk: item.bonusAtk,
              bonusMatk: item.bonusMatk || 0,
              bonusDef: item.bonusDef, bonusSpd: item.bonusSpd,
              bonusCrit: item.bonusCrit, bonusLifesteal: item.bonusLifesteal,
              bonusMpRegen: item.bonusMpRegen, bonusHpRegen: item.bonusHpRegen,
              bonusCdr: item.bonusCdr,
            }
            this.inventory.push(invItem)
            console.log(`[Tower] ✅ 收集成功: ${item.name} → 背包(${this.inventory.length}/${this.maxInventorySize}), inventory=[${this.inventory.map(i=>i?.name).join(',')}]`)
            // 标记地面物品已收集
            item.collected = true
            item.collectAnim = 0
            this.stats.dropsCollected++
            this._addFloatingText(item.x, item.y - 30, `📦 ${item.name} → 背包`, '#4ade80')
          } else {
            this._addFloatingText(item.x, item.y - 30, '❌ 背包已满!', '#f87171')
          }
          this.skillMenu.visible = false
          return
        }
      }
      console.log(`[Tower] 掉落物遍历完成，未命中任何物品`)
    } else {
      // 装备面板打开时，点击面板外区域关闭面板
      console.log(`[Tower] equipPanel已打开，关闭面板`)
      this.equipPanel.visible = false
      return
    }

    // 2. 检查装备面板内的角色选择按钮
    if (this.skillMenu.visible && this.skillMenu.buttons) {
      for (const btn of this.skillMenu.buttons) {
        if (!btn) continue
        const dx = x - btn.x
        const dy = y - btn.y
        if (dx * dx + dy * dy < btn.r * btn.r) {
          // 释放该技能
          const char = this.party[btn.charIndex]
          if (!char.isDead && char.skills[btn.skillIdx]) {
            const sk = char.skills[btn.skillIdx]
            // 检查等级解锁
            if (sk.unlockLevel && char.level < sk.unlockLevel) {
              // 等级不足，不释放（显示反馈：菜单保持打开让玩家看到Lv标记）
              return
            }
            this._castSkill(char, btn.skillIdx)
          }
          this.skillMenu.visible = false
          return
        }
      }
    }

    // 2.5 检查是否点击了AI自动攻击切换按钮
    if (this.skillMenu.visible && this.skillMenu.aiButton) {
      const aiBtn = this.skillMenu.aiButton
      if (x >= aiBtn.x && x <= aiBtn.x + aiBtn.w && y >= aiBtn.y && y <= aiBtn.y + aiBtn.h) {
        const char = this.party[aiBtn.charIndex]
        if (char && !char.isDead) {
          char.autoAttackEnabled = !char.autoAttackEnabled // 切换AI状态
          // 不关闭菜单，让玩家看到状态变化
        }
        return
      }
    }

    // 2.6 装备面板内的角色选择
    if (this.equipPanel.visible) {
      for (let i = 0; i < this.party.length; i++) {
        const btn = this.equipPanel.charButtons?.[i]
        if (!btn) continue
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          this._equipToCharacter(this.equipPanel.item, i, true)
          return
        }
      }
      // 点击面板外区域关闭装备分配面板
      this.equipPanel.visible = false
      return
    }

    // 3. 优先检查底部UI（战斗策略按钮 / 装备栏 / 角色切换）
    const bp = this._bottomPanelBounds
    if (bp && y >= bp.y) {
      console.log(`[Tower] 点击被底部面板拦截: y=${Math.round(y)} >= panelY=${Math.round(bp.y)}`)
      this._handleUITap(x, y)
      return  // 底部面板区域拦截点击，不传递给场景角色
    }

    // 4. 检查是否点击了角色（选中/取消切换 + 朝向控制）
    for (let i = 0; i < this.party.length; i++) {
      const c = this.party[i]
      if (c.isDead) continue
      // 角色碰撞检测：覆盖完整渲染区域（200px高度 + 名字/血条区域 + 底部脚底余量）
      const hitW = 100
      const hitH = 240
      if (x >= c.x - hitW / 2 && x <= c.x + hitW / 2 && y >= c.y - hitH && y <= c.y + 25) {
        // ===== 朝向：点击左侧朝左，点击右侧朝右（加锁） =====
        if (Math.abs(x - c.x) > 5) {
          c.facingRight = x > c.x
        }
        c._facingLocked = true   // 锁定朝向，AI不再覆盖

        // ===== 选中/取消选中切换（不再弹出技能菜单） =====
        if (this.selectedCharIndex === i) {
          this.selectedCharIndex = -1  // 取消选中
        } else {
          this.selectedCharIndex = i    // 选中角色（用于地面点击移动）
        }
        return
      }
    }

    // 4. 点击地面：只移动当前选中的单个角色（近战冲前排、法师留后排）
    const selected = this.party[this.selectedCharIndex]
    if (selected && !selected.isDead) {
      ;[selected.targetX, selected.targetY] = this._clampTargetToArea(x, y)

      // 移动时解锁朝向锁（让移动/攻击逻辑接管朝向）
      selected._facingLocked = false
      // 根据移动方向更新朝向
      if (Math.abs(selected.targetX - selected.x) > 3) {
        selected.facingRight = selected.targetX > selected.x
      }
    }

    // 关闭技能菜单
    this.skillMenu.visible = false
  }

  onTapMove(x, y) {
    if (this.phase !== 'battle') return

    // 掉落物只做悬浮高亮，不做收集（收集统一由 onTap 处理）
    // 注意：不要在这里调用 _collectItem，否则会提前标记 collected 导致无法正常进背包
    this._hoveredDropItem = null
    for (const item of this.droppedItems) {
      if (item.collected) continue
      const dx = x - item.x
      const dy = y - item.y
      if (Math.sqrt(dx * dx + dy * dy) < 60) {
        this._hoveredDropItem = item
        break
      }
    }

    // 悬浮检测：背包槽位
    if (this._inventorySlots) {
      for (const slot of this._inventorySlots) {
        if (slot.item && x >= slot.x && x <= slot.x + slot.size && y >= slot.y && y <= slot.y + slot.size) {
          this._hoveredItem = { item: slot.item, x: slot.x + slot.size / 2, y: slot.y, source: 'inventory' }
          return
        }
      }
    }
    // 悬浮检测：角色装备槽位
    if (this._charEquipSlots) {
      for (const slot of this._charEquipSlots) {
        if (slot.item && x >= slot.x && x <= slot.x + slot.w && y >= slot.y && y <= slot.y + slot.h) {
          // 获取该槽位实际装备
          const c = this.party[slot.charIdx]
          const eqItem = c ? c.equippedItems[slot.slot] : null
          if (eqItem) {
            this._hoveredItem = { item: eqItem, x: slot.x + slot.w / 2, y: slot.y, source: 'equipped' }
            return
          }
        }
      }
    }
    // 未悬停任何装备
    this._hoveredItem = null
  }

  onTapEnd() {
    this.tapPos = null
  }

  /** 处理卡牌点击：点击即选中并确认 */
  _handleCardTap(x, y) {
    const cp = this.cardPhase
    if (cp.confirmed) return

    const W = this.width
    const H = this.height
    const dpr = this.dpr
    const cardW = Math.min(100 * dpr, W * 0.28)
    const cardH = Math.min(130 * dpr, H * 0.32)
    const gap = 12 * dpr
    const totalW = cp.cards.length * cardW + (cp.cards.length - 1) * gap
    const startX = (W - totalW) / 2
    const startY = (H - cardH) / 2 - 10 * dpr // 与渲染一致

    for (let i = 0; i < cp.cards.length; i++) {
      const cx = startX + i * (cardW + gap)
      const cy = startY
      if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
        cp.selectedIndex = i
        cp.confirmed = true
        this._applyCardEffect(cp.cards[i])
        // 短暂延迟后进入战斗
        setTimeout(() => {
          this.phase = 'battle'
          this._initPositions()
          // 启动波次系统（延迟1秒后开始第一波）
          this.waveCooldownTimer = 1000
        }, 350)
        return
      }
    }
  }

  /** 处理底部UI点击（战斗策略按钮 / 装备栏 / 角色卡片） */
  _handleUITap(x, y) {
    const bp = this._bottomPanelBounds
    if (!bp) return

    // ---- 最上栏：技能按钮 ----
    if (this._skillBarButtons) {
      for (const btn of this._skillBarButtons) {
        if (!btn.disabled && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          this._onSkillBarTap(btn)
          return
        }
      }
    }

    // ---- 策略按钮 ----
    if (this._tacticButtons) {
      for (const btn of this._tacticButtons) {
        if (!btn.disabled && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          this._onTacticButtonTap(btn.id)
          return
        }
      }
    }

    // ---- 下栏：装备背包槽位 ----
    if (this._inventorySlots) {
      for (const slot of this._inventorySlots) {
        if (x >= slot.x && x <= slot.x + slot.size && y >= slot.y && y <= slot.y + slot.size) {
          this._onInventorySlotTap(slot)
          return
        }
      }
    }

    // ---- 下栏：合成按钮 ----
    if (this._synthButton) {
      const sb = this._synthButton
      if (x >= sb.x && x <= sb.x + sb.w && y >= sb.y && y <= sb.y + sb.h) {
        this._synthesizeEquipment()
        return
      }
    }

    // ---- 下栏：出售按钮 ----
    if (this._sellButton) {
      const slb = this._sellButton
      if (x >= slb.x && x <= slb.x + slb.w && y >= slb.y && y <= slb.y + slb.h) {
        this._sellSelectedInventoryItem()
        return
      }
    }

    // ---- 下栏：角色装备槽位（点击卸下）----
    if (this._charEquipSlots) {
      for (const slot of this._charEquipSlots) {
        if (x >= slot.x && x <= slot.x + slot.w && y >= slot.y && y <= slot.y + slot.h) {
          this._onCharEquipSlotTap(slot)
          return
        }
      }
    }

    // ---- 下栏：角色切换按钮 ----
    if (this._charSwitchBtns) {
      for (const btn of this._charSwitchBtns) {
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          const next = this.selectedCharIndex + btn.dir
          if (next >= 0 && next < this.party.length) {
            this.selectedCharIndex = next
          }
          return
        }
      }
    }
  }

  // ========== 装备分配面板 ==========

  _openEquipPanel(item) {
    const W = this.width, H = this.height
    this.equipPanel = {
      visible: true,
      item: item,
      selectedCharIndex: -1,
      animTimer: 0,
      // 角色按钮位置（底部横向排列）
      charButtons: [],
    }
    const btnW = 80, btnH = 90, gap = 12
    const totalW = this.party.length * btnW + (this.party.length - 1) * gap
    let startX = (W - totalW) / 2
    for (let i = 0; i < this.party.length; i++) {
      this.equipPanel.charButtons.push({
        x: startX + i * (btnW + gap),
        y: H * 0.62,
        w: btnW,
        h: btnH,
        charIndex: i,
      })
    }
  }

  _equipToCharacter(item, charIndex, fromInventory = false) {
    if (!item) return
    const c = this.party[charIndex]
    if (!c || c.isDead) return

    // 从背包移除（如果是背包中的物品）
    if (fromInventory && this.equipPanel.invIndex !== undefined && this.equipPanel.invIndex >= 0) {
      this.inventory[this.equipPanel.invIndex] = null
      // 压缩空位
      this.inventory = this.inventory.filter(Boolean)
    } else if (!fromInventory) {
      // 地面掉落物
      item.collected = true
      item.collectAnim = 0
      this.stats.dropsCollected++
    }

    // 装备到对应槽位（替换旧装备，退还属性）
    const slot = item.slot || 'accessory'
    const oldItem = c.equippedItems[slot]
    if (oldItem) {
      // 退还旧装备属性
      if (oldItem.bonusHp) { c.maxHp -= oldItem.bonusHp; c.currentHp = Math.max(1, c.currentHp - oldItem.bonusHp) }
      if (oldItem.bonusAtk) c.atk -= oldItem.bonusAtk
      if (oldItem.bonusMatk) c.matk = Math.max(0, (c.matk || 0) - oldItem.bonusMatk)
      if (oldItem.bonusDef) c.def = Math.max(0, (c.def || 5) - oldItem.bonusDef)
      if (oldItem.bonusSpd) c.spd = Math.max(0, c.spd - oldItem.bonusSpd)
      if (oldItem.bonusCrit) c.critChance = Math.max(0, (c.critChance || 0) - oldItem.bonusCrit)
      if (oldItem.bonusLifesteal) c.lifesteal = Math.max(0, (c.lifesteal || 0) - oldItem.bonusLifesteal)
      if (oldItem.bonusMpRegen) c.mpRegen = Math.max(0, (c.mpRegen || 0) - oldItem.bonusMpRegen)
      if (oldItem.bonusHpRegen) c.hpRegen = Math.max(0, (c.hpRegen || 0) - oldItem.bonusHpRegen)
      if (oldItem.bonusCdr) c.cdr = Math.max(0, (c.cdr || 0) - oldItem.bonusCdr)
      // 退回的旧装备放入背包
      if (this.inventory.length < this.maxInventorySize) {
        this.inventory.push({ ...oldItem })
      }
    }

    // 装上新装备
    c.equippedItems[slot] = item

    // 应用新属性加成
    if (item.bonusHp) { c.maxHp += item.bonusHp; c.currentHp += item.bonusHp }
    if (item.bonusAtk) c.atk += item.bonusAtk
    if (item.bonusMatk) c.matk = (c.matk || 0) + item.bonusMatk
    if (item.bonusDef) c.def = (c.def || 5) + item.bonusDef
    if (item.bonusSpd) c.spd += item.bonusSpd
    if (item.bonusCrit) c.critChance = (c.critChance || 0) + item.bonusCrit
    if (item.bonusLifesteal) c.lifesteal = (c.lifesteal || 0) + item.bonusLifesteal
    if (item.bonusMpRegen) c.mpRegen = (c.mpRegen || 0) + item.bonusMpRegen
    if (item.bonusHpRegen) c.hpRegen = (c.hpRegen || 0) + item.bonusHpRegen
    if (item.bonusCdr) c.cdr = (c.cdr || 0) + item.bonusCdr
    // 重新计算移动速度
    c.moveSpeed = 120 + (c.spd || 10) * 5

    // 浮动提示
    const bonusTexts = this._getEquipBonusTexts(item)
    this._addFloatingText(c.x, c.y - 200, `${c.name} 穿上 ${item.name}\n${bonusTexts.join(' ')}`, '#ffd700', 2.0)

    // 收集粒子特效
    const color = QUALITY_COLORS[item.quality]
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2
      this.particles.push({
        x: c.x, y: c.y - 100,
        vx: Math.cos(angle) * 50, vy: Math.sin(angle) * 50 - 30,
        size: 3 + Math.random() * 3, color, life: 1, decay: 2.0
      })
    }

    this.equipPanel.visible = false
  }

  _renderEquipPanel(ctx) {
    const ep = this.equipPanel
    if (!ep.visible || !ep.item) return
    const W = this.width, H = this.height, dpr = this.dpr
    const item = ep.item

    // 半透明暗色遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, W, H)

    // 面板背景
    const panelW = Math.min(340 * dpr, W * 0.88)
    const panelH = H * 0.52
    const panelX = (W - panelW) / 2
    const panelY = H * 0.15

    ctx.fillStyle = 'rgba(18,22,28,0.96)'
    const r = 14
    ctx.beginPath()
    ctx.moveTo(panelX + r, panelY)
    ctx.lineTo(panelX + panelW - r, panelY)
    ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + r)
    ctx.lineTo(panelX + panelW, panelY + panelH - r)
    ctx.quadraticCurveTo(panelX + panelW, panelY + panelH, panelX + panelW - r, panelY + panelH)
    ctx.lineTo(panelX + r, panelY + panelH)
    ctx.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - r)
    ctx.lineTo(panelX, panelY + r)
    ctx.quadraticCurveTo(panelX, panelY, panelX + r, panelY)
    ctx.fill()

    // 边框（品质色）
    ctx.strokeStyle = QUALITY_COLORS[item.quality]
    ctx.lineWidth = 2
    ctx.stroke()

    // 标题：选择角色装备
    ctx.font = `bold ${Math.max(16, 17 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('🎒 选择角色装备', W / 2, panelY + 28)

    // ===== 装备信息展示区（左侧大图标）=====
    const iconCx = W / 2
    const iconCy = panelY + 95
    const iconR = 36 * dpr

    // 品质光环
    const pulse = Math.sin(Date.now() / 400) * 0.25 + 1
    ctx.shadowBlur = 20
    ctx.shadowColor = QUALITY_COLORS[item.quality]

    ctx.fillStyle = '#1a1f26'
    ctx.beginPath()
    ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = QUALITY_COLORS[item.quality]
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.shadowBlur = 0

    // 装备类型图标
    const slotIcon = { weapon: '\u2694', armor: '\u{1F6E1}', accessory: '\u{1F48E}' }
    ctx.fillStyle = QUALITY_COLORS[item.quality]
    ctx.font = `bold ${Math.max(32, 34 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(slotIcon[item.slot] || '?', iconCx, iconCy)

    // 装备名称 + 品质标签
    ctx.font = `bold ${Math.max(17, 18 * dpr)}px sans-serif`
    ctx.fillStyle = QUALITY_COLORS[item.quality]
    ctx.fillText(`${QUALITY_NAMES[item.quality]} ${item.name}`, iconCx, iconCy + iconR + 24)

    // 属性加成列表（复用_getEquipStats，提取text字段渲染）
    const statLines = this._getEquipStats(item)
    ctx.font = `${Math.max(13, 14 * dpr)}px sans-serif`
    ctx.fillStyle = '#c9d1d9'
    for (let i = 0; i < statLines.length; i++) {
      ctx.fillText(statLines[i].text, iconCx, iconCy + iconR + 50 + i * 24)
    }

    // ===== 分割线 =====
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(panelX + 20, panelY + panelH * 0.55)
    ctx.lineTo(panelX + panelW - 20, panelY + panelH * 0.55)
    ctx.stroke()

    // ===== 角色选择区域标题 =====
    ctx.font = `${Math.max(13, 14 * dpr)}px sans-serif`
    ctx.fillStyle = '#8b949e'
    ctx.fillText('点击角色头像装备', W / 2, panelY + panelH * 0.58)

    // ===== 角色头像按钮 =====
    for (const btn of ep.charButtons) {
      const ci = btn.charIndex
      const ch = this.party[ci]
      const bx = btn.x, by = btn.y, bw = btn.w, bh = btn.h

      // 按钮背景（死亡角色灰化）
      const isDead = ch.isDead
      ctx.fillStyle = isDead ? 'rgba(40,44,52,0.8)' : 'rgba(33,38,46,0.92)'
      ctx.beginPath()
      ctx.moveTo(bx + 8, by)
      ctx.lineTo(bx + bw - 8, by)
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 8)
      ctx.lineTo(bx + bw, by + bh - 8)
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 8, by + bh)
      ctx.lineTo(bx + 8, by + bh)
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 8)
      ctx.lineTo(bx, by + 8)
      ctx.quadraticCurveTo(bx, by, bx + 8, by)
      ctx.fill()

      ctx.strokeStyle = isDead ? '#3d444d' : QUALITY_COLORS[item.quality]
      ctx.lineWidth = 1.5
      ctx.stroke()

      // 角色名称
      ctx.font = `bold ${Math.max(11, 12 * dpr)}px sans-serif`
      ctx.fillStyle = isDead ? '#565e69' : '#e6edf3'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ch.name, bx + bw / 2, by + 18)

      // 等级和职业
      ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
      ctx.fillStyle = isDead ? '#484f58' : '#8b949e'
      ctx.fillText(`Lv${ch.level} ${ch.role === 'mage' ? '\uD83D\uDD2C' : '\u2694'}`, bx + bw / 2, by + 34)

      // 当前属性预览
      ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
      ctx.fillStyle = isDead ? '#484f58' : '#58a6ff'
      ctx.fillText(`ATK:${ch.atk}  DEF:${ch.def || 5}`, bx + bw / 2, by + 50)

      // 预览加成效果（绿色高亮）
      if (!isDead) {
        ctx.fillStyle = '#3fb950'
        const preview = []
        if (item.bonusAtk) preview.push(`+${item.bonusAtk}atk`)
        if (item.bonusMatk) preview.push(`+${item.bonusMatk}matk`)
        if (item.bonusDef) preview.push(`+${item.bonusDef}def`)
        if (item.bonusHp) preview.push(`+${item.bonusHp}hp`)
        if (preview.length > 0) {
          ctx.font = `bold ${Math.max(9, 10 * dpr)}px sans-serif`
          ctx.fillText(preview.join(' '), bx + bw / 2, by + 66)
        }
      } else {
        ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
        ctx.fillStyle = '#f85149'
        ctx.fillText('\u2717 已阵亡', bx + bw / 2, by + 66)
      }
    }

    // 关闭提示
    ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`
    ctx.fillStyle = '#565e69'
    ctx.textAlign = 'center'
    ctx.fillText('点击面板外关闭', W / 2, panelY + panelH - 16)
  }

  // ==================== 渲染 ====================

  render() {
    const ctx = this.ctx
    const W = this.width
    const H = this.height

    // ★ 关键：先重置Canvas状态为默认值，再执行clearRect！
    // 如果GCO不是source-over，clearRect可能无法正确清除像素（导致背景变色残留）
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    ctx.filter = 'none'
    // 现在安全地清空画布
    ctx.clearRect(0, 0, W, H)
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.filter = 'none'

    // 注意：不使用 ctx.scale(DPR, DPR)
    // 所有绘制直接使用设备像素坐标（canvas物理分辨率 = windowSize * DPR）

    if (this.phase === 'card_select') {
      this._renderCardSelect(ctx)
      return
    }

    // ===== 胜利/失败界面 =====
    if (this.phase === 'victory' || this.phase === 'defeat') {
      this._renderResultScreen(ctx)
      return
    }

    // ===== 背景：塔防战场 =====
    // 主背景色
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, W, H)

    // 地面区域——与底部面板实际高度保持一致
    const topBarH = Math.max(H * 0.095, 56)
    const bottomMargin = Math.max(8, 12 * this.dpr)
    const skillBarH   = Math.max(H * 0.055, 40)
    const tacticsBarH = Math.max(H * 0.06, 42)
    const equipBarH   = Math.max(H * 0.155, 120)
    const bottomBarH  = skillBarH + tacticsBarH + equipBarH + 8
    const groundY     = H - bottomBarH - bottomMargin - 10  // 地面线在底部栏上方

    // 战场地面（深色渐变）
    const groundGrad = ctx.createLinearGradient(0, topBarH + 30, 0, groundY)
    groundGrad.addColorStop(0, '#141c28')
    groundGrad.addColorStop(0.5, '#162236')
    groundGrad.addColorStop(1, '#1a2a42')
    ctx.fillStyle = groundGrad
    ctx.fillRect(0, topBarH + 30, W, groundY - topBarH - 30)

    // 底部地面区域（到地面线为止）
    ctx.fillStyle = '#1e3050'
    ctx.fillRect(0, groundY, W, H - groundY - bottomMargin)

    // 地面纹理线（网格感）——只画到地面区域，不覆盖底部面板
    ctx.strokeStyle = 'rgba(80,120,180,0.07)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 50) {
      ctx.beginPath(); ctx.moveTo(gx, topBarH + 30); ctx.lineTo(gx, groundY); ctx.stroke()
    }
    for (let gy = topBarH + 50; gy < groundY; gy += 50) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    }

    // ===== 边界墙（可视化的战场边缘）=====
    const wallThickness = 4
    const wallColor = 'rgba(100,160,220,0.35)'
    ctx.strokeStyle = wallColor
    ctx.lineWidth = wallThickness
    ctx.lineCap = 'round'

    // 左边界
    ctx.beginPath()
    ctx.moveTo(wallThickness / 2, topBarH + 25)
    ctx.lineTo(wallThickness / 2, groundY)
    ctx.stroke()

    // 右边界
    ctx.beginPath()
    ctx.moveTo(W - wallThickness / 2, topBarH + 25)
    ctx.lineTo(W - wallThickness / 2, groundY)
    ctx.stroke()

    // 上边界
    ctx.beginPath()
    ctx.moveTo(0, topBarH + 25)
    ctx.lineTo(W, topBarH + 25)
    ctx.stroke()

    // 边界发光效果（内发光）
    const glowColor = 'rgba(80,140,220,0.08)'
    ctx.strokeStyle = glowColor
    ctx.lineWidth = 12
    ctx.lineCap = 'square'
    ctx.beginPath()
    ctx.rect(wallThickness + 5, topBarH + 30, W - wallThickness * 2 - 10, groundY - topBarH - 35)
    ctx.stroke()
    ctx.lineCap = 'round'

    // 我方区域（左侧淡蓝色）
    ctx.fillStyle = 'rgba(88,166,255,0.04)'
    ctx.fillRect(0, 0, W * 0.45, groundY)

    // 敌方区域（右侧淡红色）
    ctx.fillStyle = 'rgba(255,80,80,0.04)'
    ctx.fillRect(W * 0.45, 0, W * 0.55, groundY)

    // 中线分隔
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(W * 0.45, 50)
    ctx.lineTo(W * 0.45, groundY)
    ctx.stroke()
    ctx.setLineDash([])

    // 虫洞区域标记（当虫洞激活时）
    if (this.wormhole.active) {
      const wh = this.wormhole
      ctx.fillStyle = `rgba(168,85,247,${0.04 + Math.sin(this.battleTime * 0.003) * 0.03})`
      ctx.beginPath()
      ctx.arc(wh.x, wh.y, wh.interactRadius, 0, Math.PI * 2)
      ctx.fill()
    }

    // 相机震动
    const camShakeX = (Math.random() - 0.5) * (this.camera.shakeX || 0) * 2
    const camShakeY = (Math.random() - 0.5) * (this.camera.shakeY || 0) * 2
    ctx.translate(camShakeX, camShakeY)

    // 渲染层级
    this._renderParticles(ctx)
    this._renderDroppedItems(ctx)
    this._renderWormhole(ctx)      // 虫洞（替代敌方水晶）
    this._renderMonsters(ctx)
    this._renderCharacters(ctx)
    this._renderProjectiles(ctx)
    this._renderSkillArcMenu(ctx) // 技能弧形菜单（在角色之上）
    this._renderEffects(ctx)
    this._renderFloatingTexts(ctx)

    // 过场动画（最上层黑屏）
    this._renderTransition(ctx)

    ctx.restore()

    // UI层（不受相机影响）
    this._renderEquipPanel(ctx)  // 装备分配面板（最上层）
    this._renderUI(ctx)
  }

  // ===== 卡牌选择界面渲染 =====

  _renderCardSelect(ctx) {
    const W = this.width
    const H = this.height
    const dpr = this.dpr
    const cp = this.cardPhase

    // 半透明遮罩背景
    ctx.fillStyle = 'rgba(13, 17, 23, 0.95)'
    ctx.fillRect(0, 0, W, H)

    // 标题
    ctx.fillStyle = '#ffd700'
    ctx.font = `bold ${22 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('✦ 选择一张祝福卡牌 ✦', W / 2, H * 0.12)

    ctx.fillStyle = '#8b949e'
    ctx.font = `${13 * dpr}px sans-serif`
    ctx.fillText('点击即可选择，效果持续整场战斗', W / 2, H * 0.12 + 30 * dpr)

    // 卡牌参数（紧凑版——手机适配）
    const cardW = Math.min(100 * dpr, W * 0.28)
    const cardH = Math.min(130 * dpr, H * 0.32)
    const gap = 12 * dpr
    const totalW = cp.cards.length * cardW + (cp.cards.length - 1) * gap
    const startX = (W - totalW) / 2
    const startY = (H - cardH) / 2 - 10 * dpr // 居中偏上
    const time = (cp.animTimer || 0) / 1000

    cp.cards.forEach((card, i) => {
      const cx = startX + i * (cardW + gap)
      const cy = startY
      const isSelected = cp.selectedIndex === i
      const isConfirmed = cp.confirmed && isSelected

      // 选中浮动效果
      const floatOffset = isSelected ? Math.sin(time * 3) * 4 : 0
      const selScale = isSelected ? 1.05 : 1

      ctx.save()
      ctx.translate(cx + cardW / 2, cy + cardH / 2 + floatOffset)
      ctx.scale(selScale, selScale)
      ctx.translate(-cardW / 2, -cardH / 2)

      // 已确认：卡片缩小淡出动画
      if (isConfirmed) {
        const confirmT = Math.min(1, ((Date.now() - cp._confirmTime) || 0) / 350)
        if (confirmT > 0.5) {
          ctx.globalAlpha = 1 - confirmT
          const s = 1 + confirmT * 0.15
          ctx.scale(s, s)
        }
      }

      // 卡牌背景
      const cardGrad = ctx.createLinearGradient(0, 0, 0, cardH)
      cardGrad.addColorStop(0, '#1c2128')
      cardGrad.addColorStop(1, '#21262d')
      ctx.fillStyle = cardGrad

      // 选中发光边框
      if (isSelected) {
        ctx.shadowBlur = 16 + Math.sin(time * 4) * 6
        ctx.shadowColor = card.color || '#ffd700'
      }
      this._roundRect(ctx, 0, 0, cardW, cardH, 10)
      ctx.fill()
      ctx.shadowBlur = 0

      // 边框
      ctx.strokeStyle = isSelected ? (card.color || '#ffd700') : '#30363d'
      ctx.lineWidth = isSelected ? 2.5 : 1.5
      this._roundRect(ctx, 0, 0, cardW, cardH, 10)
      ctx.stroke()

      // 图标（紧凑）
      ctx.font = `${28 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(card.icon, cardW / 2, cardH * 0.22)

      // 名称
      ctx.fillStyle = card.color || '#f0e6d3'
      ctx.font = `bold ${12 * dpr}px sans-serif`
      ctx.fillText(card.name, cardW / 2, cardH * 0.40)

      // 描述（紧凑，最多2行）
      ctx.fillStyle = '#8b949e'
      ctx.font = `${10 * dpr}px sans-serif`
      const maxDescW = cardW - 16
      const desc = card.desc
      let line = ''
      let lineY = cardH * 0.54
      let lineCount = 0
      for (const ch of desc) {
        const testLine = line + ch
        if (ctx.measureText(testLine).width > maxDescW && line.length > 0) {
          ctx.fillText(line, cardW / 2, lineY)
          line = ch
          lineY += 15 * dpr
          lineCount++
          if (lineCount >= 2) break
        } else {
          line = testLine
        }
      }
      if (lineCount < 2 && line) ctx.fillText(line, cardW / 2, lineY)

      // 稀有标记
      if (card.rare) {
        ctx.fillStyle = '#f39c12'
        ctx.font = `bold ${10 * dpr}px sans-serif`
        ctx.fillText('★ 稀有 ★', cardW / 2, cardH * 0.88)
      } else {
        // 普通卡底部提示
        if (!isConfirmed) {
          ctx.fillStyle = '#484f58'
          ctx.font = `${10 * dpr}px sans-serif`
          ctx.fillText('点击选择', cardW / 2, cardH * 0.88)
        }
      }

      // 已选中标记（覆盖）
      if (isConfirmed) {
        ctx.fillStyle = 'rgba(13, 17, 23, 0.7)'
        this._roundRect(ctx, 0, 0, cardW, cardH, 10)
        ctx.fill()
        ctx.fillStyle = '#3fb950'
        ctx.font = `bold ${14 * dpr}px sans-serif`
        ctx.fillText('✓ 已选', cardW / 2, cardH / 2)
      }

      ctx.restore()
    })

    // 底部提示
    if (!cp.confirmed) {
      ctx.fillStyle = '#484f58'
      ctx.font = `${12 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('点击任意一张卡牌开始战斗', W / 2, H - 24 * dpr)
    }
  }

  // ===== 掉落物渲染 =====

  _renderDroppedItems(ctx) {
    for (const item of this.droppedItems) {
      if (item.collected && item.collectAnim >= 1) continue

      ctx.save()
      ctx.translate(item.x, item.y)

      if (item.collected) {
        ctx.globalAlpha = 1 - item.collectAnim
        ctx.scale(1 - item.collectAnim * 0.5, 1 - item.collectAnim * 0.5)
      }

      // 闪烁
      if (item.blink && !item.collected) {
        ctx.globalAlpha = 0.25 + Math.sin(Date.now() / 50) * 0.5
      }

      const color = QUALITY_COLORS[item.quality]

      // 品质光环（加大）
      const pulse = Math.sin(Date.now() / (item.pulseSpeed * 100)) * 0.3 + 1
      const glowR = (26 + item.glowIntensity * pulse * 1.3)

      if (item.quality !== 'common') {
        const glowGrad = ctx.createRadialGradient(0, 0, 8, 0, 0, glowR)
        glowGrad.addColorStop(0, color + '40')
        glowGrad.addColorStop(1, color + '00')
        ctx.fillStyle = glowGrad
        ctx.beginPath()
        ctx.arc(0, 0, glowR, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.shadowBlur = item.glowIntensity * (item.quality === 'legendary' ? 1.8 : 1.2)
      ctx.shadowColor = color

      // 物品图标底座（加大到清晰可见）
      const baseR = 42   // 28→42，加大50%
      ctx.fillStyle = '#1c2128'
      ctx.beginPath()
      ctx.arc(0, 0, baseR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 3.5    // 边框加粗
      ctx.stroke()

      // 装备类型图标（大字体）
      const slotIcon = { weapon: '\u2694', armor: '\u{1F6E1}', accessory: '\u{1F48D}' }
      ctx.fillStyle = color
      ctx.font = 'bold 42px sans-serif'   // 28→42
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(slotIcon[item.slot] || '?', 0, 2)

      // 装备名称（加大字体）
      if (!item.collected) {
        ctx.font = 'bold 14px sans-serif'   // 10→14
        ctx.fillStyle = '#e6edf3'
        ctx.fillText(item.name, 0, baseR + 20)
      }

      // 时间条（加宽）
      if (!item.collected) {
        const ratio = item.remaining / DROP_LIFETIME
        const barColor = ratio > 0.5 ? color : ratio > 0.25 ? '#ff8c00' : '#ff4444'
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(-24, 28, 48, 5)    // 宽32→48，高4→5
        ctx.fillStyle = barColor
        ctx.fillRect(-24, 28, 48 * ratio, 5)
      }

      // 传说额外星光（加大+外移）
      if (item.quality === 'legendary' && !item.collected) {
        for (let s = 0; s < 3; s++) {
          const starAngle = Date.now() / 800 + s * (Math.PI * 2 / 3)
          const starR = 36 + Math.sin(Date.now() / 400 + s * 2) * 6   // 24→36
          const sx = Math.cos(starAngle) * starR
          const sy = Math.sin(starAngle) * starR
          ctx.fillStyle = '#ffd700'
          ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 200 + s) * 0.4
          ctx.beginPath()
          ctx.arc(sx, sy, 3.5, 0, Math.PI * 2)   // 星光点半径 2→3.5
          ctx.fill()
        }
        ctx.globalAlpha = item.collected ? (1 - item.collectAnim) : 1
      }

      ctx.shadowBlur = 0
      ctx.restore()
    }
  }

  // ===== 水晶渲染已替换为虫洞系统（_renderWormhole）=====
  // @deprecated _renderCrystal / _renderHomeCrystal 已移除

  // ==================== UI层 ====================

  // ===== 怪物渲染（真实精灵）=====

  _renderMonsters(ctx) {
    for (const m of this.monsters) {
      if (m.isDead && m.deathTimer <= 0) continue

      ctx.save()
      ctx.translate(m.x + (m.shakeX || 0), m.y + (m.shakeY || 0))

      // ===== ★ 传送入场特效 =====
      if (m.isSpawning) {
        const p = m.spawnAnim  // 0→1
        const scale = p
        ctx.scale(scale, scale)
        ctx.globalAlpha = Math.min(1, p * 2)  // 前50%淡入

        // 底部传送圆环（类似虫洞效果）
        const ringR = 25 * (1 - p * 0.6)
        ctx.strokeStyle = `rgba(168,85,247,${Math.max(0, (1 - p)) * 0.7})`
        ctx.lineWidth = Math.max(0.5, 3 * (1 - p))
        for (let r = 0; r < 3; r++) {
          const rr = Math.max(1, ringR + r * 8)
          if ((1 - p) < 0.05) continue  // 接近完成时跳过圆环
          ctx.globalAlpha = Math.max(0, (1 - p) * (0.5 - r * 0.15))
          ctx.beginPath(); ctx.arc(0, 10 + rr * 0.3, rr, 0, Math.PI * 2); ctx.stroke()
        }
        // 粒子向上飞散（传送粒子）
        if ((1 - p) > 0.02) {  // 只在动画前期绘制粒子
          for (let i = 0; i < 4; i++) {
            const a = (Date.now() / 200 + i * Math.PI / 2) % (Math.PI * 2)
            const dist = 20 + (1 - p) * 30
            const px = Math.cos(a) * dist * (1 - p)
            const py = -15 - (1 - p) * 40 + Math.sin(a) * dist * 0.3
            ctx.fillStyle = `rgba(180,120,255,${(1 - p) * 0.8})`
            const particleR = Math.max(0.5, 2.5 * (1 - p))
            ctx.beginPath(); ctx.arc(px, py, particleR, 0, Math.PI * 2); ctx.fill()
          }
        }
        // 恢复正常透明度绘制怪物本体
        ctx.globalAlpha = Math.min(1, p * 2)
      }

      // 朝向翻转（精灵图默认朝左，朝右时需水平翻转）
      if (m.facingRight) {
        ctx.scale(-1, 1)
      }

      if (m.isDead) {
        ctx.globalAlpha = m.deathTimer / 450
        ctx.scale(1 - (1 - m.deathTimer / 450) * 0.5, 1 - (1 - m.deathTimer / 450) * 0.5)
      }

      // 受伤闪白
      if (m.hurtFlash > 0) {
        ctx.shadowBlur = 20
        ctx.shadowColor = '#ffffff'
      }

      // 获取怪物精灵图片
      const img = this._getMonsterFrameImage(m)
      const spr = MONSTER_SPRITES[m.type] || MONSTER_SPRITES.slime
      const baseScale = spr.scale || 1
      // 怪物尺寸：根据类型缩放，手机上至少80px高，移除0.9缩小系数
      let drawH = 80
      if (img) {
        const rawH = img.height
        drawH = Math.max(80, rawH * baseScale)
        const drawW = img.width * (drawH / rawH)

        // 颜色染色（用于区分不同怪物类型但共用同一套精灵）
        if (spr.tint && !m.isDead) {
          ctx.globalCompositeOperation = 'multiply'
          ctx.fillStyle = spr.tint
          ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH)
          ctx.globalCompositeOperation = 'destination-over'
        }

        ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH)

        // 怪物攻击挥砍特效
        if (m.attackAnimTimer > 0) {
          const slashP = m.attackAnimTimer / 280
          ctx.strokeStyle = 'rgba(255,80,80,' + (slashP * 0.6).toFixed(2) + ')'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(-drawW * 0.2, -drawH * 0.3, 15 + (1 - slashP) * 12,
                   Math.PI * 0.3 + (1 - slashP) * Math.PI * 0.5,
                   Math.PI * 0.7 + (1 - slashP) * Math.PI * 0.5)
          ctx.stroke()
        }

        if (spr.tint) {
          ctx.globalCompositeOperation = 'source-over'
        }
      } else {
        // 回退：大号圆形怪物
        const bodyColor = {
          slime: '#7ec850', goblin: '#56a364', orc: '#8b5e3c',
          wolf: '#7a7a7a', undead: '#9b8fb4', demon: '#c0392b', dragon: '#e74c3c'
        }[m.type] || '#888'
        ctx.fillStyle = m.hurtFlash > 0 ? '#ffffff' : bodyColor
        ctx.beginPath()
        ctx.arc(0, -10, 36, 0, Math.PI * 2)
        ctx.fill()

        // 怪物名首字
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = 'bold 20px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(m.name.charAt(0), 0, 2)

        // 眼睛
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(-9, -6, 6, 0, Math.PI * 2)
        ctx.arc(9, -6, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.arc(-8, -6, 3, 0, Math.PI * 2)
        ctx.arc(10, -6, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      // ===== 恢复状态：消除scale翻转，再绘制UI文字（不受朝向影响）=====
      ctx.restore()

      // ===== 怪物UI层：血条、名称（不受翻转影响） =====
      ctx.save()
      ctx.translate(m.x + (m.shakeX || 0), m.y + (m.shakeY || 0))

      const rcfg = TowerBattle._RARITY_CONFIG[m.rarity] || TowerBattle._RARITY_CONFIG.normal

      // 血条（更宽更高，位于怪物头顶上方）
      const hpRatio = Math.max(0, m.hp / m.maxHp)
      const barW = 80 + (m.rarity === 'lord' ? 30 : m.rarity === 'elite' ? 15 : 0)
      const barH = 16
      const barY = -drawH - 14  // 精灵头顶上方14px
      // 背景底（黑色+边框）
      ctx.fillStyle = 'rgba(0,0,0,0.85)'
      ctx.fillRect(-barW / 2, barY, barW, barH)
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 2
      ctx.strokeRect(-barW / 2, barY, barW, barH)
      // HP色条（纯红色）
      if (hpRatio > 0) {
        ctx.fillStyle = '#ff4444'
        ctx.fillRect(-barW / 2 + 2, barY + 2, (barW - 4) * hpRatio, barH - 4)
        // 高光
        ctx.fillStyle = 'rgba(255,100,100,0.4)'
        ctx.fillRect(-barW / 2 + 2, barY + 2, (barW - 4) * hpRatio, 4)
      }

      // 稀有度标签 + 名称 + 等级（位于血条上方）
      if (!m.isDead) {
        ctx.shadowBlur = 0
        let nameText = m.name
        if (rcfg.label) {
          nameText = `${rcfg.label} ${m.name}`
        }
        nameText += ` Lv${m.level}`

        const fontSize = Math.max(16, Math.round(14 * this.dpr))
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const nameLabelY = barY - barH - 6  // 血条上方6px处
        // 半透明黑色底框
        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        const textW = ctx.measureText(nameText).width + 12
        const boxX = -textW / 2
        const boxY = nameLabelY - fontSize / 2 - 3
        const r = 4
        ctx.beginPath()
        ctx.moveTo(boxX + r, boxY)
        ctx.lineTo(boxX + textW - r, boxY)
        ctx.quadraticCurveTo(boxX + textW, boxY, boxX + textW, boxY + r)
        ctx.lineTo(boxX + textW, boxY + fontSize + 6 - r)
        ctx.quadraticCurveTo(boxX + textW, boxY + fontSize + 6, boxX + textW - r, boxY + fontSize + 6)
        ctx.lineTo(boxX + r, boxY + fontSize + 6)
        ctx.quadraticCurveTo(boxX, boxY + fontSize + 6, boxX, boxY + fontSize + 6 - r)
        ctx.lineTo(boxX, boxY + r)
        ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY)
        ctx.fill()

        // 粗描边 + 稀有度颜色填充
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.strokeText(nameText, 0, nameLabelY)
        ctx.fillStyle = rcfg.color
        ctx.fillText(nameText, 0, nameLabelY)
      }

      ctx.restore()
    }
  }

  // ===== 角色渲染（真实精灵）=====

  _renderCharacters(ctx) {
    for (let i = 0; i < this.party.length; i++) {
      const c = this.party[i]
      if (c.isDead && c.respawnTimer <= 0) continue

      ctx.save()
      ctx.translate(c.x, c.y)

      // 朝向：精灵图默认朝左，朝右时需水平翻转
      if (c.facingRight) {
        ctx.scale(-1, 1)
      }

      if (c.isDead) {
        // 死亡倒计时
        ctx.globalAlpha = 0.55
        ctx.fillStyle = '#58a6ff'
        ctx.font = 'bold 15px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${(c.respawnTimer / 1000).toFixed(1)}s`, 0, 0)

        // 复活进度条
        const respawnTime = (RESPAWN_TABLE[c.level] || c.level * 2) * (1 - (this._respawnBoost || 0))
        const ratio = 1 - c.respawnTimer / (respawnTime * 1000)
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(-26, 12, 52, 6)
        ctx.fillStyle = '#58a6ff'
        ctx.fillRect(-26, 12, 52 * ratio, 6)

        ctx.restore()
        continue
      }

      // 攻击前摇位移（向前冲 + 轻微放大）
      if (c.attackAnimTimer > 0 && c.animState === 'attack') {
        const progress = c.attackAnimTimer / 350 // 1→0
        ctx.translate(16 * progress, -4 * Math.sin((1 - progress) * Math.PI))
        const scale = 1 + (1 - progress) * 0.15
        ctx.scale(scale, scale)
      } else if (c.castSkillId && c.attackAnimTimer > 0) {
        // 施法时轻微浮动+发光
        const progress = c.attackAnimTimer / 600
        ctx.translate(0, -6 * Math.sin(progress * Math.PI * 3))
        const scale = 1 + Math.sin(progress * Math.PI * 2) * 0.08
        ctx.scale(scale, scale)
      }

      // 受伤闪白
      if (c.hurtFlash > 0) {
        ctx.shadowBlur = 22
        ctx.shadowColor = '#ffffff'
      }

      // 升级金光
      if (c.levelUpFlash > 0) {
        ctx.shadowBlur = 15 + c.levelUpFlash * 20
        ctx.shadowColor = '#ffd700'
      }

      // 绘制角色精灵（受朝向翻转影响）
      const img = this._getCharFrameImage(c)
      if (img) {
        const drawH = 200 // 角色高度
        const drawW = img.width * (drawH / img.height)
        ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH)
        // 攻击时画武器挥砍弧线
        if (c.attackAnimTimer > 0 && c.animState === 'attack') {
          const slashProgress = c.attackAnimTimer / 350
          ctx.strokeStyle = 'rgba(255,220,150,' + (slashProgress * 0.7).toFixed(2) + ')'
          ctx.lineWidth = 3
          ctx.shadowBlur = 12
          ctx.shadowColor = '#ffd700'
          ctx.beginPath()
          ctx.arc(drawW * 0.3, -drawH * 0.3, 25 + (1 - slashProgress) * 18,
                   -Math.PI * 0.8 + (1 - slashProgress) * Math.PI * 0.6,
                   -Math.PI * 0.3 + (1 - slashProgress) * Math.PI * 0.6, false)
          ctx.stroke()
          ctx.shadowBlur = 0
        }
      } else {
        // 回退：大号角色块
        const roleColor = {
          warrior: '#3498db', mage: '#9b59b6',
          fighter: '#e74c3c', healer: '#2ecc71'
        }[c.role] || '#888'
        ctx.fillStyle = c.hurtFlash > 0 ? '#ffffff' : roleColor
        this._roundRect(ctx, -40, -170, 80, 170, 14)
        ctx.fill()
        // 角色名首字
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = 'bold 32px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(c.name.charAt(0), 0, -85)
      }

      // ===== 恢复状态：消除scale翻转，再绘制UI文字（不受朝向影响）=====
      ctx.restore()

      // ===== 攻击范围可视化圈（仅法师显示） =====
      if (c.role === 'mage' && !c.isDead) {
        ctx.save()
        ctx.translate(c.x, c.y)
        const rangePx = c.atkRange
        // 攻击范围外圈（半透明白色）
        ctx.beginPath()
        ctx.arc(0, 0, rangePx, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(100,180,255,0.5)'
        ctx.lineWidth = 2
        ctx.setLineDash([8, 6])
        ctx.stroke()
        ctx.setLineDash([])
        // 安全距离内圈
        ctx.beginPath()
        ctx.arc(0, 0, rangePx * 0.82, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,100,100,0.35)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])
        // 填充极淡色
        ctx.fillStyle = 'rgba(100,180,255,0.06)'
        ctx.fill()
        ctx.restore()
      }

      // ===== UI层（名字、等级、血条、选中框）—— 不受朝向翻转影响 =====
      ctx.save()
      ctx.translate(c.x, c.y)

      ctx.shadowBlur = 0

      // 名字+等级（大字号 + 粗描边 + 暗色底框）
      const nameColor = c.levelUpFlash > 0 ? '#ffd700' : '#ffffff'
      const fontSize = Math.max(18, Math.round(16 * this.dpr))
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const labelY = -232  // 最上方：名字标签
      const labelText = `${c.name} Lv${c.level}`

      // 半透明黑色底框
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      const textW = ctx.measureText(labelText).width + 16
      const boxX = -textW / 2
      const boxY = labelY - fontSize / 2 - 4
      const boxW = textW
      const boxH = fontSize + 8
      const r = 4
      ctx.beginPath()
      ctx.moveTo(boxX + r, boxY)
      ctx.lineTo(boxX + boxW - r, boxY)
      ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + r)
      ctx.lineTo(boxX + boxW, boxY + boxH - r)
      ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - r, boxY + boxH)
      ctx.lineTo(boxX + r, boxY + boxH)
      ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - r)
      ctx.lineTo(boxX, boxY + r)
      ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY)
      ctx.fill()

      // 粗描边 + 纯白填充
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 5
      ctx.lineJoin = 'round'
      ctx.strokeText(labelText, 0, labelY)
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 6
      ctx.fillStyle = nameColor
      ctx.fillText(labelText, 0, labelY)
      ctx.shadowBlur = 0

      // ===== BUFF图标栏（名字下方、血条上方）=====
      if (c.buffs && c.buffs.length > 0) {
        const iconSize = Math.max(16, 18 * this.dpr)
        const gap = 3
        const totalW = c.buffs.length * (iconSize + gap) - gap
        const startX = -totalW / 2
        const buffLabelY = labelY + 22

        for (let bi = 0; bi < c.buffs.length; bi++) {
          const b = c.buffs[bi]
          const bx = startX + bi * (iconSize + gap)
          const elapsed = Date.now() - b.startTime
          const remain = Math.max(0, b.duration - elapsed)
          const remainSec = (remain / 1000).toFixed(1)
          const ratio = remain / b.duration

          // 图标背景（圆角矩形 + 颜色）
          ctx.save()
          ctx.fillStyle = 'rgba(0,0,0,0.65)'
          this._roundRect(ctx, bx, buffLabelY, iconSize, iconSize + 8, 4)
          ctx.fill()
          ctx.strokeStyle = b.color
          ctx.lineWidth = 1.5
          ctx.globalAlpha = 0.6 + ratio * 0.4
          ctx.stroke()

          // Buff图标emoji
          ctx.font = `${Math.max(11, 12 * this.dpr)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#ffffff'
          ctx.fillText(b.icon, bx + iconSize / 2, buffLabelY + iconSize * 0.38)

          // 倒计时数字（图标下方，小字）
          const timerFont = Math.max(7, 8 * this.dpr)
          ctx.font = `bold ${timerFont}px sans-serif`
          // 最后3秒红色闪烁警告
          if (remain <= 3000) {
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 200)
            ctx.fillStyle = '#ff4444'
            ctx.shadowColor = '#ff0000'
            ctx.shadowBlur = 6
          } else {
            ctx.globalAlpha = 1
            ctx.fillStyle = b.color
          }
          ctx.fillText(`${remainSec}s`, bx + iconSize / 2, buffLabelY + iconSize + 2)
          ctx.restore()

          // 底部进度条（表示剩余时间）
          ctx.save()
          ctx.fillStyle = 'rgba(0,0,0,0.7)'
          this._roundRect(ctx, bx, buffLabelY + iconSize + 9, iconSize, 3, 2)
          ctx.fill()
          ctx.fillStyle = ratio > 0.15 ? b.color : '#ff4444'
          this._roundRect(ctx, bx, buffLabelY + iconSize + 9, Math.max(3, iconSize * ratio), 3, 2)
          ctx.fill()
          ctx.restore()
        }
      }

      // ===== 血条（角色头顶：精灵顶部上方，宽90px 高16px）=====
      const charHp = isFinite(c.currentHp) ? c.currentHp : 0
      const charMaxHp = isFinite(c.maxHp) ? c.maxHp : 100
      const hpRatio = Math.max(0, charHp / charMaxHp)
      const barW = 90
      const charDrawH = 200  // 角色精灵高度固定200px
      const hpBarY = -charDrawH - 14   // 精灵头顶上方14px
      // 背景底（黑色+边框）
      ctx.fillStyle = '#111111'
      ctx.fillRect(-barW / 2, hpBarY, barW, 16)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 2
      ctx.strokeRect(-barW / 2, hpBarY, barW, 16)
      // HP色条（纯红色，高度12px）
      if (hpRatio > 0) {
        ctx.fillStyle = '#ff4444'
        ctx.fillRect(-barW / 2 + 2, hpBarY + 2, (barW - 4) * hpRatio, 12)
        ctx.fillStyle = 'rgba(255,100,100,0.4)'
        ctx.fillRect(-barW / 2 + 2, hpBarY + 2, (barW - 4) * hpRatio, 4)
      }

      // ===== MP蓝条（血条下方：宽90px 高10px）=====
      const charMp = isFinite(c.currentMp) ? c.currentMp : 0
      const charMaxMp = isFinite(c.maxMp) ? c.maxMp : 30
      const mpRatio = Math.max(0, charMp / charMaxMp)
      const mpBarY = hpBarY + 16 + 4   // 血条下方（血条高度16 + 间距4）
      ctx.fillStyle = '#111111'
      ctx.fillRect(-barW / 2, mpBarY, barW, 10)
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(-barW / 2, mpBarY, barW, 10)
      if (mpRatio > 0) {
        ctx.fillStyle = '#3498db'
        ctx.fillRect(-barW / 2 + 2, mpBarY + 1, (barW - 4) * mpRatio, 8)
        ctx.fillStyle = 'rgba(100,180,255,0.4)'
        ctx.fillRect(-barW / 2 + 2, mpBarY + 1, (barW - 4) * mpRatio, 3)
      }

      // 选中指示器（包围角色整体）
      if (i === this.selectedCharIndex) {
        ctx.strokeStyle = '#ffd700'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        this._roundRect(ctx, -42, -240, 84, 268, 10)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.restore()
    }
  }

  // ===== 投射物渲染 =====

  _renderProjectiles(ctx) {
    for (const p of this.projectiles) {
      ctx.save()

      // ★ 冰晶术投射物：用ICE帧动画渲染（波动剑冰块）★
      if (p.isIceShard) {
        const iceData = HIT_EFFECTS.ice
        if (iceData && iceData.frames && iceData.frames.length) {
          const frameKey = iceData.frames[p.animFrame || 0]
          const frameImg = this.assets.get(frameKey)
          if (frameImg) {
            // 拖尾：半透明的冰块残影
            ctx.globalAlpha = 0.25
            for (let i = Math.max(0, p.trail.length - 5); i < p.trail.length; i++) {
              const t = i >= 0 ? p.trail[i] : null
              if (!t) continue
              const trailAlpha = (i - (p.trail.length - 5)) / 5 * 0.35
              ctx.globalAlpha = trailAlpha
              ctx.drawImage(frameImg, t.x - p.size*0.6/2, t.y - p.size*0.6/2,
                p.size * 0.6, p.size * 0.6)
            }

            // 主冰块本体
            ctx.globalAlpha = 1
            // 轻微发光效果
            ctx.shadowBlur = 12
            ctx.shadowColor = '#66ddff'
            ctx.drawImage(frameImg, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
            ctx.shadowBlur = 0
            ctx.restore()
            continue
          }
        }
        // fallback：无帧图时用圆形+颜色
      }

      // 默认投射物渲染（拖尾 + 圆形）
      for (let i = 0; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * 0.45
        const size = p.size * (i / p.trail.length) * 0.8
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.trail[i].x, p.trail[i].y, size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      ctx.shadowBlur = p.isSkill ? 14 : 10
      ctx.shadowColor = p.color
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.restore()
    }
  }

  // ===== 特效渲染 =====

  _renderEffects(ctx) {
    for (const e of this.effects) {
      if (e.type === 'dmg_number') {
        ctx.save()
        ctx.globalAlpha = Math.min(1, e.life)
        ctx.fillStyle = e.color
        const baseSize = e.isText ? 16 : (18 + Math.floor(e.life * 8))
        const fontSize = baseSize * this.dpr * (e.scale || 1)
        ctx.font = `${e.isText ? '' : 'bold '}${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        if (e.isText) {
          ctx.fillText(String(e.value), e.x, e.y)
        } else {
          ctx.fillText(`-${e.value}`, e.x, e.y)
        }
        ctx.restore()
      } else if (e.type === 'skill_effect_frames') {
        this._renderSkillEffectFrames(ctx, e)
      } else if (e.type === 'char_hit') {
        // 渲染命中特效帧（hit帧）
        const hitData = HIT_EFFECTS[e.hitType]
        if (hitData && hitData.frames && hitData.frames[e.frame]) {
          const key = hitData.frames[e.frame]
          const img = this.assets.get(key)
          if (img) {
            const size = 80 + Math.min(e.timer / 10, 20)
            // 离屏Canvas隔离（微信小游戏用wx.createCanvas）
            const s = Math.ceil(size) + 4
            if (!e._off) { e._off = (typeof wx !== 'undefined' && wx.createCanvas) ? wx.createCanvas() : null; e._offS = 0; }
            if (e._off && e._offS !== s) { e._off.width = s; e._off.height = s; e._offS = s; }
            const offCtx = e._off ? e._off.getContext('2d') : null
            if (offCtx) {
              offCtx.clearRect(0, 0, s, s)
              offCtx.globalAlpha = Math.max(0, 1 - (e.timer / e.duration) * 0.5)
              offCtx.drawImage(img, (s - size) / 2, (s - size) / 2, size, size)
              ctx.globalAlpha = 1
              ctx.drawImage(e._off, e.x - s / 2, e.y - s / 2)
            } else {
              // fallback（无离屏支持时）
              ctx.save()
              ctx.globalAlpha = Math.max(0, 1 - (e.timer / e.duration) * 0.5)
              ctx.drawImage(img, e.x - size / 2, e.y - size / 2, size, size)
              ctx.restore()
            }
          }
        }
      } else if (e.type === 'skill_beam') {
        // ★ 密排帧动画：火焰喷射 / GSD波动剑效果 ★
        // 将命中帧图片沿射线路径密排拼接，形成连续的技能视觉效果
        const beamLen = Math.sqrt((e.endX - e.startX)**2 + (e.endY - e.startY)**2)
        const angle = Math.atan2(e.endY - e.startY, e.endX - e.startX)

        // 动画进度：前半段喷射延伸 → 后半段整体淡出
        const jetProgress = Math.min(1, e.timer / (e.duration * 0.45))
        let fadeAlpha = 1
        if (e.timer > e.duration * 0.5) {
          fadeAlpha = 1 - (e.timer - e.duration * 0.5) / (e.duration * 0.5)
        }
        if (fadeAlpha <= 0) continue

        const hitData = HIT_EFFECTS[e.hitType]
        if (!hitData || !hitData.frames || !hitData.frames.length) continue

        // 帧动画：读取_updateEffects中已更新的帧索引
        const curFrameKey = hitData.frames[e.animFrame || 0]
        const frameImg = this.assets.get(curFrameKey)
        if (!frameImg) continue

        // 帧尺寸配置（不同技能用不同大小和间距）
        const isFire = e.hitType === 'fireball'
        const baseSize = isFire ? 70 : 120   // 冰晶波动剑：大幅加大！
        const spacing = isFire ? 28 : 22      // 冰晶：更密排，形成连续冰刃
        const tileCount = Math.ceil(beamLen / spacing)  // 需要多少帧来铺满射线

        // 创建/复用离屏canvas（只在首次或尺寸变化时重置——避免每帧重分配内存！）
        const offW = Math.ceil(beamLen) + 100
        const offH = baseSize + 60
        if (!e._offCV) {
          e._offCV = (typeof wx !== 'undefined' && wx.createCanvas) ? wx.createCanvas() : null
          e._offW = offW
          e._offH = offH
        }
        if (e._offCV && (e._offW !== offW || e._offH !== offH)) {
          e._offCV.width = offW
          e._offCV.height = offH
          e._offW = offW
          e._offH = offH
        }

        if (e._offCV) {
          const octx = e._offCV.getContext('2d')
          octx.clearRect(0, 0, offW, offH)

          const cx = 50       // 起始偏移（留给角色位置）
          const cy = offH / 2 // 射线中心Y
          const visibleLen = beamLen * jetProgress

          for (let i = 0; i < tileCount; i++) {
            const posX = cx + i * spacing

            if (isFire) {
              // ========== 火球术：纺锤形密排（保持原逻辑）==========
              if (posX > cx + visibleLen + baseSize) break

              const centerPos = beamLen / 2
              const distFromCenter = Math.abs(i * spacing - centerPos)
              const spindleRatio = 1 - (distFromCenter / centerPos) * 0.55
              const size = baseSize * Math.max(0.35, spindleRatio)

              const phase = (i / tileCount * 4) - (e.timer / 80)
              const waveOffset = Math.sin(phase * Math.PI * 2) * 8

              const finalPosY = cy + waveOffset
              const headRatio = i / tileCount
              const tileFade = fadeAlpha * (0.5 + headRatio * 0.5) * (0.7 + Math.sin(phase) * 0.3)

              octx.globalAlpha = Math.max(0, Math.min(1, tileFade))
              octx.drawImage(frameImg, posX - size / 2, finalPosY - size / 2, size, size)
            } else {
              // ========== DNF 冰刃波动剑：逐块生长+从尾到头消失 ==========
              // 两阶段：前半段→由小到大逐个涌出；后半段→从最小(靠近角色)开始消失
              const distFromStart = i * spacing
              const growT = Math.min(1, e.timer / (e.duration * 0.45))   // 生长加快：45%内完成
              const fadeT = e.timer > e.duration * 0.5
                ? (e.timer - e.duration * 0.5) / (e.duration * 0.5) : 0  // 消散：后50%

              // jetProgress限制
              if (distFromStart > visibleLen + baseSize) continue

              // ===== 生长阶段：每个位置有独立的"出现时间"，越远的位置出现越晚 =====
              const appearDelay = distFromStart / beamLen    // 0(近) ~ 1(远)
              const localGrowT = Math.max(0, Math.min(1, (growT - appearDelay * 0.55) / 0.5))

              if (localGrowT <= 0 && fadeT <= 0) continue  // 还没长出来也没消散

              // ★ 大小分布：最小50%（不再像灰尘），越远越大 ★
              const distRatio = Math.min(1, distFromStart / beamLen)
              const growScale = 0.5 + distRatio * 0.5        // 近端50% → 远端100%
              // 生长动画：刚出现的冰块从小变大到目标尺寸
              const animScale = localGrowT > 0 ? 0.4 + localGrowT * 0.6 : 1  // 出现时从40%→100%
              const size = baseSize * growScale * animScale

              // ===== 消散阶段：从靠近角色的小冰块开始依次消失 =====
              let disappearAlpha = 1
              if (fadeT > 0) {
                const disappearDelay = distRatio * 0.7       // 远端多撑70%时间
                const localFadeT = Math.max(0, (fadeT - disappearDelay) / 0.4)
                disappearAlpha = Math.max(0, 1 - localFadeT)
              }
              if (localGrowT <= 0 || disappearAlpha <= 0.02) continue

              // 波动剑正弦弯曲（更明显）
              const bendY = Math.sin((i / tileCount) * Math.PI * 3.2 + e.timer / 60) * 20
              const finalPosY = cy + bendY

              const tileFade = fadeAlpha * localGrowT * disappearAlpha

              octx.globalAlpha = Math.max(0, Math.min(1, tileFade))
              octx.drawImage(frameImg, posX - size / 2, finalPosY - size / 2, size, size)
            }
          }

          // 整体一次性贴回主画布
          ctx.save()
          ctx.translate(e.startX, e.startY)
          ctx.rotate(angle)
          ctx.drawImage(e._offCV, -cx, -cy)
          ctx.restore()
        } else {
          // fallback：无离屏支持时直接绘制
          ctx.save()
          ctx.translate(e.startX, e.startY)
          ctx.rotate(angle)

          for (let i = 0; i < tileCount; i++) {
            const posX = i * spacing

            if (isFire) {
              // 火球术：纺锤形密排
              if (posX > beamLen * jetProgress + baseSize) break

              const centerPos = beamLen / 2
              const distFromCenter = Math.abs(i * spacing - centerPos)
              const spindleRatio = 1 - (distFromCenter / centerPos) * 0.55
              const size = baseSize * Math.max(0.35, spindleRatio)

              const phase = (i / tileCount * 4) - (e.timer / 80)
              const waveOffset = Math.sin(phase * Math.PI * 2) * 8

              const headRatio = i / tileCount
              const tileFade = fadeAlpha * (0.5 + headRatio * 0.5) * (0.7 + Math.sin(phase) * 0.3)

              ctx.globalAlpha = Math.max(0, Math.min(1, tileFade))
              ctx.drawImage(frameImg, posX - size / 2, waveOffset - size / 2, size, size)
            } else {
              // DNF 冰刃波动剑：逐块生长+从尾到头消失（fallback）
              const distFromStart = posX
              const growT = Math.min(1, e.timer / (e.duration * 0.45))
              const fadeT = e.timer > e.duration * 0.5
                ? (e.timer - e.duration * 0.5) / (e.duration * 0.5) : 0

              if (posX > beamLen * jetProgress + baseSize) break

              const appearDelay = distFromStart / beamLen
              const localGrowT = Math.max(0, Math.min(1, (growT - appearDelay * 0.55) / 0.5))

              if (localGrowT <= 0 && fadeT <= 0) continue

              const distRatio = Math.min(1, distFromStart / beamLen)
              const growScale = 0.5 + distRatio * 0.5
              const animScale = localGrowT > 0 ? 0.4 + localGrowT * 0.6 : 1
              const size = baseSize * growScale * animScale

              let disappearAlpha = 1
              if (fadeT > 0) {
                const disappearDelay = distRatio * 0.7
                const localFadeT = Math.max(0, (fadeT - disappearDelay) / 0.4)
                disappearAlpha = Math.max(0, 1 - localFadeT)
              }
              if (localGrowT <= 0 || disappearAlpha <= 0.02) continue

              const bendY = Math.sin((i / tileCount) * Math.PI * 3.2 + e.timer / 60) * 20
              const posY = bendY

              ctx.globalAlpha = Math.max(0, Math.min(1, fadeAlpha * localGrowT * disappearAlpha))
              ctx.drawImage(frameImg, posX - size / 2, posY - size / 2, size, size)
            }
          }
          ctx.restore()
        }

      } else if (e.type === 'ice_wave_sword') {
        // ★ DNF 冰刃波动剑：每刃播完11帧动画 → 下一刃 → 全部生成后从刃1逐个消失 ★
        const beamLen = Math.sqrt((e.endX - e.startX)**2 + (e.endY - e.startY)**2)
        const angle = Math.atan2(e.endY - e.startY, e.endX - e.startX)

        const hitData = HIT_EFFECTS.ice
        if (!hitData || !hitData.frames || !hitData.frames.length) return
        const frameRate = hitData.frameRate || 44
        const totalFrames = hitData.frames.length   // 11帧

        const bladeNum = 8
        const bladeAnimDur = totalFrames * frameRate  // 11帧动画总时长
        const totalGenDur = bladeAnimDur * bladeNum    // 8刃全部生成完的时刻

        // ★ 冰刃配置：大尺寸、密集排列、无弯曲 ★
        const bladeMaxSize = 110
        const bladeMinSize = 55
        const bladeSpacing = beamLen / (bladeNum - 1)

        // 离屏canvas
        const offW = Math.ceil(beamLen) + 120
        const offH = bladeMaxSize + 60
        if (!e._offCV) {
          e._offCV = (typeof wx !== 'undefined' && wx.createCanvas) ? wx.createCanvas() : null
          e._offW = offW; e._offH = offH
        }
        if (e._offCV && (e._offW !== offW || e._offH !== offH)) {
          e._offCV.width = offW; e._offCV.height = offH
          e._offW = offW; e._offH = offH
        }

        if (e._offCV) {
          const octx = e._offCV.getContext('2d')
          octx.clearRect(0, 0, offW, offH)

          const cx = 60, cy = offH / 2

          for (let b = 0; b < bladeNum; b++) {
            // 刃的固定位置（沿射线，从角色到目标）
            const distFromStart = b * bladeSpacing
            if (distFromStart > beamLen + bladeMaxSize) continue

            // ★ 出生时刻：每个刃独立（上一刃动画结束 = 下一刃出生）★
            const birthTime = e._bladeBirths ? e._bladeBirths[b] : b * bladeAnimDur
            if (e.timer < birthTime) continue  // 还没出生

            // 这个刃存在了多久（ms）
            const bladeAge = e.timer - birthTime

            // ★ 大小：近小远大（固定分布）★
            const sizeRatio = Math.min(1, b / (bladeNum - 1))
            const targetSize = bladeMinSize + (bladeMaxSize - bladeMinSize) * sizeRatio

            // ★ 每刃11帧动画：独立循环，播完停在最后一帧 ★
            // bladeAge < bladeAnimDur: 播放动画
            // bladeAge >= bladeAnimDur: 刃已完成动画，停在第11帧（最后一帧）
            const frameIdx = bladeAge < bladeAnimDur
              ? Math.floor(bladeAge / frameRate) % totalFrames
              : totalFrames - 1   // 停在最后一帧

            const bladeImg = this.assets.get(hitData.frames[frameIdx])
            if (!bladeImg) continue

            // ★ 消散阶段：8刃全部生成后，从刃0开始逐个消失 ★
            let alpha = 1
            if (e.timer > totalGenDur) {
              const fadeDur = e.duration - totalGenDur
              const fadeProgress = (e.timer - totalGenDur) / fadeDur
              // 刃b的消散时机：索引小的先消失
              const disappearDelay = (b / bladeNum) * 0.7
              const localFade = Math.max(0, (fadeProgress - disappearDelay) / 0.4)
              alpha = Math.max(0, 1 - localFade)
            }
            if (alpha <= 0.03) continue

            // 无弯曲：全部在同一水平线上
            const posX = cx + distFromStart
            const finalPosY = cy

            octx.globalAlpha = Math.max(0, Math.min(1, alpha))
            octx.drawImage(bladeImg,
              posX - targetSize / 2, finalPosY - targetSize / 2,
              targetSize, targetSize)
          }

          ctx.save()
          ctx.translate(e.startX, e.startY)
          ctx.rotate(angle)
          ctx.drawImage(e._offCV, -cx, -cy)
          ctx.restore()
        }

      } else if (e.type === 'cast_ring') {
        // 施法光圈：从怪物扩散的圆环 —— 离屏隔离
        const t = 1 - (e.life / e.maxLife)
        const r = e.radius + (e.maxRadius - e.radius) * t
        const alpha = Math.max(0, 1 - t * 1.5)
        const dia = Math.ceil(r * 2) + 20
        if (!e._off) { e._off = (typeof wx !== 'undefined' && wx.createCanvas) ? wx.createCanvas() : null; e._offS = 0; }
        if (e._off && e._offS !== dia) { e._off.width = dia; e._off.height = dia; e._offS = dia; }
        const offCtx = e._off ? e._off.getContext('2d') : null
        const cx = dia / 2, cy = dia / 2
        if (offCtx) {
          offCtx.clearRect(0, 0, dia, dia)
          offCtx.globalAlpha = alpha * 0.7
          offCtx.strokeStyle = e.color
          offCtx.lineWidth = 3 * (1 - t * 0.6)
          offCtx.shadowBlur = 12
          offCtx.shadowColor = e.color
          offCtx.beginPath()
          offCtx.arc(cx, cy, r, 0, Math.PI * 2)
          offCtx.stroke()
          offCtx.globalAlpha = alpha * 0.15
          offCtx.fillStyle = e.color
          offCtx.fill()
          ctx.drawImage(e._off, e.x - cx, e.y - cy)
        } else {
          ctx.save()
          ctx.globalAlpha = alpha * 0.7
          ctx.strokeStyle = e.color
          ctx.lineWidth = 3 * (1 - t * 0.6)
          ctx.beginPath()
          ctx.arc(e.x, e.y, r, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = alpha * 0.15
          ctx.fillStyle = e.color
          ctx.fill()
          ctx.restore()
        }
      } else if (e.type === 'freeze_aura') {
        // 冰冻光环：围绕目标的蓝色霜冻效果 —— 离屏隔离
        const t = e.life / e.maxLife
        const pulseScale = 1 + Math.sin(Date.now() / 150) * 0.08
        const dia = 80
        if (!e._off) { e._off = (typeof wx !== 'undefined' && wx.createCanvas) ? wx.createCanvas() : null; e._offS = 0; }
        if (e._off && e._offS !== dia) { e._off.width = dia; e._off.height = dia; e._offS = dia; }
        const offCtx = e._off ? e._off.getContext('2d') : null
        if (offCtx) {
          offCtx.clearRect(0, 0, dia, dia)
          const cx = dia / 2, cy = dia / 2
          offCtx.globalAlpha = 0.35 * t
          offCtx.strokeStyle = '#66ccff'
          offCtx.lineWidth = 2
          offCtx.shadowBlur = 15
          offCtx.shadowColor = '#44aaff'
          offCtx.beginPath()
          offCtx.arc(cx, cy, 28 * pulseScale, 0, Math.PI * 2)
          offCtx.stroke()
          offCtx.globalAlpha = 0.12 * t
          offCtx.fillStyle = '#88ddff'
          offCtx.fill()

          for (let i = 0; i < 4; i++) {
            const angle = (Date.now() / 400 + i * Math.PI / 2) % (Math.PI * 2)
            const dist = 20 + Math.sin(Date.now() / 200 + i) * 8
            const px = cx + Math.cos(angle) * dist
            const py = cy + Math.sin(angle) * dist * 0.7
            offCtx.globalAlpha = 0.6 * t
            offCtx.fillStyle = '#aaeeff'
            offCtx.beginPath()
            offCtx.arc(px, py, 2.5, 0, Math.PI * 2)
            offCtx.fill()
          }
          ctx.drawImage(e._off, e.x - cx, e.y - cy)
        } else {
          ctx.save()
          ctx.globalAlpha = 0.35 * t
          ctx.strokeStyle = '#66ccff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(e.x, e.y, 28 * pulseScale, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 0.12 * t
          ctx.fillStyle = '#88ddff'
          ctx.fill()
          ctx.restore()
        }
      } else if (e.type === 'skill_ray') {
        // 技能射线（火球/冰晶的贯穿光束）
        const t = e.timer / e.duration
        const alpha = Math.max(0, 1 - t * 2)
        const w = (e.width || 10) * (1 - t * 0.5)
        ctx.save()
        ctx.globalAlpha = alpha

        // 外发光（宽而模糊）
        ctx.strokeStyle = e.glowColor || e.color
        ctx.lineWidth = w * 3
        ctx.shadowBlur = 20
        ctx.shadowColor = e.glowColor || e.color
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(e.startX, e.startY)
        ctx.lineTo(e.endX, e.endY)
        ctx.stroke()

        // 核心亮线
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = Math.max(1, w * 0.3)
        ctx.shadowBlur = 8
        ctx.shadowColor = '#fff'
        ctx.globalAlpha = alpha * 0.9
        ctx.beginPath()
        ctx.moveTo(e.startX, e.startY)
        ctx.lineTo(e.endX, e.endY)
        ctx.stroke()
        ctx.restore()
      } else if (e.type === 'aoe_lightning') {
        // 雷击AoE电圈特效 —— 离屏隔离
        const t = e.timer / e.duration
        const pulse = 1 + Math.sin(t * Math.PI * 6) * 0.15
        const r = e.radius * pulse
        const alpha = Math.max(0, (1 - t) * 0.8)
        const dia = Math.ceil(r * 2.8) + 20
        if (!e._off) { e._off = (typeof wx !== 'undefined' && wx.createCanvas) ? wx.createCanvas() : null; e._offS = 0; }
        if (e._off && e._offS !== dia) { e._off.width = dia; e._off.height = dia; e._offS = dia; }
        const offCtx = e._off ? e._off.getContext('2d') : null

        if (offCtx) {
          offCtx.clearRect(0, 0, dia, dia)
          const cx = dia / 2, cy = dia / 2
          for (let ring = 0; ring < 3; ring++) {
            const ringR = r * (0.4 + ring * 0.35) * (0.8 + t * 0.4)
            const ringAlpha = alpha * (1 - ring * 0.25)
            offCtx.globalAlpha = ringAlpha * 0.5
            offCtx.strokeStyle = '#ffee44'
            offCtx.lineWidth = 2.5 - ring * 0.5
            offCtx.shadowBlur = 12 + ring * 5
            offCtx.shadowColor = '#ffdd00'
            offCtx.beginPath()
            const segments = 24 + ring * 8
            for (let i = 0; i <= segments; i++) {
              const angle = (i / segments) * Math.PI * 2
              const jagged = r * 0.04 * (ring + 1) * Math.sin(i * 7.7 + t * 30 + ring * 2)
              const px = cx + Math.cos(angle) * (ringR + jagged)
              const py = cy + Math.sin(angle) * (ringR + jagged)
              if (i === 0) offCtx.moveTo(px, py)
              else offCtx.lineTo(px, py)
            }
            offCtx.closePath()
            offCtx.stroke()
          }
          offCtx.globalAlpha = alpha * 0.08
          offCtx.fillStyle = '#ffee00'
          offCtx.beginPath(); offCtx.arc(cx, cy, r * 0.9, 0, Math.PI*2); offCtx.fill()

          if (e.targets && e.targets.length > 0) {
            offCtx.globalAlpha = alpha * 0.9
            offCtx.strokeStyle = '#ffff88'
            offCtx.lineWidth = 1.5
            offCtx.shadowBlur = 10
            offCtx.shadowColor = '#ffee00'
            for (const tgt of e.targets) {
              this._drawLightningBolt(offCtx, cx, cy, cx + (tgt.x - e.x), cy + (tgt.y - e.y), 3)
            }
          }

          ctx.drawImage(e._off, e.x - cx, e.y - cy)
        } else {
          ctx.save()
          ctx.globalAlpha = alpha * 0.08
          ctx.fillStyle = '#ffee00'
          ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.9, 0, Math.PI*2); ctx.fill()
          ctx.restore()
        }
      } else if (e.type === 'buff_shockwave') {
        // BUFF冲击波：从施法者向外扩散的圆环（战吼更大范围）
        const t = e.timer / e.duration
        const r = e.radius * t
        const alpha = Math.max(0, (1 - t) * 0.85)
        ctx.save()

        // 多层扩散环
        for (let ring = 0; ring < 2; ring++) {
          const ringR = r * (0.6 + ring * 0.5)
          const ringAlpha = alpha * (1 - ring * 0.35)
          ctx.globalAlpha = ringAlpha
          ctx.strokeStyle = e.color
          ctx.lineWidth = (3.5 - ring) * (1 - t)
          ctx.shadowBlur = 18
          ctx.shadowColor = e.color
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.arc(e.x, e.y, Math.max(1, ringR), 0, Math.PI * 2)
          ctx.stroke()
        }

        // 内部填充光晕
        ctx.globalAlpha = alpha * 0.12
        ctx.fillStyle = e.color
        ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(1, r), 0, Math.PI * 2); ctx.fill()

        // 战吼AOE：额外显示文字标签
        if (e.isAoe && t < 0.5) {
          ctx.globalAlpha = alpha * 2
          ctx.font = 'bold 14px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#ffffff'
          ctx.fillText('WAR CRY!', e.x, e.y - r - 12)
        }

        ctx.restore()
      } else if (e.type === 'buff_aura') {
        // Buff光环：围绕角色的持续发光效果（类似冰冻光环但颜色不同）
        const elapsed = Date.now() - ((e.startTime || Date.now()) || Date.now())
        const remainRatio = Math.max(0, 1 - (elapsed / e.duration))
        if (remainRatio <= 0) { e.life = 0; return; }

        const pulseScale = 1 + Math.sin(Date.now() / 180 + (e.buffId === 'berserk' ? 0 : 1)) * 0.10
        const baseRadius = e.buffId === 'war_cry' ? 38 : 32
        const auraR = baseRadius * pulseScale

        ctx.save()

        // 外层光晕（柔和发光）
        const glowGrad = ctx.createRadialGradient(e.x, e.y, auraR * 0.3, e.x, e.y, auraR * 1.3)
        glowGrad.addColorStop(0, e.color + '20')
        glowGrad.addColorStop(0.7, e.color + '10')
        glowGrad.addColorStop(1, e.color + '00')
        ctx.fillStyle = glowGrad
        ctx.beginPath(); ctx.arc(e.x, e.y, auraR * 1.3, 0, Math.PI * 2); ctx.fill()

        // 主光环圈（带脉冲）
        ctx.globalAlpha = 0.45 * remainRatio
        ctx.strokeStyle = e.color
        ctx.lineWidth = 2.5
        ctx.shadowBlur = 16
        ctx.shadowColor = e.color
        ctx.setLineDash([8, 6])
        ctx.beginPath()
        ctx.arc(e.x, e.y, auraR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])

        // 内部半透明填充
        ctx.globalAlpha = 0.08 * remainRatio
        ctx.fillStyle = e.color
        ctx.beginPath(); ctx.arc(e.x, e.y, auraR, 0, Math.PI * 2); ctx.fill()

        // 狂暴：额外火焰粒子
        if (e.buffId === 'berserk') {
          for (let i = 0; i < 5; i++) {
            const angle = (Date.now() / 300 + i * Math.PI * 0.4) % (Math.PI * 2)
            const dist = auraR * 0.75 + Math.sin(Date.now() / 150 + i * 2) * 8
            const px = e.x + Math.cos(angle) * dist
            const py = e.y + Math.sin(angle) * dist
            ctx.globalAlpha = 0.7 * remainRatio * (0.5 + 0.5 * Math.sin(Date.now() / 100 + i))
            ctx.fillStyle = '#ff8833'
            ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill()
          }
        } else if (e.buffId === 'war_cry') {
          // 战吼：向上飘浮的光点
          for (let i = 0; i < 4; i++) {
            const angle = (Date.now() / 400 + i * Math.PI * 0.5) % (Math.PI * 2)
            const dist = auraR * 0.6 + Math.sin(Date.now() / 200 + i) * 10
            const px = e.x + Math.cos(angle) * dist
            const py = e.y + Math.sin(angle) * dist * 0.6 - 5
            ctx.globalAlpha = 0.65 * remainRatio
            ctx.fillStyle = '#ffcc44'
            ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill()
          }
        }

        ctx.restore()
      }
    }
  }

  /** 渲染技能击中特效帧 */
  _renderSkillEffectFrames(ctx, effect) {
    const frameMap = {
      fireball_hit: {
        prefix: 'EFFECT_FIREBALL_HIT_', count: 24
      },
      ice_hit: {
        prefix: 'EFFECT_ICE_SHARD_HIT_', count: 11
      },
      lightning_hit: {
        prefix: 'EFFECT_LIGHTNING_HIT_', count: 12
      }
    }
    const info = frameMap[effect.skillType]
    if (!info) return
    const frameIdx = Math.min(effect.frame, info.count - 1)
    const key = `${info.prefix}${String(frameIdx + 1).padStart(2, '0')}`
    const img = this.assets.get(key)
    if (img) {
      const size = 80
      // 离屏Canvas隔离渲染 —— 防止帧图片半透明像素污染主画布背景
      const s = size + 4
      if (!effect._off) { effect._off = (typeof wx !== 'undefined' && wx.createCanvas) ? wx.createCanvas() : null; effect._offS = 0; }
      if (effect._off && effect._offS !== s) { effect._off.width = s; effect._off.height = s; effect._offS = s; }
      const offCtx = effect._off ? effect._off.getContext('2d') : null
      if (offCtx) {
        offCtx.clearRect(0, 0, s, s)
        offCtx.globalAlpha = Math.min(1, effect.life * 2)
        offCtx.drawImage(img, (s - size) / 2, (s - size) / 2, size, size)
        ctx.drawImage(effect._off, effect.x - s / 2, effect.y - s / 2)
      } else {
        ctx.save()
        ctx.globalAlpha = Math.min(1, effect.life * 2)
        ctx.drawImage(img, effect.x - size / 2, effect.y - size / 2, size, size)
        ctx.restore()
      }
    }
  }

  // ===== 粒子 =====

  _renderParticles(ctx) {
    for (const p of this.particles) {
      ctx.save()
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // ===== 浮动文字 =====

  _renderFloatingTexts(ctx) {
    const dpr = this.dpr
    for (const ft of this.floatingTexts) {
      ctx.save()
      ctx.globalAlpha = Math.min(1, ft.life)
      ctx.fillStyle = ft.color
      // 浮动文字放大（手机端必须足够大）
      ctx.font = `bold ${16 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 3 * dpr
      ctx.strokeText(ft.text, ft.x, ft.y)
      ctx.fillText(ft.text, ft.x, ft.y)
      ctx.restore()
    }
  }

  // ===== 技能弧形菜单 =====

  _renderSkillArcMenu(ctx) {
    if (!this.skillMenu.visible || this.skillMenu.charIndex < 0) return
    const c = this.party[this.skillMenu.charIndex]
    if (!c) return
    const skills = c.skills
    if (!skills || skills.length === 0) return

    const cx = c.x
    const cy = c.y - 140 // 角色上方弹出（上移一点给AI按钮留空间）
    const btnRadius = 34   // 按钮稍大一点
    const arcRadius = 115 // 弧形半径加大（原85太挤）
    const dpr = this.dpr

    // 菜单淡入效果
    const elapsed = Date.now() - (this.skillMenu.openTimer || 0)
    const fadeIn = Math.min(1, elapsed / 200)
    ctx.globalAlpha = fadeIn * 0.95

    // 背景半透明遮罩
    ctx.fillStyle = 'rgba(13,17,23,0.35)'
    ctx.beginPath()
    ctx.arc(cx, cy - 10, arcRadius + 60, 0, Math.PI * 2)
    ctx.fill()

    for (let i = 0; i < skills.length; i++) {
      const sk = skills[i]
      // 角度范围从 0.7*PI 扩大到 0.85*PI，按钮更分散
      const angleOffset = ((i / (skills.length - 1 || 1)) - 0.5) * Math.PI * 0.85
      const angle = -Math.PI / 2 + angleOffset
      const bx = cx + Math.cos(angle) * arcRadius
      const by = cy + Math.sin(angle) * arcRadius

      const cdRemaining = (c.skillCDs[sk.id] || 0)
      const onCD = cdRemaining > 0
      const canAfford = (c.currentMp || 0) >= (sk.mpCost || 0)
      const unlocked = sk.unlockLevel ? (c.level >= (sk.unlockLevel || 1)) : true

      // 技能按钮圆形背景
      const isMagic = sk.type === 'magic'
      ctx.save()
      ctx.translate(bx, by)

      if (!unlocked) {
        ctx.fillStyle = 'rgba(45,51,59,0.8)'
        ctx.strokeStyle = '#30363d'
        ctx.lineWidth = 1.5
      } else {
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, btnRadius)
        if (isMagic) {
          grad.addColorStop(0, onCD ? 'rgba(80,40,130,0.7)' : 'rgba(100,50,180,0.8)')
          grad.addColorStop(1, onCD ? 'rgba(60,30,100,0.6)' : 'rgba(80,40,150,0.7)')
        } else {
          grad.addColorStop(0, onCD ? 'rgba(55,55,65,0.7)' : 'rgba(70,80,90,0.8)')
          grad.addColorStop(1, onCD ? 'rgba(40,42,50,0.6)' : 'rgba(55,62,72,0.7)')
        }
        ctx.fillStyle = grad
        ctx.strokeStyle = onCD ? '#484f58' : '#58a6ff'
        ctx.lineWidth = 2
      }

      ctx.beginPath()
      ctx.arc(0, 0, btnRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // CD遮罩扇形（从12点顺时针）
      if (onCD && sk.cd > 0) {
        const cdRatio = cdRemaining / sk.cd
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, btnRadius, -Math.PI / 2, -Math.PI / 2 + cdRatio * Math.PI * 2)
        ctx.closePath()
        ctx.fill()
      }

      // 技能图标/名称
      ctx.fillStyle = !unlocked ? '#666' :
        (canAfford ? '#f0e6d3' : '#e74c3c')
      ctx.font = `bold ${11 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const displayName = !unlocked ? '?' : sk.name.length > 3 ? sk.name.slice(0, 3) : sk.name
      ctx.fillText(displayName, 0, 0)

      // CD倒计时文字
      if (onCD) {
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${10 * dpr}px sans-serif`
        ctx.fillText(`${Math.ceil(cdRemaining / 1000)}s`, 0, btnRadius + 14)
      }

      // MP消耗
      if (unlocked && (sk.mpCost || 0) > 0) {
        ctx.fillStyle = canAfford ? '#58a6ff' : '#e74c3c'
        ctx.font = `${8 * dpr}px sans-serif`
        ctx.fillText(`${sk.mpCost}mp`, 0, btnRadius + 26)
      }

      // 锁定标记
      if (!unlocked) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.beginPath()
        ctx.arc(0, 0, btnRadius, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#888'
        ctx.font = `${14 * dpr}px sans-serif`
        ctx.fillText(`Lv${sk.unlockLevel}`, 0, 0)
      }

      ctx.restore()

      // 存储按钮位置用于点击检测
      if (!this.skillMenu.buttons) this.skillMenu.buttons = []
      this.skillMenu.buttons[i] = { x: bx, y: by, r: btnRadius, skillIdx: i, charIndex: this.skillMenu.charIndex }
    }

    // ===== AI自动攻击切换按钮 =====
    const aiBtnY = cy + arcRadius + 45 // 弧形下方
    const aiBtnW = 130 * dpr
    const aiBtnH = 36 * dpr
    const aiOn = !!c.autoAttackEnabled

    // 记录AI按钮位置用于点击检测
    this.skillMenu.aiButton = { x: cx - aiBtnW / 2, y: aiBtnY - aiBtnH / 2, w: aiBtnW, h: aiBtnH, charIndex: this.skillMenu.charIndex }

    ctx.save()
    // AI按钮背景
    if (aiOn) {
      const aiGrad = ctx.createLinearGradient(cx - aiBtnW / 2, aiBtnY, cx + aiBtnW / 2, aiBtnY)
      aiGrad.addColorStop(0, 'rgba(46,160,67,0.8)')
      aiGrad.addColorStop(1, 'rgba(35,134,54,0.75)')
      ctx.fillStyle = aiGrad
      ctx.strokeStyle = '#3fb950'
    } else {
      ctx.fillStyle = 'rgba(55,62,72,0.85)'
      ctx.strokeStyle = '#58a6ff'
    }
    ctx.lineWidth = 1.5
    this._roundRect(ctx, cx - aiBtnW / 2, aiBtnY - aiBtnH / 2, aiBtnW, aiBtnH, 8)
    ctx.fill()
    ctx.stroke()

    // AI按钮文字
    ctx.fillStyle = aiOn ? '#fff' : '#c9d1d9'
    ctx.font = `bold ${12 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(aiOn ? '🤖 AI战斗中(点关闭)' : '🤖 开启AI自动', cx, aiBtnY)

    // 自动技能状态提示
    if (aiOn) {
      ctx.fillStyle = 'rgba(63,185,80,0.7)'
      ctx.font = `${9 * dpr}px sans-serif`
      ctx.fillText('自动普攻+释放技能', cx, aiBtnY + aiBtnH / 2 + 14)
    }
    ctx.restore()

    // 提示文字
    ctx.globalAlpha = fadeIn * 0.6
    ctx.fillStyle = '#8b949e'
    ctx.font = `${10 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('点击技能释放', cx, cy - arcRadius - 20)

    ctx.globalAlpha = 1
  }

  /** 圆角矩形辅助方法 */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  // ===== 胜利/失败界面 =====

  _renderResultScreen(ctx) {
    const W = this.width
    const H = this.height
    const dpr = this.dpr
    const isVictory = this.phase === 'victory'

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.fillRect(0, 0, W, H)

    const cx = W / 2
    const cy = H * 0.38

    // 标题
    ctx.font = `bold ${Math.max(36, 36 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (isVictory) {
      ctx.shadowBlur = 25
      ctx.shadowColor = '#ffd700'
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 2
      ctx.strokeText('🎉 胜利！', cx, cy - 60)
      ctx.fillStyle = '#ffd700'
      ctx.fillText('🎉 胜利！', cx, cy - 60)
      ctx.shadowBlur = 0
    } else {
      ctx.fillStyle = '#ff4444'
      ctx.strokeText('💀 失败...', cx, cy - 60)
      ctx.fillText('💀 失败...', cx, cy - 60)
    }

    // 统计信息
    ctx.font = `${Math.max(15, 16 * dpr)}px sans-serif`
    ctx.fillStyle = '#c9d1d9'
    const statsText = [
      `⚔ 击杀: ${this.stats.kills} 只`,
      `🎒 掉落: ${this.stats.dropsCollected} 件`,
      `⏱ 用时: ${(this.battleTime / 1000).toFixed(1)} 秒`
    ]
    for (let i = 0; i < statsText.length; i++) {
      ctx.fillText(statsText[i], cx, cy + i * 30)
    }

    // 角色等级展示
    if (isVictory && this.party) {
      ctx.font = `${Math.max(13, 14 * dpr)}px sans-serif`
      ctx.fillStyle = '#8b949e'
      ctx.fillText('─── 角色等级 ───', cx, cy + 110)
      ctx.fillStyle = '#58a6ff'
      for (let i = 0; i < this.party.length; i++) {
        const c = this.party[i]
        ctx.fillText(`${c.name}: Lv${c.level}`, cx, cy + 140 + i * 26)
      }
    }

    // 返回按钮
    const btnW = Math.min(200 * dpr, W * 0.5)
    const btnH = Math.max(46, 48 * dpr)
    const btnX = (W - btnW) / 2
    const btnY = H * 0.78

    // 记录按钮区域（用于点击检测）
    this._backBtnBounds = { x: btnX, y: btnY, w: btnW, h: btnH }

    ctx.fillStyle = isVictory ? 'rgba(56,139,253,0.85)' : 'rgba(248,81,73,0.85)'
    const br = 10
    ctx.beginPath()
    ctx.moveTo(btnX + br, btnY)
    ctx.lineTo(btnX + btnW - br, btnY)
    ctx.quadraticCurveTo(btnX + btnW, btnY, btnX + btnW, btnY + br)
    ctx.lineTo(btnX + btnW, btnY + btnH - br)
    ctx.quadraticCurveTo(btnX + btnW, btnY + btnH, btnX + btnW - br, btnY + btnH)
    ctx.lineTo(btnX + br, btnY + btnH)
    ctx.quadraticCurveTo(btnX, btnY + btnH, btnX, btnY + btnH - br)
    ctx.lineTo(btnX, btnY + br)
    ctx.quadraticCurveTo(btnX, btnY, btnX + br, btnY)
    ctx.fill()

    ctx.font = `bold ${Math.max(17, 18 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('返回城镇', cx, btnY + btnH / 2)
  }

  // ===== UI层 =====

  _renderUI(ctx) {
    const W = this.width
    const H = this.height
    const dpr = this.dpr

    // ===== 顶部状态栏（塔防HUD）=====
    const topBarH = Math.max(H * 0.095, 56)

    // 渐变背景（深蓝→半透明，有质感）
    const topGrad = ctx.createLinearGradient(0, 0, 0, topBarH)
    topGrad.addColorStop(0, 'rgba(12,20,35,0.95)')
    topGrad.addColorStop(1, 'rgba(18,28,48,0.85)')
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, W, topBarH)

    // 底部发光线分隔
    ctx.strokeStyle = 'rgba(80,140,220,0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, topBarH)
    ctx.lineTo(W, topBarH)
    ctx.stroke()

    // ---- 左侧：波次/总波次 ----
    const currentWave = Math.min(this.waveIndex, this.totalWaves)
    const progress = this.totalWaves > 0 ? (this.waveIndex - 1) / this.totalWaves : 0

    // 波次图标
    ctx.font = `bold ${Math.max(14, 15 * dpr)}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('⚔️', Math.max(8, 10), topBarH * 0.32)

    // "波次" 标签
    ctx.fillStyle = '#9eb0cc'
    ctx.font = `${Math.max(11, 12 * dpr)}px sans-serif`
    ctx.fillText('波次', Math.max(30, 34), topBarH * 0.32)

    // 波次数字
    const waveColor = currentWave <= 3 ? '#4ade80' : currentWave <= 6 ? '#fbbf24' : currentWave <= 9 ? '#f97316' : '#f87171'
    ctx.fillStyle = waveColor
    ctx.font = `bold ${Math.max(13, 14 * dpr)}px sans-serif`
    ctx.fillText(`${currentWave} / ${this.totalWaves}`, Math.max(72, 80), topBarH * 0.32)

    // 进度条（替代水晶血条）
    const progBarW = Math.min(100 * dpr, W * 0.22)
    const progBarX = Math.max(8, 10)
    const progBarY = topBarH * 0.58
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    this._roundRect(ctx, progBarX, progBarY, progBarW, Math.max(6, 7), 3)
    ctx.fill()
    if (progress > 0) {
      ctx.fillStyle = '#a855f7'
      this._roundRect(ctx, progBarX, progBarY, progBarW * Math.min(progress, 1), Math.max(6, 7), 3)
      ctx.fill()
    }

    // ---- 中间：当前战斗状态 ----
    let centerLabel = ''
    let centerColor = '#94a3b8'
    if (this.transition.active) {
      centerLabel = '🌀 传送中...'
      centerColor = '#a855f7'
    } else if (this.wormhole.active && !this.allWavesDone) {
      centerLabel = '🌀 前往虫洞!'
      centerColor = '#a855f7'
    } else if (this.allWavesDone) {
      centerLabel = '✅ 全部通关!'
      centerColor = '#4ade80'
    } else if (this.waveActive) {
      centerLabel = `⚔️ 第 ${currentWave} 波激战中`
      centerColor = '#f97316'
    } else {
      centerLabel = `第 ${currentWave} / ${this.totalWaves} 波`
      centerColor = '#94a3b8'
    }

    ctx.fillStyle = centerColor
    ctx.font = `bold ${Math.max(16, 18 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(centerLabel, W / 2, topBarH * 0.36)

    // 剩余怪物数量
    if (!this.allWavesDone && this.waveTotalCount > 0) {
      const remaining = Math.max(0, this.waveTotalCount - this.waveSpawnedCount + this.monsters.filter(m => !m.isDead).length)
      const remainLabel = remaining > 0 ? `剩余: ${remaining}` : '清理中...'
      ctx.fillStyle = remaining > 3 ? '#94a3b8' : remaining > 0 ? '#fbbf24' : '#4ade80'
      ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`
      ctx.fillText(remainLabel, W / 2, topBarH * 0.68)
    }

    // ---- 右侧：掉落/击杀统计 ----
    ctx.fillStyle = '#7890b0'
    ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const statsText = `💀${this.stats.kills || 0}  📦${this.stats.dropsCollected || 0}`
    ctx.fillText(statsText, W - Math.max(8, 10), topBarH * 0.42)

    // 虫洞提示
    if (this.wormhole.active && !this.transition.active && !this.allWavesDone) {
      ctx.fillStyle = '#a855f7'
      ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const hintPulse = 0.6 + Math.sin(this.battleTime * 0.004) * 0.4
      ctx.globalAlpha = hintPulse
      ctx.fillText('👆 靠近虫洞进入下一波 →', W / 2, topBarH * 0.85)
      ctx.globalAlpha = 1
    }

    // ===== 底部面板系统（战斗按钮 + 装备栏） =====
    this._renderBottomPanel(ctx)

    // 悬浮装备提示
    this._renderItemTooltip(ctx)
  }

  // ==================== 底部面板（战斗策略 + 装备栏）====================

  _renderBottomPanel(ctx) {
    const W = this.width, H = this.height, dpr = this.dpr

    // ---- 面板高度配置 ----
    const bottomMargin = Math.max(8, 12 * dpr)       // 底部安全边距（避免被屏幕裁切）
    const skillBarH   = Math.max(H * 0.055, 40)       // 技能栏（新增，在策略栏和装备栏之间）
    const tacticsBarH = Math.max(H * 0.06, 42)        // 上栏：战斗按钮
    const equipBarH   = Math.max(H * 0.22, 170)       // 下栏：装备+角色面板（加大以容纳三状态栏）
    const totalBarH   = tacticsBarH + skillBarH + equipBarH + 8  // 中间间隔
    const panelY      = H - totalBarH - bottomMargin   // 上移，留出底部边距

    // ===== 最上栏：角色技能栏 =====
    this._renderSkillBar(ctx, 0, panelY, W, skillBarH)

    // ===== 策略按钮栏 =====
    this._renderTacticsBar(ctx, 0, panelY + skillBarH + 4, W, tacticsBarH)

    // ===== 装备背包 + 角色信息 =====
    this._renderEquipInventory(ctx, 0, panelY + skillBarH + 4 + tacticsBarH + 4, W, equipBarH)

    // 存储区域信息供点击检测使用
    this._bottomPanelBounds = {
      y: panelY,
      skillBar: { x: 0, y: panelY, w: W, h: skillBarH },
      tacticsBar: { x: 0, y: panelY + skillBarH + 4, w: W, h: tacticsBarH },
      equipBar: { x: 0, y: panelY + skillBarH + 4 + tacticsBarH + 4, w: W, h: equipBarH },
    }
  }

  // ===== 技能栏（显示当前选中角色的技能，支持手动释放） =====

  _renderSkillBar(ctx, x, y, w, h) {
    const dpr = this.dpr
    const selected = this.party[this.selectedCharIndex]
    if (!selected || !selected.skills) { ctx.save(); return }
    const skills = selected.skills
    ctx.save()

    // 背景（深色半透明）
    const grad = ctx.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, 'rgba(18,24,38,0.92)')
    grad.addColorStop(1, 'rgba(12,18,28,0.95)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)

    // 顶部分隔线（淡蓝色发光）
    ctx.strokeStyle = 'rgba(100,160,255,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()

    // 底部分隔线
    ctx.strokeStyle = 'rgba(50,70,110,0.25)'
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke()

    // 角色名称标签
    const labelX = x + Math.max(8, 10 * dpr)
    const labelY = y + h / 2
    ctx.font = `bold ${Math.max(9, 10 * dpr)}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#7aa2d8'
    ctx.fillText(`${selected.name} 技能`, labelX, labelY)

    // ---- 技能按钮 ----
    this._skillBarButtons = []
    const btnGap = Math.max(4, 5 * dpr)
    const btnSize = Math.min(h * 0.72, 36 * dpr)       // 按钮尺寸（正方形）
    const labelW = 70 * dpr                               // 标签区域宽度
    const totalBtnW = skills.length * btnSize + (skills.length - 1) * btnGap
    const startX = labelX + labelW + (w - labelW - Math.max(16, 20 * dpr) - totalBtnW) / 2
    const btnY = y + (h - btnSize) / 2

    for (let i = 0; i < skills.length; i++) {
      const sk = skills[i]
      const bx = startX + i * (btnSize + btnGap)

      // CD状态检测
      const cdRemaining = Math.max(0, selected.skillCDs[sk.id] || 0)
      const onCD = cdRemaining > 0
      const currentMp = selected.currentMp || 0
      const mpCost = sk.mpCost || 0
      const canAfford = currentMp >= mpCost
      const unlocked = sk.unlockLevel ? (selected.level >= sk.unlockLevel) : true
      const isDead = selected.isDead
      const disabled = isDead || !unlocked || onCD || !canAfford

      ctx.save()
      ctx.translate(bx, btnY)

      // 按钮背景
      if (!unlocked) {
        ctx.fillStyle = 'rgba(38,44,54,0.8)'
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 1
      } else if (onCD) {
        const g = ctx.createRadialGradient(btnSize/2, btnSize/2, 2, btnSize/2, btnSize/2, btnSize*0.7)
        g.addColorStop(0, 'rgba(50,45,65,0.85)')
        g.addColorStop(1, 'rgba(35,32,48,0.75)')
        ctx.fillStyle = g
        ctx.strokeStyle = 'rgba(80,70,100,0.4)'
        ctx.lineWidth = 1
      } else if (!canAfford) {
        const g = ctx.createRadialGradient(btnSize/2, btnSize/2, 2, btnSize/2, btnSize/2, btnSize*0.7)
        g.addColorStop(0, 'rgba(90,40,35,0.8)')
        g.addColorStop(1, 'rgba(65,30,26,0.7)')
        ctx.fillStyle = g
        ctx.strokeStyle = 'rgba(180,80,60,0.3)'
        ctx.lineWidth = 1
      } else {
        // 正常可用：根据技能类型着色
        const typeColor = sk.type === 'magic' ? [100, 50, 200] :
                          sk.type === 'heal'  ? [50, 170, 90] :
                          sk.type === 'buff'  ? [200, 150, 50] :
                          [70, 85, 105]
        const g = ctx.createRadialGradient(btnSize/2, btnSize/2, 2, btnSize/2, btnSize/2, btnSize*0.7)
        g.addColorStop(0, `rgba(${typeColor[0]},${typeColor[1]},${typeColor[2]},0.8)`)
        g.addColorStop(1, `rgba(${Math.floor(typeColor[0]*0.6)},${Math.floor(typeColor[1]*0.6)},${Math.floor(typeColor[2]*0.6)},0.65)`)
        ctx.fillStyle = g
        ctx.strokeStyle = `rgba(${typeColor[0]+50},${typeColor[1]+50},${typeColor[2]+50},0.5)`
        ctx.lineWidth = 1.2
      }

      this._roundRect(ctx, 0, 0, btnSize, btnSize, 5)
      ctx.fill()
      ctx.stroke()

      // CD遮罩扇形（从12点顺时针）
      if (onCD && sk.cd > 0 && cdRemaining > 0) {
        const cdRatio = Math.min(1, cdRemaining / sk.cd)
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.beginPath()
        ctx.moveTo(btnSize/2, btnSize/2)
        ctx.arc(btnSize/2, btnSize/2, btnSize * 0.48, -Math.PI / 2, -Math.PI / 2 + cdRatio * Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        // CD倒计时文字
        const cdSec = Math.ceil(cdRemaining / 1000)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${Math.max(9, 10 * dpr)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${cdSec}`, btnSize/2, btnSize/2)
      } else {
        // 技能名称（缩短显示）
        ctx.fillStyle = !unlocked ? '#556' : (!canAfford ? '#e88' : '#eef')
        ctx.font = `${Math.max(8, 9 * dpr)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const displayName = sk.name.length > 3 ? sk.name.slice(0, 3) : sk.name
        ctx.fillText(displayName, btnSize/2, btnSize/2)

        // MP消耗角标
        if (mpCost > 0 && unlocked) {
          const badgeR = Math.min(7, btnSize * 0.22)
          const badgeX = btnSize - badgeR - 1
          const badgeY = badgeR + 1
          ctx.beginPath()
          ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2)
          ctx.fillStyle = canAfford ? 'rgba(60,120,220,0.85)' : 'rgba(200,60,60,0.85)'
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = `bold ${Math.max(6, 7 * dpr)}px sans-serif`
          ctx.fillText(`${mpCost}`, badgeX, badgeY)
        }
      }

      // 锁定标记（未解锁）
      if (!unlocked) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.font = `bold ${Math.max(10, 11 * dpr)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`🔒${sk.unlockLevel}级`, btnSize/2, btnSize/2)
      }

      ctx.restore()

      // 记录按钮位置供点击检测
      this._skillBarButtons.push({
        skillIdx: i,
        skillId: sk.id,
        charIndex: this.selectedCharIndex,
        x: bx, y: btnY, w: btnSize, h: btnSize,
        disabled,
        onCD,
        canAfford,
        unlocked,
      })
    }

    ctx.restore()
  }

  _renderTacticsBar(ctx, x, y, w, h) {
    const dpr = this.dpr
    ctx.save()

    // 背景渐变（深色半透明，略带金属感）
    const grad = ctx.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, 'rgba(20,28,42,0.95)')
    grad.addColorStop(1, 'rgba(14,20,32,0.98)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)

    // 顶部发光分隔线
    ctx.strokeStyle = 'rgba(80,140,220,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()

    // 底部分隔线
    ctx.strokeStyle = 'rgba(60,80,120,0.3)'
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke()

    // 战斗按钮定义
    // AI自动攻击状态：取第一个存活角色的状态作为全局显示
    const aliveChar = this.party.find(c => !c.isDead)
    const aiGlobalOn = aliveChar ? !!aliveChar.autoAttackEnabled : false

    const buttons = [
      {
        id: 'auto_attack',
        label: aiGlobalOn ? 'AI:开' : 'AI:关',
        icon: '🤖',
        active: aiGlobalOn,
        desc: aiGlobalOn ? 'AI自动战斗中（点击关闭）' : '开启AI自动战斗'
      },
      {
        id: 'target_nearest',
        label: '最近目标',
        icon: '🎯',
        active: this.battleTactics.targetPriority === 'nearest',
        desc: '优先攻击最近的敌人'
      },
      {
        id: 'target_lowestHp',
        label: '残血优先',
        icon: '🩸',
        active: this.battleTactics.targetPriority === 'lowestHp',
        desc: '优先攻击HP最低的敌人'
      },
      {
        id: 'target_ranged',
        label: '先打远程',
        icon: '🏹',
        active: this.battleTactics.targetPriority === 'ranged',
        desc: '优先攻击远程怪物'
      },
      {
        id: 'hold_position',
        label: '坚守位置',
        icon: '🛡️',
        active: !!this.battleTactics.holdPosition,
        desc: '角色不自动移动'
      },
    ]

    const btnCount = buttons.length
    const btnGap = Math.max(4, 6 * dpr)
    const btnH = Math.max(h * 0.62, 30)
    const btnW = Math.min((w - (btnCount + 1) * btnGap) / btnCount, 90 * dpr)
    const totalW = btnCount * btnW + (btnCount - 1) * btnGap
    const startX = x + (w - totalW) / 2
    const btnY = y + (h - btnH) / 2

    this._tacticButtons = [] // 存储按钮位置用于点击检测

    for (let i = 0; i < btnCount; i++) {
      const btn = buttons[i]
      const bx = startX + i * (btnW + btnGap)

      // 按钮背景
      if (btn.disabled) {
        ctx.fillStyle = 'rgba(40,46,56,0.7)'
      } else if (btn.active) {
        // 激活态：渐变高亮
        const bGrad = ctx.createLinearGradient(bx, btnY, bx, btnY + btnH)
        bGrad.addColorStop(0, 'rgba(59,130,246,0.8)')
        bGrad.addColorStop(1, 'rgba(37,99,235,0.75)')
        ctx.fillStyle = bGrad
      } else {
        ctx.fillStyle = 'rgba(45,52,64,0.85)'
      }

      this._roundRect(ctx, bx, btnY, btnW, btnH, 6)
      ctx.fill()

      // 边框
      if (btn.active && !btn.disabled) {
        ctx.strokeStyle = 'rgba(96,165,250,0.8)'
        ctx.lineWidth = 1.5
        this._roundRect(ctx, bx, btnY, btnW, btnH, 6)
        ctx.stroke()
      } else if (!btn.disabled) {
        ctx.strokeStyle = 'rgba(70,80,100,0.5)'
        ctx.lineWidth = 0.8
        this._roundRect(ctx, bx, btnY, btnW, btnH, 6)
        ctx.stroke()
      }

      // 图标
      ctx.font = `${Math.max(12, 13 * dpr)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = btn.disabled ? 0.35 : (btn.active ? 1 : 0.7)
      ctx.fillText(btn.icon, bx + btnW / 2, btnY + btnH * 0.35)

      // 文字
      ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
      ctx.fillStyle = btn.active ? '#e2e8f0' : (btn.disabled ? '#555' : '#94a3b8')
      ctx.fillText(btn.label, bx + btnW / 2, btnY + btnH * 0.72)
      ctx.globalAlpha = 1

      this._tacticButtons.push({ ...btn, x: bx, y: btnY, w: btnW, h: btnH })
    }

    ctx.restore()
  }

  _renderEquipInventory(ctx, x, y, w, h) {
    const dpr = this.dpr
    // 每60帧输出一次inventory状态（避免刷屏）
    if (Math.random() < 0.02) {
      console.log(`[Tower] 渲染背包: inventory=[${this.inventory.map(i=>i?.name||'空').join(',')}] (${this.inventory.length}/${this.maxInventorySize})`)
    }
    ctx.save()

    // 背景
    const grad = ctx.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, 'rgba(16,22,34,0.97)')
    grad.addColorStop(1, 'rgba(10,15,24,0.99)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)

    // 分割线：左侧装备区 | 右侧角色区
    const splitX = w * 0.58
    ctx.strokeStyle = 'rgba(60,80,120,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(splitX, y + 6); ctx.lineTo(splitX, y + h - 6); ctx.stroke()

    // ========== 左侧：装备背包（加大字号+图标） ==========
    const invPadding = Math.max(8, 10 * dpr)
    const slotSize = Math.min((splitX - invPadding * 3) / 4, Math.max(52, 58 * dpr))   // 槽位加大
    const invLabelY = y + Math.max(18, 20 * dpr)

    // 标题 "临时背包"
    ctx.fillStyle = '#889ab8'
    ctx.font = `bold ${Math.max(13, 14 * dpr)}px sans-serif`   // 标题加大
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`🎒 临时背包 (${this.inventory.length}/${this.maxInventorySize})`, x + invPadding, invLabelY)

    // 装备槽位网格（2行 × 4列）
    const gridStartY = invLabelY + Math.max(16, 18 * dpr)       // 标题间距加大
    this._inventorySlots = []

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const idx = row * 4 + col
        const sx = x + invPadding + col * (slotSize + 6)
        const sy = gridStartY + row * (slotSize + 6)

        // 槽位背景
        const item = this.inventory[idx]
        if (item) {
          // 有装备：品质色背景
          const qColors = { common: '#374151', uncommon: '#1e3a5f', rare: '#3b2d5f', epic: '#4a1942', legendary: '#5c3d00' }
          ctx.fillStyle = qColors[item.quality] || '#374151'
          // 品质边框光效
          const qc = item.quality === 'legendary' ? '#fbbf24' :
                     item.quality === 'epic' ? '#a855f7' :
                     item.quality === 'rare' ? '#3b82f6' : '#6b7280'
          ctx.strokeStyle = qc
          ctx.lineWidth = 1.5
        } else {
          ctx.fillStyle = 'rgba(30,38,52,0.85)'
          ctx.strokeStyle = 'rgba(60,72,92,0.4)'
          ctx.lineWidth = 1
        }
        this._roundRect(ctx, sx, sy, slotSize, slotSize, 5)
        ctx.fill()
        ctx.stroke()

        // 待卖选中高亮（橙色闪烁边框）
        if (item && this._sellTargetIndex === idx) {
          ctx.strokeStyle = 'rgba(255,160,0,0.85)'
          ctx.lineWidth = 2.5
          this._roundRect(ctx, sx - 1.5, sy - 1.5, slotSize + 3, slotSize + 3, 6)
          ctx.stroke()
          // 小标记
          ctx.fillStyle = '#ffa500'
          ctx.font = `bold ${Math.max(10, 11 * dpr)}px sans-serif`   // 9→11
          ctx.textAlign = 'right'
          ctx.textBaseline = 'top'
          ctx.fillText('卖', sx + slotSize - 2, sy + 2)
        }

        if (item) {
          // 装备图标（加大）
          const slotIcon = { weapon: '\u2694', armor: '\u{1F6E1}', accessory: '\u{1F48E}' }
          ctx.font = `bold ${Math.max(22, 26 * dpr)}px sans-serif`   // 图标加大 20→26
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(slotIcon[item.slot] || '?', sx + slotSize / 2, sy + slotSize * 0.42)

          // 等级文字（加大）
          ctx.font = `bold ${Math.max(10, 11 * dpr)}px sans-serif`   // 等级 9→11
          ctx.fillStyle = '#b0c0d4'
          ctx.fillText(`Lv${item.level || 1}`, sx + slotSize / 2, sy + slotSize * 0.78)
        } else {
          // 空槽：加号提示（加大）
          ctx.fillStyle = 'rgba(80,96,120,0.35)'
          ctx.font = `bold ${Math.max(20, 24 * dpr)}px sans-serif`   // 加号 18→24
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('+', sx + slotSize / 2, sy + slotSize / 2)
        }

        this._inventorySlots.push({ idx, x: sx, y: sy, size: slotSize, item })
      }
    }

    // ===== 底部按钮行：出售 | 金币 | 合成 =====
    const btnRowY = y + h - Math.max(h * 0.13, 30) - 6
    const btnRowH = Math.max(h * 0.13, 30)
    const totalBtnW = splitX - invPadding * 2
    // 三等分：卖出 | 金币 | 合成
    const btnGap = 4
    const singleBtnW = (totalBtnW - btnGap * 2) / 3

    // 出售按钮（显示选中状态）
    const hasSellTarget = this._sellTargetIndex >= 0 && this._sellTargetIndex < this.inventory.length
    ctx.fillStyle = hasSellTarget ? 'rgba(180,80,50,0.88)' : 'rgba(120,70,50,0.75)'
    this._roundRect(ctx, x + invPadding, btnRowY, singleBtnW, btnRowH, 5)
    ctx.fill()
    ctx.strokeStyle = hasSellTarget ? 'rgba(255,160,80,0.8)' : 'rgba(220,140,80,0.5)'
    ctx.stroke()
    // 如果有选中装备，显示"卖出: xxx"
    const sellLabel = hasSellTarget ? `💰卖${this.inventory[this._sellTargetIndex].name}` : '💰 卖出'
    ctx.fillStyle = hasSellTarget ? '#ffd700' : '#f0c080'
    ctx.font = `bold ${Math.max(11, 12 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(sellLabel, x + invPadding + singleBtnW / 2, btnRowY + btnRowH / 2)
    this._sellButton = { x: x + invPadding, y: btnRowY, w: singleBtnW, h: btnRowH }

    // 金币显示
    const goldX = x + invPadding + singleBtnW + btnGap
    ctx.fillStyle = 'rgba(30,38,52,0.9)'
    this._roundRect(ctx, goldX, btnRowY, singleBtnW, btnRowH, 5)
    ctx.fill()
    ctx.fillStyle = '#f1c40f'
    ctx.font = `bold ${Math.max(13, 14 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`💰 ${this.gold}`, goldX + singleBtnW / 2, btnRowY + btnRowH / 2)

    // 合成按钮（三等分，足够宽）
    const synthCost = 50
    const synthBtnX = goldX + singleBtnW + btnGap
    const synthBtnW = singleBtnW
    const canSynth = this.gold >= synthCost && this.inventory.length >= 2
    ctx.fillStyle = canSynth ? 'rgba(55,40,90,0.85)' : 'rgba(35,32,48,0.7)'
    this._roundRect(ctx, synthBtnX, btnRowY, synthBtnW, btnRowH, 5)
    ctx.fill()
    ctx.strokeStyle = canSynth ? 'rgba(168,85,247,0.7)' : 'rgba(100,80,130,0.3)'
    ctx.stroke()
    ctx.fillStyle = canSynth ? '#c9a0ff' : '#666'
    ctx.font = `bold ${Math.max(12, 13 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`⚗️合成-${synthCost}`, synthBtnX + synthBtnW / 2, btnRowY + btnRowH / 2)
    this._synthButton = { x: synthBtnX, y: btnRowY, w: synthBtnW, h: btnRowH }
    this._synthCost = synthCost

    // ========== 右侧：角色卡片（单卡片 + 切换） ==========
    const charAreaX = splitX + 8
    const charAreaW = w - splitX - 8

    if (this.selectedCharIndex < 0) this.selectedCharIndex = 0
    const idx = this.selectedCharIndex < this.party.length ? this.selectedCharIndex : 0
    const c = this.party[idx]

    // 标题行：角色名 + 页码
    const labelY = y + Math.max(14, 16 * dpr)
    ctx.font = `bold ${Math.max(11, 12 * dpr)}px sans-serif`
    ctx.textAlign = 'left'
    ctx.fillStyle = c.isDead ? '#666' : '#c8dce8'
    ctx.fillText(c.name, charAreaX, labelY)

    const pageText = `${idx + 1}/${this.party.length}`
    ctx.textAlign = 'right'
    ctx.fillStyle = '#5a6a80'
    ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
    ctx.fillText(pageText, charAreaX + charAreaW, labelY)

    // ===== 单角色大卡片 =====
    const charCardH = Math.min(h - 52, 140 * dpr)   // 增大高度以容纳3条状态栏
    const cardX = charAreaX
    const cardY = labelY + Math.max(10, 12 * dpr)

    // 卡片背景（玻璃质感）
    const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + charCardH)
    bgGrad.addColorStop(0, c.isDead ? 'rgba(35,30,30,0.92)' : 'rgba(28,42,58,0.88)')
    bgGrad.addColorStop(1, c.isDead ? 'rgba(25,22,22,0.96)' : 'rgba(18,28,40,0.95)')
    ctx.fillStyle = bgGrad
    this._roundRect(ctx, cardX, cardY, charAreaW, charCardH, 10)
    ctx.fill()
    ctx.strokeStyle = c.isDead ? 'rgba(90,70,70,0.35)' : 'rgba(60,140,160,0.35)'
    ctx.lineWidth = 1
    this._roundRect(ctx, cardX, cardY, charAreaW, charCardH, 10)
    ctx.stroke()

    // ===== 左区：Idle头像 =====
    const avatarSize = Math.min(charCardH - 12, 68 * dpr)
    const avatarX = cardX + 8
    const avatarY = cardY + (charCardH - avatarSize) / 2

    // 绘制圆形裁剪的头像
    ctx.save()
    ctx.beginPath()
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
    ctx.clip()

    // 用idle第一帧做头像
    let avatarKey = null
    if (c.name.includes('臻宝') || c.name === '臻宝') {
      avatarKey = 'HERO_ZHENBAO_IDLE_01'
    } else if (c.name.includes('李') || c.name.includes('小宝')) {
      avatarKey = 'HERO_LIXIAOBAO_IDLE_0'
    }
    const avatarImg = avatarKey ? this.assets.get(avatarKey) : null
    if (avatarImg && avatarImg.width > 0 && avatarImg.height > 0) {
      ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize)
    } else {
      // fallback：渐变色块+首字母
      const abGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize)
      abGrad.addColorStop(0, c.role === 'mage' ? '#4a3f9e' : '#9a6a32')
      abGrad.addColorStop(1, c.role === 'mage' ? '#2d2558' : '#6a4520')
      ctx.fillStyle = abGrad
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize)
      ctx.font = `bold ${Math.max(20, avatarSize * 0.38)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = c.isDead ? '#555' : '#e8f0f8'
      ctx.fillText(c.name.charAt(0), avatarX + avatarSize / 2, avatarY + avatarSize / 2)
    }
    ctx.restore()

    // 头像边框光圈
    ctx.beginPath()
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2)
    ctx.strokeStyle = c.isDead ? '#555' : (c.role === 'mage' ? '#7c8ce8' : '#e8a84c')
    ctx.lineWidth = 2
    ctx.stroke()

    // ===== 头像死亡状态：暗色遮罩 + 复活倒计时 + 进度条 =====
    if (c.isDead && c.respawnTimer > 0) {
      const cx = avatarX + avatarSize / 2
      const cy = avatarY + avatarSize / 2

      // 半透明暗色遮罩
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = 'rgba(0,0,0,0.68)'
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize)

      // 死亡图标（骷髅💀）
      ctx.font = `bold ${Math.max(22, avatarSize * 0.4)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('☠', cx, cy - avatarSize * 0.08)

      // 复活倒计时文字
      const sec = Math.ceil(c.respawnTimer / 1000)
      const timerFont = Math.max(12, avatarSize * 0.26)
      ctx.font = `bold ${timerFont}px sans-serif`
      // 倒计时闪烁效果（最后3秒变红闪烁）
      const flashAlpha = sec <= 3 ? (0.6 + 0.4 * Math.sin(Date.now() / 200)) : 1
      ctx.globalAlpha = flashAlpha
      ctx.fillStyle = sec <= 3 ? '#ff4444' : '#58a6ff'
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 8
      ctx.fillText(`${sec}s`, cx, cy + avatarSize * 0.32)

      ctx.restore()

      // 底部复活进度条（头像下方）
      const respawnTime = (RESPAWN_TABLE[c.level] || c.level * 2) * (1 - (this._respawnBoost || 0))
      const ratio = 1 - c.respawnTimer / (respawnTime * 1000)
      const barW = avatarSize + 4
      const barH = 5
      const barX = avatarX - 2
      const barY = avatarY + avatarSize + 3
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      this._roundRect(ctx, barX, barY, barW, barH, 3)
      ctx.fill()
      ctx.fillStyle = ratio > 0.95 ? '#4ade80' : '#58a6ff'
      this._roundRect(ctx, barX, barY, Math.max(barH, barW * ratio), barH, 3)
      ctx.fill()
    }

    // ===== 右区：信息 + 装备槽 =====
    const infoX = avatarX + avatarSize + 12
    const infoW = charAreaW - (infoX - cardX) - 44  // 留出切换按钮空间
    const infoTop = cardY + 6

    // 名称行
    ctx.font = `bold ${Math.max(13, 14 * dpr)}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = c.isDead ? '#555' : '#eef4fa'
    ctx.fillText(c.name, infoX, infoTop)

    // 等级+职业
    ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
    const roleLabel = c.role === 'mage' ? '法师' : '战士'
    const roleColor = c.role === 'mage' ? '#93b4f5' : '#f5c563'
    ctx.fillStyle = c.isDead ? '#444' : roleColor
    ctx.fillText(`Lv${c.level}  ${roleLabel}`, infoX, infoTop + 57)

    // ===== 三个装备槽位（紧凑） =====
    const slotKeys = ['weapon', 'armor', 'accessory']
    const slotIcons = { weapon: '\u2694', armor: '\u{1F6E1}', accessory: '\u{1F48E}' }
    const slotW = (infoW - 8) / 3
    const slotH = Math.max(28, 26 * dpr)     // 缩小槽高，给状态条腾空间
    const slotStartY = infoTop + 100           // 更靠近名称
    this._charEquipSlots = []

    for (let si = 0; si < 3; si++) {
      const sk = slotKeys[si]
      const sx = infoX + si * (slotW + 4)
      const sy = slotStartY
      const eqItem = c.equippedItems[sk]

      // 槽位背景
      if (eqItem) {
        const qBg = { common: '#2a3040', uncommon: '#1a2a45', rare: '#2a2050', epic: '#3a1540', legendary: '#4a3000' }
        ctx.fillStyle = qBg[eqItem.quality] || '#2a3040'
        const qBorder = { common: '#555', uncommon: '#4a90c8', rare: '#7c5cf0', epic: '#c050d0', legendary: '#e8a000' }
        ctx.strokeStyle = qBorder[eqItem.quality] || '#555'
        ctx.lineWidth = 1.5
      } else {
        ctx.fillStyle = 'rgba(24,32,44,0.75)'
        ctx.strokeStyle = 'rgba(60,76,100,0.3)'
        ctx.lineWidth = 1
      }
      this._roundRect(ctx, sx, sy, slotW, slotH, 4)
      ctx.fill()
      ctx.stroke()

      if (eqItem) {
        // 已装备：图标 + 等级
        ctx.font = `bold ${Math.max(13, 14 * dpr)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = eqItem.quality === 'legendary' ? '#fbbf24' :
                        eqItem.quality === 'epic' ? '#d8a0ff' : '#c8dae8'
        ctx.fillText(slotIcons[sk], sx + slotW / 2, sy + slotH * 0.42)
        ctx.font = `bold ${Math.max(7, 7 * dpr)}px sans-serif`
        ctx.fillStyle = '#9ab'
        ctx.fillText(`L${eqItem.level || 1}`, sx + slotW / 2, sy + slotH * 0.78)
      } else {
        // 空槽：只显示大+号
        ctx.fillStyle = 'rgba(70,90,115,0.4)'
        ctx.font = `bold ${Math.max(16, 18 * dpr)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('+', sx + slotW / 2, sy + slotH / 2)
      }

      // 存储点击区域
      this._charEquipSlots.push({ charIdx: idx, slot: sk, x: sx, y: sy, w: slotW, h: slotH })
    }

    // ===== 三条状态栏：HP(红) / MP(蓝) / EXP(白) 分开排列 =====
    const barX = infoX
    const barStartY = slotStartY + slotH + 10   // 装备栏下方留间距
    const barW = infoW
    const barH = 9              // 条高度加大
    const barGap = 26            // 条之间明显间距

    let cursorY = barStartY

    // ---- HP 红色血条 ----
    {
      const displayHp = isFinite(c.currentHp) ? Math.floor(c.currentHp) : 0
      const displayMaxHp = isFinite(c.maxHp) ? Math.floor(c.maxHp) : 100
      const hpRatio = displayMaxHp > 0 ? Math.max(0, displayHp / displayMaxHp) : 0
      // 背景
      ctx.fillStyle = 'rgba(40,20,20,0.50)'
      this._roundRect(ctx, barX, cursorY, barW, barH, 3)
      ctx.fill()
      // 前景（红色系）
      if (hpRatio > 0) {
        const hpColor = hpRatio > 0.5 ? '#e74c3c' : hpRatio > 0.25 ? '#e67e22' : '#c0392b'
        ctx.fillStyle = hpColor
        this._roundRect(ctx, barX, cursorY, Math.max(barH * 0.5, barW * hpRatio), barH, 3)
        ctx.fill()
      }
      // 数值文字（条右侧外部）
      ctx.font = `bold ${Math.max(8, 9 * dpr)}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = hpRatio > 0.5 ? '#ff6b6b' : '#ffa07a'
      ctx.fillText(`HP  ${displayHp} / ${displayMaxHp}`, barX + 2, cursorY + barH + 2)
    }
    cursorY += barH + barGap

    // ---- MP 蓝色蓝条 ----
    {
      const maxMp = c.maxMp || 30
      const curMp = Math.floor(c.currentMp || 0)
      const mpRatio = maxMp > 0 ? Math.max(0, curMp / maxMp) : 0
      ctx.fillStyle = 'rgba(15,25,45,0.48)'
      this._roundRect(ctx, barX, cursorY, barW, barH, 3)
      ctx.fill()
      if (mpRatio > 0) {
        ctx.fillStyle = '#3498db'
        this._roundRect(ctx, barX, cursorY, Math.max(barH * 0.5, barW * mpRatio), barH, 3)
        ctx.fill()
      }
      ctx.font = `bold ${Math.max(8, 9 * dpr)}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#74b9ff'
      ctx.fillText(`MP  ${curMp} / ${maxMp}`, barX + 2, cursorY + barH + 2)
    }
    cursorY += barH + barGap

    // ---- EXP 白色经验条 ----
    {
      const curExp = c.totalExp || 0
      const nextExp = EXP_TABLE[c.level + 1] || EXP_TABLE[EXP_TABLE.length - 1]
      const prevExp = EXP_TABLE[c.level] || 0
      const needed = nextExp - prevExp
      const gained = Math.max(0, curExp - prevExp)
      const expRatio = needed > 0 ? Math.min(1, gained / needed) : 0
      // 暗背景
      ctx.fillStyle = 'rgba(30,28,35,0.40)'
      this._roundRect(ctx, barX, cursorY, barW, barH, 3)
      ctx.fill()
      // 白/灰前景
      if (expRatio > 0) {
        const expGrad = ctx.createLinearGradient(barX, cursorY, barX + barW * expRatio, cursorY)
        expGrad.addColorStop(0, 'rgba(200,195,210,0.85)')
        expGrad.addColorStop(1, 'rgba(220,218,228,0.95)')
        ctx.fillStyle = expGrad
        this._roundRect(ctx, barX, cursorY, Math.max(barH * 0.5, barW * expRatio), barH, 3)
        ctx.fill()
      }
      // 数值
      ctx.font = `bold ${Math.max(8, 9 * dpr)}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#b8b4c4'
      ctx.fillText(`EXP  ${gained} / ${needed}`, barX + 2, cursorY + barH + 2)
    }

    ctx.textBaseline = 'bottom'

    // ===== 底部角色属性栏（攻击 / 防御 / 速度） =====
    const attrY = cursorY + barH + 40   // EXP条下方间距
    if (attrY + 16 < cardY + charCardH - 6) {    // 确保不超出卡片底部
      const attrFont = `bold ${Math.max(7.5, 8 * dpr)}px sans-serif`
      ctx.font = attrFont
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      // 三列属性，等宽分布（攻击力走_getEffectiveAtk，显示buff加成）
      const colW = infoW / 3
      const effectiveAtk = this._getEffectiveAtk(c)
      const atkBonus = effectiveAtk - (c.atk || 0)
      const attrs = [
        { label: '攻击', value: effectiveAtk, bonus: atkBonus, color: '#f5a062', icon: '\u2694' },
        { label: '防御', value: c.def || 0, color: '#62b4f5', icon: '\u{1F6E1}' },
        { label: '速度', value: c.spd || 0, color: '#9bf58a', icon: '\u231B' },
      ]
      for (let ai = 0; ai < 3; ai++) {
        const ax = barX + ai * colW
        const a = attrs[ai]
        // 标签
        ctx.fillStyle = 'rgba(160,175,195,0.55)'
        ctx.fillText(a.label, ax, attrY)
        // 数值（加粗高亮）
        ctx.font = `bold ${Math.max(8, 9 * dpr)}px sans-serif`
        // 有buff加成时：显示 "基础(+增量)" 格式，增量用更亮的颜色
        if (a.bonus && a.bonus > 0) {
          const baseText = `${a.value - a.bonus}`
          const bonusText = `(+${a.bonus})`
          ctx.fillStyle = a.color
          ctx.fillText(baseText, ax + ctx.measureText(a.label).width + 3, attrY)
          const baseW = ctx.measureText(baseText).width
          ctx.fillStyle = '#4ade80'
          ctx.fillText(bonusText, ax + ctx.measureText(a.label).width + 3 + baseW + 2, attrY)
          // 小箭头↑提示
          ctx.font = `${Math.max(7, 8 * dpr)}px sans-serif`
          ctx.fillText('↑', ax + ctx.measureText(a.label).width + 3 + baseW + ctx.measureText(bonusText).width + 3, attrY - 1)
        } else {
          ctx.fillStyle = a.color
          ctx.fillText(`${a.value}`, ax + ctx.measureText(a.label).width + 3, attrY)
        }
        ctx.font = attrFont
      }
    }

    // ===== 左右切换按钮（卡片右侧边缘） =====
    const btnSize = Math.min(26, charCardH * 0.3)
    const btnCY = cardY + charCardH / 2
    const leftBtnX = cardX + charAreaW - btnSize * 2 - 6
    const rightBtnX = cardX + charAreaW - btnSize - 4

    ;[{ dir: -1, bx: leftBtnX, enabled: idx > 0 },
      { dir: 1, bx: rightBtnX, enabled: idx < this.party.length - 1 }].forEach(b => {
      ctx.fillStyle = b.enabled ? 'rgba(50,130,180,0.6)' : 'rgba(40,52,68,0.35)'
      this._roundRect(ctx, b.bx, btnCY - btnSize / 2, btnSize, btnSize, 5)
      ctx.fill()
      if (b.enabled) { ctx.strokeStyle = 'rgba(100,180,230,0.4)'; ctx.lineWidth = 0.8; this._roundRect(ctx, b.bx, btnCY - btnSize / 2, btnSize, btnSize, 5); ctx.stroke() }
      ctx.font = `bold ${Math.max(11, 12 * dpr)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = b.enabled ? '#c0e0ff' : '#445'
      ctx.fillText(b.dir < 0 ? '\u25C0' : '\u25B6', b.bx + btnSize / 2, btnCY)
    })

    this._charSwitchBtns = [
      { dir: -1, x: leftBtnX, y: btnCY - btnSize / 2, w: btnSize, h: btnSize },
      { dir: 1, x: rightBtnX, y: btnCY - btnSize / 2, w: btnSize, h: btnSize },
    ]
    this._charCards = []  // 不再用，保留兼容

    ctx.restore()
  }

  // ==================== 底部面板交互 ====================

  /** 技能栏按钮点击：手动释放选中角色的技能 */
  _onSkillBarTap(btn) {
    const char = this.party[btn.charIndex]
    if (!char || char.isDead) return
    const sk = char.skills[btn.skillIdx]
    if (!sk) return

    // 扣除MP并施放
    const mpCost = sk.mpCost || 0
    if ((char.currentMp || 0) < mpCost) return  // MP不足（理论上disabled状态不会触发）
    char.currentMp -= mpCost

    console.log(`[Tower] 🎮 手动释放技能: ${char.name} -> ${sk.name} (idx=${btn.skillIdx})`)
    this._castSkill(char, btn.skillIdx)
  }

  _onTacticButtonTap(btnId) {
    const t = this.battleTactics
    switch (btnId) {
      case 'auto_attack': {
        // 全局切换所有角色的AI自动攻击状态
        const newState = !this.party.some(c => !c.isDead && c.autoAttackEnabled)
        for (const c of this.party) {
          if (!c.isDead) c.autoAttackEnabled = newState
        }
        console.log(`[Tower] AI自动攻击 ${newState ? '已开启' : '已关闭'}`)
        break
      }
      case 'target_nearest':
        t.targetPriority = t.targetPriority === 'nearest' ? 'nearest' : 'nearest' // 总是设为最近
        t.targetPriority = 'nearest'
        break
      case 'target_lowestHp':
        t.targetPriority = t.targetPriority === 'lowestHp' ? 'nearest' : 'lowestHp'
        break
      case 'target_ranged':
        t.targetPriority = t.targetPriority === 'ranged' ? 'nearest' : 'ranged'
        break
      case 'hold_position':
        t.holdPosition = !t.holdPosition
        // 切换坚守时，停止所有角色移动
        if (t.holdPosition) {
          for (const c of this.party) { c.targetX = c.x; c.targetY = c.y }
        }
        break
      // focus_crystal 已移除（虫洞机制替代水晶攻击）
    }
  }

  _onInventorySlotTap(slot) {
    const item = slot.item
    if (!item) return

    const now = Date.now()
    const last = this._lastTapSlot

    // 判定双击：同一格 + 时间窗口内
    if (last && last.idx === slot.idx && (now - last.time) < this._DOUBLE_TAP_MS) {
      // === 双击：穿戴到当前选中角色 ===
      this._lastTapSlot = null  // 重置
      this._equipToSelectedChar(item, slot.idx)
      return
    }

    // === 单击：显示装备属性 + 标记为待卖选中（不穿戴） ===
    this._lastTapSlot = { idx: slot.idx, time: now }
    this._sellTargetIndex = slot.idx  // 选中此格，点"卖出"时卖这件

    // 在该格位置上方弹出属性浮窗
    const tipX = slot.x + slot.size / 2
    const tipY = slot.y - 8
    this._hoveredItem = { item, x: tipX, y: tipY, source: 'inventory' }
    // 浮窗自动持续2秒后消失
    this._tooltipTimer = setTimeout(() => {
      if (this._hoveredItem?.item === item) {
        this._hoveredItem = null
      }
    }, 2000)
  }

  /** 直接将背包中的装备穿戴到 selectedCharIndex 对应的角色 */
  _equipToSelectedChar(item, invIdx) {
    if (!item || invIdx === undefined || invIdx < 0) return
    const idx = this.selectedCharIndex >= 0 ? this.selectedCharIndex : 0
    const c = this.party[idx]
    if (!c || c.isDead) return

    const slotKey = item.slot || 'accessory'

    // 检查该槽位是否已有装备，有则先卸下回背包（满则提示）
    const oldItem = c.equippedItems[slotKey]
    if (oldItem && this.inventory.length >= this.maxInventorySize) {
      this._addFloatingText(this.width / 2, this.height * 0.55, `❌ ${c.name}的${slotKey}槽位有装备，但背包已满！`, '#f87171')
      return
    }
    // 卸下旧装备回背包
    if (oldItem) { this.inventory.push({ ...oldItem }) }

    // 从背包移除新装备
    this.inventory.splice(invIdx, 1)

    // 退还旧属性 + 应用新属性
    if (oldItem) {
      if (oldItem.bonusHp) { c.maxHp -= oldItem.bonusHp; c.currentHp = Math.max(1, c.currentHp - oldItem.bonusHp) }
      if (oldItem.bonusAtk) c.atk -= oldItem.bonusAtk
      if (oldItem.bonusMatk) c.matk = Math.max(0, (c.matk || 0) - oldItem.bonusMatk)
      if (oldItem.bonusDef) c.def = Math.max(0, (c.def || 5) - oldItem.bonusDef)
      if (oldItem.bonusSpd) c.spd = Math.max(0, c.spd - oldItem.bonusSpd)
      if (oldItem.bonusCrit) c.critChance = Math.max(0, (c.critChance || 0) - oldItem.bonusCrit)
      if (oldItem.bonusLifesteal) c.lifesteal = Math.max(0, (c.lifesteal || 0) - oldItem.bonusLifesteal)
      if (oldItem.bonusMpRegen) c.mpRegen = Math.max(0, (c.mpRegen || 0) - oldItem.bonusMpRegen)
      if (oldItem.bonusHpRegen) c.hpRegen = Math.max(0, (c.hpRegen || 0) - oldItem.bonusHpRegen)
      if (oldItem.bonusCdr) c.cdr = Math.max(0, (c.cdr || 0) - oldItem.bonusCdr)
    }

    // 装上新装备
    c.equippedItems[slotKey] = item
    if (item.bonusHp) { c.maxHp += item.bonusHp; c.currentHp += item.bonusHp }
    if (item.bonusAtk) c.atk += item.bonusAtk
    if (item.bonusMatk) c.matk = (c.matk || 0) + item.bonusMatk
    if (item.bonusDef) c.def = (c.def || 5) + item.bonusDef
    if (item.bonusSpd) c.spd += item.bonusSpd
    if (item.bonusCrit) c.critChance = (c.critChance || 0) + item.bonusCrit
    if (item.bonusLifesteal) c.lifesteal = (c.lifesteal || 0) + item.bonusLifesteal
    if (item.bonusMpRegen) c.mpRegen = (c.mpRegen || 0) + item.bonusMpRegen
    if (item.bonusHpRegen) c.hpRegen = (c.hpRegen || 0) + item.bonusHpRegen
    if (item.bonusCdr) c.cdr = (c.cdr || 0) + item.bonusCdr
    // 重新计算移动速度
    c.moveSpeed = 120 + (c.spd || 10) * 5

    // 浮动提示
    const bonusTexts = this._getEquipBonusTexts(item)
    this._addFloatingText(c.x, c.y - 200, `✨ ${c.name} 穿上 ${item.name}\n${bonusTexts.join(' ')}`, '#ffd700', 2.0)

    // 粒子特效
    const color = QUALITY_COLORS[item.quality] || '#fff'
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2
      this.particles.push({
        x: c.x, y: c.y - 100,
        vx: Math.cos(angle) * 50, vy: Math.sin(angle) * 50 - 30,
        size: 3 + Math.random() * 3, color, life: 1, decay: 2.0,
      })
    }
  }

  /** 点击角色装备槽 → 卸下装备回背包 */
  _onCharEquipSlotTap(slot) {
    const c = this.party[slot.charIdx]
    if (!c || c.isDead) return
    const item = c.equippedItems[slot.slot]
    if (!item) return

    // 背包满则提示
    if (this.inventory.length >= this.maxInventorySize) {
      this._addFloatingText(this.width / 2, this.height * 0.55, `❌ 背包已满，无法卸下!`, '#f87171')
      return
    }

    // 卸下：退还属性
    if (item.bonusHp) { c.maxHp -= item.bonusHp; c.currentHp = Math.max(1, c.currentHp - item.bonusHp) }
    if (item.bonusAtk) c.atk -= item.bonusAtk
    if (item.bonusDef) c.def = Math.max(0, (c.def || 5) - item.bonusDef)
    if (item.bonusSpd) c.spd = Math.max(0, c.spd - item.bonusSpd)

    // 清空槽位，放入背包
    c.equippedItems[slot.slot] = null
    this.inventory.push({ ...item })

    this._addFloatingText(c.x, c.y - 200, `📤 ${c.name} 卸下了 ${item.name}`, '#94a3b8')
  }

  /** 出售用户选中的背包装备（需先点击选中） */
  _sellSelectedInventoryItem() {
    if (this.inventory.length === 0) {
      this._addFloatingText(this.width / 2, this.height * 0.55, '❌ 背包没有可卖的装备', '#f87171')
      return
    }

    // 检查是否有用户选中的待售装备
    const targetIdx = this._sellTargetIndex
    if (targetIdx === undefined || targetIdx < 0 || !this.inventory[targetIdx]) {
      this._addFloatingText(this.width / 2, this.height * 0.55, '👆 请先点击要卖的装备', '#fbbf24')
      return
    }

    // 品质价格倍率
    const priceMap = { common: 10, uncommon: 20, rare: 40, epic: 80, legendary: 160 }
    const sold = this.inventory[targetIdx]
    const base = priceMap[sold.quality] || 5
    const value = base + (sold.level || 1) * 3

    this.inventory.splice(targetIdx, 1)
    this.gold += value
    this._sellTargetIndex = -1  // 清除选中状态

    this._addFloatingText(this.width / 2, this.height * 0.55,
      `💰 出售 ${sold.name} → +${value}金币`, '#f1c40f')
  }

  _openEquipPanelForItem(item, invIdx) {
    this.equipPanel = {
      visible: true,
      item: item,
      invIndex: invIdx,       // 背包中的位置（穿戴后清空）
      selectedCharIndex: -1,
      animTimer: 0,
      charButtons: [],
    }

    const W = this.width, H = this.height, dpr = this.dpr
    const panelW = Math.min(340 * dpr, W * 0.88)
    const panelH = Math.min(H * 0.45, 280 * dpr)
    let startX = (W - panelW) / 2

    for (let i = 0; i < this.party.length; i++) {
      const c = this.party[i]
      const btnW = Math.min(76 * dpr, panelW / this.party.length - 12), btnH = 86 * dpr
      this.equipPanel.charButtons.push({
        x: startX + i * (btnW + 8),
        y: panelH * 0.48, w: btnW, h: btnH, charIndex: i
      })
    }
  }

  /** 合成装备：两个同槽位+同品质的装备合成升级（消耗金币） */
  _synthesizeEquipment() {
    const cost = this._synthCost || 50
    if (this.inventory.length < 2) {
      this._addFloatingText(this.width / 2, this.height * 0.55, '❌ 装备不足2件', '#f87171')
      return
    }
    if (this.gold < cost) {
      this._addFloatingText(this.width / 2, this.height * 0.55, `❌ 金币不足，需要${cost}💰`, '#f87171')
      return
    }

    // 找出可合成的配对（同slot + 同quality，不要求同名）
    console.log(`[Tower] 合成检测: inventory=${JSON.stringify(this.inventory.map(i => ({ n: i.name, s: i.slot, q: i.quality })))}`)
    for (let i = 0; i < this.inventory.length; i++) {
      for (let j = i + 1; j < this.inventory.length; j++) {
        const a = this.inventory[i], b = this.inventory[j]
        // 放宽条件：同槽位+同品质即可合成（不需要同名）
        if (a.slot && b.slot && a.slot === b.slot && a.quality === b.quality) {
          console.log(`[Tower] ✅ 找到可合成对: [${i}]${a.name}(${a.slot},${a.quality}) + [${j}]${b.name}(${b.slot},${b.quality})`)
          // 合成！生成新装备（等级+1，属性温和提升）
          // 设计原则：等级只提供HP/MP/少量防御，主要战力靠装备本身品质
          const newLevel = (a.level || 1) + 1
          // 成长公式：每级在基础值上叠加一小部分，避免膨胀过快
          const grow = (base, lv) => {
            if (!base || base <= 0) return 0
            // 等级加成系数：每级+20%，线性累加但取整向下
            return base + Math.floor(base * (lv - 1) * 0.2)
          }
          const newItem = {
            ...a,
            level: newLevel,
            bonusHp: grow(a.bonusHp || 0, newLevel),
            bonusAtk: grow(a.bonusAtk || 0, newLevel),
            bonusMatk: grow(a.bonusMatk || 0, newLevel),
            bonusDef: grow(a.bonusDef || 0, newLevel),
            bonusSpd: grow(a.bonusSpd || 0, newLevel),
            bonusCrit: grow(a.bonusCrit || 0, newLevel),
            bonusLifesteal: grow(a.bonusLifesteal || 0, newLevel),
            bonusMpRegen: grow(a.bonusMpRegen || 0, newLevel),
            bonusHpRegen: grow(a.bonusHpRegen || 0, newLevel),
            bonusCdr: grow(a.bonusCdr || 0, newLevel),
            name: `${a.name}+${newLevel}`,
          }

          // 升级品质
          const qualityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary']
          const qi = qualityOrder.indexOf(a.quality)
          if (qi >= 0 && newLevel >= 3 && qi < qualityOrder.length - 1) {
            newItem.quality = qualityOrder[qi + 1]
          }

          // 移除旧物品，放入新物品
          this.inventory.splice(j, 1)
          this.inventory.splice(i, 1, newItem)

          // 扣金币
          this.gold -= cost

          // 合成特效提示（含属性变化）
          const attrText = [
            newItem.bonusHp ? `HP+${newItem.bonusHp}` : '',
            newItem.bonusAtk ? `攻+${newItem.bonusAtk}` : '',
            newItem.bonusMatk ? `魔+${newItem.bonusMatk}` : '',
            newItem.bonusDef ? `防+${newItem.bonusDef}` : '',
            newItem.bonusSpd ? `速+${newItem.bonusSpd}` : '',
          ].filter(Boolean).join(' ')
          console.log(`[Tower] ⚗️合成: ${a.name}Lv${a.level||1} + ${b.name}Lv${b.level||1} → ${newItem.name}, 属性: ${attrText}`)
          this._addFloatingText(this.width / 2, this.height * 0.55,
            `⚗️ ${newItem.name}\n${attrText || '属性提升'} (-${cost}💰)`, '#a78bfa')
          return
        }
      }
    }

    // 没有可合成的对
    console.log(`[Tower] ❌ 无可合成对: 需要同槽位+同品质的两件装备`)
    this._addFloatingText(this.width / 2, this.height * 0.55, '❌ 没有可合成的装备', '#f87171')
  }

  /** 渲染悬浮装备属性提示框 */
  _renderItemTooltip(ctx) {
    const h = this._hoveredItem
    if (!h || !h.item) return
    const item = h.item
    const W = this.width, H = this.height, dpr = this.dpr

    // 品质配置
    const qColors = {
      common: { name: '普通', bg: '#2a3040', border: '#666', text: '#aab' },
      uncommon: { name: '优秀', bg: '#1a3050', border: '#4a90c8', text: '#8ec8ff' },
      rare: { name: '稀有', bg: '#282048', border: '#7c5cf0', text: '#c9a0ff' },
      epic: { name: '史诗', bg: '#381438', border: '#d050d0', text: '#f0a0f0' },
      legendary: { name: '传说', bg: '#403000', border: '#e8a800', text: '#ffd060' },
    }
    const qc = qColors[item.quality] || qColors.common

    const slotNames = { weapon: '\u2694 武器', armor: '\u{1F6E1} 护甲', accessory: '\u{1F48E} 饰品' }

    // 构建内容行
    const lines = []
    lines.push({ text: item.name, color: qc.text, size: 13, bold: true })
    lines.push({ text: `${qc.name} ${slotNames[item.slot] || ''}  Lv${item.level || 1}`, color: qc.border, size: 10 })
    lines.push(...this._getEquipStats(item))

    // 计算tooltip尺寸
    const padX = Math.max(10, 12 * dpr)
    const padY = Math.max(7, 8 * dpr)
    const lineHeight = Math.max(16, 18 * dpr)
    let maxW = 0
    for (const l of lines) {
      ctx.font = `${l.bold ? 'bold' : ''} ${Math.max(l.size, 9 * dpr)}px sans-serif`
      maxW = Math.max(maxW, ctx.measureText(l.text).width)
    }
    const tipW = maxW + padX * 2
    const tipH = lines.length * lineHeight + padY * 2

    // 定位（在目标上方，避免超出屏幕）
    let tipX = h.x - tipW / 2
    let tipY = h.y - tipH - 8
    if (tipX < 4) tipX = 4
    if (tipX + tipW > W - 4) tipX = W - tipW - 4
    if (tipY < 4) tipY = h.y + h.size || h.h || 30

    // 绘制tooltip背景（带阴影）
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 4
    ctx.fillStyle = qc.bg
    this._roundRect(ctx, tipX, tipY, tipW, tipH, 6)
    ctx.fill()
    ctx.shadowColor = 'transparent'

    // 边框
    ctx.strokeStyle = qc.border
    ctx.lineWidth = 1.2
    this._roundRect(ctx, tipX, tipY, tipW, tipH, 6)
    ctx.stroke()

    // 绘制文字
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      ctx.font = `${l.bold ? 'bold' : ''} ${Math.max(l.size, 9 * dpr)}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = l.color
      ctx.fillText(l.text, tipX + padX, tipY + padY + i * lineHeight)
    }

    ctx.restore()
  }

  _addFloatingText(x, y, text, color) {
    this.effects.push({
      type: 'dmg_number', x, y, value: text, color,
      scale: 0.9, life: 1.8, vy: -25
    })
  }

  /** 绘制锯齿形闪电（从 x1,y1 到 x2,y2，segments 段数） */
  _drawLightningBolt(ctx, x1, y1, x2, y2, segments) {
    const pts = [{x: x1, y: y1}]
    for (let i = 1; i < segments; i++) {
      const t = i / segments
      const bx = x1 + (x2 - x1) * t
      const by = y1 + (y2 - y1) * t
      const perpX = -(y2 - y1)
      const perpY = (x2 - x1)
      const perpLen = Math.sqrt(perpX*perpX + perpY*perpY) || 1
      const offset = (Math.random() - 0.5) * 25
      pts.push({ x: bx + (perpX / perpLen) * offset, y: by + (perpY / perpLen) * offset })
    }
    pts.push({x: x2, y: y2})
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }
}
