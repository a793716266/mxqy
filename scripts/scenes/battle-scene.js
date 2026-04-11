/**
 * battle-scene.js - 实时自由攻击战斗系统（ARPG）
 */

import { ENEMIES_CH1 } from '../data/enemies.js'
import { charStateManager } from '../data/character-state.js'
import { getBossDrop, getRandomEquipment } from '../data/equipment.js'

export class BattleScene {
  constructor(game, data) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0

    // 战斗数据
    this.party = data.party || []
    // 支持多敌人：优先使用 enemies 数组，兼容旧的 enemy 单数
    this.enemies = data.enemies || (data.enemy ? [data.enemy] : [])
    this.enemy = this.enemies[0] || {}  // 主敌人（兼容现有代码）
    this.bgKey = data.bg || 'BG_GRASSLAND' // 直接使用资源 key
    this.nodeId = data.nodeId
    this.monsterId = data.monsterId  // ⚠️ 保存怪物ID，用于感化剧情

    // 战斗状态（实时制）
    this.phase = 'intro'  // intro, auto_battle, animating, victory, defeat, purify
    this.turn = 1
    this.selectedHero = null
    this.selectedSkill = null
    this.actionQueue = []

    // 实时战斗控制
    this.battleSpeed = 1        // 1x 或 2x 加速
    this.isPaused = false       // 暂停状态
    this.battleTime = 0         // 战斗时长（秒）
    this.MAX_CONCURRENT_ATTACKS = 2  // 同时最大攻击动画数
    this.activeAttackers = new Set()   // 正在执行攻击动画的单位ID集合

    // 角色攻击计时器 { heroId: { attackTimer: number, skillCDs: { skillId: number } } }
    this.heroAttackTimers = {}
    // 敌人攻击计时器 { enemyIndex: { attackTimer: number, skillCDs: {...}, isAttacking: bool } }
    this.enemyAttackTimers = {}

    // 状态效果系统
    this.statusEffects = {
      enemies: {},  // 敌人的状态效果，key是敌人索引，value是效果数组
      heroes: {}    // 己方角色的状态效果，key是角色索引，value是效果数组
      // 格式: { type: 'burn'|'freeze'|'slimed'|'restricted', duration: number, data: {...} }
    }

    // ====== 实时距离战斗系统 ======
    this.unitStates = {}  // 每个单位的实时状态 { x, y, targetX, baseX, state, ... }
    this.MELEE_RANGE = 95 * this.dpr       // 近战攻击范围（足够让精灵接触）
    this.RANGED_RANGE = 280 * this.dpr      // 远程攻击范围  
    this.MOVE_SPEED = 200                  // 移动速度(像素/秒)

    // 动画
    this.shakeAmount = 0
    this.damageTexts = []
    this.flashAlpha = 0

    // 滚动日志
    this.log = []
    this.logScroll = 0

    // 敌人动画位置 - 调整到右上方更居中的位置
    this.enemyBaseX = this.width * 0.7
    this.enemyBaseY = this.height * 0.28
    this.enemyX = this.enemyBaseX
    this.enemyY = this.enemyBaseY

    // 按钮区域
    this.skillButtons = []
    this.targetAreas = []
    this.heroAreas = []

    // 攻击动画
    this.attackingHero = null  // 正在攻击的角色
    this.attackAnim = null     // 动画状态
    this.heroBasePositions = [] // 角色基础位置

    // 敌人攻击动画
    this.enemyAttacking = false
    this.enemyAttackAnim = null
    this.enemyAttackTarget = null
    
    // 多敌人攻击队列
    this.enemyAttackQueue = []
    this.currentEnemyIndex = 0
    
    // 角色分页系统
    this.heroPage = 0  // 当前页码
    this.heroPerPage = 3  // 每页显示3个角色
    this.totalHeroPages = Math.ceil((this.party.length || 0) / this.heroPerPage)

    // 敌人动画系统
    this.enemyAnimStates = {}  // 敌人动画状态
    this._initEnemyAnimations()

    // 角色动画系统（移动动画帧）
    this.heroAnimStates = {}   // 角色动画状态
    this._initHeroAnimations()

    // 敌人HP延迟过渡动画（DNF风格多段血条）
    this.enemyHpDelay = this.enemies.map(e => {
      const currentSegment = e.hp <= 0 ? 0 : Math.floor((e.hp - 1) / 100)
      return { delay: 1.0, lastSegment: currentSegment }
    })
    // 敌人退场动画（渐渐透明）
    this.enemyDeathAnim = this.enemies.map(() => ({ alpha: 1.0, fading: false, timer: 0 }))
    // 己方HP/MP延迟过渡动画
    this.heroHpDelay = this.party.map(h => h.hp / h.maxHp)
    this.heroMpDelay = this.party.map(h => h.mp / h.maxMp)

    // 代码特效系统（粒子/形状动画，无需图片资源）
    this.codeEffects = []
  }

  /**
   * 初始化敌人动画
   */
  _initEnemyAnimations() {
    this.enemies.forEach((enemy, index) => {
      // 检查是否是史莱姆猫
      if (enemy.id === 'slime_cat' || enemy.type === 'slime_cat') {
        this.enemyAnimStates[index] = {
          type: 'slime_cat',
          state: 'idle',  // idle, attack, skill, walk
          frame: 1,
          frameTimer: 0,
          frameDuration: 100,  // 100ms一帧（更流畅）
          attackDamageApplied: false,  // 攻击伤害是否已结算
          onAttackComplete: null  // 攻击完成回调
        }
      }
      // 检查是否是暗影鼠
      if (enemy.id === 'shadow_mouse' || enemy.type === 'shadow_mouse') {
        this.enemyAnimStates[index] = {
          type: 'shadow_mouse',
          state: 'idle',  // idle, attack, skill, walk
          frame: 1,
          frameTimer: 0,
          frameDuration: 100,  // 100ms一帧
          attackDamageApplied: false,
          onAttackComplete: null
        }
      }
      // 检查是否是野猫
      if (enemy.id === 'wild_cat') {
        this.enemyAnimStates[index] = {
          type: 'wild_cat',
          state: 'idle',  // 野猫只有idle帧动画，攻击用默认跳跃
          frame: 1,
          frameTimer: 0,
          frameDuration: 120,  // 120ms一帧
          attackDamageApplied: false,
          onAttackComplete: null
        }
      }
    })
  }

  /**
   * 初始化角色动画状态
   */
  _initHeroAnimations() {
    this.party.forEach(hero => {
      this.heroAnimStates[hero.id] = {
        type: hero.id,  // zhenbao, lixiaobao 等
        state: 'idle',  // idle, walk（不再有cast状态）
        frame: 0,
        frameTimer: 0,
        frameDuration: 80,  // 80ms一帧（流畅）
        totalWalkFrames: hero.id === 'zhenbao' ? 10 : (hero.id === 'lixiaobao' ? 8 : 8),
        totalIdleFrames: hero.id === 'zhenbao' ? 5 : (hero.id === 'lixiaobao' ? 2 : 0),
      }
    })
  }

  init() {
    console.log('[Battle] 初始化实时战斗场景')
    console.log('[Battle] party:', this.party)
    console.log('[Battle] enemies:', this.enemies)
    
    // 安全检查：确保 party 存在
    if (!this.party || !Array.isArray(this.party)) {
      console.error('[Battle] party 数据不存在或不是数组')
      this.party = []
    }
    
    // 初始化所有敌人的当前HP
    this.enemies = this.enemies.map(enemy => {
      if (!enemy.hp) {
        enemy.hp = enemy.maxHp
      }
      return enemy
    })
    
    // 更新主敌人引用
    this.enemy = this.enemies[0] || {}
    
    // 确保队伍成员有当前HP和MP（防止溢出maxHp/maxMp）
    this.party = this.party.map(h => ({
      ...h,
      hp: Math.min(h.hp || h.maxHp, h.maxHp),
      mp: Math.min(h.mp || h.maxMp, h.maxMp),
      buffs: h.buffs || []
    }))
    
    console.log('[Battle] 处理后的 party:', this.party)
    console.log('[Battle] 处理后的 enemies:', this.enemies)
    
    // 初始化角色位置区域（分页系统）
    this._initHeroAreas()

    // 初始化角色基础位置（用于攻击动画）
    this._initAllHeroPositions()
    
    // 初始化所有敌人的位置
    this._initEnemyPositions()

    // 初始化自动战斗计时器
    this._initAutoBattleTimers()

    // 初始化距离战斗系统单位状态
    this._initUnitStates()

    this._addLog(`⚔️ 战斗开始！`)
    this._addLog(`野生的 ${this.enemies.map(e => e.name).join('、')} 出现了！`)

    // 1.5秒后进入自动战斗
    setTimeout(() => {
      this.phase = 'auto_battle'
      this.battleTime = 0
      this._addLog(`💡 自动战斗中 - 角色将自动攻击`)
    }, 1500)
  }

  // ======== 实时自动战斗系统（距离制） ========

  /**
   * 初始化距离战斗系统的单位状态
   */
  _initUnitStates() {
    // 初始化己方角色状态
    this.party.forEach((hero, i) => {
      if (!this.heroBasePositions[i]) return
      const pos = this.heroBasePositions[i]
      const isRanged = (hero.role === 'mage' || hero.role === 'healer' || hero.role === 'archer')
      this.unitStates[hero.id] = {
        x: pos.x,
        y: pos.y,
        baseX: pos.x,       // 原始站位X
        baseY: pos.y,        // 原始站位Y
        targetX: null,       // 移动目标X（null=不移动）
        targetY: null,
        state: 'idle',       // idle | moving_to_attack | attacking | returning
        isRanged: isRanged,
        attackRange: isRanged ? this.RANGED_RANGE : this.MELEE_RANGE,
        currentTargetId: null,  // 当前目标敌人索引或null
      }
    })

    // 初始化敌人状态
    this.enemies.forEach((enemy, i) => {
      if (!this.enemyPositions[i]) return
      const pos = this.enemyPositions[i]
      this.unitStates['enemy_' + i] = {
        x: pos.x,
        y: pos.y,
        baseX: pos.x,
        baseY: pos.y,
        targetX: null,
        targetY: null,
        state: 'idle',
        isRanged: enemy.isRanged || false,
        attackRange: (enemy.isRanged || enemy.role === 'mage') ? this.RANGED_RANGE : this.MELEE_RANGE,
        currentTargetId: null,
      }
    })
  }

  _getDistance(unitA, unitB) {
    const dx = unitA.x - unitB.x
    const dy = unitA.y - unitB.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * 更新单位移动和攻击状态（核心实时战斗循环）
   */
  _updateCombatUnits(dt) {
    if (this.isPaused) return
    if (this.phase !== 'auto_battle' && this.phase !== 'animating') return

    const effectiveDt = dt * this.battleSpeed
    const MOVE_SPEED = 200 * effectiveDt  // 像素/帧

    // ===== 己方角色更新 =====
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      const state = this.unitStates[hero.id]
      if (!state) continue

      switch (state.state) {
        case 'moving_to_attack':
          // 向目标移动
          if (state.targetX !== null) {
            const dx = state.targetX - state.x
            const dy = state.targetY - state.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > MOVE_SPEED) {
              state.x += (dx / dist) * MOVE_SPEED
              state.y += (dy / dist) * MOVE_SPEED
            } else {
              state.x = state.targetX
              state.y = state.targetY
              // 到达攻击位置，切换到战斗状态
              state.state = 'in_range'
              // 重置攻击计时器，准备第一击
              const timer = this.heroAttackTimers[hero.id]
              if (timer) timer.attackTimer = 0
            }
          }
          break

        case 'returning':
          // 返回原位
          const rx = state.baseX - state.x
          const ry = state.baseY - state.y
          const rDist = Math.sqrt(rx * rx + ry * ry)
          if (rDist > MOVE_SPEED) {
            state.x += (rx / rDist) * MOVE_SPEED
            state.y += (ry / rDist) * MOVE_SPEED
          } else {
            state.x = state.baseX
            state.y = state.baseY
            state.state = 'idle'
            state.currentTargetId = null
          }
          break
      }

      // 同步更新 heroBasePositions 用于渲染
      const hIdx = this.party.indexOf(hero)
      if (this.heroBasePositions[hIdx]) {
        this.heroBasePositions[hIdx].x = state.x
        this.heroBasePositions[hIdx].y = state.y
      }
    }

    // ===== 敌人更新 =====
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i]
      if (enemy.hp <= 0) continue
      const estate = this.unitStates['enemy_' + i]
      if (!estate) continue

      // 同步敌人动画状态：移动中→walk动画，其他→idle
      const eAnim = this.enemyAnimStates[i]
      if (eAnim) {
        const isMoving = (estate.state === 'moving_to_attack' || estate.state === 'returning')
        if (isMoving && eAnim.state !== 'walk') {
          eAnim.state = 'walk'
          eAnim.frame = 1
          eAnim.frameTimer = 0
          eAnim.displayFrame = 0
        } else if (!isMoving && estate.state === 'idle' && eAnim.state !== 'idle') {
          // 只有完全空闲时才切回idle（不覆盖attack/skill状态）
          eAnim.state = 'idle'
          eAnim.frame = 1
          eAnim.frameTimer = 0
        }
      }

      switch (estate.state) {
        case 'moving_to_attack':
          if (estate.targetX !== null) {
            const dx = estate.targetX - estate.x
            const dy = estate.targetY - estate.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > MOVE_SPEED) {
              estate.x += (dx / dist) * MOVE_SPEED
              estate.y += (dy / dist) * MOVE_SPEED
            } else {
              estate.x = estate.targetX
              estate.y = estate.targetY
              estate.state = 'in_range'
            }
          }
          break
        case 'returning':
          const erx = estate.baseX - estate.x
          const ery = estate.baseY - estate.y
          const erDist = Math.sqrt(erx * erx + ery * ery)
          if (erDist > MOVE_SPEED) {
            estate.x += (erx / erDist) * MOVE_SPEED
            estate.y += (ery / erDist) * MOVE_SPEED
          } else {
            estate.x = estate.baseX
            estate.y = estate.baseY
            estate.state = 'idle'
            estate.currentTargetId = null
          }
          break
      }

      // 同步更新敌人位置用于渲染
      if (this.enemyPositions[i]) {
        this.enemyPositions[i].x = estate.x
        this.enemyPositions[i].y = estate.y
      }
    }
  }

  /**
   * 检查角色是否在目标攻击范围内
   */
  _isInRange(unitState, targetState) {
    if (!targetState) return false
    const dist = this._getDistance(unitState, targetState)
    return dist <= unitState.attackRange
  }

  /**
   * 获取角色最近的存活目标
   */
  _findNearestAliveEnemy(heroState) {
    let nearestIdx = -1
    let nearestDist = Infinity
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].hp <= 0) continue
      const eState = this.unitStates['enemy_' + i]
      if (!eState) continue
      const d = this._getDistance(heroState, eState)
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = i
      }
    }
    return { index: nearestIdx, distance: nearestDist, state: nearestIdx >= 0 ? this.unitStates['enemy_' + nearestIdx] : null }
  }

  /**
   * 获取敌人最近的存活目标
   */
  _findNearestAliveHero(enemyState) {
    let nearestHero = null
    let nearestDist = Infinity
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      const hState = this.unitStates[hero.id]
      if (!hState) continue
      const d = this._getDistance(enemyState, hState)
      if (d < nearestDist) {
        nearestDist = d
        nearestHero = hero
      }
    }
    return { hero: nearestHero, distance: nearestDist, state: nearestHero ? this.unitStates[nearestHero.id] : null }
  }

  _initAutoBattleTimers() {
    // 初始化每个己方角色的攻击计时器
    this.party.forEach(hero => {
      const attackInterval = this._getAttackInterval(hero)
      // 随机初始偏移（0~50%攻击间隔），避免同时开打
      const initialOffset = attackInterval * (0.3 + Math.random() * 0.5)
      this.heroAttackTimers[hero.id] = {
        attackTimer: initialOffset,
        skillCDs: {}
      }
      // 初始化非普攻技能的CD为0（开局即可使用）
      hero.skills.forEach(skill => {
        if (skill.mpCost > 0 || skill.type !== 'attack') {
          this.heroAttackTimers[hero.id].skillCDs[skill.id] = 0
        }
      })
    })

    // 初始化每个敌人的攻击计时器
    this.enemies.forEach((enemy, index) => {
      const enemyInterval = this._getEnemyAttackInterval(enemy)
      const initialOffset = enemyInterval * (0.5 + Math.random() * 0.8)
      this.enemyAttackTimers[index] = {
        attackTimer: initialOffset,
        skillCDs: {},
        isAttacking: false
      }
      // 敌人技能CD初始化
      if (enemy.skills && Array.isArray(enemy.skills)) {
        enemy.skills.forEach(skill => {
          this.enemyAttackTimers[index].skillCDs[skill.id || skill.name] = 0
        })
      }
    })
  }

  /**
   * 计算角色的普通攻击间隔（秒）
   * 公式：2.0 - spd * 0.08，范围限制在 [0.5, 2.5]
   */
  _getAttackInterval(unit) {
    const spd = unit.spd || 10
    // 基础间隔3.5秒，spd每点减少0.12秒，范围[1.2, 4.0]
    return Math.max(1.2, Math.min(4.0, 3.5 - spd * 0.12))
  }

  /**
   * 计算敌人的攻击间隔（秒）
   */
  _getEnemyAttackInterval(enemy) {
    const spd = enemy.spd || 8
    // 敌人基础间隔4.0秒，spd每点减少0.12秒，范围[1.5, 4.5]
    return Math.max(1.5, Math.min(4.5, 4.0 - spd * 0.12))
  }

  /**
   * 计算技能的基础冷却时间（秒）
   * 按 skill.power 分档，再受spd影响缩短
   */
  _getSkillCooldown(unit, skill) {
    let baseCd
    if (skill.type === 'attack') {
      baseCd = 0  // 普攻无CD
    } else if (skill.power <= 1.0) {
      baseCd = 5   // 弱技能
    } else if (skill.power <= 1.5) {
      baseCd = 8   // 中等技能
    } else if (skill.power <= 2.0) {
      baseCd = 12  // 强力技能
    } else {
      baseCd = 15  // 终极技能
    }
    if (baseCd === 0) return 0
    // spd越高CD越短，最低为基础值的50%
    const spd = unit.spd || 10
    const cdMultiplier = Math.max(0.5, 1.5 - spd * 0.03)
    return baseCd * cdMultiplier
  }

  /**
   * 获取角色有效攻击力（含buff加成）
   */
  _getEffectiveAtk(hero) {
    let atk = hero.atk
    const heroIndex = this.party.indexOf(hero)
    if (heroIndex !== -1) {
      const effects = this.statusEffects.heroes[heroIndex] || []
      effects.forEach(e => {
        if (e.type === 'atk_up' && e.turnsRemaining > 0) {
          atk = Math.floor(atk * (1 + (e.value || 0.3)))
        }
      })
    }
    return atk
  }

  /**
   * 获取角色有效防御力（含buff加成）
   */
  _getEffectiveDef(hero) {
    let def = hero.def
    const heroIndex = this.party.indexOf(hero)
    if (heroIndex !== -1) {
      const effects = this.statusEffects.heroes[heroIndex] || []
      effects.forEach(e => {
        if (e.type === 'def_up' && e.turnsRemaining > 0) {
          def = Math.floor(def * (1 + (e.value || 0.3)))
        }
      })
    }
    return def
  }

  /**
   * 获取敌人有效攻击力（含debuff影响）
   */
  _getEnemyEffectiveAtk(enemy) {
    let atk = enemy.atk
    const enemyIndex = this.enemies.indexOf(enemy)
    if (enemyIndex !== -1) {
      const effects = this.statusEffects.enemies[enemyIndex] || []
      effects.forEach(e => {
        if (e.type === 'atk_down' && e.turnsRemaining > 0) {
          atk = Math.floor(atk * (1 - (e.value || 0.3)))
        }
      })
    }
    return atk
  }

  /**
   * 获取敌人有效防御力（含debuff影响）
   */
  _getEnemyEffectiveDef(enemy) {
    let def = enemy.def || 0
    const enemyIndex = this.enemies.indexOf(enemy)
    if (enemyIndex !== -1) {
      const effects = this.statusEffects.enemies[enemyIndex] || []
      effects.forEach(e => {
        if (e.type === 'def_down' && e.turnsRemaining > 0) {
          def = Math.floor(def * (1 - (e.value || 0.3)))
        }
      })
    }
    return def
  }

  /**
   * AI技能选择逻辑
   * @returns {object|null} 选中的技能对象，null表示无法行动
   */
  _aiChooseSkill(hero) {
    const timer = this.heroAttackTimers[hero.id]
    if (!timer) return null

    const availableSkills = []

    hero.skills.forEach(skill => {
      // MP不足则跳过
      if (hero.mp < skill.mpCost) return
      // CD未完成则跳过
      const cdRemaining = timer.skillCDs[skill.id] || 0
      if (cdRemaining > 0) return
      // 治疗类特殊处理（后面统一判断）
      availableSkills.push(skill)
    })

    if (availableSkills.length === 0) return null

    // ====== 角色类型AI决策 ======

    // 1. 治疗型角色：队友HP低时优先治疗
    if (hero.role === 'healer') {
      // 找最低HP的存活队友
      let lowestHpAlly = null
      let lowestHpRatio = 1
      this.party.forEach(h => {
        if (h.hp > 0 && h.hp / h.maxHp < lowestHpRatio) {
          lowestHpRatio = h.hp / h.maxHp
          lowestHpAlly = h
        }
      })

      // 队友HP<50% → 优先选治疗技能
      if (lowestHpAlly && lowestHpRatio < 0.5) {
        const healSkill = availableSkills.find(s =>
          s.type === 'heal' && (s.target === 'single_ally' || !s.target?.includes('all'))
        )
        if (healSkill) return healSkill
        // 没有单体治疗就用群疗
        const groupHeal = availableSkills.find(s => s.type === 'heal')
        if (groupHeal) return groupHeal
      }
    }

    // 2. Buff技能智能释放：有概率释放，但不是每次都放
    const buffSkills = availableSkills.filter(s => s.type === 'buff')
    if (buffSkills.length > 0) {
      // 检查是否已有同类buff生效（避免重复释放）
      const heroIndex = this.party.indexOf(hero)
      const heroEffects = heroIndex !== -1 ? (this.statusEffects.heroes[heroIndex] || []) : []
      for (const bs of buffSkills) {
        const effectType = bs.effect === 'atk_up_self' ? 'atk_up' : bs.effect
        const hasBuff = heroEffects.some(e => e.type === effectType && e.turnsRemaining > 0)
        if (!hasBuff && Math.random() < 0.4) {
          // 没有同类buff且40%概率 → 释放buff
          return bs
        }
      }
    }

    // 3. Debuff技能：有概率释放
    const debuffSkills = availableSkills.filter(s => s.type === 'debuff')
    if (debuffSkills.length > 0 && Math.random() < 0.3) {
      return debuffSkills[0]
    }

    // 4. 攻击型技能：优先选高power的攻击/魔法技能
    const attackSkills = availableSkills.filter(s => s.type === 'magic')
    if (attackSkills.length > 0) {
      // 全体攻击在多敌人时优先
      if (this.enemies.filter(e => e.hp > 0).length >= 2) {
        const aoeSkill = attackSkills.find(s => s.target === 'all')
        if (aoeSkill) return aoeSkill
      }
      // 否则选power最高的
      attackSkills.sort((a, b) => (b.power || 1) - (a.power || 1))
      return attackSkills[0]
    }

    // 5. 默认返回普攻
    const basicAttack = availableSkills.find(s => s.type === 'attack')
    return basicAttack || availableSkills[0]
  }

  /**
   * AI为技能选择目标
   */
  _aiChooseTarget(hero, skill) {
    // Buff技能：不需要目标（对自身或全体生效）
    if (skill.type === 'buff') return null

    // Debuff技能：目标为敌人
    if (skill.type === 'debuff') {
      const aliveEnemies = this.enemies.filter(e => e.hp > 0)
      return aliveEnemies.length > 0 ? aliveEnemies[0] : null
    }

    // 治疗/辅助目标选择己方
    if (skill.type === 'heal' || (skill.target && skill.target.includes('ally'))) {
      if (skill.target === 'all_ally') return null  // 全体治疗不需要target
      
      // 找最低HP的存活队友作为目标
      let target = null
      let lowestHp = Infinity
      this.party.forEach(h => {
        if (h.hp > 0 && h.hp < lowestHp) {
          lowestHp = h.hp
          target = h
        }
      })
      return target || hero  // fallback到自己
    }

    // 攻击目标选择敌人
    if (skill.target === 'all') return null  // 全体攻击不需要target

    // 单体攻击：随机选一个存活的敌人，或选血量最低的
    const aliveEnemies = this.enemies.filter(e => e.hp > 0)
    if (aliveEnemies.length === 0) return null
    if (aliveEnemies.length === 1) return aliveEnemies[0]

    // 优先攻击血量最低的敌人
    aliveEnemies.sort((a, b) => a.hp - b.hp)
    return aliveEnemies[0]
  }

  /**
   * 核心自动战斗更新引擎 - 己方角色（距离制）
   * 每帧调用，处理 移动→靠近→持续交战→目标死亡返回 的循环
   */
  _updateAutoBattle(dt) {
    if (this.isPaused) return
    if (this.phase !== 'auto_battle' && this.phase !== 'animating') return

    // 更新战斗时长
    this.battleTime += dt * this.battleSpeed

    // 先更新所有单位移动位置
    this._updateCombatUnits(dt)

    const effectiveDt = dt * this.battleSpeed

    // 遍历所有存活的己方角色
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      if (this.activeAttackers.has(hero.id)) continue

      const timer = this.heroAttackTimers[hero.id]
      const state = this.unitStates[hero.id]
      if (!timer || !state) continue

      // 1. 减少技能CD
      for (const skillId in timer.skillCDs) {
        if (timer.skillCDs[skillId] > 0) {
          timer.skillCDs[skillId] = Math.max(0, timer.skillCDs[skillId] - effectiveDt)
        }
      }

      // 根据状态机处理
      switch (state.state) {
        case 'idle': {
          // 找最近敌人
          const { index: enemyIdx, state: enemyState } = this._findNearestAliveEnemy(state)
          if (enemyIdx < 0 || !enemyState || this.enemies[enemyIdx].hp <= 0) break

          // 检查是否在攻击范围内
          const distToEnemy = this._getDistance(state, enemyState)

          if (distToEnemy <= state.attackRange) {
            // 在攻击范围内 → 切换到战斗状态，开始累积攻击计时器
            state.currentTargetId = enemyIdx
            state.state = 'in_range'
            timer.attackTimer = 0  // 到位后立即准备第一击
          } else {
            // 不在范围内 → 移动过去
            const angle = Math.atan2(enemyState.y - state.y, enemyState.x - state.x)
            const approachDist = distToEnemy - state.attackRange + 10 * this.dpr
            state.targetX = state.x + Math.cos(angle) * approachDist
            state.targetY = state.y + Math.sin(angle) * approachDist
            state.currentTargetId = enemyIdx
            state.state = 'moving_to_attack'
          }
          break
        }

        case 'in_range':
        case 'attacking': {
          // ===== 持续战斗状态：在目标附近循环攻击 =====
          const targetEnemyIdx = state.currentTargetId
          // 目标不存在或已死亡 → 返回原位
          if (targetEnemyIdx === null || !this.enemies[targetEnemyIdx] || this.enemies[targetEnemyIdx].hp <= 0) {
            console.log(`[Battle] ${hero.name} 目标死亡，返回`)
            state.state = 'returning'
            break
          }

          const targetEnemy = this.enemies[targetEnemyIdx]
          const tState = this.unitStates['enemy_' + targetEnemyIdx]

          // 检查目标是否还在攻击范围内（可能目标也在移动）
          let actualDist = Infinity
          if (tState) {
            actualDist = this._getDistance(state, tState)
          }

          if (actualDist > state.attackRange * 1.5) {
            // 目标跑远了，重新追上去（不回原位）
            console.log(`[Battle] ${hero.name} 目标跑远了，追击 dist=${actualDist.toFixed(1)} range=${state.attackRange}`)
            if (tState) {
              const angle = Math.atan2(tState.y - state.y, tState.x - state.x)
              const chaseDist = actualDist - state.attackRange + 10 * this.dpr
              state.targetX = state.x + Math.cos(angle) * chaseDist
              state.targetY = state.y + Math.sin(angle) * chaseDist
              state.state = 'moving_to_attack'
            }
            break
          }

          // 在范围内 → 累积攻击计时器
          timer.attackTimer += effectiveDt
          const attackInterval = this._getAttackInterval(hero)

          if (timer.attackTimer >= attackInterval) {
            console.log(`[Battle] ${hero.name} 攻击! timer=${timer.attackTimer.toFixed(2)} interval=${attackInterval.toFixed(2)}`)
            timer.attackTimer -= attackInterval
            const skill = this._aiChooseSkill(hero)
            if (!skill) break  // 无可用技能就等下一轮
            if (skill.type !== 'attack') {
              timer.skillCDs[skill.id] = this._getSkillCooldown(hero, skill)
            }
            this.activeAttackers.add(hero.id)
            this._doHeroAttack(hero, skill, targetEnemy, targetEnemyIdx)
          }
          break
        }

        case 'returning':
          // returning 由 _updateCombatUnits 处理物理移动
          // 这里只做额外检查：如果还有活着的敌人且还没回到原位，可以中断返回重新进攻
          // （不中断，让角色先回到原位再重新评估）
          break
      }
    }
  }

  /**
   * 执行英雄攻击（距离制版本）
   * 攻击后不返回，持续在目标附近交战
   */
  _doHeroAttack(hero, skill, target, targetEnemyIndex) {
    if (hero.hp <= 0) { this.activeAttackers.delete(hero.id); return; }

    const hState = this.unitStates[hero.id]
    const hAnimState = this.heroAnimStates[hero.id]

    // ========== 安全检查：目标合法性 ==========
    const isTargetAlly = target && this.party.some(h => h.id === target.id)
    if (isTargetAlly) {
      console.error(`[Battle] ❌ ${hero.name} 被阻止攻击队友 ${target.name}`)
      const aliveEnemy = this.enemies.find(e => e.hp > 0)
      if (aliveEnemy) { target = aliveEnemy } else { this.activeAttackers.delete(hero.id); return }
    }
    if (!target || target.hp <= 0) {
      const aliveEnemy = this.enemies.find(e => e.hp > 0)
      if (!aliveEnemy) { this.activeAttackers.delete(hero.id); return }
      target = aliveEnemy
    }

    // 标记攻击中
    if (hState) hState.state = 'attacking'
    this.attackAnimSkill = skill

    // ========== 播放技能特效（PNG序列帧，独立于角色）==========
    // 注意：不改变角色自身动画状态（idle/walk 保持不变）
    // 技能特效只是在角色位置叠加的视觉效果
    const heroPos = hState ? { x: hState.x, y: hState.y } : this.heroBasePositions[this.party.indexOf(hero)]
    this._playCastEffect(hero, skill, heroPos)

    setTimeout(() => {
      if (hero.hp <= 0) { this.activeAttackers.delete(hero.id); return; }
      
      // 获取目标敌人位置
      const targetEnemyIdx = this.enemies.indexOf(target)
      const targetEnemyPos = this.enemyPositions[targetEnemyIdx] || { x: this.enemyBaseX, y: this.enemyBaseY }

      // 播放击中特效
      if (skill.type === 'attack' || skill.type === 'magic') {
        this._playHitEffect(hero, skill, targetEnemyPos)
      }
      
      // 造成伤害
      this._applyAttackDamage(hero, target)

      setTimeout(() => {
        this.activeAttackers.delete(hero.id)
        if (!hState || hero.hp <= 0) return
        if (target && target.hp > 0 && hState.currentTargetId !== null) {
          hState.state = 'in_range'
        } else {
          hState.state = 'returning'
        }
      }, 200)
    }, 400)
  }

  /**
   * 敌人实时自动攻击引擎（距离制）
   * 敌人也需要移动到近战范围内才能攻击
   */
  _updateEnemyAutoAttack(dt) {
    if (this.isPaused) return
    if (this.phase !== 'auto_battle' && this.phase !== 'animating') return

    const effectiveDt = dt * this.battleSpeed

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i]
      if (enemy.hp <= 0) continue
      if (this.activeAttackers.has('enemy_' + i)) continue

      const timer = this.enemyAttackTimers[i]
      const estate = this.unitStates['enemy_' + i]
      if (!timer || !estate) continue

      // 减少技能CD
      for (const skillId in timer.skillCDs) {
        if (timer.skillCDs[skillId] > 0) {
          timer.skillCDs[skillId] = Math.max(0, timer.skillCDs[skillId] - effectiveDt)
        }
      }

      switch (estate.state) {
        case 'idle': {
          // 找最近的角色
          const { hero: nearestHero, state: heroState } = this._findNearestAliveHero(estate)
          if (!nearestHero || !heroState) break

          const dist = this._getDistance(estate, heroState)
          if (dist <= estate.attackRange) {
            // 在攻击范围内 → 切换到战斗状态
            estate.currentTargetId = nearestHero.id
            estate.state = 'in_range'
            timer.attackTimer = 0  // 到位后立即准备第一击
          } else {
            // 不在范围内 → 移动过去
            const angle = Math.atan2(heroState.y - estate.y, heroState.x - estate.x)
            const approachDist = dist - estate.attackRange + 10 * this.dpr
            estate.targetX = estate.x + Math.cos(angle) * approachDist
            estate.targetY = estate.y + Math.sin(angle) * approachDist
            estate.currentTargetId = nearestHero.id
            estate.state = 'moving_to_attack'
          }
          break
        }

        case 'in_range':
        case 'attacking': {
          // ===== 持续战斗状态 =====
          // 检查目标是否还活着
          let targetHero = null
          for (const h of this.party) {
            if (h.hp > 0 && h.id === estate.currentTargetId) { targetHero = h; break; }
          }
          if (!targetHero) {
            estate.state = 'returning'
            break
          }

          // 检查距离（目标可能在移动）
          const hState = this.unitStates[targetHero.id]
          let actualDist = Infinity
          if (hState) actualDist = this._getDistance(estate, hState)

          if (actualDist > estate.attackRange * 1.5) {
            // 目标跑远了，追上去
            if (hState) {
              const angle = Math.atan2(hState.y - estate.y, hState.x - estate.x)
              const chaseDist = actualDist - estate.attackRange + 10 * this.dpr
              estate.targetX = estate.x + Math.cos(angle) * chaseDist
              estate.targetY = estate.y + Math.sin(angle) * chaseDist
              estate.state = 'moving_to_attack'
            }
            break
          }

          // 在范围内 → 累积攻击计时器
          timer.attackTimer += effectiveDt
          const eAtkInterval = this._getEnemyAttackInterval(enemy)

          if (timer.attackTimer >= eAtkInterval) {
            timer.attackTimer -= eAtkInterval
            const skill = this._aiChooseEnemySkill(enemy, i)
            if (!skill) break
            this.activeAttackers.add('enemy_' + i)
            this._doEnemyAttack(enemy, i, skill, targetHero)
          }
          break
        }

        case 'returning':
          // 由 _updateCombatUnits 处理物理移动
          break
      }
    }
  }

  _doEnemyAttack(enemy, enemyIndex, skill, target) {
    if (enemy.hp <= 0) { this.activeAttackers.delete('enemy_' + enemyIndex); return; }

    const estate = this.unitStates['enemy_' + enemyIndex]
    if (estate) estate.state = 'attacking'

    setTimeout(() => {
      if (enemy.hp <= 0) { this.activeAttackers.delete('enemy_' + enemyIndex); return; }
      this._applyEnemyDamageToHero(enemy, skill, target)

      // 攻击完成：释放标记，回到in_range继续战斗
      setTimeout(() => {
        this.activeAttackers.delete('enemy_' + enemyIndex)
        if (!estate || enemy.hp <= 0) return
        // 检查目标是否还活着
        let targetAlive = false
        for (const h of this.party) {
          if (h.hp > 0 && h.id === estate.currentTargetId) { targetAlive = true; break; }
        }
        if (targetAlive && estate.currentTargetId !== null) {
          estate.state = 'in_range'
        } else {
          estate.state = 'returning'
        }
      }, 200)
    }, 400)
  }

  /**
   * AI为敌人选择技能
   */
  _aiChooseEnemySkill(enemy, enemyIndex) {
    const timer = this.enemyAttackTimers[enemyIndex]
    if (!timer) return { name: '攻击', power: 1.0, type: 'attack', mpCost: 0 }

    // 如果敌人有skills数组
    if (enemy.skills && Array.isArray(enemy.skills)) {
      const available = enemy.skills.filter(skill => {
        const cd = timer.skillCDs[skill.id || skill.name] || 0
        return cd <= 0
      })
      if (available.length > 0) {
        // 70%概率用技能，30%概率普攻
        if (Math.random() < 0.7 && available.length > 0) {
          available.sort((a, b) => (b.power || 1) - (a.power || 1))
          return available[0]
        }
      }
    }

    return { name: '攻击', power: 1.0, type: 'attack', mpCost: 0 }
  }

  /**
   * 执行敌人的自动攻击（复用原有动画系统）
   */
  _executeEnemyAutoAttack(enemy, enemyIndex, skill, target) {
    // 设置当前敌人引用和预选技能
    this.enemy = enemy
    this._currentEnemySkill = skill

    // 复用原有敌人攻击启动流程（方法签名只接受target参数）
    this._startEnemyAttackAnimation(target)
  }

  /**
   * 清除单位攻击状态标记（供动画完成后回调调用）
   */
  _clearAttackerFlag(unitId) {
    this.activeAttackers.delete(unitId)
    // 同时清除敌人的isAttacking标记
    if (typeof unitId === 'string' && unitId.startsWith('enemy_')) {
      const idx = parseInt(unitId.split('_')[1])
      if (this.enemyAttackTimers[idx]) {
        this.enemyAttackTimers[idx].isAttacking = false
      }
    }
  }

  /**
   * MP自然恢复 - 每秒恢复 maxMp 的 2%
   */
  _updateMpRegen(dt) {
    if (this.isPaused) return
    const effectiveDt = dt * this.battleSpeed
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      // 每秒恢复 maxMp 的 0.8%（约2分钟回满）
      const regen = hero.maxMp * 0.008 * effectiveDt
      hero.mp = Math.min(hero.maxMp, Math.round((hero.mp + regen) * 100) / 100)
    }
  }

  /**
   * 实时制下更新buff/debuff持续时间
   * 每5秒（受加速影响）减少1回合
   */
  _updateBuffTimers(dt) {
    if (this.isPaused) return
    const effectiveDt = dt * this.battleSpeed

    // 每回合5秒
    if (!this._buffDecrementTimer) this._buffDecrementTimer = 0
    this._buffDecrementTimer += effectiveDt

    if (this._buffDecrementTimer < 5) return
    this._buffDecrementTimer -= 5

    // 己方角色buff递减
    Object.keys(this.statusEffects.heroes).forEach(indexStr => {
      const effects = this.statusEffects.heroes[indexStr]
      if (!effects) return
      effects.forEach(e => {
        // atk_up/def_up需要随时间递减
        if (e.type === 'atk_up' || e.type === 'def_up') {
          e.turnsRemaining--
          if (e.turnsRemaining <= 0) {
            const hero = this.party[parseInt(indexStr)]
            const effectName = e.type === 'atk_up' ? '攻击力提升' : '防御力提升'
            if (hero) this._addLog(`${hero.name} 的${effectName}效果消失了`)
          }
        }
      })
      this.statusEffects.heroes[indexStr] = effects.filter(e => e.turnsRemaining > 0)
    })

    // 敌方debuff递减
    Object.keys(this.statusEffects.enemies).forEach(indexStr => {
      const effects = this.statusEffects.enemies[indexStr]
      if (!effects) return
      effects.forEach(e => {
        if (e.type === 'atk_down' || e.type === 'def_down') {
          e.turnsRemaining--
          if (e.turnsRemaining <= 0) {
            const enemy = this.enemies[parseInt(indexStr)]
            const effectName = e.type === 'atk_down' ? '攻击力降低' : '防御力降低'
            if (enemy) this._addLog(`${enemy.name} 的${effectName}效果消失了`)
          }
        }
      })
      this.statusEffects.enemies[indexStr] = effects.filter(e => e.turnsRemaining > 0)
    })
  }

  /**
   * 初始化角色卡片区域（分页）
   */
  _initHeroAreas() {
    const cardW = 100 * this.dpr
    const cardH = 110 * this.dpr
    const cardSpacing = 12 * this.dpr
    const logHeight = 330 * this.dpr

    // 角色卡片在战斗日志上方
    const logY = this.height - logHeight
    const cardY = logY - cardH - 15 * this.dpr

    // 计算当前页的角色
    const startIdx = this.heroPage * this.heroPerPage
    const endIdx = Math.min(startIdx + this.heroPerPage, this.party.length)
    const pageHeroes = this.party.slice(startIdx, endIdx)

    // 横向排列，居中
    const totalWidth = pageHeroes.length * cardW + (pageHeroes.length - 1) * cardSpacing
    const startX = (this.width - totalWidth) / 2

    this.heroAreas = pageHeroes.map((h, i) => ({
      hero: h,
      x: startX + i * (cardW + cardSpacing),
      y: cardY,
      w: cardW,
      h: cardH,
      index: startIdx + i  // 全局索引
    }))
  }

  /**
   * 初始化所有角色的基础位置（用于攻击动画）
   * 注意：这个方法计算所有角色的位置，而不仅仅是当前页
   */
  _initAllHeroPositions() {
    const cardW = 120 * this.dpr
    const cardH = 70 * this.dpr
    const cardSpacing = 10 * this.dpr
    const logHeight = 330 * this.dpr

    // 角色卡片在战斗日志上方
    const logY = this.height - logHeight
    const cardY = logY - cardH - 15 * this.dpr

    // 计算所有角色的位置
    this.heroBasePositions = this.party.map((hero, globalIndex) => {
      // 计算该角色所在的页和在该页中的索引
      const page = Math.floor(globalIndex / this.heroPerPage)
      const indexInPage = globalIndex % this.heroPerPage

      // 计算该页的角色数量
      const pageStart = page * this.heroPerPage
      const pageEnd = Math.min(pageStart + this.heroPerPage, this.party.length)
      const pageHeroesCount = pageEnd - pageStart

      // 计算该页卡片的起始X位置
      const totalWidth = pageHeroesCount * cardW + (pageHeroesCount - 1) * cardSpacing
      const startX = (this.width - totalWidth) / 2

      // 计算该角色的位置
      const cardX = startX + indexInPage * (cardW + cardSpacing)

      return {
        x: cardX + 6 * this.dpr + 22.5 * this.dpr, // 头像中心
        y: cardY + cardH / 2
      }
    })
  }

  /**
   * 初始化所有敌人的位置（横向排列）
   */
  _initEnemyPositions() {
    const enemyCount = this.enemies.length
    if (enemyCount === 0) {
      this.enemyPositions = []
      return
    }

    const dpr = this.dpr
    const enemySpacing = 140 * dpr  // 敌人之间的间距
    const enemySize = 110 * dpr     // 每个敌人的占用空间

    // 计算所有敌人的总宽度
    const totalWidth = (enemyCount - 1) * enemySpacing + enemySize

    // 起始位置（居中）
    const startX = this.width * 0.7 - totalWidth / 2

    // 为每个敌人计算位置
    this.enemyPositions = this.enemies.map((enemy, index) => {
      return {
        x: startX + index * enemySpacing,
        y: this.height * 0.28
      }
    })

    console.log(`[Battle] 初始化 ${enemyCount} 个敌人的位置`)
  }

  /**
   * 翻页
   */
  _prevHeroPage() {
    if (this.heroPage > 0) {
      this.heroPage--
      this._initHeroAreas()
      this._initAllHeroPositions()  // 重新计算所有角色位置
      this._addLog(`← 第 ${this.heroPage + 1}/${this.totalHeroPages} 页`)
    }
  }

  _nextHeroPage() {
    if (this.heroPage < this.totalHeroPages - 1) {
      this.heroPage++
      this._initHeroAreas()
      this._initAllHeroPositions()  // 重新计算所有角色位置
      this._addLog(`→ 第 ${this.heroPage + 1}/${this.totalHeroPages} 页`)
    }
  }

  _addLog(text) {
    this.log.push({ text, time: this.time })
    if (this.log.length > 20) this.log.shift()
  }

  _showHeroSelection() {
    this._addLog(`选择角色使用技能`)
  }

  // ======== 攻击动画 ========
  _startAttackAnimation(hero, skill, target) {
    const heroIndex = this.party.indexOf(hero)
    if (heroIndex === -1 || !this.heroBasePositions[heroIndex]) return

    const basePos = this.heroBasePositions[heroIndex]

    // 获取目标敌人的位置
    const targetEnemyIndex = this.enemies.indexOf(target)
    const targetEnemyPos = this.enemyPositions[targetEnemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }

    const targetX = targetEnemyPos.x - 60 * this.dpr // 攻击位置（敌人左侧）
    const targetY = targetEnemyPos.y

    this.attackingHero = hero
    this.attackAnimSkill = skill  // 保存技能引用
    this.attackAnimTarget = target  // 保存攻击目标引用
    this.attackAnim = {
      phase: 'jump',  // jump -> hit -> return
      progress: 0,
      baseX: basePos.x,
      baseY: basePos.y,
      targetX: targetX,
      targetY: targetY,
      currentX: basePos.x,
      currentY: basePos.y
    }
  }

  _updateAttackAnimation(dt) {
    if (!this.attackAnim || !this.attackingHero) return

    const anim = this.attackAnim
    const speed = 3.5 // 动画速度

    if (anim.phase === 'jump') {
      // 跳向敌人
      anim.progress += dt * speed
      if (anim.progress >= 1) {
        anim.progress = 0
        anim.phase = 'hit'
        anim.currentX = anim.targetX
        anim.currentY = anim.targetY
        // 触发攻击效果
        this._applyAttackDamage(this.attackingHero, this.attackAnimTarget || this.enemy)
      } else {
        // 使用缓动函数
        const t = this._easeOutQuad(anim.progress)
        anim.currentX = anim.baseX + (anim.targetX - anim.baseX) * t
        anim.currentY = anim.baseY + (anim.targetY - anim.baseY) * t
        // 添加跳跃高度
        const jumpHeight = Math.sin(anim.progress * Math.PI) * 40 * this.dpr
        anim.currentY -= jumpHeight
      }
    } else if (anim.phase === 'hit') {
      // 攻击帧（短暂停顿）
      anim.progress += dt * speed * 2
      if (anim.progress >= 0.3) {
        anim.progress = 0
        anim.phase = 'return'
      }
    } else if (anim.phase === 'return') {
      // 返回原位
      anim.progress += dt * speed * 0.8
      if (anim.progress >= 1) {
        // 动画完成 - 清除攻击状态
        const finishedHero = this.attackingHero
        this.attackingHero = null
        this.attackAnim = null
        this.attackAnimTarget = null
        // 清除自动战斗中的活跃标记（实时制）
        if (finishedHero) {
          this._clearAttackerFlag(finishedHero.id)
        }
      } else {
        const t = this._easeInQuad(anim.progress)
        anim.currentX = anim.targetX + (anim.baseX - anim.targetX) * t
        anim.currentY = anim.targetY + (anim.baseY - anim.targetY) * t
      }
    }
  }

  _easeOutQuad(t) {
    return t * (2 - t)
  }

  _easeInQuad(t) {
    return t * t
  }

  _applyAttackDamage(hero, target) {
    const skill = this.attackAnimSkill
    
    // 安全检查：非攻击/魔法技能不造成伤害（buff/heal/debuff）
    if (!skill) {
      console.warn('[Battle._applyAttackDamage] 没有技能，跳过')
      return
    }
    if (skill.type !== 'attack' && skill.type !== 'magic') {
      console.log(`[Battle._applyAttackDamage] ${skill.name} 是 ${skill.type} 类型，不造成直接伤害`)
      return
    }

    // 计算伤害（使用有效攻击力，含buff加成）
    const effectiveAtk = this._getEffectiveAtk(hero)
    const effectiveDef = this._getEnemyEffectiveDef(target)
    const power = skill.power || 1.0  // 默认 power 为 1.0
    let damage = Math.floor(effectiveAtk * power - effectiveDef * 0.5)
    damage = Math.max(1, damage + Math.floor(Math.random() * 5) - 2)

    // 使用角色的暴击率
    const heroCritRate = hero.crit || 0
    const isCrit = Math.random() < heroCritRate
    if (isCrit) {
      damage = Math.floor(damage * 1.5)
      this._addLog(`💥 暴击！`)
    }

    target.hp = Math.max(0, target.hp - damage)

    // 获取目标敌人的位置
    const targetEnemyIndex = this.enemies.indexOf(target)
    const targetEnemyPos = this.enemyPositions[targetEnemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }

    // 动画效果
    this.shakeAmount = 12
    this.flashAlpha = 0.6
    this.damageTexts.push({
      text: `-${damage}`,
      x: targetEnemyPos.x,
      y: targetEnemyPos.y - 80 * this.dpr,
      color: '#ff4757',  // 物理伤害：红色
      isCrit: isCrit,
      life: 1.5
    })

    this._addLog(`造成 ${damage} 点伤害！`)

    if (skill.effect === 'drain') {
      const heal = Math.floor(damage * 0.3)
      hero.hp = Math.min(hero.maxHp, hero.hp + heal)
      this._addLog(`恢复了 ${heal} 点生命`)
    }

    // 清除技能引用
    this.attackAnimSkill = null
  }

  /**
   * 敌人攻击造成伤害（距离制专用，不需要动画）
   */
  _applyEnemyDamageToHero(enemy, skill, target) {
    const effectiveEnemyAtk = this._getEnemyEffectiveAtk(enemy)
    const effectiveHeroDef = this._getEffectiveDef(target)
    let damage = Math.floor(effectiveEnemyAtk * (skill.power || 1.0) - effectiveHeroDef * 0.4)
    damage = Math.max(1, damage + Math.floor(Math.random() * 4) - 1)

    const enemyCritRate = enemy.crit || 0
    const isCrit = Math.random() < enemyCritRate
    if (isCrit) {
      damage = Math.floor(damage * 1.5)
      this._addLog(`💥 ${enemy.name} 暴击！`)
    }

    target.hp = Math.max(0, target.hp - damage)

    this.shakeAmount = 8
    this.flashAlpha = 0.4

    const hState = this.unitStates[target.id]
    const targetPos = hState ? { x: hState.x, y: hState.y } : this.heroBasePositions[this.party.indexOf(target)]

    this.damageTexts.push({
      text: `-${damage}`,
      x: targetPos ? targetPos.x : 80 * this.dpr,
      y: targetPos ? targetPos.y - 40 * this.dpr : this.height * 0.5,
      color: '#ff4757',
      isCrit: isCrit,
      life: 1.5
    })

    this._addLog(`${enemy.name} 攻击了${target.name}！造成 ${damage} 点伤害`)
  }

  /**
   * 播放技能施法特效
   * @param {Object} hero - 施法角色
   * @param {Object} skill - 技能对象
   * @param {Object} heroPos - 角色位置
   */
  _playCastEffect(hero, skill, heroPos) {
    // 根据技能类型和ID播放对应特效
    const isLiXiaoBao = (hero.id === 'lixiaobao')
    
    // ====== 魔法类施法特效 ======
    if (skill.id === 'fireball' && isLiXiaoBao) {
      // 🔥 李小宝 - 火球术施法特效
      this.game.effects.createEffect({
        type: 'fireball_cast',
        x: heroPos.x,
        y: heroPos.y,
        frameDuration: 136,
        loop: false,
        scale: 1.0,
        alpha: 1.0,
        onComplete: () => console.log('[Battle] 火球术施法特效播放完成')
      })
      console.log(`[Battle] 播放火球术施法特效`)
    }
    else if (skill.id === 'ice_shard' && isLiXiaoBao) {
      // ❄️ 李小宝 - 冰晶术施法特效
      this.game.effects.createEffect({
        type: 'ice_shard_cast',
        x: heroPos.x,
        y: heroPos.y,
        frameDuration: 188,
        loop: false,
        scale: 1.0,
        alpha: 1.0,
        onComplete: () => console.log('[Battle] 冰晶术施法特效播放完成')
      })
      console.log(`[Battle] 播放冰晶术施法特效`)
    }
    else if (skill.id === 'thunder' && isLiXiaoBao) {
      // ⚡ 李小宝 - 雷击术施法特效
      this.game.effects.createEffect({
        type: 'lightning_cast',
        x: heroPos.x,
        y: heroPos.y,
        frameDuration: 100,
        loop: false,
        scale: 2.0,
        alpha: 1.0,
        onComplete: () => console.log('[Battle] 雷击术施法特效播放完成')
      })
      console.log(`[Battle] 播放雷击术施法特效`)
    }
    else if (skill.id === 'mana_shield') {
      // 🛡️ 魔力护盾 - 蓝色光环
      this.game.effects.createEffect({
        type: 'ice_shard_cast', // 复用冰蓝色特效作为魔法盾光效
        x: heroPos.x,
        y: heroPos.y,
        frameDuration: 150,
        loop: false,
        scale: 1.5,
        alpha: 0.8
      })
      console.log(`[Battle] 播放魔力护盾施法特效`)
    }
    
    // ====== 物理攻击施法特效（通用）======
    else if (skill.type === 'attack') {
      // 物理攻击：角色自身发光 + 小冲击波（通过cast动画已处理发光，这里添加简单视觉反馈）
      const effectColor = this._getSkillGlowColor(skill.id)
      console.log(`[Battle] ${hero.name} 使用 ${skill.name} (物理攻击)`)
      
      // 可以在这里添加通用的物理攻击起手特效
      // 目前cast动画的发光效果已经足够
    }
    
    // ====== Buff/治疗类施法特效 ======
    else if (skill.type === 'heal') {
      // 💚 治疗 - 绿色光环
      console.log(`[Battle] ${hero.name} 使用 ${skill.name} (治疗)`)
    }
    else if (skill.type === 'buff') {
      // ⬆️ Buff - 金色光环
      console.log(`[Battle] ${hero.name} 使用 ${skill.name} (增益)`)
    }
    
    // 兜底：任何未处理的技能都记录日志
    else {
      console.log(`[Battle] ${hero.name} 使用 ${skill.name} [${skill.type}] - 无专属施法特效`)
    }
  }

  /**
   * 播放技能击中特效
   * @param {Object} hero - 施法角色
   * @param {Object} skill - 技能对象
   * @param {Object} targetPos - 目标位置
   */
  _playHitEffect(hero, skill, targetPos) {
    // 根据技能ID播放对应击中特效
    const isLiXiaoBao = (hero.id === 'lixiaobao')
    
    if (skill.id === 'fireball' && isLiXiaoBao) {
      // 🔥 李小宝 - 火球术击中特效
      this.game.effects.createEffect({
        type: 'fireball_hit',
        x: targetPos.x,
        y: targetPos.y,
        frameDuration: 80,
        loop: false,
        scale: 1.2,
        alpha: 1.0,
        onComplete: () => console.log('[Battle] 火球术击中特效播放完成')
      })
      console.log(`[Battle] 播放火球术击中特效`)
    }
    else if (skill.id === 'ice_shard' && isLiXiaoBao) {
      // ❄️ 李小宝 - 冰晶术击中特效
      this.game.effects.createEffect({
        type: 'ice_shard_hit',
        x: targetPos.x,
        y: targetPos.y,
        frameDuration: 136,
        loop: false,
        scale: 1.2,
        alpha: 1.0,
        onComplete: () => console.log('[Battle] 冰晶术击中特效播放完成')
      })
      console.log(`[Battle] 播放冰晶术击中特效`)
    }
    else if (skill.id === 'thunder' && isLiXiaoBao) {
      // ⚡ 李小宝 - 雷击术击中特效
      this.game.effects.createEffect({
        type: 'lightning_hit',
        x: targetPos.x,
        y: targetPos.y - 120,
        frameDuration: 125,
        loop: false,
        scale: 2.0,
        alpha: 1.0,
        onComplete: () => console.log('[Battle] 雷击术击中特效播放完成')
      })
      console.log(`[Battle] 播放雷击术击中特效`)
    }
    
    // ====== 物理攻击通用击中效果 ======
    else if (skill.type === 'attack') {
      // 物理攻击：使用简单的冲击特效（复用现有资源或用闪光代替）
      // 检查是否有对应的物理击中特效
      const physicalHitKey = `${skill.id}_hit`
      
      // 尝试使用技能专属击中特效
      const hasSpecificEffect = ['fireball_hit', 'ice_shard_hit', 'lightning_hit', 
                                  'slash_hit', 'staff_strike_hit'].includes(physicalHitKey)
      
      if (hasSpecificEffect && this.game.effects && this.game.effects.createEffect) {
        this.game.effects.createEffect({
          type: physicalHitKey,
          x: targetPos.x,
          y: targetPos.y,
          frameDuration: 100,
          loop: false,
          scale: 1.0,
          alpha: 1.0
        })
      } else {
        // 兜底：使用通用的打击闪光（通过 shakeAmount 和 flashAlpha 实现）
        // 这些值会在 _applyAttackDamage 中被设置
        console.log(`[Battle] ${skill.name} 击中目标 (物理冲击)`)
      }
    }
    
    // ====== 魔法类兜底 ======
    else if (skill.type === 'magic') {
      console.log(`[Battle] ${skill.name} 魔法击中目标`)
    }
  }

  // ======== 更新 ========
  update(dt) {
    this.time += dt

    // 攻击动画更新
    this._updateAttackAnimation(dt)

    // 动画更新
    if (this.shakeAmount > 0) {
      this.shakeAmount *= 0.9
      if (this.shakeAmount < 0.5) this.shakeAmount = 0
    }

    if (this.flashAlpha > 0) {
      this.flashAlpha -= dt * 3
      if (this.flashAlpha < 0) this.flashAlpha = 0
    }

    // 伤害数字动画
    this.damageTexts = this.damageTexts.filter(t => {
      t.y -= 40 * dt
      t.life -= dt
      return t.life > 0
    })

    // 输入处理（简化：只处理加速/暂停和结束按钮）
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        this._handleTap(tap.x, tap.y)
      }
    }

    // ====== 实时自动战斗核心循环 ======
    if (this.phase === 'auto_battle' || this.phase === 'animating') {
      // 己方角色自动攻击
      this._updateAutoBattle(dt)
      // 敌人自动攻击
      this._updateEnemyAutoAttack(dt)
      // MP自然恢复（每秒恢复 maxMp 的 2%）
      this._updateMpRegen(dt)
      // Buff/Debuff持续时间递减
      this._updateBuffTimers(dt)
    }

    // 检查战斗结束
    this._checkBattleEnd()

    // 兼容旧的行动队列处理（保持向后兼容）
    if (this.phase === 'animating' && this.actionQueue.length > 0) {
      const action = this.actionQueue.shift()
      setTimeout(() => action(), 500)
    }

    // 检查攻击动画完成回调（远程攻击的完成检测）
    if (this._waitForAttackComplete && this._waitForAttackComplete()) {
      this._waitForAttackComplete = null
    }

    // 敌人攻击动画更新（跳跃/帧动画）
    this._updateEnemyAttackAnimation(dt)

    // 角色动画帧更新（移动动画）
    this._updateHeroAnimations(dt)

    // 敌人动画帧更新
    this._updateEnemyAnimations(dt)

    // HP/MP延迟过渡动画更新
    this._updateHpDelay(dt)

    // 敌人退场动画更新
    this._updateEnemyDeathAnim(dt)

    // 感化剧情更新
    this._updatePurifyScene(dt)

    // 代码特效更新
    this._updateCodeEffects(dt)
  }

  /**
   * 更新敌人动画帧
   */
  _updateEnemyAnimations(dt) {
    Object.keys(this.enemyAnimStates).forEach(indexStr => {
      const index = parseInt(indexStr)
      const animState = this.enemyAnimStates[index]
      
      if (!animState) return

      // ===== walk状态：行走动画（快速帧率） =====
      if (animState.state === 'walk') {
        const WALK_FRAME_DURATION = 70  // 70ms/帧，约14fps，适合移动
        animState.frameTimer += dt * 1000
        if (animState.frameTimer >= WALK_FRAME_DURATION) {
          animState.frameTimer = 0
          // 野猫有12帧walk，其他类型用idle帧加速模拟
          if (animState.type === 'wild_cat') {
            animState.frame++
            if (animState.frame > 12) animState.frame = 1
          } else {
            // 史莱姆猫/暗影鼠没有专用walk帧，用idle帧循环但更快
            const idleFrames = animState.type === 'shadow_mouse' ? 6 : 7
            animState.frame++
            if (animState.frame > idleFrames) animState.frame = 1
          }
        }
        return
      }

      // 非动画播放状态不更新帧
      if (animState.state === 'idle') {
        animState.frameTimer += dt * 1000
        if (animState.frameTimer >= animState.frameDuration) {
          animState.frameTimer = 0
          animState.frame++
          // 根据类型确定idle总帧数
          let idleFrames = 7
          if (animState.type === 'wild_cat') idleFrames = 8
          else if (animState.type === 'shadow_mouse') idleFrames = 6
          if (animState.frame > idleFrames) animState.frame = 1
        }
        return
      }

      // 攻击/技能动画：跳帧播放加速
      let actualFrames, damageDisplayFrame
      if (animState.type === 'shadow_mouse') {
        // 暗影鼠帧号：attack 1-7, skill 1-12
        const isAttack = animState.state === 'attack'
        actualFrames = isAttack
          ? [1, 2, 3, 4, 5, 6, 7]
          : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        damageDisplayFrame = isAttack ? 4 : 6
      } else {
        // 史莱姆猫帧号: attack 8-22, skill 50-80
        const isAttack = animState.state === 'attack'
        actualFrames = isAttack
          ? [8, 10, 12, 14, 16, 18, 20, 22]
          : [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80]
        damageDisplayFrame = isAttack ? 4 : 6
      }
      const displayFrames = actualFrames.length

      // 更新帧计时器（攻击/技能用更快帧率）
      const animFrameDuration = 55  // 55ms一帧
      animState.frameTimer += dt * 1000

      if (animState.frameTimer >= animFrameDuration) {
        animState.frameTimer = 0
        animState.displayFrame = (animState.displayFrame || 0) + 1

        // 计算实际图片帧号（从实际帧列表中取）
        const frameIdx = Math.min(animState.displayFrame - 1, actualFrames.length - 1)
        animState.frame = actualFrames[frameIdx]

        // 伤害结算
        if (animState.displayFrame === damageDisplayFrame && !animState.attackDamageApplied) {
          animState.attackDamageApplied = true
          if (this.enemyAttackTarget) {
            this._applyEnemyAttackDamage(this.enemyAttackTarget)
          }
        }

        // 动画播放完毕
        if (animState.displayFrame > displayFrames) {
          animState.frame = 1
          animState.displayFrame = 0
          animState.state = 'idle'
          animState.attackDamageApplied = false
          if (animState.onAttackComplete) {
            animState.onAttackComplete()
            animState.onAttackComplete = null
          }
        }
      }
    })
  }

  /**
   * 更新角色动画帧（行走/施法动画）
   */
  _updateHeroAnimations(dt) {
    Object.keys(this.heroAnimStates).forEach(heroId => {
      const animState = this.heroAnimStates[heroId]
      if (!animState) return

      // 获取对应的 unitState 同步动画状态
      const uState = this.unitStates[heroId]
      if (!uState) return

      // 根据移动状态同步动画状态（只处理 walk/idle 两种状态）
      const isMoving = (uState.state === 'moving_to_attack' || uState.state === 'returning')
      if (isMoving && animState.state !== 'walk') {
        animState.state = 'walk'
        animState.frame = 0
        animState.frameTimer = 0
      } else if (!isMoving && animState.state !== 'idle') {
        animState.state = 'idle'
        animState.frame = 0
        animState.frameTimer = 0
      }

      // 更新帧动画
      if (animState.state === 'walk') {
        const WALK_FRAME_DURATION = 80  // 80ms/帧
        animState.frameTimer += dt * 1000
        if (animState.frameTimer >= WALK_FRAME_DURATION) {
          animState.frameTimer = 0
          animState.frame++
          if (animState.frame > animState.totalWalkFrames) animState.frame = 0
        }
      } else if (animState.state === 'idle') {
        // idle 帧动画（呼吸/微动效果）
        animState.frameTimer += dt * 1000
        const IDLE_FRAME_DURATION = 500  // 慢节奏呼吸感，500ms/帧
        if (animState.frameTimer >= IDLE_FRAME_DURATION) {
          animState.frameTimer = 0
          animState.frame++
          // 获取该角色的idle总帧数并循环
          if (animState.totalIdleFrames && animState.frame > animState.totalIdleFrames - 1) {
            animState.frame = 0  // 从第0帧重新开始
          }
        }
      }
    })
  }

  // ======== 代码特效系统 ========

  /**
   * 创建代码生成特效（无需图片资源的粒子/形状动画）
   * @param {Object} config - 特效配置
   * @param {string} config.type - 特效类型（slime_splash, slime_wrap, heal_self 等）
   * @param {number} config.x - 目标X坐标
   * @param {number} config.y - 目标Y坐标
   * @param {Function} config.onComplete - 完成回调
   */
  _createCodeEffect(config) {
    const dpr = this.dpr
    const effect = {
      id: `codefx_${Date.now()}_${Math.random()}`,
      type: config.type,
      x: config.x,
      y: config.y,
      elapsed: 0,
      duration: config.duration || 800,
      particles: [],
      onComplete: config.onComplete,
      isPlaying: true
    }

    // 根据类型生成粒子
    if (config.type === 'slime_splash') {
      // 黏液喷射：绿色黏液飞溅 + 溅射
      effect.duration = 900
      for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 / 12) * i + Math.random() * 0.5
        const speed = (60 + Math.random() * 80) * dpr
        effect.particles.push({
          x: 0, y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40 * dpr,
          size: (4 + Math.random() * 6) * dpr,
          color: this._randomSlimeColor(),
          gravity: 180 * dpr,
          life: 0.5 + Math.random() * 0.5,
          age: 0,
          type: 'blob'
        })
      }
      // 添加几个大黏液滴
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = (30 + Math.random() * 50) * dpr
        effect.particles.push({
          x: 0, y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60 * dpr,
          size: (8 + Math.random() * 8) * dpr,
          color: this._randomSlimeColor(),
          gravity: 200 * dpr,
          life: 0.6 + Math.random() * 0.4,
          age: 0,
          type: 'bigblob'
        })
      }
    } else if (config.type === 'slime_wrap') {
      // 黏液包裹：绿色黏液从四周包围目标，逐渐收拢
      effect.duration = 1100
      // 飞行黏液球（从四周飞向中心）
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 / 12) * i
        const dist = (80 + Math.random() * 40) * dpr
        effect.particles.push({
          startX: Math.cos(angle) * dist,
          startY: Math.sin(angle) * dist,
          size: (6 + Math.random() * 5) * dpr,
          color: this._randomSlimeColor(),
          life: 0.6,
          age: 0,
          delay: i * 0.03,
          type: 'converge'
        })
      }
      // 包裹后的扩散波纹
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i
        effect.particles.push({
          angle: angle,
          maxRadius: (60 + Math.random() * 30) * dpr,
          color: 'rgba(46, 213, 115, 0.3)',
          life: 0.8,
          age: 0,
          delay: 0.5,
          type: 'ripple'
        })
      }
    } else if (config.type === 'shadow_strike') {
      // 暗影突袭：暗紫黑色能量爆发
      effect.duration = 900
      // 暗影碎片飞散
      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 / 16) * i + Math.random() * 0.3
        const speed = (70 + Math.random() * 90) * dpr
        const shade = Math.random()
        effect.particles.push({
          x: 0, y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30 * dpr,
          size: (3 + Math.random() * 5) * dpr,
          color: shade > 0.5 ? '#4a0072' : '#2d004d',
          gravity: 100 * dpr,
          life: 0.4 + Math.random() * 0.4,
          age: 0,
          type: 'blob'
        })
      }
      // 暗影冲击波
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 / 6) * i
        effect.particles.push({
          angle: angle,
          maxRadius: (50 + Math.random() * 30) * dpr,
          color: 'rgba(74, 0, 114, 0.4)',
          life: 0.7,
          age: 0,
          delay: 0.2,
          type: 'ripple'
        })
      }
    }

    this.codeEffects.push(effect)
    return effect.id
  }

  _randomSlimeColor() {
    const colors = ['#2ed573', '#7bed9f', '#a3cb38', '#009432', '#6ab04c']
    return colors[Math.floor(Math.random() * colors.length)]
  }

  _updateCodeEffects(dt) {
    const toRemove = []
    for (const effect of this.codeEffects) {
      if (!effect.isPlaying) continue
      effect.elapsed += dt * 1000

      for (const p of effect.particles) {
        const adjustedAge = (effect.elapsed / 1000 - (p.delay || 0))
        if (adjustedAge < 0) continue
        p.age = adjustedAge

        if (p.type === 'blob' || p.type === 'bigblob') {
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vy += p.gravity * dt
        } else if (p.type === 'converge') {
          const convergeProgress = Math.min(1, p.age / p.life)
          const eased = 1 - Math.pow(1 - convergeProgress, 3)
          p.currentX = p.startX * (1 - eased)
          p.currentY = p.startY * (1 - eased)
          p.alpha = convergeProgress < 0.8 ? 1 : (1 - convergeProgress) / 0.2
        } else if (p.type === 'ripple') {
          const rippleProgress = Math.min(1, p.age / p.life)
          p.expandRadius = rippleProgress * p.maxRadius
          p.alpha = Math.max(0, 1 - rippleProgress)
        }
      }

      if (effect.elapsed / effect.duration >= 1) {
        effect.isPlaying = false
        toRemove.push(effect.id)
        if (effect.onComplete) effect.onComplete()
      }
    }

    for (const id of toRemove) {
      const idx = this.codeEffects.findIndex(e => e.id === id)
      if (idx !== -1) this.codeEffects.splice(idx, 1)
    }
  }

  _renderCodeEffects(ctx) {
    for (const effect of this.codeEffects) {
      if (!effect.isPlaying) continue
      ctx.save()
      ctx.translate(effect.x, effect.y)

      for (const p of effect.particles) {
        const adjustedAge = (effect.elapsed / 1000 - (p.delay || 0))
        if (adjustedAge < 0) continue

        const lifeRatio = Math.min(1, p.age / (p.life || 1))

        if (p.type === 'blob' || p.type === 'bigblob') {
          const alpha = Math.max(0, (1 - lifeRatio) * 0.9)
          ctx.globalAlpha = alpha
          ctx.fillStyle = p.color
          ctx.beginPath()
          const stretch = Math.min(2, Math.abs(p.vy || 0) / (100 * this.dpr) + 1)
          ctx.ellipse(p.x, p.y, p.size, p.size * stretch, 0, 0, Math.PI * 2)
          ctx.fill()
          if (p.type === 'bigblob') {
            ctx.globalAlpha = alpha * 0.3
            ctx.beginPath()
            ctx.ellipse(p.x, p.y, p.size * 2, p.size * 2 * stretch, 0, 0, Math.PI * 2)
            ctx.fill()
          }
        } else if (p.type === 'converge') {
          const cx = p.currentX || 0
          const cy = p.currentY || 0
          const alpha = Math.max(0, (p.alpha !== undefined ? p.alpha : 1) * 0.9)
          ctx.globalAlpha = alpha
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(cx, cy, p.size, 0, Math.PI * 2)
          ctx.fill()
          // 拖尾
          const dist = Math.sqrt(cx * cx + cy * cy)
          if (dist > 2) {
            const tailLen = Math.min(p.size * 4, dist * 0.6)
            const tailAngle = Math.atan2(cy, cx)
            const gradient = ctx.createLinearGradient(
              cx, cy,
              cx + Math.cos(tailAngle) * tailLen,
              cy + Math.sin(tailAngle) * tailLen
            )
            gradient.addColorStop(0, p.color)
            gradient.addColorStop(1, 'rgba(46, 213, 115, 0)')
            ctx.globalAlpha = alpha * 0.4
            ctx.strokeStyle = gradient
            ctx.lineWidth = p.size * 1.5
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.lineTo(
              cx + Math.cos(tailAngle) * tailLen,
              cy + Math.sin(tailAngle) * tailLen
            )
            ctx.stroke()
          }
        } else if (p.type === 'ripple') {
          ctx.globalAlpha = Math.max(0, (p.alpha || 0) * 0.5)
          ctx.strokeStyle = p.color
          ctx.lineWidth = 3 * this.dpr
          ctx.beginPath()
          ctx.arc(0, 0, p.expandRadius || 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  /**
   * 播放敌人技能击中特效
   * @param {Object} skill - 技能对象
   * @param {Object} targetPos - 目标位置 {x, y}
   */
  _playEnemySkillEffect(skill, targetPos) {
    if (!targetPos) return

    // 根据敌人类型和技能选择特效
    const enemyId = this.enemy.id || this.enemy.type

    if (enemyId === 'slime_cat') {
      // 史莱姆猫技能特效
      if (skill.effect === 'slow') {
        // 减速类技能：根据power区分喷射/包裹
        if (skill.power >= 1.3) {
          // 黏液包裹：从四周收拢
          this._createCodeEffect({
            type: 'slime_wrap',
            x: targetPos.x,
            y: targetPos.y
          })
        } else {
          // 黏液喷射：飞溅
          this._createCodeEffect({
            type: 'slime_splash',
            x: targetPos.x,
            y: targetPos.y
          })
        }
      } else {
        // 默认：黏液飞溅
        this._createCodeEffect({
          type: 'slime_splash',
          x: targetPos.x,
          y: targetPos.y
        })
      }
    } else if (enemyId === 'shadow_mouse') {
      // 暗影鼠技能特效
      this._createCodeEffect({
        type: 'shadow_strike',
        x: targetPos.x,
        y: targetPos.y
      })
    }
  }

  /**
   * 应用敌人技能的状态效果
   * @param {Object} skill - 技能对象
   * @param {Object} target - 目标角色
   * @param {Object} targetPos - 目标位置
   */
  _applyEnemySkillStatus(skill, target, targetPos) {
    if (!skill || !skill.effect) return

    const targetIndex = this.party.indexOf(target)
    if (targetIndex === -1) return

    // 初始化角色的状态效果数组
    if (!this.statusEffects.heroes[targetIndex]) {
      this.statusEffects.heroes[targetIndex] = []
    }

    if (skill.effect === 'slime_spray') {
      // 黏液喷射：给目标添加 slimed 标记（持续2回合）
      console.log(`[Battle] 黏液喷射命中 ${target.name}, targetIndex=${targetIndex}`)
      const existing = this.statusEffects.heroes[targetIndex].find(e => e.type === 'slimed')
      if (existing) {
        // 刷新持续时间
        existing.turnsRemaining = 2
        this._addLog(`🟢 ${target.name} 被黏液覆盖！效果已刷新（2回合）`)
      } else {
        this.statusEffects.heroes[targetIndex].push({
          type: 'slimed',
          turnsRemaining: 2
        })
        this._addLog(`🟢 ${target.name} 被黏液覆盖！持续2回合`)

        // 视觉提示
        this.damageTexts.push({
          text: '黏液覆盖2回合',
          x: targetPos ? targetPos.x : 0,
          y: targetPos ? targetPos.y - 80 * this.dpr : 0,
          color: '#2ed573',
          life: 2.0,
          type: 'slime_effect'
        })
      }
    } else if (skill.effect === 'slime_wrap') {
      // 黏液包裹：30%概率限制1回合，若已有slimed则概率提升50%
      console.log(`[Battle] 黏液包裹命中 ${target.name}, targetIndex=${targetIndex}`)
      let restrictChance = skill.restrictChance || 0.3
      const hasSlimed = this.statusEffects.heroes[targetIndex].some(e => e.type === 'slimed')
      if (hasSlimed) {
        restrictChance = Math.min(1, restrictChance * 1.5)
        this._addLog(`🟢 黏液覆盖加成！限制概率提升至 ${Math.round(restrictChance * 100)}%`)
      }

      if (Math.random() < restrictChance) {
        const existing = this.statusEffects.heroes[targetIndex].find(e => e.type === 'restricted')
        if (existing) {
          existing.turnsRemaining = 1
          this._addLog(`🔗 ${target.name} 再次被黏液包裹限制！`)
        } else {
          this.statusEffects.heroes[targetIndex].push({
            type: 'restricted',
            turnsRemaining: 1
          })
          this._addLog(`🔗 ${target.name} 被黏液包裹，无法行动1回合！`)

          // 视觉提示
          this.damageTexts.push({
            text: '限制1回合',
            x: targetPos ? targetPos.x : 0,
            y: targetPos ? targetPos.y - 100 * this.dpr : 0,
            color: '#6ab04c',
            life: 2.0,
            type: 'slime_effect'
          })
        }
      } else {
        this._addLog(`${target.name} 挣脱了黏液包裹！`)
      }

      // 黏液包裹会消耗掉slimed标记
      if (hasSlimed) {
        this.statusEffects.heroes[targetIndex] =
          this.statusEffects.heroes[targetIndex].filter(e => e.type !== 'slimed')
        this._addLog(`🟢 ${target.name} 的黏液覆盖效果被消耗`)
      }
    }
  }

  /**
   * 检查角色是否被限制行动
   */
  _isHeroRestricted(heroIndex) {
    const effects = this.statusEffects.heroes[heroIndex]
    if (!effects) return false
    const restricted = effects.some(e => e.type === 'restricted' && e.turnsRemaining > 0)
    if (restricted) console.log(`[Battle] 角色索引 ${heroIndex} 被限制行动, effects:`, effects)
    return restricted
  }

  /**
   * 回合开始时更新己方角色状态效果
   */
  _updateHeroStatusEffects() {
    Object.keys(this.statusEffects.heroes).forEach(indexStr => {
      const index = parseInt(indexStr)
      const effects = this.statusEffects.heroes[index]
      if (!effects) return

      const hero = this.party[index]
      if (!hero) return

      // 更新每个效果的剩余回合
      effects.forEach(effect => {
        if (effect.type === 'restricted') {
          effect.turnsRemaining--
          if (effect.turnsRemaining <= 0) {
            this._addLog(`🔗 ${hero.name} 挣脱了黏液包裹！`)
          }
        } else if (effect.type === 'slimed') {
          effect.turnsRemaining--
          if (effect.turnsRemaining <= 0) {
            this._addLog(`🟢 ${hero.name} 身上的黏液干涸了`)
          }
        }
      })

      // 移除已过期的效果
      this.statusEffects.heroes[index] = effects.filter(e => e.turnsRemaining > 0)
    })
  }

  /**
   * 更新HP/MP延迟过渡动画
   */
  _updateHpDelay(dt) {
    const speed = 1.0  // 延迟追赶速度（越小越慢）

    // 敌人HP延迟（DNF风格：只追踪当前段的延迟，跨段时重置）
    const SEGMENT_HP = 100
    this.enemies.forEach((enemy, i) => {
      if (!this.enemyHpDelay[i]) {
        this.enemyHpDelay[i] = { delay: 1.0, lastSegment: 0 }
      }
      const delayInfo = this.enemyHpDelay[i]

      // 计算当前段
      const currentSegment = enemy.hp <= 0 ? 0 : Math.floor((enemy.hp - 1) / SEGMENT_HP)
      const segStartHp = currentSegment * SEGMENT_HP
      const segEndHp = Math.min((currentSegment + 1) * SEGMENT_HP, enemy.maxHp)
      const segMaxHp = segEndHp - segStartHp
      const segCurrentHp = Math.max(0, enemy.hp - segStartHp)
      const target = enemy.hp <= 0 ? 0 : segCurrentHp / segMaxHp

      // 跨段时重置延迟为满血（新段从满血开始扣）
      if (currentSegment !== delayInfo.lastSegment) {
        delayInfo.delay = 1.0
        delayInfo.lastSegment = currentSegment
      }

      if (delayInfo.delay > target) {
        delayInfo.delay = Math.max(target, delayInfo.delay - dt * speed)
      } else {
        delayInfo.delay = target  // 回血时立即跟上
      }
    })

    // 己方HP/MP延迟
    this.party.forEach((hero, i) => {
      if (!this.heroHpDelay[i]) this.heroHpDelay[i] = Math.min(1, hero.hp / hero.maxHp)
      if (!this.heroMpDelay[i]) this.heroMpDelay[i] = Math.min(1, hero.mp / hero.maxMp)
      const hpTarget = Math.min(1, Math.max(0, hero.hp / hero.maxHp))
      const mpTarget = Math.min(1, Math.max(0, hero.mp / hero.maxMp))
      if (this.heroHpDelay[i] > hpTarget) {
        this.heroHpDelay[i] = Math.max(hpTarget, this.heroHpDelay[i] - dt * speed)
      } else {
        this.heroHpDelay[i] = hpTarget
      }
      if (this.heroMpDelay[i] > mpTarget) {
        this.heroMpDelay[i] = Math.max(mpTarget, this.heroMpDelay[i] - dt * speed)
      } else {
        this.heroMpDelay[i] = mpTarget
      }
    })
  }

  /**
   * 更新敌人退场动画（渐渐透明）
   */
  _updateEnemyDeathAnim(dt) {
    const fadeSpeed = 0.8  // 淡出速度（越大越快）
    this.enemies.forEach((enemy, i) => {
      if (!this.enemyDeathAnim[i]) {
        this.enemyDeathAnim[i] = { alpha: 1.0, fading: false, timer: 0 }
      }
      const anim = this.enemyDeathAnim[i]

      // 检测敌人刚死亡，启动退场动画
      if (enemy.hp <= 0 && !anim.fading && anim.alpha > 0) {
        anim.fading = true
        anim.timer = 0
      }

      // 退场动画进行中
      if (anim.fading && anim.alpha > 0) {
        anim.timer += dt
        anim.alpha = Math.max(0, 1.0 - anim.timer * fadeSpeed)
      }
    })
  }

  // ======== 敌人攻击动画 ========
  _startEnemyAttackAnimation(target) {
    const targetIndex = this.party.indexOf(target)
    if (targetIndex === -1 || !this.heroBasePositions[targetIndex]) return

    const targetPos = this.heroBasePositions[targetIndex]

    // 获取当前攻击敌人的位置
    const enemyIndex = this.enemies.indexOf(this.enemy)
    const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }

    // 检查敌人是否有帧动画
    const animState = this.enemyAnimStates[enemyIndex]

    // 判断是否是群体技能
    const currentSkill = this._currentEnemySkill
    const isAoeSkill = currentSkill && (currentSkill.target === 'all' || currentSkill.aoe === true)

    // 检查敌人是否有攻击帧动画（史莱姆猫、暗影鼠有attack/skill帧）
    const hasAttackFrames = animState && (animState.type === 'slime_cat' || animState.type === 'shadow_mouse')

    if (hasAttackFrames) {
      this.enemyAttacking = true
      this.enemyAttackTarget = target

      // 判断是否是技能（非普通攻击）— power > 1.0 表示是技能而非普通攻击
      const isSkill = currentSkill && currentSkill.power > 1.0
      
      if (isAoeSkill || isSkill) {
        // 群体技能或单体技能：原地播放skill帧动画，不跳跃
        this.enemyAttackAnim = null
        animState.state = 'skill'
        animState.frame = animState.type === 'shadow_mouse' ? 1 : 50
        animState.displayFrame = 0
        animState.frameTimer = 0
        animState.attackDamageApplied = false
      } else {
        // 普通攻击：跳跃到敌人旁边，到达后播放attack帧动画
        this.enemyAttackAnim = {
          phase: 'jump',       // jump → anim_attack → return
          progress: 0,
          baseX: enemyPos.x,
          baseY: enemyPos.y,
          targetX: targetPos.x - 30 * this.dpr,
          targetY: targetPos.y,
          currentX: enemyPos.x,
          currentY: enemyPos.y,
          enemy: this.enemy,
          hasFrameAnim: true    // 标记有帧动画，跳到目标后播放帧动画
        }
        // 暂时不启动帧动画，等跳跃到目标后再启动
      }

      // 设置攻击完成回调（帧动画播放完毕后触发）
      animState.onAttackComplete = () => {
        // 如果是跳跃攻击（非AOE），跳跃回原位后再完成
        if (!isAoeSkill && this.enemyAttackAnim) {
          this.enemyAttackAnim.phase = 'return'
          this.enemyAttackAnim.progress = 0
        } else {
          // AOE技能直接完成 - 清除攻击标记，回到auto_battle
          const enemyIdx = this.enemies.indexOf(this.enemy)
          this._clearAttackerFlag('enemy_' + enemyIdx)
          this.enemyAttacking = false
          this.enemyAttackTarget = null

          setTimeout(() => {
            if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
              this.phase = 'auto_battle'
            }
          }, 300)
        }
      }
    } else {
      // 无帧动画的敌人：使用原有跳跃攻击动画
      this.enemyAttacking = true
      this.enemyAttackTarget = target
      this.enemyAttackAnim = {
        phase: 'jump',
        progress: 0,
        baseX: enemyPos.x,
        baseY: enemyPos.y,
        targetX: targetPos.x - 30 * this.dpr,
        targetY: targetPos.y,
        currentX: enemyPos.x,
        currentY: enemyPos.y,
        enemy: this.enemy
      }
    }
  }

  _updateEnemyAttackAnimation(dt) {
    if (!this.enemyAttackAnim || !this.enemyAttacking) return

    const anim = this.enemyAttackAnim
    const speed = 4.0
    const enemyIndex = this.enemies.indexOf(this.enemy)
    const animState = this.enemyAnimStates[enemyIndex]

    if (anim.phase === 'jump') {
      anim.progress += dt * speed
      if (anim.progress >= 1) {
        if (anim.hasFrameAnim && animState) {
          // 有帧动画：到达目标后启动attack帧动画
          anim.phase = 'anim_attack'
          anim.currentX = anim.targetX
          anim.currentY = anim.targetY
          animState.state = 'attack'
          animState.frame = animState.type === 'shadow_mouse' ? 1 : 8
          animState.displayFrame = 0
          animState.frameTimer = 0
          animState.attackDamageApplied = false
        } else {
          // 无帧动画：到达目标后直接结算伤害
          anim.progress = 0
          anim.phase = 'hit'
          anim.currentX = anim.targetX
          anim.currentY = anim.targetY
          this._applyEnemyAttackDamage(this.enemyAttackTarget)
        }
      } else {
        const t = this._easeOutQuad(anim.progress)
        anim.currentX = anim.baseX + (anim.targetX - anim.baseX) * t
        anim.currentY = anim.baseY + (anim.targetY - anim.baseY) * t
        const jumpHeight = Math.sin(anim.progress * Math.PI) * 50 * this.dpr
        anim.currentY -= jumpHeight
      }
    } else if (anim.phase === 'anim_attack') {
      // 帧动画播放阶段：等待帧动画播放完毕（由 _updateEnemyAnimations 的 onAttackComplete 回调触发 return 阶段）
      // 更新位置保持在目标位置
      anim.currentX = anim.targetX
      anim.currentY = anim.targetY
    } else if (anim.phase === 'hit') {
      anim.progress += dt * speed * 2
      if (anim.progress >= 0.25) {
        anim.progress = 0
        anim.phase = 'return'
      }
    } else if (anim.phase === 'return') {
      anim.progress += dt * speed * 0.8
      if (anim.progress >= 1) {
        // 动画完成
        this.enemyAttacking = false
        this.enemyAttackAnim = null
        this.enemyAttacking = false
        this.enemyAttackTarget = null

        // 清除攻击标记 - 实时制：回到auto_battle继续循环
        const enemyIdx = this.enemies.indexOf(anim.enemy || this.enemy)
        this._clearAttackerFlag('enemy_' + enemyIdx)

        setTimeout(() => {
          if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
            this.phase = 'auto_battle'
          }
        }, 200)
      } else {
        const t = this._easeInQuad(anim.progress)
        anim.currentX = anim.targetX + (anim.baseX - anim.targetX) * t
        anim.currentY = anim.targetY + (anim.baseY - anim.targetY) * t
      }
    }
  }

  _applyEnemyAttackDamage(target) {
    // 使用预选的技能（攻击动画启动前已决定）
    const skill = this._currentEnemySkill || { name: '攻击', power: 1.0, type: 'attack' }

    // 特殊技能类型：自我治愈
    if (skill.type === 'heal_self') {
      const healAmount = skill.healAmount || 30
      this.enemy.hp = Math.min(this.enemy.maxHp, this.enemy.hp + healAmount)

      // 获取当前敌人的位置
      const enemyIndex = this.enemies.indexOf(this.enemy)
      const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }

      this.damageTexts.push({
        text: `+${healAmount}`,
        x: enemyPos.x,
        y: enemyPos.y - 50 * this.dpr,
        color: '#2ed573',
        life: 1.5
      })

      this._addLog(`${this.enemy.name} 使用「${skill.name}」！`)
      this._addLog(`恢复了 ${healAmount} 点生命！`)
      return
    }

    const effectiveEnemyAtk = this._getEnemyEffectiveAtk(this.enemy)
    const effectiveHeroDef = this._getEffectiveDef(target)
    let damage = Math.floor(effectiveEnemyAtk * (skill.power || 1.0) - effectiveHeroDef * 0.4)
    damage = Math.max(1, damage + Math.floor(Math.random() * 4) - 1)

    // 敌人暴击判定
    const enemyCritRate = this.enemy.crit || 0
    const isCrit = Math.random() < enemyCritRate
    if (isCrit) {
      damage = Math.floor(damage * 1.5)
      this._addLog(`💥 ${this.enemy.name} 暴击！`)
    }

    target.hp = Math.max(0, target.hp - damage)

    this.shakeAmount = 8
    this.flashAlpha = 0.4

    const targetIndex = this.party.indexOf(target)
    const targetPos = this.heroBasePositions[targetIndex]

    this.damageTexts.push({
      text: `-${damage}`,
      x: targetPos ? targetPos.x : 80 * this.dpr,
      y: targetPos ? targetPos.y - 40 * this.dpr : this.height * 0.5,
      color: '#ff4757',  // 敌人物理伤害：红色
      isCrit: isCrit,
      life: 1.5
    })

    this._addLog(`${this.enemy.name} 使用「${skill.name}」！`)
    this._addLog(`${target.name} 受到 ${damage} 点伤害！`)

    // 播放敌人技能特效（仅技能，普通攻击不播放）
    if (skill.power > 1.0) {
      this._playEnemySkillEffect(skill, targetPos)
    }

    // 敌人技能状态效果
    this._applyEnemySkillStatus(skill, target, targetPos)
  }

  _handleTap(tx, ty) {
    // 加速/暂停按钮检测（auto_battle阶段）
    if (this.phase === 'auto_battle' || this.phase === 'animating') {
      if (this._speedButtonArea) {
        const area = this._speedButtonArea
        if (area.pause && tx >= area.pause.x && tx <= area.pause.x + area.pause.w &&
            ty >= area.pause.y && ty <= area.pause.y + area.pause.h) {
          this.isPaused = !this.isPaused
          return
        }
        if (area.speed && tx >= area.speed.x && tx <= area.speed.x + area.speed.w &&
            ty >= area.speed.y && ty <= area.speed.y + area.speed.h) {
          this.battleSpeed = this.battleSpeed === 1 ? 2 : 1
          return
        }
      }
      // 撤退按钮（实时战斗中也允许撤退）
      if (this._fleeButtonArea) {
        const btn = this._fleeButtonArea
        if (tx >= btn.x && tx <= btn.x + btn.w && ty >= btn.y && ty <= btn.y + btn.h) {
          this._flee()
          return
        }
      }
    }

    switch (this.phase) {
      case 'victory':
      case 'defeat':
        this._handleEndTap(tx, ty)
        break
      case 'purify':
        this._handlePurifyTap(tx, ty)
        break
      // 兼容旧的回合制phase（如果还有残留引用）
      case 'select_hero':
      case 'select_skill':
      case 'select_target':
      case 'select_enemy_target':
        // 不再处理这些阶段
        break
    }
  }

  /**
   * 撤退（逃跑）- 返回地图，不获得任何奖励，怪物保持存活
   */
  _flee() {
    this._addLog(`🏃 撤退成功！`)
    // 确保 currentBattleMonsterId 保留（字段场景需要它来查找怪物）
    // 不设置 battleVictory，字段场景会走"战斗失败/撤退"分支，怪物保持存活
    if (this.monsterId) {
      this.game.data.set('currentBattleMonsterId', this.monsterId)
    }
    console.log(`[Battle] 撤退 - 怪物ID: ${this.monsterId}, 区域: ${this.nodeId}`)
    this.game.changeScene('field', { nodeId: this.nodeId })
  }
  
  /**
   * 处理角色选择
   */
  _handleHeroSelect(tx, ty) {
    // 检查翻页按钮（优先）
    if (this._checkPageButtons(tx, ty)) return

    // 检查点击的角色卡片
    for (const area of this.heroAreas) {
      if (area.hero && area.hero.hp > 0 && this._isInRect(tx, ty, area.x, area.y, area.w, area.h)) {
        // 检查角色是否已行动
        if (this.actedHeroes.has(area.hero.id)) {
          this._addLog(`⚠️ ${area.hero.name} 本回合已行动`)
          return
        }
        // 检查角色是否被限制行动（黏液包裹等）
        const heroIndex = this.party.indexOf(area.hero)
        if (heroIndex !== -1 && this._isHeroRestricted(heroIndex)) {
          this._addLog(`🔗 ${area.hero.name} 被黏液包裹，无法行动！`)
          return
        }
        this.selectedHero = area.hero
        this.phase = 'select_skill'
        this._addLog(`选择 ${area.hero.name} 的技能`)
        return
      }
    }
  }

  _handleSkillSelect(tx, ty) {
    // 只遍历选中角色的技能
    if (!this.selectedHero || !this.selectedHero.skills) return
    
    const dpr = this.dpr
    const btnW = (this.width - 40 * dpr) / 2
    const btnH = 50 * dpr
    const startX = 15 * dpr
    const startY = this.height - 200 * dpr

    for (let si = 0; si < this.selectedHero.skills.length; si++) {
      const skill = this.selectedHero.skills[si]
      const col = si % 2
      const row = Math.floor(si / 2)
      const bx = startX + col * (btnW + 10 * dpr)
      const by = startY + row * (btnH + 8 * dpr)

      if (this._isInRect(tx, ty, bx, by, btnW, btnH)) {
        if (this.selectedHero.mp >= skill.mpCost) {
          this.selectedSkill = skill

          // 确定目标类型
          if (skill.type === 'heal' && skill.target?.includes('ally')) {
            // 治疗技能 - 选择己方目标
            this.phase = 'select_target'
            this._addLog(`${this.selectedHero.name} 使用 ${skill.name}，选择治疗目标`)
          } else if (skill.target === 'all' || skill.target === 'all_ally') {
            // 全体技能 - 直接执行
            this._executeSkill(this.selectedHero, skill, null)
          } else {
            // 单体攻击 - 检查是否需要选择敌人目标
            const aliveEnemies = this.enemies.filter(e => e.hp > 0)
            if (aliveEnemies.length > 1) {
              // 多个存活敌人 - 进入目标选择阶段
              this.phase = 'select_enemy_target'
              this._addLog(`${this.selectedHero.name} 使用 ${skill.name}，选择攻击目标`)
            } else if (aliveEnemies.length === 1) {
              // 只有一个存活敌人 - 直接攻击
              this._executeSkill(this.selectedHero, skill, aliveEnemies[0])
            } else {
              // 没有存活敌人（不应该发生）
              this._addLog(`没有可攻击的目标`)
            }
          }
          return
        } else {
          this._addLog(`MP不足！需要 ${skill.mpCost} MP`)
          return
        }
      }
    }
    
    // 点击空白返回选择角色
    this.phase = 'select_hero'
    this.selectedHero = null
  }

  _handleTargetSelect(tx, ty) {
    // 检查翻页按钮（优先）
    if (this._checkPageButtons(tx, ty)) return

    // 安全检查：确保 heroAreas 存在
    if (!this.heroAreas || !Array.isArray(this.heroAreas)) {
      this.phase = 'select_hero'
      this.selectedHero = null
      return
    }

    // 选择治疗目标
    for (const area of this.heroAreas) {
      if (area.hero && area.hero.hp > 0 && this._isInRect(tx, ty, area.x, area.y, area.w, area.h)) {
        this._executeSkill(this.selectedHero, this.selectedSkill, area.hero)
        return
      }
    }

    // 点击空白取消，返回选择角色
    this.phase = 'select_hero'
    this.selectedHero = null
    this.selectedSkill = null
  }

  /**
   * 处理敌人目标选择
   */
  _handleEnemyTargetSelect(tx, ty) {
    // 检查点击的敌人
    this.enemies.forEach((enemy, index) => {
      if (enemy.hp <= 0) return  // 跳过死亡敌人

      const pos = this.enemyPositions[index]
      if (!pos) return

      // 检测点击范围（使用较大的点击区域）
      const dpr = this.dpr
      const hitRadius = 60 * dpr
      if (this._isInCircle(tx, ty, pos.x, pos.y, hitRadius)) {
        // 选中敌人，执行技能
        this._executeSkill(this.selectedHero, this.selectedSkill, enemy)
        return
      }
    })

    // 点击空白取消，返回选择角色
    // 检查是否点击在敌人区域外
    const clickedEnemy = this.enemies.some((enemy, index) => {
      if (enemy.hp <= 0) return false
      const pos = this.enemyPositions[index]
      if (!pos) return false
      const dpr = this.dpr
      const hitRadius = 60 * dpr
      return this._isInCircle(tx, ty, pos.x, pos.y, hitRadius)
    })

    if (!clickedEnemy) {
      this.phase = 'select_hero'
      this.selectedHero = null
      this.selectedSkill = null
    }
  }

  _handleEndTap(tx, ty) {
    const dpr = this.dpr
    const w = this.width
    const h = this.height
    
    // 检测点击"继续"按钮区域
    const btnW = 160 * dpr
    const btnH = 50 * dpr
    const btnX = (w - btnW) / 2
    const btnY = h / 2 + 60 * dpr
    
    if (this._isInRect(tx, ty, btnX, btnY, btnW, btnH)) {
      if (this.phase === 'victory') {
        // 保存角色状态
        const charData = charStateManager.serialize()
        this.game.data.set('characterStates', charData)
        
        this.game.changeScene('field', { nodeId: this.nodeId })
      } else if (this.phase === 'defeat') {
        this.game.changeScene('main-menu')
      }
    }
  }

  // ======== 技能执行 ========
  _executeSkill(hero, skill, target) {
    this.phase = 'animating'
    hero.mp = Math.max(0, Math.round((hero.mp - skill.mpCost) * 100) / 100)
    this._addLog(`${hero.name} 使用了「${skill.name}」！`)

    // 获取角色位置
    const heroIndex = this.party.indexOf(hero)
    const heroPos = this.heroBasePositions[heroIndex] || { x: this.width * 0.2, y: this.height * 0.5 }

    // 🎯 按技能类型 + 角色职业分支处理
    if (skill.type === 'buff' || skill.type === 'debuff') {
      // ⬆️ Buff/Debuff技能：不造成伤害，直接应用效果
      this._executeBuffSkill(hero, skill, heroPos)
    } else if (skill.type === 'heal') {
      // 💚 治疗技能
      this._executeHealSkill(hero, skill, target, heroPos)
    } else if (skill.type === 'magic') {
      // 🧙‍♂️ 远程魔法攻击（原地施法）
      this._executeRangedAttack(hero, skill, target, heroPos)
    } else {
      // ⚔️ 物理攻击：根据职业决定近战还是远程
      const isRangedRole = (hero.role === 'mage' || hero.role === 'archer')
      if (isRangedRole) {
        this._executeRangedAttack(hero, skill, target, heroPos)
      } else {
        this._executeMeleeAttack(hero, skill, target, heroPos)
      }
    }
  }

  /**
   * 执行Buff/Debuff技能（不造成伤害，应用增益/减益效果）
   */
  _executeBuffSkill(hero, skill, heroPos) {
    // 播放施法特效
    this._playCastEffect(hero, skill, heroPos)

    // 应用buff效果
    if (skill.effect === 'atk_up' || skill.effect === 'atk_up_self') {
      // 攻击力提升
      const value = skill.value || 0.3
      const heroIndex = this.party.indexOf(hero)

      if (skill.effect === 'atk_up') {
        // 全体攻击力提升
        this.party.forEach((h, idx) => {
          if (h.hp > 0) {
            if (!this.statusEffects.heroes[idx]) this.statusEffects.heroes[idx] = []
            const existing = this.statusEffects.heroes[idx].find(e => e.type === 'atk_up')
            if (existing) {
              existing.turnsRemaining = skill.turns || 3
              existing.value = value
            } else {
              this.statusEffects.heroes[idx].push({ type: 'atk_up', turnsRemaining: skill.turns || 3, value })
            }
          }
        })
        this._addLog(`全员攻击力提升 ${Math.round(value * 100)}%！`)
      } else {
        // 自身攻击力提升
        if (heroIndex !== -1) {
          if (!this.statusEffects.heroes[heroIndex]) this.statusEffects.heroes[heroIndex] = []
          const existing = this.statusEffects.heroes[heroIndex].find(e => e.type === 'atk_up')
          if (existing) {
            existing.turnsRemaining = skill.turns || 3
            existing.value = value
          } else {
            this.statusEffects.heroes[heroIndex].push({ type: 'atk_up', turnsRemaining: skill.turns || 3, value })
          }
        }
        this._addLog(`${hero.name} 攻击力提升 ${Math.round(value * 100)}%！`)
      }

      // 显示buff文字特效
      this.damageTexts.push({
        text: '⬆️ ATK UP',
        x: heroPos.x,
        y: heroPos.y - 50 * this.dpr,
        color: '#ffa502',
        life: 1.5
      })

    } else if (skill.effect === 'def_up' || skill.effect === 'def_up_self') {
      // 防御力提升
      const value = skill.value || 0.3
      const heroIndex = this.party.indexOf(hero)

      if (skill.effect === 'def_up') {
        this.party.forEach((h, idx) => {
          if (h.hp > 0) {
            if (!this.statusEffects.heroes[idx]) this.statusEffects.heroes[idx] = []
            const existing = this.statusEffects.heroes[idx].find(e => e.type === 'def_up')
            if (existing) {
              existing.turnsRemaining = skill.turns || 3
              existing.value = value
            } else {
              this.statusEffects.heroes[idx].push({ type: 'def_up', turnsRemaining: skill.turns || 3, value })
            }
          }
        })
        this._addLog(`全员防御力提升 ${Math.round(value * 100)}%！`)
      } else {
        if (heroIndex !== -1) {
          if (!this.statusEffects.heroes[heroIndex]) this.statusEffects.heroes[heroIndex] = []
          const existing = this.statusEffects.heroes[heroIndex].find(e => e.type === 'def_up')
          if (existing) {
            existing.turnsRemaining = skill.turns || 3
            existing.value = value
          } else {
            this.statusEffects.heroes[heroIndex].push({ type: 'def_up', turnsRemaining: skill.turns || 3, value })
          }
        }
        this._addLog(`${hero.name} 防御力提升 ${Math.round(value * 100)}%！`)
      }

      this.damageTexts.push({
        text: '⬆️ DEF UP',
        x: heroPos.x,
        y: heroPos.y - 50 * this.dpr,
        color: '#1e90ff',
        life: 1.5
      })

    } else if (skill.effect === 'atk_down') {
      // 敌人攻击力降低（debuff）
      const aliveEnemies = this.enemies.filter(e => e.hp > 0)
      aliveEnemies.forEach((enemy, idx) => {
        const enemyIdx = this.enemies.indexOf(enemy)
        if (!this.statusEffects.enemies[enemyIdx]) this.statusEffects.enemies[enemyIdx] = []
        const existing = this.statusEffects.enemies[enemyIdx].find(e => e.type === 'atk_down')
        if (existing) {
          existing.turnsRemaining = skill.turns || 3
          existing.value = skill.value || 0.3
        } else {
          this.statusEffects.enemies[enemyIdx].push({ type: 'atk_down', turnsRemaining: skill.turns || 3, value: skill.value || 0.3 })
        }
      })
      this._addLog(`敌方攻击力降低 ${Math.round((skill.value || 0.3) * 100)}%！`)
      this.damageTexts.push({
        text: '⬇️ ATK DOWN',
        x: this.enemyPositions[0]?.x || this.enemyBaseX,
        y: (this.enemyPositions[0]?.y || this.enemyBaseY) - 50 * this.dpr,
        color: '#ff6348',
        life: 1.5
      })

    } else {
      // 其他未特殊处理的buff效果
      this._addLog(`${hero.name} 使用了 ${skill.name}！`)
    }

    // buff动画较短，0.8秒后回到auto_battle
    setTimeout(() => {
      this._clearAttackerFlag(hero.id)
      if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
        this.phase = 'auto_battle'
      }
    }, 800)
  }

  /**
   * 执行治疗技能
   */
  _executeHealSkill(hero, skill, target, heroPos) {
    // 播放施法特效
    this._playCastEffect(hero, skill, heroPos)

    if (skill.target === 'all_ally') {
      // 全体治疗
      this.party.forEach((h, idx) => {
        if (h.hp > 0) {
          let heal = Math.floor(skill.power * (1 + Math.random() * 0.2))
          heal = Math.min(heal, h.maxHp - h.hp)
          h.hp = Math.min(h.maxHp, h.hp + heal)

          const pos = this.heroBasePositions[idx] || heroPos
          this.damageTexts.push({
            text: `+${heal}`,
            x: pos.x,
            y: pos.y - 30 * this.dpr,
            color: '#2ed573',
            life: 1.5
          })
        }
      })
      this._addLog(`全体恢复生命！`)
    } else if (skill.effect === 'cleanse') {
      // 净化技能
      if (target) {
        const targetIdx = this.party.indexOf(target)
        if (targetIdx !== -1 && this.statusEffects.heroes[targetIdx]) {
          this.statusEffects.heroes[targetIdx] = this.statusEffects.heroes[targetIdx].filter(
            e => e.type === 'atk_up' || e.type === 'def_up'  // 保留增益，移除减益
          )
        }
        const heal = Math.floor(skill.power * (1 + Math.random() * 0.2))
        target.hp = Math.min(target.maxHp, target.hp + heal)

        const pos = this.heroBasePositions[targetIdx] || heroPos
        this.damageTexts.push({
          text: `✨+${heal}`,
          x: pos.x,
          y: pos.y - 30 * this.dpr,
          color: '#7bed9f',
          life: 1.5
        })
        this._addLog(`${target.name} 异常状态已净化，恢复 ${heal} 点生命！`)
      }
    } else {
      // 单体治疗
      if (target) {
        let heal = Math.floor(skill.power * (1 + Math.random() * 0.2))
        heal = Math.min(heal, target.maxHp - target.hp)
        target.hp = Math.min(target.maxHp, target.hp + heal)

        const targetIdx = this.party.indexOf(target)
        const pos = targetIdx !== -1 && this.heroBasePositions[targetIdx]
          ? this.heroBasePositions[targetIdx]
          : heroPos

        this.damageTexts.push({
          text: `+${heal}`,
          x: pos.x,
          y: pos.y - 30 * this.dpr,
          color: '#2ed573',
          life: 1.5
        })
        this._addLog(`${target.name} 恢复了 ${heal} 点生命！`)
      }
    }

    // 治疗动画较短，1秒后回到auto_battle
    setTimeout(() => {
      this._clearAttackerFlag(hero.id)
      if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
        this.phase = 'auto_battle'
      }
    }, 1000)
  }

  /**
   * 执行近战攻击（战士等）
   */
  _executeMeleeAttack(hero, skill, target, heroPos) {
    // 播放施法特效（如果有）
    this._playCastEffect(hero, skill, heroPos)

    // 延迟启动攻击动画
    setTimeout(() => {
      this._startAttackAnimation(hero, skill, target)
    }, 600)

    // 设置完成检查 - 实时制：完成后回到auto_battle继续自动循环
    this._waitForAttackComplete = () => {
      if (!this.attackAnim && !this.attackingHero) {
        setTimeout(() => {
          // 清除活跃标记并回到auto_battle
          this._clearAttackerFlag(hero.id)
          if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
            this.phase = 'auto_battle'
          }
        }, 200)
        return true
      }
      return false
    }
  }

  /**
   * 执行远程攻击（法师等）
   */
  _executeRangedAttack(hero, skill, target, heroPos) {
    // 🎆 1. 播放施法特效
    this._playCastEffect(hero, skill, heroPos)

    // ⏱️ 2. 延迟播放击中特效并造成伤害
    setTimeout(() => {
      // 判断是否是全体攻击
      if (skill.target === 'all') {
        // 🌟 全体攻击 - 对所有存活的敌人造成伤害
        const aliveEnemies = this.enemies.filter(e => e.hp > 0)
        
        // 为每个敌人播放击中特效并造成伤害
        aliveEnemies.forEach((enemy, index) => {
          const enemyIndex = this.enemies.indexOf(enemy)
          const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }
          
          // 延迟播放每个敌人的击中特效（错开效果）
          setTimeout(() => {
            this._playHitEffect(hero, skill, enemyPos)
            this._applyMagicDamage(hero, skill, enemy, enemyPos)
          }, index * 200) // 每个敌人间隔200ms
        })

        // 等待所有特效播放完成后回到auto_battle
        setTimeout(() => {
          this._clearAttackerFlag(hero.id)
          if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
            this.phase = 'auto_battle'
          }
        }, 1500 + (aliveEnemies.length - 1) * 200 + 1900) // 施法时长 + 最后一个敌人延迟 + 击中特效时长

      } else {
        // 单体攻击
        const targetEnemyIndex = this.enemies.indexOf(target)
        const targetEnemyPos = this.enemyPositions[targetEnemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }

        // 播放击中特效
        this._playHitEffect(hero, skill, targetEnemyPos)

        // 造成伤害
        this._applyMagicDamage(hero, skill, target, targetEnemyPos)

        // 等待击中特效播放完成 - 回到auto_battle
        setTimeout(() => {
          this._clearAttackerFlag(hero.id)
          if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
            this.phase = 'auto_battle'
          }
        }, 1900) // 击中特效时长
      }

    }, 1500) // 施法特效时长
  }

  /**
   * 应用魔法伤害
   */
  _applyMagicDamage(hero, skill, target, targetPos) {
    // 计算伤害（使用有效攻击力，含buff加成）
    const effectiveAtk = this._getEffectiveAtk(hero)
    const effectiveDef = this._getEnemyEffectiveDef(target)
    let damage = Math.floor(effectiveAtk * skill.power - effectiveDef * 0.5)
    damage = Math.max(1, damage + Math.floor(Math.random() * 5) - 2)

    // 暴击判定
    const heroCritRate = hero.crit || 0
    const isCrit = Math.random() < heroCritRate
    if (isCrit) {
      damage = Math.floor(damage * 1.5)
      this._addLog(`💥 暴击！`)
    }

    target.hp = Math.max(0, target.hp - damage)

    // 动画效果
    this.shakeAmount = 12
    this.flashAlpha = 0.6
    this.damageTexts.push({
      text: `-${damage}`,
      x: targetPos.x,
      y: targetPos.y - 1 * this.dpr,
      color: '#5f9fff',  // 法系伤害：蓝色
      isCrit: isCrit,
      life: 1.5
    })

    this._addLog(`造成 ${damage} 点伤害！`)

    // 吸血效果
    if (skill.effect === 'drain') {
      const heal = Math.floor(damage * 0.3)
      hero.hp = Math.min(hero.maxHp, hero.hp + heal)
      this._addLog(`恢复了 ${heal} 点生命`)
    }

    // 应用状态效果
    if (skill.statusEffect && target.hp > 0) {
      this._applyStatusEffect(target, skill.statusEffect, targetPos)
    }

    // 检查战斗结束
    if (target.hp <= 0) {
      // 目标死亡
    }
  }

  /**
   * 应用状态效果
   */
  _applyStatusEffect(target, effectConfig, targetPos) {
    const enemyIndex = this.enemies.indexOf(target)
    if (enemyIndex === -1) return

    // 初始化敌人的状态效果数组
    if (!this.statusEffects.enemies[enemyIndex]) {
      this.statusEffects.enemies[enemyIndex] = []
    }

    const effectType = effectConfig.type

    // 🔥 灼烧效果
    if (effectType === 'burn') {
      // 检查是否已有灼烧效果
      const existingBurn = this.statusEffects.enemies[enemyIndex].find(e => e.type === 'burn')
      if (existingBurn) {
        // 刷新持续时间和伤害
        existingBurn.duration = effectConfig.duration
        existingBurn.baseDamage = effectConfig.baseDamage
        existingBurn.turnsRemaining = effectConfig.duration
        this._addLog(`🔥 ${target.name} 的灼烧效果已刷新！`)
      } else {
        // 添加新的灼烧效果
        this.statusEffects.enemies[enemyIndex].push({
          type: 'burn',
          duration: effectConfig.duration,
          baseDamage: effectConfig.baseDamage,
          turnsRemaining: effectConfig.duration
        })
        this._addLog(`🔥 ${target.name} 被灼烧了！持续 ${effectConfig.duration} 回合`)

        // 添加视觉效果
        this.damageTexts.push({
          text: `灼烧${effectConfig.duration}回合`,
          label: '灼烧',
          duration: effectConfig.duration,
          x: targetPos.x,
          y: targetPos.y - 100 * this.dpr,
          color: '#ff9f43',
          life: 2.5,
          type: 'burn_effect'  // 灼烧效果提示
        })
      }
    }

    // ❄️ 冰冻效果
    if (effectType === 'freeze') {
      // 概率判定
      if (Math.random() < effectConfig.probability) {
        // 检查是否已被冻结
        const existingFreeze = this.statusEffects.enemies[enemyIndex].find(e => e.type === 'freeze')
        if (!existingFreeze) {
          this.statusEffects.enemies[enemyIndex].push({
            type: 'freeze',
            duration: 1  // 冻结1回合
          })
          this._addLog(`❄️ ${target.name} 被冻结了！`)

          // 添加视觉效果
          this.damageTexts.push({
            text: '冻结1回合',
            label: '冻结',
            x: targetPos.x,
            y: targetPos.y - 80 * this.dpr,
            color: '#74b9ff',
            life: 2.5,
            type: 'freeze_effect'  // 冰冻效果提示
          })
        }
      } else {
        this._addLog(`${target.name} 抵抗了冰冻效果`)
      }
    }
  }

  _executeHeal(hero, skill, target) {
    // 治疗逻辑（待实现）
    setTimeout(() => {
      // 治疗效果
      if (this.phase !== 'victory' && this.phase !== 'defeat') {
        if (this._allHeroesActed()) {
          this.phase = 'enemy_turn'
        } else {
          this.phase = 'select_hero'
          this._addLog(`继续选择角色行动`)
        }
      }
    }, 400)
  }

  /**
   * 检查是否所有存活的角色都已行动
   */
  _allHeroesActed() {
    const aliveHeroes = this.party.filter(h => h.hp > 0)
    return aliveHeroes.every(h => {
      if (this.actedHeroes.has(h.id)) return true
      // 被限制的角色视为已行动
      const heroIndex = this.party.indexOf(h)
      if (heroIndex !== -1 && this._isHeroRestricted(heroIndex)) return true
      return false
    })
  }

  _executeHeal(hero, skill, target) {
    let heal = skill.power + Math.floor(Math.random() * 10)
    heal = Math.min(heal, target.maxHp - target.hp)
    target.hp = Math.min(target.maxHp, target.hp + heal)

    // 治疗特效位置（目标角色的位置）
    const targetIndex = this.party.indexOf(target)
    const targetY = targetIndex >= 0 && this.heroBasePositions[targetIndex] 
      ? this.heroBasePositions[targetIndex].y - 30 * this.dpr
      : this.height * 0.4

    this.damageTexts.push({
      text: `+${heal}`,
      x: targetIndex >= 0 && this.heroBasePositions[targetIndex] 
        ? this.heroBasePositions[targetIndex].x 
        : 80 * this.dpr,
      y: targetY,
      color: '#2ed573',
      life: 1.5
    })

    this._addLog(`${target.name} 恢复了 ${heal} 点生命！`)
  }

  _executeBuff(hero, skill, target) {
    const effectName = {
      'atk_up': '攻击力提升',
      'def_up': '防御力提升',
      'atk_up_self': '攻击力提升'
    }[skill.effect] || '状态变化'

    this._addLog(`${hero.name} 获得了 ${effectName}！`)
  }

  // ======== 敌人回合 ========
  _enemyAction() {
    // 如果队列为空或所有敌人已攻击完，结束敌人回合
    if (this.enemyAttackQueue.length === 0 || this.currentEnemyIndex >= this.enemyAttackQueue.length) {
      // 所有敌人攻击完毕，进入下一回合
      this.enemyAttackQueue = []
      this.currentEnemyIndex = 0
      this.enemyTurnStarted = false  // 重置敌人回合标志
      this.turn++
      this.actedHeroes.clear()  // 重置行动状态
      this.phase = 'select_hero'  // 进入玩家选择角色阶段
      this._addLog(`--- 第 ${this.turn} 回合 ---`)
      console.log(`[Battle] 敌人回合结束，进入第 ${this.turn} 回合`)
      return
    }

    // 获取当前攻击的敌人
    const currentEnemy = this.enemyAttackQueue[this.currentEnemyIndex]

    // ⚠️ 检查敌人是否还活着（可能在回合中被反击或其他效果杀死）
    if (!currentEnemy || currentEnemy.hp <= 0) {
      console.log(`[Battle] 敌人 ${currentEnemy?.name || 'Unknown'} 已死亡，跳过攻击`)
      this.currentEnemyIndex++
      // 递归调用处理下一个敌人
      this._enemyAction()
      return
    }

    // 更新主敌人引用（用于攻击动画）
    this.enemy = currentEnemy

    // 🔥 处理灼烧伤害
    this._processBurnDamage(currentEnemy)

    // 检查灼烧是否杀死敌人
    if (currentEnemy.hp <= 0) {
      console.log(`[Battle] 敌人 ${currentEnemy.name} 被灼烧伤害杀死`)
      this._checkBattleEnd()
      this.currentEnemyIndex++
      setTimeout(() => this._enemyAction(), 500)
      return
    }

    // ❄️ 检查是否被冻结
    if (this._checkFrozen(currentEnemy)) {
      // 被冻结，跳过行动
      this.currentEnemyIndex++
      setTimeout(() => this._enemyAction(), 500)
      return
    }

    // 选择目标（随机存活角色）
    const alive = this.party.filter(h => h.hp > 0)
    if (alive.length === 0) {
      // 所有角色死亡，战斗失败
      this.phase = 'defeat'
      return
    }

    const target = alive[Math.floor(Math.random() * alive.length)]

    // 提前选择技能，供攻击动画判断AOE等属性
    const skills = currentEnemy.skills || []
    const defaultAttack = { name: '攻击', power: 1.0, type: 'attack' }
    // 有一定概率使用普通攻击，其余从技能列表随机选择
    const useNormalAttack = Math.random() < 0.3  // 30%概率普通攻击
    this._currentEnemySkill = (!useNormalAttack && skills.length > 0) 
      ? skills[Math.floor(Math.random() * skills.length)] 
      : defaultAttack
    console.log(`[Battle] ${currentEnemy.name} 选择技能: ${this._currentEnemySkill.name}, effect: ${this._currentEnemySkill.effect || 'none'}`)

    // 启动攻击动画
    this._startEnemyAttackAnimation(target)
  }

  /**
   * 处理灼烧伤害
   */
  _processBurnDamage(enemy) {
    const enemyIndex = this.enemies.indexOf(enemy)
    if (enemyIndex === -1 || !this.statusEffects.enemies[enemyIndex]) return

    const effects = this.statusEffects.enemies[enemyIndex]
    const burnEffect = effects.find(e => e.type === 'burn')

    if (!burnEffect) return

    // 计算灼烧伤害（递减）
    const elapsedTurns = burnEffect.duration - burnEffect.turnsRemaining
    const damageReduction = elapsedTurns / burnEffect.duration  // 0 -> 1
    const burnDamage = Math.floor(burnEffect.baseDamage * (1 - damageReduction * 0.7))  // 递减30%

    console.log(`[Battle] 灼烧伤害计算 - 敌人: ${enemy.name}, 基础伤害: ${burnEffect.baseDamage}, ` +
                `已过回合: ${elapsedTurns}, 递减比例: ${(damageReduction * 0.7 * 100).toFixed(0)}%, ` +
                `最终伤害: ${burnDamage}, 剩余回合: ${burnEffect.turnsRemaining}`)

    // 应用伤害
    enemy.hp = Math.max(0, enemy.hp - burnDamage)

    // 获取敌人位置
    const enemyPosIndex = this.enemies.indexOf(enemy)
    const enemyPos = this.enemyPositions[enemyPosIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }

    // 显示灼烧伤害（特殊样式）
    this.damageTexts.push({
      text: burnDamage.toString(),
      label: '灼烧',  // 特殊标签
      x: enemyPos.x,
      y: enemyPos.y - 70 * this.dpr,
      color: '#ff9f43',  // 橙色
      life: 2.0,
      type: 'burn'  // 灼烧类型
    })

    const turnsText = burnEffect.turnsRemaining > 1 ? `（剩余${burnEffect.turnsRemaining}回合）` : '（最后一回合）'
    this._addLog(`🔥 ${enemy.name} 受到 ${burnDamage} 点灼烧伤害！${turnsText}`)

    // 减少剩余回合
    burnEffect.turnsRemaining--

    // 检查灼烧是否结束
    if (burnEffect.turnsRemaining <= 0) {
      this.statusEffects.enemies[enemyIndex] = effects.filter(e => e.type !== 'burn')
      this._addLog(`🔥 ${enemy.name} 的灼烧效果已结束`)
    }
  }

  /**
   * 检查敌人是否被冻结
   */
  _checkFrozen(enemy) {
    const enemyIndex = this.enemies.indexOf(enemy)
    if (enemyIndex === -1 || !this.statusEffects.enemies[enemyIndex]) return false

    const effects = this.statusEffects.enemies[enemyIndex]
    const freezeEffect = effects.find(e => e.type === 'freeze')

    if (!freezeEffect) return false

    // 被冻结，跳过行动
    this._addLog(`❄️ ${enemy.name} 被冻结了，无法行动！`)

    // 移除冻结效果
    this.statusEffects.enemies[enemyIndex] = effects.filter(e => e.type !== 'freeze')

    return true
  }

  /**
   * 获取敌人的状态效果图标
   */
  _getEnemyStatusIcons(enemyIndex) {
    const icons = []
    const effects = this.statusEffects.enemies[enemyIndex]

    if (!effects) return icons

    effects.forEach(effect => {
      if (effect.type === 'burn') {
        icons.push({
          emoji: '🔥',
          turns: effect.turnsRemaining
        })
      } else if (effect.type === 'freeze') {
        icons.push({
          emoji: '❄️',
          turns: 1
        })
      }
    })

    return icons
  }

  /**
   * 获取己方角色的状态效果图标
   */
  _getHeroStatusIcons(heroIndex) {
    const icons = []
    const effects = this.statusEffects.heroes[heroIndex]

    if (!effects) return icons

    effects.forEach(effect => {
      if (effect.type === 'slimed') {
        icons.push({
          emoji: '🟢',
          turns: effect.turnsRemaining
        })
      } else if (effect.type === 'restricted') {
        icons.push({
          emoji: '🔗',
          turns: effect.turnsRemaining
        })
      }
    })

    return icons
  }

  _checkBattleEnd() {
    // 如果已经是胜利或失败状态，不再处理
    if (this.phase === 'victory' || this.phase === 'defeat' || this.phase === 'purify') {
      return
    }
    
    // 检查是否所有敌人都被击败
    const aliveEnemies = this.enemies.filter(e => e.hp > 0)
    
    if (aliveEnemies.length === 0) {
      // 所有敌人被击败，战斗胜利
      // 特殊处理：艾米Boss感化剧情
      const amyEnemy = this.enemies.find(e => e.isAmy)
      if (amyEnemy) {
        // 标记艾米已被击败
        this.game.data.set('amyDefeated', true)
        this.phase = 'purify'
        this.purifyStep = 0
        this.purifyTimer = 0
        this._addLog(`✨ ${amyEnemy.name} 被打败了...`)
        this._addLog(`一道温暖的光芒涌现...`)
        console.log(`[Battle] 艾米Boss被击败，开始感化剧情`)
        return
      }
      
      // 特殊处理：安妮Boss感化剧情
      const annieEnemy = this.enemies.find(e => e.isAnnie)
      if (annieEnemy) {
        // 标记安妮已被击败
        this.game.data.set('annieDefeated', true)
        this.phase = 'purify'
        this.purifyStep = 0
        this.purifyTimer = 0
        this._addLog(`✨ ${annieEnemy.name} 被打败了...`)
        this._addLog(`一道神秘的光芒涌现...`)
        console.log(`[Battle] 安妮Boss被击败，开始感化剧情`)
        return
      }
      
      this.phase = 'victory'
      this._addLog(`🎉 所有敌人被击败！`)
      
      // 计算总奖励（所有敌人）
      let totalExp = 0
      let totalGold = 0
      for (const enemy of this.enemies) {
        totalExp += enemy.exp || 0
        totalGold += enemy.gold || 0
      }
      
      this._addLog(`获得 ${totalExp} 经验，${totalGold} 金币`)

      // 给所有参战角色增加经验
      console.log(`[Battle] 击败所有敌人，获得 ${totalExp} 经验，${totalGold} 金币`)
      
      // 更新角色状态
      const allChars = charStateManager.getAllCharacters()
      for (const charState of allChars) {
        // 找到参战的角色
        const partyMember = this.party.find(h => h.id === charState.id)
        if (partyMember) {
          // 先同步战斗中的HP/MP到角色状态
          charState.hp = Math.max(0, Math.min(partyMember.hp, charState.maxHp))
          charState.mp = Math.max(0, Math.min(partyMember.mp, charState.maxMp))
          
          console.log(`[Battle] ${charState.name} 当前状态: Lv.${charState.level}, EXP:${charState.exp}/${charState.maxExp}`)
          
          // 然后给予经验
          const levelUpCount = charState.gainExp(totalExp)
          if (levelUpCount > 0) {
            this._addLog(`✨ ${charState.name} 升级了！(Lv.${charState.level})`)
          }
          
          console.log(`[Battle] ${charState.name} 获得经验后: Lv.${charState.level}, EXP:${charState.exp}/${charState.maxExp}`)
          
          // 同步回party（用于显示）
          partyMember.hp = charState.hp
          partyMember.mp = charState.mp
          partyMember.maxHp = charState.maxHp
          partyMember.maxMp = charState.maxMp
          partyMember.atk = charState.atk
          partyMember.def = charState.def
          partyMember.spd = charState.spd
          partyMember.level = charState.level
        }
      }

      // 标记战斗胜利
      this.game.data.set('battleVictory', true)

      // 装备掉落
      let droppedEquipment = null
      if (this.enemy.isBoss) {
        // Boss必定掉落装备
        droppedEquipment = getBossDrop(this.enemy.id)
        if (droppedEquipment) {
          this._addLog(`✨ 获得装备：${droppedEquipment.name}！`)
        }
      } else if (this.enemy.isElite) {
        // 精英怪有较高概率掉落
        if (Math.random() < 0.4) {
          const rarity = Math.random() < 0.2 ? 'rare' : 'common'
          droppedEquipment = getRandomEquipment(rarity)
          if (droppedEquipment) {
            this._addLog(`✨ 获得装备：${droppedEquipment.name}！`)
          }
        }
      } else {
        // 普通怪有低概率掉落
        if (Math.random() < 0.15) {
          droppedEquipment = getRandomEquipment('common')
          if (droppedEquipment) {
            this._addLog(`✨ 获得装备：${droppedEquipment.name}！`)
          }
        }
      }
      
      // 保存掉落的装备（用于field-scene添加到背包）
      if (droppedEquipment) {
        this.game.data.set('droppedEquipment', droppedEquipment)
      }

      // 标记 Boss 已击败（使用区域ID + 敌人ID作为唯一标识）
      if (this.enemy.isBoss) {
        const bossFlag = `${this.nodeId}_${this.enemy.id}_defeated`
        this.game.data.addFlag(bossFlag)
        console.log(`[Battle] Boss已击败，标记: ${bossFlag}`)
      }
    }

    if (this.party.every(h => h.hp <= 0)) {
      this.phase = 'defeat'
      this._addLog(`队伍全灭...`)
    }
  }

  _isInRect(x, y, rx, ry, rw, rh) {
    return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh
  }

  _isInCircle(x, y, cx, cy, r) {
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= r * r
  }

  /**
   * 检查翻页按钮点击
   * @returns {boolean} 是否点击了翻页按钮
   */
  _checkPageButtons(tx, ty) {
    if (this.totalHeroPages <= 1 || this.heroAreas.length === 0) return false

    const dpr = this.dpr
    const btnW = 50 * dpr
    const btnH = 80 * dpr

    const firstArea = this.heroAreas[0]
    const lastArea = this.heroAreas[this.heroAreas.length - 1]
    const cardCenterY = firstArea.y + firstArea.h / 2

    // 上一页按钮（左侧卡片旁边）
    if (this.heroPage > 0) {
      const prevBtnX = Math.max(10 * dpr, firstArea.x - btnW - 5 * dpr)
      const prevBtnY = cardCenterY - btnH / 2
      if (this._isInRect(tx, ty, prevBtnX, prevBtnY, btnW, btnH)) {
        this._prevHeroPage()
        return true
      }
    }

    // 下一页按钮（右侧卡片旁边）
    if (this.heroPage < this.totalHeroPages - 1) {
      const nextBtnX = Math.min(this.width - btnW - 10 * dpr, lastArea.x + lastArea.w + 5 * dpr)
      const nextBtnY = cardCenterY - btnH / 2
      if (this._isInRect(tx, ty, nextBtnX, nextBtnY, btnW, btnH)) {
        this._nextHeroPage()
        return true
      }
    }

    return false
  }

  // ======== 渲染 ========
  render(ctx) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr

    // 战斗背景 - 优先使用图片
    const bgImage = this.game.assets.get(this._getBgKey())
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, w, h)
      // 半透明遮罩
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(0, 0, w, h)
    } else {
      // 备用渐变背景
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      bgGrad.addColorStop(0, '#1a1a2e')
      bgGrad.addColorStop(1, '#16213e')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)
    }

    // 屏幕震动
    if (this.shakeAmount > 0) {
      ctx.save()
      ctx.translate(
        (Math.random() - 0.5) * this.shakeAmount,
        (Math.random() - 0.5) * this.shakeAmount
      )
    }

    // 敌人区域（不含精灵）
    if (!this.enemyAttacking) {
      this._renderEnemyUI(ctx)
    }

    // 己方队伍
    this._renderParty(ctx)

    // 敌人精灵（绘制在角色之上）
    if (!this.enemyAttacking || !this.enemyAttackAnim) {
      // 非攻击状态 或 原地技能施法（无跳跃动画）→ 正常渲染敌人精灵
      this._renderEnemySprites(ctx)
    } else {
      // 跳跃攻击中的敌人绘制在角色之上
      this._renderAttackingEnemy(ctx)
    }

    // 攻击中的角色（绘制在敌人附近）
    this._renderAttackingHero(ctx)

    // 自动战斗UI（替代旧的技能面板选择UI）
    if (this.phase === 'auto_battle' || this.phase === 'animating') {
      this._renderAutoBattleUI(ctx)
      this._renderFleeButton(ctx)
    }

    // 战斗日志
    this._renderBattleLog(ctx)

    // 代码特效（粒子动画）
    this._renderCodeEffects(ctx)

    // 伤害数字（安全检查）
    if (this.damageTexts && Array.isArray(this.damageTexts)) {
      for (const dt of this.damageTexts) {
        if (dt.type === 'burn') {
          // 🔥 灼烧伤害 - 特殊显示样式
          this._renderBurnDamage(ctx, dt, dpr)
        } else if (dt.type === 'burn_effect') {
          // 🔥 灼烧效果提示
          this._renderStatusEffect(ctx, dt, dpr, 'burn')
        } else if (dt.type === 'freeze_effect') {
          // ❄️ 冰冻效果提示
          this._renderStatusEffect(ctx, dt, dpr, 'freeze')
        } else {
          // 普通伤害/治疗 - 暴击放大字体
          const isCrit = dt.isCrit || false
          const fontSize = isCrit ? 38 : 28
          ctx.font = `bold ${fontSize * dpr}px sans-serif`
          ctx.fillStyle = dt.color
          ctx.textAlign = 'center'
          // 描边增强可读性（蓝色等浅色字体尤其需要）
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.lineWidth = (isCrit ? 3 : 2) * dpr
          ctx.strokeText(dt.text, dt.x, dt.y)
          ctx.fillText(dt.text, dt.x, dt.y)
        }
      }
    }

    // 闪光效果
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`
      ctx.fillRect(0, 0, w, h)
    }

    // 回合信息
    this._renderTurnInfo(ctx)

    if (this.shakeAmount > 0) {
      ctx.restore()
    }

    // 胜利/失败画面
    if (this.phase === 'victory') {
      this._renderEndScreen(ctx, '🎉 胜利！', '#2ed573', '点击继续')
    } else if (this.phase === 'defeat') {
      this._renderEndScreen(ctx, '💔 战败...', '#ff4757', '点击返回')
    } else if (this.phase === 'purify') {
      // 感化剧情
      this._renderPurifyScene(ctx)
    }
  }

  _renderEnemyUI(ctx) {
    const dpr = this.dpr

    // 渲染所有敌人UI（不含精灵）
    if (!this.enemyPositions || this.enemyPositions.length === 0) {
      return
    }

    this.enemies.forEach((enemy, index) => {
      const pos = this.enemyPositions[index]
      if (!pos) return

      // 死亡退场动画：alpha<=0 时才跳过
      const deathAnim = this.enemyDeathAnim[index]
      const isDead = enemy.hp <= 0
      if (isDead && (!deathAnim || deathAnim.alpha <= 0)) return

      // 退场动画时设置透明度
      if (isDead && deathAnim) {
        ctx.globalAlpha = deathAnim.alpha
      }

      const ex = pos.x
      const ey = pos.y

      // 敌人目标选择提示（死亡敌人不显示）
      const isSelectable = !isDead && this.phase === 'select_enemy_target'
      if (isSelectable) {
        const pulseAlpha = 0.3 + Math.sin(this.time * 4) * 0.15
        ctx.fillStyle = `rgba(255, 159, 67, ${pulseAlpha})`
        ctx.beginPath()
        ctx.arc(ex, ey, 70 * dpr, 0, Math.PI * 2)
        ctx.fill()

        ctx.font = `bold ${14 * dpr}px sans-serif`
        ctx.fillStyle = '#ff9f43'
        ctx.textAlign = 'center'
        ctx.fillText('👆 点击选择', ex, ey - 125 * dpr)
      }

      // 敌人光环效果（死亡不显示）
      if (!isDead && enemy.isBoss) {
        const glowSize = 80 * dpr + Math.sin(this.time * 2) * 5 * dpr
        ctx.fillStyle = 'rgba(255, 71, 87, 0.15)'
        ctx.beginPath()
        ctx.arc(ex, ey, glowSize, 0, Math.PI * 2)
        ctx.fill()
      }

      // HP 血条（DNF风格：只显示当前段，打空自动切下一段，颜色不同）
      const SEGMENT_HP = 100
      const totalSegments = Math.ceil(enemy.maxHp / SEGMENT_HP)
      // 当前HP所在段（从0开始，0=最底层段）
      // 特殊处理：当hp正好是段边界时，显示下一段（满血），而非当前段（空血）
      let currentSegment = enemy.hp <= 0 ? 0 : Math.floor((enemy.hp - 1) / SEGMENT_HP)
      // 边界：hp=0时currentSegment=-1，修正为0
      if (currentSegment < 0) currentSegment = 0
      // 当前段内剩余HP
      const segStartHp = currentSegment * SEGMENT_HP
      const segEndHp = Math.min((currentSegment + 1) * SEGMENT_HP, enemy.maxHp)
      const segMaxHp = segEndHp - segStartHp
      const segCurrentHp = Math.max(0, enemy.hp - segStartHp)
      const segRatio = enemy.hp <= 0 ? 0 : segCurrentHp / segMaxHp

      // 延迟动画
      const delayInfo = this.enemyHpDelay[index]
      const segDelayRatio = delayInfo ? delayInfo.delay : 1.0

      // 血条颜色（DNF风格：当前在第几段就用对应颜色）
      const SEGMENT_COLORS = [
        '#ff4757',  // 第1段 红
        '#ff9f43',  // 第2段 橙
        '#feca57',  // 第3段 黄
        '#2ed573',  // 第4段 绿
        '#1e90ff',  // 第5段 蓝
        '#a55eea',  // 第6段 紫
      ]
      const barColor = SEGMENT_COLORS[currentSegment % SEGMENT_COLORS.length]

      const hpBarW = 100 * dpr
      const hpBarH = 16 * dpr
      const hpBarX = ex - hpBarW / 2
      const hpBarY = ey - 75 * dpr

      // 背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.beginPath()
      this._roundRect(ctx, hpBarX - 3 * dpr, hpBarY - 3 * dpr, hpBarW + 6 * dpr, hpBarH + 6 * dpr, 10 * dpr)
      ctx.fill()

      // 段数标记（多段时显示 ×N，N=剩余段数）
      const remainSegments = currentSegment + 1
      const barText = totalSegments > 1
        ? `×${remainSegments}`
        : `${enemy.hp}/${enemy.maxHp}`
      this._drawBar(ctx, hpBarX, hpBarY, hpBarW, hpBarH,
        segRatio, barColor,
        barText,
        segDelayRatio)

      // 敌人名称和等级（在HP条上方）
      ctx.font = `bold ${16 * dpr}px sans-serif`
      ctx.fillStyle = enemy.isBoss ? '#ff4757' : '#ffffff'
      ctx.textAlign = 'center'
      const title = enemy.isBoss ? `👑 ${enemy.name}` : enemy.name
      ctx.fillText(title, ex, hpBarY - 18 * dpr)

      ctx.font = `${12 * dpr}px sans-serif`
      ctx.fillStyle = '#f39c12'
      ctx.fillText(`Lv.${enemy.level || 1}`, ex, hpBarY - 34 * dpr)

      if (enemy.crit && enemy.crit > 0) {
        ctx.font = `${10 * dpr}px sans-serif`
        ctx.fillStyle = '#ff6b6b'
        ctx.fillText(`暴击 ${(enemy.crit * 100).toFixed(0)}%`, ex, hpBarY - 48 * dpr)
      }

      // 状态效果图标（在等级上方）
      const statusIcons = this._getEnemyStatusIcons(index)
      if (statusIcons.length > 0) {
        const iconY = hpBarY - 65 * dpr
        const iconSpacing = 30 * dpr
        const startX = ex - (statusIcons.length - 1) * iconSpacing / 2

        statusIcons.forEach((icon, i) => {
          const iconX = startX + i * iconSpacing
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
          ctx.beginPath()
          ctx.arc(iconX, iconY, 12 * dpr, 0, Math.PI * 2)
          ctx.fill()

          ctx.font = `${16 * dpr}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(icon.emoji, iconX, iconY)

          if (icon.turns) {
            ctx.font = `bold ${10 * dpr}px sans-serif`
            ctx.fillStyle = '#fff'
            ctx.fillText(icon.turns.toString(), iconX + 10 * dpr, iconY + 8 * dpr)
          }
        })
      }

      // 恢复透明度
      if (isDead && deathAnim) {
        ctx.globalAlpha = 1.0
      }
    })
  }

  _renderEnemySprites(ctx) {
    // 只渲染敌人精灵（绘制在角色之上）
    if (!this.enemyPositions || this.enemyPositions.length === 0) {
      return
    }

    this.enemies.forEach((enemy, index) => {
      const pos = this.enemyPositions[index]
      if (!pos) return

      // 死亡退场动画
      const deathAnim = this.enemyDeathAnim[index]
      const isDead = enemy.hp <= 0
      if (isDead && (!deathAnim || deathAnim.alpha <= 0)) return

      if (isDead && deathAnim) {
        ctx.globalAlpha = deathAnim.alpha
      }

      this._drawEnemySprite(ctx, pos.x, pos.y, enemy)

      if (isDead && deathAnim) {
        ctx.globalAlpha = 1.0
      }
    })
  }

  _drawEnemySprite(ctx, x, y, enemy) {
    const dpr = this.dpr
    const size = 55 * dpr
    // 行走时不加呼吸动画（保持稳定），idle时保留呼吸感
    const enemyIndex = this.enemies.indexOf(enemy)
    const animState = this.enemyAnimStates[enemyIndex]
    const isWalking = animState && animState.state === 'walk'
    const bounce = isWalking ? 0 : Math.sin(this.time * 2) * 3 * dpr

    // 检查是否有动画状态

    // 如果有帧动画状态，使用动画帧渲染
    if (animState) {
      const frameKey = this._getEnemyFrameKey(animState)
      const frameImg = this.game.assets.get(frameKey)

      if (frameImg) {
        ctx.save()
        ctx.translate(x, y + bounce)

        // 移动时根据方向水平翻转：向左走时镜像
        if (isWalking) {
          const estate = this.unitStates['enemy_' + enemyIndex]
          if (estate && estate.targetX !== null && estate.targetX < estate.x) {
            ctx.scale(-1, 1)  // 向左走，镜像翻转
          }
        }

        // 阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
        ctx.beginPath()
        ctx.ellipse(0, size * 0.4, size * 0.5, size * 0.15, 0, 0, Math.PI * 2)
        ctx.fill()

        // 绘制动画帧（保持宽高比）
        const frameWidth = animState.type === 'wild_cat' ? 816 : 832
        const frameHeight = animState.type === 'wild_cat' ? 1120 : 1072
        const scale = (size * 2) / frameHeight
        const drawWidth = frameWidth * scale
        const drawHeight = frameHeight * scale

        ctx.drawImage(frameImg, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)

        ctx.restore()
        return
      }
    }

    // 默认绘制逻辑（其他敌人）
    ctx.save()
    ctx.translate(x, y + bounce)

    // 阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.beginPath()
    ctx.ellipse(0, size * 0.4, size * 0.5, size * 0.15, 0, 0, Math.PI * 2)
    ctx.fill()

    // 身体颜色
    const bodyColor = enemy.isBoss ? '#ff4757' : 
                      enemy.isElite ? '#a55eea' : '#7c5ce0'

    // 身体渐变
    const bodyGrad = ctx.createRadialGradient(-size * 0.2, -size * 0.2, 0, 0, 0, size * 0.7)
    bodyGrad.addColorStop(0, this._lightenColor(bodyColor, 30))
    bodyGrad.addColorStop(1, bodyColor)
    ctx.fillStyle = bodyGrad

    // 身体
    ctx.beginPath()
    ctx.ellipse(0, 0, size * 0.55, size * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()

    // 耳朵
    ctx.fillStyle = bodyColor
    // 左耳
    ctx.beginPath()
    ctx.moveTo(-size * 0.4, -size * 0.25)
    ctx.quadraticCurveTo(-size * 0.55, -size * 0.8, -size * 0.15, -size * 0.4)
    ctx.fill()
    // 右耳
    ctx.beginPath()
    ctx.moveTo(size * 0.4, -size * 0.25)
    ctx.quadraticCurveTo(size * 0.55, -size * 0.8, size * 0.15, -size * 0.4)
    ctx.fill()

    // 耳朵内部
    ctx.fillStyle = '#ffb8b8'
    ctx.beginPath()
    ctx.moveTo(-size * 0.35, -size * 0.3)
    ctx.quadraticCurveTo(-size * 0.45, -size * 0.65, -size * 0.2, -size * 0.38)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(size * 0.35, -size * 0.3)
    ctx.quadraticCurveTo(size * 0.45, -size * 0.65, size * 0.2, -size * 0.38)
    ctx.fill()

    // 眼睛
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(-size * 0.2, -size * 0.05, size * 0.12, size * 0.14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size * 0.2, -size * 0.05, size * 0.12, size * 0.14, 0, 0, Math.PI * 2)
    ctx.fill()

    // 瞳孔
    ctx.fillStyle = '#1a1a2e'
    ctx.beginPath()
    ctx.ellipse(-size * 0.18, -size * 0.03, size * 0.06, size * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size * 0.22, -size * 0.03, size * 0.06, size * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()

    // 眼睛高光
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(-size * 0.22, -size * 0.08, size * 0.03, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(size * 0.18, -size * 0.08, size * 0.03, 0, Math.PI * 2)
    ctx.fill()

    // 鼻子
    ctx.fillStyle = '#ff9ff3'
    ctx.beginPath()
    ctx.moveTo(0, size * 0.08)
    ctx.lineTo(-size * 0.05, size * 0.15)
    ctx.lineTo(size * 0.05, size * 0.15)
    ctx.closePath()
    ctx.fill()

    // 嘴巴
    ctx.strokeStyle = '#2d3436'
    ctx.lineWidth = 1.5 * dpr
    ctx.beginPath()
    ctx.moveTo(0, size * 0.15)
    ctx.lineTo(0, size * 0.22)
    ctx.moveTo(-size * 0.1, size * 0.25)
    ctx.quadraticCurveTo(0, size * 0.3, size * 0.1, size * 0.25)
    ctx.stroke()

    // 胡须
    ctx.strokeStyle = '#2d3436'
    ctx.lineWidth = 1 * dpr
    // 左胡须
    ctx.beginPath()
    ctx.moveTo(-size * 0.25, size * 0.12)
    ctx.lineTo(-size * 0.55, size * 0.08)
    ctx.moveTo(-size * 0.25, size * 0.18)
    ctx.lineTo(-size * 0.55, size * 0.18)
    // 右胡须
    ctx.moveTo(size * 0.25, size * 0.12)
    ctx.lineTo(size * 0.55, size * 0.08)
    ctx.moveTo(size * 0.25, size * 0.18)
    ctx.lineTo(size * 0.55, size * 0.18)
    ctx.stroke()

    // Boss 特效：角
    if (enemy.isBoss) {
      ctx.fillStyle = '#2d3436'
      ctx.beginPath()
      ctx.moveTo(-size * 0.3, -size * 0.35)
      ctx.lineTo(-size * 0.4, -size * 0.7)
      ctx.lineTo(-size * 0.2, -size * 0.35)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(size * 0.3, -size * 0.35)
      ctx.lineTo(size * 0.4, -size * 0.7)
      ctx.lineTo(size * 0.2, -size * 0.35)
      ctx.fill()
    }

    ctx.restore()
  }

  /**
   * 获取敌人动画帧的资源key
   */
  _getEnemyFrameKey(animState) {
    if (animState.type === 'wild_cat') {
      const frameNum = String(animState.frame).padStart(2, '0')
      if (animState.state === 'walk') return `CAT_WALK_${frameNum}`
      return `CAT_IDLE_${frameNum}`
    }
    // 暗影鼠
    if (animState.type === 'shadow_mouse') {
      const frameNum = String(animState.frame).padStart(2, '0')
      if (animState.state === 'idle' || animState.state === 'walk') return `SHADOW_MOUSE_IDLE_${frameNum}`
      if (animState.state === 'attack') return `SHADOW_MOUSE_ATTACK_${frameNum}`
      if (animState.state === 'skill') return `SHADOW_MOUSE_SKILL_${frameNum}`
      return 'SHADOW_MOUSE_IDLE_01'
    }
    // 史莱姆猫
    if (animState.state === 'idle' || animState.state === 'walk') {
      return `SLIME_CAT_IDLE_${animState.frame}`
    } else if (animState.state === 'attack') {
      return `SLIME_CAT_ATTACK_${String(animState.frame).padStart(4, '0')}`
    } else if (animState.state === 'skill') {
      return `SLIME_CAT_SKILL_${String(animState.frame).padStart(4, '0')}`
    }
    return 'SLIME_CAT_IDLE_1'
  }

  _lightenColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.min(255, (num >> 16) + amt)
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt)
    const B = Math.min(255, (num & 0x0000FF) + amt)
    return `rgb(${R}, ${G}, ${B})`
  }

  _renderAttackingHero(ctx) {
    if (!this.attackAnim || !this.attackingHero) return

    const hero = this.attackingHero
    const anim = this.attackAnim
    const dpr = this.dpr

    const heroImgKey = this._getHeroImageKey(hero.id)
    const heroImg = this.game.assets.get(heroImgKey)
    const avatarSize = 70 * dpr

    // 攻击状态特效
    if (anim.phase === 'jump') {
      // 移动轨迹残影
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.arc(anim.baseX, anim.baseY, avatarSize / 2 * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 159, 67, 0.3)'
      ctx.fill()
      ctx.globalAlpha = 1
    } else if (anim.phase === 'hit') {
      // 攻击闪光
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.beginPath()
      ctx.arc(anim.currentX, anim.currentY, avatarSize * 0.8, 0, Math.PI * 2)
      ctx.fill()
    }

    // 绘制角色
    ctx.save()
    ctx.translate(anim.currentX, anim.currentY)

    // 攻击时朝向右边
    if (anim.phase !== 'return') {
      ctx.scale(-1, 1)
    }

    if (heroImg) {
      // 攻击时稍微放大
      const scale = anim.phase === 'hit' ? 1.2 : 1.1
      ctx.drawImage(heroImg, -avatarSize * scale / 2, -avatarSize * scale / 2, 
                   avatarSize * scale, avatarSize * scale)
    } else {
      ctx.font = `${35 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(hero.role === 'warrior' ? '⚔️' : '🔮', 0, 0)
    }

    ctx.restore()

    // 攻击特效
    if (anim.phase === 'hit') {
      // 攻击冲击波
      const impactSize = 40 * dpr + Math.sin(this.time * 10) * 10 * dpr
      ctx.strokeStyle = 'rgba(255, 159, 67, 0.8)'
      ctx.lineWidth = 3 * dpr
      ctx.beginPath()
      ctx.arc(anim.currentX + 30 * dpr, anim.currentY, impactSize, 0, Math.PI * 2)
      ctx.stroke()

      // 攻击文字
      ctx.font = `bold ${18 * dpr}px sans-serif`
      ctx.fillStyle = '#ff9f43'
      ctx.textAlign = 'center'
      ctx.fillText('攻击!', anim.currentX, anim.currentY - avatarSize / 2 - 20 * dpr)
    }
  }

  _renderAttackingEnemy(ctx) {
    if (!this.enemyAttackAnim) return

    const anim = this.enemyAttackAnim
    const dpr = this.dpr
    const attackingEnemy = anim.enemy || this.enemy  // 使用动画中的敌人或主敌人

    // 攻击状态特效
    if (anim.phase === 'jump') {
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.arc(anim.baseX, anim.baseY, 50 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = attackingEnemy.isBoss ? 'rgba(255, 71, 87, 0.3)' : 'rgba(124, 92, 224, 0.3)'
      ctx.fill()
      ctx.globalAlpha = 1
    } else if (anim.phase === 'hit') {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'
      ctx.beginPath()
      ctx.arc(anim.currentX, anim.currentY, 60 * dpr, 0, Math.PI * 2)
      ctx.fill()
    }

    // 绘制敌人
    ctx.save()
    ctx.translate(anim.currentX, anim.currentY)

    // 攻击时朝向左边
    if (anim.phase !== 'return') {
      ctx.scale(-1, 1)
    }

    // 调用敌人绘制
    this._drawEnemySprite(ctx, 0, 0, attackingEnemy)

    ctx.restore()

    // 攻击特效
    if (anim.phase === 'hit') {
      const impactSize = 45 * dpr + Math.sin(this.time * 10) * 10 * dpr
      ctx.strokeStyle = attackingEnemy.isBoss ? 'rgba(255, 71, 87, 0.8)' : 'rgba(124, 92, 224, 0.8)'
      ctx.lineWidth = 3 * dpr
      ctx.beginPath()
      ctx.arc(anim.currentX - 30 * dpr, anim.currentY, impactSize, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  _renderParty(ctx) {
    const dpr = this.dpr

    // 安全检查：确保 party 存在
    if (!this.party || !Array.isArray(this.party) || this.party.length === 0) {
      console.error('[Battle] party 数据不存在或为空')
      return
    }

    // 渲染当前页的角色
    for (const area of this.heroAreas) {
      const hero = area.hero

      // 安全检查：确保 hero 存在
      if (!hero) {
        console.error(`[Battle] hero 不存在`)
        continue
      }

      // 跳过正在攻击的角色
      if (this.attackingHero === hero && this.attackAnim) continue

      const x = area.x
      const y = area.y
      const cardW = area.w
      const cardH = area.h

      const isActive = (this.phase === 'select_target' || this.phase === 'select_hero') && hero.hp > 0
      const isDead = hero.hp <= 0
      const isAttacking = this.activeAttackers.has(hero.id)

      // 死亡透明度（平滑淡出）
      if (!this.heroDeadAlpha) this.heroDeadAlpha = {}
      const deadAlpha = this.heroDeadAlpha[hero.id] ??= isDead ? 1 : 1
      if (isDead && deadAlpha > 0) {
        this.heroDeadAlpha[hero.id] = Math.max(0, deadAlpha - 0.02)  // 每帧减少2%
      }
      const alpha = isDead ? deadAlpha : 1
      if (alpha <= 0) continue  // 完全透明则不渲染

      ctx.save()
      ctx.globalAlpha = alpha

      // ====== 判断角色是否在战场移动/战斗中 ======
      const uState = this.unitStates[hero.id]
      const isOnBattlefield = uState && (
        uState.state === 'moving_to_attack' ||
        uState.state === 'in_range' ||
        uState.state === 'attacking' ||
        uState.state === 'returning'
      )
      // 基础布局参数（两个分支共用）
      const centerX = x + cardW / 2

      if (isOnBattlefield) {
        // ====== 战斗状态：所有UI（名字+HP+MP+精灵）跟随角色动态位置 ======
        const spriteSize = 60 * dpr
        const bx = uState.x
        const by = uState.y

        // 名字 + 等级（头顶）
        ctx.font = `bold ${11 * dpr}px sans-serif`
        ctx.fillStyle = isDead ? '#666' : (isAttacking ? '#FF9F43' : '#fff')
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        const levelText = hero.level ? `Lv.${hero.level}` : ''
        ctx.fillText(`${hero.name} ${levelText}`, bx, by - spriteSize / 2 - 6 * dpr)

        // HP 条
        const hpRatio = Math.min(1, Math.max(0, hero.hp / hero.maxHp))
        const barW = spriteSize * 0.8
        const hpBarX = bx - barW / 2
        const hpBarY = by - spriteSize / 2 + 2 * dpr
        const hpBarH = 5 * dpr
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(hpBarX, hpBarY, barW, hpBarH)
        if (hpRatio > 0.001) {
          ctx.fillStyle = '#FF4757'
          ctx.fillRect(hpBarX, hpBarY, barW * hpRatio, hpBarH)
        }

        // MP 条
        const mpRatio = Math.min(1, Math.max(0, hero.mp / hero.maxMp))
        const mpBarY = hpBarY + hpBarH + 2 * dpr
        const mpBarH = 4 * dpr
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(hpBarX, mpBarY, barW, mpBarH)
        if (mpRatio > 0.001) {
          ctx.fillStyle = '#5F9FFF'
          ctx.fillRect(hpBarX, mpBarY, barW * mpRatio, mpBarH)
        }

        // 角色精灵 - 根据动画状态选择帧
        const hAnimState = this.heroAnimStates[hero.id]
        let heroImgKey
        // ====== 角色动画：attack > walk > idle（技能特效由 createEffect 独立叠加）======
        if (isAttacking || (hAnimState && hAnimState.state === 'attack')) {
          heroImgKey = this._getHeroAttackImageKey(hero.id)
        } else if (hAnimState && hAnimState.state === 'walk') {
          heroImgKey = this._getHeroWalkImageKey(hero.id, hAnimState.frame)
        } else {
          heroImgKey = this._getHeroIdleImageKey(hero.id, hAnimState ? hAnimState.frame : 0)
        }
        const heroImg = this.game.assets.get(heroImgKey) || this.game.assets.get(this._getHeroImageKey(hero.id))

        if (heroImg) {
          const facingRight = (uState.targetX !== null && uState.targetX > uState.x) ||
                              (uState.state === 'attacking')
          
          // 角色独立缩放：让所有角色视觉大小一致
          const heroScale = this._getHeroScale(hero.id)
          const drawSize = spriteSize * heroScale
          
          if (!facingRight) {
            ctx.save()
            ctx.translate(bx, by)
            ctx.scale(-1, 1)
            ctx.drawImage(heroImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize)
            ctx.restore()
          } else {
            ctx.drawImage(heroImg, bx - drawSize / 2, by - drawSize / 2, drawSize, drawSize)
          }
          
          // 清除阴影设置
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'
        }
      } else {
        // ====== 空闲/死亡：卡片内正常布局 ======
        const avatarSize = 55 * dpr
        const barWidth = avatarSize

        // 名字 + 等级（头顶）
        ctx.font = `bold ${11 * dpr}px sans-serif`
        ctx.fillStyle = isDead ? '#666' : (isAttacking ? '#FF9F43' : '#fff')
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        const levelText = hero.level ? `Lv.${hero.level}` : ''
        ctx.fillText(`${hero.name} ${levelText}`, centerX, y + 14 * dpr)

        // HP 条（红色短条）
        const hpRatio = Math.min(1, Math.max(0, hero.hp / hero.maxHp))
        const hpBarX = centerX - barWidth / 2
        const hpBarY = y + 18 * dpr
        const hpBarH = 6 * dpr
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.fillRect(hpBarX, hpBarY, barWidth, hpBarH)
        if (hpRatio > 0.001) {
          ctx.fillStyle = '#FF4757'
          ctx.fillRect(hpBarX, hpBarY, barWidth * hpRatio, hpBarH)
        }

        // MP 条（蓝色短条）
        const mpRatio = Math.min(1, Math.max(0, hero.mp / hero.maxMp))
        const mpBarY = hpBarY + hpBarH + 3 * dpr
        const mpBarH = 4 * dpr
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.fillRect(hpBarX, mpBarY, barWidth, mpBarH)
        if (mpRatio > 0.001) {
          ctx.fillStyle = '#5F9FFF'
          ctx.fillRect(hpBarX, mpBarY, barWidth * mpRatio, mpBarH)
        }

        // 角色立绘
        const hAnimState = this.heroAnimStates[hero.id]
        let heroImgKey
        
        // ====== 角色动画：attack > idle（技能特效由 createEffect 独立叠加）======
        if (isAttacking) {
          heroImgKey = this._getHeroAttackImageKey(hero.id)
        } else {
          heroImgKey = this._getHeroIdleImageKey(hero.id, hAnimState ? hAnimState.frame : 0)
        }
        const heroImg = this.game.assets.get(heroImgKey) || this.game.assets.get(this._getHeroImageKey(hero.id))
        const avatarX = centerX - avatarSize / 2
        const avatarY = mpBarY + mpBarH + 8 * dpr

        if (heroImg) {
          let floatOffset = 0
          if (!isDead && !isAttacking) {
            floatOffset = Math.sin(Date.now() / 500 + hero.id.charCodeAt(0)) * 2 * dpr
          }
          
          // 角色独立缩放（卡片状态也统一大小）
          const heroScale = this._getHeroScale(hero.id)
          const drawSize = avatarSize * heroScale
          ctx.drawImage(heroImg, centerX - drawSize / 2, avatarY + floatOffset + (avatarSize - drawSize) / 2, drawSize, drawSize)
        } else {
          ctx.font = `${28 * dpr}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(hero.role === 'warrior' ? '⚔️' : '🔮', centerX, avatarY + avatarSize / 2)
        }
      }

      ctx.restore()
    }

    // 渲染翻页按钮（如果有多页）
    if (this.totalHeroPages > 1) {
      this._renderPageButtons(ctx)
    }
  }

  /**
   * 渲染翻页按钮
   */
  _renderPageButtons(ctx) {
    const dpr = this.dpr
    const btnW = 50 * dpr
    const btnH = 80 * dpr

    // 获取角色卡片区域的位置
    if (this.heroAreas.length === 0) return

    const firstArea = this.heroAreas[0]
    const lastArea = this.heroAreas[this.heroAreas.length - 1]
    const cardCenterY = firstArea.y + firstArea.h / 2
    
    // 上一页按钮（左侧卡片旁边）
    if (this.heroPage > 0) {
      const prevBtnX = Math.max(10 * dpr, firstArea.x - btnW - 5 * dpr)
      const prevBtnY = cardCenterY - btnH / 2

      // 外发光效果
      ctx.shadowColor = '#ff9f43'
      ctx.shadowBlur = 20 * dpr

      // 按钮背景 - 使用渐变
      const grad = ctx.createLinearGradient(prevBtnX, prevBtnY, prevBtnX + btnW, prevBtnY)
      grad.addColorStop(0, 'rgba(255, 159, 67, 0.9)')
      grad.addColorStop(1, 'rgba(255, 107, 107, 0.9)')
      ctx.fillStyle = grad
      
      ctx.beginPath()
      this._roundRect(ctx, prevBtnX, prevBtnY, btnW, btnH, 8 * dpr)
      ctx.fill()

      // 重置阴影
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0

      // 按钮边框
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3 * dpr
      ctx.stroke()

      // 箭头 - 更大更明显
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${32 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('◀', prevBtnX + btnW / 2, prevBtnY + btnH / 2)
      
      // "上一页"文字提示
      ctx.font = `bold ${10 * dpr}px sans-serif`
      ctx.fillStyle = '#fff'
      ctx.fillText('上一页', prevBtnX + btnW / 2, prevBtnY + btnH - 12 * dpr)
    }

    // 下一页按钮（右侧卡片旁边）
    if (this.heroPage < this.totalHeroPages - 1) {
      const nextBtnX = Math.min(this.width - btnW - 10 * dpr, lastArea.x + lastArea.w + 5 * dpr)
      const nextBtnY = cardCenterY - btnH / 2

      // 外发光效果
      ctx.shadowColor = '#ff9f43'
      ctx.shadowBlur = 20 * dpr

      // 按钮背景 - 使用渐变
      const grad = ctx.createLinearGradient(nextBtnX, nextBtnY, nextBtnX + btnW, nextBtnY)
      grad.addColorStop(0, 'rgba(255, 107, 107, 0.9)')
      grad.addColorStop(1, 'rgba(255, 159, 67, 0.9)')
      ctx.fillStyle = grad
      
      ctx.beginPath()
      this._roundRect(ctx, nextBtnX, nextBtnY, btnW, btnH, 8 * dpr)
      ctx.fill()

      // 重置阴影
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0

      // 按钮边框
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3 * dpr
      ctx.stroke()

      // 箭头 - 更大更明显
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${32 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('▶', nextBtnX + btnW / 2, nextBtnY + btnH / 2)
      
      // "下一页"文字提示
      ctx.font = `bold ${10 * dpr}px sans-serif`
      ctx.fillStyle = '#fff'
      ctx.fillText('下一页', nextBtnX + btnW / 2, nextBtnY + btnH - 12 * dpr)
    }
    
    // 页码显示（卡片区域上方）
    const pageX = this.width / 2
    const pageY = firstArea.y - 20 * dpr
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.font = `bold ${14 * dpr}px sans-serif`
    const pageText = `第 ${this.heroPage + 1}/${this.totalHeroPages} 页`
    const textWidth = ctx.measureText(pageText).width
    ctx.fillRect(pageX - textWidth / 2 - 15 * dpr, pageY - 10 * dpr, textWidth + 30 * dpr, 24 * dpr)
    
    ctx.fillStyle = '#ff9f43'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(pageText, pageX, pageY + 2 * dpr)
  }

  _renderSkillPanel(ctx) {
    const dpr = this.dpr
    const w = this.width
    const h = this.height

    // 面板背景
    const panelY = h - 240 * dpr
    const panelH = 230 * dpr
    
    // 渐变背景
    const panelGrad = ctx.createLinearGradient(0, panelY, 0, panelY + panelH)
    panelGrad.addColorStop(0, 'rgba(20, 20, 40, 0.95)')
    panelGrad.addColorStop(1, 'rgba(10, 10, 30, 0.98)')
    ctx.fillStyle = panelGrad
    ctx.beginPath()
    this._roundRect(ctx, 0, panelY, w, panelH, 15 * dpr)
    ctx.fill()

    // 顶部装饰线
    const lineGrad = ctx.createLinearGradient(0, panelY, w, panelY)
    lineGrad.addColorStop(0, 'rgba(255, 159, 67, 0)')
    lineGrad.addColorStop(0.5, 'rgba(255, 159, 67, 0.8)')
    lineGrad.addColorStop(1, 'rgba(255, 159, 67, 0)')
    ctx.strokeStyle = lineGrad
    ctx.lineWidth = 2 * dpr
    ctx.beginPath()
    ctx.moveTo(0, panelY)
    ctx.lineTo(w, panelY)
    ctx.stroke()

    // 根据阶段显示不同内容
    if (this.phase === 'select_target') {
      // 选择目标提示
      ctx.font = `bold ${16 * dpr}px sans-serif`
      ctx.fillStyle = '#ff9f43'
      ctx.textAlign = 'left'
      ctx.fillText('👆 选择治疗目标', 20 * dpr, panelY + 25 * dpr)
      return
    }

    if (this.phase === 'select_enemy_target') {
      // 选择敌人目标提示
      ctx.font = `bold ${16 * dpr}px sans-serif`
      ctx.fillStyle = '#ff9f43'
      ctx.textAlign = 'left'
      ctx.fillText('🎯 选择攻击目标', 20 * dpr, panelY + 25 * dpr)

      // 提示文字
      ctx.font = `${12 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fillText('点击上方敌人选择攻击目标', 20 * dpr, panelY + 45 * dpr)
      ctx.fillText(`当前技能：${this.selectedSkill?.name || '未知'}`, 20 * dpr, panelY + 65 * dpr)
      return
    }
    
    if (this.phase === 'select_hero') {
      // 角色选择阶段
      ctx.font = `bold ${16 * dpr}px sans-serif`
      ctx.fillStyle = '#ff9f43'
      ctx.textAlign = 'left'
      ctx.fillText('👥 选择角色', 20 * dpr, panelY + 25 * dpr)
      
      // 提示文字
      ctx.font = `${12 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fillText('点击左侧角色卡片选择行动角色', 20 * dpr, panelY + 45 * dpr)
      return
    }
    
    if (this.phase === 'select_skill') {
      // 技能选择阶段 - 只显示选中角色的技能
      ctx.font = `bold ${16 * dpr}px sans-serif`
      ctx.fillStyle = '#ff9f43'
      ctx.textAlign = 'left'
      ctx.fillText(`⚔️ ${this.selectedHero?.name || '角色'}的技能`, 20 * dpr, panelY + 25 * dpr)

      if (!this.selectedHero || !this.selectedHero.skills) return

      // 技能按钮
      const btnW = (w - 40 * dpr) / 2
      const btnH = 50 * dpr
      const startX = 15 * dpr
      const startY = panelY + 40 * dpr

      for (let si = 0; si < this.selectedHero.skills.length; si++) {
        const skill = this.selectedHero.skills[si]
        const col = si % 2
        const row = Math.floor(si / 2)
        const bx = startX + col * (btnW + 10 * dpr)
        const by = startY + row * (btnH + 8 * dpr)

        const canUse = this.selectedHero.mp >= skill.mpCost

        // 按钮阴影
        if (canUse) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
          ctx.beginPath()
          this._roundRect(ctx, bx + 2 * dpr, by + 2 * dpr, btnW, btnH, 8 * dpr)
          ctx.fill()
        }

        // 按钮背景渐变
        if (canUse) {
          const btnGrad = ctx.createLinearGradient(bx, by, bx, by + btnH)
          btnGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)')
          btnGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)')
          ctx.fillStyle = btnGrad
        } else {
          ctx.fillStyle = 'rgba(60, 60, 60, 0.4)'
        }
        ctx.beginPath()
        this._roundRect(ctx, bx, by, btnW, btnH, 8 * dpr)
        ctx.fill()

        // 按钮边框
        ctx.strokeStyle = canUse ? 'rgba(255, 255, 255, 0.3)' : 'rgba(100, 100, 100, 0.3)'
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        this._roundRect(ctx, bx, by, btnW, btnH, 8 * dpr)
        ctx.stroke()

        // 技能图标
        const iconSize = 28 * dpr
        const iconX = bx + 12 * dpr
        const iconY = by + (btnH - iconSize) / 2
        ctx.font = `${iconSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        
        const skillIcon = skill.type === 'heal' ? '💚' : 
                         skill.type === 'magic' ? '✨' :
                         skill.type === 'buff' ? '⬆️' : '⚔️'
        ctx.fillStyle = canUse ? '#fff' : '#666'
        ctx.fillText(skillIcon, iconX + iconSize / 2, iconY + iconSize / 2)

        // 技能名
        ctx.font = `bold ${15 * dpr}px sans-serif`
        ctx.fillStyle = canUse ? '#fff' : '#555'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(skill.name, iconX + iconSize + 8 * dpr, by + 22 * dpr)

        // MP消耗
        ctx.font = `${11 * dpr}px sans-serif`
        ctx.fillStyle = canUse ? 'rgba(255, 255, 255, 0.6)' : '#444'
        ctx.fillText(`MP ${skill.mpCost}`, iconX + iconSize + 8 * dpr, by + 40 * dpr)

        // MP 不足标记
        if (!canUse) {
          ctx.fillStyle = 'rgba(255, 71, 87, 0.3)'
          ctx.beginPath()
          this._roundRect(ctx, bx, by, btnW, btnH, 8 * dpr)
          ctx.fill()
          
          ctx.font = `bold ${10 * dpr}px sans-serif`
          ctx.fillStyle = '#ff4757'
          ctx.textAlign = 'right'
          ctx.fillText('MP不足', bx + btnW - 8 * dpr, by + 12 * dpr)
        }
      }
    }
  }

  _renderBattleLog(ctx) {
    const dpr = this.dpr
    // 日志放在屏幕底部
    const logW = this.width - 30 * dpr
    const logH = 60 * dpr
    const logX = 15 * dpr
    const logY = this.height - logH - 10 * dpr // 屏幕底部留10px边距

    // 日志背景
    const logGrad = ctx.createLinearGradient(logX, logY, logX, logY + logH)
    logGrad.addColorStop(0, 'rgba(20, 20, 40, 0.9)')
    logGrad.addColorStop(1, 'rgba(10, 10, 30, 0.95)')
    ctx.fillStyle = logGrad
    ctx.beginPath()
    this._roundRect(ctx, logX, logY, logW, logH, 8 * dpr)
    ctx.fill()

    // 顶部装饰线
    ctx.strokeStyle = 'rgba(255, 159, 67, 0.5)'
    ctx.lineWidth = 2 * dpr
    ctx.beginPath()
    ctx.moveTo(logX + 10 * dpr, logY)
    ctx.lineTo(logX + logW - 10 * dpr, logY)
    ctx.stroke()

    // 标题
    ctx.font = `bold ${12 * dpr}px sans-serif`
    ctx.fillStyle = '#ff9f43'
    ctx.textAlign = 'left'
    ctx.fillText('📜 战斗日志', logX + 12 * dpr, logY + 16 * dpr)

    // 日志内容 - 横向显示最近3条
    ctx.font = `${11 * dpr}px sans-serif`
    ctx.textAlign = 'left'

    const recentLogs = this.log.slice(-3)
    let xPos = logX + 12 * dpr

    for (let i = 0; i < recentLogs.length; i++) {
      const entry = recentLogs[i]

      // 根据内容着色
      let textColor = 'rgba(255, 255, 255, 0.8)'
      if (entry.text.includes('暴击') || entry.text.includes('💥')) {
        textColor = '#ff9f43'
      } else if (entry.text.includes('恢复') || entry.text.includes('🎉')) {
        textColor = '#2ed573'
      } else if (entry.text.includes('击败') || entry.text.includes('胜利')) {
        textColor = '#54a0ff'
      } else if (entry.text.includes('MP不足') || entry.text.includes('全灭')) {
        textColor = '#ff6b6b'
      }

      ctx.fillStyle = textColor
      const text = entry.text.length > 20 ? entry.text.substring(0, 20) + '...' : entry.text
      ctx.fillText(text, xPos, logY + 50 * dpr)
      xPos += ctx.measureText(text).width + 20 * dpr
    }
  }

  _renderTurnInfo(ctx) {
    const dpr = this.dpr
    const w = this.width
    
    // 信息栏背景
    const infoW = 180 * dpr
    const infoH = 36 * dpr
    const infoX = (w - infoW) / 2
    const infoY = 15 * dpr

    // 根据状态变色
    let bgColor1, bgColor2, statusText
    if (this.isPaused) {
      bgColor1 = 'rgba(255, 165, 0, 0.4)'
      bgColor2 = 'rgba(255, 165, 0, 0.6)'
      statusText = '⏸ 已暂停'
    } else if (this.phase === 'auto_battle' || this.phase === 'animating') {
      bgColor1 = 'rgba(46, 213, 115, 0.3)'
      bgColor2 = 'rgba(46, 213, 115, 0.5)'
      statusText = `⚔ ${this.battleSpeed}x 战斗中`
    } else {
      bgColor1 = 'rgba(255, 159, 67, 0.3)'
      bgColor2 = 'rgba(255, 159, 67, 0.5)'
      statusText = ''
    }

    const infoGrad = ctx.createLinearGradient(infoX, infoY, infoX + infoW, infoY)
    infoGrad.addColorStop(0, bgColor1)
    infoGrad.addColorStop(0.5, bgColor2)
    infoGrad.addColorStop(1, bgColor1)
    ctx.fillStyle = infoGrad
    ctx.beginPath()
    this._roundRect(ctx, infoX, infoY, infoW, infoH, 18 * dpr)
    ctx.fill()

    // 战斗时长文字
    const mins = Math.floor(this.battleTime / 60)
    const secs = Math.floor(this.battleTime % 60)
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`
    
    ctx.font = `bold ${17 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`⏱ ${timeStr}`, w / 2, infoY + infoH / 2)
    ctx.textBaseline = 'alphabetic'

    // 状态提示（暂停/加速等）
    if (statusText) {
      ctx.font = `${11 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.fillText(statusText, w / 2, infoY + infoH + 14 * dpr)
    }
  }

  /**
   * 渲染自动战斗UI - 角色状态面板 + 加速/暂停按钮
   */
  _renderAutoBattleUI(ctx) {
    const dpr = this.dpr
    const w = this.width
    const h = this.height

    // 角色状态已在 _renderParty 中头顶显示，这里只保留控制按钮

    // ====== 加速/暂停按钮组（居中）======
    const btnSize = 36 * dpr
    const btnGap = 12 * dpr
    const btnCenterX = w / 2
    const btnY = h - 80 * dpr

    // 初始化按钮区域（用于点击检测）
    this._speedButtonArea = { pause: null, speed: null }

    // 暂停按钮（左侧）
    const pauseBtnX = btnCenterX - btnGap / 2 - btnSize
    this._speedButtonArea.pause = { x: pauseBtnX, y: btnY, w: btnSize, h: btnSize }
    ctx.fillStyle = this.isPaused ? 'rgba(255, 165, 0, 0.7)' : 'rgba(30, 40, 55, 0.9)'
    ctx.beginPath()
    this._roundRect(ctx, pauseBtnX, btnY, btnSize, btnSize, 8 * dpr)
    ctx.fill()
    ctx.strokeStyle = this.isPaused ? '#FFA500' : 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.5 * dpr
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${18 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.isPaused ? '▶' : '||', pauseBtnX + btnSize / 2, btnY + btnSize / 2)

    // 速度切换按钮（右侧）
    const speedBtnX = btnCenterX + btnGap / 2
    this._speedButtonArea.speed = { x: speedBtnX, y: btnY, w: btnSize, h: btnSize }
    ctx.fillStyle = this.battleSpeed === 2 ? 'rgba(46, 213, 115, 0.7)' : 'rgba(30, 40, 55, 0.9)'
    ctx.beginPath()
    this._roundRect(ctx, speedBtnX, btnY, btnSize, btnSize, 8 * dpr)
    ctx.fill()
    ctx.strokeStyle = this.battleSpeed === 2 ? '#2ED573' : 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.5 * dpr
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${14 * dpr}px sans-serif`
    ctx.fillText(`${this.battleSpeed}x`, speedBtnX + btnSize / 2, btnY + btnSize / 2)
    ctx.textBaseline = 'alphabetic'
  }

  /**
   * 渲染单个角色的状态槽（自动战斗UI中的紧凑状态）
   */
  _renderHeroStatusSlot(ctx, hero, x, y, w, h) {
    const dpr = this.dpr
    const timer = this.heroAttackTimers[hero.id]

    // 背景
    const isAttacking = this.activeAttackers.has(hero.id)
    ctx.fillStyle = isAttacking ? 'rgba(255, 159, 67, 0.15)' : 'rgba(25, 30, 40, 0.6)'
    ctx.beginPath()
    this._roundRect(ctx, x, y, w, h, 6 * dpr)
    ctx.fill()

    // 攻击中高亮边框
    if (isAttacking) {
      ctx.strokeStyle = '#FF9F43'
      ctx.lineWidth = 1.5 * dpr
      ctx.stroke()
    }

    // 名字
    ctx.font = `bold ${11 * dpr}px sans-serif`
    ctx.fillStyle = isAttacking ? '#FF9F43' : '#E0E0E0'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(hero.name, x + 6 * dpr, y + 4 * dpr)

    // HP条
    const hpRatio = Math.min(1, Math.max(0, hero.hp / hero.maxHp))
    const barY = y + 22 * dpr
    const barH = 8 * dpr
    ctx.fillStyle = 'rgba(40, 40, 50, 0.8)'
    ctx.fillRect(x + 6 * dpr, barY, w - 12 * dpr, barH)
    const hpColor = hpRatio > 0.5 ? '#2ED573' : hpRatio > 0.25 ? '#FFA502' : '#FF4757'
    ctx.fillStyle = hpColor
    ctx.fillRect(x + 6 * dpr, barY, (w - 12 * dpr) * hpRatio, barH)

    // MP条
    const mpRatio = Math.min(1, Math.max(0, hero.mp / hero.maxMp))
    const mpBarY = barY + 10 * dpr
    ctx.fillStyle = 'rgba(40, 40, 50, 0.8)'
    ctx.fillRect(x + 6 * dpr, mpBarY, w - 12 * dpr, 5 * dpr)
    ctx.fillStyle = '#5F9FFF'
    ctx.fillRect(x + 6 * dpr, mpBarY, (w - 12 * dpr) * mpRatio, 5 * dpr)

    // 攻速进度条（显示距离下次普攻还有多久）
    if (timer) {
      const attackInterval = this._getAttackInterval(hero)
      const progress = Math.min(1, timer.attackTimer / attackInterval)
      const progY = y + h - 8 * dpr
      ctx.fillStyle = 'rgba(80, 80, 100, 0.5)'
      ctx.fillRect(x + 6 * dpr, progY, w - 12 * dpr, 4 * dpr)
      ctx.fillStyle = 'rgba(255, 159, 67, 0.7)'
      ctx.fillRect(x + 6 * dpr, progY, (w - 12 * dpr) * progress, 4 * dpr)
    }

    // CD状态：显示技能CD小圆点
    if (timer && hero.skills) {
      const cdDotSize = 10 * dpr
      const dotStartX = x + 6 * dpr
      const dotY = y + h - 24 * dpr
      hero.skills.forEach((skill, si) => {
        if (si >= 5) return  // 最多显示5个技能点
        const dx = dotStartX + si * (cdDotSize + 3 * dpr)
        const cdRemaining = timer.skillCDs[skill.id] || 0
        const totalCd = this._getSkillCooldown(hero, skill)
        
        // CD背景圈
        ctx.beginPath()
        ctx.arc(dx + cdDotSize / 2, dotY + cdDotSize / 2, cdDotSize / 2, 0, Math.PI * 2)
        ctx.fillStyle = cdRemaining > 0 ? 'rgba(100, 100, 120, 0.6)' : 'rgba(95, 159, 255, 0.4)'
        ctx.fill()
        
        // CD剩余扇形遮罩
        if (cdRemaining > 0 && totalCd > 0) {
          const ratio = cdRemaining / totalCd
          ctx.beginPath()
          ctx.moveTo(dx + cdDotSize / 2, dotY + cdDotSize / 2)
          ctx.arc(dx + cdDotSize / 2, dotY + cdDotSize / 2, cdDotSize / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - ratio))
          ctx.closePath()
          ctx.fillStyle = 'rgba(50, 50, 65, 0.8)'
          ctx.fill()
        }
      })
    }
  }

  /**
   * 渲染灼烧伤害（特殊样式）
   */
  _renderBurnDamage(ctx, dt, dpr) {
    const x = dt.x
    const y = dt.y

    // 背景框
    const boxW = 100 * dpr
    const boxH = 40 * dpr
    const boxX = x - boxW / 2
    const boxY = y - boxH / 2

    // 火焰渐变背景
    const bgGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH)
    bgGrad.addColorStop(0, 'rgba(255, 107, 107, 0.9)')
    bgGrad.addColorStop(1, 'rgba(255, 159, 67, 0.9)')
    ctx.fillStyle = bgGrad
    ctx.beginPath()
    this._roundRect(ctx, boxX, boxY, boxW, boxH, 8 * dpr)
    ctx.fill()

    // 外框发光效果
    ctx.shadowColor = '#ff9f43'
    ctx.shadowBlur = 10 * dpr
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2 * dpr
    ctx.beginPath()
    this._roundRect(ctx, boxX, boxY, boxW, boxH, 8 * dpr)
    ctx.stroke()
    ctx.shadowBlur = 0

    // 标签文字（灼烧）
    ctx.font = `bold ${12 * dpr}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🔥 灼烧', x, y - 8 * dpr)

    // 伤害数值
    ctx.font = `bold ${18 * dpr}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.fillText(`-${dt.text}`, x, y + 10 * dpr)
  }

  /**
   * 渲染状态效果提示（灼烧/冰冻）
   */
  _renderStatusEffect(ctx, dt, dpr, effectType) {
    const x = dt.x
    const y = dt.y

    // 根据效果类型设置颜色和图标
    const config = {
      burn: {
        gradient: ['rgba(255, 107, 107, 0.9)', 'rgba(255, 159, 67, 0.9)'],
        glow: '#ff9f43',
        icon: '🔥'
      },
      freeze: {
        gradient: ['rgba(116, 185, 255, 0.9)', 'rgba(162, 155, 254, 0.9)'],
        glow: '#74b9ff',
        icon: '❄️'
      }
    }[effectType]

    // 背景框
    const boxW = 120 * dpr
    const boxH = 35 * dpr
    const boxX = x - boxW / 2
    const boxY = y - boxH / 2

    // 渐变背景
    const bgGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH)
    bgGrad.addColorStop(0, config.gradient[0])
    bgGrad.addColorStop(1, config.gradient[1])
    ctx.fillStyle = bgGrad
    ctx.beginPath()
    this._roundRect(ctx, boxX, boxY, boxW, boxH, 8 * dpr)
    ctx.fill()

    // 外框发光效果
    ctx.shadowColor = config.glow
    ctx.shadowBlur = 12 * dpr
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2 * dpr
    ctx.beginPath()
    this._roundRect(ctx, boxX, boxY, boxW, boxH, 8 * dpr)
    ctx.stroke()
    ctx.shadowBlur = 0

    // 文字
    ctx.font = `bold ${16 * dpr}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${config.icon} ${dt.text}`, x, y)
  }

  /**
   * 渲染撤退按钮（玩家回合阶段显示）
   */
  _renderFleeButton(ctx) {
    const dpr = this.dpr
    const w = this.width
    const btnW = 60 * dpr
    const btnH = 28 * dpr
    const btnX = 12 * dpr
    const btnY = 12 * dpr

    // 保存按钮区域用于点击检测
    this._fleeButtonArea = { x: btnX, y: btnY, w: btnW, h: btnH }

    // 按钮背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.beginPath()
    this._roundRect(ctx, btnX, btnY, btnW, btnH, 6 * dpr)
    ctx.fill()

    // 边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    this._roundRect(ctx, btnX, btnY, btnW, btnH, 6 * dpr)
    ctx.stroke()

    // 文字
    ctx.font = `bold ${13 * dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('撤退', btnX + btnW / 2, btnY + btnH / 2)
    ctx.textBaseline = 'alphabetic'
  }

  _renderEndScreen(ctx, title, color, hint) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(0, 0, w, h)

    // 胜利/失败图标背景
    const iconSize = 100 * dpr
    const iconY = h / 2 - 80 * dpr
    ctx.fillStyle = this.phase === 'victory' ? 'rgba(46, 213, 115, 0.2)' : 'rgba(255, 71, 87, 0.2)'
    ctx.beginPath()
    ctx.arc(w / 2, iconY, iconSize, 0, Math.PI * 2)
    ctx.fill()

    // 标题
    ctx.font = `bold ${36 * dpr}px sans-serif`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(title, w / 2, iconY + 10 * dpr)

    // 奖励信息（胜利时）
    if (this.phase === 'victory' && this.enemy) {
      ctx.font = `${16 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.fillText(`获得 ${this.enemy.exp || 0} 经验值`, w / 2, h / 2 - 20 * dpr)
      ctx.fillText(`获得 ${this.enemy.gold || 0} 金币`, w / 2, h / 2 + 10 * dpr)
    }

    // 继续按钮
    const btnW = 180 * dpr
    const btnH = 50 * dpr
    const btnX = (w - btnW) / 2
    const btnY = h / 2 + 60 * dpr

    // 按钮背景
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH)
    btnGrad.addColorStop(0, this.phase === 'victory' ? '#2ed573' : '#ff6b6b')
    btnGrad.addColorStop(1, this.phase === 'victory' ? '#26b863' : '#ee5a5a')
    ctx.fillStyle = btnGrad
    ctx.beginPath()
    this._roundRect(ctx, btnX, btnY, btnW, btnH, 25 * dpr)
    ctx.fill()

    // 按钮高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.beginPath()
    this._roundRect(ctx, btnX, btnY, btnW, btnH / 2, 25 * dpr)
    ctx.fill()

    // 按钮文字
    ctx.font = `bold ${20 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(hint, w / 2, btnY + btnH / 2)
    ctx.textBaseline = 'alphabetic'

    // 闪烁提示
    const alpha = 0.3 + Math.sin(this.time * 3) * 0.2
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
    ctx.font = `${14 * dpr}px sans-serif`
    ctx.fillText('点击按钮继续', w / 2, btnY + btnH + 30 * dpr)
  }

  // ======== 工具方法 ========
  _drawBar(ctx, x, y, w, h, ratio, color, text, delayRatio) {
    ratio = Math.max(0, Math.min(1, ratio))

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.beginPath()
    this._roundRect(ctx, x, y, w, h, h / 2)
    ctx.fill()

    // 延迟残影条（用血条同色半透明，显示伤害前的血量）
    if (delayRatio !== undefined && delayRatio > ratio) {
      ctx.globalAlpha = 0.35
      ctx.fillStyle = color
      ctx.beginPath()
      this._roundRect(ctx, x, y, w * delayRatio, h, h / 2)
      ctx.fill()
      ctx.globalAlpha = 1.0
    }

    if (ratio > 0) {
      ctx.fillStyle = color
      ctx.beginPath()
      this._roundRect(ctx, x, y, w * ratio, h, h / 2)
      ctx.fill()
    }

    if (text) {
      ctx.font = `bold ${h * 0.75}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, x + w / 2, y + h / 2)
    }
    ctx.textBaseline = 'alphabetic'
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  _roleLabel(role) {
    return { warrior: '⚔️战士', mage: '🔮法师', healer: '💊治愈', tank: '🛡️坦克' }[role] || role
  }
  
  _getBgKey() {
    // 直接返回资源 key
    return this.bgKey
  }
  
  _getHeroImageKey(heroId) {
    // 根据角色 ID 返回资源 key
    const map = {
      'zhenbao': 'HERO_ZHENBAO',
      'lixiaobao': 'HERO_LIXIAOBAO',
      'amy': 'CAT_AMY',
      'annie': 'CAT_ANNIE',
      'qianduoduo': 'CAT_QIANDUODUO',
      'xiaobei': 'CAT_XIAOBEI'
    }
    return map[heroId] || 'HERO_ZHENBAO'
  }

  /**
   * 获取角色战斗渲染缩放比例
   * 不同角色的立绘/帧动画中，角色占图片面积比例不同
   * 需要调整缩放让所有角色视觉大小一致
   */
  _getHeroScale(heroId) {
    // 基准：spriteSize=60*dpr 下视觉高度一致
    const scaleMap = {
      'zhenbao': 1.10,     // 臻宝：角色占图85%，稍微放大
      'lixiaobao': 1.20,   // 李小宝：大帽子+长袍，角色只占70%，需要明显放大
      'amy': 1.00,
      'annie': 1.00,
      'qianduoduo': 1.00,
      'xiaobei': 1.00
    }
    return scaleMap[heroId] || 1.0
  }

  _getHeroIdleImageKey(heroId, frameNum) {
    // 返回idle状态图片key（带帧号）
    // 尝试带帧号的key（如 HERO_LIXIAOBAO_IDLE_0），没有则尝试无帧号，最后fallback到普通立绘
    if (typeof frameNum === 'number' && frameNum >= 0) {
      const framedKey = `${this._getHeroImageKey(heroId)}_IDLE_${frameNum}`
      if (this.game.assets.get(framedKey)) return framedKey
    }
    
    // 尝试无帧号的IDLE key
    const idleKey = `${this._getHeroImageKey(heroId)}_IDLE`
    return this.game.assets.get(idleKey) ? idleKey : this._getHeroImageKey(heroId)
  }

  _getHeroAttackImageKey(heroId) {
    // 返回attack状态图片key（如果不存在则fallback到普通立绘）
    const attackKey = `${this._getHeroImageKey(heroId)}_ATTACK`
    return this.game.assets.get(attackKey) ? attackKey : this._getHeroImageKey(heroId)
  }

  _getHeroWalkImageKey(heroId, frameNum) {
    // 返回walk动画帧key（如 HERO_ZHENBAO_WALK_03）
    const walkKey = `HERO_${heroId.toUpperCase()}_WALK_${String(frameNum).padStart(2, '0')}`
    return this.game.assets.get(walkKey) ? walkKey : this._getHeroImageKey(heroId)
  }


  /**
   * 获取技能发光颜色
   */
  _getSkillGlowColor(skillId) {
    const colorMap = {
      fireball: '#FF6B35',     // 火球 - 橙红
      ice_shard: '#74B9FF',    // 冰晶 - 冰蓝
      thunder: '#FDCB6E',      // 雷击 - 金黄
      slash: '#FF4757',        // 斩击 - 红色
      shield_bash: '#A29BFE',  // 盾击 - 紫色
      staff_strike: '#DFE6E9', // 法杖敲击 - 白色
      heal: '#2ED573',         // 治疗 - 绿色
      mana_shield: '#5F9FFF',  // 魔盾 - 蓝色
      war_cry: '#FFA502',       // 战吼 - 金色
      cat_paw: '#FFB347',       // 猫爪击 - 橙黄
      punch: '#E17055',         // 拳击 - 深橙
    }
    return colorMap[skillId] || '#ffffff'
  }

  // ======== 感化剧情 ========
  _updatePurifyScene(dt) {
    if (this.phase !== 'purify') return

    this.purifyTimer += dt

    // 自动播放对话
    if (this.purifyStep < 3 && this.purifyTimer > 2.5) {
      this.purifyStep++
      this.purifyTimer = 0
    }
  }

  _renderPurifyScene(ctx) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr

    // 背景渐变（温暖的光芒）
    const progress = Math.min(1, this.purifyTimer * 0.5)
    const bgAlpha = 0.85 + progress * 0.1
    
    ctx.fillStyle = `rgba(255, 248, 220, ${bgAlpha})`
    ctx.fillRect(0, 0, w, h)

    // 光芒效果
    const glowAlpha = 0.3 + Math.sin(this.time * 3) * 0.2
    const glowSize = 200 * dpr + Math.sin(this.time * 2) * 20 * dpr
    
    const gradient = ctx.createRadialGradient(
      w / 2, h / 2, 0,
      w / 2, h / 2, glowSize
    )
    gradient.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha})`)
    gradient.addColorStop(0.5, `rgba(255, 236, 179, ${glowAlpha * 0.5})`)
    gradient.addColorStop(1, 'rgba(255, 236, 179, 0)')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    // 头像（根据Boss类型动态显示）
    let charImgKey, charName
    if (this.enemy.isAmy) {
      charImgKey = 'CAT_AMY'
      charName = '艾米'
    } else if (this.enemy.isAnnie) {
      charImgKey = 'CAT_ANNIE'
      charName = '安妮'
    } else {
      charImgKey = 'CAT_AMY'  // 默认
      charName = this.enemy.name
    }
    
    const charImg = this.game.assets.get(charImgKey)
    const avatarSize = 120 * dpr
    const avatarY = h * 0.35
    
    // 头像背景光环
    ctx.save()
    ctx.globalAlpha = progress
    const ringAlpha = 0.5 + Math.sin(this.time * 2) * 0.2
    ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`
    ctx.lineWidth = 4 * dpr
    ctx.beginPath()
    ctx.arc(w / 2, avatarY, avatarSize / 2 + 10 * dpr, 0, Math.PI * 2)
    ctx.stroke()
    
    // 头像
    if (charImg) {
      ctx.beginPath()
      ctx.arc(w / 2, avatarY, avatarSize / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(charImg, w / 2 - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize)
    } else {
      // 备用：显示角色名
      ctx.font = `bold ${30 * dpr}px sans-serif`
      ctx.fillStyle = '#2d3436'
      ctx.textAlign = 'center'
      ctx.fillText('💚', w / 2, avatarY)
    }
    ctx.restore()

    // 角色名
    ctx.font = `bold ${28 * dpr}px sans-serif`
    ctx.fillStyle = '#2d3436'
    ctx.textAlign = 'center'
    ctx.fillText(charName, w / 2, avatarY + avatarSize / 2 + 35 * dpr)

    // 对话框
    const dialogues = this.enemy.purifyDialogue || [
      '你们的眼神...如此温暖...',
      '我一直在寻找这样的羁绊...',
      '请让我加入你们，一起守护这片大地！'
    ]

    const boxY = h * 0.55
    const boxH = 180 * dpr
    
    // 对话框背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    this._roundRect(ctx, 40 * dpr, boxY, w - 80 * dpr, boxH, 15 * dpr)
    ctx.fill()
    
    // 对话框边框
    ctx.strokeStyle = '#ff9f43'
    ctx.lineWidth = 3 * dpr
    ctx.stroke()

    // 显示对话（逐句显示）
    ctx.font = `${18 * dpr}px sans-serif`
    ctx.fillStyle = '#2d3436'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const displayTexts = dialogues.slice(0, this.purifyStep + 1)
    let textY = boxY + 30 * dpr
    for (const text of displayTexts) {
      ctx.fillText(text, w / 2, textY)
      textY += 35 * dpr
    }

    // 感化完成提示
    if (this.purifyStep >= 2) {
      ctx.font = `bold ${22 * dpr}px sans-serif`
      ctx.fillStyle = '#ff9f43'
      ctx.fillText('✨ 艾米加入了队伍！', w / 2, h * 0.88)
      
      // 继续按钮
      const btnW = 180 * dpr
      const btnH = 50 * dpr
      const btnX = (w - btnW) / 2
      const btnY = h * 0.92

      const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH)
      btnGrad.addColorStop(0, '#2ed573')
      btnGrad.addColorStop(1, '#26b863')
      ctx.fillStyle = btnGrad
      ctx.beginPath()
      this._roundRect(ctx, btnX, btnY, btnW, btnH, 25 * dpr)
      ctx.fill()

      ctx.font = `bold ${20 * dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.fillText('继续冒险', w / 2, btnY + btnH / 2)
    } else {
      // 等待提示
      const dots = '.'.repeat(Math.floor(this.time * 2) % 4)
      ctx.font = `${16 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
      ctx.fillText(`${dots}`, w / 2, h * 0.92)
    }
  }

  _handlePurifyTap(tx, ty) {
    // 只有在感化完成（第3步）后才允许点击继续
    if (this.purifyStep >= 2) {
      const w = this.width
      const h = this.height
      const dpr = this.dpr
      
      // 检测点击"继续冒险"按钮
      const btnW = 180 * dpr
      const btnH = 50 * dpr
      const btnX = (w - btnW) / 2
      const btnY = h * 0.92

      if (this._isInRect(tx, ty, btnX, btnY, btnW, btnH)) {
        // 标记战斗胜利
        this.game.data.set('battleVictory', true)
        
        // ⚠️ 确保设置战斗怪物ID（用于野外场景标记怪物死亡）
        if (this.monsterId) {
          this.game.data.set('currentBattleMonsterId', this.monsterId)
          console.log(`[Battle] 感化剧情完成，设置战斗怪物ID: ${this.monsterId}`)
        }
        
        console.log(`[Battle] 准备返回野外地图，区域: ${this.nodeId}`)

        // 解锁角色（根据Boss类型）
        if (this.enemy.isAmy) {
          // 解锁艾米角色
          const unlocked = charStateManager.unlockCharacter('amy')
          if (unlocked) {
            console.log('[Battle] 艾米成功加入队伍！')
            this._addLog(`✨ 艾米加入了队伍！`)
          }
        } else if (this.enemy.isAnnie) {
          // 解锁安妮角色
          const unlocked = charStateManager.unlockCharacter('annie')
          if (unlocked) {
            console.log('[Battle] 安妮成功加入队伍！')
            this._addLog(`✨ 安妮加入了队伍！`)
          }
        }

        // 标记Boss已击败
        const bossFlag = `${this.nodeId}_${this.enemy.id}_defeated`
        this.game.data.addFlag(bossFlag)

        // 给予经验
        const expReward = this.enemy.exp || 150
        const goldReward = this.enemy.gold || 80
        
        const allChars = charStateManager.getAllCharacters()
        for (const charState of allChars) {
          const partyMember = this.party.find(h => h.id === charState.id)
          if (partyMember) {
            charState.hp = Math.max(0, Math.min(partyMember.hp, charState.maxHp))
            charState.mp = Math.max(0, Math.min(partyMember.mp, charState.maxMp))
            const levelUpCount = charState.gainExp(expReward)
            if (levelUpCount > 0) {
              this._addLog(`✨ ${charState.name} 升级了！(Lv.${charState.level})`)
            }
          }
        }

        // 保存角色状态
        const charData = charStateManager.serialize()
        this.game.data.set('characterStates', charData)

        // 返回场景
        this.game.changeScene('field', { nodeId: this.nodeId })
      }
    }
  }
}
