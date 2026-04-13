/**
 * data-manager.js - 存档/读档管理
 *
 * ★ 重构目标：
 * 1. 数据结构按功能域分区（player / progression / characters / equipment 等）
 * 2. 支持 dot-notation 访问（data.get('player.gold')）
 * 3. 读档时自动从旧结构迁移到新结构（version 字段驱动）
 * 4. 所有字段集中在 _defaultData() 里，不再散落
 *
 * ★ 兼容性：旧代码的 data.get('gold') / data.set('gold', v) 仍然有效，
 *   内部自动映射到 data.player.gold（见 _resolve）
 */

export class DataManager {
  constructor() {
    this.saveKey = 'meow_star_save'
    this.data = this._defaultData()
  }

  // ================================================================
  // 数据结构（单一真相来源）
  // ================================================================
  _defaultData() {
    return {
      version: 1,           // ★ 存档版本，迁移用

      // 玩家基础信息
      player: {
        name: '臻宝',
        level: 1,
        exp: 0,
        gold: 100,
        playTime: 0
      },

      // 剧情/章节进度
      progression: {
        currentChapter: 1,
        currentNode: 'town_start',
        party: [0],         // 出战阵容索引
        flags: {}           // 剧情标记（amyDefeated / annieDefeated 等）
      },

      // 角色状态（HP/属性，独立于配置数据）
      characters: [],

      // 装备数据
      equipment: [],

      // 道具背包
      inventory: [],

      // 猫咪图鉴（收集进度）
      catsDiscovered: [],

      // 元信息（引导/测试模式等）
      meta: {
        introShown: false,
        testUnlockAll: false
      },

      // 战斗上下文（关卡级，非实时）
      battle: {
        currentMonsterId: null,
        victory: false,
        droppedEquipment: null
      },

      // 各区域状态（野外怪物等）
      areas: {}
    }
  }

  // ================================================================
  // 核心读写（支持 dot-notation）
  // ================================================================

  /**
   * 读取字段，支持 dot-notation
   * data.get('player.gold')  →  this.data.player.gold
   * data.get('gold')         →  兼容旧代码，映射到 player.gold
   * data.get('fieldMonsters_area1') → 优先从 areas.area1.monsters 读
   */
  get(key) {
    // ★ 兼容旧代码：fieldMonsters_${areaId} 优先读 areas[areaId].monsters
    if (typeof key === 'string' && key.startsWith('fieldMonsters_')) {
      const areaId = key.replace('fieldMonsters_', '')
      if (this.data.areas[areaId] && this.data.areas[areaId].monsters !== undefined) {
        return this.data.areas[areaId].monsters
      }
    }

    const resolved = this._resolve(key)
    if (resolved.obj) return resolved.obj[resolved.key]
    return undefined
  }

  /**
   * 写入字段，支持 dot-notation
   * data.set('player.gold', 200)
   * data.set('gold', 200)   →  兼容旧代码
   */
  set(key, value) {
    const resolved = this._resolve(key)
    if (resolved.obj) {
      resolved.obj[resolved.key] = value
    }

    // ★ 兼容旧代码：fieldMonsters_${areaId} 同时写入 areas[areaId].monsters
    if (typeof key === 'string' && key.startsWith('fieldMonsters_')) {
      const areaId = key.replace('fieldMonsters_', '')
      if (!this.data.areas[areaId]) this.data.areas[areaId] = {}
      this.data.areas[areaId].monsters = value
    }
  }

  /**
   * 删除字段（dot-notation）
   */
  delete(key) {
    const resolved = this._resolve(key)
    if (resolved.obj) {
      delete resolved.obj[resolved.key]
    }
  }

  /**
   * 剧情标记快捷方法（flags.xxx = value）
   */
  addFlag(key, value = true) {
    this.data.progression.flags[key] = value
  }

  /**
   * 剧情标记查询
   */
  hasFlag(key) {
    return !!this.data.progression.flags[key]
  }

  // ================================================================
  // dot-notation 解析器
  // ================================================================

  /**
   * 将 key（如 'player.gold' 或 'gold'）解析为
   * { obj, key }，obj 指向父对象，key 是最后一个属性名
   *
   * 旧字段兼容映射（旧 key → 新路径）：
   *   gold                    → player.gold
   *   party                   → progression.party
   *   currentChapter          → progression.currentChapter
   *   currentNode             → progression.currentNode
   *   characterStates         → characters
   *   equipmentData           → equipment
   *   introShown              → meta.introShown
   *   testUnlockAll           → meta.testUnlockAll
   *   amyDefeated             → progression.flags.amyDefeated
   *   annieDefeated           → progression.flags.annieDefeated
   *   currentBattleMonsterId  → battle.currentMonsterId
   *   battleVictory           → battle.victory
   *   droppedEquipment        → battle.droppedEquipment
   *   unlockedCats / cats      → catsDiscovered
   *   inventory / catsDiscovered → 直接对应
   *   flags                   → progression.flags
   */
  _resolve(key) {
    // 先尝试新路径（data.player.gold）
    if (key.includes('.')) {
      const parts = key.split('.')
      let obj = this.data
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj == null || typeof obj !== 'object') return { obj: null, key }
        obj = obj[parts[i]]
      }
      const lastKey = parts[parts.length - 1]
      if (obj != null && typeof obj === 'object' && lastKey in obj) {
        return { obj, key: lastKey }
      }
      return { obj: null, key }
    }

    // 旧字段映射
    const legacyMap = {
      gold:                    ['player', 'gold'],
      party:                   ['progression', 'party'],
      currentChapter:          ['progression', 'currentChapter'],
      currentNode:             ['progression', 'currentNode'],
      characterStates:         ['characters'],
      equipmentData:           ['equipment'],
      introShown:              ['meta', 'introShown'],
      testUnlockAll:           ['meta', 'testUnlockAll'],
      amyDefeated:             ['progression', 'flags', 'amyDefeated'],
      annieDefeated:           ['progression', 'flags', 'annieDefeated'],
      currentBattleMonsterId:  ['battle', 'currentMonsterId'],
      battleVictory:           ['battle', 'victory'],
      droppedEquipment:        ['battle', 'droppedEquipment'],
      unlockedCats:            ['catsDiscovered'],
      flags:                   ['progression', 'flags'],
      inventory:               ['inventory'],
      catsDiscovered:          ['catsDiscovered'],
      cats:                    ['catsDiscovered'],    // 旧字段 cats → catsDiscovered
      playTime:                ['player', 'playTime'],
      playerName:              ['player', 'name'],
      level:                   ['player', 'level'],
      exp:                     ['player', 'exp'],
    }

    const mapped = legacyMap[key]
    if (mapped) {
      let obj = this.data
      for (let i = 0; i < mapped.length - 1; i++) {
        if (obj == null) return { obj: null, key }
        obj = obj[mapped[i]]
      }
      const lastKey = mapped[mapped.length - 1]
      return { obj, key: lastKey }
    }

    // 全新字段：直接在 data 下创建（fieldMonsters_areaId 等动态字段）
    return { obj: this.data, key }
  }

  // ================================================================
  // 存档/读档/清除
  // ================================================================

  save() {
    this.data.player.playTime = (this.data.player.playTime || 0) + 1
    try {
      wx.setStorageSync(this.saveKey, JSON.stringify(this.data))
      console.log('[存档] 保存成功，版本:', this.data.version)
      return true
    } catch (e) {
      console.error('[存档] 保存失败:', e)
      return false
    }
  }

  load() {
    try {
      const raw = wx.getStorageSync(this.saveKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        this.data = this._migrate(parsed)
        if (!this._validate()) {
          console.warn('[存档] 校验失败，数据被重置')
          this.data = this._defaultData()
          return false
        }
        console.log('[存档] 读档成功，版本:', this.data.version)
        return true
      }
    } catch (e) {
      console.error('[存档] 读档失败:', e)
    }
    this.data = this._defaultData()
    return false
  }

  hasSave() {
    try {
      return !!wx.getStorageSync(this.saveKey)
    } catch (e) {
      return false
    }
  }

  clear() {
    this.data = this._defaultData()
    try {
      wx.removeStorageSync(this.saveKey)
      console.log('[存档] 清除成功')
      return true
    } catch (e) {
      console.error('[存档] 清除失败:', e)
      return false
    }
  }

  // ================================================================
  // 版本迁移（当存档 version < 当前 version 时执行）
  // ================================================================

  /**
   * 从旧版存档迁移到新版数据结构
   * 旧版：所有字段平铺在 this.data 根级别
   * 新版：字段按功能域分区到 this.data.player / progression 等
   */
  _migrate(old) {
    // 已经是新版结构（version >= 1）且有 player 字段，直接用 mergeDefaults 补全
    if (old.version >= 1 && old.player) {
      return this._mergeDefaults(old, this._defaultData())
    }

    // ★ 从旧版 v0 迁移到 v1
    console.log('[存档迁移] v0 → v1，开始转换数据结构...')

    const d = this._defaultData()

    // player 域
    if (old.playerName != null)     d.player.name = old.playerName
    if (old.level != null)          d.player.level = old.level
    if (old.exp != null)            d.player.exp = old.exp
    if (old.gold != null)           d.player.gold = old.gold
    if (old.playTime != null)       d.player.playTime = old.playTime

    // progression 域
    if (old.currentChapter != null) d.progression.currentChapter = old.currentChapter
    if (old.currentNode != null)    d.progression.currentNode = old.currentNode
    if (old.party != null)          d.progression.party = old.party
    if (old.flags)                  d.progression.flags = { ...d.progression.flags, ...old.flags }
    if (old.amyDefeated != null)    d.progression.flags.amyDefeated = old.amyDefeated
    if (old.annieDefeated != null)  d.progression.flags.annieDefeated = old.annieDefeated

    // characters / equipment
    if (old.characterStates)        d.characters = old.characterStates
    if (old.equipmentData)         d.equipment = old.equipmentData

    // inventory / catsDiscovered
    if (old.inventory)             d.inventory = old.inventory
    if (old.catsDiscovered)        d.catsDiscovered = old.catsDiscovered
    if (old.unlockedCats)         d.catsDiscovered = old.unlockedCats

    // meta
    if (old.introShown != null)    d.meta.introShown = old.introShown
    if (old.testUnlockAll != null) d.meta.testUnlockAll = old.testUnlockAll

    // battle
    if (old.currentBattleMonsterId) d.battle.currentMonsterId = old.currentBattleMonsterId
    if (old.battleVictory != null) d.battle.victory = old.battleVictory
    if (old.droppedEquipment != null) d.battle.droppedEquipment = old.droppedEquipment

    // areas（fieldMonsters_xxx 散落在根级别，收集所有 fieldMonsters_*）
    const areaKeys = Object.keys(old).filter(k => k.startsWith('fieldMonsters_'))
    areaKeys.forEach(k => {
      const areaId = k.replace('fieldMonsters_', '')
      if (!d.areas[areaId]) d.areas[areaId] = {}
      d.areas[areaId].monsters = old[k]
    })

    d.version = 1
    console.log('[存档迁移] v0→v1 完成，覆盖字段数:', Object.keys(old).length)
    return d
  }

  /**
   * 用默认值补全缺失字段（迁移后字段补全 + 未来版本升级用）
   */
  _mergeDefaults(stored, defaults) {
    const result = JSON.parse(JSON.stringify(defaults))  // 深拷贝默认值
    for (const key of Object.keys(stored)) {
      if (stored[key] !== undefined) {
        result[key] = stored[key]
      }
    }
    return result
  }

  /**
   * ★ 存档数据校验
   * 返回 false = 数据损坏，直接回退到默认值
   * 核心类型错误都兜住，防止 NaN / 崩溃
   */
  _validate() {
    const d = this.data
    try {
      // number 字段：必须是 number
      if (typeof d.player?.gold !== 'number' || isNaN(d.player.gold) || d.player.gold < 0) {
        console.warn('[存档校验] player.gold 无效:', d.player?.gold)
        return false
      }
      if (typeof d.player?.level !== 'number' || d.player.level < 1) {
        console.warn('[存档校验] player.level 无效:', d.player?.level)
        return false
      }
      if (typeof d.player?.exp !== 'number' || isNaN(d.player.exp)) {
        console.warn('[存档校验] player.exp 无效:', d.player?.exp)
        return false
      }
      if (typeof d.progression?.currentChapter !== 'number' || d.progression.currentChapter < 1) {
        console.warn('[存档校验] progression.currentChapter 无效')
        return false
      }

      // array 字段：必须是数组
      if (!Array.isArray(d.progression?.party)) {
        console.warn('[存档校验] progression.party 不是数组')
        return false
      }
      if (!Array.isArray(d.characters)) {
        console.warn('[存档校验] characters 不是数组')
        return false
      }
      if (!Array.isArray(d.equipment)) {
        console.warn('[存档校验] equipment 不是数组')
        return false
      }
      if (!Array.isArray(d.inventory)) {
        console.warn('[存档校验] inventory 不是数组')
        return false
      }
      if (!Array.isArray(d.catsDiscovered)) {
        console.warn('[存档校验] catsDiscovered 不是数组')
        return false
      }

      // object 字段：必须是对象
      if (typeof d.progression?.flags !== 'object' || d.progression.flags === null) {
        console.warn('[存档校验] progression.flags 不是对象')
        return false
      }
      if (typeof d.meta !== 'object' || d.meta === null) {
        console.warn('[存档校验] meta 不是对象')
        return false
      }
      if (typeof d.battle !== 'object' || d.battle === null) {
        console.warn('[存档校验] battle 不是对象')
        return false
      }
      if (typeof d.areas !== 'object' || d.areas === null) {
        console.warn('[存档校验] areas 不是对象')
        return false
      }

      // boolean 字段
      if (typeof d.meta?.introShown !== 'boolean') {
        console.warn('[存档校验] meta.introShown 不是布尔值')
        return false
      }
      if (typeof d.meta?.testUnlockAll !== 'boolean') {
        console.warn('[存档校验] meta.testUnlockAll 不是布尔值')
        return false
      }

      // party 数组内容：每个元素必须是 number（角色配置索引）
      if (!d.progression.party.every(n => typeof n === 'number')) {
        console.warn('[存档校验] progression.party 包含非数字元素')
        return false
      }

      return true
    } catch (e) {
      console.error('[存档校验] 校验过程出错:', e)
      return false
    }
  }
}
