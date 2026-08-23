/**
 * 集市小镇副本（merchant_town）数据配置 —— 第三章
 * ------------------------------------------------------------------
 * 数据驱动地配置掉落 / 经验 / 通关奖励 / 宝箱，供 field-scene 读取。
 * 怪物来自 ENEMIES_CH3（本文件配套的实体配置 scripts/entities/monsters/*）。
 *
 * 供 field-scene 读取的方法：
 *   - _rollMonsterDrop()      击杀掉落（按怪物 enemyId 查 lootTable）
 *   - _collectObject()        宝箱奖励（chestReward）
 *   - _finalizeDungeonClear() 通关奖励（clearReward：金币 + 解锁钱多多）
 *   - _generateMonsters()     分层刷新（spawnZones）+ Boss 属性锚定（bossStatsOverride）
 *
 * 金币统一走 data 的 'gold' 字段。
 */

export const MERCHANT_TOWN_DUNGEON = {
  /** 背景音乐 key（field-scene 进入副本时播放） */
  bgm: 'bgm_merchant_town',

  /**
   * 击杀掉落表。key = 怪物 enemyId，value = 掉落条目数组。
   */
  lootTable: {
    market_rat: [
      { type: 'gold', min: 20, max: 40, rate: 1.0 },
      { type: 'material', id: 'rat_whisker', count: 1, rate: 0.4 },
    ],
    pickpocket_cat: [
      { type: 'gold', min: 24, max: 48, rate: 1.0 },
      { type: 'material', id: 'stolen_coin', count: 1, rate: 0.4 },
    ],
    rag_doll: [
      { type: 'gold', min: 22, max: 44, rate: 1.0 },
      { type: 'material', id: 'cloth_scrap', count: 1, rate: 0.45 },
    ],
    coin_golem: [
      { type: 'gold', min: 50, max: 90, rate: 1.0 },
      { type: 'material', id: 'gold_ingot', count: 1, rate: 0.5 },
    ],
    // 精英：打手头目
    thug_leader: [
      { type: 'gold', min: 60, max: 110, rate: 1.0 },
      { type: 'material', id: 'thief_signet', count: 1, rate: 0.6 },
    ],
    // Boss：黑金奸商（钱多多 Boss 形态）
    corrupt_merchant: [
      { type: 'gold', min: 180, max: 280, rate: 1.0 },
      { type: 'material', id: 'gilded_coin', count: 1, rate: 1.0 },
    ],
  },

  /**
   * ★ 击杀经验表：key = 怪物 enemyId，value = 击杀获得的经验值。
   * 第三章难度高于第二章（小怪 55~60 / 精英 160 / Boss 500）。
   */
  expTable: {
    market_rat: 55,
    pickpocket_cat: 60,
    rag_doll: 56,
    coin_golem: 58,
    thug_leader: 160,
    corrupt_merchant: 500,
  },

  /**
   * 通关奖励（击败 Boss 触发一次）。
   * coins  : 金币（写入 'gold' 字段）
   * unlocks: 通关时需解锁的角色 id 列表（GDD：第三章解锁钱多多）
   */
  clearReward: {
    coins: 200,
    unlocks: ['qianduoduo'],
  },

  /**
   * ★ Boss 属性覆盖（第三章适配锚点）：Boss 为 corrupt_merchant（黑金奸商 / 钱多多 Boss 形态），
   * 其原生属性已为第三章设计（maxHp 700 / atk 45 / def 22 / spd 13）。getEnemyByLevel 会按 level
   * 缩放膨胀，故此处显式锚定其原生值，确保"属性资源"对应钱多多。
   * 由 field-scene._generateMonsters 读取应用。
   */
  bossStatsOverride: { maxHp: 700, atk: 45, def: 22, spd: 13 },

  /** 宝箱奖励（多条目，按 rate 概率结算） */
  chestReward: {
    entries: [
      { type: 'gold', min: 60, max: 120, rate: 1.0 },
      { type: 'material', id: 'stolen_coin', count: 1, rate: 0.4 },
      { type: 'material', id: 'cloth_scrap', count: 1, rate: 0.3 },
      { type: 'material', id: 'gold_ingot', count: 1, rate: 0.25 },
    ],
  },

  /**
   * 开场引导对话（进入副本首次触发，introShown_merchant_town 持久化防重复）。
   */
  introDialogue: {
    name: '猫村长',
    lines: [
      '臻宝、小宝！集市小镇来了伙黑雾盗贼，连钱多多都被卷进了贪念里。',
      '镇上的老鼠、扒手和破布偶都变得凶狠，金光闪闪的傀儡堵住了去路。',
      '清剿盗匪、直捣赃窝，把迷失的钱多多（黑金奸商）唤醒过来！',
      '（提示：左下摇杆移动，攻击键普攻；靠近宝箱点击拾取）',
    ],
  },

  /**
   * 区域分层刷新：外围集市→中央赃窝→金库难度递进；Boss 由 _generateMonsters 单独生成（右上角）。
   * 坐标均为「逻辑像素」（field-scene 读取时乘 dpr）；level 为 [min,max] 闭区间随机。
   */
  spawnZones: [
    { id: 'outer', name: '外围集市', x: 150,  y: 2000, w: 1300, h: 900,  level: [11, 12], enemies: ['market_rat', 'pickpocket_cat'], count: 9 },
    { id: 'mid',   name: '中央赃窝', x: 1500, y: 950,  w: 1200, h: 1200, level: [12, 14], enemies: ['rag_doll', 'coin_golem'], count: 7 },
    { id: 'deep',  name: '地下金库', x: 2800, y: 200,  w: 1100, h: 1100, level: [14, 16], enemies: ['thug_leader', 'rag_doll'], count: 5 },
  ],
}
