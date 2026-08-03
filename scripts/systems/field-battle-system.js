/**
 * field-battle-system.js - 野外战斗系统
 * 负责：伤害计算、攻击判定、血条渲染、伤害数字
 */
export function installFieldBattleSystem(FieldSceneClass) {
  // 防止重复安装
  if (FieldSceneClass._battleSystemInstalled) {
    console.log('[FieldBattle] 战斗系统已安装，跳过')
    return
  }

  const proto = FieldSceneClass.prototype

  // ==========================================================================
  // 1. 战斗系统初始化
  // ==========================================================================
  proto._initFieldBattleSystem = function() {
    this.battleSystem = {
      active: false,          // 是否处于战斗状态
      attackButton: null,     // 攻击按钮
      skillButtons: [],       // 技能按钮
      playerAttackCD: 0,      // 玩家攻击冷却
      playerAttackInterval: 800, // 玩家攻击间隔（毫秒）
      damageTexts: [],        // 伤害数字数组
      battleTarget: null,      // 当前战斗目标
      attackRange: 80,        // 玩家攻击范围（像素）
      showBattleUI: false      // 是否显示战斗UI
    }
    console.log('[FieldBattle] 战斗系统初始化完成')
  }

  // ==========================================================================
  // 2. 开始/结束战斗
  // ==========================================================================
  proto._startFieldBattle = function(monster) {
    if (this.isEnteringBattle) return
    this.isEnteringBattle = true

    console.log(`[FieldBattle] 开始地图战斗 - 怪物: ${monster.name}`)

    // 设置战斗目标
    this.battleSystem.battleTarget = monster
    this.battleSystem.active = true
    this.battleSystem.showBattleUI = true

    // 初始化战斗UI
    this._initBattleUI()

    // 重置进入战斗标志
    setTimeout(() => {
      this.isEnteringBattle = false
    }, 1000)
  }

  proto._endFieldBattle = function(victory) {
    console.log(`[FieldBattle] 战斗结束，胜利: ${victory}`)

    if (victory) {
      // 战斗胜利，标记怪物死亡
      if (this.battleSystem.battleTarget) {
        this.battleSystem.battleTarget.alive = false
      }
      // 显示胜利消息
      if (this.game.showToast) {
        this.game.showToast('战斗胜利！')
      }
    } else {
      // 战斗失败，玩家死亡
      // 重置玩家HP
      this.party.forEach(hero => {
        hero.hp = hero.maxHp
      })
      if (this.game.showToast) {
        this.game.showToast('战斗失败，已恢复HP')
      }
    }

    // 重置战斗系统
    this.battleSystem.active = false
    this.battleSystem.battleTarget = null
    this.battleSystem.showBattleUI = false
    this.battleSystem.attackButton = null
    this.battleSystem.skillButtons = []
    this.battleSystem.damageTexts = []

    // 保存怪物状态
    this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
  }

  // ==========================================================================
  // 3. 战斗UI初始化
  // ==========================================================================
  proto._initBattleUI = function() {
    const btnSize = 42 * this.dpr       // 按钮尺寸（再缩小一点）
    const gap = 8 * this.dpr            // 紧凑间距
    const margin = 14 * this.dpr         // 紧凑边距
    const cell = btnSize + gap

    // 攻击按钮：屏幕右下偏内（确保上下左右四个方向技能都有空间显示）
    // 从右下角往左上各退一格，让 4 个方向的技能都完整可见
    const attackX = this.width - btnSize * 2 - margin - gap
    const attackY = this.height - btnSize * 2 - margin - gap
    this.battleSystem.attackButton = {
      x: attackX,
      y: attackY,
      width: btnSize,
      height: btnSize,
      text: 'ATK',
      cooldown: 0,
      active: true
    }

    // 技能按钮：十字布局（ATK 居中，技能按 上/右/下/左 顺时针填充）
    this.battleSystem.skillButtons = []
    const skills = this.party[0]?.skills || []
    const n = skills.length
    if (n > 0) {
      const dirs = [
        { dx: 0,     dy: -cell, pos: 'top'    }, // 上
        { dx: cell,  dy: 0,     pos: 'right'  }, // 右
        { dx: 0,     dy: cell,  pos: 'bottom' }, // 下
        { dx: -cell, dy: 0,     pos: 'left'   }, // 左
      ]
      skills.forEach((skill, index) => {
        const dir = dirs[index % dirs.length]
        let bx = attackX + dir.dx
        let by = attackY + dir.dy
        // 钳制
        bx = Math.max(margin, Math.min(this.width - btnSize - margin, bx))
        by = Math.max(margin, Math.min(this.height - btnSize - margin, by))
        this.battleSystem.skillButtons.push({
          x: bx,
          y: by,
          width: btnSize,
          height: btnSize,
          text: skill.name,
          skill: skill,
          cooldown: 0,
          active: true,
          index: index
        })
      })
    }

    console.log(`[FieldBattle] 战斗UI初始化完成（王者荣耀式固定布局），技能数量: ${skills.length}`)
  }

  // ==========================================================================
  // 4. 更新战斗系统
  // ==========================================================================
  proto._updateBattleSystem = function(dt) {
    if (!this.battleSystem.active) return

    // 1. 更新玩家攻击冷却
    if (this.battleSystem.playerAttackCD > 0) {
      this.battleSystem.playerAttackCD -= dt * 1000
    }

    // 1.1 更新玩家攻击/技能动画计时
    if (this.battleSystem.playerAnim) {
      this.battleSystem.playerAnim.timer -= dt
      if (this.battleSystem.playerAnim.timer <= 0) {
        this.battleSystem.playerAnim = null
      }
    }

    // 1.2 更新技能按钮冷却（★ 修复：之前这里漏了递减，导致按钮永久灰色）
    if (this.battleSystem.skillButtons && this.battleSystem.skillButtons.length > 0) {
      for (const sb of this.battleSystem.skillButtons) {
        if (sb.cooldown > 0) {
          sb.cooldown = Math.max(0, sb.cooldown - dt * 1000)
        }
      }
    }

    // 2. 更新伤害数字
    this._updateFieldDamageTexts(dt)

    // 3. 检查战斗目标是否还存活
    if (this.battleSystem.battleTarget && !this.battleSystem.battleTarget.alive) {
      console.log(`[FieldBattle] 战斗目标 ${this.battleSystem.battleTarget.name} 已被击败`)
      this._endFieldBattle(true)
      return
    }

    // 4. 检查玩家是否死亡
    const mainHero = this.party[0]
    if (mainHero && mainHero.hp <= 0) {
      console.log(`[FieldBattle] 玩家 ${mainHero.name} 已死亡`)
      this._endFieldBattle(false)
      return
    }

    // 5. 更新怪物攻击
    this._updateMonsterAttack(dt)
  }

  // ==========================================================================
  // 5. 玩家攻击怪物
  // ==========================================================================
  proto._playerAttackMonster = function(monster, skill) {
    if (!monster || !monster.alive) return
    if (this.battleSystem.playerAttackCD > 0 && !skill) return

    const mainHero = this.party[0]
    if (!mainHero) return

    // ★ 触发主角攻击/技能动画（通过 CharacterSprite 的 state 切换）
    // 普攻 → attack（ATTACK帧）；盾击 → shield（SHIELD帧）；攻击型技能 → skill（ATTACK帧）；增益 → buff（BUFF帧）
    let animState = 'attack'
    if (skill) {
      if (skill.id === 'shield_bash') {
        animState = 'shield'
      } else if (skill.type === 'buff' || skill.type === 'heal') {
        animState = 'buff'
      } else {
        animState = 'skill'
      }
    }
    if (this.mainCharacterSprite) {
      this.mainCharacterSprite.state = animState
      this.mainCharacterSprite.animFrame = 0  // 从第 0 帧开始播放
      this.mainCharacterSprite.animTimer = 0
      // 朝向目标
      this.mainCharacterSprite.facingLeft = (monster.x < mainHero.x)
      // 动画完成后自动恢复 idle
      const sprite = this.mainCharacterSprite
      const prevCallback = sprite.onAnimationComplete
      sprite.onAnimationComplete = function(state) {
        sprite.state = 'idle'
        sprite.animFrame = 0
        sprite.onAnimationComplete = prevCallback
      }
    }
    // 保留 playerAnim 用于 _renderPlayer 的朝向覆盖（如果 _renderPlayer 被调用）
    this.battleSystem.playerAnim = {
      type: animState,
      timer: skill ? 1.0 : 0.6,
      maxTimer: skill ? 1.0 : 0.6,
      facing: Math.atan2(monster.y - mainHero.y, monster.x - mainHero.x)
    }

    // 计算伤害
    let damage = 0
    if (skill) {
      // 使用技能
      damage = Math.max(1, mainHero.atk * (skill.power || 1.0) - Math.floor(monster.def * 0.5))
      // 扣除MP
      mainHero.mp = Math.max(0, mainHero.mp - (skill.mpCost || 0))
    } else {
      // 普通攻击
      damage = Math.max(1, mainHero.atk - Math.floor(monster.def * 0.5))
      // 设置攻击冷却
      this.battleSystem.playerAttackCD = this.battleSystem.playerAttackInterval
    }

    // 暴击判定
    const isCrit = Math.random() < (mainHero.crit || 0.05)
    if (isCrit) {
      damage = Math.floor(damage * 1.5)
    }

    // 应用伤害
    monster.hp = Math.max(0, monster.hp - damage)

    // 添加伤害数字
    const screenX = monster.x - this.cameraX
    const screenY = monster.y - this.cameraY
    this.battleSystem.damageTexts.push({
      text: `-${damage}${isCrit ? '!' : ''}`,
      x: screenX,
      y: screenY - 40 * this.dpr,
      color: isCrit ? '#FFD700' : '#ff4757',
      life: 1.0,
      maxLife: 1.0,
      _startY: screenY - 40 * this.dpr,
      isCrit: isCrit
    })

    console.log(`[FieldBattle] ${mainHero.name} 攻击 ${monster.name}，造成 ${damage} 点伤害${isCrit ? '（暴击！）' : ''}，剩余HP: ${monster.hp}`)

    // 检查怪物是否死亡
    if (monster.hp <= 0) {
      monster.alive = false
      console.log(`[FieldBattle] ${monster.name} 被击败！`)
      this.battleSystem.battleTarget = null
    }

    // ★ 技能释放后设置按钮冷却（避免无限释放且让冷却遮罩生效）
    // 注意：skill.cooldown 单位是"秒"，需转换为毫秒
    if (skill && this.battleSystem.skillButtons) {
      const sb = this.battleSystem.skillButtons.find(b => b.skill === skill)
      if (sb) {
        const cdSec = skill.cooldown || 3
        sb.cooldown = cdSec * 1000   // 秒 → 毫秒
        sb.cooldownMax = sb.cooldownMax || sb.cooldown  // 记录最大值用于渲染比例
      }
    }
  }

  // ==========================================================================
  // 6. 怪物攻击玩家
  // ==========================================================================
  proto._updateMonsterAttack = function(dt) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return

    // 更新怪物抛射物（飞行/命中结算）
    this._fieldUpdateProjectiles(dt)
    this._fieldUpdateWarningZones(dt)

    const mainHero = this.party[0]
    if (!mainHero) return

    // 1. 先递减所有怪物技能的冷却（单位：秒）
    for (const monster of this.mapMonsters) {
      if (!monster.alive || !monster.skillCDs) continue
      for (const k in monster.skillCDs) {
        if (monster.skillCDs[k] > 0) {
          monster.skillCDs[k] = Math.max(0, monster.skillCDs[k] - dt)
        }
      }
    }

    const aggroRange = 320 * this.dpr
    const leashRange = 620 * this.dpr

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      const dx = this.playerX - monster.x
      const dy = this.playerY - monster.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const attackRange = (monster.attackRange || 80) * this.dpr

      // 2. 参战/脱战判定
      if (this.battleSystem.active) {
        if (dist <= aggroRange) {
          monster.inCombat = true
        } else if (dist > leashRange) {
          monster.inCombat = false
          monster.isAttacking = false
          monster.isCastingSkill = false
          continue
        }
      }
      if (!monster.inCombat) continue

      // 3. 施法中：站定结算，不普攻不走位
      if (monster.isCastingSkill) {
        monster.skillAnimTimer -= dt * 1000
        if (monster.skillAnimTimer <= 0) {
          monster.isCastingSkill = false
          monster.skillCastId = null
          monster._jumpWarn = false
        }
        // 跳跃攻击已锁定落点（预警圈），不再黏住玩家，避免落点错位
        if (!monster._jumpWarn && dist > attackRange * 0.6) {
          const nx = dx / (dist || 1), ny = dy / (dist || 1)
          const sp = (monster.moveSpeed || 30) * 0.5 * dt
          monster.x += nx * sp
          monster.y += ny * sp
        }
        continue
      }

      // 4. 战斗走位（贴近攻击距离，避免原地站桩/被甩开脱战）
      this._fieldMonsterCombatMove(monster, dx, dy, dist, attackRange, dt)

      // 5. 进入可攻击距离：技能优先，其次普攻
      const maxSR = this._fieldMaxSkillRange(monster)
      if (dist <= Math.max(attackRange, maxSR)) {
        const chosen = this._fieldChooseMonsterSkill(monster, dist, attackRange)
        if (chosen) {
          this._fieldCastMonsterSkill(monster, chosen, mainHero, dx, dy, dist)
          monster.skillUseCount = 0
          continue
        }

        // 普攻（冷却结束才放）
        if (!monster.attackCDTimer) monster.attackCDTimer = 0
        monster.attackCDTimer -= dt * 1000
        if (monster.attackCDTimer <= 0 && !monster.isAttacking) {
          this._monsterAttackPlayer(monster, mainHero)
          monster.attackCDTimer = monster.attackInterval || 2000
          monster.skillUseCount = (monster.skillUseCount || 0) + 1
        }
      }
    }
  }

  /**
   * ★ 野外怪物战斗走位：贴近攻击距离并带横向绕圈，避免站桩/被甩脱
   */
  proto._fieldMonsterCombatMove = function(monster, dx, dy, dist, attackRange, dt) {
    if (dist < 1) return
    const nx = dx / dist, ny = dy / dist
    const px = -ny, py = nx // 垂直方向（横向）
    const spd = monster.moveSpeed || 30
    let vx = 0, vy = 0
    const keep = attackRange * 0.75
    // 注：巡逻基准速度为 spd*1，战斗追击略快于巡逻即可，避免速度突增数倍
    if (dist > attackRange) {
      vx += nx * spd * 2.2
      vy += ny * spd * 2.2
      vx += px * monster.strafeDir * spd * 1.0
      vy += py * monster.strafeDir * spd * 1.0
    } else if (dist < keep) {
      vx -= nx * spd * 1.8
      vy -= ny * spd * 1.8
      vx += px * monster.strafeDir * spd * 1.6
      vy += py * monster.strafeDir * spd * 1.6
    } else {
      vx += px * monster.strafeDir * spd * 1.4
      vy += py * monster.strafeDir * spd * 1.4
      vx += nx * spd * 1.2
      vy += ny * spd * 1.2
    }
    monster.x += vx * dt
    monster.y += vy * dt
    // 标记移动状态，使渲染播放 walk 动画
    monster.isMoving = (Math.abs(vx) + Math.abs(vy)) > 0.01
    monster.strafeTimer = (monster.strafeTimer || 0) + dt
    if (monster.strafeTimer > 1.2) {
      monster.strafeTimer = 0
      monster.strafeDir = Math.random() > 0.5 ? 1 : -1
    }
  }

  /**
   * ★ 计算怪物所有就绪技能的最大释放距离
   */
  proto._fieldMaxSkillRange = function(monster) {
    if (!monster.skills || !monster.skillCDs) return 0
    let maxSR = 0
    for (const s of monster.skills) {
      if ((monster.skillCDs[s.id] || 0) <= 0) {
        const r = (s.range || monster.attackRange || 120) * this.dpr
        if (r > maxSR) maxSR = r
      }
    }
    return maxSR
  }

  /**
   * ★ 智能选技能：按距离/血量/技能类型加权，兼容 enemies.js 的多种 type
   */
  proto._fieldChooseMonsterSkill = function(monster, dist, attackRange) {
    if (!monster.skills || !monster.skills.length || !monster.skillCDs) return null
    const ready = monster.skills.filter(s => (monster.skillCDs[s.id] || 0) <= 0)
    if (ready.length === 0) return null

    const hpRatio = (monster.hp / monster.maxHp)
    let best = -1, chosen = null
    for (const s of ready) {
      let score = 0.6 + Math.random() * 0.4
      const sRange = (s.range || monster.attackRange || 120) * this.dpr
      if (s.type === 'attack' || s.type === 'magic' || s.type === 'charge') {
        if (dist <= sRange) score += 1.8
        else score -= 1.2
      }
      if (s.type === 'jump_attack' && dist > attackRange * 0.4) {
        score += (hpRatio < 0.4 ? 2.2 : 1.2)
      }
      if (s.type === 'debuff' && dist < attackRange) score += 1.4
      if (s.type === 'buff' || s.type === 'heal_self' || s.type === 'summon') score += 1.1
      if (score > best) { best = score; chosen = s }
    }
    // 评分达标即放；或普攻累计 3 次后强制穿插技能（兜底，保证技能必出现）
    const forceSkill = (monster.skillUseCount || 0) >= 3
    if (chosen && (best > 1.0 || forceSkill)) return chosen
    return null
  }

  /**
   * ★ 怪物施放技能（兼容多种 type，直接结算伤害/效果）
   */
  proto._fieldCastMonsterSkill = function(monster, skill, hero, dx, dy, dist) {
    if (!hero || hero.hp <= 0) return

    console.log(`[FieldBattle] ${monster.name} 施放技能: ${skill.name} (${skill.id})`)

    // 进入施法状态（供渲染播放 skill 动画）
    monster.isCastingSkill = true
    monster.skillCastId = skill.id
    monster.skillAnimTimer = 800 // 默认 800ms 技能动画
    monster.animFrame = 0
    // 设置技能冷却（秒）
    if (monster.skillCDs) monster.skillCDs[skill.id] = skill.cooldown || 10

    // ★ jump_attack（跳跃攻击）特殊处理：先落下预警区域，延迟 1 秒后再结算，给玩家躲避时间
    if (skill.type === 'jump_attack') {
      const warnMs = skill.warnDuration || 1000 // 预警时长（毫秒）
      const r = (skill.aoeRadius || skill.dashDistance || 110) * this.dpr
      const tx = this.playerX
      const ty = this.playerY
      // 跳跃落点 = 玩家当前位置（预警圈中心）；但预警阶段怪物原地不动，等预警结束才跳过去
      // （tx/ty 仅作为警示圈中心保存，怪物此刻不移动）
      if (!this.battleSystem.warningZones) this.battleSystem.warningZones = []
      this.battleSystem.warningZones.push({
        x: tx, y: ty, r,
        timer: warnMs / 1000, total: warnMs / 1000,
        power: skill.power || 1,
        atk: monster.atk, def: monster.def,
        monsterName: monster.name,
        skillName: skill.name,
        monsterRef: monster, // 预警结束时跳跃落地的怪物引用
        ownerId: monster.enemyId
      })
      // 施法状态与预警时长对齐
      monster.skillAnimTimer = warnMs
      monster._jumpWarn = true
      console.log(`[FieldBattle] ${monster.name} 跳跃攻击预警：${skill.name}，1秒后落在 (${Math.round(tx)},${Math.round(ty)})`)
      return
    }

    const doMelee = (mult) => {
      const dmg = Math.max(1, Math.floor(monster.atk * (mult || skill.power || 1) - hero.def * 0.3))
      hero.hp = Math.max(0, hero.hp - dmg)
      this.battleSystem.damageTexts.push({
        text: `-${dmg}`,
        x: this.playerX - this.cameraX,
        y: this.playerY - this.cameraY - 60 * this.dpr,
        color: '#ff4757',
        life: 1.0, maxLife: 1.0,
        _startY: this.playerY - this.cameraY - 60 * this.dpr
      })
    }

    if ((skill.type === 'attack' || skill.type === 'magic') && skill.projectile) {
      // 远程抛射物
      this._fieldSpawnMonsterProjectile(monster, skill, dx, dy, dist)
    } else if (skill.type === 'debuff') {
      this._applyMonsterDebuff(monster, skill)
      if (skill.power > 0) doMelee(skill.power)
    } else if (skill.type === 'charge') {
      const dash = Math.min(skill.dashDistance || 120, dist) * this.dpr
      if (dist > 1) {
        monster.x += (dx / dist) * dash
        monster.y += (dy / dist) * dash
      }
      doMelee(skill.power)
    } else if (skill.type === 'heal_self') {
      const heal = skill.healAmount || Math.floor(monster.maxHp * 0.15)
      monster.hp = Math.min(monster.maxHp, monster.hp + heal)
      this.battleSystem.damageTexts.push({
        text: `+${heal}`,
        x: monster.x - this.cameraX,
        y: monster.y - this.cameraY - 60 * this.dpr,
        color: '#2ed573',
        life: 1.0, maxLife: 1.0,
        _startY: monster.y - this.cameraY - 60 * this.dpr
      })
    } else if (skill.type === 'buff') {
      if (this.game.showToast) this.game.showToast(`${monster.name} 使用 ${skill.name}！`)
    } else if (skill.type === 'summon') {
      if (this.game.showToast) this.game.showToast(`${monster.name} 召唤了帮手！`)
    } else {
      // 默认近战
      doMelee(skill.power || 1)
    }
  }

  /**
   * ★ 怪物远程抛射物（简化：飞行中逐渐靠近玩家，到达结算伤害）
   */
  proto._fieldSpawnMonsterProjectile = function(monster, skill, dx, dy, dist) {
    if (!this.battleSystem.projectiles) this.battleSystem.projectiles = []
    const speed = (skill.projectileSpeed || 220) * this.dpr
    this.battleSystem.projectiles.push({
      x: monster.x,
      y: monster.y,
      tx: this.playerX,
      ty: this.playerY,
      vx: (dx / (dist || 1)) * speed,
      vy: (dy / (dist || 1)) * speed,
      power: skill.power || 1,
      atk: monster.atk,
      def: monster.def,
      life: 2.0,
      color: '#b15eff',
      owner: 'monster'
    })
  }

  /**
   * ★ 怪物抛射物更新：飞行→命中玩家结算伤害
   */
  proto._fieldUpdateProjectiles = function(dt) {
    if (!this.battleSystem.projectiles) return
    const hero = this.party[0]
    for (let i = this.battleSystem.projectiles.length - 1; i >= 0; i--) {
      const p = this.battleSystem.projectiles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      // 命中判定（到达玩家附近）
      const hdx = this.playerX - p.x
      const hdy = this.playerY - p.y
      if (hero && hero.hp > 0 && (hdx * hdx + hdy * hdy) < (40 * this.dpr) ** 2) {
        const dmg = Math.max(1, Math.floor(p.atk * (p.power || 1) - hero.def * 0.3))
        hero.hp = Math.max(0, hero.hp - dmg)
        this.battleSystem.damageTexts.push({
          text: `-${dmg}`,
          x: this.playerX - this.cameraX,
          y: this.playerY - this.cameraY - 60 * this.dpr,
          color: '#ff4757',
          life: 1.0, maxLife: 1.0,
          _startY: this.playerY - this.cameraY - 60 * this.dpr
        })
        this.battleSystem.projectiles.splice(i, 1)
        continue
      }
      if (p.life <= 0) this.battleSystem.projectiles.splice(i, 1)
    }
  }

  /**
   * ★ 怪物跳跃攻击预警区域更新：倒计时结束在区域内结算伤害（玩家已走出区域则安全）
   */
  proto._fieldUpdateWarningZones = function(dt) {
    if (!this.battleSystem.warningZones) return
    const list = this.battleSystem.warningZones
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i]
      z.timer -= dt
      // 到点（预警消失瞬间）：怪物跳跃落至红圈中心，再对"此刻仍在区域内"的玩家结算伤害
      if (z.timer <= 0) {
        // 怪物落地：重新进入短暂"技能攻击状态"（砸地演出），避免落地瞬间直接普攻
        if (z.monsterRef && z.monsterRef.hp > 0) {
          z.monsterRef.x = z.x
          z.monsterRef.y = z.y - 6 * this.dpr
          z.monsterRef.isCastingSkill = true
          z.monsterRef.skillAnimTimer = 450 // 落地攻击演出时长（毫秒）
          z.monsterRef._jumpWarn = true // 落地演出期间仍不黏住，停在落点
        }
        const hero = this.party[0]
        if (hero && hero.hp > 0) {
          const hdx = this.playerX - z.x
          const hdy = this.playerY - z.y
          if ((hdx * hdx + hdy * hdy) <= z.r * z.r) {
            const dmg = Math.max(1, Math.floor(z.atk * (z.power || 1) - hero.def * 0.3))
            hero.hp = Math.max(0, hero.hp - dmg)
            this.battleSystem.damageTexts.push({
              text: `-${dmg}`,
              x: this.playerX - this.cameraX,
              y: this.playerY - this.cameraY - 60 * this.dpr,
              color: '#ff4757',
              life: 1.0, maxLife: 1.0,
              _startY: this.playerY - this.cameraY - 60 * this.dpr
            })
          }
        }
        list.splice(i, 1)
      }
    }
  }

  proto._monsterAttackPlayer = function(monster, hero) {
    if (!hero || hero.hp <= 0) return
    
    // ★ 设置攻击动画状态（防止重复触发）
    if (monster.isAttacking) return
    monster.isAttacking = true
    monster.attackAnimTimer = 500 // 攻击动画持续时间（毫秒）
    monster.hasDealtDamage = false // 标记尚未造成伤害

    console.log(`[FieldBattle] ${monster.name} 开始攻击动画`)
  }

  /**
   * ★ 新增：在攻击动画的命中帧计算伤害
   */
  proto._dealMonsterDamage = function(monster, hero) {
    if (!hero || hero.hp <= 0 || monster.hasDealtDamage) return

    // 标记已造成伤害（防止同一攻击动画造成多次伤害）
    monster.hasDealtDamage = true

    // 计算伤害
    const damage = Math.max(1, monster.atk - Math.floor(hero.def * 0.4))

    // 暴击判定
    const isCrit = Math.random() < (monster.crit || 0.05)
    const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage

    // 应用伤害
    hero.hp = Math.max(0, hero.hp - finalDamage)

    // 添加伤害数字（显示在玩家位置）
    const screenX = this.playerX - this.cameraX
    const screenY = this.playerY - this.cameraY
    this.battleSystem.damageTexts.push({
      text: `-${finalDamage}${isCrit ? '!' : ''}`,
      x: screenX,
      y: screenY - 60 * this.dpr,
      color: isCrit ? '#FFD700' : '#FF4757',
      life: 1.0,
      maxLife: 1.0,
      _startY: screenY - 60 * this.dpr,
      isCrit: isCrit
    })

    console.log(`[FieldBattle] ${monster.name} 攻击 ${hero.name}，造成 ${finalDamage} 点伤害${isCrit ? '（暴击！）' : ''}，剩余HP: ${hero.hp}`)
  }

  // ==========================================================================
  // 7. 更新伤害数字
  // ==========================================================================
  proto._updateFieldDamageTexts = function(dt) {
    if (!this.battleSystem.damageTexts || !Array.isArray(this.battleSystem.damageTexts)) return

    for (let i = this.battleSystem.damageTexts.length - 1; i >= 0; i--) {
      const item = this.battleSystem.damageTexts[i]

      // 计算动画进度
      const progress = 1 - (item.life / (item.maxLife || 1.0))

      // Ease-out 上升：y 坐标随时间向上移动
      if (!item._startY) item._startY = item.y
      const easeOut = progress * (2 - progress) // ease-out 函数
      item.y = item._startY - (easeOut * 60 * this.dpr) // 上升60px

      // 缩放效果：从 1.5 倍缩放到 1.0 倍
      item._scale = 1.5 - (easeOut * 0.5)

      // 透明度：逐渐消失
      item._alpha = 1 - progress

      // 更新生命周期
      item.life -= dt

      // 移除过期的伤害数字
      if (item.life <= 0) {
        this.battleSystem.damageTexts.splice(i, 1)
      }
    }
  }

  // ==========================================================================
  // 8. 渲染战斗UI
  // ==========================================================================
  proto._renderBattleUI = function(ctx) {
    if (!this.battleSystem.showBattleUI) return

    // 1. 渲染攻击按钮
    this._renderAttackButton(ctx)

    // 2. 渲染技能按钮
    this._renderSkillButtons(ctx)

    // 3. 渲染伤害数字
    this._renderDamageTexts(ctx)

    // 4. 渲染血条
    this._renderHealthBars(ctx)

    // 5. 攻击/技能动画由主角 ATTACK/SHIELD/BUFF 帧体现，不再绘制场上范围指示
  }

  // ==========================================================================
  // 9. 渲染攻击按钮
  // ==========================================================================
  proto._renderAttackButton = function(ctx) {
    const btn = this.battleSystem.attackButton
    if (!btn) return

    // 按钮背景
    ctx.fillStyle = this.battleSystem.playerAttackCD > 0 ? 'rgba(128,128,128,0.8)' : 'rgba(255,71,87,0.8)'
    ctx.beginPath()
    this._roundRect(ctx, btn.x, btn.y, btn.width, btn.height, 10 * this.dpr)
    ctx.fill()

    // 按钮边框
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    // 按钮文字
    ctx.font = `${16 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(btn.text, btn.x + btn.width / 2, btn.y + btn.height / 2)

    // 冷却遮罩
    if (this.battleSystem.playerAttackCD > 0) {
      const cooldownRatio = this.battleSystem.playerAttackCD / this.battleSystem.playerAttackInterval
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.beginPath()
      this._roundRect(
        ctx,
        btn.x,
        btn.y + btn.height * (1 - cooldownRatio),
        btn.width,
        btn.height * cooldownRatio,
        10 * this.dpr
      )
      ctx.fill()
    }
  }

  // ==========================================================================
  // 10. 渲染技能按钮
  // ==========================================================================
  proto._renderSkillButtons = function(ctx) {
    if (!this.battleSystem.skillButtons || !Array.isArray(this.battleSystem.skillButtons)) return

    for (const btn of this.battleSystem.skillButtons) {
      // 按钮背景
      ctx.fillStyle = btn.cooldown > 0 ? 'rgba(128,128,128,0.8)' : 'rgba(74,158,255,0.8)'
      ctx.beginPath()
      this._roundRect(ctx, btn.x, btn.y, btn.width, btn.height, 10 * this.dpr)
      ctx.fill()

      // 按钮边框
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()

      // 按钮文字
      ctx.font = `${12 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(btn.text, btn.x + btn.width / 2, btn.y + btn.height / 2)

      // 冷却遮罩
      if (btn.cooldown > 0) {
        // 用 cooldownMax（毫秒）作为分母，避免 skill.cooldown 单位（秒）混乱
        const max = btn.cooldownMax || (btn.skill.cooldown || 3) * 1000
        const cooldownRatio = Math.min(1, btn.cooldown / max)
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.beginPath()
        this._roundRect(
          ctx,
          btn.x,
          btn.y + btn.height * (1 - cooldownRatio),
          btn.width,
          btn.height * cooldownRatio,
          10 * this.dpr
        )
        ctx.fill()
      }
    }
  }

  // ==========================================================================
  // 11. 渲染伤害数字
  // ==========================================================================
  proto._renderDamageTexts = function(ctx) {
    if (!this.battleSystem.damageTexts || !Array.isArray(this.battleSystem.damageTexts)) return

    for (const item of this.battleSystem.damageTexts) {
      ctx.save()

      // 设置透明度
      ctx.globalAlpha = item._alpha || 1

      // 设置字体和颜色
      ctx.font = `${16 * this.dpr * (item._scale || 1)}px sans-serif`
      ctx.fillStyle = item.color || '#ff4757'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // 绘制伤害数字
      ctx.fillText(item.text, item.x, item.y)

      ctx.restore()
    }
  }

  // ==========================================================================
  // 12. 渲染血条
  // ==========================================================================
  proto._renderHealthBars = function(ctx) {
    // 渲染玩家血条
    this._renderPlayerHealthBar(ctx)

    // 渲染怪物血条
    this._renderMonsterHealthBars(ctx)
  }

  proto._renderPlayerHealthBar = function(ctx) {
    const mainHero = this.party[0]
    if (!mainHero) return

    const screenX = this.playerX - this.cameraX
    const screenY = this.playerY - this.cameraY
    const barWidth = 60 * this.dpr
    const barHeight = 6 * this.dpr
    const barX = screenX - barWidth / 2
    const barY = screenY - 50 * this.dpr

    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(barX, barY, barWidth, barHeight)

    // HP条
    const hpRatio = Math.max(0, mainHero.hp / mainHero.maxHp)
    ctx.fillStyle = hpRatio > 0.5 ? '#2ed573' : (hpRatio > 0.25 ? '#ffa502' : '#ff4757')
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight)

    // 边框
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.strokeRect(barX, barY, barWidth, barHeight)
  }

  proto._renderMonsterHealthBars = function(ctx) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      const screenX = monster.x - this.cameraX
      const screenY = monster.y - this.cameraY
      const barWidth = 50 * this.dpr
      const barHeight = 5 * this.dpr
      const barX = screenX - barWidth / 2
      const barY = screenY - 40 * this.dpr

      // 背景
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(barX, barY, barWidth, barHeight)

      // HP条
      const hpRatio = Math.max(0, monster.hp / monster.maxHp)
      ctx.fillStyle = hpRatio > 0.5 ? '#2ed573' : (hpRatio > 0.25 ? '#ffa502' : '#ff4757')
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight)

      // 边框
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.strokeRect(barX, barY, barWidth, barHeight)
    }
  }

  // ==========================================================================
  // 13. 处理战斗UI点击
  // ==========================================================================
  proto._handleBattleUITap = function(tap) {
    if (!this.battleSystem.active) return false

    // 检查是否点击了攻击按钮
    if (this.battleSystem.attackButton) {
      const btn = this.battleSystem.attackButton
      if (tap.x >= btn.x && tap.x <= btn.x + btn.width &&
          tap.y >= btn.y && tap.y <= btn.y + btn.height) {
        console.log('[FieldBattle] 点击攻击按钮')

        // 攻击范围内最近的怪物（battleTarget 也必须在范围内才生效）
        const range = (this.battleSystem.attackRange || 80) * this.dpr
        const target = this._findNearestMonster(range)
        if (target) {
          this._playerAttackMonster(target)
        } else {
          // 范围内无目标，提示玩家靠近
          if (this.game.showToast) this.game.showToast('目标太远，靠近再攻击')
        }
        return true
      }
    }

    // 检查是否点击了技能按钮
    if (this.battleSystem.skillButtons && this.battleSystem.skillButtons.length > 0) {
      for (const btn of this.battleSystem.skillButtons) {
        if (tap.x >= btn.x && tap.x <= btn.x + btn.width &&
            tap.y >= btn.y && tap.y <= btn.y + btn.height) {
          // ★ CD 中则不响应
          if (btn.cooldown > 0) {
            console.log(`[FieldBattle] 技能 ${btn.text} 冷却中: ${Math.ceil(btn.cooldown / 1000)}s`)
            return true
          }

          // MP 不足也不响应
          const mainHero = this.party[0]
          if (mainHero && mainHero.mp < (btn.skill.mpCost || 0)) {
            console.log(`[FieldBattle] 技能 ${btn.text} MP 不足`)
            if (this.game.showToast) this.game.showToast('MP 不足！')
            return true
          }

          console.log(`[FieldBattle] 点击技能按钮: ${btn.text}`)

          // 使用技能（范围内最近怪物，battleTarget 也必须在范围内）
          const range = (btn.skill.range || this.battleSystem.attackRange || 80) * this.dpr
          const target = this._findNearestMonster(range)
          if (target) {
            this._playerAttackMonster(target, btn.skill)
          } else {
            if (this.game.showToast) this.game.showToast('目标太远，靠近再释放')
          }
          return true
        }
      }
    }

    return false
  }

  // ==========================================================================
  // 14. 寻找最近的怪物
  // ==========================================================================
  // 在攻击范围内寻找最近的怪物（王者荣耀式：就近攻击，范围外打不到）
  proto._findNearestMonster = function(maxRange) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return null
    const range = maxRange != null ? maxRange : (this.battleSystem.attackRange || 80) * this.dpr

    let nearest = null
    let minDist = Infinity

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      const dist = Math.sqrt(
        (this.playerX - monster.x) ** 2 + (this.playerY - monster.y) ** 2
      )

      // 优先：已锁定的目标若在攻击范围内直接选用
      if (this.battleSystem.battleTarget === monster && dist <= range) {
        return monster
      }

      if (dist <= range && dist < minDist) {
        minDist = dist
        nearest = monster
      }
    }

    // ★ 范围内无目标时返回 null（打不到），不再退而求其次打全屏
    return nearest
  }

    return nearest
  }

  // 标记已安装
  FieldSceneClass._battleSystemInstalled = true

  console.log('[FieldBattle] 野外战斗系统安装完成')
}
