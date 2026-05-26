/**
 * battle-renderer.js - 完整渲染系统
 * 职责：所有绘制操作——背景、围栏、精灵、UI、血条、日志、按钮、结束画面
 *
 * 从 battle-scene.js 提取：
 * - render() 主入口
 * - 围栏绘制
 * - _buildBattleEntities
 * - _renderBattleHeroSprite / _renderEnemyUI / _drawEnemySprite
 * - _renderEnemySprites (legacy)
 * - _renderAutoBattleUI / _renderFleeButton
 * - _renderBattleLog / _renderTurnInfo / _renderEndScreen
 * - 伤害数字渲染 / 状态效果图标
 * - _renderBurnDamage / _renderStatusEffect
 * - _drawBar / _roundRect
 */

import { RARITY_CONFIG, EQUIP_TYPE_CONFIG } from '../../data/equipment.js'
import { HERO_SPRITE_SIZE_BASE } from './battle-assets.js'

export function installBattleRenderer(BattleSceneClass) {
  const proto = BattleSceneClass.prototype

  // ======== 基础绘制工具 ========
  proto._roundRect = function(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  proto._drawBar = function(ctx, x, y, w, h, ratio, color, text, delayRatio) {
    // ★ NaN 防御：delayRatio 可能是 NaN（enemyHpDelay 未正确初始化时），导致血条永远不显示
    let raw = (delayRatio !== undefined && !Number.isNaN(delayRatio)) ? delayRatio : ratio
    if (Number.isNaN(raw)) raw = ratio || 0
    const actualRatio = Math.min(1, Math.max(0, raw))
    const pad = 1.5
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    this._roundRect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 3)
    ctx.fill()
    // 前景
    if (actualRatio > 0.005) {
      ctx.fillStyle = color
      this._roundRect(ctx, x, y, w * actualRatio, h)
      ctx.fill()
    }
    // 文字
    if (text) {
      ctx.font = `bold 9px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, x + w / 2, y + h / 2)
    }
  }

  // ======== 战场地面渲染（替换丑陋围栏） ========
  proto._renderBattleField = function(ctx) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr
    
    // 战场区域定义（原来围栏内的区域）
    const margin = 30 * dpr
    const topY = 20 * dpr
    const bottomY = h * 0.82
    const leftX = margin
    const rightX = w - margin
    
    // 地面渐变（从下到上，模拟光照）
    const groundGrad = ctx.createLinearGradient(0, topY, 0, bottomY)
    groundGrad.addColorStop(0, 'rgba(45, 80, 60, 0.15)')
    groundGrad.addColorStop(1, 'rgba(30, 55, 40, 0.25)')
    ctx.fillStyle = groundGrad
    ctx.fillRect(leftX, topY, rightX - leftX, bottomY - topY)
    
    // 主题边框（简约线条，替代围栏）
    ctx.strokeStyle = 'rgba(100, 180, 120, 0.2)'
    ctx.lineWidth = 2 * dpr
    ctx.strokeRect(leftX, topY, rightX - leftX, bottomY - topY)
    
    // 四角装饰（猫爪印风格）
    const cornerSize = 8 * dpr
    const corners = [
      [leftX + 10 * dpr, topY + 10 * dpr],
      [rightX - 10 * dpr, topY + 10 * dpr],
      [leftX + 10 * dpr, bottomY - 10 * dpr],
      [rightX - 10 * dpr, bottomY - 10 * dpr]
    ]
    
    corners.forEach(([cx, cy]) => {
      // 简单的爪印标记
      ctx.fillStyle = 'rgba(100, 180, 120, 0.3)'
      ctx.beginPath()
      ctx.arc(cx, cy, cornerSize, 0, Math.PI * 2)
      ctx.fill()
    })
    
    // 中线（可选，帮助视觉分割）
    ctx.strokeStyle = 'rgba(100, 180, 120, 0.08)'
    ctx.lineWidth = 1 * dpr
    ctx.setLineDash([5 * dpr, 10 * dpr])
    ctx.beginPath()
    ctx.moveTo(w * 0.5, topY)
    ctx.lineTo(w * 0.5, bottomY)
    ctx.stroke()
    ctx.setLineDash([])  // 重置虚线
  }

  // ======== 红色预警区域（跳跃攻击） ========
  proto._renderJumpAttackWarning = function(ctx) {
    if (!this._jumpAttackWarning || !this._jumpAttackWarning.active) return
    
    const warning = this._jumpAttackWarning
    const dpr = this.dpr
    
    // ★ 防御：确保半径不为负数
    const radius = Math.max(0, Math.abs(warning.radius || 0))
    if (warning.radius < 0) {
      console.warn(`[JumpAttack] 警告：半径为负数，已自动修正：${warning.radius} → ${radius}`)
      warning.radius = radius  // 修正为负数半径
    }
    
    if (warning.phase === 'warning') {
      // ★ 预警阶段：红色半透明圆圈 + 脉动效果
      const elapsed = Date.now() - warning.startTime
      const progress = Math.min(1, elapsed / warning.duration)
      
      // 脉动效果（0.5 -> 1.0 -> 0.5）
      const pulse = 0.7 + 0.3 * Math.sin(progress * Math.PI * 4)
      
      // ★ 防御：确保半径不为负数
      const safeRadiusWarning = Math.max(0, radius)
      const pulsedRadius = Math.max(0, safeRadiusWarning * pulse)
      
      // 红色半透明填充
      ctx.fillStyle = `rgba(255, 50, 50, ${0.2 + 0.1 * pulse})`
      ctx.beginPath()
      ctx.arc(warning.targetX, warning.targetY, pulsedRadius, 0, Math.PI * 2)
      ctx.fill()
      
      // 红色边框（脉动）
      ctx.strokeStyle = `rgba(255, 50, 50, ${0.6 + 0.4 * pulse})`
      ctx.lineWidth = 3 * dpr * pulse
      ctx.beginPath()
      ctx.arc(warning.targetX, warning.targetY, pulsedRadius, 0, Math.PI * 2)
      ctx.stroke()
      
      // 警告文字
      ctx.font = `bold ${14 * dpr}px sans-serif`
      ctx.fillStyle = `rgba(255, 50, 50, ${0.8 + 0.2 * Math.sin(progress * Math.PI * 8)})`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⚠️ 快躲开！', warning.targetX, warning.targetY - radius - 20 * dpr)
      
      } else if (warning.phase === 'jumping') {
      // ★ 跳跃阶段：显示敌人跳跃轨迹（可选）
      const jumpProgress = Math.min(1, (Date.now() - warning.jumpStartTime) / warning.jumpDuration)
      
      // 绘制跳跃轨迹线
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)'
      ctx.lineWidth = 2 * dpr
      ctx.setLineDash([5 * dpr, 5 * dpr])
      ctx.beginPath()
      ctx.moveTo(warning.jumpStartX, warning.jumpStartY)
      
      // 贝塞尔曲线模拟跳跃弧线
      const cpX = (warning.jumpStartX + warning.jumpTargetX) / 2
      const cpY = Math.min(warning.jumpStartY, warning.jumpTargetY) - 50 * dpr
      ctx.quadraticCurveTo(cpX, cpY, warning.jumpTargetX, warning.jumpTargetY)
      ctx.stroke()
      ctx.setLineDash([])
      
      // 目标位置红色光圈（持续显示）
      // ★ 防御：确保半径不为负数
      const safeRadiusJump = Math.max(0, radius)
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)'
      ctx.lineWidth = 4 * dpr
      ctx.beginPath()
      ctx.arc(warning.jumpTargetX, warning.jumpTargetY, safeRadiusJump, 0, Math.PI * 2)
      ctx.stroke()
      
    } else if (warning.phase === 'damaging') {
      // ★ 伤害阶段：红色爆炸效果
      const damageProgress = Math.min(1, (Date.now() - warning.jumpStartTime - warning.jumpDuration) / 500)
      
      // ★ 防御：确保半径不为负数（双重保护）
      const safeRadius = Math.max(0, radius)
      const explodeRadius = Math.max(0, safeRadius * (1 + damageProgress))
      const fillRadius = Math.max(0, safeRadius * (1 + damageProgress * 0.5))
      
      // 爆炸光圈
      ctx.strokeStyle = `rgba(255, 100, 0, ${1 - damageProgress})`
      ctx.lineWidth = 6 * dpr * (1 - damageProgress)
      ctx.beginPath()
      ctx.arc(warning.targetX, warning.targetY, explodeRadius, 0, Math.PI * 2)
      ctx.stroke()
      
      // 爆炸填充
      ctx.fillStyle = `rgba(255, 50, 0, ${(1 - damageProgress) * 0.3})`
      ctx.beginPath()
      ctx.arc(warning.targetX, warning.targetY, fillRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ======== 治愈冲击粒子特效渲染 ========
  proto._renderHealingImpactParticles = function(ctx) {
    if (!this._healingImpact || !this._healingImpact.active) return
    const impact = this._healingImpact
    const dpr = this.dpr

    // 渲染所有粒子
    impact.particles.forEach(p => {
      if (p.alpha <= 0) return
      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })

    // ★ 渲染红色区域（锁定和冲击阶段）
    if (impact.phase === 'locking' || impact.phase === 'rushing') {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.01)  // 脉动效果
      const radius = impact.redZoneRadius * pulse

      // 红色半透明填充
      ctx.fillStyle = `rgba(255, 50, 50, ${0.2 + 0.1 * pulse})`
      ctx.beginPath()
      ctx.arc(impact.redZoneX, impact.redZoneY, radius, 0, Math.PI * 2)
      ctx.fill()

      // 红色边框
      ctx.strokeStyle = `rgba(255, 50, 50, ${0.6 + 0.4 * pulse})`
      ctx.lineWidth = 3 * dpr * pulse
      ctx.beginPath()
      ctx.arc(impact.redZoneX, impact.redZoneY, radius, 0, Math.PI * 2)
      ctx.stroke()

      // 警告文字
      ctx.font = `bold ${14 * dpr}px sans-serif`
      ctx.fillStyle = `rgba(255, 50, 50, ${0.8 + 0.2 * Math.sin(Date.now() * 0.02)})`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⚠️ 快躲开！', impact.redZoneX, impact.redZoneY - radius - 20 * dpr)
    }
  }

  // ======== 顶部信息栏 ========
  proto._renderTopBar = function(ctx) {
    const w = this.width
    const dpr = this.dpr
    const barH = 44 * dpr
    
    // 背景
    const bgGrad = ctx.createLinearGradient(0, 0, 0, barH)
    bgGrad.addColorStop(0, 'rgba(20, 25, 35, 0.92)')
    bgGrad.addColorStop(1, 'rgba(15, 20, 30, 0.85)')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, barH)
    
    // 底部边框线
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)'
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    ctx.moveTo(0, barH)
    ctx.lineTo(w, barH)
    ctx.stroke()
    
    // 左侧：关卡信息
    ctx.font = `bold ${13 * dpr}px sans-serif`
    ctx.fillStyle = '#64B5F6'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    // ★ 修复：确保 nodeId 是有效数字
    let stageName = '战斗'
    if (this.nodeId && !isNaN(this.nodeId)) {
      stageName = `第${this.nodeId}章`
    } else if (this.nodeId) {
      stageName = String(this.nodeId)
    }
    ctx.fillText(stageName, 12 * dpr, barH * 0.5)
    
    // 中间：回合数
    ctx.font = `bold ${12 * dpr}px monospace`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.textAlign = 'center'
    ctx.fillText(`TURN ${this.turn}`, w * 0.5, barH * 0.5)
    
    // 右侧：金币/暂停/加速按钮（由 _renderAutoBattleUI 处理）
  }

  // ======== render 主入口 ========
  proto.render = function(ctx) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr

    // ★ 使用程序化背景生成器
    this._renderBattleBackground(ctx)

    // 屏幕震动
    if (this.shakeAmount > 0) {
      ctx.save()
      ctx.translate(
        (Math.random() - 0.5) * this.shakeAmount,
        (Math.random() - 0.5) * this.shakeAmount
      )
    }

    // ★ 移除丑陋围栏，替换为洁净的战斗场地
    this._renderBattleField(ctx)

    // ★ 红色预警区域（跳跃攻击）
    this._renderJumpAttackWarning(ctx)

    // ★ 治愈冲击粒子特效和红色区域
    this._renderHealingImpactParticles(ctx)

    // 顶部信息栏
    this._renderTopBar(ctx)

    // 敌人UI（名字+血条）
    if (!this.enemyAttacking) {
      this._renderEnemyUI(ctx)
    }

    // 引擎排序渲染
    this._buildBattleEntities()
    this._renderEngine.render(ctx)

    // ★ 闪白效果渲染（Flash White）
    this._renderFlashWhite(ctx)

    // 攻击中角色
    this._renderAttackingHero(ctx)

    // 自动战斗UI
    if (this.phase === 'auto_battle' || this.phase === 'animating') {
      this._renderAutoBattleUI(ctx)
      this._renderFleeButton(ctx)
    }

    // 战斗日志
    this._renderBattleLog(ctx)

    // 代码特效
    this._renderCodeEffects(ctx)

    // 伤害数字
    if (this.damageTexts && Array.isArray(this.damageTexts)) {
      for (let i = this.damageTexts.length - 1; i >= 0; i--) {
        const dt = this.damageTexts[i]
        if (dt.type === 'burn') {
          this._renderBurnDamage(ctx, dt, dpr)
        } else if (dt.type === 'burn_effect') {
          this._renderStatusEffect(ctx, dt, dpr, 'burn')
        } else if (dt.type === 'freeze_effect') {
          this._renderStatusEffect(ctx, dt, dpr, 'freeze')
        } else {
          // 增强的伤害数字渲染：支持缩放和透明度
          const isCrit = dt.isCrit || false
          const fontSize = isCrit ? 38 : 28
          const scale = dt._scale || 1.0
          const alpha = dt._alpha !== undefined ? dt._alpha : 1.0
          
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.font = `bold ${Math.floor(fontSize * scale) * dpr}px sans-serif`
          ctx.fillStyle = dt.color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          
          // 描边效果
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.lineWidth = (isCrit ? 3 : 2) * dpr
          ctx.strokeText(dt.text, dt.x, dt.y)
          ctx.fillText(dt.text, dt.x, dt.y)
          
          ctx.restore()
        }
      }
    }

    // 闪光
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`
      ctx.fillRect(0, 0, w, h)
    }

    // 回合信息
    this._renderTurnInfo(ctx)

    // 底部操作区背景（在自动战斗或动画阶段显示）
    if (this.phase === 'auto_battle' || this.phase === 'animating') {
      this._renderBottomBar(ctx)
    }

    // ★ 队长模式 UI（摇杆 + 攻击/技能按钮 + 角色切换条）
    if (this._captainMode && (this.phase === 'auto_battle' || this.phase === 'animating')) {
      this._renderJoystick(ctx)
      this._renderAttackButton(ctx)
      this._renderSkillButtons(ctx)
      this._renderCaptainSwitchBar(ctx)
    }

    if (this.shakeAmount > 0) {
      ctx.restore()
    }

    // 结束画面
    if (this.phase === 'victory') {
      this._renderEndScreen(ctx, '🎉 胜利！', '#2ed573', '点击继续')
    } else if (this.phase === 'defeat') {
      this._renderEndScreen(ctx, '💔 战败...', '#ff4757', '点击返回')
    } else if (this.phase === 'purify') {
      this._renderPurifyScene(ctx)
    }
  }

  // ======== 围栏绘制（已废弃，由 _renderBattleField 替代）========

  // ======== 引擎实体构建 ========
  proto._buildBattleEntities = function() {
    const engine = this._renderEngine
    const dpr = this.dpr
    engine.clear()

    const self = this

    // 添加敌人精灵
    if (!this.enemyAttacking || !this.enemyAttackAnim) {
      for (let i = 0; i < this.enemies.length; i++) {
        const enemy = this.enemies[i]
        const pos = this.enemyPositions?.[i]
        if (!pos) continue

        const deathAnim = this.enemyDeathAnim[i]
        const isDead = enemy.hp <= 0
        if (isDead && (!deathAnim || deathAnim.alpha <= 0)) continue

        const estate = this.unitStates['enemy_' + i]
        const sortY = (estate ? estate.y + (estate.footOffsetY || 0) : pos.y + 16 * dpr) / dpr

        engine.addEntity({
          layer: 2,
          sortY,
          type: 'battle_enemy',
          _enemy: enemy,
          _index: i,
          _pos: pos,
          _deathAnim: deathAnim,
          _isDead: isDead,
          render(ctx, e) {
            const { index: realIndex, _enemy: enemyData, _pos: posData, _deathAnim: isDeathAnim } = e
            if (isDeathAnim && isDeathAnim.alpha > 0) {
              ctx.globalAlpha = isDeathAnim.alpha
            }
            self._drawEnemySprite(ctx, posData.x, posData.y, enemyData)
            ctx.globalAlpha = 1.0

            const eState = self.unitStates['enemy_' + realIndex]
            if (eState && eState.state === 'fleeing') {
              const panicY = posData.y - 30 * dpr
              const shake = Math.sin(self.battleTime * 15) * 2 * dpr
              const panicAlpha = 0.6 + Math.sin(self.battleTime * 8) * 0.4
              ctx.globalAlpha = panicAlpha
              ctx.fillStyle = '#FF4444'
              ctx.font = `bold ${16 * dpr}px sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText('!', posData.x + shake, panicY)
              ctx.font = `${10 * dpr}px sans-serif`
              ctx.fillText('逃跑', posData.x + shake, panicY - 14 * dpr)
              ctx.globalAlpha = 1.0
            }

          }
        })
      }
    } else {
      engine.addEntity({
        layer: 3,
        sortY: 9999,
        type: 'attacking_enemy',
        render(ctx) { self._renderAttackingEnemy(ctx) }
      })
    }

    // 添加己方角色
    for (const area of this.heroAreas) {
      const hero = area.hero
      if (!hero) continue
      if (this.attackingHero === hero && this.attackAnim) continue

      const uState = this.unitStates[hero.id]
      const isInBattlePhase = (this.phase === 'auto_battle' || this.phase === 'animating')
      const isOnBattlefield = isInBattlePhase && uState
      if (!isOnBattlefield) continue

      const spriteSize = HERO_SPRITE_SIZE_BASE * dpr
      const bx = uState.x
      const by = uState.y
      const sortY = (by + (uState.footOffsetY || 0)) / dpr
      const isAttacking = this.activeAttackers.has(hero.id)

      engine.addEntity({
        layer: 2,
        sortY,
        type: 'battle_hero',
        _hero: hero,
        _uState: uState,
        _bx: bx,
        _by: by,
        _spriteSize: spriteSize,
        _isAttacking: isAttacking,
        render(ctx, e) { self._renderBattleHeroSprite(ctx, e) }
      })
    }
  }

  // ======== 闪白效果渲染（Flash White）========
  proto._renderFlashWhite = function(ctx) {
    if (!this._flashWhiteTargets) return
    
    const dpr = this.dpr
    const now = this.time || 0
    
    // 遍历所有正在闪白的目标
    Object.keys(this._flashWhiteTargets).forEach(targetId => {
      const flash = this._flashWhiteTargets[targetId]
      if (!flash) return
      
      // 计算闪白进度（0 -> 1）
      const progress = flash.timer / flash.duration
      if (progress >= 1) return // 闪白已结束
      
      // 闪白强度：开始时最强（白色），然后衰减
      const intensity = 1 - progress
      const alpha = intensity * 0.8 // 最大80%透明度
      
      // 根据targetId找到对应的单位位置
      let x, y, size
      
      if (targetId.startsWith('enemy_')) {
        // 敌人
        const idx = parseInt(targetId.split('_')[1])
        if (this.enemyPositions && this.enemyPositions[idx]) {
          x = this.enemyPositions[idx].x
          y = this.enemyPositions[idx].y
          const enemy = this.enemies[idx]
          size = enemy && enemy.isBoss ? 65 * dpr : 36 * dpr
        }
      } else {
        // 英雄
        const hero = this.party.find(h => h.id === targetId)
        const heroIndex = this.party.indexOf(hero)
        if (heroIndex >= 0 && this.heroBasePositions[heroIndex]) {
          x = this.heroBasePositions[heroIndex].x
          y = this.heroBasePositions[heroIndex].y
          size = 40 * dpr
        }
      }
      
      if (x !== undefined && y !== undefined) {
        // 绘制白色闪光矩形（覆盖整个单位）
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(x, y, (size || 40 * dpr) * 0.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    })
  }

  // ======== 角色精灵渲染 ========
  proto._renderBattleHeroSprite = function(ctx, entity) {
    const hero = entity._hero
    if (!hero || !hero.id) return  // 防御：无效角色数据跳过
    const uState = entity._uState
    let bx = entity._bx
    const by = entity._by
    const dpr = this.dpr
    const spriteSize = entity._spriteSize
    const isAttacking = entity._isAttacking
    const isDead = hero.hp <= 0

    // ★ 跳跃攻击期间：基地址显示半透明残影（角色已跳跃到目标位置）
    let baseAlpha = 1.0
    if (!isDead && this.attackingHero === hero && this.attackAnim && 
        this.attackAnim.phase === 'jump') {
      baseAlpha = 0.25  // 残影：25%透明度
    }

    if (!this.heroDeadAlpha) this.heroDeadAlpha = {}
    const deadAlpha = this.heroDeadAlpha[hero.id] ??= isDead ? 1 : 1
    if (isDead && deadAlpha > 0) {
      this.heroDeadAlpha[hero.id] = Math.max(0, deadAlpha - 0.02)
    }
    // ★ 应用残影透明度（跳跃攻击期间基地址变半透明）
    const baseFade = (typeof baseAlpha === 'number') ? baseAlpha : 1.0
    const alpha = (isDead ? deadAlpha : 1) * baseFade
    if (alpha <= 0) return

    ctx.save()
    ctx.globalAlpha = alpha

    const hAnimState = this.heroAnimStates[hero.id]
    const drawX = bx
    const drawY = by

    // 获取角色图片（cast/shield/buff 优先，普通状态走 shared 解析）
    const isSpecialAnim = hAnimState && (hAnimState._isCastingSkill || hAnimState.state === 'cast' || hAnimState.state === 'shield' || hAnimState.state === 'buff')
    let heroImg = null
    if (isSpecialAnim) {
      // ★★★ 李小宝 cast：精灵表模式（绘制时9参数裁切，不用离屏canvas）★★★
      if ((hAnimState._isCastingSkill || hAnimState.state === 'cast') && hero.id === 'lixiaobao') {
        const sheet = this.game.assets.get('LIXIAOBAO_CAST_SPRITESHEET')
        if (sheet) {
          const totalFrames = 8  // cast_universal.png: 8帧横排（2026-05-07新版去背）
          const frameW = Math.floor(sheet.width / totalFrames)
          const frameH = sheet.height
          const frameIdx = Math.min(hAnimState.frame || 0, totalFrames - 1)
          heroImg = {
            _isSpriteSheet: true,
            _sheet: sheet,
            _frameX: frameIdx * frameW,
            _frameY: 0,
            _frameW: frameW,
            _frameH: frameH,
            width: frameW,
            height: frameH,
          }
        }
      }

      // ★ shield / buff 动画：直接用帧号拼 key
      if (!heroImg && (hAnimState.state === 'shield' || hAnimState.state === 'buff')) {
        const action = hAnimState.state.toUpperCase()
        const frameKey = `HERO_${hero.id.toUpperCase()}_${action}_${String((hAnimState.frame || 0) + 1).padStart(2, '0')}`
        heroImg = this.game.assets.get(frameKey)
        if (!heroImg) heroImg = this.game.assets.get(this._getHeroImageKey(hero.id))
      }
      // cast 特效（命中图优先 effect，effect 播完兜底 asset）
      if (!heroImg && this.lastCastEffectType && this.lastCastEffectType[hero.id]) {
        const castType = this.lastCastEffectType[hero.id]
        const frameInfo = this.game.effects.getCurrentFrame(castType)
        if (frameInfo && frameInfo.image) {
          heroImg = frameInfo.image
        } else {
          // ★ effect 已播完，从 asset 直接读帧（4帧/秒，匹配施法节奏）
          const prefix = 'EFFECT_' + castType.replace('_cast', '').toUpperCase() + '_CAST'
          const total = 8
          const idx = Math.floor((this.time * 4) % total)
          const key = prefix + '_' + String(idx + 1).padStart(2, '0')
          heroImg = this.game.assets.get(key)
        }
      }
      if (!heroImg) heroImg = this.game.assets.get(this._getHeroImageKey(hero.id))
    } else {
      // 普通状态：统一走 shared 解析（与 animation.js 共用）
      heroImg = this._resolveHeroSpriteImage(hero, hAnimState)
    }

    if (heroImg) {
      const isInCombat = (uState.state === 'moving_to_attack' || uState.state === 'in_range' || uState.state === 'attacking')
      // ★ 队长模式方向：优先使用摇杆方向
      let facingRight
      if (uState._captainMoveDir !== undefined && Math.abs(uState._captainMoveDir) > 2 * dpr) {
        facingRight = uState._captainMoveDir > 0
      } else {
        facingRight = isInCombat || this.phase === 'auto_battle' || (uState.targetX !== null && uState.targetX > uState.x)
      }
      const heroFacesLeft = (hero.id === 'amy' || hero.id === 'annie' || hero.id === 'qianduoduo')
      const needsFlip = facingRight ? heroFacesLeft : !heroFacesLeft
      const heroScale = this._getHeroScale(hero.id)
      const baseSize = spriteSize * heroScale
      const isCastState = hAnimState && (hAnimState._isCastingSkill || hAnimState.state === 'cast')

      // ★ 攻击前冲偏移：朝面向方向平移
      const lungeOffsetX = 0

      // ★ 统一固定高度，和 idle 渲染大小完全一致
      // ★ buff/shield/cast 状态允许超出 baseSize，不被强制缩小
      const imgH = heroImg.height || 1
      const imgW = heroImg.width || 1
      const aspect = imgW / imgH
      const isBuffState = hAnimState && (hAnimState.state === 'buff' || hAnimState.state === 'shield' || hAnimState.state === 'cast')
      // buff/shield 用原图尺寸（或至少不低于 baseSize），其他状态固定高度
      const drawH = (isBuffState && imgH > baseSize) ? Math.min(imgH, baseSize * 2.5) : baseSize
      const drawW = drawH * aspect

      // ★ 浮动效果已移除（角色位置固定）
      const floatY = 0

      ctx.save()
      
      // ★ 绘制角色阴影（在角色绘制之前，这样阴影在角色下面）
      if (alpha > 0 && !isDead) {
        ctx.save()
        ctx.globalAlpha = alpha * 0.6 // 阴影透明度
        ctx.fillStyle = 'rgba(0, 0, 0, 1)' // 颜色由 globalAlpha 控制
        const shadowWidth = drawW * 1.0 // 阴影宽度（与角色同宽）
        const shadowHeight = drawH * 0.2 // 阴影高度
        ctx.beginPath()
        ctx.ellipse(drawX, drawY, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      
      // ★ 辅助函数：绘制图片（支持精灵表9参数裁切）
      const _drawImg = function(img, dx, dy, dw, dh) {
        if (img && img._isSpriteSheet) {
          ctx.drawImage(img._sheet,
            img._frameX, img._frameY, img._frameW, img._frameH,
            dx, dy, dw, dh)
        } else if (img) {
          ctx.drawImage(img, dx, dy, dw, dh)
        }
      }
      if (needsFlip) {
        ctx.translate(drawX + lungeOffsetX, drawY + floatY)
        ctx.scale(-1, 1)
        _drawImg(heroImg, -drawW / 2, -drawH, drawW, drawH)
      } else {
        _drawImg(heroImg, drawX + lungeOffsetX - drawW / 2, drawY + floatY - drawH, drawW, drawH)
      }
      if (isAttacking && hAnimState && hAnimState.state === 'attack') {
        const attackProgress = hAnimState.frame / Math.max(hAnimState.totalSlashFrames || 8, 1)
        if (attackProgress < 0.5) {
          ctx.globalAlpha = 0.7 + Math.sin(attackProgress * Math.PI) * 0.3
        }
      }
      ctx.restore()
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'
    }

    // ★ 名字 + 等级 + BUFF标记 → 角色头顶（用 baseSize 定位，不受图片实际尺寸影响）
    const heroIndex = this.party.indexOf(hero)
    ctx.font = `bold ${11 * dpr}px sans-serif`
    ctx.fillStyle = isDead ? '#666' : (isAttacking ? '#FF9F43' : '#fff')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const levelText = hero.level ? `Lv.${hero.level}` : ''
    let buffTag = ''
    if (!isDead && heroIndex >= 0) {
      const heroEffects = this.statusEffects.heroes[heroIndex] || []
      if (heroEffects.some(e => e.type === 'atk_up' && (e.turnsRemaining > 0 || e.duration > 0))) buffTag += '↑'
      if (heroEffects.some(e => e.type === 'shield' && e.value > 0)) buffTag += '🛡'
    }
    const uiTopY = by - this._getHeroScale(hero.id) * spriteSize * 1.2
    ctx.fillText(`${hero.name} ${levelText}${buffTag}`, bx, uiTopY - 6 * dpr)

    // HP 条 → 角色头顶（名字下方）
    const hpRatio = Math.min(1, Math.max(0, hero.hp / hero.maxHp))
    const barW = spriteSize * 0.8
    const hpBarX = bx - barW / 2
    const hpBarY = uiTopY
    const hpBarH = 5 * dpr
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(hpBarX, hpBarY, barW, hpBarH)
    if (hpRatio > 0.001) {
      ctx.fillStyle = '#FF4757'
      ctx.fillRect(hpBarX, hpBarY, barW * hpRatio, hpBarH)
    }

    // ★ 护盾条（白条接在HP红条右侧，LOL风格）
    if (heroIndex >= 0) {
      const effects = this.statusEffects.heroes[heroIndex] || []
      const shield = effects.find(e => e.type === 'shield' && e.value > 0)
      if (shield) {
        const maxHp = hero.maxHp || 1
        const shieldRatio = Math.min(1, shield.value / maxHp)
        const shieldW = barW * shieldRatio
        const shieldBarH = hpBarH * 0.55  // 比血条略细
        const shieldBarY = hpBarY + (hpBarH - shieldBarH) / 2  // 居中于血条高度
        // 白条接在红色HP右侧
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
        ctx.fillRect(hpBarX + barW * hpRatio, shieldBarY, shieldW, shieldBarH)
      }
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

    ctx.restore()
  }

  // ======== 敌人UI渲染 ========
  proto._renderEnemyUI = function(ctx) {
    const dpr = this.dpr
    if (!this.enemyPositions || this.enemyPositions.length === 0) return

    this.enemies.forEach((enemy, index) => {
      // ★ 检查是否正在跳跃，如果是则使用插值位置
      let pos = this.enemyPositions[index]
      if (!pos) return

      const jumpingPos = this._getJumpingEnemyPosition ? this._getJumpingEnemyPosition(index) : null
      if (jumpingPos) {
        // 创建临时位置对象，不影响实际位置
        pos = { x: jumpingPos.x, y: jumpingPos.y }
      }

      const deathAnim = this.enemyDeathAnim[index]
      const isDead = enemy.hp <= 0
      if (isDead && (!deathAnim || deathAnim.alpha <= 0)) return

      if (isDead && deathAnim) ctx.globalAlpha = deathAnim.alpha

      const ex = pos.x
      const ey = pos.y

      // 目标选择提示
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

      // Boss 光环
      if (!isDead && enemy.isBoss) {
        const glowSize = 80 * dpr + Math.sin(this.time * 2) * 5 * dpr
        ctx.fillStyle = 'rgba(255, 71, 87, 0.15)'
        ctx.beginPath()
        ctx.arc(ex, ey, glowSize, 0, Math.PI * 2)
        ctx.fill()
      }

      // HP 血条（直接用 hp/maxHp 比例绘制，不再依赖复杂的延迟/分段系统）
      const rawMaxHp = enemy.maxHp || 100
      const rawHp = Math.min(rawMaxHp, Math.max(0, enemy.hp || 0))
      const hpRatio = rawMaxHp > 0 ? (rawHp / rawMaxHp) : 0

      // 颜色：根据血量百分比变化（绿→黄→红）
      let barColor = '#ff4757'
      if (hpRatio > 0.6) barColor = '#2ed573'
      else if (hpRatio > 0.3) barColor = '#feca57'

      const hpBarW = 68 * dpr
      const hpBarH = 9 * dpr
      const hpBarX = ex - hpBarW / 2
      const hpBarY = ey - 52 * dpr

      // 黑底
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      this._roundRect(ctx, hpBarX - 2 * dpr, hpBarY - 2 * dpr, hpBarW + 4 * dpr, hpBarH + 4 * dpr, 6 * dpr)
      ctx.fill()

      // ★ 红色填充（直接用 hpRatio，与角色HP条一致的简单逻辑）
      if (hpRatio > 0.005) {
        ctx.fillStyle = barColor
        this._roundRect(ctx, hpBarX, hpBarY, hpBarW * hpRatio, hpBarH, 4 * dpr)
        ctx.fill()
      }

      // 血量文字
      const totalSegments = Math.ceil(rawMaxHp / 100)
      const barText = totalSegments > 1 ? `${rawHp} ×${totalSegments}` : `${rawHp}/${rawMaxHp}`
      ctx.font = `bold ${8 * dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(barText, ex, hpBarY + hpBarH / 2)

      // 名称和等级
      ctx.font = `bold ${13 * dpr}px sans-serif`
      ctx.fillStyle = enemy.isBoss ? '#ff4757' : (enemy.isElite ? '#a55eea' : '#ffffff')
      ctx.textAlign = 'center'
      const title = enemy.isBoss ? `👑 ${enemy.name}` : (enemy.isElite ? `⚔️ ${enemy.name}` : enemy.name)
      ctx.fillText(title, ex, hpBarY - 12 * dpr)

      ctx.font = `${10 * dpr}px sans-serif`
      ctx.fillStyle = '#f39c12'
      ctx.fillText(`Lv.${enemy.level || 1}`, ex, hpBarY - 24 * dpr)

      if (enemy.crit && enemy.crit > 0) {
        ctx.font = `${9 * dpr}px sans-serif`
        ctx.fillStyle = '#ff6b6b'
        ctx.fillText(`暴击 ${(enemy.crit * 100).toFixed(0)}%`, ex, hpBarY - 36 * dpr)
      }

      // 状态效果图标
      const statusIcons = this._getEnemyStatusIcons(index)
      if (statusIcons.length > 0) {
        const iconY = hpBarY - 50 * dpr
        const iconSpacing = 26 * dpr
        const startX = ex - (statusIcons.length - 1) * iconSpacing / 2
        statusIcons.forEach((icon, i) => {
          const iconX = startX + i * iconSpacing
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
          ctx.beginPath()
          ctx.arc(iconX, iconY, 10 * dpr, 0, Math.PI * 2)
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

      if (isDead && deathAnim) ctx.globalAlpha = 1.0
    })
  }

  proto._getEnemyStatusIcons = function(enemyIndex) {
    // ★ 修复：使用 enemy.id 而不是索引
    const enemy = this.enemies[enemyIndex]
    if (!enemy) return []
    
    const enemyId = enemy.id
    const effects = enemyId ? (this.statusEffects.enemies[enemyId] || []) : []
    const icons = []
    effects.forEach(e => {
      const active = (e.turnsRemaining > 0) || (e.duration > 0)
      if (active) {
        const map = { burned: { emoji: '🔥', color: '#FF6B35' }, frozen: { emoji: '❄️', color: '#74B9FF' }, slimed: { emoji: '🟢', color: '#2ed573' }, stunned: { emoji: '💫', color: '#FFD700' }, def_up: { emoji: '🛡️', color: '#4ECDC4' }, atk_up: { emoji: '⚔️', color: '#FF6B6B' } }
        const info = map[e.type]
        if (info) icons.push({ emoji: info.emoji, turns: e.turnsRemaining || Math.ceil(e.duration || 0), color: info.color })
      }
    })
    return icons
  }

  // ======== 敌人精灵绘制 ========
  proto._drawEnemySprite = function(ctx, x, y, enemy) {
    const dpr = this.dpr
    const isBoss = enemy.isBoss
    
    // ★ 修复：使用 enemy.id 而不是 indexOf(enemy)，防止敌人死亡后索引错位
    const animType = enemy && enemy.id && this.enemyAnimStates[enemy.id]?.type
    let size
    if (isBoss) size = 65 * dpr
    else if (animType === 'slime_cat') size = 40 * dpr
    else if (animType === 'shadow_mouse') size = 30 * dpr
    else if (animType === 'wild_cat') size = 33 * dpr
    else size = 36 * dpr

    const enemyIndex = this.enemies.indexOf(enemy)
    
    // ★ 修复：使用 enemy.id 而不是 enemyIndex，防止敌人死亡后索引错位
    const animState = enemy && enemy.id && this.enemyAnimStates[enemy.id] ? this.enemyAnimStates[enemy.id] : null
    const isWalking = animState && animState.state === 'walk'
    const bounce = 0

    if (animState) {
      const frameKey = this._getEnemyFrameKey(animState)
      const frameImg = this.game.assets.get(frameKey)
      if (frameImg) {
        ctx.save()
        ctx.translate(x, y + bounce)

        const eState = this.unitStates['enemy_' + enemyIndex]
        const isEnemyInCombat = eState && (eState.state === 'moving_to_attack' || eState.state === 'in_range' || eState.state === 'attacking')
        if (!isEnemyInCombat && isWalking && eState && eState.targetX !== null) {
          if (eState.targetX > eState.x) ctx.scale(-1, 1)
        }

        // ★ 隐身效果：降低透明度
        if (animState.isInvisible) {
          ctx.globalAlpha = 0.3  // 70%透明
        }

        // 阴影（脚底位置）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
        ctx.beginPath()
        ctx.ellipse(0, 0, size * 0.5, size * 0.15, 0, 0, Math.PI * 2)
        ctx.fill()

        // ★ 优化：统一画布尺寸后，直接使用固定缩放
        // 所有艾米帧现在都是 350x500 的统一尺寸
        // 脚底对齐在画布的 Y=470 位置（距离底部30px）
        const FRAME_W = 350
        const FRAME_H = 500
        const FOOT_Y_IN_FRAME = 470  // 脚底在画布中的Y坐标
        
        const targetHeight = size * 2  // 目标显示高度
        const scale = targetHeight / FRAME_H
        const scaledW = FRAME_W * scale
        const scaledH = FRAME_H * scale
        
        // 以脚底为锚点绘制：
        // 画布中 Y=FOOT_Y_IN_FRAME 的位置，应该对应到游戏坐标 y
        const anchorOffsetY = (FOOT_Y_IN_FRAME / FRAME_H) * scaledH
        
        ctx.drawImage(frameImg, -scaledW / 2, -anchorOffsetY, scaledW, scaledH)
        ctx.restore()
        return
      }
    }

    // 默认绘制（无帧图片的敌人占位符）—— 以底部为锚点
    ctx.save()
    ctx.translate(x, y + bounce)
    // 阴影在脚底
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.beginPath()
    ctx.ellipse(0, 0, size * 0.5, size * 0.15, 0, 0, Math.PI * 2)
    ctx.fill()

    const bodyColor = enemy.isBoss ? '#ff4757' : enemy.isElite ? '#a55eea' : '#7c5ce0'
    const bodyGrad = ctx.createRadialGradient(-size * 0.2, -size * 0.45, 0, 0, -size * 0.25, size * 0.7)
    bodyGrad.addColorStop(0, this._lightenColor(bodyColor, 30))
    bodyGrad.addColorStop(1, bodyColor)
    ctx.fillStyle = bodyGrad
    // 椭圆底部对齐 y=0（中心上移 size*0.45）
    ctx.beginPath()
    ctx.ellipse(0, -size * 0.45, size * 0.55, size * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()

    // 耳朵/眼睛/鼻子等细节...
    ctx.restore()
  }

  // ======== 自动战斗 UI ========
  proto._renderAutoBattleUI = function(ctx) {
    const dpr = this.dpr
    const w = this.width
    const btnSize = 38 * dpr
    const margin = 12 * dpr
    const topY = margin

    // 暂停按钮
    const pauseBtnX = w - btnSize - margin
    const pauseBtnY = topY
    this._speedButtonArea = this._speedButtonArea || {}

    ctx.fillStyle = this.isPaused ? 'rgba(255,71,87,0.85)' : 'rgba(30,30,50,0.75)'
    this._roundRect(ctx, pauseBtnX, pauseBtnY, btnSize, btnSize, 8 * dpr)
    ctx.fill()
    ctx.font = `bold ${16 * dpr}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.isPaused ? '▶' : '⏸', pauseBtnX + btnSize / 2, pauseBtnY + btnSize / 2)
    this._speedButtonArea.pause = { x: pauseBtnX, y: pauseBtnY, w: btnSize, h: btnSize }

    // 加速按钮
    const speedBtnX = pauseBtnX - btnSize - 8 * dpr
    const speedColor = this.battleSpeed >= 2 ? 'rgba(46,213,115,0.85)' : 'rgba(30,30,50,0.75)'
    ctx.fillStyle = speedColor
    this._roundRect(ctx, speedBtnX, pauseBtnY, btnSize, btnSize, 8 * dpr)
    ctx.fill()
    ctx.font = `bold ${15 * dpr}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.fillText(this.battleSpeed >= 2 ? '2x' : '1x', speedBtnX + btnSize / 2, pauseBtnY + btnSize / 2)
    this._speedButtonArea.speed = { x: speedBtnX, y: pauseBtnY, w: btnSize, h: btnSize }

    // 时间显示
    const timeStr = `${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, '0')}`
    ctx.font = `${11 * dpr}px monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText(timeStr, w - margin, pauseBtnY + btnSize + 6 * dpr)
  }

  proto._renderFleeButton = function(ctx) {
    const dpr = this.dpr
    const btnW = 70 * dpr
    const btnH = 30 * dpr
    const btnX = 12 * dpr
    const btnY = 12 * dpr

    this._fleeButtonArea = { x: btnX, y: btnY, w: btnW, h: btnH }

    ctx.fillStyle = 'rgba(80,60,50,0.70)'
    this._roundRect(ctx, btnX, btnY, btnW, btnH, 6 * dpr)
    ctx.fill()
    ctx.strokeStyle = 'rgba(160,120,80,0.5)'
    ctx.lineWidth = 1 * dpr
    ctx.stroke()

    ctx.font = `bold ${12 * dpr}px sans-serif`
    ctx.fillStyle = '#f39c12'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🏃 撤退', btnX + btnW / 2, btnY + btnH / 2)
  }

  // ======== 战斗日志 ========
  proto._renderBattleLog = function(ctx) {
    const dpr = this.dpr
    const logX = 8 * dpr
    const logY = this.height * 0.16
    const logW = 180 * dpr
    const logH = 100 * dpr

    if (!this.log || this.log.length === 0) return

    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    this._roundRect(ctx, logX, logY, logW, logH, 6 * dpr)
    ctx.fill()

    ctx.font = `${9.5 * dpr}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    const visibleCount = Math.min(5, this.log.length)
    const startIdx = Math.max(0, this.log.length - visibleCount)
    for (let i = 0; i < visibleCount; i++) {
      const entry = this.log[startIdx + i]
      const alpha = 0.5 + (i / visibleCount) * 0.5
      ctx.fillStyle = `rgba(255,255,255,${alpha})`
      ctx.fillText(entry, logX + 5 * dpr, logY + 4 * dpr + i * 17 * dpr, logW - 10 * dpr)
    }
  }

  // ======== 回合信息 ========
  proto._renderTurnInfo = function(ctx) {
    const dpr = this.dpr
    const w = this.width

    ctx.font = `bold ${13 * dpr}px monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`T=${this.turn}`, 12 * dpr, 52 * dpr)

    if (this.phase === 'auto_battle' || this.phase === 'animating') {
      ctx.fillStyle = 'rgba(46,213,115,0.6)'
      ctx.textAlign = 'right'
      ctx.fillText('▶ 自动战斗', w - 12 * dpr, 52 * dpr)
    }
  }

  // ======== 结束画面（重新设计）========
  proto._renderEndScreen = function(ctx, title, color, hint) {
    const w = this.width;
    const h = this.height;
    const dpr = this.dpr;

    // ★ 动态遮罩（渐变背景）
    const overlayGrad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.8);
    overlayGrad.addColorStop(0, 'rgba(0,0,0,0.7)');
    overlayGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, w, h);

    // ★ 粒子效果（胜利=金色粒子，失败=灰色粒子）
    if (!this._endScreenParticles) {
      this._initEndScreenParticles(color);
    }
    this._updateAndRenderEndParticles(ctx, color);

    // ★ 结果文字（带缩放动画）
    if (!this._endTextScale) this._endTextScale = 0;
    this._endTextScale = Math.min(1.0, this._endTextScale + 0.05);

    ctx.save();
    ctx.translate(w/2, h * 0.32);
    ctx.scale(this._endTextScale, this._endTextScale);

    ctx.font = `bold ${42 * dpr}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 15 * dpr;
    ctx.fillText(title, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    // ★ 星级评价（仅胜利时显示）
    if (title.indexOf('胜利') >= 0) {
      this._renderStarRating(ctx, w, h, dpr);
    }

    // ★ 战斗统计
    this._renderBattleStats(ctx, w, h, dpr);

    // ★ 战斗奖励（仅胜利时显示）
    if (title.indexOf('胜利') >= 0 && this._battleRewards) {
      this._renderBattleRewards(ctx, w, h, dpr);
    }

    // ★ 继续按钮（带脉冲动画）
    if (!this._buttonPulse) this._buttonPulse = 0;
    this._buttonPulse = (this._buttonPulse + 0.03) % (Math.PI * 2);

    const btnW = 180 * dpr;
    const btnH = 50 * dpr;
    const btnX = (w - btnW) / 2;
    const btnY = h * 0.75;

    const pulseScale = 1 + Math.sin(this._buttonPulse) * 0.03;
    const actualBtnW = btnW * pulseScale;
    const actualBtnH = btnH * pulseScale;
    const actualBtnX = (w - actualBtnW) / 2;
    const actualBtnY = btnY - (actualBtnH - btnH) / 2;

    const grad = ctx.createLinearGradient(actualBtnX, actualBtnY, actualBtnX, actualBtnY + actualBtnH);
    grad.addColorStop(0, color);
    grad.addColorStop(1, this._darkenColor(color, -30));
    ctx.fillStyle = grad;
    this._roundRect(ctx, actualBtnX, actualBtnY, actualBtnW, actualBtnH, 25 * dpr);
    ctx.fill();

    ctx.font = `bold ${20 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hint, w / 2, actualBtnY + actualBtnH / 2);

    // 保存按钮区域供点击检测
    this._endScreenButton = { x: actualBtnX, y: actualBtnY, w: actualBtnW, h: actualBtnH };
  }

  // 初始化结束画面粒子
  proto._initEndScreenParticles = function(color) {
    this._endScreenParticles = [];
    const count = 30;
    for (let i = 0; i < count; i++) {
      this._endScreenParticles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: Math.random() * 4 + 2,
        alpha: Math.random() * 0.5 + 0.3,
        color: color
      });
    }
  }

  // 更新并渲染结束画面粒子
  proto._updateAndRenderEndParticles = function(ctx, baseColor) {
    if (!this._endScreenParticles) return;

    this._endScreenParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      // 边界环绕
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;

      // 渲染
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;
  }

  // 渲染星级评价
  proto._renderStarRating = function(ctx, w, h, dpr) {
    if (!this._battleStars) {
      // 计算星级（基于剩余HP、战斗时间等）
      this._battleStars = this._calculateBattleStars();
    }

    const starCount = this._battleStars;
    const starSize = 30 * dpr;
    const starSpacing = 50 * dpr;
    const totalWidth = starCount * starSpacing;
    const startX = (w - totalWidth) / 2 + starSpacing / 2;
    const starY = h * 0.45;

    for (let i = 0; i < 3; i++) {
      const starX = startX + i * starSpacing;
      const isActive = i < starCount;

      ctx.font = `${starSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (isActive) {
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
        ctx.shadowBlur = 10 * dpr;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.shadowBlur = 0;
      }

      ctx.fillText('★', starX, starY);
      ctx.shadowBlur = 0;
    }
  }

  // 计算战斗星级
  proto._calculateBattleStars = function() {
    let stars = 3;

    // 基于队伍平均HP%
    const avgHpPercent = this.party.reduce((sum, hero) => {
      return sum + (hero.hp / hero.maxHp);
    }, 0) / this.party.length;

    // ★★★ 完美：平均HP% >= 80%，且战斗时间 <= 120秒
    if (avgHpPercent >= 0.8 && this.time <= 120) {
      stars = 3;
    }
    // ★★☆ 优秀：平均HP% >= 50%，且战斗时间 <= 180秒
    else if (avgHpPercent >= 0.5 && this.time <= 180) {
      stars = 2;
    }
    // ★☆☆ 险胜：平均HP% >= 20%
    else if (avgHpPercent >= 0.2) {
      stars = 1;
    }
    // ☆☆☆ 惨胜：平均HP% < 20%（但胜利了，至少给1星）
    else {
      stars = 1;
    }

    // 额外奖励：无角色死亡 +1星（最高3星）
    const deadCount = this.party.filter(h => h.hp <= 0).length;
    if (deadCount === 0 && stars < 3) {
      stars = Math.min(3, stars + 1);
    }

    // 惩罚：多人死亡 -1星（最低1星）
    if (deadCount >= 2) {
      stars = Math.max(1, stars - 1);
    }

    return stars;
  }

  // 渲染战斗统计
  proto._renderBattleStats = function(ctx, w, h, dpr) {
    if (!this._battleStats) {
      this._battleStats = this._calculateBattleStats();
    }

    const stats = this._battleStats;
    const statsY = h * 0.55;
    const lineHeight = 25 * dpr;

    ctx.font = `${12 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const statsText = [
      `⚔️ 总伤害：${stats.totalDamage}`,
      `🛡️ 受到伤害：${stats.totalDamageReceived}`,
      `⏱️ 战斗时间：${Math.floor(stats.battleTime / 60)}:${String(Math.floor(stats.battleTime % 60)).padStart(2, '0')}`
    ];

    statsText.forEach((text, i) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillText(text, w / 2, statsY + i * lineHeight);
    });
  }

  // 计算战斗统计
  proto._calculateBattleStats = function() {
    // 简化版：实际应该从战斗过程中累计
    return {
      totalDamage: this._totalDamageDealt || 0,
      totalDamageReceived: this._totalDamageReceived || 0,
      battleTime: this.time || 0
    };
  }

  // 渲染战斗奖励（经验、金币、装备掉落）
  proto._renderBattleRewards = function(ctx, w, h, dpr) {
    const rewards = this._battleRewards
    if (!rewards) return

    const startY = h * 0.62
    const lineHeight = 30 * dpr
    let currentY = startY

    ctx.font = `${14 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 经验奖励
    if (rewards.exp > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.fillText(`✨ 获得 ${rewards.exp} 经验`, w / 2, currentY)
      currentY += lineHeight
    }

    // 金币奖励
    if (rewards.gold > 0) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.9)'
      ctx.fillText(`💰 获得 ${rewards.gold} 金币`, w / 2, currentY)
      currentY += lineHeight
    }

    // 装备掉落
    if (rewards.drops && rewards.drops.length > 0) {
      currentY += 10 * dpr // 额外间距

      ctx.font = `bold ${13 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.fillText('🎁 获得装备：', w / 2, currentY)
      currentY += lineHeight

      ctx.font = `${12 * dpr}px sans-serif`
      
      rewards.drops.forEach(drop => {
        const rarityConfig = RARITY_CONFIG[drop.rarity] || RARITY_CONFIG['common']
        const typeConfig = EQUIP_TYPE_CONFIG[drop.type] || { icon: '📦' }
        
        // 装备图标和名称，用稀有度颜色
        const text = `${typeConfig.icon} ${drop.name}`
        ctx.fillStyle = rarityConfig.color
        
        ctx.fillText(text, w / 2, currentY)
        currentY += lineHeight
      })

      currentY += 5 * dpr
    }

    // 角色升级
    if (rewards.levelUps && rewards.levelUps.length > 0) {
      ctx.font = `bold ${13 * dpr}px sans-serif`
      
      rewards.levelUps.forEach(lvUp => {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.9)'
        ctx.fillText(`🎉 ${lvUp.name} 升级到 Lv.${lvUp.level}！`, w / 2, currentY)
        currentY += lineHeight
      })
    }
  }

  proto._darkenColor = function(hex, amount) {
    const num = parseInt(hex.slice(1), 16)
    const amt = Math.round(2.55 * amount)
    const R = Math.max(0, (num >> 16) + amt)
    const G = Math.max(0, ((num >> 8) & 0x00FF) + amt)
    const B = Math.max(0, (num & 0x0000FF) + amt)
    return `rgb(${R}, ${G}, ${B})`
  }

  // ======== 底部操作区背景 ========
  proto._renderBottomBar = function(ctx) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr
    const barH = 140 * dpr  // 底部操作区高度
    const y = h - barH
    
    // 背景渐变
    const bgGrad = ctx.createLinearGradient(0, y, 0, h)
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.0)')
    bgGrad.addColorStop(0.3, 'rgba(15, 20, 30, 0.85)')
    bgGrad.addColorStop(1, 'rgba(10, 15, 25, 0.95)')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, y, w, barH)
    
    // 顶部分隔线
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)'
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  // ======== 队长模式 UI 渲染 ========

  proto._renderJoystick = function(ctx) {
    const jc = this._joystickConfig
    if (!jc) return
    const dpr = this.dpr

    if (this._joystick.active) {
      const dx = this._joystick.currentX - jc.centerX
      const dy = this._joystick.currentY - jc.centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      let hx = jc.centerX
      let hy = jc.centerY
      if (dist > 0) {
        const clamped = Math.min(dist, jc.maxOffset)
        hx = jc.centerX + (dx / dist) * clamped
        hy = jc.centerY + (dy / dist) * clamped
      }
      // 底座 - 渐变
      const baseGrad = ctx.createRadialGradient(jc.centerX, jc.centerY, 0, jc.centerX, jc.centerY, jc.baseRadius)
      baseGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)')
      baseGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)')
      ctx.beginPath()
      ctx.arc(jc.centerX, jc.centerY, jc.baseRadius, 0, Math.PI * 2)
      ctx.fillStyle = baseGrad
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.lineWidth = 2 * dpr
      ctx.stroke()
      // 手柄 - 发光效果
      ctx.beginPath()
      ctx.arc(hx, hy, jc.handleRadius, 0, Math.PI * 2)
      const handleGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, jc.handleRadius)
      handleGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
      handleGrad.addColorStop(1, 'rgba(255, 200, 120, 0.6)')
      ctx.fillStyle = handleGrad
      ctx.fill()
    } else {
      // 非激活状态 - 半透明
      ctx.beginPath()
      ctx.arc(jc.centerX, jc.centerY, jc.baseRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 1.5 * dpr
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(jc.centerX, jc.centerY, jc.handleRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.fill()
    }
  }

  proto._renderAttackButton = function(ctx) {
    const btn = this._attackBtn
    if (!btn) return
    const dpr = this.dpr
    const isBusy = this._controlledHero && this.activeAttackers.has(this._controlledHero.id)

    // 外圈 - 渐变效果
    const grad = ctx.createRadialGradient(btn.x, btn.y, 0, btn.x, btn.y, btn.radius)
    if (isBusy) {
      grad.addColorStop(0, 'rgba(120, 120, 120, 0.5)')
      grad.addColorStop(1, 'rgba(80, 80, 80, 0.3)')
    } else {
      grad.addColorStop(0, 'rgba(255, 159, 67, 0.8)')
      grad.addColorStop(1, 'rgba(200, 100, 30, 0.6)')
    }
    ctx.beginPath()
    ctx.arc(btn.x, btn.y, btn.radius, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
    
    // 发光效果
    if (!isBusy) {
      ctx.shadowColor = 'rgba(255, 159, 67, 0.8)'
      ctx.shadowBlur = 10 * dpr
    }
    ctx.strokeStyle = isBusy ? 'rgba(150, 150, 150, 0.5)' : 'rgba(255, 200, 120, 0.9)'
    ctx.lineWidth = 3 * dpr
    ctx.stroke()
    ctx.shadowBlur = 0

    // 图标
    ctx.font = `bold ${20 * dpr}px sans-serif`
    ctx.fillStyle = isBusy ? 'rgba(255,255,255,0.3)' : '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('⚔', btn.x, btn.y)
  }

  proto._renderSkillButtons = function(ctx) {
    const dpr = this.dpr
    for (const btn of this._skillBtns) {
      const r = btn.radius
      const skillColor = this._getSkillGlowColor(btn.skill.id) || '#64B5F6'
      
      // 背景 - 渐变
      const grad = ctx.createRadialGradient(btn.x, btn.y, 0, btn.x, btn.y, r)
      if (btn.disabled) {
        grad.addColorStop(0, 'rgba(100, 100, 100, 0.4)')
        grad.addColorStop(1, 'rgba(60, 60, 60, 0.2)')
      } else {
        grad.addColorStop(0, skillColor.replace(')', ', 0.8)').replace('rgb', 'rgba'))
        grad.addColorStop(1, skillColor.replace(')', ', 0.4)').replace('rgb', 'rgba'))
      }
      ctx.beginPath()
      ctx.arc(btn.x, btn.y, r, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()
      
      // 发光效果
      if (!btn.disabled && !btn.cdRemaining) {
        ctx.shadowColor = skillColor
        ctx.shadowBlur = 8 * dpr
      }
      ctx.strokeStyle = btn.disabled
        ? 'rgba(100, 100, 100, 0.4)'
        : skillColor
      ctx.lineWidth = 2 * dpr
      ctx.stroke()
      ctx.shadowBlur = 0

      // CD 覆盖（扇形）
      if (btn.cdRemaining > 0) {
        const skill = btn.skill
        const timer = this.heroAttackTimers[this._controlledHero?.id]
        const totalCd = timer ? this._getSkillCooldown(this._controlledHero, skill) : 5
        const cdRatio = Math.min(1, btn.cdRemaining / Math.max(0.01, totalCd))
        ctx.beginPath()
        ctx.moveTo(btn.x, btn.y)
        ctx.arc(btn.x, btn.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cdRatio)
        ctx.closePath()
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.fill()
      }

      // 技能图标（首字）
      ctx.font = `bold ${16 * dpr}px sans-serif`
      ctx.fillStyle = btn.disabled ? 'rgba(255,255,255,0.3)' : '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const shortName = (btn.skill.name || '技').charAt(0)
      ctx.fillText(shortName, btn.x, btn.y)

      // CD 数字
      if (btn.cdRemaining > 0) {
        ctx.font = `bold ${12 * dpr}px sans-serif`
        ctx.fillStyle = '#ff6b6b'
        ctx.fillText(Math.ceil(btn.cdRemaining), btn.x, btn.y + r + 12 * dpr)
      }
    }
  }

  proto._renderCaptainSwitchBar = function(ctx) {
    const dpr = this.dpr
    for (const sw of this._switchBtns) {
      const hero = sw.hero
      const isControlled = this._controlledHero && hero.id === this._controlledHero.id
      const isDead = hero.hp <= 0

      // 背景
      ctx.fillStyle = isControlled
        ? 'rgba(255, 159, 67, 0.8)'
        : isDead ? 'rgba(50,50,50,0.5)' : 'rgba(30,30,50,0.6)'
      this._roundRect(ctx, sw.x, sw.y, sw.w, sw.h, 8 * dpr)
      ctx.fill()
      ctx.strokeStyle = isControlled
        ? 'rgba(255,200,100,0.9)'
        : 'rgba(255,255,255,0.3)'
      ctx.lineWidth = isControlled ? 2 * dpr : 1 * dpr
      this._roundRect(ctx, sw.x, sw.y, sw.w, sw.h, 8 * dpr)
      ctx.stroke()

      // 头像（尝试加载图片）
      const img = this.game.assets.get(this._getHeroImageKey(hero.id))
      if (img) {
        ctx.save()
        ctx.beginPath()
        this._roundRect(ctx, sw.x + 3 * dpr, sw.y + 3 * dpr, sw.w - 6 * dpr, sw.h - 6 * dpr, 6 * dpr)
        ctx.clip()
        ctx.drawImage(img, sw.x + 3 * dpr, sw.y + 3 * dpr, sw.w - 6 * dpr, sw.h - 6 * dpr)
        ctx.restore()
      }

      // 死亡标记
      if (isDead) {
        ctx.font = `bold ${16 * dpr}px sans-serif`
        ctx.fillStyle = '#ff4757'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('💀', sw.x + sw.w / 2, sw.y + sw.h / 2)
      }

      // HP小条
      const hpRatio = Math.min(1, Math.max(0, hero.hp / hero.maxHp))
      const barH = 3 * dpr
      const barY = sw.y + sw.h + 2 * dpr
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(sw.x, barY, sw.w, barH)
      if (hpRatio > 0.005) {
        ctx.fillStyle = hpRatio > 0.5 ? '#2ed573' : hpRatio > 0.25 ? '#feca57' : '#ff4757'
        ctx.fillRect(sw.x, barY, sw.w * hpRatio, barH)
      }
    }
  }

  // ======== 特殊伤害数字渲染 ========
  proto._renderBurnDamage = function(ctx, dt, dpr) {
    ctx.font = `bold ${24 * dpr}px sans-serif`
    ctx.fillStyle = '#FF6B35'
    ctx.textAlign = 'center'
    ctx.shadowColor = '#FF4500'
    ctx.shadowBlur = 6 * dpr
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = 2 * dpr
    ctx.strokeText(dt.text, dt.x, dt.y)
    ctx.fillText(dt.text, dt.x, dt.y)
    ctx.shadowBlur = 0
  }

  proto._renderStatusEffect = function(ctx, dt, dpr, effectType) {
    const colors = { burn: '#FF6B35', freeze: '#74B9FF' }
    const color = colors[effectType] || '#aaa'

    ctx.font = `bold ${13 * dpr}px sans-serif`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.shadowColor = color
    ctx.shadowBlur = 4 * dpr
    ctx.fillText(dt.text, dt.x, dt.y)
    ctx.shadowBlur = 0
  }
}
