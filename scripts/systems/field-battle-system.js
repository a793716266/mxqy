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
    const btnSize = 50 * this.dpr
    const margin = 20 * this.dpr

    // 攻击按钮（右下角）
    this.battleSystem.attackButton = {
      x: this.width - btnSize - margin,
      y: this.height - btnSize - margin - 60 * this.dpr,
      width: btnSize,
      height: btnSize,
      text: '⚔️',
      cooldown: 0,
      active: true
    }

    // 技能按钮（攻击按钮上方）
    this.battleSystem.skillButtons = []
    const skills = this.party[0]?.skills || []
    skills.forEach((skill, index) => {
      this.battleSystem.skillButtons.push({
        x: this.width - btnSize - margin,
        y: this.height - btnSize - margin - 60 * this.dpr - (index + 1) * (btnSize + 10 * this.dpr),
        width: btnSize,
        height: btnSize,
        text: skill.name,
        skill: skill,
        cooldown: 0,
        active: true,
        index: index
      })
    })

    console.log(`[FieldBattle] 战斗UI初始化完成，技能数量: ${skills.length}`)
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
  }

  // ==========================================================================
  // 6. 怪物攻击玩家
  // ==========================================================================
  proto._updateMonsterAttack = function(dt) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return

    const mainHero = this.party[0]
    if (!mainHero) return

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      // 计算距离
      const dist = Math.sqrt(
        (this.playerX - monster.x) ** 2 + (this.playerY - monster.y) ** 2
      )

      // 如果在攻击范围内
      if (dist < (monster.attackRange || 80)) {
        // 检查攻击冷却
        if (!monster.attackCDTimer) {
          monster.attackCDTimer = 0
        }

        monster.attackCDTimer -= dt * 1000

        if (monster.attackCDTimer <= 0) {
          // 攻击玩家
          this._monsterAttackPlayer(monster, mainHero)

          // 设置攻击冷却
          monster.attackCDTimer = monster.attackInterval || 2000
        }
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
    ctx.font = `${20 * this.dpr}px sans-serif`
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
        const cooldownRatio = btn.cooldown / (btn.skill.cooldown || 3000)
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

        // 攻击当前目标或最近的怪物
        const target = this.battleSystem.battleTarget || this._findNearestMonster()
        if (target) {
          this._playerAttackMonster(target)
        }
        return true
      }
    }

    // 检查是否点击了技能按钮
    if (this.battleSystem.skillButtons && this.battleSystem.skillButtons.length > 0) {
      for (const btn of this.battleSystem.skillButtons) {
        if (tap.x >= btn.x && tap.x <= btn.x + btn.width &&
            tap.y >= btn.y && tap.y <= btn.y + btn.height) {
          console.log(`[FieldBattle] 点击技能按钮: ${btn.text}`)

          // 使用技能
          const target = this.battleSystem.battleTarget || this._findNearestMonster()
          if (target) {
            this._playerAttackMonster(target, btn.skill)
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
  proto._findNearestMonster = function() {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return null

    let nearest = null
    let minDist = Infinity

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      const dist = Math.sqrt(
        (this.playerX - monster.x) ** 2 + (this.playerY - monster.y) ** 2
      )

      if (dist < minDist) {
        minDist = dist
        nearest = monster
      }
    }

    return nearest
  }

  // 标记已安装
  FieldSceneClass._battleSystemInstalled = true

  console.log('[FieldBattle] 野外战斗系统安装完成')
}
