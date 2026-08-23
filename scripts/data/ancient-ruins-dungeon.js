/**
 * 古城遗迹副本（ancient_ruins）数据配置 —— 第四章
 * ------------------------------------------------------------------
 * 数据驱动地配置掉落 / 经验 / 通关奖励 / 宝箱，供 field-scene 读取。
 * 怪物来自 ENEMIES_CH4（本文件配套的实体配置 scripts/entities/monsters/*）。
 *
 * 供 field-scene 读取的方法：
 *   - _rollMonsterDrop()      击杀掉落（按怪物 enemyId 查 lootTable）
 *   - _collectObject()        宝箱奖励（chestReward）
 *   - _finalizeDungeonClear() 通关奖励（clearReward：金币 + 解锁小贝）
 *   - _generateMonsters()     分层刷新（spawnZones）+ Boss 属性锚定（bossStatsOverride）
 *
 * 金币统一走 data 的 'gold' 字段。
 */

export const ANCIENT_RUINS_DUNGEON = {
  /** 背景音乐 key（field-scene 进入副本时播放） */
  bgm: 'bgm_ancient_ruins',

  /**
   * 击杀掉落表。key = 怪物 enemyId，value = 掉落条目数组。
   */
  lootTable: {
    ruin_sentry: [
      { type: 'gold', min: 30, max: 55, rate: 1.0 },
      { type: 'material', id: 'stone_shard', count: 1, rate: 0.4 },
    ],
    bone_cat: [
      { type: 'gold', min: 32, max: 60, rate: 1.0 },
      { type: 'material', id: 'bone_fragment', count: 1, rate: 0.4 },
    ],
    cursed_idol: [
      { type: 'gold', min: 34, max: 64, rate: 1.0 },
      { type: 'material', id: 'idol_shard', count: 1, rate: 0.4 },
    ],
    dust_wraith: [
      { type: 'gold', min: 30, max: 58, rate: 1.0 },
      { type: 'material', id: 'wraith_ash', count: 1, rate: 0.4 },
    ],
    // 精英：遗迹巨像
    ruin_colossus: [
      { type: 'gold', min: 80, max: 140, rate: 1.0 },
      { type: 'material', id: 'colossus_core', count: 1, rate: 0.6 },
    ],
    // Boss：远古守望者（小贝 Boss 形态）
    ancient_warden: [
      { type: 'gold', min: 250, max: 380, rate: 1.0 },
      { type: 'material', id: 'warden_core', count: 1, rate: 1.0 },
    ],
  },

  /**
   * ★ 击杀经验表：key = 怪物 enemyId，value = 击杀获得的经验值。
   * 第四章难度高于第三章（小怪 55~60 / 精英 160 / Boss 500）。
   */
  expTable: {
    ruin_sentry: 60,
    bone_cat: 55,
    cursed_idol: 58,
    dust_wraith: 56,
    ruin_colossus: 160,
    ancient_warden: 500,
  },

  /**
   * 通关奖励（击败 Boss 触发一次）。
   * coins  : 金币（写入 'gold' 字段）
   * unlocks: 通关时需解锁的角色 id 列表（GDD：第四章解锁小贝）
   */
  clearReward: {
    coins: 280,
    unlocks: ['xiaobei'],
  },

  /**
   * ★ Boss 属性覆盖（第四章适配锚点）：Boss 为 ancient_warden（远古守望者 / 小贝 Boss 形态），
   * 其原生属性已为第四章设计（maxHp 1100 / atk 52 / def 30 / spd 12）。getEnemyByLevel 会按 level
   * 缩放膨胀，故此处显式锚定其原生值，确保"属性资源"对应小贝。
   * 由 field-scene._generateMonsters 读取应用。
   */
  bossStatsOverride: { maxHp: 1100, atk: 52, def: 30, spd: 12 },

  /** 宝箱奖励（多条目，按 rate 概率结算） */
  chestReward: {
    entries: [
      { type: 'gold', min: 80, max: 150, rate: 1.0 },
      { type: 'material', id: 'stone_shard', count: 1, rate: 0.4 },
      { type: 'material', id: 'idol_shard', count: 1, rate: 0.3 },
      { type: 'material', id: 'wraith_ash', count: 1, rate: 0.3 },
    ],
  },

  /**
   * 开场引导对话（进入副本首次触发，introShown_ancient_ruins 持久化防重复）。
   */
  introDialogue: {
    name: '猫村长',
    lines: [
      '臻宝、小宝！古城遗迹的封印松动，远古守望者被黑雾扭曲成了暴君。',
      '石卫、骸骨猫与诅咒石像把守着层层石门，怨灵在尘雾中穿行。',
      '深入遗迹击败远古守望者（小贝的迷失形态），唤回那位憨厚的守护者！',
      '（提示：左下摇杆移动，攻击键普攻；靠近宝箱点击拾取）',
    ],
  },

  /**
   * 区域分层刷新：外垣→中庭→封印殿难度递进；Boss 由 _generateMonsters 单独生成（右上角）。
   * 坐标均为「逻辑像素」（field-scene 读取时乘 dpr）；level 为 [min,max] 闭区间随机。
   */
  spawnZones: [
    { id: 'outer', name: '古城外垣', x: 150,  y: 2000, w: 1300, h: 900,  level: [15, 16], enemies: ['ruin_sentry', 'bone_cat'], count: 9 },
    { id: 'mid',   name: '祭祀中庭', x: 1500, y: 950,  w: 1200, h: 1200, level: [16, 18], enemies: ['cursed_idol', 'dust_wraith'], count: 7 },
    { id: 'deep',  name: '封印神殿', x: 2800, y: 200,  w: 1100, h: 1100, level: [18, 20], enemies: ['ruin_colossus', 'bone_cat'], count: 5 },
  ],
}
