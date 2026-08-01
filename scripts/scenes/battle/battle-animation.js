/**
 * battle-animation.js - 动画系统
 * 职责：帧动画更新（角色/敌人）、代码粒子特效、敌人攻击跳跃动画
 * 
 * 从 battle-scene.js 提取：
 * - _initEnemyAnimations / _initHeroAnimations
 * - update() 主循环调度
 * - _updateEnemyAnimations / _updateHeroAnimations  
 * - _createCodeEffect / _updateCodeEffects / _renderCodeEffects
 * - _startEnemyAttackAnimation / _updateEnemyAttackAnimation
 * - _renderAttackingHero / _renderAttackingEnemy
 */

export function installBattleAnimation(BattleSceneClass) {
  const proto = BattleSceneClass.prototype

  // ======== 动画状态初始化 ========
  proto._initEnemyAnimations = function() {
    this.enemies.forEach((enemy, index) => {
      if (!enemy || !enemy.id) return
      
      // ★ 强制检查：如果是 lost_healer_cat，强制使用 'aimi' 类型
      let spriteType = 'default'
      if (enemy.id === 'lost_healer_cat' || enemy.name === '迷途的治愈猫') {
        spriteType = 'aimi'  // 强制使用 aimi 类型
        console.log(`[Animation] 强制设置 ${enemy.name} 的 spriteType 为 'aimi'`)
      } else {
        // 优先使用 renderConfig.spriteType（支持艾米BOSS的 'aimi' 类型）
        spriteType = enemy.renderConfig?.spriteType || enemy.type || enemy.id || 'default'
      }
      
      // 帧持续时间（根据不同类型调整，单位：毫秒）
      let frameDuration = 100
      if (spriteType === 'wild_cat') frameDuration = 120
      // ★ 艾米动画调整：从80改为120，让动画更慢更清晰
      // 注意：技能动画会在 _updateGenericEnemyAnimation 中再乘以2倍
      if (spriteType === 'aimi') frameDuration = 120
      
      // ★ 修复：使用 enemy.id 而不是 index，防止敌人死亡后索引错位
      this.enemyAnimStates[enemy.id] = {
        type: spriteType,
        state: 'idle',
        frame: 1,
        frameTimer: 0,
        frameDuration: frameDuration,
        attackDamageApplied: false,
        onAttackComplete: null
      }
    })
  }

  proto._initHeroAnimations = function() {
    this.party.forEach(hero => {
      const walkCount = 8
      this.heroAnimStates[hero.id] = {
        type: hero.id,
        state: 'idle',
        frame: 0,
        frameTimer: 0,
        frameDuration: 80,
        totalWalkFrames: walkCount,
        totalIdleFrames: this._getHeroIdleFrameCount(hero.id),
        totalSlashFrames: hero.id === 'zhenbao' ? 13 : (hero.id === 'lixiaobao' ? 5 : walkCount),
        _isCastingSkill: false,
        _attackLoopCount: 0,
        _effectiveMoving: false,
        _movingHoldFrames: 0,
        _MOVING_HOLD: 5,
      }
    })
  }

  // ======== update 主循环 ========
  proto.update = function(dt) {
    this.time += dt

    // ★ 队长模式：每帧读取统一输入（摇杆移动 + 点击触发技能）
    if (this._captainMode) {
      this._updateCaptainTouch(dt)
      // 扇形 AOE 指示渐隐
      if (this._aoeFx && this._aoeFx.life > 0) {
        this._aoeFx.life -= dt
        if (this._aoeFx.life <= 0) this._aoeFx = null
      }
    }

    // ★ 调试日志（每3秒输出一次）
    if (!this._lastUpdateLog || this.time - this._lastUpdateLog > 3) {
      console.log(`[Battle] update() 被调用, phase=${this.phase}, time=${this.time.toFixed(2)}`)
      this._lastUpdateLog = this.time
    }

    // ★ 摇杆调试（每2秒输出一次）
    if (this._captainMode && this._joystick && this.time - (this._lastJoystickLog || 0) > 2) {
      console.log(`[Joystick] active=${this._joystick.active}, current=(${this._joystick.currentX}, ${this._joystick.currentY}), controlledHero=${this._controlledHero ? this._controlledHero.name : 'null'}`)
      // 检查操控角色的状态
      if (this._controlledHero) {
        const hState = this.unitStates[this._controlledHero.id]
        if (hState) {
          console.log(`[Joystick] ${this._controlledHero.name} state=${hState.state}, pos=(${hState.x.toFixed(1)}, ${hState.y.toFixed(1)}), target=(${hState.targetX || 'null'}, ${hState.targetY || 'null'})`)
        }
      }
      this._lastJoystickLog = this.time
    }

    switch (this.phase) {
      case 'intro':
        break

      case 'auto_battle':
      case 'animating':
        // ★ 测试模式：跳过英雄自动攻击，只保留敌人AI
        if (!this._testMode) {
          this._updateAutoBattle(dt)
        } else {
          // ★ 测试模式：仍然需要更新单位位置（敌人AI需要移动）
          this._updateCombatUnits(dt)
          // ★ 调试：每3秒输出一次测试模式状态
          if (!this._lastTestModeStatusLog || this.time - this._lastTestModeStatusLog > 3) {
            console.log(`[Update] 测试模式已启用，跳过_updateAutoBattle(), 敌人AI正常执行`)
            console.log(`[Update] 当前操控角色: ${this._controlledHero ? this._controlledHero.name : '无'}`)
            this._lastTestModeStatusLog = this.time
          }
        }
        this._updateEnemyAutoAttack(dt)
        this._updateMpRegen(dt)
        this._updateBuffTimers(dt)
        this._updateHeroStatusEffects()
        this._updateEnemyStatusEffects()  // ★ 更新敌人状态效果（隐身等）
        this._updateHpDelay(dt)
        this._updateEnemyDeathAnim(dt)
        this._updatePurifyScene(dt)
        break

      case 'victory':
      case 'defeat':
        this._updateHpDelay(dt)
        this._updateEnemyDeathAnim(dt)
        break

      case 'purify':
        this._updatePurifyScene(dt)
        break
    }

    // 动画更新（所有阶段都需要）
    this._updateEnemyAnimations(dt)
    this._updateHeroAnimations(dt)
    this._updateAttackAnimation(dt)
    this._updateEnemyAttackAnimation(dt)
    this._updateChargeAttackAnimation(dt)  // ★ 冲锋动画更新
    this._updateHealingImpact(dt)  // ★ 治愈冲击更新

    // 特效更新
    this._updateCodeEffects(dt)

    // ★ BUFF 粒子特效
    this._updateBuffParticles(dt)

    // 屏幕震动衰减
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 8)
    }
    // 闪光衰减
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3)
    }

    // 更新伤害数字生命期
    if (this.damageTexts && Array.isArray(this.damageTexts)) {
      this.damageTexts = this.damageTexts.filter(entry => {
        entry.life -= dt
        entry.y -= 0.8 * this.dpr  // 上浮
        return entry.life > 0
      })
    }

    // 日志滚动
    const maxScroll = Math.max(0, (this.log || []).length * 18 - 80 * this.dpr)
    if (this.logScroll < maxScroll) {
      this.logScroll = Math.min(maxScroll, this.logScroll + dt * 30)
    }
  }

  // ======== 敌人帧动画更新 ========
  proto._updateEnemyAnimations = function(dt) {
    this.enemies.forEach((enemy, index) => {
      if (!enemy || !enemy.id) return
      
      // ★ 修复：使用 enemy.id 而不是 index，防止敌人死亡后索引错位
      const animState = this.enemyAnimStates[enemy.id]
      if (!animState) return

      animState.frameTimer = (animState.frameTimer || 0) + dt * 1000

      if (animState.type === 'slime_cat') {
        this._updateSlimeCatAnimation(animState, index, enemy, dt)
      } else if (animState.type === 'shadow_mouse') {
        this._updateShadowMouseAnimation(animState, index, enemy, dt)
      } else if (animState.type === 'wild_cat') {
        this._updateWildCatAnimation(animState, dt)
      } else {
        // ★ 通用帧动画更新（支持 aimi 等类型）
        this._updateGenericEnemyAnimation(animState, dt)
      }
    })
  }

  // ======== 通用敌人帧动画更新 ========
  proto._updateGenericEnemyAnimation = function(animState, dt) {
    // ★ 保护检查：如果正在执行特殊技能（如治愈冲击），跳过动画更新
    // ★ 只在技能进行中（preparing/locking/rushing）跳过，击飞和完成阶段允许更新
    if (this._healingImpact && this._healingImpact.active) {
      const phase = this._healingImpact.phase
      if (phase === 'preparing' || phase === 'locking' || phase === 'rushing') {
        return  // 让 _updateHealingImpact 来控制动画
      }
      // 击飞和完成阶段：不return，允许动画正常更新（敌人进入idle状态）
    }

    const baseFrameDuration = animState.frameDuration || 100
    const state = animState.state || 'idle'

    // ★ 不同状态使用不同的帧持续时间（毫秒）
    // - idle/walk: 正常速度
    // - attack: 稍慢，让攻击动作更清晰
    // - skill/buff/support: 更慢，让技能动画完整展示
    const stateFrameDuration = {
      idle: baseFrameDuration,
      walk: baseFrameDuration,
      attack: baseFrameDuration * 1.5,  // 攻击动画慢50%
      skill: baseFrameDuration * 2.0,    // 技能动画慢100%
      buff: baseFrameDuration * 2.0,     // BUFF动画慢100%
      support: baseFrameDuration * 2.0    // 治疗动画慢100%
    }
    const frameDuration = stateFrameDuration[state] || baseFrameDuration

    // 各状态的帧数
    const frameCounts = {
      idle: 8,
      walk: 8,
      attack: 8,
      skill: 8,
      buff: 8,
      support: 8
    }
    const totalFrames = frameCounts[state] || 8

    if (animState.frameTimer >= frameDuration) {
      animState.frameTimer = 0
      animState.frame = (animState.frame || 1) + 1
      if (animState.frame > totalFrames) {
        animState.frame = 1
      }
    }
  }

  proto._updateSlimeCatAnimation = function(animState, index, enemy, dt) {
    let frameDuration = animState.frameDuration || 100

    // 攻击帧：8,10,12,14,16,18,20,22（共8帧）
    if (animState.state === 'attack') {
      frameDuration = 70
      const totalFrames = 8
      if (animState.frameTimer >= frameDuration) {
        animState.frameTimer = 0
        animState.displayFrame = (animState.displayFrame || 0) + 1
        // ★ 帧号递增：8 + idx*2
        animState.frame = 8 + (animState.displayFrame % totalFrames) * 2
        if (animState.displayFrame >= totalFrames) {
          animState.state = 'idle'
          animState.frame = 1
          animState.displayFrame = 0
        }
      }
      return
    }

    // 技能帧：50,53,56,59,62,65,68,71,74,77,80（共11帧）
    if (animState.state === 'skill') {
      frameDuration = 80
      const totalFrames = 11
      if (animState.frameTimer >= frameDuration) {
        animState.frameTimer = 0
        animState.displayFrame = (animState.displayFrame || 0) + 1
        // ★ 帧号递增：50 + idx*3
        animState.frame = 50 + (animState.displayFrame % totalFrames) * 3
        if (animState.displayFrame >= totalFrames) {
          animState.state = 'idle'
          animState.frame = 1
          animState.displayFrame = 0
        }
      }
      return
    }

    // idle / walk 帧动画
    if (animState.frameTimer >= frameDuration) {
      animState.frameTimer = 0
      if (animState.state === 'walk') {
        animState.frame++
        if (animState.frame > 12) animState.frame = 1
      } else {
        // idle: 帧号递增（史莱姆猫使用不连续的帧编号 1,2,3...）
        animState.frame++
        if (animState.frame > 6) animState.frame = 1
      }
    }
  }

  proto._updateShadowMouseAnimation = function(animState, index, enemy, dt) {
    const frameDuration = animState.frameDuration || 100

    // ★ 隐身buff动画（8帧循环）
    if (animState.state === 'buff') {
      if (animState.frameTimer >= frameDuration) {
        animState.frameTimer = 0
        animState.frame++
        if (animState.frame > 8) animState.frame = 1  // buff_01 到 buff_08 循环
        
        // ★ 检查隐身效果是否结束（修复：使用enemy.id而不是索引）
        const enemyId = enemy ? enemy.id : null
        const enemyEffects = enemyId ? (this.statusEffects.enemies[enemyId] || []) : []
        const invisEffect = enemyEffects.find(e => e.type === 'invisible')
        if (!invisEffect || (invisEffect.startTime && this.time - invisEffect.startTime >= invisEffect.duration)) {
          // 隐身结束，回到idle状态
          animState.state = 'idle'
          animState.frame = 1
          animState.isInvisible = false
          this._addLog(`🌙 ${enemy.name} 的隐身效果结束了！`)
        }
      }
      return
    }

    if (animState.state === 'attack' || animState.state === 'skill') {
      // ★ 暗影鼠动画帧数
      const maxFrame = animState.state === 'skill' ? 8 : 7  // skill: skill_01~08, attack: attack_01~07
      if (animState.frameTimer >= frameDuration) {
        animState.frameTimer = 0
        animState.displayFrame = (animState.displayFrame || 0) + 1

        // ★ 同步更新 animState.frame，渲染层靠此值拼资源key
        // skill → frame = 1~8（对应 SHADOW_MOUSE_SKILL_01 ~ _08）
        // attack → frame = 1~7（对应 SHADOW_MOUSE_ATTACK_01 ~ _07）
        // 使用取模运算确保 frame 永远不会超过 maxFrame
        animState.frame = ((animState.displayFrame % maxFrame) + 1)
        
        // ★ 安全保护：如果 frame 仍然超出范围，强制重置为1
        if (animState.frame > maxFrame || animState.frame < 1) {
          console.error(`[ShadowMouse] frame=${animState.frame} 超出范围(1~${maxFrame})，强制重置为1`)
          animState.frame = 1
        }

        // ★ 在技能动画第4帧（displayFrame=3，frame=4，即 skill_04）时应用伤害
        if (animState.state === 'skill' && animState.displayFrame === 3 && !animState.attackDamageApplied) {
          animState.attackDamageApplied = true
          const target = this.enemyAttackTarget || this.party.find(h => h.hp > 0)
          if (target) {
            this._applyEnemyDamageToHero(enemy, this._currentEnemySkill || { name: '暗影咬', power: 1.4 }, target)
          }
        } else if (animState.state === 'attack' && animState.displayFrame >= 3 && !animState.attackDamageApplied) {
          // attack 动画在第4帧（displayFrame=3，frame=4）应用伤害
          animState.attackDamageApplied = true
          const target = this.enemyAttackTarget || this.party.find(h => h.hp > 0)
          if (target) {
            this._applyEnemyDamageToHero(enemy, this._currentEnemySkill || { name: '攻击', power: 1.0 }, target)
          }
        }

        if (animState.displayFrame >= maxFrame) {
          animState.state = 'idle'
          animState.frame = 1
          animState.displayFrame = 0
          animState.attackDamageApplied = false
          if (typeof animState.onAttackComplete === 'function') {
            animState.onAttackComplete()
            animState.onAttackComplete = null
          } else {
            this._executeEnemyAutoAttack(enemy, index, this._currentEnemySkill, this.enemyAttackTarget)
          }
        }
      }
      return
    }

    if (animState.frameTimer >= frameDuration) {
      animState.frameTimer = 0
      if (animState.state === 'walk') {
        animState.frame++
        if (animState.frame > 12) animState.frame = 1
      } else {
        animState.frame++
        if (animState.frame > 8) animState.frame = 1
      }
    }
  }

  proto._updateWildCatAnimation = function(animState, dt) {
    const frameDuration = animState.frameDuration || 120
    if (animState.frameTimer >= frameDuration) {
      animState.frameTimer = 0
      animState.frame++
      if (animState.frame > 5) animState.frame = 1
    }
  }

  // ======== 角色帧动画更新 ========
  proto._updateHeroAnimations = function(dt) {
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      const hAnimState = this.heroAnimStates[hero.id]
      if (!hAnimState) continue

      hAnimState.frameTimer = (hAnimState.frameTimer || 0) + dt * 1000

      // 移动滞后防闪烁机制
      const hState = this.unitStates[hero.id]
      const isActuallyMoving = hState && (hState.state === 'moving_to_attack' || hState.state === 'returning' || hState.state === 'walk')
      if (isActuallyMoving !== hAnimState._effectiveMoving) {
        if (isActuallyMoving) { hAnimState._effectiveMoving = true; hAnimState._movingHoldFrames = 0 }
        else { hAnimState._movingHoldFrames = (hAnimState._movingHoldFrames || 0) + 1 }
      }
      if (!isActuallyMoving && hAnimState._movingHoldFrames > (hAnimState._MOVING_HOLD || 5)) {
        hAnimState._effectiveMoving = false
      }

      const actualIsMoving = hAnimState._effectiveMoving

      // 状态切换
      const specialStates = new Set(['attack', 'shield', 'buff', 'cast'])
      let desiredState = hAnimState.state
      if (this.activeAttackers.has(hero.id) && !specialStates.has(hAnimState.state)) {
        // 主动出击 → attack
        desiredState = 'attack'
      } else if (!this.activeAttackers.has(hero.id) && specialStates.has(hAnimState.state)) {
        // ★ 技能/攻击标记已清除，强制退出特殊动画
        desiredState = actualIsMoving ? 'walk' : 'idle'
      } else if (actualIsMoving && !specialStates.has(hAnimState.state)) {
        desiredState = 'walk'
      } else if (!actualIsMoving && !this.activeAttackers.has(hero.id) &&
                 (hAnimState.state === 'walk' || specialStates.has(hAnimState.state))) {
        desiredState = 'idle'
      }

      if (desiredState !== hAnimState.state) {
        hAnimState.state = desiredState
        hAnimState.frame = 0
        hAnimState.frameTimer = 0
      }

      // 帧间隔计算
      let frameDur = hAnimState.frameDuration || 80
      const isCasting = hAnimState._isCastingSkill || hAnimState.state === 'cast'

      if (isCasting) {
        // 施法期间：250ms/帧 × 8帧 = 2秒完整播放
        frameDur = 250
      } else if (hAnimState.state === 'attack') {
        frameDur = 70 + Math.max(0, (hero.spd || 10)) * 2  // 攻击帧：~90ms，受spd影响
      } else if (hAnimState.state === 'walk') {
        const moveSpeed = this._getMoveSpeed(hero)
        frameDur = Math.max(80, 220 - moveSpeed * 0.8)    // walk 帧：~100-140ms
      } else {
        // ★ FIX: idle 帧率从160ms降到120ms（原来太慢看起来像静止）
        frameDur = 120
      }

      if (hAnimState.frameTimer >= frameDur) {
        hAnimState.frameTimer = 0
        hAnimState.frame++

        // 循环帧
        if (hAnimState.state === 'idle') {
          const maxIdle = hAnimState.totalIdleFrames || 2
          if (hAnimState.frame >= maxIdle) hAnimState.frame = 0
        } else if (hAnimState.state === 'walk') {
          const maxWalk = hAnimState.totalWalkFrames || 8
          if (hAnimState.frame >= maxWalk) hAnimState.frame = 0
        } else if (hAnimState.state === 'attack') {
          const maxSlash = hAnimState.totalSlashFrames || 8
          if (hAnimState.frame >= maxSlash) {
            hAnimState.frame = 0
            hAnimState._attackLoopCount = (hAnimState._attackLoopCount || 0) + 1
          }
        } else if (hAnimState.state === 'cast') {
          if (hAnimState.frame >= 8) hAnimState.frame = 0
        } else if (hAnimState.state === 'shield' || hAnimState.state === 'buff') {
          if (hAnimState.frame >= 8) hAnimState.frame = 0
        }
      }
    }
  }

  // ======== 代码粒子特效系统 ========
  proto._createCodeEffect = function(config) {
    this.codeEffects.push({
      type: config.type || 'circle',
      x: config.x,
      y: config.y,
      radius: config.radius || 20,
      maxRadius: config.maxRadius || 80,
      alpha: config.alpha || 0.8,
      color: config.color || '#ffffff',
      duration: config.duration || 0.3,
      elapsed: 0,
      vx: config.vx || 0,
      vy: config.vy || 0,
      gravity: config.gravity || 0,
      particles: config.particles || null,
      text: config.text || null,
      fontSize: config.fontSize || 14,
    })
  }

  proto._randomSlimeColor = function() {
    const colors = ['#2ed573', '#7bed9f', '#26de81', '#20bf6b', '#0fb9b1']
    return colors[Math.floor(Math.random() * colors.length)]
  }

  proto._updateCodeEffects = function(dt) {
    this.codeEffects = this.codeEffects.filter(effect => {
      effect.elapsed += dt
      if (effect.elapsed >= effect.duration) return false

      // ★ 队长投射物：飞向目标
      if (effect.type === 'captain_projectile') {
        effect.x += effect.vx * dt
        effect.y += effect.vy * dt

        // 到达目标判定（距离 < 30px 或超时）
        const tdx = effect.targetX - effect.x
        const tdy = effect.targetY - effect.y
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy)
        if (tdist < 30 * this.dpr && !effect._hit) {
          effect._hit = true
          // 命中：结算伤害
          const enemy = effect._enemy
          const enemyIdx = effect._enemyIdx
          if (enemy && enemy.hp > 0) {
            const pos = this.enemyPositions[enemyIdx] || { x: effect.targetX, y: effect.targetY }
            this._applyAttackDamageToTarget(effect._hero, effect._skill, enemy, pos)
          }
          // 命中特效
          this.flashAlpha = 0.15
          this.codeEffects.push({
            type: 'circle_burst',
            x: effect.x, y: effect.y,
            radius: 10 * this.dpr, maxRadius: 40 * this.dpr,
            alpha: 0.7, color: '#FF9F43',
            duration: 0.25, elapsed: 0
          })
          return false
        }
        return true
      }

      const t = effect.elapsed / effect.duration
      effect.alpha = 0.8 * (1 - t)

      if (effect.type === 'circle_burst' || effect.type === 'circle') {
        const easeOut = 1 - Math.pow(1 - t, 2)
        effect.radius = effect.radius + (effect.maxRadius - effect.radius) * (easeOut * 0.1)
      }

      if (effect.particles) {
        effect.particles.forEach(p => {
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vy += (effect.gravity || 200) * dt
          p.alpha *= 0.98
          p.life -= dt
        })
        effect.particles = effect.particles.filter(p => p.life > 0)
      }

      if (effect.vx !== undefined) {
        effect.x += effect.vx * dt
        effect.y += effect.vy * dt
      }

      return true
    })
  }

  proto._renderCodeEffects = function(ctx) {
    const dpr = this.dpr
    this.codeEffects.forEach(effect => {
      ctx.save()
      ctx.globalAlpha = Math.max(0, effect.alpha)

      // ★ 队长投射物：发光球体 + 拖尾
      if (effect.type === 'captain_projectile') {
        const r = effect.radius || 5 * dpr
        // 拖尾
        const trailAlpha = effect.alpha * 0.3
        const trailR = r * 1.8
        const trailX = effect.x - (effect.vx || 0) * 0.02
        const trailY = effect.y - (effect.vy || 0) * 0.02
        ctx.globalAlpha = trailAlpha
        ctx.beginPath()
        ctx.arc(trailX, trailY, trailR, 0, Math.PI * 2)
        ctx.fillStyle = effect.color
        ctx.fill()
        // 主体
        ctx.globalAlpha = Math.max(0, effect.alpha)
        const grad = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, r)
        grad.addColorStop(0, '#ffffff')
        grad.addColorStop(0.5, effect.color)
        grad.addColorStop(1, 'rgba(255,159,67,0)')
        ctx.beginPath()
        ctx.arc(effect.x, effect.y, r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
        ctx.restore()
        return
      }

      if (effect.type === 'buff_particle') {
        ctx.beginPath()
        ctx.arc(effect.x, effect.y, effect.radius || 3 * dpr, 0, Math.PI * 2)
        ctx.fillStyle = effect.color || '#FFD700'
        ctx.fill()
        ctx.restore()
        return
      }

      if (effect.type === 'circle_burst' || effect.type === 'circle') {
        ctx.beginPath()
        ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2)
        ctx.strokeStyle = effect.color
        ctx.lineWidth = 2 * dpr
        ctx.stroke()

        if (effect.alpha > 0.4) {
          ctx.fillStyle = effect.color.replace(')', ', 0.1)').replace('rgb', 'rgba')
          ctx.fill()
        }
      }

      if (effect.particles) {
        effect.particles.forEach(p => {
          ctx.globalAlpha = Math.max(0, p.alpha)
          ctx.fillStyle = p.color || effect.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, (p.size || 3) * dpr, 0, Math.PI * 2)
          ctx.fill()
        })
      }

      if (effect.text) {
        ctx.font = `bold ${effect.fontSize * dpr}px monospace`
        ctx.fillStyle = effect.color
        ctx.textAlign = 'center'
        ctx.fillText(effect.text, effect.x, effect.y)
      }

      ctx.restore()
    })
  }

  // ======== BUFF 粒子特效（光环持续显示） ========
  proto._updateBuffParticles = function(dt) {
    if (this.isPaused) return
    if (this.phase !== 'auto_battle' && this.phase !== 'animating') return

    this._buffParticleTimer = (this._buffParticleTimer || 0) + dt
    const emitInterval = 0.5  // 每0.5秒发射一批粒子

    if (this._buffParticleTimer < emitInterval) return
    this._buffParticleTimer = 0

    const dpr = this.dpr
    // 遍历己方角色，有BUFF的发射金色粒子
    for (let i = 0; i < this.party.length; i++) {
      const hero = this.party[i]
      if (hero.hp <= 0) continue
      const effects = this.statusEffects.heroes[i] || []
      const hasBuff = effects.some(e => e.type === 'atk_up' && (e.turnsRemaining > 0 || e.duration > 0))
      if (!hasBuff) continue

      const state = this.unitStates[hero.id]
      const x = state ? state.x : (this.heroBasePositions[i] ? this.heroBasePositions[i].x : this.width * 0.3)
      const y = (state ? state.y : (this.heroBasePositions[i] ? this.heroBasePositions[i].y : this.height * 0.7)) - 40 * dpr

      // 发射3-5个金色粒子
      const count = 3 + Math.floor(Math.random() * 3)
      for (let j = 0; j < count; j++) {
        this.codeEffects.push({
          type: 'buff_particle',
          x: x + (Math.random() - 0.5) * 30 * dpr,
          y: y,
          vx: (Math.random() - 0.5) * 30 * dpr,
          vy: -40 * dpr - Math.random() * 60 * dpr,
          alpha: 0.8,
          color: Math.random() > 0.5 ? '#FFD700' : '#FFF8DC',
          radius: 2 * dpr + Math.random() * 2 * dpr,
          duration: 1.0,
          elapsed: 0,
        })
      }
    }
  }
  proto._startEnemyAttackAnimation = function(target, attackingEnemy) {
    const enemy = attackingEnemy || this.enemy
    if (!enemy || !enemy.id) return
    
    const targetIndex = this.party.indexOf(target)
    if (targetIndex === -1 || !this.heroBasePositions[targetIndex]) return

    const targetPos = this.heroBasePositions[targetIndex]
    const enemyIndex = this.enemies.indexOf(enemy)
    const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }
    
    // ★ 修复：使用 enemy.id 而不是 enemyIndex，防止敌人死亡后索引错位
    const animState = this.enemyAnimStates[enemy.id]
    const currentSkill = this._currentEnemySkill
    const isAoeSkill = currentSkill && (currentSkill.target === 'all' || currentSkill.aoe === true)
    const hasAttackFrames = animState && (animState.type === 'slime_cat' || animState.type === 'shadow_mouse')

    if (hasAttackFrames) {
      this.enemyAttacking = true
      this.enemyAttackTarget = target
      const isSkill = currentSkill && currentSkill.power > 1.0

      if (isAoeSkill || isSkill) {
        this.enemyAttackAnim = null
        animState.state = 'skill'
        animState.frame = animState.type === 'shadow_mouse' ? 1 : 50
        animState.displayFrame = 0
        animState.frameTimer = 0
        animState.attackDamageApplied = false
      } else {
        this.enemyAttackAnim = {
          phase: 'jump', progress: 0,
          baseX: enemyPos.x, baseY: enemyPos.y,
          targetX: targetPos.x - 30 * this.dpr, targetY: targetPos.y,
          currentX: enemyPos.x, currentY: enemyPos.y,
          enemy: enemy, hasFrameAnim: true
        }
      }

      animState.onAttackComplete = () => {
        if (!isAoeSkill && this.enemyAttackAnim) {
          this.enemyAttackAnim.phase = 'return'
          this.enemyAttackAnim.progress = 0
        } else {
          const eIdx = this.enemies.indexOf(enemy)
          this._clearAttackerFlag('enemy_' + eIdx)
          this.enemyAttacking = false
          this.enemyAttackTarget = null
          this._scheduleTimer(() => {
            if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
              this.phase = 'auto_battle'
            }
          }, 300)
        }
      }
    } else {
      this.enemyAttacking = true
      this.enemyAttackTarget = target
      this.enemyAttackAnim = {
        phase: 'jump', progress: 0,
        baseX: enemyPos.x, baseY: enemyPos.y,
        targetX: targetPos.x - 30 * this.dpr, targetY: targetPos.y,
        currentX: enemyPos.x, currentY: enemyPos.y,
        enemy: enemy
      }
    }
  }

  proto._updateEnemyAttackAnimation = function(dt) {
    if (!this.enemyAttackAnim || !this.enemyAttacking) return

    const anim = this.enemyAttackAnim
    const speed = 3.0   // 原4.0太快，降低到3.0让跳跃可见(~330ms)
    // ★ 关键修复：使用anim.enemy而非this.enemy（后者始终是enemies[0]）
    const attackingEnemy = anim.enemy || this.enemy
    const enemyIndex = this.enemies.indexOf(attackingEnemy)
    
    // ★ 修复：使用 attackingEnemy.id 而不是 enemyIndex，防止敌人死亡后索引错位
    const animState = attackingEnemy && attackingEnemy.id ? this.enemyAnimStates[attackingEnemy.id] : null

    if (anim.phase === 'jump') {
      anim.progress += dt * speed
      if (anim.progress >= 1) {
        if (anim.hasFrameAnim && animState) {
          anim.phase = 'anim_attack'
          anim.currentX = anim.targetX
          anim.currentY = anim.targetY
          animState.state = 'attack'
          animState.frame = animState.type === 'shadow_mouse' ? 1 : 8
          animState.displayFrame = 0
          animState.frameTimer = 0
          animState.attackDamageApplied = false
        } else {
          anim.progress = 0
          anim.phase = 'hit'
          anim.currentX = anim.targetX
          anim.currentY = anim.targetY
          this._applyEnemyAttackDamage(this.enemyAttackTarget, anim.enemy)
        }
      } else {
        const t = this._easeOutQuad(anim.progress)
        anim.currentX = anim.baseX + (anim.targetX - anim.baseX) * t
        anim.currentY = anim.baseY + (anim.targetY - anim.baseY) * t
        const jumpHeight = Math.sin(anim.progress * Math.PI) * 50 * this.dpr
        anim.currentY -= jumpHeight
      }
    } else if (anim.phase === 'anim_attack') {
      anim.currentX = anim.targetX
      anim.currentY = anim.targetY
    } else if (anim.phase === 'hit') {
      // 敌人命中阶段：延长停留时间让玩家看清
      anim.progress += dt * 2.5
      if (anim.progress >= 0.75) {   // 原0.25太短(~40ms)，现在约300ms
        anim.progress = 0
        anim.phase = 'return'
      }
    } else if (anim.phase === 'return') {
      anim.progress += dt * speed * 0.8
      if (anim.progress >= 1) {
        this.enemyAttacking = false
        this.enemyAttackAnim = null
        this.enemyAttackTarget = null
        const eIdx = this.enemies.indexOf(anim.enemy || this.enemy)
        this._clearAttackerFlag('enemy_' + eIdx)
        this._scheduleTimer(() => {
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

  // ======== 攻击者渲染 ========
  proto._renderAttackingHero = function(ctx) {
    if (!this.attackAnim || !this.attackingHero) return

    const hero = this.attackingHero
    const anim = this.attackAnim
    const dpr = this.dpr

    // ★ 防御：确保动画位置属性存在（防止 targetPos 为 undefined 导致 currentX/Y 缺失）
    if (anim.currentX === undefined || anim.currentX === null) anim.currentX = anim.baseX || this.width / 2
    if (anim.currentY === undefined || anim.currentY === null) anim.currentY = anim.baseY || this.height * 0.5
    if (anim.baseX === undefined || anim.baseX === null) anim.baseX = this.width * 0.25
    if (anim.baseY === undefined || anim.baseY === null) anim.baseY = this.height * 0.72

    const hAnimState = this.heroAnimStates[hero.id]

    // ★ 关键修复：cast状态不再直接return！改为正常绘制+施法特效
    const isCasting = !!(hAnimState && (hAnimState._isCastingSkill || hAnimState.state === 'cast'))

    // ★★★ 核心修复：根据当前动画状态选择正确的帧图像，而非使用静态默认图 ★★★
    let heroImg = null
    if (isCasting) {
      // ★★★ 李小宝：统一从 cast 精灵表（8帧横排 sprite sheet）按帧裁剪 ★★★
      // ★ 不用离屏canvas缓存，直接存 sheet+frameIdx，绘制时用 9参数 drawImage 裁切
      if (hero.id === 'lixiaobao') {
        const sheet = this.game.assets.get('LIXIAOBAO_CAST_SPRITESHEET')
        if (sheet) {
          const totalFrames = 8  // cast_universal.png: 8帧横排（2026-05-07新版去背）
          const frameW = Math.floor(sheet.width / totalFrames)
          const frameH = sheet.height
          const frameIdx = Math.min(hAnimState.frame || 0, totalFrames - 1)
          // 标记为精灵表模式，绘制时用 _drawSpriteFrame 裁切
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

      // 非李小宝 或 精灵表加载失败时走原有逻辑
      if (!heroImg) {
        const castEffectType = this.lastCastEffectType ? this.lastCastEffectType[hero.id] : null
        if (castEffectType && this.game.effects) {
          const frameInfo = this.game.effects.getCurrentFrame(castEffectType)
          if (frameInfo && frameInfo.image) {
            heroImg = frameInfo.image
          } else {
            const prefix = 'EFFECT_' + castEffectType.replace('_cast', '').toUpperCase() + '_CAST'
            const idx = Math.floor((this.time * 4) % 8)
            const key = prefix + '_' + String(idx + 1).padStart(2, '0')
            heroImg = this.game.assets.get(key)
          }
        }
      }
      if (!heroImg) {
        heroImg = this.game.assets.get(this._getHeroImageKey(hero.id))
      }
    } else {
      // 普通状态：统一走 shared 解析（与 renderer.js 共用）
      heroImg = this._resolveHeroSpriteImage(hero, hAnimState)
    }
    if (!heroImg) return  // 没有图片则跳过
    const avatarSize = 80 * dpr  // 与小镇/野外场景及renderer一致

    if (anim.phase === 'jump') {
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.arc(anim.baseX, anim.baseY, avatarSize / 2 * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 159, 67, 0.3)'
      ctx.fill()
      ctx.globalAlpha = 1
    } else if (anim.phase === 'hit') {
      // hit阶段：绘制攻击闪光圈 + 攻击帧动画
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.beginPath()
      ctx.arc(anim.currentX, anim.currentY, avatarSize * 0.8, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.save()
    ctx.translate(anim.currentX, anim.currentY)

    const heroFacesLeft = (hero.id === 'amy' || hero.id === 'annie' || hero.id === 'qianduoduo')
    const needsFlip = anim.currentX < anim.baseX ? !heroFacesLeft : heroFacesLeft
    const heroScale = this._getHeroScale(hero.id)
    const baseSize = avatarSize * heroScale

    // ★ 统一固定高度，和 idle 渲染大小完全一致（李小宝 cast 精灵表 206×337 不会放大）
    const imgW = heroImg ? (heroImg.width || 1) : 1
    const imgH = heroImg ? (heroImg.height || 1) : 1
    const aspect = imgW / imgH
    const drawH = baseSize
    const drawW = drawH * aspect

    // ★ 辅助函数：绘制图片（支持精灵表9参数裁切）
    const _drawHeroImg = function(img, dx, dy, dw, dh) {
      if (img && img._isSpriteSheet) {
        // 精灵表模式：从大图裁切指定帧区域绘制
        ctx.drawImage(img._sheet,
          img._frameX, img._frameY, img._frameW, img._frameH,  // 源区域（精灵表中第N帧）
          dx, dy, dw, dh)                                      // 目标区域
      } else if (img) {
        ctx.drawImage(img, dx, dy, dw, dh)
      }
    }

    if (needsFlip) {
      ctx.scale(-1, 1)
    }

    // ★ 根据动画状态选择不同的绘制方式（统一使用 drawW/drawH 按原图宽高比）
    if (anim.phase === 'hit' && hAnimState && !isCasting && heroImg) {
      // hit阶段：播放攻击帧动画+挥砍特效
      const hitProgress = anim.progress || 0
      const atkScale = 1.0 + Math.sin(hitProgress * Math.PI) * 0.15
      ctx.scale(atkScale, atkScale)
      _drawHeroImg(heroImg, -drawW / 2, -drawH, drawW, drawH)
      // 挥砍弧线特效
      if (hitProgress > 0.2 && hitProgress < 0.8) {
        const slashAlpha = Math.sin((hitProgress - 0.2) / 0.6 * Math.PI)
        ctx.globalAlpha = slashAlpha * 0.6
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3 * dpr
        ctx.beginPath()
        const arcRadius = drawW * 0.7
        ctx.arc(needsFlip ? arcRadius : -arcRadius, -drawH * 0.1, arcRadius,
                needsFlip ? -Math.PI * 0.6 : Math.PI * 0.4,
                needsFlip ? Math.PI * 0.4 : -Math.PI * 0.6)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    } else if (isCasting && heroImg) {
      // ★ Cast阶段：施法动画+光环粒子效果
      const castProgress = anim.progress || 0
      const breatheScale = 1.0 + Math.sin(castProgress * 4) * 0.05
      ctx.scale(breatheScale, breatheScale)
      _drawHeroImg(heroImg, -drawW / 2, -drawH, drawW, drawH)
      // 施法底座光环
      ctx.globalAlpha = 0.3 + Math.sin(castProgress * 3) * 0.15
      const glowGrad = ctx.createRadialGradient(0, drawH * 0.3, 0, 0, drawH * 0.3, drawH * 0.8)
      glowGrad.addColorStop(0, 'rgba(100, 180, 255, 0.4)')
      glowGrad.addColorStop(1, 'rgba(100, 180, 255, 0)')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.ellipse(0, drawH * 0.35, drawW * 0.6, drawH * 0.15, 0, 0, Math.PI * 2)
      ctx.fill()
      // 粒子上升效果（模拟魔力聚集）
      for (let i = 0; i < 3; i++) {
        const particleT = ((castProgress * 2 + i * 0.33) % 1)
        const px = Math.sin(i * 2.1 + castProgress) * drawW * 0.4
        const py = -drawH * 0.3 - particleT * drawH * 0.6
        ctx.globalAlpha = (1 - particleT) * 0.5
        ctx.fillStyle = i % 2 === 0 ? '#64b5f6' : '#fff'
        ctx.beginPath()
        ctx.arc(px, py, 2 * dpr * (1 - particleT * 0.5), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    } else {
      // jump/return阶段：静态头像（底部对齐）
      _drawHeroImg(heroImg, -drawW / 2, -drawH, drawW, drawH)
    }
    ctx.restore()
  }

  proto._renderAttackingEnemy = function(ctx) {
    if (!this.enemyAttackAnim || !this.enemyAttacking) return

    const anim = this.enemyAttackAnim
    // ★ 使用anim.enemy而非this.enemy，支持多敌人场景
    const enemy = anim.enemy || this.enemy
    const dpr = this.dpr
    const size = (enemy.isBoss ? 65 : 36) * dpr

    ctx.save()
    ctx.translate(anim.currentX, anim.currentY)

    // 阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.beginPath()
    ctx.ellipse(0, size * 0.35, size * 0.45, size * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()

    // 敌人精灵或占位符
    // ★ 修复：使用 enemy.id 而不是 enemyIndex，防止敌人死亡后索引错位
    const animState = enemy && enemy.id ? this.enemyAnimStates[enemy.id] : null
    if (animState) {
      const frameKey = this._getEnemyFrameKey(animState)
      const frameImg = this.game.assets.get(frameKey)
      if (frameImg) {
        const fw = 93, fh = 120
        const fs = (size * 2) / fh
        ctx.drawImage(frameImg, -fw * fs / 2, -fh * fs / 2, fw * fs, fh * fs)
      }
    } else {
      const bodyColor = enemy.isBoss ? '#ff4757' : (enemy.isElite ? '#a55eea' : '#7c5ce0')
      ctx.fillStyle = bodyColor
      ctx.beginPath()
      ctx.ellipse(0, 0, size * 0.55, size * 0.45, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }
}
