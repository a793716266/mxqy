/**
 * 魔法塔副本（magic_tower）数据配置 —— 第二章
 * ------------------------------------------------------------------
 * 数据驱动地配置掉落 / 经验 / 通关奖励 / 宝箱，供 field-scene 读取。
 * 风格与 grassland-dungeon 完全一致；怪物来自 ENEMIES_CH2。
 *
 * 供 field-scene 读取的方法：
 *   - _rollMonsterDrop()      击杀掉落（按怪物 enemyId 查 lootTable）
 *   - _collectObject()        宝箱奖励（chestReward）
 *   - _finalizeDungeonClear() 通关奖励（clearReward：金币 + 解锁安妮）
 *   - _generateMonsters()     分层刷新（spawnZones）+ Boss 属性锚定（bossStatsOverride）
 *
 * 金币统一走 data 的 'gold' 字段。
 */

export const MAGIC_TOWER_DUNGEON = {
  /** 背景音乐 key（field-scene 进入副本时播放） */
  bgm: 'bgm_tower',

  /**
   * 击杀掉落表。key = 怪物 enemyId，value = 掉落条目数组。
   */
  lootTable: {
    magic_sprite: [
      { type: 'gold', min: 15, max: 30, rate: 1.0 },
      { type: 'material', id: 'magic_dust', count: 1, rate: 0.4 },
    ],
    stone_golem: [
      { type: 'gold', min: 18, max: 35, rate: 1.0 },
      { type: 'material', id: 'stone_core', count: 1, rate: 0.45 },
    ],
    ghost_cat: [
      { type: 'gold', min: 16, max: 32, rate: 1.0 },
      { type: 'material', id: 'ghost_essence', count: 1, rate: 0.4 },
    ],
    // 精英：塔楼守护者
    tower_guardian: [
      { type: 'gold', min: 40, max: 70, rate: 1.0 },
      { type: 'material', id: 'guardian_shield', count: 1, rate: 0.6 },
    ],
    // Boss：水晶法师（安妮 Boss 形态）
    crystal_mage: [
      { type: 'gold', min: 100, max: 160, rate: 1.0 },
      { type: 'material', id: 'crystal_heart', count: 1, rate: 1.0 },
    ],
  },

  /**
   * ★ 击杀经验表：key = 怪物 enemyId，value = 击杀获得的经验值。
   * 第二章难度高于第一章（小怪 40~48 / 精英 110 / Boss 300）。
   */
  expTable: {
    magic_sprite: 40,
    stone_golem: 48,
    ghost_cat: 45,
    tower_guardian: 110,
    crystal_mage: 300,
  },

  /**
   * 通关奖励（击败 Boss 触发一次）。
   * coins  : 金币（写入 'gold' 字段）
   * unlocks: 通关时需解锁的角色 id 列表（GDD：第二章解锁安妮）
   */
  clearReward: {
    coins: 150,
    unlocks: ['annie'],
  },

  /**
   * ★ Boss 属性覆盖（第二章适配锚点）：Boss 为 crystal_mage（水晶法师 / 安妮 Boss 形态），
   * 其原生属性已为第二章设计（maxHp 400 / atk 35 / def 18 / spd 14）。getEnemyByLevel 会按 level
   * 缩放膨胀，故此处显式锚定其原生值，确保"属性资源"对应安妮，不让膨胀后的高值继续生效。
   * 由 field-scene._generateMonsters 读取应用。
   */
  bossStatsOverride: { maxHp: 400, atk: 35, def: 18, spd: 14 },

  /** 宝箱奖励（多条目，按 rate 概率结算） */
  chestReward: {
    entries: [
      { type: 'gold', min: 40, max: 90, rate: 1.0 },
      { type: 'material', id: 'magic_dust', count: 1, rate: 0.4 },
      { type: 'material', id: 'stone_core', count: 1, rate: 0.3 },
      { type: 'material', id: 'ghost_essence', count: 1, rate: 0.3 },
    ],
  },

  /**
   * 开场引导对话（进入副本首次触发，introShown_magic_tower 持久化防重复）。
   */
  introDialogue: {
    name: '猫村长',
    lines: [
      '臻宝、小宝！魔法塔顶的水晶之力失控了，安妮被困在塔中。',
      '塔内的魔法精灵与石像都被黑雾侵蚀，变得极具攻击性。',
      '请逐层向上清剿，登上塔顶唤醒安妮（水晶法师）！',
      '（提示：左下摇杆移动，攻击键普攻；靠近宝箱点击拾取）',
    ],
  },

  /**
   * 区域分层刷新：外层→中层→塔顶难度递进；Boss 由 _generateMonsters 单独生成（右上角）。
   * 坐标均为「逻辑像素」（field-scene 读取时乘 dpr）；level 为 [min,max] 闭区间随机。
   */
  spawnZones: [
    { id: 'outer', name: '塔下庭院', x: 150,  y: 2000, w: 1300, h: 900,  level: [8, 9],   enemies: ['magic_sprite', 'stone_golem'], count: 8 },
    { id: 'mid',   name: '中层回廊', x: 1500, y: 950,  w: 1200, h: 1200, level: [9, 11],  enemies: ['ghost_cat', 'stone_golem'], count: 7 },
    { id: 'deep',  name: '塔顶禁地', x: 2800, y: 200,  w: 1100, h: 1100, level: [11, 13], enemies: ['tower_guardian', 'ghost_cat'], count: 5 },
  ],
}
