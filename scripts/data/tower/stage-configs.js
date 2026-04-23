/**
 * stage-configs.js - 关卡配置中心（数据驱动）
 *
 * 每个关卡 = 独立配置对象，包含：
 *   - 元数据（名称、描述、章节）
 *   - 波次定义（怪物类型/数量/稀有度/生成位置）
 *   - 难度参数（怪物等级公式、属性缩放）
 *   - 掉落配置（品质权重、装备表）
 *
 * 添加新关卡只需在本文件中新增一个配置对象，
 * 无需修改 tower-battle.js 的任何逻辑代码。
 *
 * 使用方式：
 *   import { getStageConfig } from './stage-configs.js'
 *   const config = getStageConfig(stageId)
 *   new TowerBattle(scene, config, party)
 */

// ========== 品质掉落权重（基础值，可被关卡配置覆盖）==========
export const DEFAULT_QUALITY_WEIGHTS = {
  common:  0.60,   // 60% 普通
  rare:    0.25,   // 25% 稀有
  epic:    0.12,   // 12% 史诗
  legendary: 0.03, // 3%  传说
}

// ========== 关卡配置 ==========

export const STAGE_CONFIGS = {

  // ========================================================
  // 关卡 1：萌新试炼（当前唯一的关卡）
  // - 10波渐进难度
  // - 最终波有领主幼龙
  // ========================================================
  1: {
    id: 1,
    name: '萌新试炼',
    desc: '史莱姆与暗影的初次交锋',
    chapter: 1,

    // ---- 波次定义 ----
    // waveNum: 显示用波次编号（从1开始）
    // monsters: 每只怪的配置（type/count/rarity）
    //   rarity: normal(普通) / elite(精英) / lord(领主)
    waves: [
      // 第1-3波：纯普通怪，熟悉战斗节奏
      {
        waveNum: 1,
        monsters: [{ type: 'slime', count: 3, rarity: 'normal' }],
      },
      {
        waveNum: 2,
        monsters: [{ type: 'slime', count: 4, rarity: 'normal' }],
      },
      {
        waveNum: 3,
        monsters: [{ type: 'slime', count: 5, rarity: 'normal' }],
      },
      // 第4-6波：出现第二种怪 + 首只精英
      {
        waveNum: 4,
        monsters: [
          { type: 'slime',  count: 3, rarity: 'normal' },
          { type: 'goblin', count: 2, rarity: 'normal' },
        ],
      },
      {
        waveNum: 5,
        monsters: [
          { type: 'slime',  count: 3, rarity: 'normal' },
          { type: 'goblin', count: 2, rarity: 'normal' },
          { type: 'slime',  count: 1, rarity: 'elite' },
        ],
      },
      {
        waveNum: 6,
        monsters: [
          { type: 'slime',  count: 2, rarity: 'normal' },
          { type: 'goblin', count: 4, rarity: 'normal' },
          { type: 'goblin', count: 1, rarity: 'elite' },
        ],
      },
      // 第7-8波：三种怪混合 + 精英增多
      {
        waveNum: 7,
        monsters: [
          { type: 'slime', count: 2, rarity: 'normal' },
          { type: 'goblin', count: 3, rarity: 'normal' },
          { type: 'orc',    count: 2, rarity: 'normal' },
          { type: 'orc',    count: 1, rarity: 'elite' },
        ],
      },
      {
        waveNum: 8,
        monsters: [
          { type: 'slime',  count: 2, rarity: 'normal' },
          { type: 'goblin', count: 3, rarity: 'normal' },
          { type: 'orc',    count: 2, rarity: 'normal' },
          { type: 'slime',  count: 1, rarity: 'elite' },
          { type: 'goblin', count: 1, rarity: 'elite' },
        ],
      },
      // 第9波：四种怪 + 多只精英
      {
        waveNum: 9,
        monsters: [
          { type: 'slime', count: 3, rarity: 'normal' },
          { type: 'goblin', count: 3, rarity: 'normal' },
          { type: 'orc',    count: 2, rarity: 'normal' },
          { type: 'wolf',   count: 1, rarity: 'normal' },
          { type: 'orc',    count: 1, rarity: 'elite' },
          { type: 'wolf',   count: 1, rarity: 'elite' },
        ],
      },
      // 第10波（最终波）：大量精英 + 1只领主幼龙
      {
        waveNum: 10,
        monsters: [
          { type: 'slime',  count: 3, rarity: 'normal' },
          { type: 'goblin', count: 3, rarity: 'normal' },
          { type: 'orc',    count: 2, rarity: 'normal' },
          { type: 'wolf',   count: 2, rarity: 'normal' },
          { type: 'undead', count: 1, rarity: 'normal' },
          { type: 'slime',  count: 1, rarity: 'elite' },
          { type: 'goblin', count: 1, rarity: 'elite' },
          { type: 'orc',    count: 1, rarity: 'elite' },
          { type: 'wolf',   count: 1, rarity: 'elite' },
          { type: 'dragon', count: 1, rarity: 'lord' },
        ],
      },
    ],

    // ---- 怪物等级公式 ----
    // 参数：waveNum（当前波次编号，从1开始）
    // 返回：该波次怪物等级
    monsterLevelFn: (waveNum) => waveNum * 2 + 1,
    // 第1波=3级，第2波=5级...第10波=21级

    // ---- 属性缩放公式 ----
    // 可根据关卡需要调整，默认与原来一致
    hpScaleFn:    (level) => 1 + (level - 1) * 0.12,
    atkScaleFn:   (level) => 1 + (level - 1) * 0.08,
    defScaleFn:   (level) => 1 + (level - 1) * 0.05,
    spdScaleFn:   (level) => 1 + (level - 1) * 0.03,
    moveSpdFn:    (level) => 1 + (level - 1) * 0.02,
    atkIntervalFn:(level) => 1 - (level - 1) * 0.01,  // 攻速随等级略微加快
    expMultFn:    (level) => 1 + (level - 1) * 0.1,

    // ---- 波次间参数 ----
    waveCooldown: 3000,        // 波次间冷却(ms)
    spawnMode: 'all',          // 'all'=整波同时出场, 'interval'=间隔出场
    spawnInterval: 0,          // spawnMode='interval'时有效

    // ---- 掉落配置 ----
    drops: {
      qualityWeights: { ...DEFAULT_QUALITY_WEIGHTS },
      // 关卡专属掉落加成（百分比）
      rarityBonus: {
        elite: 0.2,   // 精英怪额外掉落加成
        lord:  0.4,   // 领主怪额外掉落加成
      },
      // 本关允许掉落的装备类型（null=全部）
      allowedEquipmentTypes: null,
      // 本关专属装备池（可选，填入 templateId 数组）
      exclusivePool: null,
    },
  },

  // ========================================================
  // 关卡 2：暗影森林（示例 - 未来扩展用）
  // 特点：怪物移速快，精英出现早
  // ========================================================
  2: {
    id: 2,
    name: '暗影森林',
    desc: '在被诅咒的森林中战斗',
    chapter: 1,

    waves: [
      {
        waveNum: 1,
        monsters: [{ type: 'goblin', count: 4, rarity: 'normal' }],
      },
      {
        waveNum: 2,
        monsters: [
          { type: 'goblin', count: 3, rarity: 'normal' },
          { type: 'goblin', count: 1, rarity: 'elite' },
        ],
      },
      // ... 更多波次
    ],

    monsterLevelFn: (waveNum) => waveNum * 3,  // 等级更高
    hpScaleFn:    (level) => 1 + (level - 1) * 0.15,  // 更肉
    moveSpdFn:    (level) => 1 + (level - 1) * 0.05,  // 更快

    waveCooldown: 2500,
    spawnMode: 'all',

    drops: {
      qualityWeights: {
        common: 0.50,
        rare: 0.30,
        epic: 0.15,
        legendary: 0.05,
      },
      rarityBonus: { elite: 0.25, lord: 0.5 },
      allowedEquipmentTypes: null,
      exclusivePool: null,
    },
  },

  // ========================================================
  // 关卡 3：龙骨荒野（示例 - 未来扩展用）
  // 特点：龙系怪物，掉落优质装备
  // ========================================================
  3: {
    id: 3,
    name: '龙骨荒野',
    desc: '与龙族的直接对抗',
    chapter: 2,

    waves: [
      // ... 龙系怪物波次
    ],

    monsterLevelFn: (waveNum) => waveNum * 4,
    hpScaleFn:    (level) => 1 + (level - 1) * 0.2,

    drops: {
      qualityWeights: {
        common: 0.40,
        rare: 0.35,
        epic: 0.20,
        legendary: 0.05,
      },
      rarityBonus: { elite: 0.3, lord: 0.6 },
      allowedEquipmentTypes: null,
      exclusivePool: null,  // 可填入龙系专属装备ID
    },
  },

  // ... 继续添加更多关卡 ...
}

// ========== 获取关卡配置 ==========
export function getStageConfig(stageId) {
  const config = STAGE_CONFIGS[stageId]
  if (!config) {
    console.warn(`[StageConfig] 未找到关卡 ${stageId} 的配置，使用默认关卡1`)
    return STAGE_CONFIGS[1]
  }
  return config
}

// ========== 获取所有关卡列表（用于选关界面）==========
export function getStageList() {
  return Object.values(STAGE_CONFIGS).map(cfg => ({
    id: cfg.id,
    name: cfg.name,
    desc: cfg.desc,
    chapter: cfg.chapter,
    waveCount: cfg.waves.length,
  }))
}
