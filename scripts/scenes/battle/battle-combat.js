/**
 * battle-combat.js - 战斗核心系统
 * 职责：单位状态管理、移动、碰撞检测、距离判断、属性计算、AI决策、自动战斗循环
 *
 * 从 battle-scene.js 提取的方法：
 * - 单位初始化/状态管理 (_initUnitStates, _getFootPos, _getDistance, etc.)
 * - 移动与碰撞 (_updateCombatUnits, _clampToBattlefield, _applyCollisionSeparation, etc.)
 * - 距离/范围判断 (_isInRange, _getMeleeContactDistance, _setApproachTarget, etc.)
 * - 目标查找 (_findNearestAliveEnemy, _findNearestAliveHero)
 * - 属性计算 (_getMoveSpeed, _getAttackInterval, _getEnemyAttackInterval, _getSkillCooldown, etc.)
 * - AI系统 (_aiChooseSkill, _aiChooseTarget)
 * - 己方自动战斗 (_updateAutoBattle, _doHeroAttack, _finishHeroAttack)
 * - 敌人AI (_updateEnemyAutoAttack, _doEnemyAttack, _aiChooseEnemySkill, _executeEnemyAutoAttack)
 * - 辅助初始化 (_initAutoBattleTimers, _initHeroAreas, _initAllHeroPositions, _initEnemyPositions)
 * - 分页/日志 (_prevHeroPage, _nextHeroPage, _addLog, _showHeroSelection)
 * - 攻击者标记 (_clearAttackerFlag)
 * - MP回复/Buff计时 (_updateMpRegen, _updateBuffTimers)
 */

/**
 * 安装战斗核心方法到 BattleScene 原型
 * @param {Function} BattleSceneClass - BattleScene 类（构造函数）
 */

// ======== 技能 CD 阈值查找表 ========
const SPELL_SKILL_TYPES = new Set(['magic', 'heal_self', 'buff', 'summon'])
const SKILL_CD_TABLE = [
  { types: SPELL_SKILL_TYPES, thresholds: [
    { maxPower: 1.0, cd: 5 }, { maxPower: 1.5, cd: 8 }, { maxPower: 2.0, cd: 12 }, { maxPower: Infinity, cd: 15 }
  ]},
  { type: 'attack', thresholds: [
    { maxPower: 1.3, cd: 4 }, { maxPower: 1.6, cd: 6 }, { maxPower: 2.2, cd: 9 }, { maxPower: Infinity, cd: 13 }
  ]},
]

function lookupBaseCd(skill) {
  for (const entry of SKILL_CD_TABLE) {
    const match = entry.types
      ? entry.types.has(skill.type)
      : skill.type === entry.type
    if (match) {
      for (const t of entry.thresholds) {
        if ((skill.power || 1) <= t.maxPower) return t.cd
      }
    }
  }
  return 5  // 兜底值
}

export function installBattleCombat(BattleSceneClass) {
  const proto = BattleSceneClass.prototype

  // ======== 单位状态初始化 ========
  proto._initUnitStates = function() {
    const meleeY = this.height * 0.72
    const rangedY = this.height * 0.82

    this.party.forEach((hero, i) => {
      if (!this.heroBasePositions[i]) return
      const pos = this.heroBasePositions[i]
      const isRanged = (hero.role === 'mage' || hero.role === 'healer' || hero.role === 'archer')
      const combatY = isRanged ? rangedY : meleeY

      if (!pos._originalCardY) pos._originalCardY = pos.y
      pos.y = combatY

      this.unitStates[hero.id] = {
        id: hero.id,
        x: pos.x,
        y: combatY,
        baseX: pos.x,
        baseY: combatY,
        targetX: null,
        targetY: null,
        state: 'idle',
        isRanged: isRanged,
        attackRange: isRanged ? this.RANGED_RANGE : this.MELEE_RANGE,
        currentTargetId: null,
        radius: 12 * this.dpr,
        footOffsetY: 0,
      }
    })

    this.enemies.forEach((enemy, i) => {
      if (!this.enemyPositions[i]) return
      const pos = this.enemyPositions[i]
      this.unitStates['enemy_' + i] = {
        id: 'enemy_' + i,
        x: pos.x,
        y: pos.y,
        baseX: pos.x,
        baseY: pos.y,
        targetX: null,
        targetY: null,
        state: 'idle',
        spriteType: enemy.renderConfig?.spriteType || 'enemy',  // ★ 添加spriteType用于动画资源选择
        isRanged: enemy.isRanged || false,
        attackRange: (enemy.isRanged || enemy.role === 'mage') ? this.RANGED_RANGE : this.MELEE_RANGE,
        currentTargetId: null,
        // 碰撞半径约为视觉精灵尺寸的 45%，防止怪物视觉重叠
        radius: (enemy.isBoss ? 28 : 16) * this.dpr,
        footOffsetY: 0,
        aiPattern: enemy.aiPattern || 'balanced',  // P3-16: AI行为模式
      }
    })
  }

  proto._getFootPos = function(unit) {
    return this._physics._getFootPos(unit)
  }

  proto._getDistance = function(unitA, unitB) {
    return this._physics.getDistance(unitA, unitB)
  }

  // ======== 边界钳制 ========
  proto._clampToBattlefield = function(unitState) {
    const dpr = this.dpr
    const visualR = 30 * dpr
    this._physics.setBounds({
      left: 30 * dpr + visualR,
      right: this.width - 30 * dpr - visualR,
      top: 20 * dpr + visualR,
      bottom: this.height * 0.82 - visualR,
    })
    this._physics.clampUnit(unitState)
  }

  proto._clampTargetToBattlefield = function(targetX, targetY) {
    const dpr = this.dpr
    const margin = 50 * dpr
    const top = 30 * dpr
    const bottom = this.height * 0.82 - 30 * dpr
    return {
      x: Math.max(margin, Math.min(this.width - margin, targetX)),
      y: Math.max(top, Math.min(bottom, targetY))
    }
  }

  // ======== 核心战斗单位更新循环 ========
  proto._updateCombatUnits = function(dt) {
    if (this.isPaused) return
    if (this.phase !== 'auto_battle' && this.phase !== 'animating') return

    const effectiveDt = dt * this.battleSpeed

    // ★ 打击感优化：更新 Hit Stop / Flash White / 伤害数字动画
    this._updateHitStop(dt)
    this._updateFlashWhite(dt)
    this._updateDamageTextsEnhanced(dt)

    // ★ Hit Stop 期间跳过游戏逻辑更新
    if (this._isInHitStop()) {
      return
    }

    // ★ P3-19: 移除开头的碰撞分离（只在移动后做一次）
    // ★ P3-19: 移除攻击者位置还原 hack（攻击者不参与碰撞，无需还原）

    // 己方角色更新
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      const state = this.unitStates[hero.id]
      if (!state) continue

      // ★ 队长模式：操控角色由摇杆驱动，跳过AI移动
      if (this._captainMode && this._controlledHero && hero.id === this._controlledHero.id) {
        this._updateCaptainMovement(hero, state, effectiveDt)
        continue
      }

      // ★ 攻击动画播放中 → 冻结位置，不移动
      if (this.attackingHero === hero && this.attackAnim) continue

      const movePx = this._getMoveSpeed(hero) * effectiveDt

      if (state._justArrivedTimer > 0) {
        state._justArrivedTimer = Math.max(0, state._justArrivedTimer - effectiveDt)
      }

      switch (state.state) {
        case 'moving_to_attack':
          if (state.targetX !== null) {
            const dx = state.targetX - state.x
            const dy = state.targetY - state.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (state._moveStartTime && this.time - state._moveStartTime > 3.0) {
              // ★ P3-18: 渐进接近 — 不再瞬移到in_range，而是将目标点缩短到当前距离的70%
              // 每次卡住3秒就重置计时器，继续接近，直到自然到达
              console.log(`[Battle] ${hero.name} 移动卡住，渐进接近`)
              const dx2 = state.targetX - state.x
              const dy2 = state.targetY - state.y
              const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
              if (dist2 > 5 * this.dpr) {
                // 将目标点缩短到当前距离的70%，产生"逐步拉近距离"效果
                state.targetX = state.x + dx2 * 0.7
                state.targetY = state.y + dy2 * 0.7
              } else {
                // 已经非常近了，允许进入in_range
                state.state = 'in_range'
                const hTimer = this.heroAttackTimers[hero.id]
                if (hTimer) hTimer.attackTimer = 0
              }
              state._moveStartTime = this.time
              break
            }

            if (dist > movePx) {
              let nx = state.x + (dx / dist) * movePx
              let ny = state.y + (dy / dist) * movePx
              const blocked = this._getMovementBlocker(state, nx, ny)
              if (blocked) {
                const slide = this._slideAround(state, nx, ny, dx / dist, dy / dist, movePx, blocked)
                nx = slide.x; ny = slide.y
              }
              state.x = nx; state.y = ny
            } else {
              state.x = state.targetX
              state.y = state.targetY
              state.state = 'in_range'
              state._justArrivedTimer = 1.0
              const timer = this.heroAttackTimers[hero.id]
              if (timer) {
                timer.attackTimer = 0
                if (!timer._hasFirstAttacked) {
                  timer._needsFirstStrike = true
                }
              }
            }
          }
          break

        case 'returning': {
          const rx = state.baseX - state.x
          const ry = state.baseY - state.y
          const rDist = Math.sqrt(rx * rx + ry * ry)
          if (rDist > movePx) {
            let nx = state.x + (rx / rDist) * movePx
            let ny = state.y + (ry / rDist) * movePx
            const blocked = this._getMovementBlocker(state, nx, ny)
            if (blocked) {
              const slide = this._slideAround(state, nx, ny, rx / rDist, ry / rDist, movePx, blocked)
              nx = slide.x; ny = slide.y
            }
            state.x = nx; state.y = ny
          } else {
            state.x = state.baseX
            state.y = state.baseY
            state.state = 'idle'
            state.currentTargetId = null
            const hIdx = this.party.indexOf(hero)
            if (this.heroBasePositions[hIdx] && this.heroBasePositions[hIdx]._originalCardY != null) {
              this.heroBasePositions[hIdx].x = state.baseX
              this.heroBasePositions[hIdx].y = this.heroBasePositions[hIdx]._originalCardY
            }
          }
          break
        }
      }

      this._clampToBattlefield(state)

      if (state.state !== 'idle') {
        const hIdx = this.party.indexOf(hero)
        if (this.heroBasePositions[hIdx]) {
          this.heroBasePositions[hIdx].x = state.x
          this.heroBasePositions[hIdx].y = state.y
        }
      }
    }

    // ★ 调试：每3秒输出一次所有敌人的状态汇总
    if (!this._lastEnemyStatusLog || this.time - this._lastEnemyStatusLog > 3) {
      const aliveEnemies = this.enemies.filter(e => e.hp > 0)
      if (aliveEnemies.length > 0) {
        console.log(`[Enemy Status] 存活敌人(${aliveEnemies.length}个):`)
        this.enemies.forEach((enemy, idx) => {
          if (enemy.hp > 0) {
            const estate = this.unitStates['enemy_' + idx]
            console.log(`  ${enemy.name} (idx=${idx}): state=${estate?.state}, targetId=${estate?.currentTargetId}, HP=${enemy.hp}`)
          }
        })
        this._lastEnemyStatusLog = this.time
      }
    }

    // 敌人更新
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i]
      if (enemy.hp <= 0) continue
      const estate = this.unitStates['enemy_' + i]
      if (!estate) continue

      // ★ 保护检查：如果正在执行特殊技能（如治愈冲击），跳过敌人状态更新
      // 让技能自己的更新函数来控制状态
      if (this._healingImpact && this._healingImpact.active && this._healingImpact.enemyIndex === i) {
        continue  // 跳过此敌人的状态更新，让 _updateHealingImpact 控制
      }

      // ★ 全局目标存活检查：如果目标已死亡，立即清除并重新寻敌
      if (estate.currentTargetId) {
        const targetHero = this.party.find(h => h.id === estate.currentTargetId)
        if (!targetHero || targetHero.hp <= 0) {
          console.log(`[Enemy AI] ${enemy.name} 全局检测：目标已死亡，清除目标ID`)
          estate.currentTargetId = null
          estate.targetX = null
          estate.targetY = null
          estate.state = 'idle'
        }
      }

      // ★ 眩晕中的敌人不移动
      const enemyEffects = this.statusEffects.enemies[i] || []
      const isStunned = enemyEffects.some(e => e.type === 'stunned' && (e.duration > 0 || e.turnsRemaining > 0))
      if (isStunned) {
        estate.state = 'idle'
        if (this.enemyPositions[i]) {
          this.enemyPositions[i].x = estate.x
          this.enemyPositions[i].y = estate.y
        }
        continue
      }

      const eSpeed = this._getMoveSpeed(enemy) * effectiveDt

      if (estate._justArrivedTimer > 0) {
        estate._justArrivedTimer = Math.max(0, estate._justArrivedTimer - effectiveDt)
      }

      const eAnim = this.enemyAnimStates[i]
      if (eAnim) {
        const isMoving = (estate.state === 'moving_to_attack' || estate.state === 'returning' || estate.state === 'fleeing')
        const isAttacking = (estate.state === 'attacking')
        if (isMoving && eAnim.state !== 'walk') {
          eAnim.state = 'walk'
          eAnim.frame = 1
          eAnim.frameTimer = 0
          eAnim.displayFrame = 0
        } else if (isAttacking && eAnim.state !== 'attack' && eAnim.state !== 'skill' && eAnim.state !== 'buff' && eAnim.state !== 'support') {
          const estateForSkill = this.unitStates['enemy_' + i]
          const currentSkill = estateForSkill ? estateForSkill._currentSkill : null
          const isSkillAttack = currentSkill && (
            currentSkill.effect || currentSkill.target ||
            (currentSkill.power || 1) > 1.25 || currentSkill.id
          )

          if (isSkillAttack && eAnim.type === 'slime_cat') {
            eAnim.state = 'skill'
            eAnim.frame = 50
            eAnim.displayFrame = 0
            eAnim.frameTimer = 0
            eAnim.attackDamageApplied = false
          } else if (isSkillAttack && eAnim.type === 'shadow_mouse') {
            eAnim.state = 'skill'
            eAnim.frame = 1
            eAnim.displayFrame = 0
            eAnim.frameTimer = 0
            eAnim.attackDamageApplied = false
          } else if (currentSkill && currentSkill.type === 'buff') {
            // ★ 艾米BOSS的Buff技能（如圣盾之光）
            eAnim.state = 'buff'
            eAnim.frame = 1
            eAnim.displayFrame = 0
            eAnim.frameTimer = 0
            eAnim.attackDamageApplied = false
          } else if (currentSkill && (currentSkill.type === 'heal' || currentSkill.type === 'heal_self')) {
            // ★ 艾米BOSS的治疗技能（如治愈之光）
            eAnim.state = 'support'
            eAnim.frame = 1
            eAnim.displayFrame = 0
            eAnim.frameTimer = 0
            eAnim.attackDamageApplied = false
          } else if (isSkillAttack) {
            // ★ 艾米BOSS的技能攻击（如治愈冲击）
            eAnim.state = 'skill'
            eAnim.frame = 1
            eAnim.displayFrame = 0
            eAnim.frameTimer = 0
            eAnim.attackDamageApplied = false
          } else {
            eAnim.state = 'attack'
            eAnim.frame = 1
            eAnim.displayFrame = 0
            eAnim.frameTimer = 0
            eAnim.attackDamageApplied = false
          }
        } else if (!isMoving && !isAttacking && estate.state === 'idle' && eAnim.state !== 'idle') {
          eAnim.state = 'idle'
          eAnim.frame = 1
          eAnim.frameTimer = 0
        }
      }

      switch (estate.state) {
        case 'moving_to_attack':
          // ★ 如果目标位置为空，回到 idle 重新找目标
          if (estate.targetX === null || estate.targetY === null) {
            estate.state = 'idle'
            break
          }
          
          // ★ 检查目标是否死亡，死亡则重新寻敌
          if (estate.currentTargetId) {
            const targetHero = this.party.find(h => h.id === estate.currentTargetId)
            if (!targetHero || targetHero.hp <= 0) {
              console.log(`[Enemy AI] ${enemy.name} 移动中目标死亡，重新找目标`)
              estate.currentTargetId = null
              estate.targetX = null
              estate.targetY = null
              estate.state = 'idle'
              break
            }
          }
          
          if (estate.targetX !== null) {
            const dx = estate.targetX - estate.x
            const dy = estate.targetY - estate.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const eSpeed2 = this._getMoveSpeed(enemy) * effectiveDt

            if (estate._moveStartTime && this.time - estate._moveStartTime > 3.0) {
              // ★ P3-18: 渐进接近 — 敌人也不再瞬移
              console.log(`[Battle] enemy_${i} 移动卡住，渐进接近`)
              const edx = estate.targetX - estate.x
              const edy = estate.targetY - estate.y
              const edist = Math.sqrt(edx * edx + edy * edy)
              if (edist > 5 * this.dpr) {
                estate.targetX = estate.x + edx * 0.7
                estate.targetY = estate.y + edy * 0.7
              } else {
                estate.state = 'in_range'
                // ★ 修复：使用 enemy.id 作为键
                const eTimer = this.enemyAttackTimers[enemy.id]
                if (eTimer) eTimer.attackTimer = 0
              }
              estate._moveStartTime = this.time
              break
            }

            if (dist > eSpeed2) {
              let nx = estate.x + (dx / dist) * eSpeed2
              let ny = estate.y + (dy / dist) * eSpeed2
              const blocked = this._getMovementBlocker(estate, nx, ny)
              if (blocked) {
                const slide = this._slideAround(estate, nx, ny, dx / dist, dy / dist, eSpeed2, blocked)
                nx = slide.x; ny = slide.y
              }
              estate.x = nx; estate.y = ny
            } else {
              estate.x = estate.targetX
              estate.y = estate.targetY
              estate.state = 'in_range'
              estate._justArrivedTimer = 1.0
            }
          }
          break
        case 'returning': {
          const erx = estate.baseX - estate.x
          const ery = estate.baseY - estate.y
          const erDist = Math.sqrt(erx * erx + ery * ery)
          const eReturnSpeed = this._getMoveSpeed(enemy) * 1.15 * effectiveDt
          if (erDist > eReturnSpeed) {
            let nx = estate.x + (erx / erDist) * eReturnSpeed
            let ny = estate.y + (ery / erDist) * eReturnSpeed
            const blocked = this._getMovementBlocker(estate, nx, ny)
            if (blocked) {
              const slide = this._slideAround(estate, nx, ny, erx / erDist, ery / erDist, eReturnSpeed, blocked)
              nx = slide.x; ny = slide.y
            }
            estate.x = nx; estate.y = ny
          } else {
            estate.x = estate.baseX
            estate.y = estate.baseY
            estate.state = 'idle'
            estate.currentTargetId = null
          }
          break
        }
        case 'fleeing': {
          // ★ 如果逃跑目标位置为空，回到 idle
          if (estate.targetX === null || estate.targetY === null) {
            console.log(`[Enemy AI] ${enemy.name} fleeing 状态目标位置为空，回到 idle`)
            estate.state = 'idle'
            estate.currentTargetId = null
            break
          }
          
          const fleeSpeed = this._getMoveSpeed(enemy) * 1.2 * effectiveDt
          const fdx = estate.targetX - estate.x
          const fdy = estate.targetY - estate.y
          const fdist = Math.sqrt(fdx * fdx + fdy * fdy)
          if (fdist > fleeSpeed) {
            let nx = estate.x + (fdx / fdist) * fleeSpeed
            let ny = estate.y + (fdy / fdist) * fleeSpeed
            const blocked = this._getMovementBlocker(estate, nx, ny)
            if (blocked) {
              const slide = this._slideAround(estate, nx, ny, fdx / fdist, fdy / fdist, fleeSpeed, blocked)
              nx = slide.x; ny = slide.y
            }
            estate.x = nx; estate.y = ny
          } else {
            estate.x = estate.targetX
            estate.y = estate.targetY
            estate.state = 'idle'
            estate.targetX = null
            estate.targetY = null
          }
          break
        }
      }

      this._clampToBattlefield(estate)

      if (this.enemyPositions[i]) {
        this.enemyPositions[i].x = estate.x
        this.enemyPositions[i].y = estate.y
      }
    }

    // ★ P3-19: 只做一次碰撞分离，且排除攻击中的单位
    this._applyCollisionSeparation()

    // ★ P3-19: 攻击中单位不参与碰撞，无需还原位置
  }

  // ======== 距离/范围判断 ========
  proto._isInRange = function(unitState, targetState) {
    if (!targetState) return false
    const dist = this._getDistance(unitState, targetState)
    if (unitState.isRanged) {
      return dist <= unitState.attackRange
    }
    const reachRadius = (unitState.radius || 0) + (targetState.radius || 0) + 12 * this.dpr
    return dist <= reachRadius
  }

  proto._getMeleeContactDistance = function(attackerState, targetState) {
    return (attackerState.radius || 0) + (targetState.radius || 0) + 15 * this.dpr
  }

  proto._setApproachTarget = function(attackerState, targetState, targetIdx) {
    const distToEnemy = this._getDistance(attackerState, targetState)
    const aFoot = this._getFootPos(attackerState)
    const tFoot = this._getFootPos(targetState)
    const baseAngle = Math.atan2(tFoot.y - aFoot.y, tFoot.x - aFoot.x)

    if (attackerState.isRanged) {
      const stopDist = attackerState.attackRange * 0.85
      if (distToEnemy <= stopDist) {
        attackerState.currentTargetId = targetIdx
        return
      }
      const approachDist = distToEnemy - stopDist
      attackerState.targetX = attackerState.x + Math.cos(baseAngle) * approachDist
      attackerState.targetY = attackerState.y + Math.sin(baseAngle) * approachDist
      attackerState.currentTargetId = targetIdx
      return
    }

    const contactDist = this._getMeleeContactDistance(attackerState, targetState)
    const attackerId = Object.keys(this.unitStates).find(k => this.unitStates[k] === attackerState) || 'h0'
    const sideSign = (attackerId.charCodeAt(attackerId.length - 1) % 2 === 0) ? 1 : -1
    const lateralOffset = 30 * this.dpr * sideSign

    const alliesOnSameTarget = this.party.filter(h => {
      if (h.hp <= 0 || h.id === attackerState.currentTargetId || h.id === Object.keys(this.unitStates).find(k => this.unitStates[k] === attackerState)) return false
      const s = this.unitStates[h.id]
      return s && !s.isRanged && s.currentTargetId === targetIdx && s.state !== 'idle' && s.state !== 'returning'
    })

    let angleOffset = 0
    if (!attackerState.isRanged && alliesOnSameTarget.length > 0) {
      const totalAllies = alliesOnSameTarget.length + 1
      const arcAngle = Math.PI * 0.4
      const myIdx = this._getHeroAttackOrderIndex(attackerState, targetIdx, totalAllies)
      angleOffset = -arcAngle / 2 + (myIdx / (totalAllies - 1)) * arcAngle
    }

    const finalAngle = baseAngle + angleOffset
    const approachDist = distToEnemy - contactDist + 5 * this.dpr
    let targetX = attackerState.x + Math.cos(finalAngle) * approachDist
    let targetY = attackerState.y + Math.sin(finalAngle) * approachDist

    const perpX = -Math.sin(finalAngle)
    const perpY = Math.cos(finalAngle)
    targetX += perpX * lateralOffset
    targetY += perpY * lateralOffset

    attackerState.targetX = targetX
    attackerState.targetY = targetY
    attackerState.currentTargetId = targetIdx
  }

  proto._getHeroAttackOrderIndex = function(heroState, targetIdx, totalSlots) {
    const attackers = []
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      const s = this.unitStates[hero.id]
      if (!s || s.isRanged) continue
      if ((s.currentTargetId === targetIdx && s.state !== 'idle') || s === heroState) {
        attackers.push({ state: s, id: hero.id })
      }
    }
    const myIdx = attackers.findIndex(a => a.state === heroState)
    return myIdx >= 0 ? myIdx : 0
  }

  // ======== 碰撞系统（P3-19: 排除攻击中单位） ========
  proto._applyCollisionSeparation = function() {
    const physics = this._physics
    physics.clearUnits()

    // ★ P3-19: 收集攻击中的单位ID，排除它们不参与碰撞
    const attackingIds = new Set()
    if (this.attackingHero && this.attackAnim) {
      attackingIds.add(this.attackingHero.id)
    }
    for (const attackerId of this.activeAttackers) {
      attackingIds.add(attackerId)
    }
    // 敌人攻击中的也排除
    for (let i = 0; i < this.enemies.length; i++) {
      const estate = this.unitStates['enemy_' + i]
      if (estate && estate.state === 'attacking') {
        attackingIds.add('enemy_' + i)
      }
    }

    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      if (attackingIds.has(hero.id)) continue  // ★ 排除攻击中
      const state = this.unitStates[hero.id]
      if (!state) continue
      physics.addUnit(state)
    }

    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].hp <= 0) continue
      if (attackingIds.has('enemy_' + i)) continue  // ★ 排除攻击中
      const state = this.unitStates['enemy_' + i]
      if (!state) continue
      physics.addUnit(state)
    }

    const dpr = this.dpr
    const visualR = 30 * dpr
    physics.setBounds({
      left: 30 * dpr + visualR,
      right: this.width - 30 * dpr - visualR,
      top: 20 * dpr + visualR,
      bottom: this.height * 0.82 - visualR,
    })

    physics.separate({ pushForce: 1.0, passes: 3, extraMargin: 4 })
  }

  proto._getMovementBlocker = function(moverState, targetX, targetY) {
    const physics = this._physics
    physics.clearUnits()

    // ★ P3-19: 排除攻击中单位作为碰撞阻挡
    const attackingIds = new Set()
    if (this.attackingHero && this.attackAnim) {
      attackingIds.add(this.attackingHero.id)
    }
    for (const attackerId of this.activeAttackers) {
      attackingIds.add(attackerId)
    }

    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      if (attackingIds.has(hero.id)) continue
      const state = this.unitStates[hero.id]
      if (!state) continue
      physics.addUnit(state)
    }
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].hp <= 0) continue
      if (attackingIds.has('enemy_' + i)) continue
      const estate = this.unitStates['enemy_' + i]
      if (!estate) continue
      physics.addUnit(estate)
    }
    return physics.getMovementBlocker(moverState, targetX, targetY)
  }

  proto._slideAround = function(moverState, targetX, targetY, dirX, dirY, moveSpeed, blocker) {
    const perpX = -dirY
    const perpY = dirX
    const slideAmount = moveSpeed * 0.9

    const blockerFoot = this._getFootPos(blocker)
    const awayX = targetX - blockerFoot.x
    const awayY = targetY - blockerFoot.y
    const dot1 = perpX * awayX + perpY * awayY

    const sign = dot1 >= 0 ? 1 : -1
    let sx = moverState.x + (dirX * moveSpeed * 0.3) + perpX * slideAmount * sign
    let sy = moverState.y + (dirY * moveSpeed * 0.3) + perpY * slideAmount * sign

    if (!this._getMovementBlocker(moverState, sx, sy)) return { x: sx, y: sy }

    sx = moverState.x + (dirX * moveSpeed * 0.3) - perpX * slideAmount * sign
    sy = moverState.y + (dirY * moveSpeed * 0.3) - perpY * slideAmount * sign
    if (!this._getMovementBlocker(moverState, sx, sy)) return { x: sx, y: sy }

    const pushAngle = Math.atan2(awayY, awayX)
    sx = moverState.x + Math.cos(pushAngle) * moveSpeed * 0.8
    sy = moverState.y + Math.sin(pushAngle) * moveSpeed * 0.8
    if (!this._getMovementBlocker(moverState, sx, sy)) return { x: sx, y: sy }

    return { x: moverState.x, y: moverState.y }
  }

  // ======== 队长模式：摇杆驱动移动 ========
  proto._updateCaptainMovement = function(hero, state, effectiveDt) {
    const dpr = this.dpr
    const heroSpeed = this._getMoveSpeed(hero) * effectiveDt

    // ★ 技能 CD 倒计时（无论移动/静止都跑）
    const timer = this.heroAttackTimers[hero.id]
    if (timer) {
      for (const skillId in timer.skillCDs) {
        if (timer.skillCDs[skillId] > 0) {
          timer.skillCDs[skillId] = Math.max(0, timer.skillCDs[skillId] - effectiveDt)
        }
      }
      this._refreshSkillButtonCDs()
    }

    // 检查是否被限制行动
    const heroIndex = this.party.indexOf(hero)
    if (heroIndex >= 0 && this._isHeroRestricted && this._isHeroRestricted(heroIndex)) {
      // 被限制时不能移动，但保持idle状态
      state.state = 'idle'
      return
    }

    // 队长正在攻击动画中 → 不能移动
    if (this.attackingHero && this.attackingHero.id === hero.id && this.attackAnim) {
      return
    }

    if (this._joystick.active && this._joystickConfig) {
      const jc = this._joystickConfig
      const dx = this._joystick.currentX - jc.centerX
      const dy = this._joystick.currentY - jc.centerY
      const dist = Math.sqrt(dx * dx + dy * dy)

      // ★ 修复：使用正确的属性名 deadZone（不是 deadZone）
      const deadZone = jc.deadZone || 5 * this.dpr
      if (dist > deadZone) {
        state.state = 'walk'
        state._captainMoveDir = dx  // 记录水平方向：正=右, 负=左
        const clampedDist = Math.min(dist, jc.maxOffset)
        const ratio = clampedDist / jc.maxOffset
        const speed = heroSpeed * ratio * this.battleSpeed

        let nx = state.x + (dx / dist) * speed
        let ny = state.y + (dy / dist) * speed

        // 碰撞检测
        const blocked = this._getMovementBlocker(state, nx, ny)
        if (blocked) {
          const slide = this._slideAround(state, nx, ny, dx / dist, dy / dist, speed, blocked)
          nx = slide.x; ny = slide.y
        }

        state.x = nx; state.y = ny
        this._clampToBattlefield(state)

        // 同步 basePosition
        if (this.heroBasePositions[heroIndex]) {
          this.heroBasePositions[heroIndex].x = state.x
          this.heroBasePositions[heroIndex].y = state.y
        }
        return
      }
    }

    // 摇杆未激活/死区内 → idle + 自动攻击检测
    state.state = 'idle'

    // ★ 测试模式：跳过自动攻击检测
    if (this._testMode) {
      return  // 直接返回，不执行自动攻击
    }

    // 自动攻击：检测附近敌人
    if (this._attackBtnAutoTimer === undefined) this._attackBtnAutoTimer = 0
    this._attackBtnAutoTimer += effectiveDt
    const autoAttackInterval = this._getAttackInterval(hero)

    if (this._attackBtnAutoTimer >= autoAttackInterval) {
      this._attackBtnAutoTimer = 0
      const { index: enemyIdx, state: enemyState } = this._findNearestAliveEnemy(state)
      if (enemyIdx >= 0 && enemyState) {
        const dist = this._getDistance(state, enemyState)
        const range = state.isRanged ? state.attackRange : this.MELEE_RANGE
        if (dist <= range * 1.3) {
          this._captainAutoAttack(hero, enemyIdx)
        }
      }
    }
  }

  // 队长自动普攻（摇杆空闲时 auto-target）
  proto._captainAutoAttack = function(hero, enemyIdx) {
    if (this.activeAttackers.has(hero.id)) return
    const enemy = this.enemies[enemyIdx]
    if (!enemy || enemy.hp <= 0) return

    const state = this.unitStates[hero.id]
    if (!state) return

    const enemyState = this.unitStates['enemy_' + enemyIdx]
    if (!enemyState) return
    const dist = this._getDistance(state, enemyState)
    const maxRange = state.isRanged ? state.attackRange : this.MELEE_RANGE
    if (dist > maxRange * 1.2) return

    if (state.isRanged) {
      this._captainRangedAttack(hero, state, enemy, enemyIdx)
    } else {
      this._captainMeleeAttack(hero, state, enemy, enemyIdx)
    }
  }

  // 队长手动普攻（按钮触发，任何距离都可出手，命中靠攻击范围判定）
  proto._captainManualAttack = function() {
    const hero = this._controlledHero
    if (!hero || hero.hp <= 0) return
    if (this.activeAttackers.has(hero.id)) return

    const state = this.unitStates[hero.id]
    if (!state) return

    const { index: enemyIdx, state: enemyState } = this._findNearestAliveEnemy(state)
    if (enemyIdx < 0 || !enemyState) return

    // ★ 不检查距离，直接出手。命中/未命中在攻击帧结算时判断
    if (state.isRanged) {
      this._captainRangedAttack(hero, state, this.enemies[enemyIdx], enemyIdx)
    } else {
      this._captainMeleeAttack(hero, state, this.enemies[enemyIdx], enemyIdx)
    }
  }

  // ★ 近战攻击：攻速决定动画节奏，SPD影响帧间隔
  proto._captainMeleeAttack = function(hero, state, enemy, enemyIdx) {
    const dpr = this.dpr
    const basicSkill = hero.skills?.find(s => (s.mpCost || 0) === 0) || { name: '攻击', power: 1.0, type: 'attack', mpCost: 0 }

    this.activeAttackers.add(hero.id)

    // 停止移动，切攻击动画
    state.state = 'idle'
    const hAnimState = this.heroAnimStates[hero.id]
    if (hAnimState) {
      hAnimState.state = 'attack'
      hAnimState.frame = 0
      hAnimState.frameTimer = 0
    }

    // ★ 攻速驱动：SPD越高 → 帧间隔越短 → 总动画时间越短 → 攻击越快
    const spd = hero.spd || 10
    const atkFrameDurMs = Math.max(50, 120 - spd * 2)     // SPD=10 → 100ms, SPD=15 → 90ms
    const totalFrames = hAnimState ? (hAnimState.totalSlashFrames || 8) : 8
    const totalAnimMs = totalFrames * atkFrameDurMs        // SPD=10 → 800ms, SPD=15 → 720ms
    const hitMs = totalAnimMs * 0.35                       // 命中帧在动画35%处

    // 覆盖帧间隔以匹配攻速（_updateHeroAnimations 会使用这个值）
    if (hAnimState) {
      hAnimState.frameDuration = atkFrameDurMs
    }

    // 命中延迟
    this._scheduleTimer(() => {
      if (!enemy || enemy.hp <= 0) return
      const curState = this.unitStates[hero.id]
      const eState = this.unitStates['enemy_' + enemyIdx]
      if (!curState || !eState) return
      const d = this._getDistance(curState, eState)

      // ★ 攻击方向判定：只在角色面朝方向的前方180°锥形范围内命中
      let facingRight = true  // 默认朝右（敌人方向）
      if (curState._captainMoveDir !== undefined && Math.abs(curState._captainMoveDir) > 2 * dpr) {
        facingRight = curState._captainMoveDir > 0
      }
      const dx = eState.x - curState.x
      const inFront = facingRight ? dx > -20 * dpr : dx < 20 * dpr

      if (d <= this.MELEE_RANGE * 1.3 && inFront) {
        const pos = this.enemyPositions[enemyIdx]
        this._applyAttackDamageToTarget(hero, basicSkill, enemy, pos)
        if (this.flashAlpha < 0.1) this.flashAlpha = 0.08
        this.shakeAmount = Math.max(this.shakeAmount, 4 * dpr)
      }
    }, Math.round(hitMs))

    // 攻击结束：清除标记 + 还原动画
    this._scheduleTimer(() => {
      this.activeAttackers.delete(hero.id)
      if (hAnimState) {
        hAnimState.frameDuration = 80  // 恢复默认帧间隔
        // ★ 强制重置动画帧，避免残留到下一轮
        hAnimState.frame = 0
        hAnimState.frameTimer = 0
      }
    }, Math.round(totalAnimMs))
  }

  // ★ 远程攻击：播放施法动画 + 发射投射物
  proto._captainRangedAttack = function(hero, state, enemy, enemyIdx) {
    const dpr = this.dpr
    const basicSkill = hero.skills?.find(s => (s.mpCost || 0) === 0) || { name: '攻击', power: 1.0, type: 'attack', mpCost: 0 }

    this.activeAttackers.add(hero.id)  // ★ 标记攻击中

    // ★ 攻速驱动帧间隔
    const spd = hero.spd || 10
    const atkFrameDurMs = Math.max(50, 120 - spd * 2)

    // 播放施法动画
    const hAnimState = this.heroAnimStates[hero.id]
    if (hAnimState) {
      hAnimState.state = 'cast'
      hAnimState.frame = 0
      hAnimState.frameTimer = 0
      hAnimState._isCastingSkill = true
      hAnimState.frameDuration = atkFrameDurMs
    }

    // 投射物参数
    const startX = state.x
    const startY = state.y - 15 * dpr
    const targetPos = this.enemyPositions[enemyIdx] || { x: enemy.x || this.enemyBaseX, y: enemy.y || this.enemyBaseY }
    const targetX = targetPos.x
    const targetY = targetPos.y

    const speed = 500 * dpr
    const dx = targetX - startX
    const dy = targetY - startY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const flightTime = dist / speed

    this.codeEffects.push({
      type: 'captain_projectile',
      x: startX,
      y: startY,
      targetX,
      targetY,
      vx: dist > 0 ? (dx / dist) * speed : 0,
      vy: dist > 0 ? (dy / dist) * speed : 0,
      radius: 5 * dpr,
      alpha: 1.0,
      color: '#FF9F43',
      duration: flightTime,
      elapsed: 0,
      _hit: false,
      _enemy: enemy,
      _enemyIdx: enemyIdx,
      _hero: hero,
      _skill: basicSkill,
      _originX: startX,
      _originY: startY,
    })

    // 投射物命中后清理
    this._scheduleTimer(() => {
      this.activeAttackers.delete(hero.id)
      if (hAnimState) {
        hAnimState._isCastingSkill = false
      }
    }, flightTime + 300)
  }

  // 队长手动技能（按钮触发，原地攻击/施法，不跳跃）
  proto._captainManualSkill = function(skillIndex) {
    const hero = this._controlledHero
    if (!hero || hero.hp <= 0) return
    if (this.activeAttackers.has(hero.id)) return

    const skillBtn = this._skillBtns[skillIndex]
    if (!skillBtn || skillBtn.disabled) return

    const skill = skillBtn.skill
    const state = this.unitStates[hero.id]
    if (!state) return

    // 扣除MP + 设置CD
    hero.mp = Math.max(0, hero.mp - (skill.mpCost || 0))
    const timer = this.heroAttackTimers[hero.id]
    if (timer && this.nodeId !== 'test_battle') {
      // ★ 指定技能 CD（覆盖公式计算）
      if (skill.id === 'berserk') timer.skillCDs[skill.id] = 10
      else if (skill.id === 'war_cry') timer.skillCDs[skill.id] = 8
      else timer.skillCDs[skill.id] = this._getSkillCooldown(hero, skill)
    }
    this._refreshSkillButtons()

    // 选择目标
    const target = this._aiChooseTarget(hero, skill)
    const targetIdx = target ? this.enemies.indexOf(target) : -1

    const isMagicOrHeal = (skill.type === 'magic' || skill.type === 'heal' || skill.type === 'heal_self' ||
                           skill.type === 'buff' || skill.type === 'debuff' || skill.type === 'summon')
    const hasSpecial = !!(skill.effect || skill.target || skill.restrictChance || skill.statusEffect)

    this.activeAttackers.add(hero.id)

    if (isMagicOrHeal || hasSpecial) {
      // 魔法/治疗/特殊：原地施法 + 特效
      this._captainCastSkill(hero, skill, target || this.enemies[0], targetIdx)
    } else {
      // 物理技能：原地挥砍 + 延迟伤害
      this._captainPhysicalSkill(hero, skill, target || this.enemies[0], targetIdx)
    }
  }

  // 队长施法技能：BUFF / 盾击 / 治疗 / 魔法AOE
  proto._captainCastSkill = function(hero, skill, target, targetIdx) {
    const dpr = this.dpr
    const hAnimState = this.heroAnimStates[hero.id]

    // ★ 选择动画：shield → 盾击动画, buff → 战吼动画, 其他 → cast
    let animType = 'cast'
    if (skill.effect === 'stun') animType = 'shield'   // 盾击
    else if (skill.type === 'buff') animType = 'buff'    // 战吼/狂暴

    if (hAnimState) {
      hAnimState.state = animType
      hAnimState.frame = 0
      hAnimState.frameTimer = 0
      hAnimState._isCastingSkill = true

      // ★ 魔法技能：创建 cast 特效 + 记录类型（供渲染器查找帧图）
      if (animType === 'cast' && skill.type === 'magic' && this.game.effects) {
        const effType = this._getCastEffectType(skill)
        if (effType) {
          this.lastCastEffectType[hero.id] = effType + '_cast'
          const capState = this.unitStates[hero.id]
          const posX = capState ? capState.x : (this.width * 0.25)
          const posY = capState ? capState.y : (this.height * 0.5)
          this.game.effects.playCastEffect(effType, posX, posY, this.dpr)
        }
      }
      // 覆盖帧间隔（施法动画固定较慢，让玩家看清动作）
      hAnimState.frameDuration = 250
    }

    const castDuration = 2000
    const heroIndex = this.party.indexOf(hero)

    this._scheduleTimer(() => {
      // ===== BUFF技能 =====
      if (skill.type === 'buff') {
        const effType = skill.effect === 'atk_up_self' ? 'atk_up' : (skill.effect || 'atk_up')
        const value = skill.value || 0.3
        // ★ 使用 duration（秒）替代 turnsRemaining，按秒过期
        const buffDuration = skill.id === 'berserk' ? 5 : (skill.id === 'war_cry' ? 3 : 3)
        const targets = skill.effect === 'atk_up_self' ? [heroIndex] : this.party.map((_, i) => i)

        targets.forEach(i => {
          if (i < 0 || i >= this.party.length) return
          if (this.party[i].hp <= 0) return
          if (!this.statusEffects.heroes[i]) this.statusEffects.heroes[i] = []
          // 移除同类型旧 buff
          this.statusEffects.heroes[i] = this.statusEffects.heroes[i].filter(e => e.type !== effType)
          this.statusEffects.heroes[i].push({ type: effType, duration: buffDuration, value })
        })
        this._addLog(`${hero.name} 使用「${skill.name}」！${skill.effect === 'atk_up_self' ? '自身' : '全体'}攻击力 +${Math.round(value * 100)}%（${buffDuration}秒）`)
        // BUFF 视觉特效
        this.codeEffects.push({
          type: 'circle_burst', x: hero.x || this.width * 0.3, y: (hero.y || this.height * 0.5) - 40 * dpr,
          radius: 20 * dpr, maxRadius: 80 * dpr, alpha: 0.6, color: '#FFD700',
          duration: 0.5, elapsed: 0
        })
      }
      // ===== 盾击（伤害 + 护盾），近身判定 =====
      else if (skill.effect === 'stun') {
        if (target && target.hp > 0 && this.enemies.includes(target)) {
          const capState = this.unitStates[hero.id]
          const tgtState = this.unitStates['enemy_' + this.enemies.indexOf(target)]
          if (capState && tgtState) {
            const d = this._getDistance(capState, tgtState)
            if (d <= this.MELEE_RANGE * 1.3) {
              this._applyAttackDamageToTarget(hero, skill, target, this.enemyPositions[this.enemies.indexOf(target)])
            }
          }
        }
        // 护盾：有效攻击力 × 30%，持续2秒
        const effectiveAtk = this._getEffectiveAtk(hero)
        const shieldAmount = Math.max(1, Math.floor(effectiveAtk * 0.3))
        if (!this.statusEffects.heroes[heroIndex]) this.statusEffects.heroes[heroIndex] = []
        // 移除旧护盾
        this.statusEffects.heroes[heroIndex] = this.statusEffects.heroes[heroIndex].filter(e => e.type !== 'shield')
        this.statusEffects.heroes[heroIndex].push({ type: 'shield', value: shieldAmount, maxValue: shieldAmount, duration: 2 })
        this._addLog(`${hero.name} 使用「${skill.name}」！造成伤害并获 ${shieldAmount} 点护盾（2秒）`)
      }
      // ===== 治疗 =====
      else if (skill.type === 'heal' || skill.type === 'heal_self') {
        const healTarget = skill.type === 'heal_self' ? hero : (target || hero)
        const healAmount = Math.floor((hero.magic || hero.atk) * (skill.power || 1.0))
        healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount)
        this._addLog(`${hero.name} 使用「${skill.name}」，恢复了 ${healAmount} 点生命！`)
      }
      // ===== AOE =====
      else if (skill.target === 'all' || skill.target === 'all_enemies') {
        this.enemies.forEach((enemy, idx) => {
          if (enemy.hp <= 0) return
          this._applyAttackDamageToTarget(hero, skill, enemy, this.enemyPositions[idx])
        })
        // ★ AOE 命中特效
        if (skill.type === 'magic') {
          this._playHitEffect(hero, skill, { x: (this.width || 600) * 0.5, y: (this.height || 800) * 0.35 })
        }
        this.codeEffects.push({
          type: 'circle_burst', x: (this.width || 600) * 0.5, y: (this.height || 800) * 0.35,
          radius: 20 * dpr, maxRadius: 180 * dpr, alpha: 0.6, color: '#74B9FF',
          duration: 0.5, elapsed: 0
        })
      }
      // ===== 单目标伤害 =====
      else if (target && target.hp > 0) {
        let hitPos = { x: this.width * 0.5, y: this.height * 0.35 }
        if (this.enemies.includes(target)) {
          const idx = this.enemies.indexOf(target)
          hitPos = this.enemyPositions[idx] || hitPos
          this._applyAttackDamageToTarget(hero, skill, target, this.enemyPositions[idx])
        } else if (this.party.includes(target)) {
          const idx = this.party.indexOf(target)
          hitPos = this.heroBasePositions[idx] || hitPos
          this._applyAttackDamageToTarget(hero, skill, target, this.heroBasePositions[idx])
        }
        // ★ 命中特效（火球/冰晶/雷击的击中动画）
        if (skill.type === 'magic') {
          this._playHitEffect(hero, skill, hitPos)
        }
      }

      this.activeAttackers.delete(hero.id)
      if (hAnimState) {
        hAnimState._isCastingSkill = false
        hAnimState.frameDuration = 80
      }
    }, castDuration)
  }

  // 队长物理技能：原地 slash 动画 + 延迟伤害
  proto._captainPhysicalSkill = function(hero, skill, target, targetIdx) {
    const dpr = this.dpr
    const hAnimState = this.heroAnimStates[hero.id]
    if (hAnimState) {
      hAnimState.state = 'attack'
      hAnimState.frame = 0
      hAnimState.frameTimer = 0
    }

    const hitDelay = 350
    this._scheduleTimer(() => {
      if (target && target.hp > 0) {
        // ★ 近战物理技能范围判定
        const capState = this.unitStates[hero.id]
        const tgtState = this.unitStates['enemy_' + targetIdx]
        if (!capState || !tgtState || this._getDistance(capState, tgtState) <= this.MELEE_RANGE * 1.3) {
          const pos = targetIdx >= 0 ? this.enemyPositions[targetIdx] : null
          this._applyAttackDamageToTarget(hero, skill, target, pos || { x: this.width * 0.7, y: this.height * 0.28 })
          if (this.flashAlpha < 0.1) this.flashAlpha = 0.1
          this.shakeAmount = Math.max(this.shakeAmount, 5 * dpr)
        }
      }
      this.activeAttackers.delete(hero.id)
    }, hitDelay)
  }

  // ======== 目标查找 ========
  proto._findNearestAliveEnemy = function(heroState) {
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

  // ======== 敌人目标查找（智能选择 + 战术协同） ========
  proto._findNearestAliveHero = function(enemyState, enemy) {
    // ★ 调试：输出函数调用信息
    if (!this._lastFindTargetLog || this.time - this._lastFindTargetLog > 2) {
      console.log(`[_findNearestAliveHero] 查找目标，敌人位置=(${enemyState.x.toFixed(1)}, ${enemyState.y.toFixed(1)}), isRanged=${enemyState.isRanged}`)
      this._lastFindTargetLog = this.time
    }

    // ★ 简化模式：直接找最近的存活英雄（便于调试AI问题）
    let bestHero = null
    let minDist = Infinity
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      const hState = this.unitStates[hero.id]
      if (!hState) continue
      const d = this._getDistance(enemyState, hState)
      if (d < minDist) {
        minDist = d
        bestHero = hero
      }
    }

    if (bestHero) {
      console.log(`[_findNearestAliveHero] 选择最近的${bestHero.name}，距离=${minDist.toFixed(1)}`)
      return { hero: bestHero, distance: minDist, state: this.unitStates[bestHero.id] }
    }

    console.log(`[_findNearestAliveHero] 未找到存活目标！`)
    return { hero: null, distance: Infinity, state: null }
  }

  // ======== 属性计算 ========

  // ======== 属性计算 ========
  proto._initAutoBattleTimers = function() {
    this.party.forEach(hero => {
      const attackInterval = this._getAttackInterval(hero)
      const initialOffset = attackInterval * Math.random() * 0.15
      this.heroAttackTimers[hero.id] = {
        attackTimer: initialOffset,
        skillCDs: {},
        _hasFirstAttacked: false,
      }
      hero.skills.forEach(skill => {
        if (skill.mpCost > 0 || skill.type !== 'attack') {
          this.heroAttackTimers[hero.id].skillCDs[skill.id] = 0
        }
      })
    })

    this.enemies.forEach((enemy, index) => {
      const enemyInterval = this._getEnemyAttackInterval(enemy)
      const initialOffset = enemyInterval * (0.5 + Math.random() * 0.8)
      // ★ 修复：统一使用 enemy.id 作为键（与 _updateEnemyAutoAttack 一致）
      this.enemyAttackTimers[enemy.id] = {
        attackTimer: initialOffset,
        skillCDs: {},
        isAttacking: false
      }
      if (enemy.skills && Array.isArray(enemy.skills)) {
        enemy.skills.forEach(skill => {
          this.enemyAttackTimers[enemy.id].skillCDs[skill.id || skill.name] = 0
        })
      }
      console.log(`[Battle] 敌人 ${enemy.name}(${enemy.id}) 攻击计时器已初始化，首次攻击=${initialOffset.toFixed(2)}秒`)
    })

    // ★ 初始化敌人攻击队列
    this._enemyAttackQueue = []
  }

  // ★ 只初始化敌人攻击计时器（用于测试模式：禁用英雄自动攻击，保留敌人AI）
  proto._initEnemyAttackTimersOnly = function() {
    this.enemies.forEach((enemy, index) => {
      const enemyInterval = this._getEnemyAttackInterval(enemy)
      const initialOffset = enemyInterval * (0.5 + Math.random() * 0.8)
      // ★ 修复：统一使用 enemy.id 作为键（与 _updateEnemyAutoAttack 一致）
      this.enemyAttackTimers[enemy.id] = {
        attackTimer: initialOffset,
        skillCDs: {},
        isAttacking: false
      }
      if (enemy.skills && Array.isArray(enemy.skills)) {
        enemy.skills.forEach(skill => {
          this.enemyAttackTimers[enemy.id].skillCDs[skill.id || skill.name] = 0
        })
      }
      console.log(`[Battle] 敌人 ${enemy.name}(${enemy.id}) 攻击计时器已初始化，首次攻击=${initialOffset.toFixed(2)}秒`)
    })
    
    // ★ 初始化敌人攻击队列
    this._enemyAttackQueue = []
    console.log('[Battle] 敌人AI计时器已初始化（测试模式）')
  }

  proto._getMoveSpeed = function(unit) {
    const spd = unit.spd || 10
    return Math.max(50, Math.min(300, this.MOVE_SPEED_BASE * spd / 10))
  }

  proto._getAttackInterval = function(unit) {
    const spd = unit.spd || 10
    return Math.max(1.2, Math.min(4.0, 3.5 - spd * 0.12))
  }

  proto._getEnemyAttackInterval = function(enemy) {
    const spd = enemy.spd || 8
    // 更短的攻击间隔：0.8-2.5秒（原来1.5-4.5秒）
    return Math.max(0.8, Math.min(2.5, 2.5 - spd * 0.15))
  }

  proto._getSkillCooldown = function(unit, skill) {
    // ★ 测试战斗：技能无CD，方便调试动画效果
    if (this.nodeId === 'test_battle') return 0

    const isBasicAttack = !skill.effect && !skill.target && !skill.restrictChance &&
                          !skill.id && (!skill.name || skill.name === '攻击') && (skill.power || 1) <= 1.05
    if (isBasicAttack) return 0

    const baseCd = lookupBaseCd(skill)
    const spd = unit.spd || 10
    const cdMultiplier = Math.max(0.5, 1.5 - spd * 0.03)
    return baseCd * cdMultiplier
  }

  proto._getEffectiveAtk = function(hero) {
    let atk = hero.atk
    const heroIndex = this.party.indexOf(hero)
    if (heroIndex !== -1) {
      const effects = this.statusEffects.heroes[heroIndex] || []
      effects.forEach(e => {
        if (e.type === 'atk_up' && (e.turnsRemaining > 0 || e.duration > 0)) {
          atk = Math.floor(atk * (1 + (e.value || 0.3)))
        }
      })
    }
    return atk
  }

  proto._getEffectiveDef = function(hero) {
    let def = hero.def
    const heroIndex = this.party.indexOf(hero)
    if (heroIndex !== -1) {
      const effects = this.statusEffects.heroes[heroIndex] || []
      effects.forEach(e => {
        if (e.type === 'def_up' && (e.turnsRemaining > 0 || e.duration > 0)) {
          def = Math.floor(def * (1 + (e.value || 0.3)))
        }
      })
    }
    return def
  }

  proto._getEnemyEffectiveAtk = function(enemy) {
    let atk = enemy.atk
    const enemyIndex = this.enemies.indexOf(enemy)
    if (enemyIndex !== -1) {
      const effects = this.statusEffects.enemies[enemyIndex] || []
      effects.forEach(e => {
        if (e.type === 'atk_down' && e.turnsRemaining > 0) {
          atk = Math.floor(atk * (1 - (e.value || 0.3)))
        }
        if (e.type === 'atk_up' && (e.turnsRemaining > 0 || e.duration > 0)) {
          atk = Math.floor(atk * (1 + (e.value || 0.3)))
        }
      })
    }
    return atk
  }

  proto._getEnemyEffectiveDef = function(enemy) {
    let def = enemy.def || 0
    const enemyIndex = this.enemies.indexOf(enemy)
    if (enemyIndex !== -1) {
      const effects = this.statusEffects.enemies[enemyIndex] || []
      effects.forEach(e => {
        if (e.type === 'def_down' && (e.turnsRemaining > 0 || e.duration > 0)) {
          def = Math.floor(def * (1 - (e.value || 0.3)))
        }
        // ★ def_up：钢铁防御等buff提升防御力50%
        if (e.type === 'def_up' && (e.duration > 0 || e.turnsRemaining > 0)) {
          def = Math.floor(def * (1 + (e.value || 0.5)))
        }
      })
    }
    return def
  }

  // ======== AI 技能选择 ========
  proto._aiChooseSkill = function(hero) {
    const timer = this.heroAttackTimers[hero.id]
    if (!timer) return null

    const availableSkills = []
    hero.skills.forEach(skill => {
      if (hero.mp < skill.mpCost) return
      const cdRemaining = timer.skillCDs[skill.id] || 0
      if (cdRemaining > 0) return
      availableSkills.push(skill)
    })

    if (availableSkills.length === 0) return null

    const isBasicAttack = (s) => {
      return s.type === 'attack' && !s.effect && !s.target &&
             !s.restrictChance && !s.statusEffect &&
             (s.mpCost || 0) <= 0 && (s.power || 1) <= 1.25
    }

    if (hero.role === 'healer') {
      let lowestHpAlly = null
      let lowestHpRatio = 1
      this.party.forEach(h => {
        if (h.hp > 0 && h.hp / h.maxHp < lowestHpRatio) {
          lowestHpRatio = h.hp / h.maxHp
          lowestHpAlly = h
        }
      })
      if (lowestHpAlly && lowestHpRatio < 0.5) {
        const healSkill = availableSkills.find(s =>
          s.type === 'heal' && (s.target === 'single_ally' || !s.target?.includes('all'))
        )
        if (healSkill) return healSkill
        const groupHeal = availableSkills.find(s => s.type === 'heal')
        if (groupHeal) return groupHeal
      }
    }

    const buffSkills = availableSkills.filter(s => s.type === 'buff')
    if (buffSkills.length > 0) {
      const heroIndex = this.party.indexOf(hero)
      const heroEffects = heroIndex !== -1 ? (this.statusEffects.heroes[heroIndex] || []) : []
      buffSkills.sort((a, b) => ((b.value || 0) + (b.mpCost || 0)) - ((a.value || 0) + (a.mpCost || 0)))
      for (const bs of buffSkills) {
        const effectType = bs.effect === 'atk_up_self' ? 'atk_up' :
                           bs.effect === 'def_up_self' ? 'def_up' : bs.effect
        const existingBuff = heroEffects.find(e => e.type === effectType && e.turnsRemaining > 0)
        if (!existingBuff) {
          if (Math.random() < 0.65) return bs
        } else if (existingBuff.turnsRemaining <= 1) {
          return bs
        }
      }
    }

    const debuffSkills = availableSkills.filter(s => s.type === 'debuff')
    if (debuffSkills.length > 0 && Math.random() < 0.4) {
      return debuffSkills[Math.floor(Math.random() * debuffSkills.length)]
    }

    const magicSkills = availableSkills.filter(s => s.type === 'magic')
    if (magicSkills.length > 0 && Math.random() < 0.6) {
      if (this.enemies.filter(e => e.hp > 0).length >= 2) {
        const aoeSkill = magicSkills.find(s => s.target === 'all')
        if (aoeSkill) return aoeSkill
      }
      magicSkills.sort((a, b) => (b.power || 1) - (a.power || 1))
      return magicSkills[0]
    }

    const specialAttacks = availableSkills.filter(s =>
      s.type === 'attack' && !isBasicAttack(s)
    )
    if (specialAttacks.length > 0 && Math.random() < 0.5) {
      specialAttacks.sort((a, b) => (b.power || 1) - (a.power || 1))
      return specialAttacks[0]
    }

    const basicAttack = availableSkills.find(s => isBasicAttack(s))
    if (basicAttack) return basicAttack
    return availableSkills[0]
  }

  proto._aiChooseTarget = function(hero, skill) {
    if (skill.type === 'buff') return null

    if (skill.type === 'debuff') {
      const aliveEnemies = this.enemies.filter(e => e.hp > 0)
      return aliveEnemies.length > 0 ? aliveEnemies[0] : null
    }

    if (skill.type === 'heal' || (skill.target && skill.target.includes('ally'))) {
      if (skill.target === 'all_ally') return null
      let target = null
      let lowestHp = Infinity
      this.party.forEach(h => {
        if (h.hp > 0 && h.hp < lowestHp) {
          lowestHp = h.hp
          target = h
        }
      })
      return target || hero
    }

    if (skill.target === 'all') return null

    const aliveEnemies = this.enemies.filter(e => e.hp > 0)
    if (aliveEnemies.length === 0) return null
    if (aliveEnemies.length === 1) return aliveEnemies[0]

    aliveEnemies.sort((a, b) => a.hp - b.hp)
    return aliveEnemies[0]
  }

  // ======== 己方自动战斗核心循环 ========
  proto._updateAutoBattle = function(dt) {
    // ★ 测试模式：完全禁用英雄自动攻击
    if (this._testMode) {
      // 详细日志：每5秒输出一次，避免刷屏
      if (!this._lastTestModeLog || this.time - this._lastTestModeLog > 5) {
        console.log(`[AutoBattle] 测试模式已启用(_testMode=${this._testMode})，跳过英雄自动攻击`)
        console.log(`[AutoBattle] 当前英雄数量=${this.party.length}, 敌人数量=${this.enemies.length}`)
        // 检查是否有英雄正在攻击
        this.party.forEach(hero => {
          const state = this.unitStates[hero.id]
          if (state) {
            console.log(`[AutoBattle] ${hero.name}: state=${state.state}, currentTargetId=${state.currentTargetId}`)
          }
        })
        this._lastTestModeLog = this.time
      }
      return
    }

    if (this.isPaused) return
    if (this.phase !== 'auto_battle' && this.phase !== 'animating') return

    this.time += dt * this.battleSpeed
    this._updateCombatUnits(dt)

    const effectiveDt = dt * this.battleSpeed

    // ★ 关键修复：当有角色正在播放攻击动画时，跳过新攻击触发
    // 防止多个角色几乎同时攻击导致视觉混乱、动画重叠不可见
    const hasActiveAttackAnimation = !!(this.attackAnim && this.attackingHero)
    if (hasActiveAttackAnimation) {
      // 只更新移动和CD，不触发新攻击
      for (const hero of this.party) {
        if (hero.hp <= 0) continue
        const timer = this.heroAttackTimers[hero.id]
        if (!timer) continue
        for (const skillId in timer.skillCDs) {
          if (timer.skillCDs[skillId] > 0) {
            timer.skillCDs[skillId] = Math.max(0, timer.skillCDs[skillId] - effectiveDt)
          }
        }
      }
      return
    }

    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      if (this.activeAttackers.has(hero.id)) continue

      // ★ 队长模式：跳过玩家操控的角色（由手动按钮触发）
      if (this._captainMode && this._controlledHero && hero.id === this._controlledHero.id) continue

      const timer = this.heroAttackTimers[hero.id]
      const state = this.unitStates[hero.id]
      if (!timer || !state) continue

      for (const skillId in timer.skillCDs) {
        if (timer.skillCDs[skillId] > 0) {
          timer.skillCDs[skillId] = Math.max(0, timer.skillCDs[skillId] - effectiveDt)
        }
      }

      switch (state.state) {
        case 'idle': {
          const { index: enemyIdx, state: enemyState } = this._findNearestAliveEnemy(state)
          if (enemyIdx < 0 || !enemyState || this.enemies[enemyIdx].hp <= 0) break

          const distToEnemy = this._getDistance(state, enemyState)
          const contactDist = state.isRanged ? state.attackRange : this._getMeleeContactDistance(state, enemyState)

          if (distToEnemy <= contactDist) {
            const isFirstEntry = state.state !== 'in_range' && state.state !== 'attacking'
            state.currentTargetId = enemyIdx
            state.state = 'in_range'
            timer.attackTimer = 0
            if (isFirstEntry && !timer._hasFirstAttacked) {
              timer._needsFirstStrike = true
            }
            state._moveStartTime = null
          } else {
            this._setApproachTarget(state, enemyState, enemyIdx)
            state.state = 'moving_to_attack'
            state._moveStartTime = this.time || Date.now() / 1000
          }
          break
        }

        case 'in_range':
        case 'attacking': {
          const targetEnemyIdx = state.currentTargetId
          if (targetEnemyIdx === null || !this.enemies[targetEnemyIdx] || this.enemies[targetEnemyIdx].hp <= 0) {
            console.log(`[Battle] ${hero.name} 目标死亡，返回`)
            state.state = 'returning'
            break
          }

          const targetEnemy = this.enemies[targetEnemyIdx]
          const tState = this.unitStates['enemy_' + targetEnemyIdx]

          let actualDist = Infinity
          if (tState) {
            actualDist = this._getDistance(state, tState)
          }
          const contactDist = state.isRanged ? state.attackRange : this._getMeleeContactDistance(state, tState)

          if (actualDist > contactDist * 1.8) {
            if (this.activeAttackers.has(hero.id)) break
            if (state._justArrivedTimer && state._justArrivedTimer > 0) break
            console.log(`[Battle] ${hero.name} 目标跑远了，追击 dist=${actualDist.toFixed(1)} range=${contactDist.toFixed(1)}`)
            if (tState) {
              const angle = Math.atan2(tState.y - state.y, tState.x - state.x)
              const chaserId = Object.keys(this.unitStates).find(k => this.unitStates[k] === state) || 'h0'
              const chaseSideSign = (chaserId.charCodeAt(chaserId.length - 1) % 2 === 0) ? 1 : -1
              const chaseLateral = 30 * this.dpr * chaseSideSign
              const chaseDist = actualDist - contactDist
              state.targetX = state.x + Math.cos(angle) * chaseDist + (-Math.sin(angle)) * chaseLateral
              state.targetY = state.y + Math.sin(angle) * chaseDist + Math.cos(angle) * chaseLateral
              state.state = 'moving_to_attack'
            }
            break
          }

          const attackInterval = this._getAttackInterval(hero)

          if (timer._needsFirstStrike && !this.activeAttackers.has(hero.id)) {
            console.log(`[Battle] ${hero.name} 首攻! 零延迟出刀`)
            timer._needsFirstStrike = false
            timer._hasFirstAttacked = true
            const skill = this._aiChooseSkill(hero)
            if (!skill) { timer._needsFirstStrike = false; break }
            const isFirstBasic = !skill.effect && !skill.target && !skill.restrictChance && !skill.statusEffect && (skill.mpCost||0)<=0 && (skill.power||1)<=1.25
            if (!isFirstBasic && skill.type !== 'attack') {
              timer.skillCDs[skill.id] = this._getSkillCooldown(hero, skill)
            } else if (!isFirstBasic) {
              timer.skillCDs[skill.id] = this._getSkillCooldown(hero, skill)
            }
            this.activeAttackers.add(hero.id)
            const target = this._aiChooseTarget(hero, skill)
            this._doHeroAttack(hero, skill, target, targetEnemyIdx)
            break
          }

          timer.attackTimer += effectiveDt
          if (timer.attackTimer >= attackInterval) {
            timer.attackTimer = 0
            const skill = this._aiChooseSkill(hero)
            if (!skill) break
            const isFirstBasic2 = !skill.effect && !skill.target && !skill.restrictChance && !skill.statusEffect && (skill.mpCost||0)<=0 && (skill.power||1)<=1.25
            if (!isFirstBasic2 && skill.type !== 'attack') {
              timer.skillCDs[skill.id] = this._getSkillCooldown(hero, skill)
            } else if (!isFirstBasic2) {
              timer.skillCDs[skill.id] = this._getSkillCooldown(hero, skill)
            }
            this.activeAttackers.add(hero.id)
            const target = this._aiChooseTarget(hero, skill)
            this._doHeroAttack(hero, skill, target, targetEnemyIdx)
          }
          break
        }
      }
    }

    // 检查战斗结束
    if (this.enemies.every(e => e.hp <= 0)) {
      this.phase = 'victory'
      this._addLog(`⚔️ 战斗胜利！`)
      // 延迟切到胜利画面（让最后一帧伤害数字显示完）
      this._scheduleTimer(() => {
        if (this.phase === 'victory') {
          this._generateBattleRewards()
        }
      }, 800)
    }

    if (this.party.every(h => h.hp <= 0)) {
      this.phase = 'defeat'
      this._addLog(`队伍全灭...`)
    }
  }

  proto._doHeroAttack = function(hero, skill, target, targetEnemyIndex) {
    // ★ 测试模式：强制阻止所有英雄攻击
    if (this._testMode) {
      console.warn(`[Battle] ⚠️ 测试模式：阻止 ${hero.name} 的自动攻击！`)
      console.warn(`[Battle] 调用栈:`, new Error().stack)
      return  // 直接返回，不执行攻击
    }

    // ★ 调试：输出调用栈，追踪攻击触发来源
    const stack = new Error().stack
    console.log(`[Battle] ${hero.name} 使用「${skill.name}」${target ? `攻击 ${target.name}` : ''}`)
    console.log(`[Battle] 调用栈:`, stack)
    console.log(`[Battle] 当前状态: _testMode=${this._testMode}, _captainMode=${this._captainMode}, attackingHero=${this.attackingHero ? this.attackingHero.name : 'null'}`)

    try {
      // 扣除MP
      hero.mp = Math.max(0, hero.mp - (skill.mpCost || 0))

      // 设置当前目标索引
      const hState = this.unitStates[hero.id]
      if (hState) hState.currentTargetId = targetEnemyIndex

      // 播放攻击动画
      this._startAttackAnimation(hero, skill, target || this.enemies[targetEnemyIndex])
    } catch (e) {
      console.error('[Battle] _doHeroAttack 崩溃!', e.message, e.stack, { hero: hero?.name, skill: skill?.name, target: target?.name, targetEnemyIndex })
      // 尝试恢复状态
      this.attackingHero = null
      this.attackAnim = null
      this.phase = 'auto_battle'
      // 直接结算伤害（跳过动画）
      if (target && target.hp > 0) this._applyAttackDamage(hero, target)
      this._finishHeroAttack(hero)
    }
  }

  proto._finishHeroAttack = function(hero) {
    const skill = this.currentSkill || { name: '攻击', power: 1.0, type: 'attack', effect: null }
    const target = this.currentAttackTarget

    if (!target) {
      console.warn('[Battle] finishHeroAttack 无目标')
      this.activeAttackers.delete(hero.id)
      return
    }

    // ★ 法术类攻击的伤害已在 cast 回调中由 _applyAttackDamage 结算过，此处不再重复
    // ★ attack 类型即使附带 effect（如盾击stun）也走物理路径，在此结算伤害
    const isMagicOrSpecial = (skill.type !== 'attack') &&
      (skill.type === 'magic' || skill.type === 'heal' || skill.type === 'heal_self' ||
       skill.type === 'buff' || skill.type === 'debuff' || skill.type === 'summon' ||
       !!(skill.effect || skill.target || skill.restrictChance || skill.statusEffect))
    if (isMagicOrSpecial) {
      // 法术伤害已在 cast 回调中结算，只清除攻击标记
      this.activeAttackers.delete(hero.id)
      return
    }

    // 结算伤害（物理攻击路径）
    if (skill.type === 'heal' || skill.type === 'heal_self') {
      const healAmount = Math.floor(hero.magic * (skill.power || 1.0))
      target.hp = Math.min(target.maxHp, target.hp + healAmount)
      const targetPos = this.enemyPositions[this.enemies.indexOf(target)] ||
                         this.heroBasePositions[this.party.indexOf(target)]
      this.damageTexts.push({
        text: `+${healAmount}`,
        x: (targetPos || { x: this.width / 2 }).x,
        y: (targetPos || { y: this.height * 0.4 }).y - 50 * this.dpr,
        color: '#2ed573',
        life: 1.5
      })
      this._addLog(`${hero.name} 使用「${skill.name}」，恢复了 ${target.name} ${healAmount} 点生命！`)
    } else if (skill.target === 'all' || skill.target === 'all_enemies') {
      // AOE攻击所有敌人
      this.enemies.forEach((enemy, idx) => {
        if (enemy.hp <= 0) return
        this._applyAttackDamageToTarget(hero, skill, enemy, this.enemyPositions[idx])
      })
      this._addLog(`${hero.name} 使用「${skill.name}」攻击全体敌人！`)
    } else if (target && this.enemies.includes(target)) {
      this._applyAttackDamageToTarget(hero, skill, target, this.enemyPositions[this.enemies.indexOf(target)])
    } else if (target && this.party.includes(target)) {
      // 对友方目标的伤害（某些特殊技能）
      this._applyAttackDamageToTarget(hero, skill, target, this.heroBasePositions[this.party.indexOf(target)])
    }

    // 清除攻击标记
    this.activeAttackers.delete(hero.id)
  }

  // ======== 敌人AI ========
  proto._updateEnemyAutoAttack = function(dt) {
    if (this.isPaused) return
    if (this.phase !== 'auto_battle' && this.phase !== 'animating') {
      console.log(`[Enemy AI] 敌人AI未执行，phase=${this.phase}`)
      return
    }

    // ★ 保护检查：如果正在执行特殊技能（如治愈冲击），跳过敌人AI更新
    // 让技能自己的更新函数来控制
    if (this._healingImpact && this._healingImpact.active) {
      return // 让 _updateHealingImpact 来控制
    }

    // ★ 调试日志（每3秒输出一次）
    if (!this._lastEnemyAiLog || this.time - this._lastEnemyAiLog > 3) {
      console.log(`[Enemy AI] 敌人AI正在执行，phase=${this.phase}, enemies.length=${this.enemies.length}, battleTime=${this.time.toFixed(2)}`)
      this._lastEnemyAiLog = this.time
    }

    // ★ 立即调试：检查第一个敌人的状态
    if (this.enemies.length > 0) {
      const enemy = this.enemies[0]
      const timer = this.enemyAttackTimers[enemy.id]
      const estate = this.unitStates['enemy_0']
      console.log(`[Enemy AI] 立即调试: ${enemy.name}, HP=${enemy.hp}, timer=${timer ? '存在' : '不存在'}, estate=${estate ? '存在, state=' + estate.state : '不存在'}`)
    }

      // ★ 详细调试：检查每个敌人的状态
      if (!this._lastEnemyDetailLog || this.time - this._lastEnemyDetailLog > 5) {
        this.enemies.forEach((enemy, idx) => {
          const timer = this.enemyAttackTimers[enemy.id]
          const estate = this.unitStates['enemy_' + idx]
          const state = estate ? estate.state : 'unknown'
          console.log(`[Enemy AI] 敌人${idx}: ${enemy.name}, HP=${enemy.hp}, state=${state}, attackTimer=${timer ? timer.attackTimer.toFixed(2) : 'N/A'}, isAttacking=${timer ? timer.isAttacking : 'N/A'}`)
        })
        this._lastEnemyDetailLog = this.time
      }

    // ★ 修复：直接用 dt（秒），不要用 battleSpeed（会导致计时器变慢）
    const effectiveDt = dt

    // ★ 调试：输出敌人AI执行状态（每3秒一次）
    if (!this._lastEnemyAiLog || this.time - this._lastEnemyAiLog > 3) {
      console.log(`[Enemy AI] 敌人AI正在执行，phase=${this.phase}, time=${this.time.toFixed(2)}, dt=${dt.toFixed(4)}`)
      this._lastEnemyAiLog = this.time
    }

    // ★ 处理攻击队列：动画空闲时从队列中取出下一个攻击
    if (!this.enemyAttacking && this._enemyAttackQueue && this._enemyAttackQueue.length > 0) {
      const next = this._enemyAttackQueue.shift()
      this._executeEnemyAttackAnim(next.enemy, next.enemyIndex, next.skill, next.target)
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i]
      if (enemy.hp <= 0) continue

      // ★ 修复：统一使用 enemy.id 作为键
      const timer = this.enemyAttackTimers[enemy.id]
      if (!timer) {
        console.warn(`[Enemy AI] 敌人 ${enemy.name}(${enemy.id}) 的计时器未找到！`)
        continue
      }
      
      // ★ 保护：如果敌人卡在 isAttacking=true，强制重置
      if (timer.isAttacking) {
        const estate = this.unitStates['enemy_' + i]
        
        // ★ 修复：如果 estate 不存在，强制重置
        if (!estate) {
          console.log(`[Enemy AI] ${enemy.name} estate 不存在，强制重置 isAttacking`)
          timer.isAttacking = false
          timer._attackStartTime = null
          continue
        }
        
        // ★ 状态一致性检查：如果 isAttacking=true 但状态不是 'attacking'，说明状态不一致
        if (estate.state !== 'attacking') {
          console.log(`[Enemy AI] ${enemy.name} 状态不一致: isAttacking=true 但 state=${estate.state}，强制重置`)
          timer.isAttacking = false
          timer._attackStartTime = null
          estate.state = 'idle'
          estate.currentTargetId = null
          continue
        }
        
        if (!timer._attackStartTime) {
          timer._attackStartTime = this.time
        } else if (this.time - timer._attackStartTime > 5.0) {
          console.log(`[Enemy AI] ${enemy.name} 攻击卡住超过5秒，强制重置 isAttacking`)
          timer.isAttacking = false
          timer._attackStartTime = null
          estate.state = 'idle'
          estate.currentTargetId = null
        } else {
          console.log(`[Enemy AI] ${enemy.name} 正在攻击中，跳过AI更新`)
          continue  // per-enemy锁：该敌人正在攻击中
        }
      } else {
        timer._attackStartTime = null
      }

      const estate = this.unitStates['enemy_' + i]
      if (!estate) continue

      // ★ 眩晕检查：被眩晕的敌人无法行动
      const enemyEffects = this.statusEffects.enemies[i] || []
      const isStunned = enemyEffects.some(e => e.type === 'stunned' && (e.duration > 0 || e.turnsRemaining > 0))
      if (isStunned) {
        estate.state = 'idle'
        continue
      }

      // ★ P2-15: 受击硬直检查：硬直期间无法行动
      if (timer._hitStunUntil && this.time < timer._hitStunUntil) {
        continue  // 硬直中，跳过本帧
      }
      if (timer._hitStunUntil && this.time >= timer._hitStunUntil) {
        timer._hitStunUntil = null  // 硬直结束
      }

      // 减少技能CD
      let hasCD = false
      for (const skillId in timer.skillCDs) {
        if (timer.skillCDs[skillId] > 0) {
          timer.skillCDs[skillId] = Math.max(0, timer.skillCDs[skillId] - effectiveDt)
          hasCD = true
        }
      }
      // ★ 调试：输出CD状态
      if (hasCD && (!estate._lastCDLog || this.time - estate._lastCDLog > 2)) {
        const cdStr = Object.entries(timer.skillCDs).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ')
        console.log(`[Enemy AI] ${enemy.name} CD状态: ${cdStr}, effectiveDt=${effectiveDt.toFixed(4)}`)
        estate._lastCDLog = this.time
      }

      switch (estate.state) {
        case 'idle': {
          // ★ P2-12: 低HP逃跑 — 非Boss/非精英在HP<20%时概率逃跑
          if (!enemy.isBoss && !enemy.isElite) {
            const hpRatio = enemy.hp / enemy.maxHp
            if (hpRatio < 0.2 && Math.random() < 0.3) {
              // 向远离最近英雄的方向逃跑
              const { hero: fleeTarget, state: fleeTargetState } = this._findNearestAliveHero(estate, enemy)
              if (fleeTargetState && fleeTarget) {
                const awayAngle = Math.atan2(estate.y - fleeTargetState.y, estate.x - fleeTargetState.x)
                const fleeDist = 120 * this.dpr
                const fleeTarget = this._clampTargetToBattlefield(
                  estate.x + Math.cos(awayAngle) * fleeDist,
                  estate.y + Math.sin(awayAngle) * fleeDist
                )
                estate.targetX = fleeTarget.x
                estate.targetY = fleeTarget.y
                estate.state = 'fleeing'
                this._addLog(`${enemy.name} 害怕了，试图逃跑！`)
                break
              }
            }
          }

          // ★ 分散目标：每个敌人优先找还没被打的敌方角色
          const { hero: targetHero, state: targetState } = this._findNearestAliveHero(estate)
          if (!targetHero || !targetState) {
            console.log(`[Enemy AI] ${enemy.name} idle状态：未找到目标！`)
            break
          }

          // ★ 简化：直接追踪目标当前位置，不再计算"接近点"
          estate.currentTargetId = targetHero.id
          estate.targetX = targetState.x
          estate.targetY = targetState.y
          estate.state = 'moving_to_attack'
          estate._moveStartTime = this.time || Date.now() / 1000
          console.log(`[Enemy AI] ${enemy.name} 进入 moving_to_attack，追踪目标 ${targetHero.name}`)
          break
        }

        case 'moving_to_attack': {
          // ★ 简化：直接追踪目标当前位置
          const { hero: targetHero2, state: targetState2 } = this._findNearestAliveHero(estate)
          if (!targetHero2 || !targetState2) {
            console.log(`[Enemy AI] ${enemy.name} moving_to_attack 中失去目标，回到 idle`)
            estate.state = 'idle'
            break
          }

          // 更新目标位置（直接追向目标）
          estate.targetX = targetState2.x
          estate.targetY = targetState2.y

          const dist2 = this._getDistance(estate, targetState2)
          const contactDist2 = estate.isRanged ? estate.attackRange : this.MELEE_RANGE * 0.9

          // ★ 调试：输出移动状态
          console.log(`[Enemy AI] ${enemy.name} moving_to_attack 中，dist=${dist2.toFixed(1)}, contactDist=${contactDist2.toFixed(1)}`)

          if (dist2 <= contactDist2) {
            console.log(`[Enemy AI] ${enemy.name} 到达攻击范围，进入 in_range！`)
            estate.currentTargetId = targetHero2.id
            estate.state = 'in_range'
            timer.attackTimer = 0
            estate._moveStartTime = null
          }
          break
        }

        case 'in_range':
        case 'attacking': {
          const targetHeroId = estate.currentTargetId
          if (!targetHeroId) {
            // ★ 清除目标位置，回到 idle 重新寻敌（敌人不用 returning）
            estate.targetX = null
            estate.targetY = null
            estate.state = 'idle'
            break
          }

          const targetHero = this.party.find(h => h.id === targetHeroId)
          if (!targetHero || targetHero.hp <= 0) {
            // ★ 目标死亡：清除目标ID和位置，重新找目标
            estate.currentTargetId = null
            estate.targetX = null
            estate.targetY = null
            estate.state = 'idle'
            console.log(`[Enemy AI] ${enemy.name} 目标死亡，重新找目标`)
            break
          }

          const htState = this.unitStates[targetHeroId]
          if (!htState) {
            estate.currentTargetId = null
            estate.targetX = null
            estate.targetY = null
            estate.state = 'idle'
            break
          }

          const actualDist = this._getDistance(estate, htState)
          const contactDist = estate.isRanged ? estate.attackRange : this.MELEE_RANGE * 0.9

          // ★ 调试：每2秒输出一次状态
          if (!estate._lastRangeLog || this.time - estate._lastRangeLog > 2) {
            console.log(`[Enemy AI] ${enemy.name} 状态: ${estate.state}, 距离: ${actualDist.toFixed(1)}, contactDist: ${contactDist.toFixed(1)}, attackTimer: ${timer.attackTimer.toFixed(2)}, effectiveDt: ${effectiveDt.toFixed(4)}`)
            estate._lastRangeLog = this.time
          }

          // ★ 远程敌人保持距离：目标太近时后退
          const minRangedDist = estate.isRanged ? this.MELEE_RANGE * 1.8 : 0
          if (estate.isRanged && actualDist < minRangedDist) {
            const angle = Math.atan2(estate.y - htState.y, estate.x - htState.x)
            const retreatDist = minRangedDist - actualDist + 10
            estate.targetX = estate.x + Math.cos(angle) * retreatDist
            estate.targetY = estate.y + Math.sin(angle) * retreatDist
            estate.state = 'fleeing'
            console.log(`[Enemy AI] ${enemy.name} 远程后退`)
            break
          }

          // ★ 修复：在 in_range 状态时，不检查距离，直接等待攻击计时器
          // 只有当目标死亡或无效时，才回到 idle 状态
          // 注释掉距离检查，避免敌人在 in_range 和 moving_to_attack 之间不断切换
          // if (actualDist > contactDist * 2.5) {
          //   estate.state = 'moving_to_attack'
          //   break
          // }

          // ★ 强制：确保 attackTimer 增加
          timer.attackTimer += effectiveDt
          const attackInt = this._getEnemyAttackInterval(enemy) * (estate.isRanged ? 1.3 : 1.0)
          
          // ★ 调试：每2秒显示一次攻击计时器进度
          if (!estate._lastTimerLog || this.time - estate._lastTimerLog > 2) {
            console.log(`[Enemy AI] ${enemy.name} attackTimer: ${timer.attackTimer.toFixed(3)}/${attackInt.toFixed(3)} (effectiveDt=${effectiveDt.toFixed(4)})`)
            estate._lastTimerLog = this.time
          }
          
          if (timer.attackTimer >= attackInt) {
            console.log(`[Enemy AI] ${enemy.name} 发动攻击！attackTimer=${timer.attackTimer.toFixed(3)} >= attackInt=${attackInt.toFixed(3)}, 设置 isAttacking=true`)
            timer.attackTimer = 0
            timer.isAttacking = true
            timer._attackStartTime = this.time

            // ★ 同步更新状态，防止状态不一致导致被强制重置
            estate.state = 'attacking'

            const skill = this._aiChooseEnemySkill(enemy, i)
            estate._currentSkill = skill

            const actualTarget = this.party.find(h => h.id === estate.currentTargetId && h.hp > 0)
            // ★ 入队攻击：允许多敌人蓄力完成，动画依次播放
            this._enqueueEnemyAttack(enemy, i, skill, actualTarget)
          }
          break
        }

        case 'returning':
          // ★ 不在此处重置，让 _updateCombatUnits 中的 returning 移动逻辑正常执行
          // 到达 baseX/baseY 后 _updateCombatUnits 会自动将状态设为 idle
          break
      }
    }
  }

  // ======== 敌人攻击队列 ========
  proto._enqueueEnemyAttack = function(enemy, enemyIndex, skill, target) {
    if (!this._enemyAttackQueue) this._enemyAttackQueue = []
    // 防止同一敌人重复入队
    if (this._enemyAttackQueue.some(q => q.enemyIndex === enemyIndex)) return
    this._enemyAttackQueue.push({ enemy, enemyIndex, skill, target })
  }

  // ======== 执行敌人攻击动画（从队列取出后调用） ========
  proto._executeEnemyAttackAnim = function(enemy, enemyIndex, skill, target) {
    // ★ 检查敌人是否已死亡
    if (!enemy || enemy.hp <= 0) {
      console.log(`[Enemy AI] 敌人已死亡，取消攻击动画`)
      this._clearAttackerFlag('enemy_' + enemyIndex)
      this.enemyAttacking = false
      this.enemyAttackTarget = null
      if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
        this.phase = 'auto_battle'
      }
      return
    }

    this._currentEnemySkill = skill
    this._attackingEnemy = enemy

    // ★ 设置技能 CD（技能实际释放时才设置，避免在选择阶段就被重置）
    const timer = this.enemyAttackTimers[enemy.id]
    // ★ 修复：检查 skill.id 或 skill.name，确保没有id字段的技能也能设置CD
    const isSpecialSkill = skill && (skill.id !== undefined || skill.name !== '攻击')
    if (timer && isSpecialSkill) {
      const cd = this._getSkillCooldown(enemy, skill)
      const skillId = skill.id || skill.name
      timer.skillCDs[skillId] = cd
      console.log(`[Enemy AI] ${enemy.name} 技能「${skill.name}」进入CD: ${cd}秒`)
    }

    this._addLog(`${enemy.name} 使用「${skill.name || '攻击'}」！`)

    // ★ 冲锋技能（charge）：有特殊处理逻辑
    if (skill.type === 'charge') {
      this._executeChargeAttack(enemy, enemyIndex, skill, target)
      return
    }

    // ★ 跳跃攻击技能（jump_attack）：有特殊处理逻辑
    if (skill.type === 'jump_attack') {
      this._executeJumpAttack(enemy, enemyIndex, skill, target)
      return
    }

    // ★ 治愈冲击技能（healing_impact）：多阶段技能
    if (skill.name === '治愈冲击' || skill.type === 'healing_impact') {
      this._executeHealingImpact(enemy, enemyIndex, skill, target)
      return
    }

    // ★ 原地攻击（不跳跃），播放动画帧 + 延迟伤害结算
    const animState = this.enemyAnimStates[enemyIndex]
    const hasFrameAnim = animState && (animState.type === 'aimi' || animState.type === 'slime_cat' || animState.type === 'shadow_mouse')
    
    // ★ 判断是否是技能（需要根据动画类型确定总帧数）
    const isBuffSkill = skill.type === 'buff'
    // ★ 修复：type为'attack'的技能（如治愈之爪）应视为普通攻击，即使power>1.25
    const isSkill = skill && skill.type !== 'attack' && (skill.target === 'all' || skill.aoe || (skill.power || 1) > 1.25 || skill.effect || skill.type === 'magic' || skill.type === 'heal_self')

    if (hasFrameAnim || animState) {
      // ★ 设置攻击状态（estate.state 告诉 _updateCombatUnits 保持攻击动画）
      const estate = this.unitStates['enemy_' + enemyIndex]
      if (estate) estate.state = 'attacking'

      // ★ 确定动画状态和总帧数
      let animType = 'attack'
      let totalFrames = 8 // 默认8帧
      
      if (isBuffSkill) {
        animType = 'buff'
        totalFrames = 8 // BUFF动画8帧
      } else if (isSkill) {
        animType = 'skill'
        totalFrames = 8 // 技能动画8帧
      } else {
        animType = 'attack'
        totalFrames = 8 // 攻击动画8帧
      }

      // 播放攻击帧动画
      this.enemyAttacking = true
      this.enemyAttackTarget = target || this.party[0]
      
      if (animState) {
        animState.state = animType
        animState.frame = 1
        animState.displayFrame = 0
        animState.frameTimer = 0
        animState.attackDamageApplied = false
        animState.totalFrames = totalFrames
        animState.animCompleted = false
      }

      // ★ BUFF 技能：立即应用效果 + 动画播放完后清理状态
      if (isBuffSkill) {
        // ★ 立即应用BUFF效果（如暗影突袭的隐身）
        if (this._applyEnemyBuff) {
          this._applyEnemyBuff(enemy, enemyIndex, skill, target)
        }
        
        // ★ 设置动画完成回调：清理攻击状态
        animState.onAttackComplete = () => {
          console.log(`[Enemy AI] ${enemy.name} BUFF技能「${skill.name}」动画播放完成，清理状态`)
          this._clearAttackerFlag('enemy_' + enemyIndex)
          this.enemyAttacking = false
          this.enemyAttackTarget = null
          // 还原敌人移动状态
          if (estate && estate.state === 'attacking') estate.state = 'idle'
          if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
            this.phase = 'auto_battle'
          }
        }
        
        console.log(`[Enemy AI] ${enemy.name} 使用BUFF技能「${skill.name}」，已应用效果，等待动画播放完成`)
      } else {
        // ★ 非BUFF技能：使用延迟结算（保持原逻辑）
        // ★ 计算动画总时长：总帧数 × 帧间隔
        // 注意：在 _updateGenericEnemyAnimation 中，不同状态的帧间隔不同：
        // - idle/walk: baseFrameDuration
        // - attack: baseFrameDuration * 1.5
        // - skill/buff/support: baseFrameDuration * 2.0
        const baseFrameDuration = animState.frameDuration || 100
        let frameDuration = baseFrameDuration
        if (animType === 'attack') {
          frameDuration = baseFrameDuration * 1.5
        } else if (animType === 'skill' || animType === 'buff' || animType === 'support') {
          frameDuration = baseFrameDuration * 2.0  // ★ BUFF/技能动画慢100%
        }
        const animDelay = totalFrames * frameDuration

        console.log(`[Enemy AI] ${enemy.name} ${animType}动画总时长: ${animDelay}ms (${totalFrames}帧 × ${frameDuration}ms)`)

        // 动画播完后结算伤害
        this._scheduleTimer(() => {
          const tgt = this.enemyAttackTarget || this.party.find(h => h.hp > 0) || this.party[0]
          
          // ★ 近战距离判定：只有敌人在攻击范围内才能造成伤害
          const estateNow = this.unitStates['enemy_' + enemyIndex]
          const tgtState = tgt ? this.unitStates[tgt.id] : null
          let canDamage = true
          
          if (estateNow && tgtState && !enemy.isRanged) {
            const dist = this._getDistance(estateNow, tgtState)
            const contactDist = this.MELEE_RANGE * 1.3  // 近战攻击范围
            canDamage = dist <= contactDist
            console.log(`[Enemy AI] ${enemy.name} 攻击距离判定: dist=${dist.toFixed(1)}, contactDist=${contactDist.toFixed(1)}, canDamage=${canDamage}`)
          }
          
          if (canDamage) {
            this._applyEnemyAttackDamage(tgt, enemy)
          } else {
            console.log(`[Enemy AI] ${enemy.name} 距离目标太远，攻击未命中！`)
          }
          
          this._clearAttackerFlag('enemy_' + enemyIndex)
          this.enemyAttacking = false
          this.enemyAttackTarget = null
          // 还原敌人移动状态
          if (estate && estate.state === 'attacking') estate.state = 'idle'
          if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
            this.phase = 'auto_battle'
          }
        }, animDelay)
      }
    } else {
      // ★ P3-17: 无帧动画的敌人也设attacking状态，状态机一致
      const estate = this.unitStates['enemy_' + enemyIndex]
      if (estate) estate.state = 'attacking'

      // 无帧动画的敌人（野猫等）：直接延迟伤害
      this.enemyAttacking = true
      this.enemyAttackTarget = target || this.party[0]
      this._scheduleTimer(() => {
        if (this.phase === 'animating' || this.phase === 'auto_battle') {
          const tgt = this.enemyAttackTarget || this.party.find(h => h.hp > 0) || this.party[0]
          
          // ★ 近战距离判定
          const estateNow = this.unitStates['enemy_' + enemyIndex]
          const tgtState = tgt ? this.unitStates[tgt.id] : null
          let canDamage = true
          
          if (estateNow && tgtState && !enemy.isRanged) {
            const dist = this._getDistance(estateNow, tgtState)
            const contactDist = this.MELEE_RANGE * 1.3
            canDamage = dist <= contactDist
          }
          
          if (canDamage) {
            this._applyEnemyAttackDamage(tgt, enemy)
          }
          
          this._clearAttackerFlag('enemy_' + enemyIndex)
          this.enemyAttacking = false
          this.enemyAttackTarget = null
          // ★ P3-17: 统一还原attacking状态
          if (estate && estate.state === 'attacking') estate.state = 'idle'
        }
      }, 500)
    }

    // 防卡死保护
    this._scheduleTimer(() => {
      if (this.phase === 'animating' && !this.enemyAttacking) {
        this.phase = 'auto_battle'
      }
    }, 4000)
  }

  // ======== 应用敌人BUFF效果（动画完成后调用）========
  proto._applyEnemyBuffEffect = function(enemy, enemyIndex, skill) {
    const effType = skill.effect || 'atk_up'
    const value = skill.value || 0.3
    const duration = skill.duration || 3 // 默认3秒

    // 初始化 statusEffects.enemies[enemyIndex]
    if (!this.statusEffects.enemies[enemyIndex]) {
      this.statusEffects.enemies[enemyIndex] = []
    }

    // 移除同类型旧 buff
    this.statusEffects.enemies[enemyIndex] = 
      this.statusEffects.enemies[enemyIndex].filter(e => e.type !== effType)

    // 添加新 buff
    this.statusEffects.enemies[enemyIndex].push({
      type: effType,
      value: value,
      duration: duration
    })

    this._addLog(`${enemy.name} 的「${skill.name}」生效！${effType === 'atk_up' ? '攻击力' : '防御力'} +${Math.round(value * 100)}%（${duration}秒）`)

    // BUFF 视觉特效
    const dpr = this.dpr
    const enemyState = this.unitStates['enemy_' + enemyIndex]
    if (enemyState) {
      this.codeEffects.push({
        type: 'circle_burst',
        x: enemyState.x,
        y: enemyState.y - 40 * dpr,
        radius: 20 * dpr,
        maxRadius: 80 * dpr,
        alpha: 0.6,
        color: effType === 'atk_up' ? '#FF4444' : '#4444FF',
        duration: 0.5,
        elapsed: 0
      })
    }
  }

  // ======== 冲锋技能实现（艾米专用）========
  proto._executeChargeAttack = function(enemy, enemyIndex, skill, target) {
    const estate = this.unitStates['enemy_' + enemyIndex]
    if (!estate) return

    const animState = this.enemyAnimStates[enemyIndex]
    const dpr = this.dpr

    // ★ 冲锋参数
    const chargeTime = (skill.chargeTime || 2.0) * 1000  // 蓄力时间（毫秒），默认2秒
    const dashDistance = (skill.dashDistance || 200) * dpr  // 冲锋距离（像素），默认200
    const dashSpeed = skill.dashSpeed || 800  // 冲锋速度（像素/秒）
    const dashDuration = (dashDistance / dashSpeed) * 1000  // 冲锋持续时间（毫秒）

    // 获取冲锋方向（面向最近的英雄）
    const { hero: targetHero, state: targetState } = this._findNearestAliveHero(estate)
    if (!targetHero || !targetState) {
      estate.state = 'idle'
      return
    }

    const chargeDir = targetState.x > estate.x ? 1 : -1  // 1=向右, -1=向左
    const startX = estate.x
    const endX = Math.max(30 * dpr, Math.min(this.width - 30 * dpr, estate.x + chargeDir * dashDistance))  // 限制在战场内

    // ★ 设置冲锋状态（由 _updateChargeAttackAnimation 更新）
    this._chargeAttack = {
      active: true,
      phase: 'charging',  // charging -> dashing -> done
      enemyIndex: enemyIndex,
      startX: startX,
      endX: endX,
      chargeDir: chargeDir,
      chargeStartTime: Date.now(),
      chargeTime: chargeTime,
      dashDuration: dashDuration,
      dashStartTime: null,
      skill: skill,
      damageApplied: false  // 防止重复伤害
    }

    // ★ 阶段1：蓄力（播放 skill_01 和 skill_02）
    if (animState) {
      animState.state = 'skill'
      animState.frame = 1  // skill_01
      animState.displayFrame = 0
      animState.frameTimer = 0
      animState.attackDamageApplied = false
    }

    estate.state = 'skill'  // 设置状态为技能释放

    this._addLog(`${enemy.name} 开始蓄力...`)

    // ★ 注意：伤害判定和状态恢复由 _updateChargeAttackAnimation 函数处理
    // 不需要在这里使用 _scheduleTimer
  }

  // ======== 冲锋伤害判定（AOE - 沿X轴）========
  proto._applyChargeDamage = function(enemy, enemyIndex, skill) {
    const power = skill.power || 2.5
    const critBonus = skill.critBonus || 1.0  // 必暴击
    const drainPercent = skill.drainPercent || 0.3  // 吸血比例
    const aoeRadius = (skill.aoeRadius || 50) * this.dpr

    let totalDamage = 0

    // ★ 获取敌人当前位置（冲锋过程中会更新）
    const estate = this.unitStates['enemy_' + enemyIndex]
    if (!estate) return

    const enemyX = estate.x
    const enemyStartX = this._chargeAttack ? this._chargeAttack.startX : enemyX
    const enemyY = estate.y

    // 对沿途所有英雄造成伤害
    this.party.forEach(hero => {
      if (hero.hp <= 0) return

      const heroState = this.unitStates[hero.id]
      if (!heroState) return

      // ★ 沿X轴判定：英雄是否在冲锋路径上
      const minX = Math.min(enemyStartX, enemyX)
      const maxX = Math.max(enemyStartX, enemyX)
      const isInPath = heroState.x >= minX && heroState.x <= maxX
      const dy = Math.abs(heroState.y - enemyY)
      const isInYRange = dy <= aoeRadius

      if (!isInPath || !isInYRange) return  // 不在冲锋路径或Y轴范围外

      // ★ 计算伤害（必暴击）
      const baseDmg = Math.floor(enemy.atk * power)
      const isCrit = true  // 必定暴击
      const critMultiplier = 2.0 + critBonus  // 暴击倍率
      const actualDmg = Math.floor(baseDmg * critMultiplier)

      hero.hp = Math.max(0, hero.hp - actualDmg)
      totalDamage += actualDmg

      this._addLog(`${hero.name} 被击飞，${actualDmg}点伤害！${isCrit ? '（暴击！）' : ''}`)

      // 显示伤害数字
      if (this._showDamageNumber && heroState) {
        this._showDamageNumber(heroState.x, heroState.y, actualDmg, '#ff4444')
      }

      // ★ 击飞效果（设置英雄状态为 hurt，播放受击动画）
      heroState.state = 'hurt'
      this._scheduleTimer(() => {
        if (hero.hp > 0) {
          heroState.state = 'idle'
        }
      }, 500)
    })

    // ★ 吸血效果：回复总伤害的 drainPercent
    if (drainPercent > 0 && totalDamage > 0) {
      const healAmount = Math.floor(totalDamage * drainPercent)
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + healAmount)

      this._addLog(`${enemy.name} 吸取了 ${healAmount} 点生命值！`)

      // 显示治疗数字
      if (this._showDamageNumber && estate) {
        this._showDamageNumber(estate.x, estate.y, healAmount, '#44ff44')
      }
    }
  }

  // ======== 冲锋动画更新（在 battle-animation.js 的 update() 中调用）========
  proto._updateChargeAttackAnimation = function(dt) {
    if (!this._chargeAttack || !this._chargeAttack.active) return

    const charge = this._chargeAttack
    const enemyIndex = charge.enemyIndex
    const enemy = this.enemies[enemyIndex]
    const estate = this.unitStates['enemy_' + enemyIndex]
    const animState = this.enemyAnimStates[enemyIndex]

    if (!enemy || !estate) {
      this._chargeAttack = null
      return
    }

    const now = Date.now()

    if (charge.phase === 'charging') {
      // ★ 蓄力阶段：播放 skill_01 和 skill_02 帧
      const elapsed = now - charge.chargeStartTime
      const progress = Math.min(elapsed / charge.chargeTime, 1.0)

      // 根据进度切换帧（前1秒播放 skill_01，后1秒播放 skill_02）
      if (animState && animState.state === 'skill') {
        if (progress < 0.5) {
          animState.frame = 1  // skill_01
        } else {
          animState.frame = 2  // skill_02
        }
      }

      if (progress >= 1.0) {
        charge.phase = 'dashing'
        charge.dashStartTime = now
        this._addLog(`${enemy.name} 开始冲锋！`)
      }
    } else if (charge.phase === 'dashing') {
      // ★ 冲锋阶段：快速移动 + 播放 skill_03 到 skill_08 帧
      const elapsed = now - charge.dashStartTime
      const progress = Math.min(elapsed / charge.dashDuration, 1.0)

      // 更新敌人X坐标（线性插值）
      const newX = charge.startX + (charge.endX - charge.startX) * progress
      estate.x = newX
      if (this.enemyPositions[enemyIndex]) {
        this.enemyPositions[enemyIndex].x = newX
      }

      // 更新动画帧（skill_03 到 skill_08，共6帧）
      if (animState && animState.state === 'skill') {
        const frameIndex = Math.floor(progress * 6) + 3  // 3-8
        animState.frame = Math.min(frameIndex, 8)
      }

      // ★ 伤害判定：对沿途敌人造成伤害（只判定一次）
      if (!charge.damageApplied) {
        charge.damageApplied = true
        this._applyChargeDamage(enemy, enemyIndex, charge.skill)
      }

      if (progress >= 1.0) {
        charge.phase = 'done'
      }
    } else if (charge.phase === 'done') {
      // 冲锋结束，恢复状态
      this._chargeAttack = null
      estate.state = 'idle'
      if (animState) {
        animState.state = 'idle'
        animState.frame = 1
        animState.displayFrame = 0
      }
    }
  }

  // ======== 治愈冲击技能更新（在 battle-animation.js 的 update() 中调用）========
  proto._updateHealingImpact = function(dt) {
    if (!this._healingImpact || !this._healingImpact.active) return

    const impact = this._healingImpact
    const enemyIndex = impact.enemyIndex
    const enemy = this.enemies[enemyIndex]
    const estate = this.unitStates['enemy_' + enemyIndex]
    const animState = this.enemyAnimStates[enemyIndex]
    const now = Date.now()

    if (!enemy || !estate) {
      this._healingImpact = null
      return
    }

    // ★ 强制状态保持：防止技能被其他逻辑打断
    // ★ 只在技能进行中（preparing/locking/rushing）强制保持，击飞和完成阶段不强制
    if (impact.phase === 'preparing' || impact.phase === 'locking' || impact.phase === 'rushing') {
      if (estate.state !== 'skill') {
        estate.state = 'skill'
      }
      if (animState && animState.state !== 'skill') {
        animState.state = 'skill'
        animState.attackDamageApplied = false
      }
    }

    // ★ 更新粒子特效
    this._updateHealingImpactParticles(dt)

    if (impact.phase === 'preparing') {
      // ★ 阶段1：准备（2秒，慢速播放skill_01→skill_03，粒子特效）
      const elapsed = now - impact.prepStartTime
      const progress = Math.min(elapsed / impact.prepTime, 1.0)

      // 慢速播放skill_01→skill_03（3帧用2秒）
      if (animState && animState.state === 'skill') {
        const frameIndex = Math.floor(progress * 3) + 1  // 1-3
        animState.frame = Math.min(frameIndex, 3)
      }

      // 更新粒子特效（螺旋上升）
      this._updateHealingImpactParticles(dt)

      if (progress >= 1.0) {
        // 进入锁定阶段
        impact.phase = 'locking'
        impact.lockStartTime = now
        this._addLog(`${enemy.name} 锁定目标！`)
      }

    } else if (impact.phase === 'locking') {
      // ★ 阶段2：锁定（显示红色区域0.5秒）
      const lockElapsed = now - impact.lockStartTime
      const lockDuration = 500  // 锁定显示0.5秒

      // 更新目标位置（红色区域跟随目标）
      const targetHero = this.party.find(h => h.id === impact.targetId)
      const targetState = targetHero ? this.unitStates[targetHero.id] : null
      if (targetState) {
        impact.redZoneX = targetState.x
        impact.redZoneY = targetState.y
      }

      if (lockElapsed >= lockDuration) {
        // 进入冲击阶段
        impact.phase = 'rushing'
        impact.rushStartTime = now
        // 计算冲击持续时间（根据距离和速度）
        const startX = estate.x
        const startY = estate.y
        const dist = Math.sqrt(
          Math.pow(impact.redZoneX - startX, 2) + 
          Math.pow(impact.redZoneY - startY, 2)
        )
        impact.rushDuration = (dist / (impact.rushSpeed || 2000)) * 1000
        this._addLog(`${enemy.name} 冲击！`)
      }

    } else if (impact.phase === 'rushing') {
      // ★ 阶段3：冲击（快速接近）
      const elapsed = now - impact.rushStartTime
      const progress = Math.min(elapsed / impact.rushDuration, 1.0)

      // 快速更新动画帧（skill_04到skill_08）
      if (animState && animState.state === 'skill') {
        const frameIndex = Math.floor(progress * 5) + 4  // 4-8
        animState.frame = Math.min(frameIndex, 8)
      }

      // 更新敌人位置（快速接近目标）
      const startX = impact.startX || estate.x
      const startY = impact.startY || estate.y
      if (!impact.startX) {
        impact.startX = startX
        impact.startY = startY
      }

      estate.x = startX + (impact.redZoneX - startX) * progress
      estate.y = startY + (impact.redZoneY - startY) * progress

      // ★ 伤害判定：在帧7时判定（只判定一次），给玩家"飞过去"的冲击感
      if (!impact.damageApplied && animState && animState.frame >= 7) {
        impact.damageApplied = true
        this._applyHealingImpactDamage(enemy, enemyIndex, impact.skill)
      }

      if (progress >= 1.0) {
        // 进入击飞阶段
        impact.phase = 'knockback'
        impact.knockbackStartTime = now
        this._addLog(`${enemy.name} 命中目标！`)
      }

    } else if (impact.phase === 'knockback') {
      // ★ 阶段4：击飞（敌人已进入CD，只更新目标的击飞效果）
      
      // ★ 立即设置敌人状态为idle（进入CD），让敌人可以开始冷却
      if (estate.state !== 'idle') {
        estate.state = 'idle'
        if (animState) {
          animState.state = 'idle'
          animState.frame = 1
          animState.displayFrame = 0
        }
        this.enemyAttacking = false
        this._attackingEnemy = null
        this._addLog(`${enemy.name} 技能结束，进入冷却`)
      }
      
      // 更新被击飞英雄的状态
      const knockbackElapsed = now - impact.knockbackStartTime
      const progress = Math.min(knockbackElapsed / impact.knockbackDuration, 1.0)

      const targetHero = this.party.find(h => h.id === impact.targetId)
      const targetState = targetHero ? this.unitStates[targetHero.id] : null
      if (targetState) {
        // 击飞空中效果：Y坐标先上升后下降（抛物线）
        const knockbackHeight = 100 * this.dpr
        const yOffset = -knockbackHeight * Math.sin(progress * Math.PI)
        targetState.y = (impact.redZoneY || targetState.y) + yOffset
        targetState.state = 'hurt'  // 受击状态
      }

      if (progress >= 1.0) {
        // 击飞结束，恢复状态
        if (targetState) {
          targetState.state = 'idle'
        }
        impact.phase = 'done'
      }

    } else if (impact.phase === 'done') {
      // 技能结束，恢复状态
      this._healingImpact = null
      estate.state = 'idle'
      if (animState) {
        animState.state = 'idle'
        animState.frame = 1
        animState.displayFrame = 0
      }
      this.enemyAttacking = false
      this._attackingEnemy = null
      if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
        this.phase = 'auto_battle'
      }
    }
  }

  // ======== 治愈冲击粒子特效更新 ========
  proto._updateHealingImpactParticles = function(dt) {
    if (!this._healingImpact) return

    const impact = this._healingImpact
    const estate = this.unitStates['enemy_' + impact.enemyIndex]
    if (!estate) return

    // 更新现有粒子
    impact.particles.forEach(p => {
      p.elapsed += dt
      p.angle += p.spiralSpeed * dt  // 螺旋旋转
      // 粒子位置：螺旋上升
      p.x = estate.x + Math.cos(p.angle) * p.distance
      p.y = estate.y + Math.sin(p.angle) * p.distance - p.elapsed * 50 * this.dpr
      p.alpha = Math.max(0, 0.8 - p.elapsed / p.duration)
    })

    // 移除过期粒子
    impact.particles = impact.particles.filter(p => p.elapsed < p.duration)

    // 补充新粒子
    if (impact.phase === 'preparing' && impact.particles.length < 30) {
      impact.particles.push({
        x: estate.x + (Math.random() - 0.5) * 40 * this.dpr,
        y: estate.y + (Math.random() - 0.5) * 40 * this.dpr,
        vx: 0,
        vy: 0,
        alpha: 0.8 + Math.random() * 0.2,
        color: Math.random() > 0.5 ? '#FFD700' : '#FFF8DC',
        radius: 2 * this.dpr + Math.random() * 3 * this.dpr,
        duration: 2.0,
        elapsed: 0,
        angle: Math.random() * Math.PI * 2,
        spiralSpeed: 2 + Math.random() * 3,
        distance: 20 + Math.random() * 30
      })
    }
  }

  // ======== 治愈冲击伤害判定 ========
  proto._applyHealingImpactDamage = function(enemy, enemyIndex, skill) {
    const power = skill.power || 2.2
    const targetId = this._healingImpact ? this._healingImpact.targetId : null
    if (!targetId) return

    const targetHero = this.party.find(h => h.id === targetId)
    if (!targetHero || targetHero.hp <= 0) return

    const targetState = this.unitStates[targetHero.id]
    if (!targetState) return

    // 检查目标是否在红色区域内
    const redZoneX = this._healingImpact.redZoneX
    const redZoneY = this._healingImpact.redZoneY
    const dist = Math.sqrt(
      Math.pow(targetState.x - redZoneX, 2) + 
      Math.pow(targetState.y - redZoneY, 2)
    )

    if (dist > (this._healingImpact.redZoneRadius || 80 * this.dpr)) {
      this._addLog(`${targetHero.name} 成功躲开了冲击！`)
      return
    }

    // 计算伤害
    const baseDmg = Math.floor(enemy.atk * power)
    const isCrit = Math.random() < (enemy.crit || 0)
    const critMultiplier = isCrit ? 2.0 : 1.0
    const actualDmg = Math.floor(baseDmg * critMultiplier)

    targetHero.hp = Math.max(0, targetHero.hp - actualDmg)

    this._addLog(`${targetHero.name} 被击中，${actualDmg}点伤害！${isCrit ? '（暴击！）' : ''}`)

    // 显示伤害数字
    if (this._showDamageNumber && targetState) {
      this._showDamageNumber(targetState.x, targetState.y, actualDmg, '#ff4444')
    }
  }

  // ======== 治愈冲击技能实现（艾米专用）========
  // 多阶段：准备（2秒，粒子特效）→ 锁定（红色区域）→ 冲击（快速接近，击飞）
  proto._executeHealingImpact = function(enemy, enemyIndex, skill, target) {
    const estate = this.unitStates['enemy_' + enemyIndex]
    if (!estate) return

    const animState = this.enemyAnimStates[enemyIndex]
    const dpr = this.dpr

    // ★ 技能参数
    const prepTime = (skill.prepTime || 2.0) * 1000  // 准备时间（毫秒），默认2秒
    const rushSpeed = skill.rushSpeed || 2000  // 冲击速度（像素/秒），默认2000（非常快）
    const knockbackDuration = (skill.knockbackDuration || 1.0) * 1000  // 击飞持续时间（毫秒），默认1秒

    // 获取最近英雄作为目标
    const { hero: targetHero, state: targetState } = this._findNearestAliveHero(estate)
    if (!targetHero || !targetState) {
      estate.state = 'idle'
      return
    }

    // ★ 设置治愈冲击状态
    this._healingImpact = {
      active: true,
      phase: 'preparing',  // preparing -> locking -> rushing -> done
      enemyIndex: enemyIndex,
      targetId: targetHero.id,
      targetX: targetState.x,
      targetY: targetState.y,
      prepStartTime: Date.now(),
      prepTime: prepTime,
      rushStartTime: null,
      rushDuration: null,  // 将在locking阶段计算
      knockbackStartTime: null,
      knockbackDuration: knockbackDuration,
      skill: skill,
      damageApplied: false,
      // 粒子特效
      particles: [],
      // 红色区域
      redZoneRadius: 80 * dpr,
      redZoneX: targetState.x,
      redZoneY: targetState.y
    }

    // ★ 阶段1：准备（慢速播放skill_01→skill_03，粒子特效）
    if (animState) {
      animState.state = 'skill'
      animState.frame = 1  // 从skill_01开始
      animState.displayFrame = 0
      animState.frameTimer = 0
      animState.attackDamageApplied = false
    }

    estate.state = 'skill'  // 设置状态为技能释放
    this.enemyAttacking = true
    this._attackingEnemy = enemy

    // 初始化粒子特效
    this._initHealingImpactParticles(enemyIndex)

    this._addLog(`${enemy.name} 开始聚集能量...`)
  }

  // ======== 初始化治愈冲击粒子特效 ========
  proto._initHealingImpactParticles = function(enemyIndex) {
    if (!this._healingImpact) return
    const estate = this.unitStates['enemy_' + enemyIndex]
    if (!estate) return

    const dpr = this.dpr
    const particleCount = 30  // 粒子数量

    for (let i = 0; i < particleCount; i++) {
      this._healingImpact.particles.push({
        x: estate.x + (Math.random() - 0.5) * 40 * dpr,
        y: estate.y + (Math.random() - 0.5) * 40 * dpr,
        vx: (Math.random() - 0.5) * 100 * dpr,
        vy: -Math.random() * 150 * dpr - 50 * dpr,  // 向上飞
        alpha: 0.8 + Math.random() * 0.2,
        color: Math.random() > 0.5 ? '#FFD700' : '#FFF8DC',  // 金色/白色
        radius: 2 * dpr + Math.random() * 3 * dpr,
        duration: 2.0,  // 持续2秒
        elapsed: 0,
        // 螺旋效果
        angle: Math.random() * Math.PI * 2,
        spiralSpeed: 2 + Math.random() * 3,
        distance: 20 + Math.random() * 30
      })
    }
  }

  // ======== 跳跃攻击技能实现 ========
  proto._executeJumpAttack = function(enemy, enemyIndex, skill, target) {
    const estate = this.unitStates['enemy_' + enemyIndex]
    if (!estate) return

    // ★ 获取动画状态
    const animState = this.enemyAnimStates[enemyIndex]
    
    // 获取目标位置（最近的英雄）
    const { hero: targetHero, state: targetState } = this._findNearestAliveHero(estate)
    if (!targetHero || !targetState) {
      estate.state = 'idle'
      return
    }

    // ★ 检查目标是否在跳跃范围内
    const distToTarget = this._getDistance(estate, targetState)
    const jumpRange = (skill.range || 300) * this.dpr  // 跳跃距离（像素），默认300
    if (distToTarget > jumpRange) {
      console.log(`[JumpAttack] 目标太远 (${(distToTarget).toFixed(1)} > ${jumpRange})，取消跳跃攻击`)
      estate.state = 'idle'
      return
    }

    // 计算跳跃目标位置（在角色面前）
    const jumpTargetX = targetState.x
    const jumpTargetY = targetState.y

    // ★ 阶段1：显示红色预警区域
    const warnDuration = (skill.warnDuration || 1.5) * 1000  // 转换为毫秒
    const damageRadius = skill.damageRadius || 100
    
    // 设置预警数据
    this._jumpAttackWarning = {
      active: true,
      enemyIndex: enemyIndex,
      targetX: jumpTargetX,
      targetY: jumpTargetY,
      radius: damageRadius,
      startTime: Date.now(),
      duration: warnDuration,
      skill: skill,
      phase: 'warning'  // warning -> jumping -> damaging
    }

    this._addLog(`${enemy.name} 准备跳跃攻击！`)

    // ★ 阶段2：预警结束后开始跳跃
    this._scheduleTimer(() => {
      if (!this._jumpAttackWarning) return

      // ★ 保存起始位置（用于动画插值）
      const startX = estate.x
      const startY = estate.y

      // ★ 设置技能动画状态（触发技能帧播放）
      if (animState && animState.type === 'slime_cat') {
        animState.state = 'skill'
        animState.frame = 50  // 技能帧起始帧
        animState.displayFrame = 0
        animState.frameTimer = 0
        animState.attackDamageApplied = false
      }

      // 更新为跳跃阶段
      this._jumpAttackWarning.phase = 'jumping'
      estate.state = 'skill'  // ★ 使用 'skill' 状态

      // 计算跳跃参数
      const dx = jumpTargetX - startX
      const dy = jumpTargetY - startY
      const distance = Math.sqrt(dx * dx + dy * dy)

      // 跳跃持续时间（毫秒）- 与技能动画同步
      const jumpDuration = 880  // 11帧 × 80ms = 880ms

      this._jumpAttackWarning.jumpStartX = startX
      this._jumpAttackWarning.jumpStartY = startY
      this._jumpAttackWarning.jumpTargetX = jumpTargetX
      this._jumpAttackWarning.jumpTargetY = jumpTargetY
      this._jumpAttackWarning.jumpDistance = distance
      this._jumpAttackWarning.jumpDuration = jumpDuration
      this._jumpAttackWarning.jumpStartTime = Date.now()

      // ★ 阶段3：跳跃动画播放完毕后更新位置并造成伤害
      this._scheduleTimer(() => {
        if (!this._jumpAttackWarning) return

        // ★ 现在才更新逻辑位置和血条位置
        estate.x = jumpTargetX
        estate.y = jumpTargetY
        if (this.enemyPositions[enemyIndex]) {
          this.enemyPositions[enemyIndex].x = jumpTargetX
          this.enemyPositions[enemyIndex].y = jumpTargetY
        }

        // 更新为伤害阶段
        this._jumpAttackWarning.phase = 'damaging'

        // 对200范围内的敌人造成伤害
        this._applyJumpAttackDamage(enemy, enemyIndex, skill, jumpTargetX, jumpTargetY)

        // 清除预警，恢复idle状态
        this._scheduleTimer(() => {
          this._jumpAttackWarning = null
          estate.state = 'idle'

          // ★ 恢复动画状态
          if (animState) {
            animState.state = 'idle'
            animState.frame = 1
            animState.displayFrame = 0
          }

          this._clearAttackerFlag('enemy_' + enemyIndex)
          if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purify') {
            this.phase = 'auto_battle'
          }
        }, 500)
      }, jumpDuration)
    }, warnDuration)
  }

  // ======== 跳跃攻击伤害判定（单体目标） ========
  proto._applyJumpAttackDamage = function(enemy, enemyIndex, skill, centerX, centerY) {
    const power = skill.power || 1.5
    const drainPercent = skill.drainPercent || 1.0  // 生命偷取比例，默认100%
    
    // ★ 单体伤害：只伤害最近的那个英雄
    let nearestHero = null
    let nearestDist = Infinity
    
    this.party.forEach(hero => {
      if (hero.hp <= 0) return
      
      const heroState = this.unitStates[hero.id]
      if (!heroState) return
      
      // 计算距离
      const dx = heroState.x - centerX
      const dy = heroState.y - centerY
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < nearestDist) {
        nearestDist = distance
        nearestHero = hero
      }
    })
    
    // 对最近的英雄造成伤害
    if (nearestHero) {
      const heroState = this.unitStates[nearestHero.id]
      const baseDmg = Math.floor(enemy.atk * power)
      const actualDmg = Math.max(1, baseDmg - Math.floor(nearestHero.def * 0.5))
      
      nearestHero.hp = Math.max(0, nearestHero.hp - actualDmg)
      
      this._addLog(`${nearestHero.name} 受到暗影咬，${actualDmg}点伤害！`)
      
      // 显示伤害数字
      if (this._showDamageNumber && heroState) {
        this._showDamageNumber(heroState.x, heroState.y, actualDmg, '#ff4444')
      }
      
      // ★ 生命偷取：回复造成伤害的 drainPercent%
      if (drainPercent > 0 && actualDmg > 0) {
        const healAmt = Math.max(1, Math.floor(actualDmg * drainPercent))
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + healAmt)
        
        // 显示吸血数字
        if (this.enemyPositions[enemyIndex]) {
          this.damageTexts.push({
            text: `+${healAmt}`,
            x: this.enemyPositions[enemyIndex].x,
            y: this.enemyPositions[enemyIndex].y - 50 * this.dpr,
            color: '#2ed573',
            life: 1.5,
            type: 'drain_heal'
          })
        }
        
        this._addLog(`🩸 ${enemy.name} 吸取了 ${healAmt} 点生命！`)
      }
    }
  }

  // ======== 获取跳跃中敌人的当前位置（用于渲染插值） ========
  proto._getJumpingEnemyPosition = function(enemyIndex) {
    if (!this._jumpAttackWarning || this._jumpAttackWarning.enemyIndex !== enemyIndex) {
      return null
    }
    
    const warning = this._jumpAttackWarning
    if (warning.phase !== 'jumping') return null
    
    const now = Date.now()
    const elapsed = now - warning.jumpStartTime
    const progress = Math.min(1, elapsed / warning.jumpDuration)
    
    // 计算插值位置
    const x = warning.jumpStartX + (warning.jumpTargetX - warning.jumpStartX) * progress
    const y = warning.jumpStartY + (warning.jumpTargetY - warning.jumpStartY) * progress
    
    // 添加跳跃弧度（y坐标向上偏移）
    const jumpHeight = 50 * this.dpr
    const arcY = -Math.sin(progress * Math.PI) * jumpHeight
    
    return { x, y: y + arcY, progress }
  }

  // ★ 兼容旧调用入口
  proto._doEnemyAttack = function(enemy, enemyIndex, skill, target) {
    this._executeEnemyAttackAnim(enemy, enemyIndex, skill, target)
  }

  // ======== 敌人技能AI决策（P3-16: aiPattern差异化） ========
  proto._aiChooseEnemySkill = function(enemy, enemyIndex) {
    // ★ 修复：使用 enemy.id 作为键（与 _updateEnemyAutoAttack 一致）
    const timer = this.enemyAttackTimers[enemy.id]
    if (!timer) return { name: '攻击', power: 1.0, type: 'attack' }

    const basicAttack = { name: '攻击', power: 1.0, type: 'attack' }

    // ★ 调试：输出技能CD状态
    if (enemy.name === '暗影鼠' && (!this._lastShadowRatLog || this.time - this._lastShadowRatLog > 3)) {
      const cdStr = Object.entries(timer.skillCDs).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ')
      console.log(`[Enemy AI] ${enemy.name} 技能CD状态: ${cdStr}`)
      this._lastShadowRatLog = this.time
    }

    // 收集可用技能（非CD中的）
    const availableSkills = [basicAttack]
    if (enemy.skills && Array.isArray(enemy.skills)) {
      enemy.skills.forEach(skill => {
        const skillId = skill.id || skill.name
        const cdRemaining = timer.skillCDs[skillId] || 0
        if (cdRemaining > 0) {
          console.log(`[Enemy AI] ${enemy.name} 技能「${skill.name}」在CD中: ${cdRemaining.toFixed(2)}秒`)
          return  // CD中
        }
        availableSkills.push(skill)
      })
    }

    const specialSkills = availableSkills.filter(s => s !== basicAttack)
    if (specialSkills.length === 0) return basicAttack

    // ★ 获取 aiPattern（从 unitState 或 enemy 数据）
    const estate = this.unitStates['enemy_' + enemyIndex]
    const pattern = (estate && estate.aiPattern) || enemy.aiPattern || 'balanced'
    const hpRatio = enemy.hp / enemy.maxHp

    // ★★★ 新增：距离判断逻辑 ★★★
    // 计算敌人与目标的距离
    let distToTarget = Infinity
    if (estate && estate.currentTargetId) {
      const targetState = this.unitStates[estate.currentTargetId]
      if (targetState) {
        distToTarget = this._getDistance(estate, targetState)
      }
    }
    
    // 判断技能是否需要在近战范围内释放（根据技能类型）
    const isMeleeSkill = (skill) => {
      // 近战技能：普通攻击、冲锋、跳跃攻击
      if (skill.type === 'attack' && !skill.isRanged) return true
      if (skill.type === 'charge' || skill.type === 'jump_attack') return true
      // BUFF给自己的一般是近战
      if (skill.type === 'buff' && skill.target !== 'all_enemies') return true
      return false
    }
    
    const isRangedSkill = (skill) => {
      // 远程技能：魔法、AOE、治疗、召唤、debuff等
      if (skill.type === 'magic') return true
      if (skill.target === 'all' || skill.aoe) return true
      if (skill.type === 'heal' || skill.type === 'heal_self') return true
      if (skill.type === 'summon') return true
      if (skill.type === 'debuff') return true
      if (skill.isRanged) return true
      return false
    }
    
    // ★ 核心逻辑：根据距离选择技能
    const meleeRange = this.MELEE_RANGE * 1.3  // 近战范围
    const canUseMelee = distToTarget <= meleeRange  // 是否在近战范围内
    
    console.log(`[Enemy AI] ${enemy.name} 技能选择: dist=${distToTarget.toFixed(1)}, meleeRange=${meleeRange.toFixed(1)}, canUseMelee=${canUseMelee}`)
    
    // 如果不在近战范围内，优先用远程技能
    if (!canUseMelee && !enemy.isRanged) {
      const rangedSkills = specialSkills.filter(s => isRangedSkill(s))
      if (rangedSkills.length > 0 && Math.random() < 0.7) {  // 70%概率用远程技能
        const chosen = rangedSkills[Math.floor(Math.random() * rangedSkills.length)]
        console.log(`[Enemy AI] ${enemy.name} 距离远，优先用远程技能: ${chosen.name}`)
        return chosen
      }
    }
    
    // 如果在近战范围内，可以用近战技能
    if (canUseMelee) {
      const meleeSkills = specialSkills.filter(s => isMeleeSkill(s))
      if (meleeSkills.length > 0 && Math.random() < 0.6) {  // 60%概率用近战技能
        // 选择伤害最高的近战技能
        meleeSkills.sort((a, b) => (b.power || 1) - (a.power || 1))
        const chosen = meleeSkills[0]
        console.log(`[Enemy AI] ${enemy.name} 近战范围，用近战技能: ${chosen.name}`)
        return chosen
      }
    }

    // ======== P2-13: 敌人感知自身debuff → 优先解控/防御 ========
    const enemyEffects = this.statusEffects.enemies[enemyIndex] || []
    const hasDebuff = enemyEffects.some(e =>
      e.type === 'atk_down' || e.type === 'def_down' || e.type === 'stunned' ||
      e.type === 'burned' || e.type === 'frozen' || e.type === 'poisoned'
    )
    if (hasDebuff) {
      // aggressive: 不在意debuff，继续攻击；其他模式优先解控
      if (pattern !== 'aggressive') {
        const cleanseSkill = specialSkills.find(s => s.type === 'heal_self')
        if (cleanseSkill) {
          console.log(`[Enemy AI] ${enemy.name} 有debuff，使用治疗技能: ${cleanseSkill.name}`)
          return cleanseSkill
        }
        const defBuffSkill = specialSkills.find(s => s.type === 'buff' && s.effect === 'defense_up')
        if (defBuffSkill && Math.random() < 0.6) {
          console.log(`[Enemy AI] ${enemy.name} 有debuff，使用防御buff: ${defBuffSkill.name}`)
          return defBuffSkill
        }
      }
    }

    // ======== 根据 aiPattern 差异化决策 ========
    switch (pattern) {
      case 'aggressive': {
        // ★ 激进：高伤优先，不防御，不治疗
        // 1. AOE：存活英雄>=2时优先AOE
        const aliveHeroes = this.party.filter(h => h.hp > 0)
        if (aliveHeroes.length >= 2) {
          const aoeSkill = specialSkills.find(s => s.target === 'all' || s.aoe)
          if (aoeSkill && Math.random() < 0.5) {
            console.log(`[Enemy AI] ${enemy.name} [aggressive] 使用AOE技能: ${aoeSkill.name}`)
            return aoeSkill
          }
        }
        // 2. 召唤
        const summonSkill = specialSkills.find(s => s.type === 'summon')
        const aliveEnemies = this.enemies.filter(e => e.hp > 0)
        if (summonSkill && aliveEnemies.length < 4 && Math.random() < 0.4) {
          console.log(`[Enemy AI] ${enemy.name} [aggressive] 使用召唤技能: ${summonSkill.name}`)
          return summonSkill
        }
        // 3. 最高伤害技能
        const damageSkills = specialSkills.filter(s => s.type !== 'heal_self' && s.type !== 'buff')
        if (damageSkills.length > 0) {
          damageSkills.sort((a, b) => (b.power || 1) - (a.power || 1))
          if (Math.random() < 0.75) {  // 75%用高伤（比balanced更激进）
            const chosen = damageSkills[0]
            console.log(`[Enemy AI] ${enemy.name} [aggressive] 使用高伤技能: ${chosen.name}`)
            return chosen
          }
        }
        // 4. 兜底：40%用技能（比balanced更爱用技能）
        if (Math.random() < 0.4 && specialSkills.length > 0) {
          const chosen = specialSkills[Math.floor(Math.random() * specialSkills.length)]
          console.log(`[Enemy AI] ${enemy.name} [aggressive] 随机使用技能: ${chosen.name}`)
          return chosen
        }
        return basicAttack
      }

      case 'defensive': {
        // ★ 防御：优先buff/防御，低HP必治疗，较少使用高伤
        // 0. ★ 优先使用跳跃攻击（特殊机制技能）
        const jumpAttackSkill = specialSkills.find(s => s.type === 'jump_attack')
        if (jumpAttackSkill && Math.random() < 0.6) {  // ★ 60%概率优先用跳跃攻击
          console.log(`[Enemy AI] ${enemy.name} [defensive] 使用跳跃攻击: ${jumpAttackSkill.name}`)
          return jumpAttackSkill
        }
        
        // 1. 紧急自保：HP < 50% 就治疗（比其他模式更早触发）
        if (hpRatio < 0.5) {
          const emergencySkill = specialSkills.find(s =>
            s.type === 'heal_self' || (s.type === 'buff' && s.effect === 'defense_up')
          )
          if (emergencySkill) {
            console.log(`[Enemy AI] ${enemy.name} [defensive] 紧急自保: ${emergencySkill.name}`)
            return emergencySkill
          }
        }
        // 2. buff：有就用
        const buffSkill = specialSkills.find(s => s.type === 'buff')
        if (buffSkill) {
          const heroIdx = this.enemies.indexOf(enemy)
          const heroEffects2 = heroIdx >= 0 ? (this.statusEffects.enemies[heroIdx] || []) : []
          const hasBuff = heroEffects2.some(e => e.type === 'def_up' || e.type === 'atk_up')
          console.log(`[Enemy AI] ${enemy.name} 检查buff技能: ${buffSkill.name}, hasBuff=${hasBuff}, cd=${timer.skillCDs[buffSkill.id || buffSkill.name]}`)
          if (!hasBuff && Math.random() < 0.65) {
            console.log(`[Enemy AI] ${enemy.name} [defensive] 使用buff技能: ${buffSkill.name}`)
            return buffSkill
          }
        }
        // 3. 控制：比其他模式更爱用CC
        const ccSkill = specialSkills.find(s =>
          s.effect === 'stun' || s.effect === 'slime_wrap' || s.effect === 'slime_spray'
        )
        if (ccSkill && Math.random() < 0.45) {
          console.log(`[Enemy AI] ${enemy.name} [defensive] 使用控制技能: ${ccSkill.name}`)
          return ccSkill
        }
        // 4. AOE（概率较低）
        const aliveHeroes2 = this.party.filter(h => h.hp > 0)
        if (aliveHeroes2.length >= 2) {
          const aoeSkill = specialSkills.find(s => s.target === 'all' || s.aoe)
          if (aoeSkill && Math.random() < 0.3) {
            console.log(`[Enemy AI] ${enemy.name} [defensive] 使用AOE技能: ${aoeSkill.name}`)
            return aoeSkill
          }
        }
        // 5. 伤害技能（概率较低）
        const dmgSkills = specialSkills.filter(s => s.type !== 'heal_self' && s.type !== 'buff')
        if (dmgSkills.length > 0 && Math.random() < 0.35) {
          const chosen = dmgSkills[Math.floor(Math.random() * dmgSkills.length)]
          console.log(`[Enemy AI] ${enemy.name} [defensive] 使用伤害技能: ${chosen.name}`)
          return chosen
        }
        return basicAttack
      }

      case 'support': {
        // ★ 辅助：优先AOE控制/召唤，低HP治疗
        // 1. 紧急自保
        if (hpRatio < 0.3) {
          const emergencySkill = specialSkills.find(s =>
            s.type === 'heal_self' || (s.type === 'buff' && s.effect === 'defense_up')
          )
          if (emergencySkill) {
            console.log(`[Enemy AI] ${enemy.name} [support] 紧急自保: ${emergencySkill.name}`)
            return emergencySkill
          }
        }
        // 2. 召唤（最高优先）
        const summonSkill2 = specialSkills.find(s => s.type === 'summon')
        const aliveEnemies2 = this.enemies.filter(e => e.hp > 0)
        if (summonSkill2 && aliveEnemies2.length < 4 && Math.random() < 0.6) {
          console.log(`[Enemy AI] ${enemy.name} [support] 使用召唤技能: ${summonSkill2.name}`)
          return summonSkill2
        }
        // 3. AOE控制
        const aliveHeroes3 = this.party.filter(h => h.hp > 0)
        if (aliveHeroes3.length >= 2) {
          const aoeSkill = specialSkills.find(s => s.target === 'all' || s.aoe)
          if (aoeSkill && Math.random() < 0.5) {
            console.log(`[Enemy AI] ${enemy.name} [support] 使用AOE技能: ${aoeSkill.name}`)
            return aoeSkill
          }
        }
        // 4. 控制技能
        const ccSkill2 = specialSkills.find(s =>
          s.effect === 'stun' || s.effect === 'slime_wrap' || s.effect === 'slime_spray'
        )
        if (ccSkill2 && Math.random() < 0.5) {
          console.log(`[Enemy AI] ${enemy.name} [support] 使用控制技能: ${ccSkill2.name}`)
          return ccSkill2
        }
        // 5. buff
        const buffSkill2 = specialSkills.find(s => s.type === 'buff')
        if (buffSkill2 && Math.random() < 0.5) {
          console.log(`[Enemy AI] ${enemy.name} [support] 使用buff技能: ${buffSkill2.name}`)
          return buffSkill2
        }
        // 6. 伤害
        const dmgSkills2 = specialSkills.filter(s => s.type !== 'heal_self' && s.type !== 'buff' && s.type !== 'summon')
        if (dmgSkills2.length > 0 && Math.random() < 0.4) {
          const chosen = dmgSkills2[Math.floor(Math.random() * dmgSkills2.length)]
          console.log(`[Enemy AI] ${enemy.name} [support] 使用伤害技能: ${chosen.name}`)
          return chosen
        }
        return basicAttack
      }

      default: {
        // ★ balanced: 原有默认逻辑（与P2版本一致）
        // 1. 紧急自保
        if (hpRatio < 0.3) {
          const emergencySkill = specialSkills.find(s =>
            s.type === 'heal_self' || (s.type === 'buff' && s.effect === 'defense_up')
          )
          if (emergencySkill) {
            console.log(`[Enemy AI] ${enemy.name} [balanced] 紧急自保: ${emergencySkill.name}`)
            return emergencySkill
          }
        }
        if (hpRatio < 0.6) {
          const supportSkill = specialSkills.find(s =>
            s.type === 'heal_self' || (s.type === 'buff' && s.effect === 'defense_up')
          )
          if (supportSkill && Math.random() < 0.5) {
            console.log(`[Enemy AI] ${enemy.name} [balanced] 使用辅助技能: ${supportSkill.name}`)
            return supportSkill
          }
        }
        // 2. AOE
        const aliveHeroes4 = this.party.filter(h => h.hp > 0)
        if (aliveHeroes4.length >= 2) {
          const aoeSkill = specialSkills.find(s => s.target === 'all' || s.aoe)
          if (aoeSkill && Math.random() < 0.4) {
            console.log(`[Enemy AI] ${enemy.name} [balanced] 使用AOE技能: ${aoeSkill.name}`)
            return aoeSkill
          }
        }
        // 3. 控制
        const ccSkill3 = specialSkills.find(s =>
          s.effect === 'stun' || s.effect === 'slime_wrap' || s.effect === 'slime_spray'
        )
        if (ccSkill3 && Math.random() < 0.35) {
          console.log(`[Enemy AI] ${enemy.name} [balanced] 使用控制技能: ${ccSkill3.name}`)
          return ccSkill3
        }
        // 4. 召唤
        const summonSkill3 = specialSkills.find(s => s.type === 'summon')
        const aliveEnemies3 = this.enemies.filter(e => e.hp > 0)
        if (summonSkill3 && aliveEnemies3.length < 4 && Math.random() < 0.5) {
          console.log(`[Enemy AI] ${enemy.name} [balanced] 使用召唤技能: ${summonSkill3.name}`)
          return summonSkill3
        }
        // 5. 高伤害
        const heavySkill = specialSkills.filter(s => (s.power || 1) > 1.5 && s.type !== 'heal_self' && s.type !== 'buff')
        if (heavySkill.length > 0 && Math.random() < 0.6) {
          const chosen = heavySkill[Math.floor(Math.random() * heavySkill.length)]
          console.log(`[Enemy AI] ${enemy.name} [balanced] 使用高伤技能: ${chosen.name}`)
          return chosen
        }
        // 6. 兜底
        if (Math.random() < 0.3 && specialSkills.length > 0) {
          const chosen = specialSkills[Math.floor(Math.random() * specialSkills.length)]
          console.log(`[Enemy AI] ${enemy.name} [balanced] 随机使用技能: ${chosen.name}`)
          return chosen
        }
        return basicAttack
      }
    }
  }

  proto._executeEnemyAutoAttack = function(enemy, enemyIndex, skill, target) {
    this._clearAttackerFlag('enemy_' + enemyIndex)
    
    this._scheduleTimer(() => {
      if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'purification') {
        this.phase = 'auto_battle'
      }
    }, 300)
  }

  proto._clearAttackerFlag = function(unitId) {
    this.activeAttackers.delete(unitId)
    const isEnemy = String(unitId).startsWith('enemy_')
    if (isEnemy) {
      // ★ 修复：从 unitId 查找敌人对象，使用 enemy.id 作为键
      const idx = parseInt(String(unitId).replace('enemy_', ''))
      const enemy = this.enemies[idx]
      if (enemy) {
        const timer = this.enemyAttackTimers[enemy.id]
        if (timer) {
          console.log(`[_clearAttackerFlag] 清除 ${enemy.name}(${enemy.id}) 的 isAttacking 标志`)
          timer.isAttacking = false
        }
      }
    }
  }

  // ======== MP回复 & Buff计时 ========
  proto._updateMpRegen = function(dt) {
    if (this.isPaused) return
    for (const hero of this.party) {
      if (hero.hp <= 0) continue
      const regenRate = hero.mpRegen || 2
      hero.mp = Math.min(hero.maxMp, hero.mp + regenRate * dt * 0.5)
    }
  }

  proto._updateBuffTimers = function(dt) {
    if (this.isPaused) return
    const allEffects = [this.statusEffects.heroes, this.statusEffects.enemies]
    allEffects.forEach(effectMap => {
      if (!effectMap) return
      Object.keys(effectMap).forEach(key => {
        const effects = effectMap[key]
        if (!Array.isArray(effects)) return
        effectMap[key] = effects.filter(e => {
          if (e.duration !== undefined) {
            e.duration -= dt
            return e.duration > 0
          }
          if (e.turnsRemaining !== undefined) {
            // turnsRemaining 由回合逻辑驱动，这里不减
            return e.turnsRemaining > 0
          }
          return true
        })
      })
    })
  }

  // ======== 初始化辅助 ========
  proto._initHeroAreas = function() {
    this.heroAreas = []
    const dpr = this.dpr
    const cardW = 90 * dpr
    const cardH = 130 * dpr
    const margin = 15 * dpr
    const startY = this.height - cardH - 45 * dpr
    const availableWidth = this.width - margin * 2
    const totalCards = Math.min(this.party.length, this.heroPerPage)
    const gap = (availableWidth - totalCards * cardW) / Math.max(1, totalCards - 1)

    for (let i = 0; i < this.party.length; i++) {
      const page = Math.floor(i / this.heroPerPage)
      if (page !== this.heroPage) continue
      const slotInPage = i % this.heroPerPage
      const x = margin + slotInPage * (cardW + (gap > 0 ? gap : 10 * dpr))
      this.heroAreas.push({
        x,
        y: startY,
        w: cardW,
        h: cardH,
        hero: this.party[i],
      })
    }
  }

  proto._initAllHeroPositions = function() {
    this.heroBasePositions = []
    const dpr = this.dpr
    const startX = 30 * dpr
    const endX = this.width * 0.42
    const cardY = this.height - 95 * dpr
    const step = this.party.length > 1 ? (endX - startX) / (this.party.length - 1) : 0

    for (let i = 0; i < this.party.length; i++) {
      const x = this.party.length === 1 ? (startX + endX) / 2 : startX + i * step
      this.heroBasePositions.push({ x, y: cardY })
    }
  }

  proto._initEnemyPositions = function() {
    this.enemyPositions = []
    const dpr = this.dpr

    if (this.enemies.length === 1) {
      this.enemyPositions.push({
        x: this.enemyBaseX,
        y: this.enemyBaseY,
      })
    } else {
      const centerX = this.width * 0.72
      const baseY = this.enemyBaseY
      const spacing = Math.min(100 * dpr, (this.width * 0.5) / this.enemies.length)
      const startIdx = Math.floor(this.enemies.length / 2)

      for (let i = 0; i < this.enemies.length; i++) {
        const offsetX = (i - startIdx) * spacing
        this.enemyPositions.push({
          x: centerX + offsetX,
          y: baseY + (i % 2 === 0 ? 0 : 18 * dpr),
        })
      }
    }
  }

  proto._prevHeroPage = function() {
    if (this.heroPage > 0) {
      this.heroPage--
      this._initHeroAreas()
    }
  }

  proto._nextHeroPage = function() {
    if (this.heroPage < this.totalHeroPages - 1) {
      this.heroPage++
      this._initHeroAreas()
    }
  }

  proto._addLog = function(text) {
    this.log.push(text)
    if (this.log.length > 50) this.log.shift()
  }

  proto._showHeroSelection = function() {
    this.phase = 'select_hero'
    this.selectedHero = null
    this.selectedSkill = null
    this.actedHeroes = new Set()
  }
}
