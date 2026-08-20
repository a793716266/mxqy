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
    // 草原 Boss 为 dark_cat_king（暗影猫王，见下方 bossStatsOverride）；
    // 旧 lost_healer_cat（治疗猫）已不作为草原生成 Boss，其掉落条目移除，避免孤儿配置。
    // 其它区域 Boss（forest/cave 的 stray_leader 等），保留以便复用
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

  /**
   * ★ 第一章 Boss 属性覆盖：dark_cat_king 本体按终章 level 10 编写（HP 500 / atk 32），
   * 经 getEnemyByLevel(…,5) 会进一步放大到约 740 血 / 42 攻，且技能为终章级
   * （暗影之怒 power 3.0 + 霸体、暗影领域全体 1.2），对第一章 1~4 级队伍是「血墙 + 秒杀」不可战胜。
   * 此处覆盖为章节适配值。伤害公式 dmg = atk*power - heroDef*0.3，故 atk≈17 时
   * 终章技仅造成约 48 伤，可生还。由 field-scene._generateMonsters 读取应用。
   */
  bossStatsOverride: { maxHp: 260, atk: 17, def: 10, spd: 11 },

  /** 宝箱奖励（多条目，按 rate 概率结算；type: gold 走 _addGold，material 走 _addMaterial） */
  chestReward: {
    entries: [
      { type: 'gold', min: 20, max: 50, rate: 1.0 },
      { type: 'material', id: 'slime_gel', count: 1, rate: 0.4 },
      { type: 'material', id: 'shadow_dust', count: 1, rate: 0.3 },
      { type: 'material', id: 'flame_core', count: 1, rate: 0.25 },
    ],
  },

  /**
   * 开场引导对话（进入副本首次触发，introShown_grassland 持久化防重复）。
   * 自动逐条播放、不阻塞操作（实时战斗场景不适合点击暂停式对话）。
   */
  introDialogue: {
    name: '猫村长',
    lines: [
      '臻宝、小宝！阳光草原最近被暗影猫王控制了。',
      '草原上的野猫都变得狂躁，村民们都不敢出门了。',
      '请沿路清剿怪物，直捣东北方的暗影巢穴，击败暗影猫王！',
      '（提示：左下摇杆移动，攻击键普攻；靠近宝箱点击拾取，营地篝火可回血）',
    ],
  },

  /**
   * 区域分层刷新：把原先的纯随机散点改为按区域密度，让副本有结构。
   * 坐标均为「逻辑像素」（field-scene 读取时乘 dpr）；level 为 [min,max] 闭区间随机。
   * 外层→中层→暗影领地 难度递进；Boss 仍由 _generateMonsters 单独生成（右上角）。
   */
  spawnZones: [
    { id: 'outer', name: '草原外围', x: 150,  y: 1700, w: 1300, h: 1200, level: [1, 2], enemies: ['wild_cat', 'slime_cat'], count: 9 },
    { id: 'mid',   name: '草原深处', x: 1450, y: 700,  w: 1150, h: 1500, level: [2, 3], enemies: ['shadow_mouse', 'flame_slime', 'aqua_slime'], count: 7 },
    { id: 'deep',  name: '暗影领地', x: 2650, y: 150,  w: 1150, h: 1250, level: [3, 4], enemies: ['violet_slime', 'shadow_mouse_smooth', 'flame_slime'], count: 5 },
  ],

  /**
   * 安全区 / 回血点（篝火）：玩家靠近持续回血，避免前期无治疗角色卡死。
   * 坐标/半径均为逻辑像素（field-scene 读取时乘 dpr）。
   */
  safeZones: [
    { id: 'bonfire_spawn', name: '营地篝火',     x: 320,  y: 2680, radius: 170 },
    { id: 'bonfire_deep',  name: '暗影前哨篝火', x: 3150, y: 1150, radius: 170 },
  ],
}
