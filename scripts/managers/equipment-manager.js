/**
 * equipment-manager.js - 装备管理器
 * 管理角色的装备槽位、装备穿戴/卸下、属性计算
 */

import { EQUIPMENT_CH1, RARITY_CONFIG, EQUIP_TYPE_CONFIG } from '../data/equipment.js'

// ★ 强化系统：每级 +10% 装备全词条（含百分比词条），上限 +10
export const ENHANCE_MAX_LEVEL = 10
export const ENHANCE_STEP = 0.10
// ★ 强化消耗材料（类似 DNF 强化器）：金币（enhanceCost）+ 固定数量材料
export const ENHANCE_MATERIAL_ID = 'flame_core'   // 火焰核心（复用现有掉落物，无需新增定义）
export const ENHANCE_MATERIAL_COST = 3            // 每级固定消耗 3 个


/**
 * 装备管理器类
 */
export class EquipmentManager {
  constructor() {
    this.unequippedItems = [] // 未装备的物品列表
    this.enhanceLevels = {}   // ★ 强化等级表：{ [equipmentId]: level }（按模板 id 全局共享）
    this._initialized = false
  }

  /**
   * 初始化装备管理器
   */
  init(savedData = null) {
    if (this._initialized) return

    if (savedData && savedData.unequippedItems) {
      this.unequippedItems = savedData.unequippedItems.map(itemId => EQUIPMENT_CH1[itemId]).filter(Boolean)
    }
    // ★ 强化等级表（兼容旧存档：无该字段则空表）
    if (savedData && savedData.enhanceLevels && typeof savedData.enhanceLevels === 'object') {
      this.enhanceLevels = {}
      for (const k in savedData.enhanceLevels) {
        const v = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.floor(savedData.enhanceLevels[k] || 0)))
        if (v > 0) this.enhanceLevels[k] = v
      }
    }

    this._initialized = true
    console.log(`[EquipmentManager] 初始化完成，背包有 ${this.unequippedItems.length} 件装备`)
  }

  /**
   * 添加装备到背包
   */
  addItem(equipmentId) {
    const equipment = EQUIPMENT_CH1[equipmentId]
    if (!equipment) {
      console.error(`[EquipmentManager] 装备不存在: ${equipmentId}`)
      return false
    }

    this.unequippedItems.push(equipment)
    console.log(`[EquipmentManager] 获得装备: ${equipment.name}`)
    return true
  }

  /**
   * 从背包移除装备
   */
  removeItem(equipmentId) {
    const index = this.unequippedItems.findIndex(item => item.id === equipmentId)
    if (index === -1) {
      console.error(`[EquipmentManager] 背包中没有装备: ${equipmentId}`)
      return false
    }

    this.unequippedItems.splice(index, 1)
    return true
  }

  /**
   * 穿戴装备
   * @param {CharacterState} character - 角色对象
   * @param {Object} equipment - 装备对象
   * @returns {Object|null} 返回被替换的装备，如果没有则返回null
   */
  equip(character, equipment) {
    if (!character || !equipment) {
      console.error('[EquipmentManager] 无效的角色或装备')
      return null
    }

    // 初始化装备槽
    if (!character.equipment) {
      character.equipment = {
        weapon: null,
        armor: null,
        accessory: null
      }
    }

    const slot = equipment.type
    const currentEquip = character.equipment[slot]

    // 移除当前装备的属性加成
    if (currentEquip) {
      this._removeStats(character, currentEquip)
    }

    // 穿戴新装备
    character.equipment[slot] = equipment

    // 应用新装备的属性加成
    this._applyStats(character, equipment)

    // 从背包移除
    this.removeItem(equipment.id)

    // ★ 若槽内已有旧装备，换下后自动回归背包（避免换装丢装备）
    if (currentEquip) {
      this.unequippedItems.push(currentEquip)
    }

    console.log(`[EquipmentManager] ${character.name} 穿戴了 ${equipment.name}`)

    return currentEquip
  }

  /**
   * 卸下装备
   * @param {CharacterState} character - 角色对象
   * @param {string} slot - 装备槽位
   * @returns {Object|null} 返回卸下的装备
   */
  unequip(character, slot) {
    if (!character || !character.equipment) {
      return null
    }

    const equipment = character.equipment[slot]
    if (!equipment) {
      return null
    }

    // 移除属性加成
    this._removeStats(character, equipment)

    // 卸下装备
    character.equipment[slot] = null

    // 添加到背包
    this.unequippedItems.push(equipment)

    console.log(`[EquipmentManager] ${character.name} 卸下了 ${equipment.name}`)

    return equipment
  }

  /**
   * 应用装备属性加成
   * ★ 全词条生效：atk/matk/def/maxHp/maxMp/spd/crit/mpRegen/hpRegen/lifesteal/cdr
   * ★ 强化乘区：所有词条按 (1 + 0.10×强化等级) 放大（整数词条四舍五入，百分比词条保留浮点）
   */
  _applyStats(character, equipment) {
    const stats = equipment.stats
    if (!stats) return
    const mult = this._enhanceMult(equipment)
    const _iv = (v) => Math.round(v * mult)   // 整数词条（含 spd 负值：round 对称，可逆）
    const _fv = (v) => v * mult               // 百分比词条

    if (stats.atk) character.atk += _iv(stats.atk)
    if (stats.matk) character.matk = (character.matk || 0) + _iv(stats.matk)
    if (stats.def) character.def += _iv(stats.def)
    if (stats.maxHp) {
      character.maxHp += _iv(stats.maxHp)
      character.hp = character.maxHp  // 穿戴装备时回满血
    }
    if (stats.maxMp) {
      character.maxMp += _iv(stats.maxMp)
      character.mp = character.maxMp  // 穿戴装备时回满魔力
    }
    if (stats.spd) character.spd += _iv(stats.spd)
    if (stats.crit) character.crit = (character.crit || 0) + _fv(stats.crit)
    // ★ 装备回血/回蓝属性：累加到英雄实例（hero.hpRegen/mpRegen），供战斗系统被动回复读取。
    //   ★ 无基线：英雄本身不带 mpRegen/hpRegen 默认值（character-state 不初始化），
    //   因此"未装备回血/回蓝装备 → 这两个值=0 → 副本内不自动回血回蓝"。
    if (stats.mpRegen) character.mpRegen = (character.mpRegen || 0) + _fv(stats.mpRegen)
    if (stats.hpRegen) character.hpRegen = (character.hpRegen || 0) + _fv(stats.hpRegen)
    // ★ 吸血（按造成伤害比例回血）/ 冷却缩减（技能 CD 缩短）
    if (stats.lifesteal) character.lifesteal = (character.lifesteal || 0) + _fv(stats.lifesteal)
    if (stats.cdr) character.cdr = (character.cdr || 0) + _fv(stats.cdr)
  }

  /**
   * 移除装备属性加成（与 _applyStats 严格对称，可逆）
   */
  _removeStats(character, equipment) {
    const stats = equipment.stats
    if (!stats) return
    const mult = this._enhanceMult(equipment)
    const _iv = (v) => Math.round(v * mult)
    const _fv = (v) => v * mult

    if (stats.atk) character.atk -= _iv(stats.atk)
    if (stats.matk) character.matk = Math.max(0, (character.matk || 0) - _iv(stats.matk))
    if (stats.def) character.def -= _iv(stats.def)
    if (stats.maxHp) {
      character.maxHp -= _iv(stats.maxHp)
      character.hp = Math.min(character.hp, character.maxHp)
    }
    if (stats.maxMp) {
      character.maxMp -= _iv(stats.maxMp)
      character.mp = Math.min(character.mp, character.maxMp)
    }
    if (stats.spd) character.spd -= _iv(stats.spd)
    if (stats.crit) character.crit = Math.max(0, (character.crit || 0) - _fv(stats.crit))
    if (stats.mpRegen) character.mpRegen = Math.max(0, (character.mpRegen || 0) - _fv(stats.mpRegen))
    if (stats.hpRegen) character.hpRegen = Math.max(0, (character.hpRegen || 0) - _fv(stats.hpRegen))
    if (stats.lifesteal) character.lifesteal = Math.max(0, (character.lifesteal || 0) - _fv(stats.lifesteal))
    if (stats.cdr) character.cdr = Math.max(0, (character.cdr || 0) - _fv(stats.cdr))
  }

  // ======== 强化系统 ========

  /** 强化乘数：1 + 0.10 × 当前强化等级（未强化=1） */
  _enhanceMult(equipment) {
    const lv = (equipment && equipment.id && this.enhanceLevels[equipment.id]) || 0
    return 1 + ENHANCE_STEP * lv
  }

  /** 获取装备当前强化等级 */
  getEnhanceLevel(equipmentId) {
    return (equipmentId && this.enhanceLevels[equipmentId]) || 0
  }

  /** 是否可继续强化（存在且未满级） */
  canEnhance(equipment) {
    return !!equipment && this.getEnhanceLevel(equipment.id) < ENHANCE_MAX_LEVEL
  }

  /** 下一级强化费用：装备价格 × 0.4 × (当前等级+1)，向上取整 */
  enhanceCost(equipment) {
    if (!equipment) return Infinity
    const lv = this.getEnhanceLevel(equipment.id)
    return Math.ceil((equipment.price || 100) * 0.4 * (lv + 1))
  }

  /**
   * 强化装备：先按旧等级移除属性 → 升级 → 按新等级重应用。
   * @returns {{ok:boolean, reason?:string, level?:number, cost?:number}}
   *   调用方负责扣金币与持久化（characterStates + equipmentData + gold）。
   */
  enhance(character, equipment) {
    if (!equipment) return { ok: false, reason: '无效装备' }
    if (!this.canEnhance(equipment)) return { ok: false, reason: '已达最高强化等级', level: ENHANCE_MAX_LEVEL }
    const cost = this.enhanceCost(equipment)
    if (character && character.equipment) {
      // 只对"角色身上穿戴中"的装备重算属性（背包里的强化下次穿戴时生效）
      const slot = Object.keys(character.equipment).find(s => character.equipment[s] === equipment)
      if (slot) this._removeStats(character, equipment)
      this.enhanceLevels[equipment.id] = this.getEnhanceLevel(equipment.id) + 1
      if (slot) this._applyStats(character, equipment)
    } else {
      this.enhanceLevels[equipment.id] = this.getEnhanceLevel(equipment.id) + 1
    }
    console.log(`[EquipmentManager] ${equipment.name} 强化至 +${this.enhanceLevels[equipment.id]}（费用 ${cost} 金币）`)
    return { ok: true, level: this.enhanceLevels[equipment.id], cost }
  }

  /**
   * 重新计算角色所有装备属性
   * 用于角色升级后重新应用装备加成
   */
  recalculateEquipmentStats(character) {
    if (!character.equipment) return

    // 先移除所有装备属性
    for (const slot in character.equipment) {
      const equipment = character.equipment[slot]
      if (equipment) {
        this._removeStats(character, equipment)
      }
    }

    // 再重新应用所有装备属性
    for (const slot in character.equipment) {
      const equipment = character.equipment[slot]
      if (equipment) {
        this._applyStats(character, equipment)
      }
    }
  }

  /**
   * 获取角色装备总属性（含强化乘区）
   */
  getTotalEquipmentStats(character) {
    const total = {
      atk: 0,
      matk: 0,
      def: 0,
      maxHp: 0,
      maxMp: 0,
      spd: 0,
      crit: 0,
      mpRegen: 0,
      hpRegen: 0,
      lifesteal: 0,
      cdr: 0
    }

    if (!character.equipment) return total

    for (const slot in character.equipment) {
      const equipment = character.equipment[slot]
      if (equipment && equipment.stats) {
        const mult = this._enhanceMult(equipment)
        for (const stat in equipment.stats) {
          total[stat] = (total[stat] || 0) + equipment.stats[stat] * mult
        }
      }
    }

    return total
  }

  /**
   * 获取背包装备列表
   */
  getInventory() {
    return this.unequippedItems
  }

  /**
   * 获取背包装备（按类型分组）
   */
  getInventoryByType() {
    const grouped = {
      weapon: [],
      armor: [],
      accessory: []
    }

    for (const item of this.unequippedItems) {
      if (grouped[item.type]) {
        grouped[item.type].push(item)
      }
    }

    return grouped
  }

  /**
   * 序列化（保存用）
   */
  serialize() {
    return {
      unequippedItems: this.unequippedItems.map(item => item.id),
      enhanceLevels: this.enhanceLevels
    }
  }
}

// 单例
export const equipmentManager = new EquipmentManager()
