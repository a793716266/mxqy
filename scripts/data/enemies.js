/**
 * enemies.js - 敌人数据聚合器
 *
 * ★ 单一数据源已下沉到 scripts/entities/monsters/*.js
 *   （每个怪物一个自包含配置文件，含属性 / 技能 / AI / 动画 / 渲染）。
 *   本文件只负责 require 各怪物配置并组装 ENEMIES_CH1 / ENEMIES_CH2，
 *   对外 API（ENEMIES_CH1 / ENEMIES_CH2 / getEnemyByLevel）保持不变，
 *   所有调用方（field-scene / battle-scene / map-scene）无需改动。
 */

// 敌人等级成长率（每升一级增加的百分比）
const ENEMY_GROWTH_RATE = {
  normal: { hp: 0.08, atk: 0.05, def: 0.05, spd: 0.02 },   // 小怪
  elite: { hp: 0.10, atk: 0.07, def: 0.07, spd: 0.03 },    // 精英
  boss: { hp: 0.12, atk: 0.08, def: 0.08, spd: 0.04 }      // Boss
}

// === 第一章怪物配置（单一数据源：entities/monsters）===
const wildCat = require('../entities/monsters/wild-cat.js')
const slimeCat = require('../entities/monsters/slime-cat.js')
const shadowMouse = require('../entities/monsters/shadow-mouse.js')
const strayLeader = require('../entities/monsters/stray-leader.js')
const lostHealerCat = require('../entities/monsters/lost-healer-cat.js')
const darkCatKing = require('../entities/monsters/dark-cat-king.js')

// === 第二章怪物配置 ===
const magicSprite = require('../entities/monsters/magic-sprite.js')
const stoneGolem = require('../entities/monsters/stone-golem.js')
const ghostCat = require('../entities/monsters/ghost-cat.js')
const towerGuardian = require('../entities/monsters/tower-guardian.js')
const crystalMage = require('../entities/monsters/crystal-mage.js')

// === 第三章怪物配置（集市小镇）===
const marketRat = require('../entities/monsters/market-rat.js')
const pickpocketCat = require('../entities/monsters/pickpocket-cat.js')
const ragDoll = require('../entities/monsters/rag-doll.js')
const coinGolem = require('../entities/monsters/coin-golem.js')
const thugLeader = require('../entities/monsters/thug-leader.js')
const corruptMerchant = require('../entities/monsters/corrupt-merchant.js')

// === 第四章怪物配置（古城遗迹）===
const ruinSentry = require('../entities/monsters/ruin-sentry.js')
const boneCat = require('../entities/monsters/bone-cat.js')
const cursedIdol = require('../entities/monsters/cursed-idol.js')
const dustWraith = require('../entities/monsters/dust-wraith.js')
const ruinColossus = require('../entities/monsters/ruin-colossus.js')
const ancientWarden = require('../entities/monsters/ancient-warden.js')

// === 换肤 / 补帧派生变体（复用基础怪配置 + 替换资源路径）===
const slimeCatSkins = require('../entities/monsters/slime_cat_skins.js')       // { flame_slime, aqua_slime, violet_slime }
const shadowMouseSmooth = require('../entities/monsters/shadow-mouse-tween.js') // 暗影鼠·顺滑

const ENEMIES_CH1 = {
  // 基础怪
  wild_cat: wildCat,
  slime_cat: slimeCat,
  shadow_mouse: shadowMouse,
  stray_leader: strayLeader,
  lost_healer_cat: lostHealerCat,
  dark_cat_king: darkCatKing,
  // 派生变体（与 grassland 重生池一致，确保可被正确生成）
  ...slimeCatSkins,            // flame_slime / aqua_slime / violet_slime
  shadow_mouse_smooth: shadowMouseSmooth
}

const ENEMIES_CH2 = {
  magic_sprite: magicSprite,
  stone_golem: stoneGolem,
  ghost_cat: ghostCat,
  tower_guardian: towerGuardian,
  crystal_mage: crystalMage
}

const ENEMIES_CH3 = {
  market_rat: marketRat,
  pickpocket_cat: pickpocketCat,
  rag_doll: ragDoll,
  coin_golem: coinGolem,
  thug_leader: thugLeader,
  corrupt_merchant: corruptMerchant
}

const ENEMIES_CH4 = {
  ruin_sentry: ruinSentry,
  bone_cat: boneCat,
  cursed_idol: cursedIdol,
  dust_wraith: dustWraith,
  ruin_colossus: ruinColossus,
  ancient_warden: ancientWarden
}

/**
 * 根据等级计算敌人最终属性
 * @param {Object} enemyData - 敌人基础数据
 * @param {number} level - 敌人等级（默认为1）
 * @returns {Object} 最终敌人数据
 */
function getEnemyByLevel(enemyData, level = 1) {
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

  // 初始化当前HP/MP
  finalEnemy.hp = finalEnemy.maxHp
  finalEnemy.maxMp = enemyData.maxMp || (enemyData.isBoss ? 100 : (enemyData.isElite ? 50 : 30))
  finalEnemy.mp = finalEnemy.maxMp

  return finalEnemy
}

export { ENEMIES_CH1, ENEMIES_CH2, ENEMIES_CH3, ENEMIES_CH4, getEnemyByLevel }

// CommonJS 兼容导出：field-scene.js 通过 require() 动态加载怪物配置，
// 而怪物文件再 require 本模块。为兼容 require 与 import 双模式，此处补充 CJS 导出。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ENEMIES_CH1, ENEMIES_CH2, ENEMIES_CH3, ENEMIES_CH4, getEnemyByLevel }
}
