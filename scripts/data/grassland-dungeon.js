/**
 * 阳光草原副本（grassland）数据配置
 * ------------------------------------------------------------------
 * 取代原先散落在 field-scene 里的硬编码数值，使「掉落 / 通关奖励 / 宝箱」
 * 数据驱动、可独立调整。
 *
 * 供 field-scene 的以下方法读取：
 *   - _rollMonsterDrop()      击杀掉落（按怪物 enemyId 查 lootTable）
 *   - _collectObject()        宝箱奖励（chestReward）
 *   - _checkDungeonClear()    通关奖励（clearReward：金币 + 解锁角色）
 *
 * 注意：金币统一走 data 的 'gold' 字段（HUD / 击杀 / 战斗奖励均读取它），
 * 不再使用孤立的 'coins' 字段，避免奖励丢失。
 */

export const GRASSLAND_DUNGEON = {
  /**
   * 击杀掉落表。
   * key   = 怪物 enemyId
   * value = 掉落条目数组，每条：
   *   type : 'gold'                 金币，[min, max] 闭区间随机
   *        | 'material'             素材，需 id + count
   *   rate : 掉落概率（0~1），省略或 1 表示必掉
   */
  lootTable: {
    wild_cat: [
      { type: 'gold', min: 5, max: 15, rate: 1.0 },
    ],
    slime_cat: [
      { type: 'gold', min: 5, max: 12, rate: 1.0 },
      { type: 'material', id: 'slime_gel', count: 1, rate: 0.5 },
    ],
    shadow_mouse: [
      { type: 'gold', min: 8, max: 18, rate: 1.0 },
      { type: 'material', id: 'shadow_dust', count: 1, rate: 0.4 },
    ],
    shadow_mouse_smooth: [
      { type: 'gold', min: 8, max: 18, rate: 1.0 },
      { type: 'material', id: 'shadow_dust', count: 1, rate: 0.4 },
    ],
    flame_slime: [
      { type: 'gold', min: 6, max: 14, rate: 1.0 },
      { type: 'material', id: 'flame_core', count: 1, rate: 0.45 },
    ],
    aqua_slime: [
      { type: 'gold', min: 6, max: 14, rate: 1.0 },
      { type: 'material', id: 'aqua_drop', count: 1, rate: 0.45 },
    ],
    violet_slime: [
      { type: 'gold', min: 6, max: 14, rate: 1.0 },
      { type: 'material', id: 'violet_petal', count: 1, rate: 0.45 },
    ],
    // 草原 Boss：lost_healer_cat（治疗猫，章节代表 Boss）
    lost_healer_cat: [
      { type: 'gold', min: 20, max: 40, rate: 1.0 },
      { type: 'material', id: 'healer_herb', count: 1, rate: 0.7 },
    ],
    // 其它区域 Boss（forest/cave），保留以便复用
    stray_leader: [
      { type: 'gold', min: 15, max: 30, rate: 1.0 },
      { type: 'material', id: 'stray_fang', count: 1, rate: 0.6 },
    ],
    dark_cat_king: [
      { type: 'gold', min: 60, max: 100, rate: 1.0 },
      { type: 'material', id: 'shadow_heart', count: 1, rate: 1.0 },
    ],
  },

  /**
   * 通关奖励（全灭所有怪物触发一次）。
   * coins  : 金币（写入 'gold' 字段）
   * unlocks: 通关时需解锁的角色 id 列表（GDD：第一章解锁艾米）
   */
  clearReward: {
    coins: 80,
    unlocks: ['amy'],
  },

  /** 宝箱奖励 */
  chestReward: {
    gold: { min: 10, max: 29 },
  },
}
