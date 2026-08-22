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
      // ★ 修复：英雄只有 matk（无 magic 字段），旧代码读 hero.magic → NaN 污染 HP
      const matk = hero.matk || hero.atk || 0
      const healAmount = Math.floor((skill.power || 0) + matk * (skill.healMatk != null ? skill.healMatk : 1))
      healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount)
      const hAnimState = this.heroAnimStates && this.heroAnimStates[hero.id]
      if (hAnimState) { hAnimState.state = 'support'; hAnimState.frame = 0; hAnimState.frameTimer = 0 }
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
      console.log('[Input] _captainMode 未启用，跳过输入初始化')
      return
    }

    // ★ 输入统一走 Game 的 InputManager（this.game.input），与 field-scene 同一可靠路径。
    // ★ 不再自行绑定 wx.onTouchStart，避免与全局输入管理器冲突导致点击无响应。
    // ★ 每帧在 update() 中调用 _updateCaptainTouch() 读取 touches / consumeTap。

    const cfg = this._joystickConfig
    this._joystick = {
      active: false,
      originX: cfg.centerX,
      originY: cfg.centerY,
      currentX: cfg.centerX,
      currentY: cfg.centerY,
      dirX: 0,
      dirY: 0,
      magnitude: 0,
      _touchId: null,
    }
    if (this._attackBtn) this._attackBtn.pressed = false
    if (this._skillBtns) this._skillBtns.forEach(b => { b.pressed = false })
    console.log('[Input] 队长模式输入已就绪（统一 InputManager 派发）')
  }

  // ======== 每帧输入更新（王者荣耀式：左下摇杆 + 右下技能键）========
  // ★ 统一从 Game 的 InputManager 读取 touches / tap，与 field-scene 同一坐标体系
  proto._updateCaptainTouch = function(dt) {
    if (!this._captainMode || !this.game || !this.game.input) return
    const input = this.game.input
    const cfg = this._joystickConfig
    const joy = this._joystick
    if (!cfg || !joy) return

    // ---------- 1) 摇杆：读取当前活动触摸点 ----------
    // InputManager.touches 是按 identifier 索引的对象 { id: {x,y} }，坐标为画布像素(已乘dpr)
    const touchEntries = (input.touches && typeof input.touches === 'object')
      ? Object.entries(input.touches).map(([id, p]) => ({ id: Number(id), x: p.x, y: p.y }))
      : []

    if (!joy.active) {
      // 寻找落在摇杆底盘内的触点
      for (const tp of touchEntries) {
        const dx = tp.x - cfg.centerX
        const dy = tp.y - cfg.centerY
        if (Math.sqrt(dx * dx + dy * dy) < cfg.baseRadius * 1.8) {
          joy.active = true
          joy._touchId = tp.id
          joy.originX = cfg.centerX
          joy.originY = cfg.centerY
          joy.currentX = tp.x
          joy.currentY = tp.y
          break
        }
      }
    }

    if (joy.active) {
      // 找到锁定的触点
      const tp = touchEntries.find(p => p.id === joy._touchId)
      if (tp) {
        joy.currentX = tp.x
        joy.currentY = tp.y
      } else {
        // 触点已松开 → 停止摇杆
        joy.active = false
        joy._touchId = null
        joy.dirX = 0
        joy.dirY = 0
        joy.magnitude = 0
      }
    }

    // 计算摇杆方向向量（手柄相对底盘中心，限制最大偏移）
    if (joy.active) {
      let dx = joy.currentX - joy.originX
      let dy = joy.currentY - joy.originY
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const maxOff = cfg.maxOffset
      const clamped = Math.min(dist, maxOff)
      joy.magnitude = clamped / maxOff
      joy.dirX = dx / dist
      joy.dirY = dy / dist
      // 死区
      if (clamped < cfg.deadZone) {
        joy.dirX = 0
        joy.dirY = 0
        joy.magnitude = 0
      }
    } else {
      joy.dirX = 0
      joy.dirY = 0
      joy.magnitude = 0
    }

    // ---------- 2) 驱动操控角色移动（MOBA 拖动移动）----------
    this._applyJoystickToHero(dt)

    // ---------- 3) 点击：消费 tap 触发按钮（普攻/技能/切换）----------
    const tap = input.consumeTap && input.consumeTap()
    if (tap) {
      // 摇杆区域内的点击不视为按钮点击
      const jdx = tap.x - cfg.centerX
      const jdy = tap.y - cfg.centerY
      if (!(joy.active && Math.sqrt(jdx * jdx + jdy * jdy) < cfg.baseRadius * 1.8)) {
        this._handleCaptainTap(tap.x, tap.y)
      }
    }
  }

  // 将摇杆方向应用到操控英雄（实时移动，王者荣耀手感）
  proto._applyJoystickToHero = function(dt) {
    const joy = this._joystick
    const hero = this._controlledHero
    if (!joy || !hero || joy.magnitude <= 0) {
      // 停止移动
      const st = hero ? this.unitStates[hero.id] : null
      if (st && st._joystickMoving) {
        st._joystickMoving = false
        st._captainMoveDir = 0
      }
      return
    }
    const st = this.unitStates[hero.id]
    if (!st) return

    const speed = this._getMoveSpeed(hero) * 1.25 * dt
    st.x += joy.dirX * speed
    st.y += joy.dirY * speed
    st._joystickMoving = true
    st._captainMoveDir = joy.dirX * this.dpr   // 记录朝向（用于攻击方向判定）
    st.state = 'moving_to_attack'  // 复用移动动画
    this._clampToBattlefield(st)
    if (this.heroPositions && this.heroPositions[hero.id]) {
      this.heroPositions[hero.id].x = st.x
      this.heroPositions[hero.id].y = st.y
    }
  }

  proto._cleanupCaptainInput = function() {
    // 输入统一由 Game 的 InputManager 管理，场景无需自行解绑。
    this._joystick = this._joystick || {}
    this._joystick.active = false
    this._joystick._touchId = null
  }
}
