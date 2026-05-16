/**
 * battle-input.js - 输入处理、感化剧情、几何工具
 * 职责：点击/触摸处理、UI交互响应、感化剧情逻辑、几何判断工具
 */

import { charStateManager } from '../../data/character-state.js'
import { getBossDrop, getRandomEquipment } from '../../data/equipment.js'

export function installBattleInput(BattleSceneClass) {
  const proto = BattleSceneClass.prototype

  // ======== 几何工具 ========
  proto._isInRect = function(x, y, rx, ry, rw, rh) {
    return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh
  }

  proto._isInCircle = function(x, y, cx, cy, r) {
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= r * r
  }

  proto._checkPageButtons = function(tx, ty) {
    if (this.totalHeroPages <= 1 || !this.heroAreas || this.heroAreas.length === 0) return false

    const dpr = this.dpr
    const btnW = 50 * dpr
    const btnH = 80 * dpr

    const firstArea = this.heroAreas[0]
    const lastArea = this.heroAreas[this.heroAreas.length - 1]
    const cardCenterY = firstArea.y + firstArea.h / 2

    if (this.heroPage > 0) {
      const prevBtnX = Math.max(10 * dpr, firstArea.x - btnW - 5 * dpr)
      const prevBtnY = cardCenterY - btnH / 2
      if (this._isInRect(tx, ty, prevBtnX, prevBtnY, btnW, btnH)) {
        this._prevHeroPage()
        return true
      }
    }

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

  // ======== 主点击处理 ========
  proto.handleTap = function(tap) {
    // SceneBase 传递的是 tap 对象 {x, y}（已乘 dpr）
    const tx = tap.x
    const ty = tap.y
    
    // 调试日志（帮助定位点击问题）
    console.log(`[BattleInput] handleTap: (${tx}, ${ty}), phase=${this.phase}`)
    
    // 加速/暂停按钮检测
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
      // 撤退按钮
      if (this._fleeButtonArea) {
        const btn = this._fleeButtonArea
        console.log(`[BattleInput] 检查撤退按钮: tx=${tx}, ty=${ty}, btn=(${btn.x}, ${btn.y}, ${btn.w}x${btn.h})`)
        if (tx >= btn.x && tx <= btn.x + btn.w && ty >= btn.y && ty <= btn.y + btn.h) {
          console.log('[BattleInput] ✅ 撤退按钮被点击！')
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
      case 'select_hero':
        this._handleHeroSelect(tx, ty)
        break
      case 'select_skill':
        this._handleSkillSelect(tx, ty)
        break
      case 'select_target':
        this._handleTargetSelect(tx, ty)
        break
      case 'select_enemy_target':
        this._handleEnemyTargetSelect(tx, ty)
        break
    }
  }

  proto._flee = function() {
    this._addLog(`🏃 撤退成功！`)
    if (this.monsterId) {
      this.game.data.set('currentBattleMonsterId', this.monsterId)
    }
    this.game.changeScene('field', { nodeId: this.nodeId })
  }

  // ======== 角色选择处理 ========
  proto._handleHeroSelect = function(tx, ty) {
    if (this._checkPageButtons(tx, ty)) return

    for (const area of this.heroAreas) {
      if (area.hero && area.hero.hp > 0 && this._isInRect(tx, ty, area.x, area.y, area.w, area.h)) {
        if (this.actedHeroes && this.actedHeroes.has(area.hero.id)) {
          this._addLog(`⚠️ ${area.hero.name} 本回合已行动`)
          return
        }
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

  proto._handleSkillSelect = function(tx, ty) {
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

          if (skill.type === 'heal' && skill.target?.includes('ally')) {
            this.phase = 'select_target'
            this._addLog(`${this.selectedHero.name} 使用 ${skill.name}，选择治疗目标`)
          } else if (skill.target === 'all' || skill.target === 'all_ally') {
            this._executeSkill(this.selectedHero, skill, null)
          } else {
            const aliveEnemies = this.enemies.filter(e => e.hp > 0)
            if (aliveEnemies.length > 1) {
              this.phase = 'select_enemy_target'
              this._addLog(`${this.selectedHero.name} 使用 ${skill.name}，选择攻击目标`)
            } else if (aliveEnemies.length === 1) {
              this._executeSkill(this.selectedHero, skill, aliveEnemies[0])
            } else {
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

    this.phase = 'select_hero'
    this.selectedHero = null
  }

  proto._handleTargetSelect = function(tx, ty) {
    if (this._checkPageButtons(tx, ty)) return

    if (!this.heroAreas || !Array.isArray(this.heroAreas)) {
      this.phase = 'select_hero'
      this.selectedHero = null
      return
    }

    for (const area of this.heroAreas) {
      if (area.hero && area.hero.hp > 0 && this._isInRect(tx, ty, area.x, area.y, area.w, area.h)) {
        this._executeSkill(this.selectedHero, this.selectedSkill, area.hero)
        return
      }
    }

    this.phase = 'select_hero'
    this.selectedHero = null
    this.selectedSkill = null
  }

  proto._handleEnemyTargetSelect = function(tx, ty) {
    this.enemies.forEach((enemy, index) => {
      if (enemy.hp <= 0) return
      const pos = this.enemyPositions[index]
      if (!pos) return

      const dpr = this.dpr
      const hitRadius = 60 * dpr
      if (this._isInCircle(tx, ty, pos.x, pos.y, hitRadius)) {
        this._executeSkill(this.selectedHero, this.selectedSkill, enemy)
        return
      }
    })

    this.phase = 'select_hero'
    this.selectedHero = null
    this.selectedSkill = null
  }

  // ======== 战斗结束点击处理 ========
  proto._handleEndTap = function(tx, ty) {
    // 使用渲染时保存的按钮位置（包含脉冲动画的缩放）
    const btn = this._endScreenButton
    if (!btn) {
      console.log('[BattleInput] _endScreenButton 未定义！')
      return
    }

    console.log(`[BattleInput] 检查结束按钮: tx=${tx}, ty=${ty}, btn=(${btn.x}, ${btn.y}, ${btn.w}x${btn.h})`)
    
    if (this._isInRect(tx, ty, btn.x, btn.y, btn.w, btn.h)) {
      console.log('[BattleInput] ✅ 结束按钮被点击！phase=' + this.phase)
      if (this.phase === 'victory') {
        // 点击继续时，保存奖励并切换场景
        this._saveBattleRewards()
      } else {
        this.game.data.set('battleVictory', false)
        if (this.monsterId) {
          this.game.data.set('currentBattleMonsterId', this.monsterId)
        }
        this.game.changeScene('field', { nodeId: this.nodeId })
      }
    } else {
      console.log('[BattleInput] ❌ 未点击到按钮')
    }
  }

  // 生成战斗奖励（显示在结束画面）
  proto._generateBattleRewards = function() {
    // 经验奖励
    const expReward = this.enemies.reduce((sum, e) => sum + (e.exp || 0), 0)
    const goldReward = this.enemies.reduce((sum, e) => sum + (e.gold || 0), 0)

    // 掉落物品
    const drops = []
    this.enemies.forEach(enemy => {
      if (enemy.isBoss && enemy.id) {
        const drop = getBossDrop(enemy.id)
        if (drop) drops.push(drop)
      } else if (Math.random() < (enemy.dropRate || 0.1)) {
        const drop = getRandomEquipment(enemy.level || 1)
        if (drop) drops.push(drop)
      }
    })

    // 角色升级检查
    const levelUps = []
    const allChars = charStateManager.getAllCharacters()
    for (const charState of allChars) {
      const partyMember = this.party.find(h => h.id === charState.id)
      if (partyMember) {
        charState.hp = Math.max(0, Math.min(partyMember.hp, charState.maxHp))
        charState.mp = Math.max(0, Math.min(partyMember.mp, charState.maxMp))
        const levelUpCount = charState.gainExp(expReward)
        if (levelUpCount > 0) {
          levelUps.push({
            name: charState.name,
            level: charState.level
          })
        }
      }
    }

    // 保存角色状态
    const charData = charStateManager.serialize()
    this.game.data.set('characterStates', charData)

    // 存储奖励数据供渲染使用
    this._battleRewards = {
      exp: expReward,
      gold: goldReward,
      drops: drops,
      levelUps: levelUps
    }

    console.log('[Battle] 战斗奖励已生成:', this._battleRewards)
  }

  // 保存战斗奖励（点击继续时调用）
  proto._saveBattleRewards = function() {
    const rewards = this._battleRewards
    if (!rewards) {
      this.game.changeScene('field', { nodeId: this.nodeId })
      return
    }

    // 保存掉落物品到背包
    if (rewards.drops && rewards.drops.length > 0) {
      const inventory = this.game.data.get('inventory') || []
      rewards.drops.forEach(item => {
        inventory.push(item)
        console.log(`[Battle] 获得装备: ${item.name}`)
      })
      this.game.data.set('inventory', inventory)
    }

    // 保存金币
    if (rewards.gold > 0) {
      const currentGold = this.game.data.get('gold') || 0
      this.game.data.set('gold', currentGold + rewards.gold)
    }

    // 标记战斗胜利
    this.game.data.set('battleVictory', true)
    if (this.monsterId) {
      this.game.data.set('currentBattleMonsterId', this.monsterId)
      const defeatedKey = `${this.nodeId}_${this.monsterId}_defeated`
      this.game.data.addFlag(defeatedKey)
    }

    console.log(`[Battle] 准备返回野外地图，区域: ${this.nodeId}`)
    this.game.changeScene('field', { nodeId: this.nodeId })
  }

  // ======== 技能执行（旧回合制兼容） ========
  proto._executeSkill = function(hero, skill, target) {
    console.log(`[Battle] ${hero.name} 使用「${skill.name}」`)
    hero.mp = Math.max(0, hero.mp - (skill.mpCost || 0))

    if (skill.type === 'heal' || skill.type === 'heal_self') {
      const healTarget = skill.type === 'heal_self' ? hero : (target || hero)
      const healAmount = Math.floor(hero.magic * (skill.power || 1.0))
      healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount)
      this._addLog(`${hero.name} 使用「${skill.name}」，恢复了 ${healAmount} 点生命！`)
    } else if (skill.target === 'all' || skill.target === 'all_enemies') {
      this.enemies.forEach(enemy => {
        if (enemy.hp <= 0) return
        this._applyAttackDamageToTarget(hero, skill, enemy, this.enemyPositions[this.enemies.indexOf(enemy)])
      })
      this._addLog(`${hero.name} 使用「${skill.name}」攻击全体敌人！`)
    } else if (target) {
      if (this.enemies.includes(target)) {
        this._applyAttackDamageToTarget(hero, skill, target, this.enemyPositions[this.enemies.indexOf(target)])
      } else {
        this._applyAttackDamageToTarget(hero, skill, target, this.heroBasePositions[this.party.indexOf(target)])
      }
    }

    this.actedHeroes.add(hero.id)
    this.phase = 'select_hero'
    this.selectedHero = null
    this.selectedSkill = null
  }

  // ======== 感化剧情 ========
  proto._updatePurifyScene = function(dt) {
    if (this.phase !== 'purify') return
    this.purifyTimer = (this.purifyTimer || 0) + dt
    if ((this.purifyStep || 0) < 3 && this.purifyTimer > 2.5) {
      this.purifyStep = (this.purifyStep || 0) + 1
      this.purifyTimer = 0
    }
  }

  proto._renderPurifyScene = function(ctx) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr

    const progress = Math.min(1, (this.purifyTimer || 0) * 0.5)
    const bgAlpha = 0.85 + progress * 0.1
    ctx.fillStyle = `rgba(255, 248, 220, ${bgAlpha})`
    ctx.fillRect(0, 0, w, h)

    const glowAlpha = 0.3 + Math.sin(this.time * 3) * 0.2
    const glowSize = 200 * dpr + Math.sin(this.time * 2) * 20 * dpr
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, glowSize)
    gradient.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha})`)
    gradient.addColorStop(0.5, `rgba(255, 236, 179, ${glowAlpha * 0.5})`)
    gradient.addColorStop(1, 'rgba(255, 236, 179, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    let charImgKey, charName
    if (this.enemy.isAmy) { charImgKey = 'CAT_AMY'; charName = '艾米' }
    else if (this.enemy.isAnnie) { charImgKey = 'CAT_ANNIE'; charName = '安妮' }
    else { charImgKey = 'CAT_AMY'; charName = this.enemy.name || '???' }

    const charImg = this.game.assets.get(charImgKey)
    const avatarSize = 120 * dpr
    const avatarY = h * 0.35

    ctx.save()
    ctx.globalAlpha = progress
    const ringAlpha = 0.5 + Math.sin(this.time * 2) * 0.2
    ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`
    ctx.lineWidth = 4 * dpr
    ctx.beginPath()
    ctx.arc(w / 2, avatarY, avatarSize / 2 + 10 * dpr, 0, Math.PI * 2)
    ctx.stroke()

    if (charImg) {
      ctx.beginPath()
      ctx.arc(w / 2, avatarY, avatarSize / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(charImg, w / 2 - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize)
    } else {
      ctx.font = `bold ${30 * dpr}px sans-serif`
      ctx.fillStyle = '#2d3436'
      ctx.textAlign = 'center'
      ctx.fillText('💚', w / 2, avatarY)
    }
    ctx.restore()

    ctx.font = `bold ${28 * dpr}px sans-serif`
    ctx.fillStyle = '#2d3436'
    ctx.textAlign = 'center'
    ctx.fillText(charName, w / 2, avatarY + avatarSize / 2 + 35 * dpr)

    const dialogues = this.enemy.purifyDialogue || [
      '你们的眼神...如此温暖...',
      '我一直在寻找这样的羁绊...',
      '请让我加入你们，一起守护这片大地！'
    ]

    const boxY = h * 0.55
    const boxH = 180 * dpr

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    this._roundRect(ctx, 40 * dpr, boxY, w - 80 * dpr, boxH, 15 * dpr)
    ctx.fill()

    ctx.strokeStyle = '#ff9f43'
    ctx.lineWidth = 3 * dpr
    ctx.stroke()

    ctx.font = `${18 * dpr}px sans-serif`
    ctx.fillStyle = '#2d3436'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const displayTexts = dialogues.slice(0, (this.purifyStep || 0) + 1)
    let textY = boxY + 30 * dpr
    for (const text of displayTexts) {
      ctx.fillText(text, w / 2, textY)
      textY += 35 * dpr
    }

    if ((this.purifyStep || 0) >= 2) {
      ctx.font = `bold ${22 * dpr}px sans-serif`
      ctx.fillStyle = '#ff9f43'
      ctx.fillText('✨ 艾米加入了队伍！', w / 2, h * 0.88)

      const btnW = 180 * dpr
      const btnH_f = 50 * dpr
      const btnX = (w - btnW) / 2
      const btnY_f = h * 0.92

      const btnGrad = ctx.createLinearGradient(btnX, btnY_f, btnX, btnY_f + btnH_f)
      btnGrad.addColorStop(0, '#2ed573')
      btnGrad.addColorStop(1, '#26b863')
      ctx.fillStyle = btnGrad
      ctx.beginPath()
      this._roundRect(ctx, btnX, btnY_f, btnW, btnH_f, 25 * dpr)
      ctx.fill()

      ctx.font = `bold ${20 * dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.fillText('继续冒险', w / 2, btnY_f + btnH_f / 2)
    } else {
      const dots = '.'.repeat(Math.floor(this.time * 2) % 4)
      ctx.font = `${16 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
      ctx.fillText(`${dots}`, w / 2, h * 0.92)
    }
  }

  proto._handlePurifyTap = function(tx, ty) {
    if ((this.purifyStep || 0) >= 2) {
      const w = this.width
      const h = this.height
      const dpr = this.dpr

      const btnW = 180 * dpr
      const btnH = 50 * dpr
      const btnX = (w - btnW) / 2
      const btnY = h * 0.92

      if (this._isInRect(tx, ty, btnX, btnY, btnW, btnH)) {
        this.game.data.set('battleVictory', true)

        if (this.monsterId) {
          this.game.data.set('currentBattleMonsterId', this.monsterId)
        }

        if (this.enemy.isAmy) {
          const unlocked = charStateManager.unlockCharacter('amy')
          if (unlocked) this._addLog(`✨ 艾米成功加入队伍！`)
        } else if (this.enemy.isAnnie) {
          const unlocked = charStateManager.unlockCharacter('annie')
          if (unlocked) this._addLog(`✨ 安妮成功加入队伍！`)
        }

        const bossFlag = `${this.nodeId}_${this.enemy.id}_defeated`
        this.game.data.addFlag(bossFlag)

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

        const charData = charStateManager.serialize()
        this.game.data.set('characterStates', charData)

        this.game.changeScene('field', { nodeId: this.nodeId })
      }
    }
  }

  // ======== 队长模式：按钮点击处理 ========
  proto._handleCaptainTap = function(tx, ty) {
    // 检测普攻按钮
    if (this._attackBtn && this._isInCircle(tx, ty, this._attackBtn.x, this._attackBtn.y, this._attackBtn.radius)) {
      this._captainManualAttack()
      return true
    }

    // 检测技能按钮
    for (let i = 0; i < this._skillBtns.length; i++) {
      const btn = this._skillBtns[i]
      if (!btn.disabled && this._isInCircle(tx, ty, btn.x, btn.y, btn.radius)) {
        this._captainManualSkill(i)
        return true
      }
    }

    // 检测角色切换按钮
    for (const sw of this._switchBtns) {
      if (this._isInRect(tx, ty, sw.x, sw.y, sw.w, sw.h)) {
        this._switchCaptainHero(sw.hero)
        return true
      }
    }

    return false
  }

  proto._switchCaptainHero = function(hero) {
    if (!hero || hero.hp <= 0) return
    if (hero.id === this._controlledHero?.id) return
    if (this.attackingHero?.id === hero.id) return

    // 清除旧操控角色的自动攻击计时
    this._attackBtnAutoTimer = 0

    this._controlledHero = hero
    this._refreshSkillButtons()
    this._refreshSwitchButtons()
    this._addLog(`🎮 切换控制 → ${hero.name}`)
  }

  // ======== 队长模式：触摸事件（摇杆） ========
  proto._initCaptainInput = function() {
    if (!this._captainMode) {
      console.log('[Input] _captainMode 未启用，跳过触摸事件绑定')
      return
    }
    
    console.log('[Input] 开始绑定触摸事件, _captainMode=', this._captainMode)
    console.log('[Input] _joystickConfig:', JSON.stringify(this._joystickConfig))
    console.log('[Input] 当前环境:', typeof wx !== 'undefined' ? '微信小游戏' : '浏览器')
    console.log('[Input] wx.onTouchStart 是否存在:', typeof wx !== 'undefined' ? typeof wx.onTouchStart : 'N/A')
    
    // ★ 测试：添加一个全屏触摸监听器，验证触摸事件是否工作
    this._testTouchHandler = (e) => {
      console.log('[Input] 全屏触摸测试：', e.touches ? e.touches.length : 'N/A', '个触摸点')
    }
    if (typeof wx !== 'undefined' && wx.onTouchStart) {
      wx.onTouchStart(this._testTouchHandler)
      console.log('[Input] 全屏触摸测试监听器已绑定（wx.onTouchStart）')
    }

    this._onCaptainTouchStart = (e) => {
      console.log('[Input] 触摸开始事件触发！touches数量=', e.touches ? e.touches.length : 0)
      
      if (!e.touches || !this._joystickConfig) {
        console.log('[Input] 触摸事件被忽略：touches=', e.touches, ', _joystickConfig=', this._joystickConfig)
        return
      }

      for (const t of e.touches) {
        const tx = t.clientX * this.dpr
        const ty = t.clientY * this.dpr

        console.log(`[Input] 触摸点：(${tx}, ${ty}), 摇杆中心=(${this._joystickConfig.centerX}, ${this._joystickConfig.centerY})`)

        // ★ 优先检测按钮区域（普攻/技能/切换角色）
        if (this._handleCaptainTap(tx, ty)) return

        // 检测摇杆区域
        if (!this._joystick.active) {
          const dx = tx - this._joystickConfig.centerX
          const dy = ty - this._joystickConfig.centerY
          if (Math.sqrt(dx * dx + dy * dy) < this._joystickConfig.baseRadius * 1.5) {
            this._joystick.active = true
            this._joystick.touchId = t.identifier
            this._joystick.currentX = tx
            this._joystick.currentY = ty
          }
        }
      }
    }

    this._onCaptainTouchMove = (e) => {
      if (this._joystick.active && e.touches) {
        for (const t of e.touches) {
          if (t.identifier === this._joystick.touchId) {
            this._joystick.currentX = t.clientX * this.dpr
            this._joystick.currentY = t.clientY * this.dpr
            break
          }
        }
      }
    }

    this._onCaptainTouchEnd = (e) => {
      if (this._joystick.active && e.changedTouches) {
        for (const t of e.changedTouches) {
          if (t.identifier === this._joystick.touchId) {
            this._joystick.active = false
            this._joystick.touchId = null
            this._attackBtnAutoTimer = 0  // 重置自动攻击计时
            break
          }
        }
      }
    }

    // ★ 微信小游戏环境：直接使用 wx API
    if (typeof wx !== 'undefined') {
      console.log('[Input] 使用 wx.onTouchStart 绑定触摸事件')
      wx.onTouchStart(this._onCaptainTouchStart)
      wx.onTouchMove(this._onCaptainTouchMove)
      wx.onTouchEnd(this._onCaptainTouchEnd)
      console.log('[Input] 触摸事件绑定完成（wx API）')
    } else {
      // 浏览器环境：使用 game.input
      console.log('[Input] 使用 game.input 绑定触摸事件')
      this.game.input.onStart(this._onCaptainTouchStart)
      this.game.input.onMove(this._onCaptainTouchMove)
      this.game.input.onEnd(this._onCaptainTouchEnd)
      console.log('[Input] 触摸事件绑定完成（game.input）')
    }
  }

  proto._cleanupCaptainInput = function() {
    // ★ 兼容浏览器和微信小游戏环境
    if (this._onCaptainTouchStart) {
      if (typeof wx !== 'undefined' && wx.offTouchStart) {
        wx.offTouchStart(this._onCaptainTouchStart)
      } else {
        this.game.input.offStart(this._onCaptainTouchStart)
      }
    }
    if (this._onCaptainTouchMove) this.game.input.offMove(this._onCaptainTouchMove)
    if (this._onCaptainTouchEnd) this.game.input.offEnd(this._onCaptainTouchEnd)
  }
}
