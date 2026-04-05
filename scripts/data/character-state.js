/**
 * character-state.js - 角色状态管理
 * 管理角色的等级、经验、属性成长等
 */

import { HEROES } from './heroes.js'
import { EQUIPMENT_CH1 } from './equipment.js'
import { equipmentManager } from '../managers/equipment-manager.js'

// 经验值需求表（等级 -> 升级所需经验）
// 提高经验值需求，使升级速度更合理
const EXP_TABLE = {
  1: 100,   // 1级→2级：打死约10只小怪（每只10经验）
  2: 150,   // 2级→3级：打死约15只小怪
  3: 250,   // 3级→4级：打死约25只小怪
  4: 400,   // 4级→5级：打死约40只小怪
  5: 600,   // 5级→6级：打死约60只小怪
  6: 850,   // 6级→7级：打死约85只小怪
  7: 1150,  // 7级→8级：打死约115只小怪
  8: 1500,  // 8级→9级：打死约150只小怪
  9: 1900,  // 9级→10级：打死约190只小怪
  10: 2400, // 10级→11级
  // 可以继续扩展...
}

// 属性成长率（每升一级增加的百分比）
const GROWTH_RATE = {
  warrior: { hp: 0.12, mp: 0.05, atk: 0.08, def: 0.10, spd: 0.03 },
  mage: { hp: 0.08, mp: 0.15, atk: 0.12, def: 0.05, spd: 0.06 },
  healer: { hp: 0.10, mp: 0.12, atk: 0.05, def: 0.08, spd: 0.07 },
  tank: { hp: 0.15, mp: 0.03, atk: 0.05, def: 0.12, spd: 0.02 }
}

/**
 * 角色状态类
 */
export class CharacterState {
  constructor(heroData) {
    // 基础数据
    this.id = heroData.id
    this.name = heroData.name
    this.title = heroData.title
    this.role = heroData.role
    this.avatar = heroData.avatar
    this.skills = heroData.skills
    this.unlockChapter = heroData.unlockChapter
    
    // 等级系统
    this.level = 1
    this.exp = 0
    this.maxExp = EXP_TABLE[1]
    
    // 基础属性
    this.baseMaxHp = heroData.maxHp
    this.baseMaxMp = heroData.maxMp
    this.baseAtk = heroData.atk
    this.baseDef = heroData.def
    this.baseSpd = heroData.spd
    
    // 当前属性（包含等级加成）
    this.maxHp = heroData.maxHp
    this.maxMp = heroData.maxMp
    this.atk = heroData.atk
    this.def = heroData.def
    this.spd = heroData.spd
    
    // 当前状态
    this.hp = this.maxHp
    this.mp = this.maxMp
    this.buffs = []
    
    // 装备槽
    this.equipment = {
      weapon: null,   // 武器
      armor: null,    // 防具
      accessory: null // 饰品
    }
    
    // 暴击率（基础为0，可由装备提升）
    this.crit = 0
  }
  
  /**
   * 获得经验值
   */
  gainExp(amount) {
    console.log(`[CharacterState] ${this.name} 获得 ${amount} 经验值，当前 ${this.exp}/${this.maxExp}`)
    this.exp += amount
    
    // 检查升级
    let levelUpCount = 0
    while (this.exp >= this.maxExp && this.level < 99) {
      console.log(`[CharacterState] ${this.name} 升级！${this.exp}/${this.maxExp} -> 升级`)
      this.exp -= this.maxExp
      this.level++
      this.maxExp = EXP_TABLE[this.level] || EXP_TABLE[10] // 超过10级用10级的经验表
      this._applyLevelUp()
      levelUpCount++
    }
    
    return levelUpCount
  }
  
  /**
   * 应用升级效果
   */
  _applyLevelUp() {
    const growth = GROWTH_RATE[this.role] || GROWTH_RATE.warrior
    
    // 属性成长
    this.maxHp = Math.floor(this.baseMaxHp * (1 + growth.hp * (this.level - 1)))
    this.maxMp = Math.floor(this.baseMaxMp * (1 + growth.mp * (this.level - 1)))
    this.atk = Math.floor(this.baseAtk * (1 + growth.atk * (this.level - 1)))
    this.def = Math.floor(this.baseDef * (1 + growth.def * (this.level - 1)))
    this.spd = Math.floor(this.baseSpd * (1 + growth.spd * (this.level - 1)))
    
    // 升级时恢复满状态
    this.hp = this.maxHp
    this.mp = this.maxMp
    
    console.log(`${this.name} 升级到 Lv.${this.level}!`)
    
    // 重新应用装备属性（因为基础属性改变了）
    equipmentManager.recalculateEquipmentStats(this)
    console.log(`[CharacterState] 重新应用装备属性`)
  }
  
  /**
   * 获取经验进度（0-1）
   */
  getExpProgress() {
    return this.exp / this.maxExp
  }
  
  /**
   * 序列化（保存用）
   */
  serialize() {
    return {
      id: this.id,
      level: this.level,
      exp: this.exp,
      hp: this.hp,
      mp: this.mp,
      buffs: this.buffs,
      equipment: {
        weapon: this.equipment.weapon ? this.equipment.weapon.id : null,
        armor: this.equipment.armor ? this.equipment.armor.id : null,
        accessory: this.equipment.accessory ? this.equipment.accessory.id : null
      }
    }
  }
  
  /**
   * 反序列化（加载用）
   */
  static deserialize(data, heroData) {
    const state = new CharacterState(heroData)
    state.level = data.level
    state.exp = data.exp
    state.maxExp = EXP_TABLE[data.level] || EXP_TABLE[10]
    
    // 重新计算属性
    const growth = GROWTH_RATE[state.role] || GROWTH_RATE.warrior
    state.maxHp = Math.floor(state.baseMaxHp * (1 + growth.hp * (state.level - 1)))
    state.maxMp = Math.floor(state.baseMaxMp * (1 + growth.mp * (state.level - 1)))
    state.atk = Math.floor(state.baseAtk * (1 + growth.atk * (state.level - 1)))
    state.def = Math.floor(state.baseDef * (1 + growth.def * (state.level - 1)))
    state.spd = Math.floor(state.baseSpd * (1 + growth.spd * (state.level - 1)))
    
    state.hp = data.hp
    state.mp = data.mp
    state.buffs = data.buffs || []
    
    // 加载装备
    if (data.equipment) {
      if (data.equipment.weapon) {
        state.equipment.weapon = EQUIPMENT_CH1[data.equipment.weapon]
      }
      if (data.equipment.armor) {
        state.equipment.armor = EQUIPMENT_CH1[data.equipment.armor]
      }
      if (data.equipment.accessory) {
        state.equipment.accessory = EQUIPMENT_CH1[data.equipment.accessory]
      }
      
      // 应用装备属性
      equipmentManager.recalculateEquipmentStats(state)
    }
    
    return state
  }
}

/**
 * 角色状态管理器
 */
export class CharacterStateManager {
  constructor() {
    this.characters = new Map()
    this._initialized = false
  }
  
  /**
   * 初始化角色状态
   */
  init(savedData = null) {
    if (this._initialized) return
    
    // 加载存档或创建新角色
    if (savedData && savedData.characters) {
      for (const charData of savedData.characters) {
        const heroData = HEROES.find(h => h.id === charData.id)
        if (heroData) {
          const state = CharacterState.deserialize(charData, heroData)
          this.characters.set(charData.id, state)
        }
      }
    } else {
      // 默认解锁前两个角色
      for (let i = 0; i < 2; i++) {
        const heroData = HEROES[i]
        const state = new CharacterState(heroData)
        this.characters.set(heroData.id, state)
        
        // ========== 测试用：给臻宝添加最佳装备（上线前删除）==========
        if (heroData.id === 'zhenbao') {
          // 添加传说级别装备
          const bestEquipments = [
            EQUIPMENT_CH1.sunlight_blade,   // 阳光之刃（武器）
            EQUIPMENT_CH1.sunlight_armor,   // 阳光圣甲（防具）
            EQUIPMENT_CH1.sunlight_pendant  // 阳光吊坠（饰品）
          ]
          
          // 先添加到背包，再穿戴
          for (const equip of bestEquipments) {
            equipmentManager.addItem(equip.id)
            equipmentManager.equip(state, equip)
          }
          
          console.log(`[CharacterState][测试] ${state.name} 已装备最佳装备`)
        }
        // ============================================================
      }
    }
    
    this._initialized = true
    console.log(`[CharacterState] 初始化了 ${this.characters.size} 个角色`)
  }
  
  /**
   * 获取角色状态
   */
  getCharacter(id) {
    return this.characters.get(id)
  }
  
  /**
   * 获取所有角色
   */
  getAllCharacters() {
    return Array.from(this.characters.values())
  }
  
  /**
   * 解锁新角色
   */
  unlockCharacter(heroId) {
    if (this.characters.has(heroId)) {
      console.log(`[CharacterState] 角色 ${heroId} 已解锁`)
      return false
    }
    
    const heroData = HEROES.find(h => h.id === heroId)
    if (!heroData) {
      console.error(`[CharacterState] 找不到角色数据: ${heroId}`)
      return false
    }
    
    const state = new CharacterState(heroData)
    this.characters.set(heroId, state)
    console.log(`[CharacterState] 解锁新角色: ${heroData.name}`)
    return true
  }
  
  /**
   * 序列化所有角色状态
   */
  serialize() {
    const characters = []
    for (const state of this.characters.values()) {
      characters.push(state.serialize())
    }
    return { characters }
  }
}

// 单例
export const charStateManager = new CharacterStateManager()
