/**
 * 虚无之雾副本（void_mist）数据配置 —— 终章
 * ------------------------------------------------------------------
 * 数据驱动地配置掉落 / 经验 / 通关奖励 / 宝箱，供 field-scene 读取。
 * 怪物来自 ENEMIES_CH5（古城遗迹怪物 + 最终 Boss 虚无之雾领主）。
 *
 * 金币统一走 data 的 'gold' 字段。
 */

export const VOID_MIST_DUNGEON = {
  /** 背景音乐 key ★ 副本专属曲（阴森迷雾，BOSS 战另切 BOSS 专属曲（见 boss-bgm.js）） */
  bgm: 'bgm_void_mist',

  /**
   * 击杀掉落表。
   */
  lootTable: {
    ruin_sentry: [
      { type: 'gold', min: 35, max: 65, rate: 1.0 },
      { type: 'material', id: 'stone_shard', count: 1, rate: 0.4 },
    ],
    bone_cat: [
      { type: 'gold', min: 38, max: 70, rate: 1.0 },
      { type: 'material', id: 'bone_fragment', count: 1, rate: 0.4 },
    ],
    cursed_idol: [
      { type: 'gold', min: 40, max: 75, rate: 1.0 },
      { type: 'material', id: 'idol_shard', count: 1, rate: 0.4 },
    ],
    dust_wraith: [
      { type: 'gold', min: 36, max: 68, rate: 1.0 },
      { type: 'material', id: 'wraith_ash', count: 1, rate: 0.4 },
    ],
    ruin_colossus: [
      { type: 'gold', min: 100, max: 170, rate: 1.0 },
      { type: 'material', id: 'colossus_core', count: 1, rate: 0.6 },
    ],
    void_mist_lord: [
      { type: 'gold', min: 400, max: 600, rate: 1.0 },
      { type: 'material', id: 'void_core', count: 1, rate: 1.0 },
    ],
  },

  /**
   * 击杀经验表：小怪 65~72 / 精英 200 / Boss 800。
   */
  expTable: {
    ruin_sentry: 65,
    bone_cat: 62,
    cursed_idol: 68,
    dust_wraith: 64,
    ruin_colossus: 200,
    void_mist_lord: 800,
  },

  /**
   * 通关奖励（击败 Boss 触发一次）。
   * 终章没有新英雄解锁，改为高额金币 + 通关标记。
   */
  clearReward: {
    coins: 600,
    unlocks: [],
  },

  /**
   * Boss 属性覆盖（终章锚点）：虚无之雾领主。
   */
  bossStatsOverride: { maxHp: 1800, atk: 70, def: 38, spd: 13 },

  /** 宝箱奖励 */
  chestReward: {
    entries: [
      { type: 'gold', min: 100, max: 200, rate: 1.0 },
      { type: 'material', id: 'stone_shard', count: 1, rate: 0.4 },
      { type: 'material', id: 'idol_shard', count: 1, rate: 0.3 },
      { type: 'material', id: 'colossus_core', count: 1, rate: 0.3 },
    ],
  },

  /**
   * 开场引导对话。
   */
  introDialogue: {
    name: '猫村长',
    lines: [
      '臻宝、小宝！虚无之雾已经笼罩了整片大陆。',
      '古城深处的封印被打破，混沌正在吞噬一切。',
      '只有击败虚无之雾本体，才能唤回真正的和平！',
      '（提示：左下摇杆移动，攻击键普攻；靠近宝箱点击拾取）',
    ],
  },

  /**
   * 区域分层刷新：外环→中层→核心 难度递进；Boss 由 _generateMonsters 单独生成。
   */
  spawnZones: [
    { id: 'outer', name: '虚空外环', x: 150,  y: 2000, w: 1300, h: 900,  level: [18, 20], enemies: ['ruin_sentry', 'bone_cat'], count: 9 },
    { id: 'mid',   name: '迷雾回廊', x: 1500, y: 950,  w: 1200, h: 1200, level: [20, 22], enemies: ['cursed_idol', 'dust_wraith'], count: 7 },
    { id: 'deep',  name: '虚无核心', x: 2800, y: 200,  w: 1100, h: 1100, level: [22, 24], enemies: ['ruin_colossus', 'dust_wraith'], count: 5 },
  ],
}
