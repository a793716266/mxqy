/**
 * equipment-manager.js - 装备管理器
 * 管理角色的装备槽位、装备穿戴/卸下、属性计算
 */

import { EQUIPMENT_CH1, RARITY_CONFIG, EQUIP_TYPE_CONFIG } from '../data/equipment.js'

/**
 * 装备管理器类
 */
export class EquipmentManager {
  constructor() {
    this.unequippedItems = [] // 未装备的物品列表
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
   */
  _applyStats(character, equipment) {
    const stats = equipment.stats
    if (!stats) return

    if (stats.atk) character.atk += stats.atk
    if (stats.def) character.def += stats.def
    if (stats.maxHp) {
      character.maxHp += stats.maxHp
      character.hp = character.maxHp  // 穿戴装备时回满血
    }
    if (stats.maxMp) {
      character.maxMp += stats.maxMp
      character.mp = character.maxMp  // 穿戴装备时回满魔力
    }
    if (stats.spd) character.spd += stats.spd
    if (stats.crit) character.crit = (character.crit || 0) + stats.crit
  }

  /**
   * 移除装备属性加成
   */
  _removeStats(character, equipment) {
    const stats = equipment.stats
    if (!stats) return

    if (stats.atk) character.atk -= stats.atk
    if (stats.def) character.def -= stats.def
    if (stats.maxHp) {
      character.maxHp -= stats.maxHp
      character.hp = Math.min(character.hp, character.maxHp)
    }
    if (stats.maxMp) {
      character.maxMp -= stats.maxMp
      character.mp = Math.min(character.mp, character.maxMp)
    }
    if (stats.spd) character.spd -= stats.spd
    if (stats.crit) character.crit = Math.max(0, (character.crit || 0) - stats.crit)
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
   * 获取角色装备总属性
   */
  getTotalEquipmentStats(character) {
    const total = {
      atk: 0,
      def: 0,
      maxHp: 0,
      maxMp: 0,
      spd: 0,
      crit: 0
    }

    if (!character.equipment) return total

    for (const slot in character.equipment) {
      const equipment = character.equipment[slot]
      if (equipment && equipment.stats) {
        for (const stat in equipment.stats) {
          total[stat] = (total[stat] || 0) + equipment.stats[stat]
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
      unequippedItems: this.unequippedItems.map(item => item.id)
    }
  }
}

// 单例
export const equipmentManager = new EquipmentManager()
