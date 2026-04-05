/**
 * battle-scene.js - 回合制战斗系统
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

    // 战斗状态
    this.phase = 'intro'  // intro, player_turn, select_skill, select_target, enemy_turn, animating, victory, defeat
    this.turn = 1
    this.selectedHero = null
    this.selectedSkill = null
    this.actionQueue = []

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
  }

  init() {
    console.log('[Battle] 初始化战斗场景')
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
    
    // 确保队伍成员有当前HP和MP
    this.party = this.party.map(h => ({
      ...h,
      hp: h.hp || h.maxHp,
      mp: h.mp || h.maxMp,
      buffs: h.buffs || []
    }))
    
    console.log('[Battle] 处理后的 party:', this.party)
    console.log('[Battle] 处理后的 enemies:', this.enemies)
    
    // 初始化角色位置区域（分页系统）
    this._initHeroAreas()

    // 初始化角色基础位置（用于攻击动画）
    this.heroBasePositions = this.heroAreas.map((area, i) => ({
      x: area.x + 6 * this.dpr + 22.5 * this.dpr, // 头像中心
      y: area.y + area.h / 2
    }))

    // 初始化角色基础位置（用于攻击动画）
    this.heroBasePositions = this.heroAreas.map((area, i) => ({
      x: area.x + 6 * this.dpr + 22.5 * this.dpr, // 头像中心
      y: area.y + area.h / 2
    }))

    this._addLog(`第 ${this.turn} 回合开始！`)
    this._addLog(`野生的 ${this.enemy.name} 出现了！`)

    // 1.5秒后进入玩家回合
    setTimeout(() => {
      this.phase = 'select_hero'
      this._initHeroAreas()
    }, 1500)
  }

  /**
   * 初始化角色卡片区域（分页）
   */
  _initHeroAreas() {
    const cardHeight = 70 * this.dpr
    const cardSpacing = 75 * this.dpr
    const logHeight = 330 * this.dpr
    const availableHeight = this.height - logHeight - 50 * this.dpr
    
    // 计算当前页的角色
    const startIdx = this.heroPage * this.heroPerPage
    const endIdx = Math.min(startIdx + this.heroPerPage, this.party.length)
    const pageHeroes = this.party.slice(startIdx, endIdx)
    
    const totalHeight = pageHeroes.length * cardSpacing
    const startY = Math.max(80 * this.dpr, (availableHeight - totalHeight) / 2 + 80 * this.dpr)

    this.heroAreas = pageHeroes.map((h, i) => ({
      hero: h,
      x: 20 * this.dpr,
      y: startY + i * cardSpacing,
      w: 150 * this.dpr,
      h: cardHeight,
      index: startIdx + i  // 全局索引
    }))

    // 更新角色基础位置
    this.heroBasePositions = this.heroAreas.map((area) => ({
      x: area.x + 6 * this.dpr + 22.5 * this.dpr,
      y: area.y + area.h / 2
    }))
  }

  /**
   * 翻页
   */
  _prevHeroPage() {
    if (this.heroPage > 0) {
      this.heroPage--
      this._initHeroAreas()
      this._addLog(`← 第 ${this.heroPage + 1}/${this.totalHeroPages} 页`)
    }
  }

  _nextHeroPage() {
    if (this.heroPage < this.totalHeroPages - 1) {
      this.heroPage++
      this._initHeroAreas()
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
    const targetX = this.enemyBaseX - 60 * this.dpr // 攻击位置（敌人左侧）
    const targetY = this.enemyBaseY

    this.attackingHero = hero
    this.attackAnimSkill = skill  // 保存技能引用
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
        this._applyAttackDamage(this.attackingHero, this.enemy)
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
        // 动画完成
        this.attackingHero = null
        this.attackAnim = null
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
    if (!skill) return

    // 计算伤害
    let damage = Math.floor(hero.atk * skill.power - (target.def || 0) * 0.5)
    damage = Math.max(1, damage + Math.floor(Math.random() * 5) - 2)

    // 使用角色的暴击率（而不是硬编码 0.15）
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
      x: this.enemyBaseX,
      y: this.enemyBaseY - 50 * this.dpr,
      color: isCrit ? '#ff4757' : '#ffffff',
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

    // 输入处理
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        this._handleTap(tap.x, tap.y)
      }
    }

    // 行动队列处理
    if (this.phase === 'animating' && this.actionQueue.length > 0) {
      const action = this.actionQueue.shift()
      setTimeout(() => action(), 500)
    }

    // 敌人回合
    if (this.phase === 'enemy_turn') {
      // 创建敌人攻击队列（所有存活的敌人）
      this.enemyAttackQueue = this.enemies.filter(e => e.hp > 0)
      this.currentEnemyIndex = 0
      setTimeout(() => this._enemyAction(), 800)
      this.phase = 'animating'
    }

    // 检查攻击动画完成
    if (this._waitForAttackComplete && this._waitForAttackComplete()) {
      this._waitForAttackComplete = null
    }

    // 敌人攻击动画更新
    this._updateEnemyAttackAnimation(dt)

    // 感化剧情更新
    this._updatePurifyScene(dt)

    // 检查战斗结束
    this._checkBattleEnd()
  }

  // ======== 敌人攻击动画 ========
  _startEnemyAttackAnimation(target) {
    const targetIndex = this.party.indexOf(target)
    if (targetIndex === -1 || !this.heroBasePositions[targetIndex]) return

    const targetPos = this.heroBasePositions[targetIndex]

    this.enemyAttacking = true
    this.enemyAttackTarget = target
    this.enemyAttackAnim = {
      phase: 'jump',
      progress: 0,
      baseX: this.enemyBaseX,
      baseY: this.enemyBaseY,
      targetX: targetPos.x + 40 * this.dpr, // 攻击位置（角色右侧）
      targetY: targetPos.y,
      currentX: this.enemyBaseX,
      currentY: this.enemyBaseY
    }
  }

  _updateEnemyAttackAnimation(dt) {
    if (!this.enemyAttackAnim || !this.enemyAttacking) return

    const anim = this.enemyAttackAnim
    const speed = 4.0 // 敌人稍微快一点

    if (anim.phase === 'jump') {
      anim.progress += dt * speed
      if (anim.progress >= 1) {
        anim.progress = 0
        anim.phase = 'hit'
        anim.currentX = anim.targetX
        anim.currentY = anim.targetY
        // 触发攻击效果
        this._applyEnemyAttackDamage(this.enemyAttackTarget)
      } else {
        const t = this._easeOutQuad(anim.progress)
        anim.currentX = anim.baseX + (anim.targetX - anim.baseX) * t
        anim.currentY = anim.baseY + (anim.targetY - anim.baseY) * t
        const jumpHeight = Math.sin(anim.progress * Math.PI) * 50 * this.dpr
        anim.currentY -= jumpHeight
      }
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
        this.enemyAttackTarget = null

        // 检查是否还有敌人需要攻击
        this.currentEnemyIndex++
        
        // 延迟后继续下一个敌人或结束敌人回合
        setTimeout(() => {
          if (this.phase !== 'victory' && this.phase !== 'defeat') {
            if (this.currentEnemyIndex < this.enemyAttackQueue.length) {
              // 还有敌人需要攻击，继续下一个
              this._enemyAction()
            } else {
              // 所有敌人攻击完毕，进入玩家回合
              this.enemyAttackQueue = []
              this.currentEnemyIndex = 0
              this.turn++
              this._addLog(`--- 第 ${this.turn} 回合 ---`)
              this.phase = 'select_hero'
            }
          }
        }, 300)
      } else {
        const t = this._easeInQuad(anim.progress)
        anim.currentX = anim.targetX + (anim.baseX - anim.targetX) * t
        anim.currentY = anim.targetY + (anim.baseY - anim.targetY) * t
      }
    }
  }

  _applyEnemyAttackDamage(target) {
    const skills = this.enemy.skills || []
    const skill = skills[Math.floor(Math.random() * skills.length)] || { name: '攻击', power: 1.0 }

    // 特殊技能类型：自我治愈
    if (skill.type === 'heal_self') {
      const healAmount = skill.healAmount || 30
      this.enemy.hp = Math.min(this.enemy.maxHp, this.enemy.hp + healAmount)
      
      this.damageTexts.push({
        text: `+${healAmount}`,
        x: this.enemyBaseX,
        y: this.enemyBaseY - 50 * this.dpr,
        color: '#2ed573',
        life: 1.5
      })
      
      this._addLog(`${this.enemy.name} 使用「${skill.name}」！`)
      this._addLog(`恢复了 ${healAmount} 点生命！`)
      return
    }

    let damage = Math.floor(this.enemy.atk * (skill.power || 1.0) - target.def * 0.4)
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
      color: isCrit ? '#ff4757' : '#ff6b6b',  // 暴击时使用更亮的红色
      life: 1.5
    })

    this._addLog(`${this.enemy.name} 使用「${skill.name}」！`)
    this._addLog(`${target.name} 受到 ${damage} 点伤害！`)
  }

  _handleTap(tx, ty) {
    switch (this.phase) {
      case 'select_hero':
        this._handleHeroSelect(tx, ty)
        break
      case 'select_skill':
        this._handleSkillSelect(tx, ty)
        break
      case 'select_target':
        this._handleTargetSelect(tx, ty)
        break
      case 'victory':
      case 'defeat':
        this._handleEndTap(tx, ty)
        break
      case 'purify':
        this._handlePurifyTap(tx, ty)
        break
    }
  }
  
  /**
   * 处理角色选择
   */
  _handleHeroSelect(tx, ty) {
    // 检查翻页按钮（优先）
    if (this.totalHeroPages > 1) {
      const dpr = this.dpr
      const btnSize = 40 * dpr
      const btnRadius = btnSize / 2
      
      // 上一页按钮（左上角）
      const prevBtnX = 10 * dpr + btnRadius
      const prevBtnY = 40 * dpr + btnRadius
      if (this.heroPage > 0 && this._isInCircle(tx, ty, prevBtnX, prevBtnY, btnRadius)) {
        this._prevHeroPage()
        return
      }
      
      // 下一页按钮（左下角）
      const nextBtnX = 10 * dpr + btnRadius
      const nextBtnY = this.height - 350 * dpr + btnRadius
      if (this.heroPage < this.totalHeroPages - 1 && this._isInCircle(tx, ty, nextBtnX, nextBtnY, btnRadius)) {
        this._nextHeroPage()
        return
      }
    }
    
    // 检查点击的角色卡片
    for (const area of this.heroAreas) {
      if (area.hero && area.hero.hp > 0 && this._isInRect(tx, ty, area.x, area.y, area.w, area.h)) {
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
            // 单体攻击 - 目标是敌人
            this._executeSkill(this.selectedHero, skill, this.enemy)
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
    if (this.totalHeroPages > 1) {
      const dpr = this.dpr
      const btnSize = 40 * dpr
      const btnRadius = btnSize / 2
      
      // 上一页按钮（左上角）
      const prevBtnX = 10 * dpr + btnRadius
      const prevBtnY = 40 * dpr + btnRadius
      if (this.heroPage > 0 && this._isInCircle(tx, ty, prevBtnX, prevBtnY, btnRadius)) {
        this._prevHeroPage()
        return
      }
      
      // 下一页按钮（左下角）
      const nextBtnX = 10 * dpr + btnRadius
      const nextBtnY = this.height - 350 * dpr + btnRadius
      if (this.heroPage < this.totalHeroPages - 1 && this._isInCircle(tx, ty, nextBtnX, nextBtnY, btnRadius)) {
        this._nextHeroPage()
        return
      }
    }
    
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
    hero.mp -= skill.mpCost
    this._addLog(`${hero.name} 使用了「${skill.name}」！`)

    // 根据技能类型执行
    if (skill.type === 'attack' || skill.type === 'magic') {
      // 攻击技能 - 启动动画
      this._startAttackAnimation(hero, skill, target)
      // 动画完成后会在 _applyAttackDamage 中处理伤害
      // 设置一个检查动画完成的状态
      this._waitForAttackComplete = () => {
        if (!this.attackAnim && !this.attackingHero) {
          // 动画完成，检查战斗结束
          setTimeout(() => {
            if (this.phase !== 'victory' && this.phase !== 'defeat') {
              this.phase = 'enemy_turn'
            }
          }, 300)
          return true
        }
        return false
      }
    } else if (skill.type === 'heal') {
      // 治疗技能 - 直接执行
      setTimeout(() => {
        this._executeHeal(hero, skill, target)
        setTimeout(() => {
          if (this.phase !== 'victory' && this.phase !== 'defeat') {
            this.phase = 'enemy_turn'
          }
        }, 400)
      }, 300)
    } else if (skill.type === 'buff') {
      // 增益技能
      setTimeout(() => {
        this._executeBuff(hero, skill, target)
        setTimeout(() => {
          if (this.phase !== 'victory' && this.phase !== 'defeat') {
            this.phase = 'enemy_turn'
          }
        }, 400)
      }, 300)
    }
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
      this.turn++
      this.phase = 'player_turn'
      return
    }
    
    // 获取当前攻击的敌人
    const currentEnemy = this.enemyAttackQueue[this.currentEnemyIndex]
    
    // 更新主敌人引用（用于攻击动画）
    this.enemy = currentEnemy
    
    // 选择目标（随机存活角色）
    const alive = this.party.filter(h => h.hp > 0)
    if (alive.length === 0) {
      // 所有角色死亡，战斗失败
      this.phase = 'defeat'
      return
    }

    const target = alive[Math.floor(Math.random() * alive.length)]

    // 启动攻击动画
    this._startEnemyAttackAnimation(target)
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
        console.log('[Battle] 艾米被击败，已解锁魔法塔')
        
        this.phase = 'purify'
        this.purifyStep = 0
        this.purifyTimer = 0
        this._addLog(`✨ ${amyEnemy.name} 被打败了...`)
        this._addLog(`一道温暖的光芒涌现...`)
        console.log(`[Battle] 艾米Boss被击败，开始感化剧情`)
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

      // 标记 Boss 已击败
      if (this.enemy.isBoss) {
        this.game.data.addFlag('ch1_boss_defeated')
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

    // 敌人区域
    if (!this.enemyAttacking) {
      this._renderEnemy(ctx)
    } else {
      // 攻击中的敌人单独绘制
      this._renderAttackingEnemy(ctx)
    }

    // 己方队伍
    this._renderParty(ctx)

    // 攻击中的角色（绘制在敌人附近）
    this._renderAttackingHero(ctx)

    // 技能面板
    if (this.phase === 'select_hero' || this.phase === 'select_skill' || this.phase === 'select_target') {
      this._renderSkillPanel(ctx)
    }

    // 战斗日志
    this._renderBattleLog(ctx)

    // 伤害数字（安全检查）
    if (this.damageTexts && Array.isArray(this.damageTexts)) {
      for (const dt of this.damageTexts) {
        ctx.font = `bold ${28 * dpr}px sans-serif`
        ctx.fillStyle = dt.color
        ctx.textAlign = 'center'
        ctx.fillText(dt.text, dt.x, dt.y)
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

  _renderEnemy(ctx) {
    const dpr = this.dpr
    const ex = this.enemyBaseX
    const ey = this.enemyBaseY

    // 敌人光环效果
    if (this.enemy.isBoss) {
      const glowSize = 80 * dpr + Math.sin(this.time * 2) * 5 * dpr
      ctx.fillStyle = 'rgba(255, 71, 87, 0.15)'
      ctx.beginPath()
      ctx.arc(ex, ey, glowSize, 0, Math.PI * 2)
      ctx.fill()
    }

    // 敌人名称和等级
    ctx.font = `bold ${22 * dpr}px sans-serif`
    ctx.fillStyle = this.enemy.isBoss ? '#ff4757' : '#ffffff'
    ctx.textAlign = 'center'

    const title = this.enemy.isBoss ? `👑 ${this.enemy.name}` : this.enemy.name
    const levelText = `Lv.${this.enemy.level || 1}`
    ctx.fillText(title, ex, ey - 70 * dpr)
    
    // 等级显示
    ctx.font = `${16 * dpr}px sans-serif`
    ctx.fillStyle = '#f39c12'
    ctx.fillText(levelText, ex, ey - 50 * dpr)
    
    // 暴击率显示（如果有）
    if (this.enemy.crit && this.enemy.crit > 0) {
      ctx.font = `${12 * dpr}px sans-serif`
      ctx.fillStyle = '#ff6b6b'
      ctx.fillText(`暴击 ${(this.enemy.crit * 100).toFixed(0)}%`, ex, ey - 35 * dpr)
    }

    // 敌人 HP 条背景
    const hpBarW = 160 * dpr
    const hpBarH = 20 * dpr
    const hpBarX = ex - hpBarW / 2
    const hpBarY = ey - 15 * dpr  // 调整到敌人头像上方

    // HP 条外框
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.beginPath()
    this._roundRect(ctx, hpBarX - 3 * dpr, hpBarY - 3 * dpr, hpBarW + 6 * dpr, hpBarH + 6 * dpr, 12 * dpr)
    ctx.fill()

    // HP 条
    this._drawBar(ctx, hpBarX, hpBarY, hpBarW, hpBarH,
      this.enemy.hp / this.enemy.maxHp, 
      this.enemy.isBoss ? '#ff4757' : '#ff6b6b', 
      `${this.enemy.hp}/${this.enemy.maxHp}`)

    // 敌人形象
    this._drawEnemySprite(ctx, ex, ey)
  }

  _drawEnemySprite(ctx, x, y) {
    const dpr = this.dpr
    const size = 55 * dpr
    const bounce = Math.sin(this.time * 2) * 3 * dpr // 呼吸动画

    ctx.save()
    ctx.translate(x, y + bounce)

    // 阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.beginPath()
    ctx.ellipse(0, size * 0.4, size * 0.5, size * 0.15, 0, 0, Math.PI * 2)
    ctx.fill()

    // 身体颜色
    const bodyColor = this.enemy.isBoss ? '#ff4757' : 
                      this.enemy.isElite ? '#a55eea' : '#7c5ce0'

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
    if (this.enemy.isBoss) {
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

    // 攻击状态特效
    if (anim.phase === 'jump') {
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.arc(anim.baseX, anim.baseY, 50 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = this.enemy.isBoss ? 'rgba(255, 71, 87, 0.3)' : 'rgba(124, 92, 224, 0.3)'
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
    this._drawEnemySprite(ctx, 0, 0)

    ctx.restore()

    // 攻击特效
    if (anim.phase === 'hit') {
      const impactSize = 45 * dpr + Math.sin(this.time * 10) * 10 * dpr
      ctx.strokeStyle = this.enemy.isBoss ? 'rgba(255, 71, 87, 0.8)' : 'rgba(124, 92, 224, 0.8)'
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
        console.error(`[Battle] party[${i}] 不存在`)
        continue
      }

      // 跳过正在攻击的角色
      if (this.attackingHero === hero && this.attackAnim) continue
      
      const area = this.heroAreas[i]
      const x = area.x
      const y = area.y
      const cardW = area.w
      const cardH = area.h

      const isActive = (this.phase === 'select_target' || this.phase === 'select_hero') && hero.hp > 0
      const isDead = hero.hp <= 0

      // 卡片阴影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.beginPath()
      this._roundRect(ctx, x + 3 * dpr, y + 3 * dpr, cardW, cardH, 10 * dpr)
      ctx.fill()

      // 卡片背景渐变
      if (!isDead) {
        const cardGrad = ctx.createLinearGradient(x, y, x, y + cardH)
        if (isActive) {
          cardGrad.addColorStop(0, 'rgba(255, 159, 67, 0.4)')
          cardGrad.addColorStop(1, 'rgba(255, 159, 67, 0.2)')
        } else {
          cardGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)')
          cardGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)')
        }
        ctx.fillStyle = cardGrad
      } else {
        ctx.fillStyle = 'rgba(50, 50, 50, 0.4)'
      }

      ctx.beginPath()
      this._roundRect(ctx, x, y, cardW, cardH, 10 * dpr)
      ctx.fill()

      // 卡片边框
      if (isActive) {
        ctx.strokeStyle = '#ff9f43'
        ctx.lineWidth = 3 * dpr
        ctx.beginPath()
        this._roundRect(ctx, x, y, cardW, cardH, 10 * dpr)
        ctx.stroke()
      } else if (!isDead) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        this._roundRect(ctx, x, y, cardW, cardH, 10 * dpr)
        ctx.stroke()
      }

      // 角色立绘
      const heroImgKey = this._getHeroImageKey(hero.id)
      const heroImg = this.game.assets.get(heroImgKey)
      const avatarSize = 45 * dpr  // 缩小头像
      const avatarX = x + 6 * dpr
      const avatarY = y + (cardH - avatarSize) / 2

      // 头像背景
      ctx.fillStyle = isDead ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.1)'
      ctx.beginPath()
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2 * dpr, 0, Math.PI * 2)
      ctx.fill()

      if (heroImg) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(heroImg, avatarX, avatarY, avatarSize, avatarSize)
        ctx.restore()

        // 头像边框
        ctx.strokeStyle = isActive ? '#ff9f43' : 'rgba(255, 255, 255, 0.3)'
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        // 备用：职业图标
        ctx.font = `${24 * dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(hero.role === 'warrior' ? '⚔️' : '🔮', avatarX + avatarSize / 2, avatarY + avatarSize / 2)
      }

      // 角色名字和等级
      ctx.font = `bold ${14 * dpr}px sans-serif`
      ctx.fillStyle = isDead ? '#666' : '#fff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const nameText = hero.name
      const levelText = hero.level ? ` Lv.${hero.level}` : ''
      ctx.fillText(nameText + levelText, avatarX + avatarSize + 8 * dpr, y + 18 * dpr)

      // 职业
      ctx.font = `${10 * dpr}px sans-serif`
      ctx.fillStyle = isDead ? '#444' : 'rgba(255, 255, 255, 0.6)'
      ctx.fillText(this._roleLabel(hero.role), avatarX + avatarSize + 8 * dpr, y + 31 * dpr)

      // HP 条
      const barX = avatarX + avatarSize + 6 * dpr
      const barW = cardW - avatarSize - 20 * dpr
      this._drawBar(ctx, barX, y + 40 * dpr, barW, 12 * dpr,
        hero.hp / hero.maxHp, '#ff6b6b', `HP ${hero.hp}/${hero.maxHp}`)

      // MP 条
      this._drawBar(ctx, barX, y + 55 * dpr, barW, 12 * dpr,
        hero.mp / hero.maxMp, '#4ecdc4', `MP ${hero.mp}/${hero.maxMp}`)
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
    const btnSize = 40 * dpr
    
    // 上一页按钮（左上角）
    const prevBtnX = 10 * dpr
    const prevBtnY = 40 * dpr
    
    if (this.heroPage > 0) {
      // 按钮背景
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.beginPath()
      ctx.arc(prevBtnX + btnSize / 2, prevBtnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2)
      ctx.fill()
      
      // 按钮边框
      ctx.strokeStyle = '#ff9f43'
      ctx.lineWidth = 2 * dpr
      ctx.stroke()
      
      // 箭头
      ctx.fillStyle = '#ff9f43'
      ctx.font = `bold ${20 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('◀', prevBtnX + btnSize / 2, prevBtnY + btnSize / 2)
    }
    
    // 下一页按钮（左下角）
    const nextBtnX = 10 * dpr
    const nextBtnY = this.height - 350 * dpr
    
    if (this.heroPage < this.totalHeroPages - 1) {
      // 按钮背景
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.beginPath()
      ctx.arc(nextBtnX + btnSize / 2, nextBtnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2)
      ctx.fill()
      
      // 按钮边框
      ctx.strokeStyle = '#ff9f43'
      ctx.lineWidth = 2 * dpr
      ctx.stroke()
      
      // 箭头
      ctx.fillStyle = '#ff9f43'
      ctx.font = `bold ${20 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('▶', nextBtnX + btnSize / 2, nextBtnY + btnSize / 2)
    }
    
    // 页码指示器（左中）
    const pageX = 30 * dpr
    const pageY = this.height / 2
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.font = `bold ${14 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${this.heroPage + 1}/${this.totalHeroPages}`, pageX, pageY)
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
    // 日志放在左下角，技能面板上方
    const logW = this.width - 30 * dpr
    const logH = 80 * dpr
    const logX = 15 * dpr
    const logY = this.height - 330 * dpr // 技能面板上方

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
    
    // 回合背景
    const infoW = 140 * dpr
    const infoH = 36 * dpr
    const infoX = (w - infoW) / 2
    const infoY = 15 * dpr

    const infoGrad = ctx.createLinearGradient(infoX, infoY, infoX + infoW, infoY)
    infoGrad.addColorStop(0, 'rgba(255, 159, 67, 0.3)')
    infoGrad.addColorStop(0.5, 'rgba(255, 159, 67, 0.5)')
    infoGrad.addColorStop(1, 'rgba(255, 159, 67, 0.3)')
    ctx.fillStyle = infoGrad
    ctx.beginPath()
    this._roundRect(ctx, infoX, infoY, infoW, infoH, 18 * dpr)
    ctx.fill()

    // 回合文字
    ctx.font = `bold ${18 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`第 ${this.turn} 回合`, w / 2, infoY + infoH / 2)
    ctx.textBaseline = 'alphabetic'

    // 阶段提示
    const phaseText = {
      'select_skill': '选择技能',
      'select_target': '选择目标',
      'animating': '战斗中...',
      'enemy_turn': '敌方回合',
      'intro': '战斗开始！'
    }[this.phase] || ''

    if (phaseText && this.phase !== 'victory' && this.phase !== 'defeat') {
      ctx.font = `${12 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fillText(phaseText, w / 2, infoY + infoH + 15 * dpr)
    }
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
  _drawBar(ctx, x, y, w, h, ratio, color, text) {
    ratio = Math.max(0, Math.min(1, ratio))

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.beginPath()
    this._roundRect(ctx, x, y, w, h, h / 2)
    ctx.fill()

    if (ratio > 0) {
      ctx.fillStyle = color
      ctx.beginPath()
      this._roundRect(ctx, x, y, w * ratio, h, h / 2)
      ctx.fill()
    }

    ctx.font = `bold ${h * 0.75}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + w / 2, y + h / 2)
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

    // 艾米的头像（逐渐显现）
    const amyImgKey = 'CAT_AMY'
    const amyImg = this.game.assets.get(amyImgKey)
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
    if (amyImg) {
      ctx.beginPath()
      ctx.arc(w / 2, avatarY, avatarSize / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(amyImg, w / 2 - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize)
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
    ctx.fillText('艾米', w / 2, avatarY + avatarSize / 2 + 35 * dpr)

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

        // 解锁艾米角色
        const unlocked = charStateManager.unlockCharacter('amy')
        if (unlocked) {
          console.log('[Battle] 艾米成功加入队伍！')
          this._addLog(`✨ 艾米加入了队伍！`)
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
