/**
 * battle-damage.js - 伤害计算与技能特效系统
 * 职责：攻击伤害结算、施法特效播放、命中特效、敌人技能效果、状态效果管理
 */

export function installBattleDamage(BattleSceneClass) {
  const proto = BattleSceneClass.prototype

  // ======== 缓动函数 ========
  proto._easeOutQuad = function(t) { return t * (2 - t) }
  proto._easeInQuad = function(t) { return t * t }

  // ======== 攻击动画系统（己方） ========
  proto._startAttackAnimation = function(hero, skill, target) {
    // ★ 测试模式：强制阻止所有英雄攻击动画
    if (this._testMode) {
      console.warn(`[Battle] ⚠️ 测试模式：阻止 ${hero.name} 的攻击动画！`)
      return  // 直接返回，不执行任何攻击逻辑
    }

    this.attackingHero = hero
    this.currentSkill = skill
    this.currentAttackTarget = target

    // ★ 攻击期间冻结AI移动（防止边打边走/跳跃）
    const uState = this.unitStates[hero.id]
    if (uState) uState.state = 'idle'

    const hIdx = this.party.indexOf(hero)
    const heroPos = this.heroBasePositions[hIdx]
    if (!heroPos || typeof heroPos.x !== 'number' || typeof heroPos.y !== 'number') {
      this.attackingHero = null; return
    }

    let targetPos
    if (target && this.enemies.includes(target)) {
      const eIdx = this.enemies.indexOf(target)
      targetPos = this.enemyPositions[eIdx] || { x: this.enemyBaseX, y: this.enemyBaseY }
    } else if (target && this.party.includes(target)) {
      const tIdx = this.party.indexOf(target)
      targetPos = this.heroBasePositions[tIdx] || { x: this.width / 2, y: this.height * 0.5 }
    } else if (target && target.x !== undefined) {
      // target 自带位置数据（如 unitState）
      targetPos = { x: target.x, y: target.y || this.height * 0.28 }
    } else {
      targetPos = { x: this.enemyBaseX, y: this.enemyBaseY }
    }

    // ★★★ 终极安全守卫：确保 targetPos 及其 .x/.y 绝对有效 ★★★
    if (!targetPos || typeof targetPos !== 'object') {
      console.warn('[Battle] targetPos 无效，使用默认值', { target: target?.name, hero: hero?.name })
      targetPos = { x: 0, y: 0 }
    }
    if (typeof targetPos.x !== 'number' || isNaN(targetPos.x)) targetPos.x = (this.enemyBaseX || this.width * 0.7) || 400
    if (typeof targetPos.y !== 'number' || isNaN(targetPos.y)) targetPos.y = (this.enemyBaseY || this.height * 0.28) || 200

    // 确保 dpr 存在
    if (!this.dpr || typeof this.dpr !== 'number') {
      console.warn('[Battle] dpr 无效，默认为1')
      this.dpr = 1
    }

    // 检查是否为法术/技能类型 → 走施法特效路线
    // ★ attack 类型即使附带 effect（如盾击stun）也走物理攻击路径，不走施法
    const isMagicSkill = (skill.type === 'magic' || skill.type === 'heal' || skill.type === 'heal_self' ||
                          skill.type === 'buff' || skill.type === 'debuff' || skill.type === 'summon')
    const hasSpecialEffect = (skill.type !== 'attack') &&
      !!(skill.effect || skill.target || skill.restrictChance || skill.statusEffect)

    if (isMagicSkill || hasSpecialEffect) {
      // 施法动画：原地播放 cast 特效，不跳跃
      this.phase = 'animating'  // ★ 与物理攻击保持一致
      this.attackAnim = {
        phase: 'cast',
        progress: 0,
        baseX: heroPos.x,
        baseY: heroPos.y,
        currentX: heroPos.x,
        currentY: heroPos.y,
        hero,
        skill,
        target,
        targetPos,
      }
      // 标记角色进入 casting 状态
      const hAnimState = this.heroAnimStates[hero.id]
      if (hAnimState) {
        hAnimState._isCastingSkill = true
        hAnimState.state = 'cast'
        hAnimState.frame = 0
        hAnimState.frameTimer = 0
      }
      // 播放施法特效
      this._playCastEffectWithCallback(hero, skill, heroPos, () => {
        // ★ 单体法术：在此处播放命中特效（目标位置固定）
        // ★ 范围法术（all/all_enemies）：不在此处播放，由 _applyAttackDamage 内部遍历每个目标分别播放
        const isAOE = (skill.target === 'all' || skill.target === 'all_enemies')
        if (!isAOE) {
          this._playHitEffect(hero, skill, targetPos)
        }
        // 施法特效完成后结算伤害
        this._applyAttackDamage(hero, target)
        this._finishHeroAttack(hero)
        // ★ 关键修复：将cast phase切换为return，让_updateAttackAnimation能继续推进并最终清除attackAnim
        // 否则attackAnim.phase永远停在'cast'，每帧return导致整个战斗系统永久死锁！
        if (this.attackAnim && this.attackAnim.phase === 'cast') {
          this.attackAnim.phase = 'cast_end'
          this.attackAnim.progress = 0
        }
      })
      return
    }

    // 物理攻击：原地攻击，不跳跃
    this.phase = 'animating'
    this.attackAnim = {
      phase: 'hit',
      progress: 0,
      baseX: heroPos.x,
      baseY: heroPos.y,
      targetX: heroPos.x,   // ★ 与base同位置 → return阶段无位移
      targetY: heroPos.y,
      currentX: heroPos.x,
      currentY: heroPos.y,
      hero,
      skill,
      target,
      targetPos,
    }
  }

  proto._updateAttackAnimation = function(dt) {
    if (!this.attackAnim || !this.attackingHero) return

    const anim = this.attackAnim
    const speed = 2.2   // 降低速度：原4.5太快(~220ms jump)，现在~450ms让玩家看清跳跃
    const dpr = this.dpr

    // ★ 防御：确保位置属性存在（防止 targetPos 为 undefined 导致 currentX/Y/targetX/Y 缺失）
    if (anim.currentX === undefined || anim.currentX === null) anim.currentX = anim.baseX || this.width * 0.25
    if (anim.currentY === undefined || anim.currentY === null) anim.currentY = anim.baseY || this.height * 0.72
    if (anim.baseX === undefined) anim.baseX = this.width * 0.25
    if (anim.baseY === undefined) anim.baseY = this.height * 0.72
    // ★ 防御：未设置 targetX/Y 时默认 = baseX/Y（不动，不跳到敌人位置）
    if (anim.targetX === undefined || anim.targetX === null) anim.targetX = anim.baseX || this.width * 0.25
    if (anim.targetY === undefined || anim.targetY === null) anim.targetY = anim.baseY || this.height * 0.72

    // cast 阶段：等待施法特效回调完成
    if (anim.phase === 'cast') {
      anim.progress += dt * 1.5
      // ★ 防死锁保护：如果cast回调迟迟不来（如effects系统异常），最多等3秒自动切换到cast_end
      if (anim.progress >= 4.5) {
        console.warn('[Battle] cast阶段超时(>3s)，强制推进到cast_end')
        anim.phase = 'cast_end'
        anim.progress = 0
      }
      return  // 等待回调触发 phase → 'cast_end'
    }

    // cast_end：施法特效已播完，短暂展示后返回原位
    if (anim.phase === 'cast_end') {
      anim.progress += dt * 2.5   // 约400ms的展示时间
      if (anim.progress >= 1.0) {
        // 切换到return阶段（cast没有位移，currentX==baseX，return会立即完成）
        anim.progress = 0
        anim.phase = 'return'
        // 确保位置正确（cast期间没有移动）
        anim.currentX = anim.baseX
        anim.currentY = anim.baseY
      }
      return
    }

    if (anim.phase === 'jump') {
      anim.progress += dt * speed
      if (anim.progress >= 1) {
        anim.progress = 0
        anim.phase = 'hit'
        anim.currentX = anim.targetX
        anim.currentY = anim.targetY
        // 触发命中特效和伤害结算
        this._playHitEffect(anim.hero, anim.skill, anim.targetPos)
        this._applyAttackDamage(anim.hero, anim.target)
      } else {
        const t = this._easeOutQuad(anim.progress)
        anim.currentX = anim.baseX + (anim.targetX - anim.baseX) * t
        anim.currentY = anim.baseY + (anim.targetY - anim.baseY) * t
        const jumpHeight = Math.sin(anim.progress * Math.PI) * 50 * dpr
        anim.currentY -= jumpHeight
      }
    } else if (anim.phase === 'hit') {
      // hit阶段：在目标位置停留展示攻击动作，原speed*3太快(~20ms)，改为固定300ms
      anim.progress += dt * 3.0
      if (anim.progress >= 0.9) {   // 原0.3太短(~20ms)，现在约300ms
        anim.progress = 0
        anim.phase = 'return'
        // ★ 播放命中特效（火球/冰晶/雷击的击中动画）
        this._playHitEffect(anim.hero, anim.skill, anim.targetPos)
        this._finishHeroAttack(anim.hero)
      }
    } else if (anim.phase === 'return') {
      anim.progress += dt * speed * 0.7  // return稍慢一点(原0.9)
      if (anim.progress >= 1) {
        this.attackingHero = null
        this.attackAnim = null
        this.currentSkill = null
        this.currentAttackTarget = null

        const heroId = anim.hero.id
        this.activeAttackers.delete(heroId)
        // 恢复角色状态
        const hAnimState = this.heroAnimStates[heroId]
        if (hAnimState) {
          hAnimState._isCastingSkill = false
          hAnimState.state = 'idle'
          hAnimState.frame = 1
        }

        this._scheduleTimer(() => {
          if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
            this.phase = 'auto_battle'
          }
        }, 150)
      } else {
        const t = this._easeInQuad(anim.progress)
        anim.currentX = anim.targetX + (anim.baseX - anim.targetX) * t
        anim.currentY = anim.targetY + (anim.baseY - anim.targetY) * t
      }
    }
  }

  // ======== 伤害结算 ========
  proto._applyAttackDamage = function(hero, target) {
    if (!target) {
      console.warn('[Battle] applyAttackDamage 无目标')
      return
    }
    const skill = this.currentSkill || { name: '攻击', power: 1.0, type: 'attack' }

    if (skill.type === 'heal' || skill.type === 'heal_self') {
      const healTarget = skill.type === 'heal_self' ? hero : target
      // ★ 修复：英雄只有 matk（无 magic 字段），旧代码读 hero.magic → NaN 污染 HP
      const matk = hero.matk || hero.atk || 0
      const healAmount = Math.floor((skill.power || 0) + matk * (skill.healMatk != null ? skill.healMatk : 1))
      healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount)
      const pos = this._getEntityPosition(healTarget)
      this.damageTexts.push({
        text: `+${healAmount}`,
        x: pos.x,
        y: pos.y - 50 * this.dpr,
        color: '#2ed573',
        life: 1.5
      })
      this._addLog(`${hero.name} 使用「${skill.name}」恢复了 ${healAmount} 点生命！`)
      return
    }

    if (skill.target === 'all' || skill.target === 'all_enemies') {
      this.enemies.forEach((enemy, idx) => {
        if (enemy.hp <= 0) return
        const ePos = this.enemyPositions[idx]
        // ★ 范围伤害：每个目标各自播放命中特效
        this._playHitEffect(hero, skill, ePos)
        this._applyAttackDamageToTarget(hero, skill, enemy, ePos)
      })
      this._addLog(`${hero.name} 使用「${skill.name}」攻击全体敌人！`)
      return
    }

    if (this.enemies.includes(target)) {
      this._applyAttackDamageToTarget(hero, skill, target, this.enemyPositions[this.enemies.indexOf(target)])
    } else if (this.party.includes(target)) {
      this._applyAttackDamageToTarget(hero, skill, target, this.heroBasePositions[this.party.indexOf(target)])
    }
  }

  proto._getEntityPosition = function(entity) {
    const eIdx = this.enemies.indexOf(entity)
    if (eIdx >= 0) return this.enemyPositions[eIdx] || { x: this.width / 2, y: this.height / 2 }
    const pIdx = this.party.indexOf(entity)
    if (pIdx >= 0) return this.heroBasePositions[pIdx] || { x: this.width / 2, y: this.height / 2 }
    return { x: this.width / 2, y: this.height / 2 }
  }

  proto._applyAttackDamageToTarget = function(hero, skill, target, targetPos) {
    if (!target || target.hp <= 0) return

    // ★ 安全守卫：确保 targetPos 有效
    if (!targetPos || typeof targetPos.x !== 'number') {
      targetPos = this._getEntityPosition(target)
    }
    if (!targetPos || typeof targetPos.x !== 'number') {
      targetPos = { x: this.width / 2, y: this.height * 0.4 }
    }

    const effectiveAtk = this._getEffectiveAtk(hero)
    let targetDef = 0
    let isCrit = false
    let damage = Math.floor(effectiveAtk * (skill.power || 1.0))

    // 暴击判定
    const critChance = (hero.crit || 0.05) + (skill.critBonus || 0)
    if (Math.random() < critChance) {
      isCrit = true
      damage = Math.floor(damage * (1.6 + Math.random() * 0.4))
    }

    if (this.enemies.includes(target)) {
      targetDef = this._getEnemyEffectiveDef(target)
    } else {
      targetDef = this._getEffectiveDef(target)
    }

    damage = Math.max(1, damage - Math.floor(targetDef * 0.4) + Math.floor(Math.random() * 4) - 1)

    // 状态效果加成（灼烧等）
    // ★ 修复：使用 target.id 而不是索引
    if (this.enemies.includes(target)) {
      const targetId = target.id
      if (targetId) {
        const effects = this.statusEffects.enemies[targetId] || []
        effects.forEach(e => {
          if (e.type === 'burned' && e.turnsRemaining > 0) {
            const burnDmg = Math.floor(damage * 0.05)
            damage += burnDmg
          }
        })
      }
    }

    target.hp = Math.max(0, target.hp - damage)

    // ★ 累计伤害统计（用于战斗结束画面）
    if (!this._totalDamageDealt) this._totalDamageDealt = 0
    this._totalDamageDealt += damage

    // ★ 打击感优化1: Hit Stop（命中停顿）
    this._startHitStop(0.08) // 80ms 停顿，足够感知但不会太长

    // ★ 打击感优化2: 受击闪白
    if (this.enemies.includes(target)) {
      const targetIdx = this.enemies.indexOf(target)
      this._startFlashWhite('enemy_' + targetIdx)
    } else {
      this._startFlashWhite(target.id)
    }

    // ★ P2-15: 受击击退 — 敌人被打时向远离攻击者方向小幅位移
    if (this.enemies.includes(target) && target.hp > 0) {
      const targetIdx = this.enemies.indexOf(target)
      const tState = this.unitStates['enemy_' + targetIdx]
      if (tState) {
        // 击退方向：从攻击者指向目标
        const hState = this.unitStates[hero.id]
        if (hState) {
          const dx = tState.x - hState.x
          const dy = tState.y - hState.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          // 击退力度：基础8px + 暴击额外8px
          const knockback = (8 + (isCrit ? 8 : 0)) * this.dpr
          let newX = tState.x + (dx / dist) * knockback
          let newY = tState.y + (dy / dist) * knockback
          // 钳制到战场边界
          const clamped = this._clampTargetToBattlefield ? this._clampTargetToBattlefield(newX, newY) : { x: newX, y: newY }
          tState.x = clamped.x
          tState.y = clamped.y
          if (this.enemyPositions[targetIdx]) {
            this.enemyPositions[targetIdx].x = clamped.x
            this.enemyPositions[targetIdx].y = clamped.y
          }
        }
        // ★ 受击硬直：短暂打断敌人攻击计时
        const eTimer = this.enemyAttackTimers[target.id]
        if (eTimer && !eTimer._hitStunUntil) {
          const stunDuration = isCrit ? 0.4 : 0.2  // 暴击0.4秒，普通0.2秒
          eTimer._hitStunUntil = (this.time || Date.now() / 1000) + stunDuration
          // 重置攻击蓄力进度
          if (eTimer.attackTimer > 0) {
            eTimer.attackTimer = Math.max(0, eTimer.attackTimer - stunDuration)
          }
        }
        // ★ 受击打断攻击动画：如果敌人正在攻击中，暴击时中断
        if (tState.state === 'attacking' && isCrit) {
          tState.state = 'idle'
        }
      }
    }

    // 伤害数字
    const finalPos = targetPos || this._getEntityPosition(target)
    this.damageTexts.push({
      text: `-${damage}${isCrit ? '!' : ''}`,
      x: finalPos.x,
      y: finalPos.y - 60 * this.dpr,
      color: isCrit ? '#FFD700' : '#ff4757',
      life: isCrit ? 1.8 : 1.2,
      maxLife: isCrit ? 1.8 : 1.2, // 保存初始生命周期用于动画计算
      _startY: finalPos.y - 60 * this.dpr, // 保存起始Y坐标
      isCrit
    })

    // ★ 史莱姆猫分裂：被攻击时30%几率分裂
    if (target && target.hp > 0 && (target.id === 'slime_cat' || target.type === 'slime_cat')) {
      this._trySplitSlimeCat(target, this.enemies.indexOf(target), finalPos)
    }

    // 状态效果触发
    if (skill.statusEffect && target && target.id) {
      const idx = this.enemies.includes(target) ? this.enemies.indexOf(target) : this.party.indexOf(target)
      if (idx >= 0) this._applyStatusEffectToEnemy(skill.statusEffect, idx, finalPos)
    }

    // 屏幕震动
    this.shakeAmount = Math.min(12, (damage / 20) * this.dpr + (isCrit ? 3 * this.dpr : 0))

    // 闪光
    if (isCrit || damage > 50) {
      this.flashAlpha = Math.min(0.35, 0.1 + (damage / 300))
    }

    // 日志
    const targetName = target.name || '未知'
    this._addLog(`${hero.name} 的「${skill.name}」对 ${targetName} 造成 ${damage} 点伤害${isCrit ? '（暴击！）' : ''}`)
  }

  proto._applyEnemyDamageToHero = function(enemy, skill, target) {
    const effectiveEnemyAtk = this._getEnemyEffectiveAtk(enemy)
    const effectiveHeroDef = this._getEffectiveDef(target)
    let damage = Math.floor(effectiveEnemyAtk * (skill.power || 1.0) - effectiveHeroDef * 0.4)
    damage = Math.max(1, damage + Math.floor(Math.random() * 4) - 1)

    // 暴击
    const critChance = enemy.crit || 0.08
    const isCrit = Math.random() < critChance
    if (isCrit) damage = Math.floor(damage * 1.7)

    // 黏液覆盖增加受傷
    const heroIndex = this.party.indexOf(target)
    if (heroIndex >= 0) {
      const effects = this.statusEffects.heroes[heroIndex] || []
      const isSlimed = effects.some(e => e.type === 'slimed' && e.turnsRemaining > 0)
      if (isSlimed) {
        damage = Math.floor(damage * 1.15)
        this._addLog(`黏液覆盖使 ${target.name} 受到的伤害增加15%！`)
      }
      // ★ 护盾吸收伤害
      const shield = effects.find(e => e.type === 'shield' && (e.duration > 0 || e.turnsRemaining > 0))
      if (shield) {
        const absorbed = Math.min(damage, shield.value)
        shield.value -= absorbed
        damage -= absorbed
        if (shield.value <= 0) {
          this.statusEffects.heroes[heroIndex] = effects.filter(e => e !== shield)
        }
      }
    }

    target.hp = Math.max(0, target.hp - damage)

    const pos = this.heroBasePositions[heroIndex] || { x: this.width / 2, y: this.height / 2 }
    this.damageTexts.push({
      text: `-${damage}`,
      x: pos.x,
      y: pos.y - 60 * this.dpr,
      color: isCrit ? '#FFD700' : '#FF4757',
      life: 1.5,
      maxLife: 1.5, // 保存初始生命周期
      _startY: pos.y - 60 * this.dpr, // 保存起始Y坐标
      isCrit
    })

    this.shakeAmount = Math.min(10, (damage / 25) * this.dpr)
    this._addLog(`${enemy.name} 的「${skill.name || '攻击'}」对 ${target.name} 造成 ${damage} 点伤害`)

    // 检查角色死亡
    if (target.hp <= 0) {
      this._addLog(`💔 ${target.name} 倒下了！`)
      const state = this.unitStates[target.id]
      if (state) state.state = 'dead'
    }
  }

  // ======== 状态效果应用 ========
  proto._applyStatusEffectToEnemy = function(effectType, enemyIndex, pos) {
    // ★ 修复：使用 enemy.id 作为键，从敌人对象获取id
    const enemy = this.enemies[enemyIndex]
    if (!enemy) return
    
    const enemyId = enemy.id
    if (!enemyId) {
      console.error('[BUFF错误] _applyStatusEffectToEnemy: 敌人没有id', enemy.name)
      return
    }
    
    if (!this.statusEffects.enemies[enemyId]) {
      this.statusEffects.enemies[enemyId] = []
    }
    const existing = this.statusEffects.enemies[enemyId].find(e => e.type === effectType)
    if (existing) {
      // ★ 眩晕：刷新持续时间而不是叠加
      if (effectType === 'stunned') {
        existing.duration = 1
        existing.turnsRemaining = 1
      } else {
        existing.duration = (existing.duration || 3) + 2
      }
      return
    }
    // ★ 眩晕1秒，其他状态3回合
    const isStun = (effectType === 'stunned')
    const dur = isStun ? 1 : 3
    this.statusEffects.enemies[enemyId].push({
      type: effectType,
      duration: dur,
      turnsRemaining: dur
    })

    const effectNames = { burned: '🔥 灼烧', frozen: '❄️ 冰冻', poisoned: '☠️ 中毒', stunned: '💫 眩晕' }
    this.damageTexts.push({
      text: effectNames[effectType] || effectType,
      x: pos.x,
      y: pos.y - 90 * this.dpr,
      color: effectType === 'burned' ? '#FF6B35' : effectType === 'frozen' ? '#74B9FF' : effectType === 'stunned' ? '#FFD700' : '#a55eea',
      life: 2.0,
      type: `${effectType}_effect`
    })
  }

  // ======== 施法特效系统 ========
  proto._playCastEffectWithCallback = function(hero, skill, heroPos, onDone) {
    const dpr = this.dpr

    // 记录 cast 特效类型（★ 加 _cast 后缀匹配 SkillEffectManager 的内部命名）
    const effectType = this._getCastEffectType(skill)
    if (effectType) {
      this.lastCastEffectType[hero.id] = effectType + '_cast'
    }

    // ★ BUFF/治疗无独立特效 → 直接回调
    if (!effectType) {
      if (onDone) this._scheduleTimer(onDone, 600)
      return
    }

    // 使用统一的特效管理器播放
    if (this.game.effects && typeof this.game.effects.playCastEffect === 'function') {
      this.game.effects.playCastEffect(effectType, heroPos.x, heroPos.y, dpr, () => {
        if (onDone) onDone()
      })
      return
    }

    // fallback: 直接回调
    console.log(`[Battle] ${hero.name} 施展「${skill.name}」（无特效资源）`)
    this.damageTexts.push({
      text: `✨ ${skill.name}!`,
      x: heroPos.x,
      y: heroPos.y - 70 * dpr,
      color: this._getSkillGlowColor(skill.id),
      life: 1.0
    })
    if (onDone) this._scheduleTimer(onDone, 600)  // 原200ms太短看不清，增加到600ms
  }

  proto._playCastEffect = function(hero, skill, heroPos) {
    this._playCastEffectWithCallback(hero, skill, heroPos, null)
  }

  proto._getCastEffectType = function(skill) {
    if (!skill || !skill.id) return null
    // ★ BUFF/治疗类型没有独立cast特效，用角色自身动画即可
    if (skill.type === 'buff' || skill.type === 'heal' || skill.type === 'heal_self') return null
    const effectMap = {
      fireball: 'fireball', ice_shard: 'ice_shard', thunder: 'lightning',
      staff_strike: 'cast_universal',  // ★ 李小宝普攻cast（统一精灵表）
      slash: 'slash', shield_bash: 'shield_bash',
      mana_shield: 'mana_shield', cat_paw: 'cat_paw', punch: 'punch'
    }
    return effectMap[skill.id] || null
  }

  // ======== 命中特效 ========
  proto._playHitEffect = function(hero, skill, targetPos) {
    const dpr = this.dpr
    const effectType = this._getHitEffectType(skill)

    // ★ 防御：确保 targetPos 有效（物理攻击 anim 对象曾遗漏 targetPos 属性）
    if (!targetPos || typeof targetPos.x !== 'number') {
      targetPos = this._getEntityPosition(this.currentAttackTarget) || { x: this.width / 2, y: this.height * 0.4 }
    }

    if (this.game.effects && typeof this.game.effects.playHitEffect === 'function') {
      this.game.effects.playHitEffect(effectType, targetPos.x, targetPos.y, dpr)
      return
    }

    // fallback: 简单闪光
    this.flashAlpha = 0.15
    this.codeEffects.push({
      type: 'circle_burst',
      x: targetPos.x,
      y: targetPos.y,
      radius: 30 * dpr,
      maxRadius: 80 * dpr,
      alpha: 0.8,
      color: '#ffffff',
      duration: 0.25,
      elapsed: 0
    })
  }

  proto._getHitEffectType = function(skill) {
    // ★ 先按具体技能ID匹配，再按类型兜底
    if (skill.id === 'fireball') return 'fire_impact'
    if (skill.id === 'ice_shard') return 'ice_impact'
    if (skill.id === 'thunder') return 'magic_impact'  // thunder映射lightning_hit
    if (skill.id === 'shadow_ball') return 'magic_impact'  // 暗影球也是魔法
    // ★ 物理/攻击类（含附带效果的如盾击stun、战吼等）→ 物理打击特效
    if (skill.type === 'attack') return 'physical_impact'
    // 只有纯魔法类型才用闪电命中特效
    if (skill.type === 'magic') return 'magic_impact'
    if (skill.type === 'heal' || skill.type === 'heal_self') return 'heal_impact'
    return 'physical_impact'
  }

  // ======== 敌人攻击伤害结算 ========
  proto._applyEnemyAttackDamage = function(target, attackingEnemy) {
    const enemy = attackingEnemy || this.enemy
    const skill = this._currentEnemySkill || { name: '攻击', power: 1.0, type: 'attack' }
    
    // ★ 调试日志：追踪技能执行流程
    if (skill && skill.name === '圣盾之光') {
      console.log(`[技能调试] 圣盾之光 被调用 ( _applyEnemyAttackDamage )`)
      console.log(`  敌人: ${enemy.name}`)
      console.log(`  技能类型: ${skill.type}`)
      console.log(`  技能效果: ${skill.effect}`)
      console.log(`  当前Phase: ${this.phase}`)
      console.log(`  ⚠️ 警告：BUFF技能不应该执行伤害结算！`)
    }

    // ★ 隐身检查：如果敌人处于隐身状态，不可被攻击
    // ★ 修复：使用 enemy.id 而不是索引
    const enemyId = enemy.id
    if (enemyId) {
      const enemyEffects = this.statusEffects.enemies[enemyId] || []
      const invisEffect = enemyEffects.find(e => e.type === 'invisible')
      if (invisEffect && invisEffect.startTime && this.time - invisEffect.startTime < invisEffect.duration) {
        this._addLog(`🌙 ${enemy.name} 处于隐身状态，无法被攻击！`)
        return
      }
    }

    if (skill.type === 'heal_self') {
      const healAmount = skill.healAmount || 30
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + healAmount)
      const enemyIndex = this.enemies.indexOf(enemy)
      const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }
      this.damageTexts.push({
        text: `+${healAmount}`,
        x: enemyPos.x,
        y: enemyPos.y - 50 * this.dpr,
        color: '#2ed573',
        life: 1.5
      })
      this._addLog(`${enemy.name} 使用「${skill.name}」！`)
      this._addLog(`恢复了 ${healAmount} 点生命！`)
      return
    }

    // ★ summon（召唤）：在敌人附近生成新的小怪
    if (skill.type === 'summon') {
      this._executeEnemySummon(enemy, skill)
      return
    }

    // ★ buff（增益）：对自身施加增益效果
    if (skill.type === 'buff') {
      this._applyEnemyBuff(enemy, skill)
      return
    }

    const effectiveEnemyAtk = this._getEnemyEffectiveAtk(enemy)
    const effectiveHeroDef = this._getEffectiveDef(target)
    let damage = Math.floor(effectiveEnemyAtk * (skill.power || 1.0) - effectiveHeroDef * 0.4)
    damage = Math.max(1, damage + Math.floor(Math.random() * 4) - 1)

    const critChance = enemy.crit || 0.08
    const isCrit = Math.random() < critChance
    if (isCrit) damage = Math.floor(damage * 1.7)

    const heroIndex = this.party.indexOf(target)
    if (heroIndex >= 0) {
      const effects = this.statusEffects.heroes[heroIndex] || []
      const isSlimed = effects.some(e => e.type === 'slimed' && e.turnsRemaining > 0)
      if (isSlimed) {
        damage = Math.floor(damage * 1.15)
        this._addLog(`黏液覆盖使 ${target.name} 受到的伤害增加15%！`)
      }
      // ★ 护盾吸收伤害
      const shield = effects.find(e => e.type === 'shield' && (e.duration > 0 || e.turnsRemaining > 0))
      if (shield) {
        const absorbed = Math.min(damage, shield.value)
        shield.value -= absorbed
        damage -= absorbed
        if (shield.value <= 0) {
          this.statusEffects.heroes[heroIndex] = effects.filter(e => e !== shield)
        }
      }
    }

    target.hp = Math.max(0, target.hp - damage)

    // ★ 累计受到伤害统计（用于战斗结束画面）
    if (!this._totalDamageReceived) this._totalDamageReceived = 0
    this._totalDamageReceived += damage

    // ★ P2-15: 英雄受击击退
    if (target.hp > 0 && heroIndex >= 0) {
      const hState = this.unitStates[target.id]
      if (hState) {
        const eState = this.unitStates['enemy_' + this.enemies.indexOf(enemy)]
        if (eState) {
          const dx = hState.x - eState.x
          const dy = hState.y - eState.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const knockback = (6 + (isCrit ? 6 : 0)) * this.dpr
          let newX = hState.x + (dx / dist) * knockback
          let newY = hState.y + (dy / dist) * knockback
          const clamped = this._clampTargetToBattlefield ? this._clampTargetToBattlefield(newX, newY) : { x: newX, y: newY }
          hState.x = clamped.x
          hState.y = clamped.y
          if (this.heroBasePositions[heroIndex]) {
            this.heroBasePositions[heroIndex].x = clamped.x
            this.heroBasePositions[heroIndex].y = clamped.y
          }
        }
        // ★ 受击硬直：暴击时短暂延迟英雄攻击
        if (isCrit) {
          const hTimer = this.heroAttackTimers[target.id]
          if (hTimer && hTimer.attackTimer > 0) {
            hTimer.attackTimer = Math.max(0, hTimer.attackTimer - 0.3)
          }
        }
      }
    }

    const pos = this.heroBasePositions[heroIndex] || { x: this.width / 2, y: this.height / 2 }
    this.damageTexts.push({
      text: `-${damage}`,
      x: pos.x,
      y: pos.y - 60 * this.dpr,
      color: isCrit ? '#FFD700' : '#FF4757',
      life: 1.5,
      isCrit
    })

    this.shakeAmount = Math.min(10, (damage / 25) * this.dpr)
    this._addLog(`${enemy.name} 的「${skill.name || '攻击'}」对 ${target.name} 造成 ${damage} 点伤害`)

    // ★ drain（生命吸取）：回复造成伤害的 drainPercent%（默认50%，暗影咬100%）
    if ((skill.effect === 'drain' || skill.effect === 'lifesteal') && damage > 0) {
      const drainPercent = skill.drainPercent || 0.5  // 默认50%
      const healAmt = Math.max(1, Math.floor(damage * drainPercent))
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + healAmt)
      const enemyIndex = this.enemies.indexOf(enemy)
      const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }
      this.damageTexts.push({
        text: `+${healAmt}`,
        x: enemyPos.x,
        y: enemyPos.y - 50 * this.dpr,
        color: '#2ed573',
        life: 1.5,
        type: 'drain_heal'
      })
      this._addLog(`🩸 ${enemy.name} 吸取了 ${healAmt} 点生命！`)
    }

    // ★ 应用技能附加效果（stun、slime等）
    if (skill.effect) {
      const heroIndex = this.party.indexOf(target)
      const heroPos = this.heroBasePositions[heroIndex] || targetPos
      this._applyEnemySkillStatus(skill, target, heroPos)
    }

    if (target.hp <= 0) {
      this._addLog(`💔 ${target.name} 倒下了！`)
      const state = this.unitStates[target.id]
      if (state) state.state = 'dead'
    }
  }

  // ======== 敌人技能状态效果 ========
  proto._playEnemySkillEffect = function(skill, targetPos) {
    const dpr = this.dpr
    this.flashAlpha = 0.2
    this.codeEffects.push({
      type: 'circle_burst',
      x: targetPos.x,
      y: targetPos.y,
      radius: 20 * dpr,
      maxRadius: 100 * dpr,
      alpha: 0.7,
      color: '#FF6B35',
      duration: 0.4,
      elapsed: 0
    })
  }

  proto._applyEnemySkillStatus = function(skill, target, targetPos) {
    if (!skill || !skill.effect) return

    const targetIndex = this.party.indexOf(target)
    if (targetIndex === -1) return

    if (!this.statusEffects.heroes[targetIndex]) {
      this.statusEffects.heroes[targetIndex] = []
    }

    // ★ stun 效果：眩晕目标1秒（与英雄盾击眩晕对称）
    if (skill.effect === 'stun') {
      const existing = this.statusEffects.heroes[targetIndex].find(e => e.type === 'stunned')
      if (existing) {
        existing.duration = 1
        this._addLog(`💫 ${target.name} 再次被眩晕1秒！`)
      } else {
        this.statusEffects.heroes[targetIndex].push({ type: 'stunned', duration: 1 })
        this._addLog(`💫 ${target.name} 被眩晕1秒，无法行动！`)
        this.damageTexts.push({
          text: '💫眩晕1秒',
          x: targetPos ? targetPos.x : 0,
          y: targetPos ? targetPos.y - 100 * this.dpr : 0,
          color: '#FFD700',
          life: 2.0,
          type: 'stun_effect'
        })
      }
      return
    }

    if (skill.effect === 'slime_spray') {
      const existing = this.statusEffects.heroes[targetIndex].find(e => e.type === 'slimed')
      if (existing) {
        existing.turnsRemaining = 2
        this._addLog(`🟢 ${target.name} 被黏液覆盖！效果已刷新（2回合）`)
      } else {
        this.statusEffects.heroes[targetIndex].push({ type: 'slimed', turnsRemaining: 2 })
        this._addLog(`🟢 ${target.name} 被黏液覆盖！持续2回合`)
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
      let restrictChance = skill.restrictChance || 0.3
      const hasSlimed = this.statusEffects.heroes[targetIndex].some(e => e.type === 'slimed')
      if (hasSlimed) {
        restrictChance = Math.min(1, restrictChance * 1.5)
        this._addLog(`🟢 黏液覆盖加成！限制概率提升至 ${Math.round(restrictChance * 100)}%`)
      }

      if (Math.random() < restrictChance) {
        const existing = this.statusEffects.heroes[targetIndex].find(e => e.type === 'restricted')
        if (existing) {
          existing.duration = Math.max(existing.duration || 0, 1.5)
          this._addLog(`🔗 ${target.name} 再次被黏液包裹限制！`)
        } else {
          // ★ 改为 duration=1.5秒，禁止移动
          this.statusEffects.heroes[targetIndex].push({ type: 'restricted', duration: 1.5 })
          this._addLog(`🔗 ${target.name} 被黏液包裹，无法移动1.5秒！`)
          this.damageTexts.push({
            text: '禁锢1.5秒',
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

      if (hasSlimed) {
        this.statusEffects.heroes[targetIndex] =
          this.statusEffects.heroes[targetIndex].filter(e => e.type !== 'slimed')
        this._addLog(`🟢 ${target.name} 的黏液覆盖效果被消耗`)
      }
      } else if (skill.effect === 'defense_up') {
      // ★ defense_up：给施法者自身加防御buff（塔楼守护者的"钢铁防御"）
      const enemy = this._attackingEnemy || this.enemy
      const enemyId = enemy ? enemy.id : null
      if (enemyId) {
        if (!this.statusEffects.enemies[enemyId]) {
          this.statusEffects.enemies[enemyId] = []
        }
        const existing = this.statusEffects.enemies[enemyId].find(e => e.type === 'def_up')
        if (existing) {
          existing.duration = 8
          this._addLog(`🛡️ ${enemy.name} 的防御提升已刷新！`)
        } else {
          this.statusEffects.enemies[enemyId].push({ type: 'def_up', duration: 8 })
          this._addLog(`🛡️ ${enemy.name} 防御力大幅提升！持续8秒`)
        }
      }
    }
    // drain 效果已在 _applyEnemyAttackDamage 中直接处理（吸血 = 造成伤害的50%）
  }

  // ======== 敌人召唤技能 ========
  proto._executeEnemySummon = function(enemy, skill) {
    const summonId = skill.summonId || 'wild_cat'
    const maxSummons = skill.summonCount || 1
    const maxEnemies = 8  // 场上最大敌人数

    // 检查场上敌人数
    const aliveEnemies = this.enemies.filter(e => e.hp > 0)
    if (aliveEnemies.length >= maxEnemies) {
      this._addLog(`${enemy.name} 试图召唤，但战场已满！`)
      return
    }

    // 从ENEMIES_CH1获取召唤怪数据
    let summonData = null
    if (this._enemyDataMap && this._enemyDataMap[summonId]) {
      summonData = this._enemyDataMap[summonId]
    } else {
      // 兜底：硬编码野猫数据
      summonData = {
        id: 'wild_cat', name: '坏猫', level: 1,
        maxHp: 40, atk: 10, def: 4, spd: 9,
        skills: [{ name: '抓挠', power: 1.2, type: 'attack' }],
        exp: 10, gold: 5
      }
    }

    const actualCount = Math.min(maxSummons, maxEnemies - aliveEnemies.length)
    const enemyIndex = this.enemies.indexOf(enemy)
    const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }
    const dpr = this.dpr

    for (let s = 0; s < actualCount; s++) {
      // 在召唤者附近随机位置生成
      const offsetX = (Math.random() - 0.5) * 80 * dpr
      const offsetY = (Math.random() - 0.3) * 40 * dpr
      const spawnX = enemyPos.x + offsetX
      const spawnY = Math.min(enemyPos.y + offsetY, this.height * 0.82)

      // 深拷贝召唤怪数据
      const clone = { ...summonData, hp: summonData.maxHp, maxMp: 20, mp: 20 }
      if (summonData.skills) clone.skills = summonData.skills.map(s => ({ ...s }))

      // 使用已有的_spawnEnemyAt方法（如果有）或手动添加
      this._spawnEnemyAt(clone, spawnX, spawnY)
    }

    this._addLog(`🌀 ${enemy.name} 使用「${skill.name}」召唤了 ${actualCount} 只${summonData.name || '小怪'}！`)

    // 召唤特效
    this.flashAlpha = 0.3
    this.codeEffects.push({
      type: 'circle_burst',
      x: enemyPos.x,
      y: enemyPos.y,
      radius: 10 * dpr,
      maxRadius: 120 * dpr,
      alpha: 0.8,
      color: '#9B59B6',
      duration: 0.6,
      elapsed: 0
    })
  }

  // ======== 敌人增益技能 ========
  proto._applyEnemyBuff = function(enemy, skill) {
    // ★ 修复：使用 enemy.id 作为键，而不是索引（避免敌人顺序变化导致状态污染）
    const enemyId = enemy.id
    if (!enemyId) {
      console.error('[BUFF错误] _applyEnemyBuff: 敌人没有id', enemy.name)
      return
    }
    
    // ★ 调试日志：追踪BUFF技能执行
    console.log(`[BUFF调试] _applyEnemyBuff 被调用`)
    console.log(`  敌人: ${enemy.name} (id=${enemyId})`)
    console.log(`  技能: ${skill.name} (type=${skill.type}, effect=${skill.effect})`)
    console.log(`  当前Phase: ${this.phase}, enemyAttacking: ${this.enemyAttacking}`)

    if (!this.statusEffects.enemies[enemyId]) {
      this.statusEffects.enemies[enemyId] = []
    }

    // ★ 调试日志（BUFF 测试模式）
    if (this._buffTestMode) {
      console.log(`[BUFF测试] _applyEnemyBuff 被调用`)
      console.log(`  敌人: ${enemy.name} (id=${enemyId})`)
      console.log(`  技能: ${skill.name}`)
      console.log(`  effect: ${skill.effect}`)
      console.log(`  value: ${skill.value}`)
      console.log(`  duration: ${skill.duration}`)
    }

    // ★ 隐身效果（暗影突袭）
    if (skill.effect === 'invisible') {
      const duration = skill.duration || 5
      this.statusEffects.enemies[enemyId].push({
        type: 'invisible',
        duration: duration,
        startTime: this.time
      })
      this._addLog(`🌙 ${enemy.name} 使用「${skill.name}」！进入隐身状态，持续${duration}秒！`)
      
      // ★ 获取敌人索引（用于播放动画）
      const enemyIndex = this.enemies.indexOf(enemy)
      
      // ★ 播放隐身动画（buff动画帧）
      const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }
      this._playInvisibleAnimation(enemy, enemyIndex, enemyPos)
      return
    }

    // ★ 防御力提升（艾米的"圣盾之光"）
    if (skill.effect === 'def_up' || skill.effect === 'defense_up') {
      const value = skill.value || 0.3  // 默认提升30%
      const duration = (skill.duration || 3) * 2  // 转换为帧数（假设1秒=2帧）
      
      // 检查是否已有同名buff（刷新持续时间）
      const existing = this.statusEffects.enemies[enemyId].find(e => e.type === 'def_up')
      if (existing) {
        existing.duration = duration
        this._addLog(`🛡️ ${enemy.name} 的「${skill.name}」已刷新！防御力提升${value * 100}%，持续${skill.duration}秒`)
        if (this._buffTestMode) {
          console.log(`[BUFF测试] 刷新已有 def_up buff, 新持续时间: ${duration}`)
        }
      } else {
        this.statusEffects.enemies[enemyId].push({
          type: 'def_up',
          value: value,
          duration: duration
        })
        this._addLog(`🛡️ ${enemy.name} 使用「${skill.name}」！防御力提升${value * 100}%，持续${skill.duration}秒`)
        if (this._buffTestMode) {
          console.log(`[BUFF测试] 新增 def_up buff, 值: ${value}, 持续时间: ${duration}`)
        }
      }
    } else if (skill.effect === 'atk_up' || skill.effect === 'attack_up') {
      // 攻击力提升
      const value = skill.value || 0.3
      const duration = (skill.duration || 3) * 2
      
      const existing = this.statusEffects.enemies[enemyId].find(e => e.type === 'atk_up')
      if (existing) {
        existing.duration = duration
        this._addLog(`⚔️ ${enemy.name} 的「${skill.name}」已刷新！攻击力提升${value * 100}%，持续${skill.duration}秒`)
      } else {
        this.statusEffects.enemies[enemyId].push({
          type: 'atk_up',
          value: value,
          duration: duration
        })
        this._addLog(`⚔️ ${enemy.name} 使用「${skill.name}」！攻击力提升${value * 100}%，持续${skill.duration}秒`)
      }
    } else {
      // 默认：攻击力提升
      if (this._buffTestMode) {
        console.log(`[BUFF测试] 未知 buff effect: ${skill.effect}，使用默认 atk_up`)
      }
      const existing = this.statusEffects.enemies[enemyId].find(e => e.type === 'atk_up')
      if (existing) {
        existing.duration = 6 * 2
      } else {
        this.statusEffects.enemies[enemyId].push({
          type: 'atk_up',
          value: 0.3,
          duration: 6 * 2
        })
        this._addLog(`⚔️ ${enemy.name} 使用「${skill.name}」！攻击力提升30%，持续6秒`)
      }
    }

    // ★ BUFF 测试：输出当前所有 BUFF
    if (this._buffTestMode) {
      console.log(`[BUFF测试] ${enemy.name} 当前 BUFF 列表:`)
      this.statusEffects.enemies[enemyId].forEach((e, i) => {
        console.log(`  [${i}] type=${e.type}, value=${e.value}, duration=${e.duration}`)
      })
    }

    // ★ 获取敌人索引（用于播放特效）
    const enemyIndex = this.enemies.indexOf(enemy)
    
    // buff特效
    const enemyPos = this.enemyPositions[enemyIndex] || { x: this.enemyBaseX, y: this.enemyBaseY }
    this.codeEffects.push({
      type: 'circle_burst',
      x: enemyPos.x,
      y: enemyPos.y,
      radius: 10 * this.dpr,
      maxRadius: 80 * this.dpr,
      alpha: 0.6,
      color: '#4ECDC4',
      duration: 0.5,
      elapsed: 0
    })
  }

  // ======== 播放隐身动画 ========
  proto._playInvisibleAnimation = function(enemy, enemyIndex, enemyPos) {
    if (!enemy || !enemy.id) return
    
    // 创建隐身特效（使用buff动画帧）
    // ★ 修复：使用 enemy.id 而不是 enemyIndex，防止敌人死亡后索引错位
    const animState = this.enemyAnimStates[enemy.id]
    if (animState) {
      animState.state = 'buff'  // 使用buff动画状态
      animState.frame = 1
      animState.frameTimer = 0
      animState.displayFrame = 0
      animState.isInvisible = true  // 标记为隐身状态
      animState.buffTimer = 0
    }

    // 添加隐身特效（黑色粒子效果）
    for (let i = 0; i < 15; i++) {
      this.codeEffects.push({
        type: 'buff_particle',
        x: enemyPos.x + (Math.random() - 0.5) * 40 * this.dpr,
        y: enemyPos.y - 20 * this.dpr + Math.random() * 40 * this.dpr,
        vx: (Math.random() - 0.5) * 20 * this.dpr,
        vy: -30 * this.dpr - Math.random() * 40 * this.dpr,
        alpha: 0.8,
        color: '#2C3E50',  // 暗影颜色
        radius: 2 * this.dpr + Math.random() * 3 * this.dpr,
        duration: 1.5,
        elapsed: 0
      })
    }

    // 创建隐身光环特效
    this.codeEffects.push({
      type: 'circle_burst',
      x: enemyPos.x,
      y: enemyPos.y,
      radius: 15 * this.dpr,
      maxRadius: 60 * this.dpr,
      alpha: 0.7,
      color: '#2C3E50',  // 暗影颜色
      duration: 1.0,
      elapsed: 0
    })
  }

  // ======== 通用敌人生成 ========
  proto._spawnEnemyAt = function(enemyData, spawnX, spawnY) {
    const idx = this.enemies.length
    this.enemies.push(enemyData)

    // 位置
    this.enemyPositions.push({ x: spawnX, y: spawnY })

    // 单位状态
    const isRanged = enemyData.isRanged || enemyData.role === 'mage'
    this.unitStates['enemy_' + idx] = {
      id: 'enemy_' + idx,
      x: spawnX, y: spawnY,
      baseX: spawnX, baseY: spawnY,
      targetX: null, targetY: null,
      state: 'idle',
      isRanged: isRanged,
      attackRange: isRanged ? this.RANGED_RANGE : this.MELEE_RANGE,
      currentTargetId: null,
      radius: (enemyData.isBoss ? 28 : 12) * this.dpr,
      footOffsetY: 0,
      aiPattern: enemyData.aiPattern || 'aggressive',  // ★ 召唤物默认 aggressive（主动攻击）
    }

    // 攻击计时器
    const eInterval = this._getEnemyAttackInterval(enemyData)
    // ★ 修复：使用 enemyData.id 作为键（与 _updateEnemyAutoAttack 一致）
    this.enemyAttackTimers[enemyData.id] = {
      attackTimer: eInterval * (0.5 + Math.random() * 0.8),
      skillCDs: {},
      isAttacking: false,
    }
    if (enemyData.skills && Array.isArray(enemyData.skills)) {
      enemyData.skills.forEach(s => {
        this.enemyAttackTimers[enemyData.id].skillCDs[s.id || s.name] = 0
      })
    }
    console.log(`[Battle] 召唤物 ${enemyData.name}(${enemyData.id}) 攻击计时器已初始化`)

    // 死亡动画
    this.enemyDeathAnim.push({ alpha: 1.0, fading: false, timer: 0 })

    // 动画状态（默认idle）
    // ★ 修复：使用 enemyData.id 而不是 idx，防止敌人死亡后索引错位
    this.enemyAnimStates[enemyData.id] = {
      type: enemyData.type || enemyData.id || 'default',
      state: 'idle', frame: 1, frameTimer: 0,
      frameDuration: 100, attackDamageApplied: false, onAttackComplete: null
    }

    // 状态效果
    // ★ 注意：statusEffects.enemies 已经使用 enemy.id 作为键（之前的修复）
    if (!this.statusEffects.enemies[enemyData.id]) {
      this.statusEffects.enemies[enemyData.id] = []
    }
  }

  // ======== 状态效果查询/更新 ========
  proto._isHeroRestricted = function(heroIndex) {
    const effects = this.statusEffects.heroes[heroIndex]
    if (!effects) return false
    return effects.some(e => e.type === 'restricted' && (e.turnsRemaining > 0 || e.duration > 0))
  }

  proto._updateHeroStatusEffects = function() {
    Object.keys(this.statusEffects.heroes).forEach(indexStr => {
      const index = parseInt(indexStr)
      const effects = this.statusEffects.heroes[index]
      if (!effects) return

      const hero = this.party[index]
      if (!hero) return

      effects.forEach(effect => {
        if (effect.type === 'slimed') {
          effect.turnsRemaining--
          if (effect.turnsRemaining <= 0) {
            this._addLog(`🟢 ${hero.name} 身上的黏液干涸了`)
          }
        }
      })

      // ★ 只清理有 turnsRemaining 且 ≤0 的效果，保留 duration 型（护盾/BUFF）
      this.statusEffects.heroes[index] = effects.filter(e => e.turnsRemaining === undefined || e.turnsRemaining > 0)
    })
  }

  // ======== 敌人状态效果更新 ========
  proto._updateEnemyStatusEffects = function() {
    // ★ 修复：遍历 this.enemies，使用 enemy.id 作为键
    this.enemies.forEach((enemy, index) => {
      if (!enemy || enemy.hp <= 0) return
      
      const enemyId = enemy.id
      if (!enemyId) return
      
      const effects = this.statusEffects.enemies[enemyId]
      if (!effects || !Array.isArray(effects)) return

    // ★ 检查隐身效果是否结束
      const invisEffect = effects.find(e => e.type === 'invisible')
      if (invisEffect && invisEffect.startTime && this.time - invisEffect.startTime >= invisEffect.duration) {
        // 隐身效果结束，移除效果（直接更新数组，避免重新赋值参数）
        this.statusEffects.enemies[enemyId] = effects.filter(e => e.type !== 'invisible')
        
        // 恢复动画状态
        // ★ 修复：使用 enemyId 而不是 index，防止敌人死亡后索引错位
        const animState = this.enemyAnimStates[enemyId]
        if (animState) {
          animState.isInvisible = false
          if (animState.state === 'buff') {
            animState.state = 'idle'
            animState.frame = 1
          }
        }
        
        this._addLog(`🌙 ${enemy.name} 的隐身效果结束了！`)
      }
    })
  }

  // ======== HP/MP延迟动画 ========
  proto._updateHpDelay = function(dt) {
    const speed = 1.0
    const SEGMENT_HP = 100

    this.enemies.forEach((enemy, i) => {
      if (!this.enemyHpDelay[i]) {
        this.enemyHpDelay[i] = { delay: 1.0, lastSegment: 0 }
      }
      const delayInfo = this.enemyHpDelay[i]

      const currentSegment = enemy.hp <= 0 ? 0 : Math.floor((enemy.hp - 1) / SEGMENT_HP)
      const segStartHp = currentSegment * SEGMENT_HP
      const segEndHp = Math.min((currentSegment + 1) * SEGMENT_HP, enemy.maxHp)
      const segMaxHp = segEndHp - segStartHp
      const segCurrentHp = Math.max(0, enemy.hp - segStartHp)
      const target = enemy.hp <= 0 ? 0 : segCurrentHp / segMaxHp

      if (currentSegment !== delayInfo.lastSegment) {
        delayInfo.delay = 1.0
        delayInfo.lastSegment = currentSegment
      }

      if (delayInfo.delay > target) {
        delayInfo.delay = Math.max(target, delayInfo.delay - dt * speed)
      } else {
        delayInfo.delay = target
      }
    })

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

  proto._updateEnemyDeathAnim = function(dt) {
    const fadeSpeed = 0.8
    this.enemies.forEach((enemy, i) => {
      if (!this.enemyDeathAnim[i]) {
        this.enemyDeathAnim[i] = { alpha: 1.0, fading: false, timer: 0 }
      }
      const anim = this.enemyDeathAnim[i]

      if (enemy.hp <= 0 && !anim.fading && anim.alpha > 0) {
        anim.fading = true
        anim.timer = 0
      }

      if (anim.fading && anim.alpha > 0) {
        anim.timer += dt
        anim.alpha = Math.max(0, 1.0 - anim.timer * fadeSpeed)
        
        // ★ 修复：死亡动画播放完毕后，清理敌人的状态效果（避免状态污染）
        if (anim.alpha <= 0) {
          const enemyId = enemy.id
          if (enemyId && this.statusEffects.enemies[enemyId]) {
            console.log(`[Enemy Death] 清理 ${enemy.name}(${enemyId}) 的状态效果`)
            delete this.statusEffects.enemies[enemyId]
          }
          
          // 同时清理动画状态
          // ★ 修复：使用 enemyId 而不是 i，防止敌人死亡后索引错位
          if (enemyId && this.enemyAnimStates[enemyId]) {
            delete this.enemyAnimStates[enemyId]
          }
        }
      }
    })
  }

  // ======== 史莱姆猫分裂技能 ========
  proto._trySplitSlimeCat = function(enemy, enemyIndex, pos) {
    if (Math.random() >= 0.3) return  // 30%几率

    const cloneHp = Math.max(1, Math.floor(enemy.hp * 0.5))
    const clone = {
      ...enemy,
      hp: cloneHp,
      maxHp: enemy.maxHp,
      mp: enemy.mp || enemy.maxMp || 30,
      maxMp: enemy.maxMp || 30,
    }
    // 避免无限分裂
    clone._isClone = true
    
    // ★ 为 clone 生成唯一 ID
    clone.id = enemy.id + '_clone_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)

    const idx = this.enemies.length
    this.enemies.push(clone)

    // 分裂位置：原位置旁边随机偏移
    const offsetX = (Math.random() - 0.5) * 50 * this.dpr
    const offsetY = (Math.random() - 0.5) * 30 * this.dpr
    const spawnPos = pos || { x: this.enemyBaseX, y: this.enemyBaseY }
    this.enemyPositions.push({ x: spawnPos.x + offsetX, y: spawnPos.y + offsetY })

    // 初始化单位状态
    this.unitStates['enemy_' + idx] = {
      id: 'enemy_' + idx,
      x: spawnPos.x + offsetX,
      y: spawnPos.y + offsetY,
      baseX: spawnPos.x + offsetX,
      baseY: spawnPos.y + offsetY,
      targetX: null, targetY: null,
      state: 'idle', isRanged: false,
      attackRange: this.MELEE_RANGE,
      currentTargetId: null,
      radius: 8 * this.dpr,
      footOffsetY: 0,
    }

    // 攻击计时器
    const eInterval = this._getEnemyAttackInterval(clone)
    // ★ 修复：使用 clone.id 作为键（与 _updateEnemyAutoAttack 一致）
    this.enemyAttackTimers[clone.id] = {
      attackTimer: eInterval * (0.5 + Math.random() * 0.8),
      skillCDs: {},
      isAttacking: false,
    }
    if (clone.skills && Array.isArray(clone.skills)) {
      clone.skills.forEach(s => {
        this.enemyAttackTimers[clone.id].skillCDs[s.id || s.name] = 0
      })
    }
    console.log(`[Battle] 克隆体 ${clone.name}(${clone.id}) 攻击计时器已初始化`)

    // 死亡动画
    this.enemyDeathAnim.push({ alpha: 1.0, fading: false, timer: 0 })

    // 动画状态
    // ★ 修复：使用 clone.id 而不是 idx，防止敌人死亡后索引错位
    this.enemyAnimStates[clone.id] = {
      type: 'slime_cat', state: 'idle', frame: 1, frameTimer: 0,
      frameDuration: 100, attackDamageApplied: false, onAttackComplete: null
    }

    this._addLog(`🟢 史莱姆猫分裂了！新史莱姆 HP:${cloneHp}`)
  }

  // ======== 打击感优化系统 ========
  
  // Hit Stop（命中停顿）系统
  proto._startHitStop = function(duration) {
    if (!duration || duration <= 0) return
    const now = this.time || 0
    // 如果已经在 hit stop 中，取最大值（避免被更短的打断）
    if (this._hitStopUntil && this._hitStopUntil > now) {
      this._hitStopUntil = Math.max(this._hitStopUntil, now + duration)
    } else {
      this._hitStopUntil = now + duration
    }
  }
  
  proto._isInHitStop = function() {
    if (!this._hitStopUntil) return false
    const now = this.time || 0
    return now < this._hitStopUntil
  }
  
  proto._updateHitStop = function(dt) {
    // Hit Stop 期间不更新游戏逻辑，只更新渲染相关的定时器
    if (!this._hitStopUntil) return
    const now = this.time || 0
    if (now >= this._hitStopUntil) {
      this._hitStopUntil = null
    }
  }

  // 受击闪白系统
  proto._startFlashWhite = function(targetId) {
    if (!this._flashWhiteTargets) {
      this._flashWhiteTargets = {}
    }
    // 闪白持续时间 0.1秒
    this._flashWhiteTargets[targetId] = {
      timer: 0,
      duration: 0.1
    }
  }
  
  proto._updateFlashWhite = function(dt) {
    if (!this._flashWhiteTargets) return
    
    Object.keys(this._flashWhiteTargets).forEach(targetId => {
      const flash = this._flashWhiteTargets[targetId]
      flash.timer += dt
      if (flash.timer >= flash.duration) {
        delete this._flashWhiteTargets[targetId]
      }
    })
  }
  
  proto._isFlashingWhite = function(targetId) {
    return this._flashWhiteTargets && this._flashWhiteTargets[targetId]
  }

  // 伤害数字动画增强（ease-out 上升 + 缩放）
  proto._updateDamageTextsEnhanced = function(dt) {
    if (!this.damageTexts || !Array.isArray(this.damageTexts)) return
    
    // ★ 修复：使用正确的时间增量
    const effectiveDt = dt
    
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const item = this.damageTexts[i]
      
      // 计算动画进度（0 -> 1）
      const progress = 1 - (item.life / (item.maxLife || 1.5))
      
      // Ease-out 上升：y 坐标随时间向上移动
      if (!item._startY) item._startY = item.y
      const easeOut = progress * (2 - progress) // ease-out 函数
      item.y = item._startY - (easeOut * 60 * this.dpr) // 上升60px
      
      // 缩放效果：从 1.5 倍缩放到 1.0 倍
      item._scale = 1.5 - (easeOut * 0.5)
      
      // 透明度：逐渐消失
      item._alpha = 1 - progress
      
      // 更新生命周期
      item.life -= effectiveDt
      
      // 移除过期的伤害数字
      if (item.life <= 0) {
        this.damageTexts.splice(i, 1)
      }
    }
  }

  // ======== BUFF 测试函数（在控制台调用）======
  proto.testBuff = function(enemyIndex = 0, effectType = 'def_up', value = 0.3, duration = 3) {
    console.log(`[BUFF测试] 手动触发 BUFF: enemyIndex=${enemyIndex}, effect=${effectType}, value=${value}, duration=${duration}`)
    
    if (!this.enemies || enemyIndex >= this.enemies.length) {
      console.error(`[BUFF测试] 敌人索引无效: ${enemyIndex}`)
      return
    }
    
    const enemy = this.enemies[enemyIndex]
    const enemyId = enemy.id
    if (!this.statusEffects.enemies[enemyId]) {
      this.statusEffects.enemies[enemyId] = []
    }
    
    // 添加 BUFF
    const buff = {
      type: effectType,
      value: value,
      duration: duration * 2  // 转换为帧数
    }
    
    // 检查是否已有同名 BUFF
    const existing = this.statusEffects.enemies[enemyId].find(e => e.type === effectType)
    if (existing) {
      existing.duration = buff.duration
      console.log(`[BUFF测试] 刷新已有 ${effectType} BUFF`)
    } else {
      this.statusEffects.enemies[enemyId].push(buff)
      console.log(`[BUFF测试] 新增 ${effectType} BUFF`)
    }
    
    // 输出当前所有 BUFF
    console.log(`[BUFF测试] ${enemy.name} 当前 BUFF 列表:`)
    this.statusEffects.enemies[enemyId].forEach((e, i) => {
      console.log(`  [${i}] type=${e.type}, value=${e.value}, duration=${e.duration}`)
    })
    
    // 在敌人头上显示 BUFF 图标
    const enemyPos = this.enemyPositions[enemyIndex] || { x: this.width / 2, y: this.height / 2 }
    const iconMap = {
      'def_up': '🛡️',
      'atk_up': '⚔️',
      'invisible': '🌙'
    }
    const icon = iconMap[effectType] || '✨'
    
    this._addLog(`${icon} ${enemy.name} 获得 ${effectType} BUFF！`)
    console.log(`[BUFF测试] 请在游戏中观察 ${enemy.name} 头上的 ${icon} 图标`)
    
    // ★ 自动绑定键盘事件（按 B 键触发）——兼容浏览器和微信环境
    if (!this._buffKeyListener) {
      this._buffKeyListener = (e) => {
        if (e.key === 'b' || e.key === 'B') {
          console.log('[BUFF测试] 按下 B 键，触发默认 BUFF (def_up)')
          this.testBuff(0, 'def_up', 0.3, 3)
        }
      }
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('keydown', this._buffKeyListener)
        console.log('[BUFF测试] ✅ 已绑定 B 键 → 触发 BUFF (按 B 键测试)')
      } else {
        console.log('[BUFF测试] ⚠️ 非浏览器环境，跳过键盘绑定')
      }
    }
  }
}
