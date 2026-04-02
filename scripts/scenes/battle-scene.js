/**
 * battle-scene.js - 回合制战斗系统
 */

import { ENEMIES_CH1 } from '../data/enemies.js'

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
    this.enemy = data.enemy || {}
    this.bgPath = data.bg || 'images/backgrounds/bg_grassland.png'
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

    // 敌人动画位置
    this.enemyBaseX = this.width * 0.65
    this.enemyBaseY = this.height * 0.35
    this.enemyX = this.enemyBaseX
    this.enemyY = this.enemyBaseY

    // 按钮区域
    this.skillButtons = []
    this.targetAreas = []
    this.heroAreas = []
  }

  init() {
    // 初始化角色位置区域
    this.heroAreas = this.party.map((h, i) => ({
      hero: h,
      x: 30 * this.dpr,
      y: this.height * 0.45 + i * 90 * this.dpr,
      w: 160 * this.dpr,
      h: 80 * this.dpr,
      index: i
    }))

    this._addLog(`第 ${this.turn} 回合开始！`)
    this._addLog(`野生的 ${this.enemy.name} 出现了！`)

    // 1.5秒后进入玩家回合
    setTimeout(() => {
      this.phase = 'select_skill'
      this._showHeroSelection()
    }, 1500)
  }

  _addLog(text) {
    this.log.push({ text, time: this.time })
    if (this.log.length > 20) this.log.shift()
  }

  _showHeroSelection() {
    this._addLog(`选择角色使用技能`)
  }

  // ======== 更新 ========
  update(dt) {
    this.time += dt

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
      setTimeout(() => this._enemyAction(), 800)
      this.phase = 'animating'
    }

    // 检查战斗结束
    this._checkBattleEnd()
  }

  _handleTap(tx, ty) {
    switch (this.phase) {
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
    }
  }

  _handleSkillSelect(tx, ty) {
    // 生成技能按钮区域
    const dpr = this.dpr
    const btnW = (this.width - 30 * dpr) / 2
    const btnH = 45 * dpr
    const startX = 10 * dpr
    const startY = this.height - 220 * dpr

    // 遍历所有角色的技能
    let btnIdx = 0
    for (let pi = 0; pi < this.party.length; pi++) {
      const hero = this.party[pi]
      if (hero.hp <= 0) continue

      for (let si = 0; si < hero.skills.length; si++) {
        const skill = hero.skills[si]
        const col = btnIdx % 2
        const row = Math.floor(btnIdx / 2)
        const bx = startX + col * (btnW + 10 * dpr)
        const by = startY + row * (btnH + 8 * dpr)

        if (this._isInRect(tx, ty, bx, by, btnW, btnH)) {
          if (hero.mp >= skill.mpCost) {
            this.selectedHero = hero
            this.selectedSkill = skill

            // 确定目标类型
            if (skill.type === 'heal' && skill.target?.includes('ally')) {
              // 治疗技能 - 选择己方目标
              this.phase = 'select_target'
              this._addLog(`${hero.name} 使用 ${skill.name}，选择治疗目标`)
            } else if (skill.target === 'all' || skill.target === 'all_ally') {
              // 全体技能 - 直接执行
              this._executeSkill(hero, skill, null)
            } else {
              // 单体攻击 - 目标是敌人
              this._executeSkill(hero, skill, this.enemy)
            }
            return
          } else {
            this._addLog(`MP不足！需要 ${skill.mpCost} MP`)
            return
          }
        }
        btnIdx++
      }
    }
  }

  _handleTargetSelect(tx, ty) {
    // 选择治疗目标
    for (const area of this.heroAreas) {
      if (area.hero.hp > 0 && this._isInRect(tx, ty, area.x, area.y, area.w, area.h)) {
        this._executeSkill(this.selectedHero, this.selectedSkill, area.hero)
        return
      }
    }

    // 点击空白取消
    this.phase = 'select_skill'
    this.selectedSkill = null
  }

  _handleEndTap(tx, ty) {
    // 任意点击结束
    if (this.phase === 'victory') {
      this.game.changeScene('map', { nodeId: this.nodeId })
    } else if (this.phase === 'defeat') {
      this.game.changeScene('main-menu')
    }
  }

  // ======== 技能执行 ========
  _executeSkill(hero, skill, target) {
    this.phase = 'animating'

    hero.mp -= skill.mpCost
    this._addLog(`${hero.name} 使用了「${skill.name}」！`)

    // 技能效果
    setTimeout(() => {
      if (skill.type === 'attack' || skill.type === 'magic') {
        this._executeAttack(hero, skill, target)
      } else if (skill.type === 'heal') {
        this._executeHeal(hero, skill, target)
      } else if (skill.type === 'buff') {
        this._executeBuff(hero, skill, target)
      }

      // 检查是否所有角色都行动完了
      setTimeout(() => {
        if (this.phase !== 'victory' && this.phase !== 'defeat') {
          this.phase = 'enemy_turn'
        }
      }, 600)
    }, 400)
  }

  _executeAttack(hero, skill, target) {
    // 计算伤害
    let damage = Math.floor(hero.atk * skill.power - (target.def || 0) * 0.5)
    damage = Math.max(1, damage + Math.floor(Math.random() * 5) - 2)

    // 暴击
    const isCrit = Math.random() < 0.15
    if (isCrit) {
      damage = Math.floor(damage * 1.5)
      this._addLog(`💥 暴击！`)
    }

    target.hp = Math.max(0, target.hp - damage)

    // 动画效果
    this.shakeAmount = 10
    this.flashAlpha = 0.5
    this.damageTexts.push({
      text: `-${damage}`,
      x: this.enemyX,
      y: this.enemyBaseY - 30 * this.dpr,
      color: isCrit ? '#ff4757' : '#ffffff',
      life: 1.5
    })

    this._addLog(`造成 ${damage} 点伤害！`)

    // 吸血效果
    if (skill.effect === 'drain') {
      const heal = Math.floor(damage * 0.3)
      hero.hp = Math.min(hero.maxHp, hero.hp + heal)
      this._addLog(`恢复了 ${heal} 点生命`)
    }
  }

  _executeHeal(hero, skill, target) {
    let heal = skill.power + Math.floor(Math.random() * 10)
    heal = Math.min(heal, target.maxHp - target.hp)
    target.hp = Math.min(target.maxHp, target.hp + heal)

    this.damageTexts.push({
      text: `+${heal}`,
      x: 80 * this.dpr,
      y: this.height * 0.4,
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
    if (this.enemy.hp <= 0) return

    // 随机选择技能
    const skills = this.enemy.skills || []
    const skill = skills[Math.floor(Math.random() * skills.length)] || { name: '攻击', power: 1.0, type: 'attack' }

    this._addLog(`${this.enemy.name} 使用了「${skill.name}」！`)

    // 选择目标（随机存活角色）
    const alive = this.party.filter(h => h.hp > 0)
    if (alive.length === 0) return
    const target = alive[Math.floor(Math.random() * alive.length)]

    // 计算伤害
    let damage = Math.floor(this.enemy.atk * (skill.power || 1.0) - target.def * 0.4)
    damage = Math.max(1, damage + Math.floor(Math.random() * 4) - 1)
    target.hp = Math.max(0, target.hp - damage)

    this.shakeAmount = 5
    this.damageTexts.push({
      text: `-${damage}`,
      x: 80 * this.dpr,
      y: this.height * 0.5,
      color: '#ff6b6b',
      life: 1.5
    })

    this._addLog(`${target.name} 受到 ${damage} 点伤害！`)

    // 下一个回合
    setTimeout(() => {
      if (this.phase !== 'victory' && this.phase !== 'defeat') {
        this.turn++
        this._addLog(`--- 第 ${this.turn} 回合 ---`)
        this.phase = 'select_skill'
      }
    }, 800)
  }

  _checkBattleEnd() {
    if (this.enemy.hp <= 0) {
      this.phase = 'victory'
      this._addLog(`🎉 ${this.enemy.name} 被击败了！`)
      this._addLog(`获得 ${this.enemy.exp} 经验，${this.enemy.gold} 金币`)

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
    this._renderEnemy(ctx)

    // 己方队伍
    this._renderParty(ctx)

    // 技能面板
    if (this.phase === 'select_skill' || this.phase === 'select_target') {
      this._renderSkillPanel(ctx)
    }

    // 战斗日志
    this._renderBattleLog(ctx)

    // 伤害数字
    for (const dt of this.damageTexts) {
      ctx.font = `bold ${28 * dpr}px sans-serif`
      ctx.fillStyle = dt.color
      ctx.textAlign = 'center'
      ctx.fillText(dt.text, dt.x, dt.y)
    }

    // 闪光效果
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`
      ctx.fillRect(0, 0, w, h)
    }

    // 回合信息
    ctx.font = `bold ${16 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(`第 ${this.turn} 回合`, w / 2, 30 * dpr)

    if (this.shakeAmount > 0) {
      ctx.restore()
    }

    // 胜利/失败画面
    if (this.phase === 'victory') {
      this._renderEndScreen(ctx, '🎉 胜利！', '#2ed573', '点击继续')
    } else if (this.phase === 'defeat') {
      this._renderEndScreen(ctx, '💔 战败...', '#ff4757', '点击返回')
    }
  }

  _renderEnemy(ctx) {
    const dpr = this.dpr
    const ex = this.enemyBaseX
    const ey = this.enemyBaseY

    // 敌人名称和血条
    ctx.font = `bold ${20 * dpr}px sans-serif`
    ctx.fillStyle = this.enemy.isBoss ? '#ff4757' : '#ffffff'
    ctx.textAlign = 'center'

    const title = this.enemy.isBoss ? `👑 ${this.enemy.name}` : this.enemy.name
    ctx.fillText(title, ex, ey - 60 * dpr)

    // 敌人 HP 条
    const hpBarW = 150 * dpr
    const hpBarH = 16 * dpr
    this._drawBar(ctx, ex - hpBarW / 2, ey - 45 * dpr, hpBarW, hpBarH,
      this.enemy.hp / this.enemy.maxHp, '#ff6b6b', `${this.enemy.hp}/${this.enemy.maxHp}`)

    // 敌人形象（简单图形替代）
    this._drawEnemySprite(ctx, ex, ey)
  }

  _drawEnemySprite(ctx, x, y) {
    const dpr = this.dpr
    const size = 50 * dpr

    // 用简单图形绘制敌人
    ctx.fillStyle = this.enemy.isBoss ? '#ff4757' : '#a55eea'

    // 身体
    ctx.beginPath()
    ctx.ellipse(x, y, size * 0.6, size * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()

    // 耳朵
    ctx.beginPath()
    ctx.moveTo(x - size * 0.4, y - size * 0.3)
    ctx.lineTo(x - size * 0.5, y - size * 0.7)
    ctx.lineTo(x - size * 0.1, y - size * 0.35)
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(x + size * 0.4, y - size * 0.3)
    ctx.lineTo(x + size * 0.5, y - size * 0.7)
    ctx.lineTo(x + size * 0.1, y - size * 0.35)
    ctx.fill()

    // 眼睛
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x - 15 * dpr, y - 5 * dpr, 6 * dpr, 0, Math.PI * 2)
    ctx.arc(x + 15 * dpr, y - 5 * dpr, 6 * dpr, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(x - 14 * dpr, y - 4 * dpr, 3 * dpr, 0, Math.PI * 2)
    ctx.arc(x + 16 * dpr, y - 4 * dpr, 3 * dpr, 0, Math.PI * 2)
    ctx.fill()
  }

  _renderParty(ctx) {
    const dpr = this.dpr

    for (let i = 0; i < this.party.length; i++) {
      const hero = this.party[i]
      const x = 30 * dpr
      const y = this.height * 0.45 + i * 90 * dpr
      const cardW = 170 * dpr
      const cardH = 80 * dpr

      // 卡片背景
      const isActive = this.phase === 'select_target' && hero.hp > 0
      ctx.fillStyle = hero.hp <= 0 ? 'rgba(50, 50, 50, 0.5)' :
                     isActive ? 'rgba(255, 159, 67, 0.3)' :
                     'rgba(255, 255, 255, 0.1)'

      if (isActive) {
        ctx.strokeStyle = '#ff9f43'
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        this._roundRect(ctx, x, y, cardW, cardH, 8 * dpr)
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.beginPath()
        this._roundRect(ctx, x, y, cardW, cardH, 8 * dpr)
        ctx.fill()
      }

      // 角色立绘
      const heroImgKey = this._getHeroImageKey(hero.id)
      const heroImg = this.game.assets.get(heroImgKey)
      const avatarSize = 50 * dpr
      
      if (heroImg) {
        // 绘制角色立绘
        ctx.drawImage(heroImg, x + 5 * dpr, y + 5 * dpr, avatarSize, avatarSize)
      } else {
        // 备用：职业图标
        ctx.font = `${30 * dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(hero.role === 'warrior' ? '⚔️' : '🔮', x + 30 * dpr, y + cardH / 2)
      }

      // 角色名字
      ctx.font = `bold ${14 * dpr}px sans-serif`
      ctx.fillStyle = hero.hp <= 0 ? '#666' : '#fff'
      ctx.textAlign = 'left'
      ctx.fillText(hero.name, x + 60 * dpr, y + 18 * dpr)

      // 职业
      ctx.font = `${10 * dpr}px sans-serif`
      ctx.fillStyle = hero.hp <= 0 ? '#555' : 'rgba(255,255,255,0.6)'
      ctx.fillText(this._roleLabel(hero.role), x + 60 * dpr, y + 34 * dpr)

      // HP
      this._drawBar(ctx, x + 8 * dpr, y + 42 * dpr, cardW - 20 * dpr, 12 * dpr,
        hero.hp / hero.maxHp, '#ff6b6b', `${hero.hp}/${hero.maxHp}`)

      // MP
      this._drawBar(ctx, x + 8 * dpr, y + 58 * dpr, cardW - 20 * dpr, 12 * dpr,
        hero.mp / hero.maxMp, '#4ecdc4', `${hero.mp}/${hero.maxMp}`)
    }
  }

  _renderSkillPanel(ctx) {
    const dpr = this.dpr
    const w = this.width
    const h = this.height

    // 面板背景
    const panelY = h - 230 * dpr
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.beginPath()
    this._roundRect(ctx, 5 * dpr, panelY, w - 10 * dpr, 220 * dpr, 10 * dpr)
    ctx.fill()

    // 标题
    ctx.font = `bold ${14 * dpr}px sans-serif`
    ctx.fillStyle = '#ff9f43'
    ctx.textAlign = 'left'
    ctx.fillText(this.phase === 'select_target' ? '👆 选择治疗目标' : '⚔️ 选择技能', 15 * dpr, panelY + 20 * dpr)

    if (this.phase === 'select_target') return

    // 技能按钮
    const btnW = (w - 30 * dpr) / 2
    const btnH = 45 * dpr
    const startX = 10 * dpr
    const startY = panelY + 30 * dpr
    let btnIdx = 0

    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      for (const skill of hero.skills) {
        const col = btnIdx % 2
        const row = Math.floor(btnIdx / 2)
        const bx = startX + col * (btnW + 10 * dpr)
        const by = startY + row * (btnH + 6 * dpr)

        const canUse = hero.mp >= skill.mpCost

        // 按钮背景
        ctx.fillStyle = canUse ? 'rgba(255, 255, 255, 0.15)' : 'rgba(100, 100, 100, 0.3)'
        ctx.beginPath()
        this._roundRect(ctx, bx, by, btnW, btnH, 6 * dpr)
        ctx.fill()

        // 技能名
        ctx.font = `bold ${14 * dpr}px sans-serif`
        ctx.fillStyle = canUse ? '#fff' : '#666'
        ctx.textAlign = 'left'
        ctx.fillText(`${skill.name}`, bx + 8 * dpr, by + 18 * dpr)

        // 消耗和角色
        ctx.font = `${10 * dpr}px sans-serif`
        ctx.fillStyle = canUse ? 'rgba(255,255,255,0.6)' : '#555'
        ctx.fillText(`${hero.name} · MP ${skill.mpCost}`, bx + 8 * dpr, by + 34 * dpr)

        btnIdx++
      }
    }
  }

  _renderBattleLog(ctx) {
    const dpr = this.dpr
    const logW = 200 * dpr
    const logX = this.width - logW - 10 * dpr
    const logY = 50 * dpr

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.beginPath()
    this._roundRect(ctx, logX, logY, logW, this.height * 0.35, 8 * dpr)
    ctx.fill()

    ctx.font = `${11 * dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.textAlign = 'left'

    const lineHeight = 16 * dpr
    const maxLines = Math.floor((this.height * 0.35 - 20 * dpr) / lineHeight)
    const startIdx = Math.max(0, this.log.length - maxLines)

    for (let i = startIdx; i < this.log.length; i++) {
      const entry = this.log[i]
      const lineY = logY + 16 * dpr + (i - startIdx) * lineHeight

      // 根据内容着色
      if (entry.text.includes('暴击') || entry.text.includes('💥')) {
        ctx.fillStyle = '#ff9f43'
      } else if (entry.text.includes('恢复') || entry.text.includes('🎉')) {
        ctx.fillStyle = '#2ed573'
      } else if (entry.text.includes('击败')) {
        ctx.fillStyle = '#54a0ff'
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
      }

      ctx.fillText(entry.text, logX + 8 * dpr, lineY, logW - 16 * dpr)
    }
  }

  _renderEndScreen(ctx, title, color, hint) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, w, h)

    // 标题
    ctx.font = `bold ${40 * dpr}px sans-serif`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(title, w / 2, h / 2 - 20 * dpr)

    // 提示
    ctx.font = `${18 * dpr}px sans-serif`
    ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(this.time * 3) * 0.3})`
    ctx.fillText(hint, w / 2, h / 2 + 30 * dpr)
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
    // 根据 bgPath 返回资源 key
    const map = {
      'grassland': 'BG_GRASSLAND',
      'forest': 'BG_FOREST',
      'cave': 'BG_CAVE',
      'town': 'BG_TOWN',
      'boss': 'BG_BOSS'
    }
    for (const [k, v] of Object.entries(map)) {
      if (this.bgPath.includes(k)) return v
    }
    return 'BG_GRASSLAND'
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
}
