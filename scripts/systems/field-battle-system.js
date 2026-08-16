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
      pendingDamages: [],     // 延迟伤害队列（动画命中帧时结算）
      battleTarget: null,      // 当前战斗目标
      attackRange: 100,       // 玩家普攻范围（逻辑像素）
      showBattleUI: false,     // 是否显示战斗UI
      switchButton: null,      // 角色切换按钮
      currentControlIndex: 0,  // 当前被玩家控制的参战英雄索引（0=主角）
      battleHeroes: [],         // 参战英雄列表：[{hero, sprite, isFollower, getPos()}]
      skillProcesses: [],       // 英雄AOE技能过程（冰刃/雷击）
      buffShockwaves: [],       // buff 生效冲击波（视觉粒子）
      castLockTimer: 0,         // 施法锁定计时（BUFF释放期间锁摇杆）
      castAxisLockTimer: 0,     // 施法轴锁定计时（普攻/伤害技能期间限制Y轴移动）
      pendingProjectiles: []    // 待发射投射物（延迟到攻击动画完成后才真正飞出）
    }
    console.log('[FieldBattle] 战斗系统初始化完成')
  }

  /**
   * ★ 构建参战英雄列表：主角 + 所有跟随队友（李小宝等）
   * 所有英雄世界坐标统一存放在 this._heroWorldPos[]，便于切换控制与跟随
   */
  proto._buildBattleHeroes = function() {
    const list = []
    // 统一世界坐标数组（party 顺序，与 battleHeroes 一一对应）
    const worldPos = []
    // 主角（party[0]）
    worldPos.push({ x: this.playerX, y: this.playerY })
    list.push({
      hero: this.party[0],
      sprite: this.mainCharacterSprite,
      isFollower: false,
      partyIndex: 0,
      getPos: () => worldPos[0]
    })
    // 跟随队友
    if (this.followers && Array.isArray(this.followers)) {
      for (let fi = 0; fi < this.followers.length; fi++) {
        const f = this.followers[fi]
        // ★ field-scene 的 follower 用 character 字段（不是 hero），两者兼容
        const fHero = f.hero || f.character
        if (!f || !fHero) continue
        const idx = list.length
        worldPos.push({ x: f.x, y: f.y })
        list.push({
          hero: fHero,
          sprite: f.sprite,
          isFollower: true,
          followerRef: f,
          partyIndex: idx,
          getPos: () => worldPos[idx]
        })
      }
    }
    this._heroWorldPos = worldPos
    this.battleSystem.battleHeroes = list
    this.battleSystem.currentControlIndex = 0
    return list
  }

  /**
   * ★ 获取当前被控制的参战英雄（始终为 battleHeroes[0]，切换时重排）
   */
  proto._getCurrentControlHero = function() {
    const heroes = this.battleSystem.battleHeroes
    if (!heroes || !heroes.length) return null
    return heroes[0]
  }

  /**
   * ★ 切换被控制的参战英雄（主角 <-> 李小宝等）
   * 切换后：原被控者坐标存入 _heroWorldPos，新被控者坐标载入 playerX/playerY
   */
  proto._switchControl = function() {
    // ★ 本方法挂在 FieldSceneClass.prototype 上，this 即 field-scene 实例
    //   battleHeroes/currentControlIndex 在 this.battleSystem 上，playerX/_heroWorldPos 在 scene 上
    const sys = this.battleSystem
    if (!sys) return
    const list = sys.battleHeroes
    if (!list || list.length < 2 || !this._heroWorldPos) return
    const cur = list[0]
    const nxt = list[1]
    // 将原被控者坐标同步回其世界坐标
    this._heroWorldPos[cur.partyIndex] = { x: this.playerX, y: this.playerY }
    // 将新被控者世界坐标载入 playerX/playerY（被控者即镜头中心）
    const np = this._heroWorldPos[nxt.partyIndex]
    this.playerX = np.x
    this.playerY = np.y
    // 重排：新被控者置于 index0
    list[0] = nxt
    list[1] = cur
    sys.currentControlIndex = 0

    // ★★★ 关键修复：同步重排 this.followers，使 AI 跟随/召回逻辑与 battleHeroes 保持一致
    //   原逻辑只重排 battleHeroes，导致切换后 followers 顺序与 battleHeroes 错位：
    //   被控角色(原 followers[1]) 仍被 AI 跟随循环当成 followers[0] 队友去指挥，
    //   新被控角色被两套逻辑抢控，表现为"切换后召回/解散失效、队友乱跑"。
    if (this.followers && this.followers.length >= 2) {
      const fi0 = this.followers.indexOf(cur.followerRef)
      const fi1 = this.followers.indexOf(nxt.followerRef)
      if (fi0 !== -1 && fi1 !== -1) {
        const tmp = this.followers[fi0]
        this.followers[fi0] = this.followers[fi1]
        this.followers[fi1] = tmp
      }
    }

    // ★★ 关键：重置双方的 AI 攻击/动画状态
    //   原被控者（cur）将转为 AI 角色：清掉残留的普攻 CD，让 AI 立即可攻击；
    //   新被控者（nxt）原本是 AI 角色，可能正卡在 attack 状态（_aiAttacking=true 且不再被 AI 计时清理），
    //   必须复位为 idle，否则 _playerAttackMonster 会因 battleStates.includes(sprite.state) 直接 return，
    //   导致切换后技能无效、动画不播、伤害丢失。
    const resetHeroCombatState = (bh) => {
      if (!bh) return
      if (bh.hero) {
        bh.hero._aiAttacking = false
        bh.hero._aiAttackTimer = 0
        bh.hero._aiAttackCD = 0
      }
      if (bh.sprite) {
        bh.sprite.state = 'idle'
        bh.sprite.animFrame = 0
        bh.sprite.animTimer = 0
      }
    }
    resetHeroCombatState(cur)
    resetHeroCombatState(nxt)

    // ★ 重置普攻冷却，避免切换后仍受上个角色的普攻 CD 影响
    sys.playerAttackCD = 0

    // ★ 切换后：技能按钮重建为新被控角色的技能
    if (sys.attackButton) {
      const b = sys.attackButton
      const gap = Math.max(6 * this.dpr, b.width * 0.18)
      const margin = Math.max(10 * this.dpr, b.width * 0.25)
      this._rebuildSkillButtons(b.x, b.y, b.width, margin, gap)
    }

    // ★ 左上角角色卡 + 头像同步切换为当前被控英雄
    //   注意：角色卡由 field-scene 的 tap 处理统一更新（那里能拿到 CharacterState 实例），
    //   阵亡自动切换路径则通过 this._refreshCharCard 钩子触发（field-scene 实现）
    if (nxt && nxt.hero && typeof this._refreshCharCard === 'function') {
      this._refreshCharCard(nxt.hero)
    }

    console.log(`[FieldBattle] 切换控制：${nxt.hero.name}`)
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

    // 构建参战英雄列表（主角 + 跟随队友）
    this._buildBattleHeroes()

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
      // ★ 财运亨通(gold_up)：战斗胜利额外获得金币（基础金币 + 加成）
      const battleHeroesG = this.battleSystem.battleHeroes || []
      let goldBonusRatio = 0
      for (const bh of battleHeroesG) {
        if (bh.hero && bh.hero.hp > 0) {
          const gv = this._heroBuffValue(bh.hero, 'gold_up')
          if (gv > goldBonusRatio) goldBonusRatio = gv
        }
      }
      const baseGold = 20
      const extraGold = Math.round(baseGold * goldBonusRatio)
      const totalGold = baseGold + extraGold
      const curGold = (this.game.data && this.game.data.get && this.game.data.get('gold')) || 0
      this.game.data.set('gold', curGold + totalGold)
      if (extraGold > 0 && this.game.showToast) {
        this.game.showToast(`战斗胜利！获得金币 +${totalGold}（财运亨通 +${extraGold}）`)
      }
    } else {
      // 战斗失败，全部英雄阵亡 → 回城镇（★ 保持死亡状态返回，到城镇后再复活）
      if (this.game.showToast) {
        this.game.showToast('战斗失败，返回城镇')
      }
      // ★ 标记：到城镇后需要复活全队（不在野外先复活，否则回城前角色就已站起）
      if (this.game && this.game.data && typeof this.game.data.set === 'function') {
        this.game.data.set('needReviveOnTown', true)
      }
      // ★ 全部阵亡后回到城镇（保持死亡状态）
      setTimeout(() => {
        if (this.game && this.game.changeScene) {
          this.game.changeScene('town')
        } else if (this.game && this.game.sceneManager) {
          this.game.sceneManager.changeScene('town')
        }
      }, 800)
    }

    // 重置战斗系统
    this.battleSystem.active = false
    this.battleSystem.battleTarget = null
    this.battleSystem.showBattleUI = false
    this.battleSystem.attackButton = null
    this.battleSystem.skillButtons = []
    this.battleSystem.damageTexts = []
    this.battleSystem.pendingDamages = []
    this.battleSystem.skillProcesses = []
    this.battleSystem.buffShockwaves = []
    this.battleSystem.buffParticles = []
    this.battleSystem.castLockTimer = 0
    this.battleSystem.castAxisLockTimer = 0
    this.battleSystem.pendingProjectiles = []

    // 清理怪物状态效果与冰冻标记
    if (this.mapMonsters) {
      for (const m of this.mapMonsters) {
        m.statusEffects = []
        m._frozen = false
        m._stunned = 0
        m._strikeCount = 0
      }
    }
    // 清理英雄 buff 与护盾
    if (this.battleSystem.battleHeroes) {
      for (const bh of this.battleSystem.battleHeroes) {
        if (bh.hero) {
          bh.hero._buffs = []
          bh.hero._shield = 0
          bh.hero._shieldMax = 0
          bh.hero._shieldTimer = 0
        }
      }
    }

    // 保存怪物状态
    this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
  }

  // ==========================================================================
  // 3. 战斗UI初始化
  // ==========================================================================
  proto._initBattleUI = function() {
    // ★ 按钮尺寸自适应屏幕短边，保证不同分辨率手机都好按且不溢出
    //   基准取短边的 13%，并限制在 [48, 72] * dpr 之间
    const shortSide = Math.min(this.width, this.height)
    let btnSize = shortSide * 0.13
    btnSize = Math.max(48 * this.dpr, Math.min(72 * this.dpr, btnSize))
    const gap = Math.max(6 * this.dpr, btnSize * 0.18)   // 间距按按钮比例
    const margin = Math.max(10 * this.dpr, btnSize * 0.25)
    const cell = btnSize + gap

    // ATK 放在右下角内侧；从右下角往左上各退一格，给四向（上/右/下/左）技能留出空间
    // 钳制保证完整在屏内
    let attackX = this.width - btnSize * 2 - margin - gap
    let attackY = this.height - btnSize * 2 - margin - gap
    this.battleSystem.attackButton = {
      x: attackX,
      y: attackY,
      width: btnSize,
      height: btnSize,
      text: 'ATK',
      cooldown: 0,
      active: true
    }

    // 角色切换按钮已统一由 field-scene 左上角角色卡片的 ↻ 按钮承载，此处不再单独创建

    // ★ 技能按钮：四向十字布局（ATK 居中，技能按 上/右/下/左 顺时针填充，沿用原有方式）
    //   技能列表取【当前被控英雄】的技能，切换控制后需调用 _rebuildSkillButtons() 刷新
    this._rebuildSkillButtons(attackX, attackY, btnSize, margin, gap)

    console.log(`[FieldBattle] 战斗UI初始化完成（自适应布局 btnSize=${Math.round(btnSize)}），技能数量: ${this.battleSystem.skillButtons.length}`)
  }

  /**
   * ★ 重建技能按钮（切换控制角色后调用，让按钮对应新被控英雄的技能）
   * @param {number} centerX 攻击按钮中心X
   * @param {number} centerY 攻击按钮中心Y
   * @param {number} btnSize 按钮尺寸
   * @param {number} margin 边距
   */
  proto._rebuildSkillButtons = function(centerX, centerY, btnSize, margin, gap) {
    const sys = this.battleSystem
    const ctrl = this._getCurrentControlHero()
    const ctrlHero = ctrl ? ctrl.hero : null
    // ★ 过滤掉普攻型技能（type:'attack' 且 mpCost:0）——普攻已有专用 ATK 按钮，
    //   否则技能数>4时多余的技能会重叠到其它按钮位置（魔力护盾被法杖敲击覆盖就是这个 bug）
    const allSkills = (ctrlHero && ctrlHero.skills) || []
    const skills = allSkills.filter(s => !(s.type === 'attack' && (s.mpCost || 0) === 0))
    const cell = btnSize + (gap != null ? gap : 8 * this.dpr)

    sys.skillButtons = []
    // ★ 四向十字（上/右/下/左），沿用原有布局方式，可容纳最多 4 个技能
    const dirs = [
      { dx: 0,     dy: -cell, pos: 'top'    }, // 上
      { dx: cell,  dy: 0,     pos: 'right'  }, // 右
      { dx: 0,     dy: cell,  pos: 'bottom' }, // 下
      { dx: -cell, dy: 0,     pos: 'left'   }, // 左
    ]
    skills.forEach((skill, index) => {
      const dir = dirs[index % dirs.length]
      let bx = centerX + dir.dx
      let by = centerY + dir.dy
      // ★ 严格钳制：保证按钮完整落在屏幕内（不同分辨率都适用）
      bx = Math.max(margin, Math.min(this.width - btnSize - margin, bx))
      by = Math.max(margin, Math.min(this.height - btnSize - margin, by))
      sys.skillButtons.push({
        x: bx,
        y: by,
        width: btnSize,
        height: btnSize,
        text: skill.name,
        skill: skill,
        cooldown: 0,
        cooldownDelay: 0,   // ★ BUFF 技能延迟冷却（等 BUFF 消失后开始计 CD）
        active: true,
        index: index
      })
    })
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
      const pa = this.battleSystem.playerAnim
      // ★ 剑气风暴（自定义斩击大招）：分阶段状态机推进（前摇→突刺→收尾）
      if (pa.type === 'blade_storm') {
        // 状态机自己用 chargeTimer/dashTimer/finishTimer 推进，
        // 这里只保留一个总时长兜底（只递减一次，避免被双重递减提前清零）
        this._updateBladeStorm(pa, dt)
        pa.timer -= dt
        if (pa.timer <= 0 && pa.phase !== 'finish') {
          // 兜底：异常超时也清理
          this.battleSystem.playerAnim = null
          const sp0 = this.mainCharacterSprite
          if (sp0) { sp0.state = 'idle'; sp0.animFrame = 0; sp0.animTimer = 0 }
        }
      } else {
        pa.timer -= dt
      // ★ 近战攻击位移（lunge）：身体跟随挥砍前冲后回弹
      if (this.battleSystem._attackLunge) {
        const ln = this.battleSystem._attackLunge
        const ctrl = this._getCurrentControlHero()
        if (ctrl) {
          const lpos = ctrl.getPos()
          // 先撤销上一帧偏移
          if (ln.last) {
            lpos.x -= ln.last
            if (ctrl.partyIndex === 0) this.playerX -= ln.last
          }
          const prog = pa.maxTimer ? Math.min(1, Math.max(0, 1 - pa.timer / pa.maxTimer)) : 0
          // sin 曲线：0→0.5 前冲、0.5→1 回弹归位
          const off = Math.sin(prog * Math.PI) * ln.amount * ln.dir
          lpos.x += off
          if (ctrl.partyIndex === 0) this.playerX += off
          ln.last = off
        }
      }
      if (pa.timer <= 0) {
        // 攻击结束：归位偏移并清除 lunge
        if (this.battleSystem._attackLunge) {
          const ln = this.battleSystem._attackLunge
          const ctrl = this._getCurrentControlHero()
          if (ctrl && ln.last) {
            const lpos = ctrl.getPos()
            lpos.x -= ln.last
            if (ctrl.partyIndex === 0) this.playerX -= ln.last
          }
          this.battleSystem._attackLunge = null
        }
        this.battleSystem.playerAnim = null
      }
      }
    }

    // 1.2 更新技能按钮冷却（★ 修复：之前这里漏了递减，导致按钮永久灰色）
    if (this.battleSystem.skillButtons && this.battleSystem.skillButtons.length > 0) {
      for (const sb of this.battleSystem.skillButtons) {
        // ★ BUFF 技能：先递减 cooldownDelay（=BUFF 持续时长），BUFF 消失后才开始计冷却
        if (sb.cooldownDelay > 0) {
          sb.cooldownDelay = Math.max(0, sb.cooldownDelay - dt)
          // delay 刚归 0：此刻 BUFF 消失，正式开始冷却（cooldown = cooldownMax 开始递减）
          if (sb.cooldownDelay === 0 && sb.cooldown === 0) {
            sb.cooldown = sb.cooldownMax || ((sb.skill.cooldown || 3) * 1000)
          }
          continue
        }
        if (sb.cooldown > 0) {
          sb.cooldown = Math.max(0, sb.cooldown - dt * 1000)
        }
      }
    }

    // 1.3 延迟伤害结算（动画命中帧时才应用伤害）
    if (this.battleSystem.pendingDamages && this.battleSystem.pendingDamages.length > 0) {
      for (let i = this.battleSystem.pendingDamages.length - 1; i >= 0; i--) {
        const pd = this.battleSystem.pendingDamages[i]
        pd.timer -= dt
        if (pd.timer <= 0) {
          // 命中帧到达，结算伤害
          const m = pd.monster
          if (m && m.alive) {
            const dealt = this._damageMonster(m, pd.damage)
            if (dealt > 0) {
              // ★ 诅咒：对命中怪物施加降攻（虚弱）状态
              if (pd.debuff && pd.debuff.type === 'atk_down') {
                this._applyMonsterStatus(m, 'atk_down', { duration: pd.debuff.duration || 3, value: pd.debuff.value || 0.3 }, pd.hero)
              }
              // ★ 吸血 / 治愈冲击：按伤害比例治疗施法者
              if (pd.healCasterPct && pd.healCasterPct > 0 && pd.hero) {
                const heal = Math.round((pd.damage || 0) * pd.healCasterPct)
                if (heal > 0) {
                  pd.hero.hp = Math.min(pd.hero.maxHp, (pd.hero.hp || 0) + heal)
                  const hp = (typeof pd.hero.getPos === 'function') ? pd.hero.getPos() : { x: this.playerX, y: this.playerY }
                  this.battleSystem.damageTexts.push({
                    text: `+${heal}`, x: hp.x - this.cameraX, y: hp.y - this.cameraY - 60 * this.dpr,
                    color: '#2ed573', life: 1.0, maxLife: 1.0, _startY: hp.y - this.cameraY - 60 * this.dpr
                  })
                }
              }
              // 添加伤害数字
              const sx = m.x - this.cameraX
              const sy = m.y - this.cameraY
              this.battleSystem.damageTexts.push({
                text: `-${pd.damage}${pd.isCrit ? '!' : ''}`,
                x: sx,
                y: sy - 40 * this.dpr,
                color: pd.isCrit ? '#FFD700' : '#ff4757',
                life: 1.0,
                maxLife: 1.0,
                _startY: sy - 40 * this.dpr,
                isCrit: pd.isCrit
              })
              console.log(`[FieldBattle] ${pd.heroName} 命中 ${m.name}，造成 ${pd.damage} 点伤害${pd.isCrit ? '（暴击！）' : ''}，剩余HP: ${m.hp}`)
              // 检查死亡
              if (m.hp <= 0) {
                m.alive = false
                console.log(`[FieldBattle] ${m.name} 被击败！`)
                this.battleSystem.battleTarget = null
              }
            }
          }
          // ★ 暗星爆发等全体技能：对范围内所有存活怪物结算（不重复结算已命中的 m）
          if (pd.allTarget) {
            for (const mm of (this.mapMonsters || [])) {
              if (!mm.alive || mm === m) continue
              const ic = Math.random() < (pd.hero.crit || 0.05)
              const dmg = this._calcSkillDamageToMonster(mm, pd.skill, pd.hero, ic)
              this._damageMonster(mm, dmg)
              this._pushDamageText(mm, dmg, ic, '#c08bff')
              if (mm.hp <= 0) { mm.alive = false; this.battleSystem.battleTarget = null }
            }
          }
          // ★ 盾击附加效果：生成自身护盾 + 防御提升 + 眩晕+击退前方X轴范围敌人
          //   ★ 移到 if(m&&m.alive) 块之外：即使无锁定目标（m 为空）也要触发——
          //     盾击是防御向技能，玩家没锁定怪物自保时也该获得护盾/防御，并对前方敌人生效。
          if (pd.shieldBash && pd.hero) {
            this._applyShieldBashEffects(m || null, pd.hero, pd.skill)
          }
          // 移除已结算的
          this.battleSystem.pendingDamages.splice(i, 1)
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

    // 4. 检查参战英雄是否全部死亡
    const battleHeroes = this.battleSystem.battleHeroes || []
    let aliveCount = 0
    for (const bh of battleHeroes) {
      if (bh.hero && bh.hero.hp > 0) aliveCount++
    }
    if (aliveCount === 0) {
      console.log(`[FieldBattle] 所有参战英雄已阵亡`)
      this._endFieldBattle(false)
      return
    }

    // 4.01 ★ 当前被控英雄阵亡时，自动切换到下一个存活英雄
    const ctrlHero0 = battleHeroes[0]
    if (ctrlHero0 && (!ctrlHero0.hero || ctrlHero0.hero.hp <= 0)) {
      for (let bi = 1; bi < battleHeroes.length; bi++) {
        if (battleHeroes[bi].hero && battleHeroes[bi].hero.hp > 0) {
          console.log(`[FieldBattle] 被控英雄阵亡，自动切换到 ${battleHeroes[bi].hero.name}`)
          this._switchControl()
          break
        }
      }
    }

    // 4.1 ★ 队友（李小宝等）AI 自动战斗（非当前控制英雄）
    this._updateAllyAI(dt)

    // 4.2 ★ 怪物状态效果更新（灼烧DoT / 冰冻 / 感电）
    this._updateMonsterStatusEffects(dt)

    // 4.21 ★ 英雄 BUFF 计时更新（魔力护盾防御提升等）
    this._updateHeroBuffs(dt)

    // 4.212 ★ MP 不足抖动提示更新
    this._updateMpShake(dt)

    // 4.211 ★ 施法锁定计时（BUFF 释放期间锁摇杆）
    if (this.battleSystem.castLockTimer > 0) {
      this.battleSystem.castLockTimer -= dt
    }
    // 4.212 ★ 施法轴锁定计时（普攻/伤害技能释放期间限制 Y 轴移动）
    //   ★ 直接跟随玩家攻击/技能动画：只要 playerAnim 在播放就锁 Y 轴，
    //     避免固定 0.7s 与动画时长(普攻0.6s/技能1.0s)不一致导致"动画未播完就能移动Y"
    if (this.battleSystem.playerAnim && this.battleSystem.playerAnim.timer > 0) {
      this.battleSystem.castAxisLockTimer = this.battleSystem.playerAnim.timer
    } else if (this.battleSystem.castAxisLockTimer > 0) {
      this.battleSystem.castAxisLockTimer -= dt
    }

    // 4.22 ★ buff 生效冲击波衰减更新
    this._updateBuffShockwaves(dt)

    // 4.3 ★ AOE技能过程更新（冰刃波动剑延伸、雷击连击）
    this._updateHeroSkillProcesses(dt)

    // 4.4 ★ 英雄弹道更新（火球术飞行命中）
    this._updateHeroProjectiles(dt)

    // 4.41 ★ 待发射投射物更新（攻击动画完成后才真正飞出）
    this._updatePendingProjectiles(dt)

    // 4.5 ★ 怪物跳跃动画更新（抛物线飞行 + 落地伤害）
    this._updateMonsterJumps(dt)

    // 5. 更新怪物攻击（攻击最近的参战英雄）
    this._updateMonsterAttack(dt)
  }

  // ==========================================================================
  // 5. 玩家攻击怪物
  // ==========================================================================
  proto._playerAttackMonster = function(monster, skill) {
    // buff类技能不需要目标（monster 可为 null）
    const isBuff = skill && (skill.type === 'buff' || skill.type === 'heal' || skill.range === 0)
    // monster 存在但已死亡则 return；monster 为 null 时允许继续（只播动画不造成伤害）
    if (monster && !monster.alive) return
    if (this.battleSystem.playerAttackCD > 0 && !skill) return

    // ★ 设置当前攻击目标（用于 field-scene._renderTargetPanel 的 DNF 式固定目标面板）
    if (monster && !isBuff) {
      this.battleSystem.battleTarget = monster
    }

    // ★ 使用当前被控制的参战英雄（而非固定主角）
    const ctrl = this._getCurrentControlHero()
    if (!ctrl || !ctrl.hero) return
    const mainHero = ctrl.hero
    const sprite = ctrl.sprite

    // ★ 剑气风暴（自定义斩击大招）：独立的状态机流程，提前分发
    if (skill && skill.type === 'blade_storm') {
      this._castBladeStorm(skill, ctrl)
      return
    }

    // ★ 触发攻击/技能动画（通过 CharacterSprite 的 state 切换）
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

    // ★ 正在播放攻击/技能动画时，忽略新的普攻请求，避免动画被打断
    //   —— 例外：技能可打断普攻/技能（skill !== null），否则普攻 8帧动画(约1.2s)期间无法放技能
    const battleStates = ['attack', 'shield', 'skill', 'buff', 'support']
    if (sprite && battleStates.includes(sprite.state)) {
      if (!skill) return   // 普攻不能打断
      // 技能打断：直接覆盖为技能动画（不 return，继续走下方统一逻辑）
      if (animState === sprite.state) {
        // 同状态技能（如连续普攻型技能）也允许重放
        sprite.animFrame = 0
        sprite.animTimer = 0
      }
    }

    // ★★ MP 不足检查：技能需要 MP 但不够时，提示 + 角色抖动，不释放技能
    if (skill && (skill.mpCost || 0) > 0 && (mainHero.mp || 0) < (skill.mpCost || 0)) {
      if (this.game && this.game.showToast) {
        this.game.showToast('MP不足')
      }
      // 角色抖动提示
      if (typeof this._triggerMpShake === 'function') {
        this._triggerMpShake(ctrl)
      }
      return
    }

    if (sprite) {
      // ★ 普攻/伤害技能释放：施法期间移动限制为 X 轴（Y 锁定）
      //   时长对齐真实动画(8帧×frameDuration)，由 _updateBattle 跟随 playerAnim.timer 维持
      if (!isBuff) {
        const fd = (this.frameDuration || 0.15)
        this.battleSystem.castAxisLockTimer = 8 * fd
      }
      sprite.state = animState
      sprite.animFrame = 0
      sprite.animTimer = 0
      // 朝向目标（buff无目标时保持当前朝向）
      if (monster) {
        const pos = ctrl.getPos()
        sprite.facingLeft = (monster.x < pos.x)
      }
      // 动画完成后自动恢复 idle
      const prevCallback = sprite.onAnimationComplete
      sprite.onAnimationComplete = function(state) {
        sprite.state = 'idle'
        sprite.animFrame = 0
        sprite.onAnimationComplete = prevCallback
      }
    }
    // 保留 playerAnim 用于朝向覆盖
    const pos0 = ctrl.getPos()
    // ★ 攻击/技能动画时长对齐真实渲染时长（8帧 × frameDuration = 1.2s @150ms），
    //   避免锁定时长(旧0.6/0.7s)比动画短一半导致"动画未播完Y轴就解锁、角色在飘"
    const frameDur = (this.frameDuration || 0.15)
    const animLen = (8 * frameDur) // 普攻/技能统一8帧
    this.battleSystem.playerAnim = {
      type: animState,
      timer: animLen,
      maxTimer: animLen,
      facing: monster ? Math.atan2(monster.y - pos0.y, monster.x - pos0.x) : 0
    }

    // buff类技能（无目标）：只扣 MP + 播放动画，不造成伤害
    if (isBuff) {
      // ★ 施法锁定：BUFF 释放期间（0.8s）锁定摇杆移动（不能移动）
      this.battleSystem.castLockTimer = 0.8
      mainHero.mp = Math.max(0, mainHero.mp - (skill.mpCost || 0))
      // ★ BUFF 技能：不立即进入冷却，等 BUFF 效果消失后才开始计冷却
      //   释放时记录 BUFF 持续时长 → cooldownDelay（递减完成后才开始 cooldown）
      const cdSec = skill.cooldown || 3
      const buffDur = (skill.duration != null) ? skill.duration : ((skill.turns || 1) * 2)
      if (this.battleSystem.skillButtons) {
        const sb = this.battleSystem.skillButtons.find(b => b.skill === skill)
        if (sb) {
          sb.cooldown = 0
          sb.cooldownMax = cdSec * 1000
          sb.cooldownDelay = buffDur   // ★ 先等 BUFF 结束（delay 递减），之后才开始 cooldown
          sb.cooldownDelayMax = buffDur  // ★ 记录 delay 上限，用于渲染剩余比例
        }
      }
      // ★ 应用 buff 效果（def_up / def_up_self 等）
      this._applyHeroBuff(skill, mainHero)
      // ★ 刷新左上角角色卡，立即显示 BUFF 状态
      if (typeof this._refreshCharCard === 'function') {
        this._refreshCharCard(mainHero)
      }
      return
    }

    // ★★★ AOE技能（火球/冰晶/雷击）：范围技能不依赖锁定目标，直接以施法者位置为基准作用
    if (skill && skill.aoe && skill.aoe.enabled) {
      const aoed = skill.aoe
      mainHero.mp = Math.max(0, mainHero.mp - (skill.mpCost || 0))
      // 技能释放后设置按钮冷却
      if (this.battleSystem.skillButtons) {
        const sb = this.battleSystem.skillButtons.find(b => b.skill === skill)
        if (sb) {
          const cdSec = skill.cooldown || 3
          sb.cooldown = cdSec * 1000
          sb.cooldownMax = sb.cooldown
        }
      }
      // 计算施法者世界坐标（AOE 以施法位置为原点）
      const cpos = ctrl.getPos()
      const castDir = this.facingLeft ? -1 : 1   // 施法方向（X轴）
      if (aoed.aoeType === 'lineX') {
        // ★ 火球延迟发射：等攻击动画（1.0s）中后段（0.55s）才真正生成弹道，动作与飞出协调
        this._scheduleProjectile({
          delay: 0.55,
          spawn: () => {
            // 重新取施法者当前坐标（延迟后角色可能已微动）
            const c2 = this._getCurrentControlHero()
            const p2 = c2 ? c2.getPos() : cpos
            this._castFireballAoE(skill, { x: p2.x, y: p2.y }, this.facingLeft ? -1 : 1, mainHero)
          }
        })
      } else if (aoed.aoeType === 'iceWave') {
        this._castIceWaveAoE(skill, cpos, castDir, mainHero)
      } else if (aoed.aoeType === 'area') {
        this._castThunderAoE(skill, cpos, mainHero)
      }
      return
    }

    // ★ 普攻（无技能）：按角色类型区分
    //   - 近战（warrior 臻宝）：即时近战伤害（挥砍命中，不发射投射物）
    //   - 远程（mage 李小宝）：发射法杖冲击波投射物，且等抬手动作完成（0.5s）后才飞出
    if (!skill) {
      this.battleSystem.playerAttackCD = this.battleSystem.playerAttackInterval
      const isRanged = (mainHero.role === 'mage') || (mainHero.role === 'archer') || (mainHero.role === 'assassin')
      if (!isRanged) {
        // ── 近战普攻：目标在攻击距离内则即时结算伤害（延迟到挥砍命中帧） ──
        if (!monster) return   // 近战无目标只播动画
        // ★ 攻击位移（lunge）：让身体跟随挥砍动画前冲后回弹，解决"剑出去人不动"的僵硬感
        //   playerAnim 共 0.6s/8帧，第4帧(0.3s)为挥砍最猛瞬间；
        //   位移曲线用 sin(prog*PI)：0→0.5前冲、0.5→1回弹归位
        const lungeDir = sprite.facingLeft ? -1 : 1
        this.battleSystem._attackLunge = { dir: lungeDir, amount: 26 * this.dpr, last: 0 }
        // 预计算伤害 + 延迟命中（对齐第4帧挥砍最猛瞬间 = 0.3s 结算）
        const baseDmg = Math.max(1, this._getHeroAtk(mainHero) - Math.floor(monster.def * 0.5))
        const meleeCrit = Math.random() < (mainHero.crit || 0.05)
        const finalDmg = meleeCrit ? Math.floor(baseDmg * 1.5) : baseDmg
        if (!this.battleSystem.pendingDamages) this.battleSystem.pendingDamages = []
        this.battleSystem.pendingDamages.push({
          timer: 0.3,
          monster: monster,
          damage: finalDmg,
          heroName: mainHero.name,
          isCrit: meleeCrit
        })
        return
      }
      // ── 远程普攻：发射投射物，等释放动作完成才真正飞出 ──
      //   cast_universal.png 8帧，第6帧为释放点（法杖前指/发光）
      //   延迟按当前帧率动态计算（第6帧 = 6 × frameDuration），
      //   后期若动画倍率/攻速变化（frameDuration 改变），延迟自动跟随
      const frameDur = (this.frameDuration || 0.15)
      const cpos0 = ctrl.getPos()
      this._scheduleProjectile({
        delay: 6 * frameDur,  // ★ 第6帧释放点飞出，随帧率动态对齐
        spawn: () => {
          const c2 = this._getCurrentControlHero()
          const p2 = c2 ? c2.getPos() : cpos0
          const dir2 = this.facingLeft ? -1 : 1
          // 若目标仍存活且同方向则朝目标，否则沿朝向
          let td = dir2
          if (monster && monster.alive) {
            td = (monster.x >= p2.x) ? 1 : -1
          }
          if (!this.battleSystem.projectiles) this.battleSystem.projectiles = []
          const projSpeed = (320 * this.dpr)
          const range = (this.battleSystem.attackRange || 100) * this.dpr * 2   // 普攻射程（X轴）
          this.battleSystem.projectiles.push({
            // ★ getPos().y 为角色中心锚点，手部/法杖在中心略偏上(~15px)，避免从头部/脚部飞出
            x: p2.x + td * 24 * this.dpr,
            y: p2.y - 15 * this.dpr,
            vx: td * projSpeed,
            vy: 0,
            power: 1,
            atk: mainHero.atk || mainHero.matk || 0,
            def: mainHero.def || 0,
            life: range / projSpeed,
            maxLife: range / projSpeed,
            color: '#9acdff',
            owner: 'hero',
            skill: null,          // null = 普攻
            hero: mainHero,
            castDir: td,
            burn: null,
            isBasicAttack: true,  // ★ 标记普攻投射物（伤害用 _calcBasicAttackDamage）
            _hitSet: new Set(),
            _fx: this.game && this.game.effects
          })
        }
      })
      return
    }

    // 以下为有目标的技能逻辑
    // ★ 盾击特殊处理：即使没有锁定目标（monster 为空）也要释放——
    //   生成自身护盾 + 防御提升（防御向技能，自保时无需锁定怪物），并击退/眩晕前方敌人。
    //   无目标时只播动画 + 生成护盾/防御，不造成伤害（技能仍设 CD 防止连点）。
    if (!monster && !(skill && skill.id === 'shield_bash')) {
      if (skill && this.battleSystem.skillButtons) {
        const sb = this.battleSystem.skillButtons.find(b => b.skill === skill)
        if (sb) {
          const cdSec = skill.cooldown || 3
          sb.cooldown = cdSec * 1000
          sb.cooldownMax = sb.cooldown
        }
        mainHero.mp = Math.max(0, mainHero.mp - (skill.mpCost || 0))
      }
      return
    }

    // ★ 延迟伤害结算：动画播到命中帧时才造成伤害（而非动画开始就结算）
    // 命中时机：技能约50%
    const hitDelay = (skill ? 0.5 : 0.4) * (animState === 'shield' ? 0.8 : 1.0)  // 秒

    // 预计算伤害（但不立即应用）
    // ★ 盾击无锁定目标（monster 为 null）时伤害记为 0（只生成护盾/防御），避免访问 monster.def 报错
    let damage = 0
    const isShieldNoTarget = (skill && skill.id === 'shield_bash' && !monster)
    if (skill) {
      damage = isShieldNoTarget ? 0 : Math.max(1, this._getHeroAtk(mainHero) * (skill.power || 1.0) - Math.floor(monster.def * 0.5))
      mainHero.mp = Math.max(0, mainHero.mp - (skill.mpCost || 0))
    } else {
      damage = Math.max(1, this._getHeroAtk(mainHero) - Math.floor(monster.def * 0.5))
      this.battleSystem.playerAttackCD = this.battleSystem.playerAttackInterval
    }

    // 暴击判定
    const isCrit = Math.random() < (mainHero.crit || 0.05)
    if (isCrit) {
      damage = Math.floor(damage * 1.5)
    }

    // ★ 放入延迟伤害队列，动画命中帧时结算
    if (!this.battleSystem.pendingDamages) this.battleSystem.pendingDamages = []
    // ★ 特殊技能附加数据（吸血/治愈冲击回血、诅咒降攻、全体攻击）
    const isDrain = skill && (skill.effect === 'drain')
    const isHealStrike = skill && (skill.type === 'attack_heal')
    const healCasterPct = isDrain ? (skill.drainPercent || 1.0)
      : (isHealStrike ? (skill.healPercent || 0.3) : 0)
    const debuff = (skill && skill.type === 'debuff')
      ? { type: 'atk_down', value: (skill.value || 0.3), duration: (skill.turns || 3) }
      : null
    const allTarget = !!(skill && skill.target === 'all')
    this.battleSystem.pendingDamages.push({
      monster: monster,
      damage: damage,
      isCrit: isCrit,
      timer: hitDelay,        // 倒计时（秒）
      heroName: mainHero.name,
      hero: mainHero,         // 盾击需引用释放者生成护盾/防御提升
      skill: skill,            // 盾击需读取技能配置（护盾/防御/眩晕/击退参数）
      shieldBash: skill && skill.id === 'shield_bash',  // 盾击附加效果标记
      healCasterPct: healCasterPct,  // 吸血/治愈冲击：按伤害比例回血
      debuff: debuff,                // 诅咒：降攻 debuff
      allTarget: allTarget,          // 暗星爆发：对全体怪物结算
    })

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
  // 5.1 剑气风暴（斩击大招）：前摇蓄力 → 吸附 → 5次突刺 → 剑气收尾
  // ==========================================================================
  proto._castBladeStorm = function(skill, ctrl) {
    const sys = this.battleSystem
    // ★ 用玩家真实朝向（this.facingLeft 由摇杆实时更新），避免 sprite.facingLeft 过期
    //   导致吸附/攻击方向反向（怪物被拉到身后）
    const dir = this.facingLeft ? -1 : 1
    // 同步主角精灵朝向，保证出剑姿态与吸附方向一致
    const ms = this.mainCharacterSprite
    if (ms) ms.facingLeft = this.facingLeft
    const mainHero = ctrl.hero

    // ★★ MP 检查与扣除（剑气风暴是消耗型大招，必须扣蓝）
    if ((skill.mpCost || 0) > 0 && (mainHero.mp || 0) < (skill.mpCost || 0)) {
      if (this.game && this.game.showToast) this.game.showToast('MP不足')
      if (typeof this._triggerMpShake === 'function') this._triggerMpShake(ctrl)
      return
    }
    if ((skill.mpCost || 0) > 0) {
      mainHero.mp = Math.max(0, mainHero.mp - (skill.mpCost || 0))
    }
    // ★ 设置技能按钮冷却（蓝量扣了，冷却也要算）
    if (this.battleSystem.skillButtons) {
      const sb = this.battleSystem.skillButtons.find(b => b.skill === skill)
      if (sb) {
        const cdSec = skill.cooldown || 8
        sb.cooldown = cdSec * 1000
        sb.cooldownMax = sb.cooldownMax || sb.cooldown
      }
    }

    // ★ 锁 Y 轴（整个技能期间：蓄力1s + 突刺 + 收尾）
    const dashTotal = (skill.combo || 5) * 0.18
    const finishTotal = 0.5
    const total = 1.0 + dashTotal + finishTotal
    sys.castAxisLockTimer = Math.max(sys.castAxisLockTimer, total)

    // ★ 进入攻击渲染态（主角由 CharacterSprite 渲染，zhenbao 的 attack 状态会映射到
    //   HERO_ZHENBAO_ATTACK_XX 帧；下面每帧直接控制 animFrame 指定具体帧 02/03/07）
    //   注意：ctrl.hero 是 party[0] 数据对象，没有 .sprite 字段；主角 sprite 直接用
    //   this.mainCharacterSprite（FieldScene 实例上即为主角精灵）。
    const mainSprite = this.mainCharacterSprite
    if (mainSprite) {
      mainSprite.state = 'attack'
      mainSprite.animTimer = 0
      mainSprite.animFrame = 1   // 0-based：第 1 帧 = attack_02.png
    }

    // 记录蓄力范围内（世界坐标）的存活怪物，供吸附
    const pos = ctrl.getPos()
    const pullRange = (skill.pullRange || 220) * this.dpr
    const pulled = []
    for (const m of (this.mapMonsters || [])) {
      if (!m.alive) continue
      if (Math.hypot(m.x - pos.x, m.y - pos.y) <= pullRange) pulled.push(m)
    }

    sys.playerAnim = {
      type: 'blade_storm',
      phase: 'charge',          // charge → dash → finish
      chargeMax: 1.0,
      chargeTimer: 1.0,         // 前摇蓄力 1 秒
      dashMax: 0.18,            // 单次突刺时长（放慢，看得清 02/03 反复）
      dashTimer: 0,
      dashT: 0,                 // 当前突刺步内进度 0~1
      dashStep: 0,
      combo: skill.combo || 5,
      finishMax: 0.5,           // 收尾阶段（03→07）时长，确保两帧都清晰停留
      finishTimer: 0,
      skill: skill,
      dir: dir,
      pulled: pulled,
      frame: 2,                 // ★ 蓄力用 02 帧
      maxTimer: total,
      timer: total,             // 总时长兜底
      facing: Math.atan2(0, dir),
      _dashHitPending: true
    }

    // 赛亚人式蓄力粒子初喷
    this._spawnBuffParticles(ctrl.hero, '#FFD700', 24)
  }

  // ★ 每帧推进剑气风暴状态机
  proto._updateBladeStorm = function(pa, dt) {
    const ctrl = this._getCurrentControlHero()
    if (!ctrl) return
    const cpos = ctrl.getPos()
    const dir = pa.dir
    const dpr = this.dpr

    // ★ 吸附：被锁定怪物拉向玩家正前方（pullDist），Y 轴对齐玩家
    const tx = cpos.x + dir * (pa.skill.pullDist || 70) * dpr
    const ty = cpos.y
    for (const m of pa.pulled) {
      if (!m.alive) continue
      const k = Math.min(1, dt * 8)
      m.x += (tx - m.x) * k
      m.y += (ty - m.y) * k
    }

    if (pa.phase === 'charge') {
      // 蓄力阶段：赛亚人金色光环持续喷发 + 02 帧
      this._spawnBuffAuraParticles(ctrl.hero, '#FFD700')
      this._bladeStormSetFrame(ctrl, 2, pa)   // ★ attack_02.png
      pa.chargeTimer -= dt
      if (pa.chargeTimer <= 0) {
        pa.phase = 'dash'
        pa.dashTimer = pa.dashMax
        pa.dashT = 0
        pa.dashStep = 0
        pa._dashHitPending = true
      }
    } else if (pa.phase === 'dash') {
      pa.dashTimer -= dt
      pa.dashT = Math.min(1, Math.max(0, 1 - pa.dashTimer / pa.dashMax))  // 当前突刺步内进度
      // ★ 02/03 帧反复播放（奇数步用03更显"反手"，偶数步用02），原地出剑不位移
      this._bladeStormSetFrame(ctrl, (pa.dashStep % 2 === 0) ? 2 : 3, pa)
      // 突刺最前端（dashT≈0.5）结算一次伤害（X 轴正前方所有敌人）
      if (pa._dashHitPending && pa.dashT >= 0.45) {
        this._bladeStormHit(ctrl, dir, pa.skill)
        pa._dashHitPending = false
      }
      if (pa.dashTimer <= 0) {
        pa.dashStep++
        if (pa.dashStep >= pa.combo) {
          pa.phase = 'finish'
          pa.finishTimer = pa.finishMax   // 收尾阶段（03 → 07）
          this._bladeStormSetFrame(ctrl, 3, pa)   // ★ 收尾起手用 03 帧
        } else {
          pa.dashTimer = pa.dashMax
          pa.dashT = 0
          pa._dashHitPending = true
        }
      }
    } else if (pa.phase === 'finish') {
      pa.finishTimer -= dt
      // ★ 03 帧 → 07 帧（收尾挥砍），两帧都清晰停留，最后才发剑气
      this._bladeStormSetFrame(ctrl, pa.finishTimer > pa.finishMax * 0.5 ? 3 : 7, pa)
      if (pa.finishTimer <= 0) {
        // ★ 向前方发送剑气投射物（X 轴伤害）—— 必须在 03/07 收尾播放完之后
        this._spawnBladeStormProjectile(ctrl, dir, pa.skill)
        this.battleSystem.playerAnim = null
        // ★ 动画结束恢复 idle
        const sp = this.mainCharacterSprite
        if (sp) { sp.state = 'idle'; sp.animFrame = 0; sp.animTimer = 0 }
      }
    }
  }

  // ★ 直接指定主角当前显示的攻击帧（1-based 帧号，如 2=attack_02）
  //   zhenbao 在 attack 状态下映射到 HERO_ZHENBAO_ATTACK_XX；
  //   每帧把 animTimer 归零以冻结 CharacterSprite 的自动推进，确保精确停在指定帧。
  proto._bladeStormSetFrame = function(ctrl, frameNum, pa) {
    pa.frame = frameNum
    const sp = this.mainCharacterSprite
    if (sp) {
      sp.animFrame = frameNum - 1   // 0-based
      sp.animTimer = 0
    }
  }

  // ★ 统一对怪物造成伤害：所有怪物扣血必须走此方法，并在此处聚焦目标面板
  //   （确保玩家手动攻击 / AI 队友攻击 / 技能 / 持续伤害 都让面板跟随当前交战的怪，
  //    解决"面板只随玩家手动锁定才更新、AI 输出时血条跳变无扣血效果"的问题）
  proto._damageMonster = function(m, dmg) {
    if (!m) return 0
    // ★ 隐身无敌（暗影突袭）：隐身期间完全免疫，不掉血、不被打断、不锁目标
    if (m._invisible) {
      if (this.battleSystem && this.battleSystem.damageTexts) {
        this.battleSystem.damageTexts.push({
          text: '无敌',
          x: m.x - this.cameraX,
          y: m.y - this.cameraY - 50 * this.dpr,
          color: '#9fd8ff',
          life: 0.8, maxLife: 0.8,
          _startY: m.y - this.cameraY - 50 * this.dpr
        })
      }
      return 0
    }
    const real = Math.max(1, Math.floor(dmg) || 0)
    // ★ 扣血前记录"受伤前血量"：供目标面板 DNF 式残影效果使用
    //   面板读取 m._preDamageHp 作为 lag（滞留层）的起始值，
    //   这样无论渲染帧和伤害帧之间隔了多少次命中，lag 都从"上一次受伤前的 hp"开始追
    m._preDamageHp = (typeof m.hp === 'number') ? m.hp : m._preDamageHp
    m.hp = Math.max(0, m.hp - real)
    // ★ 非霸体施法被打断：怪物正在放非霸体技能时受到 HP 伤害，技能放不出来
    this._interruptCastingForMonster(m)
    // ★ 记录"最近受伤的怪"：无论致死与否都记录，
    //   面板据此稳定锁定正在交战的怪，并能把残影追赶到 0（致死也显示完整扣血过程）
    this.battleSystem._lastDamagedMonster = m
    if (m.alive && m.hp > 0) {
      this.battleSystem.battleTarget = m
    }
    return real
  }

  // ★ 怪物施法被打断：当前正在释放技能且非霸体（superArmor）时，清除施法状态
  //   使技能放不出来（动画中止、伤害不再结算）。霸体技能（BOSS 大招等）不受影响。
  proto._interruptCastingForMonster = function(m) {
    if (!m || !m.isCastingSkill) return
    // 查当前释放技能的霸体标记
    const sk = (m.skills && m.skillCastId)
      ? m.skills.find(s => s.id === m.skillCastId)
      : null
    if (sk && sk.superArmor) return  // 霸体：不被打断
    // ★ 打断：清除所有施法状态，恢复可行动
    m.isCastingSkill = false
    m.skillCastId = null
    m.skillAnimTimer = 0
    m.isMoving = false
    m.animFrame = 0
    m.hasDealtDamage = false
    // 受击表现：轻微位移抖动由渲染层处理，这里仅中断施法
    console.log(`[FieldBattle] 怪物 ${m.name} 施法被打断（非霸体）`)
  }

  // ★ 我方英雄施法【不再】因受击被打断。
  //   原逻辑会在盟友(非霸体)被怪物击中时清空其施法/普攻状态，导致 AI 队友频繁空放技能、
  //   手感极差（"非霸体技能可以被攻击打断"）。现在：英雄侧施法完全免疫受击中断，
  //   霸体/非霸体都照常把技能放完。怪物侧的中断仍保留（_interruptCastingForMonster），
  //   玩家可借走位卡掉怪物非霸体大招。被控英雄的硬直/眩晕由专门的 _stunned 机制处理，与此无关。
  proto._interruptCastingForHero = function(hero) {
    return
  }

  // ★ 单次突刺伤害：玩家正前方 X 轴（吸附来的 + 范围内）所有敌人各造成 1 次
  proto._bladeStormHit = function(ctrl, dir, skill) {
    const cpos = ctrl.getPos()
    const dpr = this.dpr
    const reach = 160 * dpr          // 突刺命中前方距离
    const yTol = 70 * dpr            // Y 轴容差
    const power = skill.power || 0.85
    for (const m of (this.mapMonsters || [])) {
      if (!m.alive) continue
      const dx = (m.x - cpos.x) * dir   // 前方为正
      const dy = Math.abs(m.y - cpos.y)
      if (dx >= -20 * dpr && dx <= reach && dy <= yTol) {
        const dmg = Math.max(1, Math.floor(this._getHeroAtk(ctrl.hero) * power - Math.floor(m.def * 0.5)))
        const isCrit = Math.random() < (ctrl.hero.crit || 0.05)
        const finalDmg = isCrit ? Math.floor(dmg * 1.5) : dmg
        this._damageMonster(m, finalDmg)
        this._pushDamageText(m, finalDmg, isCrit, '#fff0a0')
        if (m.hp <= 0) { m.alive = false; this.battleSystem.battleTarget = null }
      }
    }
  }

  // ★ 剑气投射物（X 轴直线，前方所有敌人受击）
  proto._spawnBladeStormProjectile = function(ctrl, dir, skill) {
    const cpos = ctrl.getPos()
    const dpr = this.dpr
    const proj = skill.projectile || {}
    const speed = (proj.speed || 620)
    const width = (proj.width || 110) * dpr      // 月牙视觉长度
    const height = (proj.height || 70) * dpr      // 月牙视觉高度
    const hitW = (proj.hitW || 130) * dpr         // 命中矩形宽
    const hitH = (proj.hitH || 90) * dpr          // 命中矩形高
    const power = proj.power || 1.6
    // 发射点：玩家身体中部（中心略偏下）
    const sx = cpos.x + dir * 20 * dpr
    const sy = cpos.y - 25 * dpr
    if (!this.battleSystem.projectiles) this.battleSystem.projectiles = []
    this.battleSystem.projectiles.push({
      x: sx,
      y: sy,
      vx: dir * speed,
      vy: 0,
      life: proj.duration || 1.1,
      age: 0,
      owner: 'hero',
      fromMonster: false,
      isBasicAttack: false,
      hero: ctrl.hero,
      skill: skill,
      bladeStorm: true,
      width: width,        // 月牙视觉长度（X轴）
      height: height,      // 月牙视觉高度（Y轴弯度）
      hitW: hitW,          // 命中矩形宽
      hitH: hitH,          // 命中矩形高
      power: power,
      _hitSet: new Set(),
      _born: false,
      _fx: this.game && this.game.effects
    })
  }

  // ==========================================================================
  // 5.5 队友 AI 自动战斗
  // ==========================================================================
  proto._updateAllyAI = function(dt) {
    const heroes = this.battleSystem.battleHeroes
    if (!heroes || !heroes.length) return
    const curIdx = this.battleSystem.currentControlIndex % heroes.length

    for (let i = 0; i < heroes.length; i++) {
      if (i === curIdx) continue  // 当前被控制的英雄由玩家操作，不走 AI
      const bh = heroes[i]
      // ★ alive 字段可能未初始化(undefined)，undefined 应视为存活，不能用 !bh.hero.alive（会把 undefined 判成"死亡"而永久跳过）
      if (!bh.hero || bh.hero.alive === false || bh.hero.hp <= 0) continue
      const pos = bh.getPos()
      const sprite = bh.sprite
      if (!sprite) continue

      // ★ 用独立计时器管理 AI 攻击状态（不再依赖 CharacterSprite.onAnimationComplete，避免回调未触发导致 state 永久卡在 attack）
      if (bh.hero._aiAttacking) {
        bh.hero._aiAttackTimer -= dt
        if (bh.hero._aiAttackTimer <= 0) {
          bh.hero._aiAttacking = false
          sprite.state = 'idle'
          sprite.animFrame = 0
        }
        continue  // 攻击动画播放期间不再触发新攻击
      }

      // ★ AI 技能冷却倒计时（双保险：字典 _aiSkillsCD + 统一累加锁 _aiSkillLock）
      if (!bh.hero._aiSkillsCD) bh.hero._aiSkillsCD = {}
      for (const sid in bh.hero._aiSkillsCD) {
        if (bh.hero._aiSkillsCD[sid] > 0) bh.hero._aiSkillsCD[sid] -= dt
      }
      if (!bh.hero._aiSkillLock) bh.hero._aiSkillLock = 0
      if (bh.hero._aiSkillLock > 0) bh.hero._aiSkillLock -= dt

      // ★ AI 独立施法锁定计时（与被控角色的 castAxisLockTimer/castLockTimer 语义一致，
      //   但每个 AI 英雄独立存储，避免 AI 与被控角色、AI 与 AI 互相干扰）：
      //   _castAxisLock：普攻/伤害技能期间限制 Y 轴（只能 X 轴移动）
      //   _castLock：BUFF 释放期间完全锁移动
      //   ★ 对齐被控角色：被控角色的 castAxisLockTimer 是跟随 playerAnim.timer
      //     （普攻动画播放期间持续维持）的，AI 在此同样跟随 _aiAttackTimer 持续维持，
      //     而不是只在触发那一帧设一次——否则动画播完但还在走位时 _castAxisLock 已减为 0，
      //     就会恢复 Y 轴移动（表现为"普攻还能 Y 轴移动"）。
      //   ★ 普攻/伤害技能动画播放期间（_aiAttackTimer > 0）强制持续锁 Y 轴
      if (bh.hero._aiAttackTimer && bh.hero._aiAttackTimer > 0) {
        bh.hero._castAxisLock = Math.max(bh.hero._castAxisLock || 0, 8 * this.frameDuration)
      } else if (bh.hero._castAxisLock > 0) {
        bh.hero._castAxisLock = Math.max(0, bh.hero._castAxisLock - dt)
      }
      if (bh.hero._castLock > 0) bh.hero._castLock = Math.max(0, bh.hero._castLock - dt)

      // ★ AI 英雄 MP 回复（与正规战斗一致，避免只减不增导致技能很快哑火）
      const regenRate = bh.hero.mpRegen || 5
      if ((bh.hero.maxMp || 0) > 0 && (bh.hero.mp || 0) < bh.hero.maxMp) {
        bh.hero.mp = Math.min(bh.hero.maxMp, (bh.hero.mp || 0) + regenRate * dt * 0.5)
      }

      // ★ 移动（仅对非 followers 的人类英雄；cats 由 field-scene 的 _updateFollowers 驱动，避免双重移动）
      //   解决"切换控制后召回/解散对原主角(人类英雄)失效"：人类英雄不在 this.followers 里，
      //   原 _updateAllyAI 只管攻击、不管移动 → 切换后原主角原地不动、也不响应召回/解散。
      //   aiRecall=true → 聚拢到被控角色；false(解散) → 自行靠近最近怪物。
      const isFollowerHero = bh.followerRef && this.followers && this.followers.indexOf(bh.followerRef) !== -1
      if (!isFollowerHero) {
        const apos = bh.getPos()
        if (apos) {
          let mt = null
          if (this.aiRecall) {
            const ctrl = this._getCurrentControlHero && this._getCurrentControlHero()
            if (ctrl) { const cp = ctrl.getPos(); if (cp) mt = { x: cp.x, y: cp.y } }
          } else {
            // ★ 解散(aiRecall=false)：盟友自行寻怪，使用全图搜索（与 cats 的 _getAllyCombatTarget「全图寻怪」一致），
            //   否则搜索半径太小会找不到较远的怪、表现为"解散后原地不动"。大半径保证盟友能走到最近怪物处开打。
            const nm = this._findNearestMonsterFromPos(1500 * this.dpr, 'xy', apos.x, apos.y, 400 * this.dpr)
            if (nm) mt = { x: nm.x, y: nm.y }
          }
          if (mt) {
            const mdx = mt.x - apos.x, mdy = mt.y - apos.y
            const md = Math.hypot(mdx, mdy)
            const arrive = (this.battleSystem.attackRange || 100) * this.dpr * 0.7
            if (md > arrive) {
              const sp = (this.playerSpeed || 200) * 0.95
              apos.x += (mdx / md) * sp * dt
              apos.y += (mdy / md) * sp * dt
              if (bh.sprite) { bh.sprite.facingLeft = mdx < 0; bh.sprite.isMoving = true }
            } else if (bh.sprite) {
              bh.sprite.isMoving = false
            }
          } else if (bh.sprite) {
            bh.sprite.isMoving = false
          }
        }
      }

      // ★ 队友搜索范围：近战用真实短手（attackRange*1.05），远程用放大搜索半径（*1.8）
      //   修复：原逻辑只用 X 轴距离 + 220*dpr 的 Y 容差，导致"不同 X 轴隔空就能打到怪物"。
      const baseRange = (this.battleSystem.attackRange || 100) * this.dpr
      const isRangedRole = (bh.hero.role === 'mage' || bh.hero.role === 'healer')
      // ★ 近战：真实欧氏距离短手，避免隔轴打怪；远程：允许更大搜索半径锁定远处怪
      const range = isRangedRole ? (baseRange * 1.8) : (baseRange * 1.05)
      // ★ Y 轴容差收紧到角色身高量级（约 60*dpr），杜绝上下错位太远还能攻击
      const allyYTol = isRangedRole ? (120 * this.dpr) : (60 * this.dpr)

      // ★ 优先集火玩家锁定的目标（battleTarget）：让队友与玩家打同一只怪，
      //   使队友施加的灼烧/冰冻/感电等状态都汇聚到面板显示的怪身上
      let monster = null
      const bt = this.battleSystem.battleTarget
      const _reachable = (m) => {
        if (!m || !m.alive) return false
        const ddx = m.x - pos.x
        const ddy = m.y - pos.y
        // ★ 近战用真实欧氏距离；远程仅放宽为 1.8 倍半径（仍看 Y 轴）
        return Math.sqrt(ddx * ddx + ddy * ddy) <= range && Math.abs(ddy) <= allyYTol
      }
      if (bt && _reachable(bt)) {
        monster = bt
      } else {
        // ★ 用欧氏距离选怪（axis='xy'），近战不再退化成"只看 X 轴"
        monster = this._findNearestMonsterFromPos(range, 'xy', pos.x, pos.y, allyYTol)
      }
      if (!monster) continue

      // ★ 先尝试释放技能（CD 好 + MP 够 + 统一锁空闲），成功则跳过普攻
      const castDir = (sprite.facingLeft) ? -1 : 1
      const castSkill = this._allyTryCastSkill(bh, monster, castDir)
      if (castSkill) continue

      // 普攻冷却控制（避免每帧触发）
      if (!bh.hero._aiAttackCD) bh.hero._aiAttackCD = 0
      bh.hero._aiAttackCD -= dt * 1000
      if (bh.hero._aiAttackCD > 0) continue

      // ★ 触发该队友攻击动画 + 延迟伤害
      sprite.state = 'attack'
      sprite.animFrame = 0
      sprite.animTimer = 0
      sprite.facingLeft = (monster.x < pos.x)
      bh.hero._aiAttacking = true
      // ★ cast_universal.png 精灵表 8 帧（每帧≈0.15s），攻击动画时长设为 0.8s 让施法动作播放约 5 帧更完整
      bh.hero._aiAttackTimer = 0.8  // 攻击动画持续 0.8 秒后自动恢复
      // ★ 与被控角色一致：普攻/伤害技能施法期间限制 Y 轴（只能 X 轴移动）
      bh.hero._castAxisLock = 8 * this.frameDuration

      // 预计算伤害并入延迟队列
      const hero = bh.hero
      const damage = Math.max(1, this._getHeroAtk(hero) - Math.floor(monster.def * 0.5))
      const isCrit = Math.random() < (hero.crit || 0.05)
      const finalDmg = isCrit ? Math.floor(damage * 1.5) : damage

      // ★ 远程角色（mage/healer）普攻发射投射物，与玩家手动操作一致；近战走延迟伤害
      const isRanged = (hero.role === 'mage' || hero.role === 'healer')
      if (isRanged) {
        if (!this.battleSystem.projectiles) this.battleSystem.projectiles = []
        const projSpeed = 320 * this.dpr
        const range = (this.battleSystem.attackRange || 100) * this.dpr * 2
        this.battleSystem.projectiles.push({
          x: pos.x + castDir * 24 * this.dpr,
          y: pos.y - 15 * this.dpr,
          vx: castDir * projSpeed,
          vy: 0,
          power: 1,
          atk: hero.atk || hero.matk || 0,
          def: hero.def || 0,
          life: range / projSpeed,
          maxLife: range / projSpeed,
          color: '#9acdff',
          owner: 'hero',
          skill: null,
          hero: hero,
          castDir: castDir,
          burn: null,
          isBasicAttack: true,
          _hitSet: new Set(),
          _fx: this.game && this.game.effects
        })
      } else {
        this.battleSystem.pendingDamages.push({
          monster: monster,
          damage: finalDmg,
          isCrit: isCrit,
          timer: 0.4,
          heroName: hero.name
        })
      }
      bh.hero._aiAttackCD = this.battleSystem.playerAttackInterval
      console.log(`[FieldBattle] ${hero.name}（AI）普攻 ${monster.name}${isRanged ? '（投射物）' : ''}，伤害 ${finalDmg}`)
    }
  }

  // ==========================================================================
  // 5.5b ★ AI 技能释放（轮转选技能 + 冷却/MP/统一锁控制）
  // ==========================================================================

  /**
   * ★ AI 尝试释放一个技能。
   * 逻辑：收集所有"当前可用"的技能（CD 好 + MP 够），按攻击技能与 BUFF 统一轮转选取，
   *       保证多个技能（含 BUFF）都会被释放，而不是永远只放排第一的火球。
   *       与被控角色行为一致：普攻/伤害技能设 X 轴锁定，BUFF 设移动锁定。
   * @returns {boolean} 是否成功释放了技能
   */
  proto._allyTryCastSkill = function(bh, monster, castDir) {
    const hero = bh.hero
    if (!hero || !hero.skills || !hero.skills.length) return false
    const inBattle = this.battleSystem.active
    if (!inBattle) return false

    // 第一遍：收集所有"当前可用"的技能（含 BUFF）
    const available = []
    for (const skill of hero.skills) {
      const isRealSkill = (skill.mpCost && skill.mpCost > 0) || skill.cooldown || skill.aoe || skill.type === 'magic' || skill.type === 'blade_storm' || skill.type === 'buff' || skill.type === 'heal'
      if (!isRealSkill) continue
      const cdLeft = (hero._aiSkillsCD && hero._aiSkillsCD[skill.id]) || 0
      if (cdLeft > 0) continue
      if ((hero._aiSkillLock || 0) > 0) continue
      if ((hero.mp || 0) < (skill.mpCost || 0)) continue
      available.push(skill)
    }
    if (available.length === 0) return false

    // =======================================================================
    // ★ 智能决策：条件优先级（替代原盲目轮转），解决"有护盾/治疗技能不放"
    //   优先级：① 紧急治疗/护盾(自身或队友低血) → ② 主角正挨打且有防御buff →
    //           ③ 多怪AOE → ④ 轮转攻击技能
    // =======================================================================
    const nowSec = Date.now() / 1000
    const aliveHeroes = (this.battleSystem.battleHeroes || [])
      .map(b => b.hero).filter(h => h && h.hp > 0)
    const hpRatio = (h) => (h.maxHp ? (h.hp / h.maxHp) : 1)
    const lowestRatio = aliveHeroes.length
      ? Math.min(...aliveHeroes.map(hpRatio)) : 1
    // 自身血量比例（★ 关键：AI 队友自己被打个半死也要放保命技，不能只看全队最低）
    const selfRatio = hpRatio(hero)
    const selfUnderAttack = hero._lastHitTime &&
      (nowSec - hero._lastHitTime) <= 2.5
    // 当前被控角色是否正在挨打：最近 2.5 秒内受过击（用真正的被控英雄，而非写死的 index 0）
    const ctrlObj = this._getCurrentControlHero ? this._getCurrentControlHero() : null
    const ctrlHero = ctrlObj ? ctrlObj.hero : null
    const ctrlUnderAttack = ctrlHero && ctrlHero._lastHitTime &&
      (nowSec - ctrlHero._lastHitTime) <= 2.5
    // 全图存活怪物数（判断是否多怪，放 AOE）
    const aliveMonsters = (this.mapMonsters || []).filter(m => m.alive)
    const monsterCount = aliveMonsters.length

    // ★ 重写分类：区分 治疗/防御buff/进攻buff/AOE/攻击，并把野外【未实现】的
    //   buff（taunt/counter/guard/gold_up 等）单独归为 'noop'，AI 永不选用，避免空转浪费 CD。
    //   已实现的 buff 仅 4 种：def_up / def_up_self / atk_up / atk_up_self。
    const classify = (s) => {
      if (s.type === 'heal' || s.effect === 'heal') return 'heal'
      if (s.effect === 'def_up' || s.effect === 'def_up_self') return 'def'
      if (s.effect === 'atk_up' || s.effect === 'atk_up_self') return 'atk'
      if (s.effect === 'taunt') return 'taunt'        // 挑衅：坦克拉怪
      if (s.effect === 'guard') return 'guard'        // 守护：替队友承伤
      if (s.effect === 'counter') return 'counter'    // 反击：受击反弹
      if (s.effect === 'gold_up') return 'gold'        // 财运：额外金币
      if (s.aoe || (s.range && s.range >= 150)) return 'aoe'
      return 'attack'
    }
    const classifyList = (type) => available.filter(s => classify(s) === type)
    const healSkills = classifyList('heal')
    const defBuffs   = classifyList('def')
    const atkBuffs   = classifyList('atk')
    const aoeSkills  = classifyList('aoe')
    const atkSkills  = classifyList('attack')
    const tauntBuffs = classifyList('taunt')
    const guardBuffs = classifyList('guard')
    const counterBuffs = classifyList('counter')
    const goldBuffs  = classifyList('gold')
    // 可用技能（所有已实现的类型，含挑衅/守护/反击/财运）
    const usable = available
    // 该类型 buff 是否仍在生效（剩余 > 1s 视为生效，避免刚过期就重开浪费 CD）
    const buffActive = (kind) => !!(hero._buffs && hero._buffs.some(b => b._active && b._remaining > 1 &&
      ((kind === 'def' && (b.type === 'def_up' || b.type === 'def_up_self')) ||
       (kind === 'atk' && (b.type === 'atk_up' || b.type === 'atk_up_self')))))
    // 通用：指定 buff 类型是否仍在生效（剩余 > 1s）
    const buffTypeActive = (type) => !!(hero._buffs && hero._buffs.some(b => b._active && b._remaining > 1 && b.type === type))
    // 取一个【未生效】的防御 buff，否则退化为任意一个（保证能开）
    const pickDef = () => (defBuffs.find(b => !buffActive('def')) || defBuffs[0] || null)

    let skill = null

    // ① 紧急保命：自身 < 45% 或 全队最低 < 40% → 优先治疗 / 防御buff
    if (!skill && (selfRatio < 0.45 || lowestRatio < 0.40)) {
      skill = healSkills[0] || pickDef()
    }
    // ② 受击即减伤：自身或主角正挨打（2.5s 内）→ 优先放【防御类】buff（非挑衅/进攻类）
    if (!skill && (selfUnderAttack || ctrlUnderAttack)) {
      skill = pickDef()
    }
    // ③ 治疗职业主动预判奶：全队最低 < 72% 就奶（不等地狱模式才救）
    if (!skill && healSkills.length && lowestRatio < 0.72) {
      skill = healSkills[0]
    }
    // ④ 防御buff：接敌即主动开（脆皮法师/治疗，或全队已有人受伤），不再等挨打
    if (!skill && defBuffs.length && !buffActive('def') && monsterCount > 0) {
      const squishy = (hero.role === 'mage' || hero.role === 'healer')
      const someoneHurt = lowestRatio < 0.95
      if (squishy || someoneHurt) skill = defBuffs[0]
    }
    // ⑤ 进攻buff：安全时主动开（战吼/狂暴），提升团队输出（未生效才开）
    if (!skill && atkBuffs.length && !buffActive('atk')) {
      const safe = !selfUnderAttack && !ctrlUnderAttack && lowestRatio > 0.6
      if (safe) skill = atkBuffs[0]
    }
    // ⑤-1 守护(guard)：有队友受伤/受击 → 坦克替队友承伤（未生效才开）
    if (!skill && guardBuffs.length && !buffTypeActive('guard') &&
        (selfUnderAttack || ctrlUnderAttack || lowestRatio < 0.6)) {
      skill = guardBuffs[0]
    }
    // ⑤-2 挑衅(taunt)：坦克主动拉怪（敌人≥1 且未生效），保护脆皮队友
    if (!skill && tauntBuffs.length && !buffTypeActive('taunt') && monsterCount > 0) {
      skill = tauntBuffs[0]
    }
    // ⑤-3 反击(counter)：坦克受击或安全时开（攻防一体，未生效才开）
    if (!skill && counterBuffs.length && !buffTypeActive('counter') &&
        (selfUnderAttack || lowestRatio > 0.5)) {
      skill = counterBuffs[0]
    }
    // ⑤-4 财运(gold_up)：经济技能，安全时（血量健康、无受击）主动开，叠战斗金币
    if (!skill && goldBuffs.length && !buffTypeActive('gold_up') && lowestRatio > 0.6) {
      skill = goldBuffs[0]
    }
    // ⑥ 多怪（≥2 只）且有 AOE → 清场（阈值由 3 降到 2）
    if (!skill && monsterCount >= 2) {
      skill = aoeSkills[0] || null
    }
    // ⑦ 否则：轮转攻击技能（仅从可用技能中选，避免空转未实现的 buff）
    if (!skill) {
      const pool = atkSkills.length ? atkSkills : usable
      if (pool.length === 0) return false   // 没有任何可用技能（只剩未实现buff），不浪费MP
      if (hero._aiLastSkillIdx === undefined) hero._aiLastSkillIdx = -1
      const pickIdx = (hero._aiLastSkillIdx + 1) % pool.length
      skill = pool[pickIdx]
      hero._aiLastSkillIdx = pickIdx
    } else {
      // 命中条件优先级分支时，也推进轮转游标，避免下次仍在同技能
      const idx = available.indexOf(skill)
      if (idx >= 0) hero._aiLastSkillIdx = idx
    }

    // 释放技能：扣 MP、设冷却 + 统一锁
    const cpos = bh.getPos()
    hero.mp = Math.max(0, (hero.mp || 0) - (skill.mpCost || 0))
    if (!hero._aiSkillsCD) hero._aiSkillsCD = {}
    const defaultCD = (skill.type === 'blade_storm') ? 4
      : (skill.aoe || skill.type === 'magic') ? 5
      : (skill.effect === 'stun' || skill.type === 'attack') ? 2.5
      : (skill.type === 'buff' || skill.type === 'heal') ? (skill.cooldown || 3)
      : 2
    hero._aiSkillsCD[skill.id] = skill.cooldown || defaultCD
    hero._aiSkillLock = skill.cooldown || defaultCD

    // 播放对应动画状态（盾击→shield，buff→buff，其他→skill）
    const sprite = bh.sprite
    if (sprite) {
      let animState = 'attack'
      if (skill.effect === 'stun' || skill.type === 'attack') animState = 'shield'
      else if (skill.type === 'buff' || skill.type === 'heal') animState = 'buff'
      else if (skill.type === 'magic' || skill.type === 'blade_storm' || skill.aoe) animState = 'skill'
      sprite.state = animState
      sprite.animFrame = 0
      sprite.animTimer = 0
    }
    hero._aiAttacking = true
    hero._aiCastingSkill = skill  // ★ 记录正在释放的技能，供"被打断"时查霸体标记
    hero._aiAttackTimer = 0.8

    // ★ BUFF / 治疗类：与被控角色一致，释放期间完全锁定移动
    if (skill.type === 'buff' || skill.type === 'heal') {
      hero._castLock = 0.8  // 施法锁定（不能移动），对齐被控角色 castLockTimer=0.8
      // ★ 应用 buff 效果（def_up / def_up_self / heal 等），复用被控角色同一入口
      this._applyHeroBuff(skill, hero)
      // ★ 刷新角色卡，立即显示 BUFF 状态
      if (typeof this._refreshCharCard === 'function') {
        this._refreshCharCard(hero)
      }
      console.log(`[FieldBattle] ${hero.name}（AI）释放 BUFF ${skill.name}`)
      return true
    }

    // 分派
    if (skill.type === 'blade_storm') {
      this._allyCastBladeStorm(bh, monster, skill)
    } else if (skill.aoe) {
      if (skill.aoe.aoeType === 'lineX') {
        this._castFireballAoE(skill, cpos, castDir, hero)
      } else if (skill.aoe.aoeType === 'circle') {
        this._castIceWaveAoE(skill, cpos, castDir, hero)
      } else if (skill.aoe.aoeType === 'thunder') {
        this._castThunderAoE(skill, cpos, hero)
      } else {
        this._castFireballAoE(skill, cpos, castDir, hero)
      }
    } else if (skill.type === 'magic') {
      if (!this.battleSystem.projectiles) this.battleSystem.projectiles = []
      const cfg = skill.projectile || {}
      const speed = (cfg.speed || 320) * this.dpr
      const projRange = (cfg.range || 200) * this.dpr
      this.battleSystem.projectiles.push({
        x: cpos.x + castDir * 20 * this.dpr,
        y: cpos.y - 15 * this.dpr,
        vx: castDir * speed,
        vy: 0,
        power: cfg.power || (skill.power || 1),
        atk: this._getHeroAtk(hero),
        def: hero.def || 0,
        life: projRange / speed,
        maxLife: projRange / speed,
        color: '#b76bff',
        owner: 'hero',
        hero: hero,
        skill: skill,
        castDir: castDir,
        isBasicAttack: false,
        _hitSet: new Set()
      })
    } else {
      const damage = Math.max(1, Math.floor(this._getHeroAtk(hero) * (skill.power || 1) - Math.floor(monster.def * 0.5)))
      const isCrit = Math.random() < (hero.crit || 0.05)
      const finalDmg = isCrit ? Math.floor(damage * 1.5) : damage
      this.battleSystem.pendingDamages.push({
        monster: monster,
        damage: finalDmg,
        isCrit: isCrit,
        timer: 0.4,
        heroName: hero.name,
        statusEffect: skill.statusEffect,
        effectValue: skill.effectValue,
        hero: hero,  // ★ AI 盾击同样需要引用释放者生成护盾/防御提升
        skill: skill,  // ★ AI 盾击读取技能配置
        shieldBash: skill && skill.id === 'shield_bash',  // ★ AI 盾击附加效果标记（与被控角色一致）
      })
    }

    console.log(`[FieldBattle] ${hero.name}（AI）释放技能 ${skill.name}`)
    return true
  }

  /**
   * ★ AI 释放剑气风暴（blade_storm）：生成月牙剑气投射物
   */
  proto._allyCastBladeStorm = function(bh, monster, skill) {
    const hero = bh.hero
    const cpos = bh.getPos()
    const castDir = (bh.sprite && bh.sprite.facingLeft) ? -1 : 1
    if (!this.battleSystem.projectiles) this.battleSystem.projectiles = []
    this.battleSystem.projectiles.push({
      x: cpos.x + castDir * 20 * this.dpr,
      y: cpos.y - 25 * this.dpr,
      vx: castDir * 260 * this.dpr,
      vy: 0,
      power: skill.power || 2.2,
      atk: this._getHeroAtk(hero),
      def: hero.def || 0,
      life: 1.2,
      maxLife: 1.2,
      color: '#aee6ff',
      owner: 'hero',
      hero: hero,
      skill: skill,
      castDir: castDir,
      isBasicAttack: false,
      bladeStorm: true,
      height: 90,
      width: 55,
      hitW: 100,
      hitH: 100,
      _hitSet: new Set()
    })
  }

  // ==========================================================================
  // 5.6 ★ 英雄 AOE 技能（火球/冰晶/雷击）
  // ==========================================================================

  /**
   * ★ 计算技能对怪物的伤害（含感电易伤加成）
   */
  proto._calcSkillDamageToMonster = function(monster, skill, hero, isCrit) {
    const base = Math.max(1, this._getHeroAtk(hero) * (skill.power || 1.0) - Math.floor(monster.def * 0.5))
    let dmg = base
    // ★ 感电状态：受击额外伤害 +mult
    if (monster.statusEffects) {
      const elec = monster.statusEffects.find(e => e.type === 'electrify' && e._active)
      if (elec) {
        dmg = Math.floor(dmg * (1 + (elec.damageMult || 0)))
      }
    }
    const crit = isCrit === undefined ? Math.random() < (hero.crit || 0.05) : isCrit
    return crit ? Math.floor(dmg * 1.5) : Math.floor(dmg)
  }

  // ==========================================================================
  // 5.5 ★ 英雄 BUFF 系统（魔力护盾 def_up 等）
  // ==========================================================================

  /**
   * ★ 计算英雄实际防御（含 buff 加成）
   */
  proto._getHeroDef = function(hero) {
    if (!hero) return 0
    let def = hero.def || 0
    const buffs = hero._buffs || []
    for (const b of buffs) {
      if (b._active && (b.type === 'def_up' || b.type === 'def_up_self')) {
        // ★ 兼容两种配置：固定值(b.value) 或 百分比(b.amp, 如 +70% → 0.70)
        const mult = (b.amp !== undefined) ? b.amp : (b.value || 0)
        def = def * (1 + mult)
      }
    }
    return Math.floor(def)
  }

  /**
   * ★ MP 不足时角色抖动提示
   */
  proto._triggerMpShake = function(ctrl) {
    if (!ctrl) return
    if (ctrl.sprite) {
      ctrl.sprite._shakeTimer = 0.3
      ctrl.sprite._shakeAmp = 6 * this.dpr
    }
    // 也同步到英雄对象（渲染可读）
    if (ctrl.hero) {
      ctrl.hero._shakeTimer = 0.3
    }
  }

  /**
   * ★ 更新角色抖动计时
   */
  proto._updateMpShake = function(dt) {
    const heroes = this.battleSystem.battleHeroes || []
    for (const bh of heroes) {
      if (!bh.sprite) continue
      if (bh.sprite._shakeTimer > 0) {
        bh.sprite._shakeTimer -= dt
        if (bh.sprite._shakeTimer <= 0) {
          bh.sprite._shakeTimer = 0
          bh.sprite._shakeOffsetX = 0
          bh.sprite._shakeOffsetY = 0
        } else {
          // 每帧随机抖动偏移
          bh.sprite._shakeOffsetX = (Math.random() * 2 - 1) * bh.sprite._shakeAmp
          bh.sprite._shakeOffsetY = (Math.random() * 2 - 1) * bh.sprite._shakeAmp
        }
      }
    }
  }

  /**
   * ★ 盾击（shield_bash）附加效果（数据驱动：参数取自技能配置 skill.shield/defUp/knock）
   *   释放者（臻宝）：生成护盾（默认30%最大生命，白色）+ 防御提升（默认+70%，1s）
   *   前方敌人：默认30%几率眩晕1s，并将前方X轴范围（默认60px）内所有敌人击退（默认100px，鸡腿击退）
   *   @param {Object} primaryTarget 主要命中怪物
   *   @param {Object} hero 技能释放者（臻宝）
   *   @param {Object} skill 技能配置（含 shield/defUp/knock 子配置）
   */
  proto._applyShieldBashEffects = function(primaryTarget, hero, skill) {
    if (!hero) return
    const dpr = this.dpr || 1
    const cfg = skill || {}

    // ★ 1) 自身护盾：配置 shield.hpPercent（默认 0.30），英雄联盟式白色护盾，释放即出现，持续 duration 秒后自动消失
    const shieldCfg = cfg.shield || {}
    if (shieldCfg.enabled !== false) {
      const hpPct = (shieldCfg.hpPercent != null) ? shieldCfg.hpPercent : 0.30
      const shDur = (shieldCfg.duration != null) ? shieldCfg.duration : 2.0
      const shieldVal = Math.floor((hero.maxHp || hero.hp || 0) * hpPct)
      hero._shield = shieldVal
      hero._shieldMax = shieldVal
      hero._shieldTimer = shDur   // ★ 护盾持续时间（秒）：每帧衰减，归零自动清空护盾（与是否被攻击无关）
      if (typeof this._refreshCharCard === 'function') this._refreshCharCard(hero)
      console.log(`[FieldBattle] ${hero.name} 盾击生成护盾 ${shieldVal}（${Math.round(hpPct * 100)}% 生命），持续 ${shDur}s`)
    }

    // ★ 2) 防御提升：配置 defUp.amp（默认 0.70）/ duration（默认 1.0s），复用 def_up_self buff
    //   ★ 重点：必须用 _addHeroBuff 添加，确保设置 _active:true / _remaining / _color，
    //   否则 _getHeroDef（要求 b._active）不生效、角色卡也不显示增益（之前直接 push 缺 _active 导致防御加成完全不体现）。
    const defCfg = cfg.defUp || {}
    if (defCfg.enabled !== false && (defCfg.amp != null || defCfg.value != null)) {
      const amp = (defCfg.amp != null) ? defCfg.amp : (defCfg.value || 0)
      const dur = (defCfg.duration != null) ? defCfg.duration : 1.0
      this._addHeroBuff(hero, { type: 'def_up_self', value: amp, duration: dur, source: 'shield_bash' })
      hero._defUpTimer = Math.max(hero._defUpTimer || 0, dur)
      console.log(`[FieldBattle] ${hero.name} 盾击防御提升 +${Math.round(amp * 100)}%（${dur}s）`)
    }

    // ★ 3) 前方 X 轴方向：以释放者朝向决定（this.facingLeft 由摇杆实时更新）
    const knockCfg = cfg.knock || {}
    if (knockCfg.enabled === false) return
    const RANGE = ((knockCfg.range != null) ? knockCfg.range : 60) * dpr      // 前方 X 轴生效范围
    const KNOCK = ((knockCfg.distance != null) ? knockCfg.distance : 100) * dpr // 鸡腿击退距离
    const STUN_CHANCE = (knockCfg.stunChance != null) ? knockCfg.stunChance : 0.30
    const STUN_DUR = (knockCfg.stunDuration != null) ? knockCfg.stunDuration : 1.0

    const dir = this.facingLeft ? -1 : 1
    const originX = hero.x != null ? hero.x : (primaryTarget ? primaryTarget.x : 0)
    const originY = hero.y != null ? hero.y : (primaryTarget ? primaryTarget.y : 0)

    // 作用对象：主要目标 + 前方 X 轴范围内所有敌人
    const targets = []
    const addTarget = (m) => {
      if (!m || !m.alive) return
      const dx = (m.x - originX) * dir   // 朝向前方为正
      const dy = Math.abs(m.y - originY)
      // X 轴方向在前方 RANGE 内，且 Y 轴大致同一层（避免越层误击退）
      if (dx >= 0 && dx <= RANGE && dy <= 60 * dpr) {
        if (!targets.includes(m)) targets.push(m)
      }
    }
    if (primaryTarget) addTarget(primaryTarget)
    for (const m of this.mapMonsters || []) addTarget(m)

    for (const m of targets) {
      // ★ 眩晕：STUN_CHANCE 几率，持续 STUN_DUR
      if (Math.random() < STUN_CHANCE) {
        m._stunned = Math.max(m._stunned || 0, STUN_DUR)
        console.log(`[FieldBattle] ${m.name} 被盾击眩晕 ${STUN_DUR}s`)
      }
      // ★ 击退：沿释放者朝向 X 轴推开 KNOCK 像素
      m.x += dir * KNOCK
      console.log(`[FieldBattle] ${m.name} 被鸡腿击退 ${KNOCK}px（X 轴方向 ${dir}）`)
      // 击退后做地形碰撞钳制，避免被推入墙内
      if (this._collisionEngine && this._collisionEngine.clampToBounds) {
        const c = this._collisionEngine.clampToBounds(m.x, m.y)
        m.x = c.x
        m.y = c.y
      }
    }
  }

  /**
   * ★ 计算英雄实际攻击（含 buff 加成）
   *   atk_up/atk_up_self 提升攻击力
   */
  proto._getHeroAtk = function(hero) {
    if (!hero) return 0
    // ★ 魔法类角色（有 matk）优先用 matk，物理类用 atk
    let atk = hero.matk || hero.atk || 0
    const buffs = hero._buffs || []
    for (const b of buffs) {
      if (b._active && (b.type === 'atk_up' || b.type === 'atk_up_self')) {
        atk = atk * (1 + (b.value || 0))
      }
    }
    return Math.floor(atk)
  }

  /**
   * ★ 给英雄挂 buff（魔力护盾/金盾/铁壁等）
   * @param {Object} skill 技能配置（effect/value/duration/turns）
   * @param {Object} caster 施法者（buff 技能以施法者为基准）
   */
  proto._applyHeroBuff = function(skill, caster) {
    if (!skill || !this.battleSystem) return
    // ★ 兼容两种配置：def/atk 类用 skill.effect，纯治疗用 skill.type === 'heal'
    if (!skill.effect && skill.type !== 'heal') return
    const effect = skill.effect
    const value = skill.value || 0
    // 野外战斗 buff 时长：优先 duration（秒），否则 turns 按回合估算（回合≈2s）
    const dur = skill.duration != null ? skill.duration : ((skill.turns || 1) * 2)

    if (effect === 'def_up') {
      // ★ 全体参战英雄防御提升（含施法者）
      const targets = this.battleSystem.battleHeroes || []
      for (const bh of targets) {
        if (!bh.hero || bh.hero.hp <= 0) continue
        this._addHeroBuff(bh.hero, { type: 'def_up', value: value, duration: dur })
      }
      console.log(`[FieldBattle] ${caster ? caster.name : ''} 施放${skill.name}：全体防御+${Math.round(value * 100)}%（持续${dur}s）`)
    } else if (effect === 'def_up_self') {
      // 仅自身
      if (caster) {
        this._addHeroBuff(caster, { type: 'def_up_self', value: value, duration: dur })
        console.log(`[FieldBattle] ${caster.name} 施放${skill.name}：自身防御+${Math.round(value * 100)}%（持续${dur}s）`)
      }
    } else if (effect === 'atk_up') {
      // ★ 臻宝战吼：全体参战英雄攻击力提升（含施法者）
      const targets = this.battleSystem.battleHeroes || []
      for (const bh of targets) {
        if (!bh.hero || bh.hero.hp <= 0) continue
        this._addHeroBuff(bh.hero, { type: 'atk_up', value: value, duration: dur })
      }
      console.log(`[FieldBattle] ${caster ? caster.name : ''} 施放${skill.name}：全体攻击+${Math.round(value * 100)}%（持续${dur}s）`)
    } else if (effect === 'atk_up_self') {
      // ★ 臻宝狂暴：仅自身攻击力大幅提升
      if (caster) {
        this._addHeroBuff(caster, { type: 'atk_up_self', value: value, duration: dur })
        console.log(`[FieldBattle] ${caster.name} 施放${skill.name}：自身攻击+${Math.round(value * 100)}%（持续${dur}s）`)
      }
    } else if (effect === 'heal' || skill.type === 'heal') {
      // ★ 群体治疗（艾米治愈之光等）：base + matk*系数，回复全队生命并飘治疗字
      const targets = this.battleSystem.battleHeroes || []
      const matkScale = (skill.healMatk != null) ? skill.healMatk : 1
      for (const bh of targets) {
        if (!bh.hero || bh.hero.hp <= 0) continue
        const matk = bh.hero.matk || bh.hero.atk || 0
        const amount = Math.floor((skill.power || 0) + matk * matkScale)
        const before = bh.hero.hp
        bh.hero.hp = Math.min(bh.hero.maxHp, bh.hero.hp + amount)
        const healed = bh.hero.hp - before
        // 治疗飘字
        if (this.battleSystem.damageTexts) {
          const p = (bh.getPos ? bh.getPos() : { x: this.playerX, y: this.playerY })
          this.battleSystem.damageTexts.push({
            text: `+${healed}`,
            x: (p.x || 0) - (this.cameraX || 0),
            y: (p.y || 0) - (this.cameraY || 0) - 90 * this.dpr,
            color: '#6dffb0', life: 1.0, maxLife: 1.0,
            _startY: (p.y || 0) - (this.cameraY || 0) - 90 * this.dpr
          })
        }
        if (typeof this._refreshCharCard === 'function') this._refreshCharCard(bh.hero)
      }
      console.log(`[FieldBattle] ${caster ? caster.name : ''} 施放${skill.name}：全队回复生命（单体约 ${Math.floor((skill.power || 0) + ((targets[0] && (targets[0].hero.matk || targets[0].hero.atk || 0)) || 0) * matkScale)}）`)
    } else if (effect === 'taunt') {
      // ★ 挑衅：小贝吸引敌人攻击自己（持续期间所有怪物强制锁定小贝）
      if (caster) {
        this._addHeroBuff(caster, { type: 'taunt', value: 0, duration: dur })
        console.log(`[FieldBattle] ${caster.name} 施放${skill.name}：吸引敌人攻击自己（持续${dur}s）`)
      }
    } else if (effect === 'guard') {
      // ★ 守护：小贝替队友承受伤害（持续期间队友受到的伤害转由小贝承担）
      if (caster) {
        this._addHeroBuff(caster, { type: 'guard', value: 0, duration: dur })
        console.log(`[FieldBattle] ${caster.name} 施放${skill.name}：替队友承受伤害（持续${dur}s）`)
      }
    } else if (effect === 'counter') {
      // ★ 反击：小贝受到攻击时反弹伤害（value=反弹比例）
      if (caster) {
        this._addHeroBuff(caster, { type: 'counter', value: (skill.value || 0.5), duration: dur })
        console.log(`[FieldBattle] ${caster.name} 施放${skill.name}：受到攻击时反击（反弹${Math.round((skill.value||0.5)*100)}%，持续${dur}s）`)
      }
    } else if (effect === 'gold_up') {
      // ★ 财运亨通：战斗胜利后额外获得金币（value=额外比例）
      if (caster) {
        this._addHeroBuff(caster, { type: 'gold_up', value: (skill.value || 0.5), duration: dur })
        console.log(`[FieldBattle] ${caster.name} 施放${skill.name}：战斗胜利额外金币+${Math.round((skill.value||0.5)*100)}%（持续${dur}s）`)
      }
    }
    // 其它未知 buff 类型暂不处理
  }

  // ==========================================================================
  // ★ 挑衅/守护/反击/财运 辅助查询（野外战斗实现）
  // ==========================================================================
  proto._heroHasBuff = function(hero, type) {
    if (!hero || !hero._buffs) return false
    return hero._buffs.some(b => b._active && b._remaining > 0 && b.type === type)
  }
  proto._heroBuffValue = function(hero, type) {
    if (!hero || !hero._buffs) return 0
    const b = hero._buffs.find(x => x._active && x._remaining > 0 && x.type === type)
    return b ? (b.value || 0) : 0
  }
  // 返回当前正在挑衅的英雄（存活），否则 null
  proto._fieldGetTauntHero = function() {
    const battleHeroes = this.battleSystem.battleHeroes || []
    for (const bh of battleHeroes) {
      if (bh.hero && bh.hero.hp > 0 && this._heroHasBuff(bh.hero, 'taunt')) return bh.hero
    }
    return null
  }
  // 返回当前正在守护（替队友承伤）的英雄（存活），否则 null
  proto._fieldGetGuardHero = function() {
    const battleHeroes = this.battleSystem.battleHeroes || []
    for (const bh of battleHeroes) {
      if (bh.hero && bh.hero.hp > 0 && this._heroHasBuff(bh.hero, 'guard')) return bh.hero
    }
    return null
  }
  // 守护：若非守护者本人受伤，且存在存活守护者，则伤害转由守护者承担
  proto._fieldResolveGuard = function(targetHero) {
    if (!targetHero || targetHero.hp <= 0) return targetHero
    const guarder = this._fieldGetGuardHero()
    if (guarder && guarder !== targetHero && guarder.hp > 0) {
      return guarder
    }
    return targetHero
  }
  // 反击：被击中的英雄若处于反击状态，向攻击者反弹伤害
  proto._fieldApplyCounterReflect = function(monster, hpDamage, hero) {
    if (!monster || monster.alive === false || !hero || hpDamage <= 0) return
    const counterVal = this._heroBuffValue(hero, 'counter')
    if (counterVal <= 0) return
    const reflect = Math.max(1, Math.floor(hpDamage * counterVal))
    this._damageMonster(monster, reflect)
    const mx = monster.x - this.cameraX
    const my = monster.y - this.cameraY
    this.battleSystem.damageTexts.push({
      text: `反击-${reflect}`,
      x: mx, y: my - 60 * this.dpr,
      color: '#ffb142', life: 1.0, maxLife: 1.0, _startY: my - 60 * this.dpr
    })
    if (monster.hp <= 0) {
      monster.alive = false
      console.log(`[FieldBattle] ${monster.name} 被反击击杀！`)
      this.battleSystem.battleTarget = null
    }
  }

  /**
   * ★ 给英雄添加/刷新 buff
   */
  proto._addHeroBuff = function(hero, buff) {
    if (!hero._buffs) hero._buffs = []
    const existing = hero._buffs.find(b => b.type === buff.type)
    if (existing) {
      existing.value = buff.value
      existing.duration = buff.duration
      existing._remaining = buff.duration
      existing._active = true
      // 刷新时也记录冲击波（视觉提示）
      this._spawnBuffShockwave(hero)
    } else {
      hero._buffs.push({
        type: buff.type,
        value: buff.value,
        duration: buff.duration,
        _remaining: buff.duration,
        _active: true,
        _color: this._getBuffColor(buff.type)
      })
      // 生效冲击波
      this._spawnBuffShockwave(hero)
    }
  }

  /**
   * ★ 生成 buff 生效冲击波（视觉：释放瞬间扩散光圈）
   */
  proto._spawnBuffShockwave = function(hero) {
    if (!hero || !this.battleSystem) return
    const bh = (this.battleSystem.battleHeroes || []).find(b => b.hero === hero)
    const pos = bh && bh.getPos ? bh.getPos() : { x: this.playerX, y: this.playerY }
    if (!this.battleSystem.buffShockwaves) this.battleSystem.buffShockwaves = []
    const buffColor = this._getBuffColor((hero._buffs && hero._buffs.length && hero._buffs[hero._buffs.length - 1].type) || 'def_up')
    this.battleSystem.buffShockwaves.push({
      x: pos.x,
      y: pos.y,
      _t: 0,
      _dur: 0.7,
      _color: buffColor
    })
    // ★ 触发专业粒子喷发（环形扩散 + 上升）
    if (this._spawnBuffParticles) {
      const hex = this._hexColorFromRgba ? this._hexColorFromRgba(buffColor) : '#7ab8ff'
      this._spawnBuffParticles(hero, hex, 24)
    }
  }

  /**
   * ★ buff 类型 → 视觉颜色
   */
  proto._getBuffColor = function(type) {
    const map = {
      def_up: 'rgba(95,159,255,',       // 蓝（护盾）
      def_up_self: 'rgba(95,159,255,',  // 蓝
      atk_up: 'rgba(255,165,2,',        // 橙（战吼）
      atk_up_self: 'rgba(255,77,77,',   // 红（狂暴）
      spd_up: 'rgba(0,230,118,',        // 绿
      heal: 'rgba(0,230,118,',          // 绿
      taunt: 'rgba(255,80,80,',         // 红（挑衅）
      guard: 'rgba(120,200,255,',       // 浅蓝（守护）
      counter: 'rgba(255,177,66,',      // 橙黄（反击）
      gold_up: 'rgba(255,215,0,',       // 金（财运）
    }
    return map[type] || 'rgba(200,200,255,'
  }

  /**
   * ★ 更新 buff 冲击波（衰减、移除）
   */
  proto._updateBuffShockwaves = function(dt) {
    const list = this.battleSystem.buffShockwaves
    if (!list || list.length === 0) return
    for (let i = list.length - 1; i >= 0; i--) {
      list[i]._t += dt
      if (list[i]._t >= list[i]._dur) list.splice(i, 1)
    }
  }

  /**
   * ★ 更新英雄 buff 剩余时间（每帧调用）
   */
  proto._updateHeroBuffs = function(dt) {
    const heroes = this.battleSystem.battleHeroes || []
    for (const bh of heroes) {
      const hero = bh.hero
      if (!hero) continue
      // ★ 护盾计时衰减：释放即开始倒计时，归零自动清空护盾（英雄联盟式，与是否被攻击无关）
      if (hero._shieldTimer != null && hero._shieldTimer > 0) {
        hero._shieldTimer -= dt
        if (hero._shieldTimer <= 0) {
          hero._shieldTimer = 0
          hero._shield = 0
          hero._shieldMax = 0
          if (typeof this._refreshCharCard === 'function') this._refreshCharCard(hero)
          console.log(`[FieldBattle] ${hero.name} 护盾到期消失`)
        }
      }
      if (!hero._buffs || hero._buffs.length === 0) continue
      for (let i = hero._buffs.length - 1; i >= 0; i--) {
        const b = hero._buffs[i]
        b._remaining -= dt
        if (b._remaining <= 0) {
          hero._buffs.splice(i, 1)
        }
      }
    }
  }

  /**
   * ★ 怪物状态视觉元数据（颜色 / 图标 / 中文名），供渲染层统一取用
   */
  proto.STATUS_META = {
    burn:      { color: '#ff6a2b', glow: 'rgba(255,106,43,', name: '灼烧' },
    freeze:    { color: '#7fe3ff', glow: 'rgba(127,227,255,', name: '冰冻' },
    electrify: { color: '#ffe14d', glow: 'rgba(255,225,77,', name: '感电' },
    root:      { color: '#5bd66b', glow: 'rgba(91,214,107,', name: '紧固' },
    atk_down:  { color: '#c08bff', glow: 'rgba(192,139,255,', name: '虚弱' },
  }

  /**
   * ★ 给怪物挂状态效果（灼烧/冰冻/感电/紧固）
   */
  proto._applyMonsterStatus = function(monster, type, config, hero) {
    if (!monster || !monster.alive || !config) return
    if (!monster.statusEffects) monster.statusEffects = []
    const meta = this.STATUS_META[type] || { color: '#ffffff', glow: 'rgba(255,255,255,', name: type }
    // 同类型状态刷新（不叠加，重置计时）
    const existing = monster.statusEffects.find(e => e.type === type)
    if (existing) {
      existing.duration = config.duration || existing.duration
      existing._remaining = config.duration || existing.duration
      if (type === 'burn') existing.tickDamage = config.tickDamage || existing.tickDamage
      if (type === 'electrify') existing.damageMult = config.damageMult || existing.damageMult
      if (type === 'freeze') existing._frozen = true
      if (type === 'root') existing._rooted = true
      if (type === 'atk_down') monster._atkMul = Math.max(0.1, 1 - (config.value || 0.3))
      // ★ 刷新时重新触发一次施加冲击波（视觉反馈）
      this._spawnStatusShockwave(monster, type, meta)
      return
    }
    monster.statusEffects.push({
      type: type,
      duration: config.duration || 1,
      _remaining: config.duration || 1,
      _lastTick: 0,
      _active: true,
      _color: meta.color,
      _glow: meta.glow,
      // burn
      tickDamage: config.tickDamage || 0,
      tickInterval: config.tickInterval || 0.5,
      _tickAccum: 0,
      // electrify
      damageMult: config.damageMult || 0,
      // freeze
      _frozen: type === 'freeze',
      // root（紧固：定身，区别于冰冻——仍可受击但不移动）
      _rooted: type === 'root',
      _strikeCount: 0
    })
    // ★ 虚弱（atk_down）：降低怪物攻击力（在怪物伤害结算处乘 _atkMul）
    if (type === 'atk_down') monster._atkMul = Math.max(0.1, 1 - (config.value || 0.3))
    // ★ 首次施加：触发扩散冲击波（与英雄 BUFF 同理，给玩家明确视觉反馈）
    this._spawnStatusShockwave(monster, type, meta)
  }

  /**
   * ★ 状态施加瞬间的扩散冲击波（脚底光圈），复用 buffShockwaves 列表
   */
  proto._spawnStatusShockwave = function(monster, type, meta) {
    if (!this.battleSystem) return
    if (!this.battleSystem.statusShockwaves) this.battleSystem.statusShockwaves = []
    this.battleSystem.statusShockwaves.push({
      x: monster.x,
      y: monster.y + 20 * this.dpr,
      r: 8 * this.dpr,
      maxR: 46 * this.dpr,
      color: (meta && meta.color) || '#ffffff',
      alpha: 0.9,
      _t: 0
    })
  }

  /**
   * ★ 火球术（优化）：从角色X轴脱手，生成向前方X轴飞行的火球弹道，
   *   飞行途中命中路径上的第一个敌人 → 伤害 + 灼烧 + 命中特效，火球消失
   */
  proto._castFireballAoE = function(skill, cpos, castDir, hero) {
    const cfg = skill.aoe
    const burnCfg = cfg.burn || {}
    const speed = (cfg.projectileSpeed || 320) * this.dpr   // 飞行速度（可配置）
    const range = (cfg.range || 200) * this.dpr             // 最大飞行距离（X轴）
    const fx = this.game && this.game.effects
    if (!this.battleSystem.projectiles) this.battleSystem.projectiles = []
    // 从角色手部/武器脱手：起点为脚底往上约 60% 身高处，沿 facing 方向 X 轴飞行（vy=0 保持直线）
    this.battleSystem.projectiles.push({
      x: cpos.x + castDir * 20 * this.dpr,
      y: cpos.y - 15 * this.dpr,
      vx: castDir * speed,
      vy: 0,
      power: skill.power || 1,
      atk: this._getHeroAtk(hero),
      def: hero.def || 0,
      life: range / (speed || 1),   // 到达最大射程后消失
      maxLife: range / (speed || 1),
      color: '#ff6b35',
      owner: 'hero',
      skill: skill,
      hero: hero,
      castDir: castDir,
      burn: burnCfg.enabled ? {
        duration: burnCfg.duration || 3,
        tickDamage: burnCfg.tickDamage || 6,
        tickInterval: burnCfg.tickInterval || 0.5
      } : null,
      _hitSet: new Set(),
      _fx: fx
    })
    console.log(`[FieldBattle] ${hero.name} 发射火球（速度 ${speed}，射程 ${range}）`)
  }

  /**
   * ★ 火球弹道命中结算：飞行中命中路径上第一个未命中过的敌人
   */
  proto._updateHeroProjectiles = function(dt) {
    if (!this.battleSystem.projectiles) return
    const list = this.battleSystem.projectiles
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      if (p.owner !== 'hero') continue   // 只处理英雄弹道
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      p.age = (p.age || 0) + dt
      // 命中判定：与怪物 X 轴带碰撞（火球Y固定，命中 Y 带内的敌人）
      let hitMonster = null
      if (p.bladeStorm) {
        // ★ 剑气：矩形范围（width×height）穿透命中路径上所有未命中的敌人（不消散）
        for (const m of this.mapMonsters || []) {
          if (!m.alive || p._hitSet.has(m.id)) continue
          const dx = Math.abs(m.x - p.x)
          const dy = Math.abs(m.y - p.y)
          if (dx <= p.hitW / 2 && dy <= p.hitH / 2) {
            p._hitSet.add(m.id)
            const isCrit = Math.random() < (p.hero.crit || 0.05)
            const dmg = Math.max(1, Math.floor(this._getHeroAtk(p.hero) * (p.power || 1.4) - Math.floor(m.def * 0.5)))
            const finalDmg = isCrit ? Math.floor(dmg * 1.5) : dmg
            this._damageMonster(m, finalDmg)
            this._pushDamageText(m, finalDmg, isCrit, '#aee6ff')
            if (p._fx && p._fx.playHitEffect) {
              p._fx.playHitEffect('magic_impact', m.x - this.cameraX, m.y - this.cameraY - 30 * this.dpr, this.dpr)
            }
            console.log(`[FieldBattle] 剑气命中 ${m.name}，伤害 ${finalDmg}${isCrit ? '（暴击）' : ''}，剩余HP ${m.hp}`)
            this.battleSystem.battleTarget = m
            if (m.hp <= 0) { m.alive = false; this.battleSystem.battleTarget = null }
          }
        }
      } else {
        for (const m of this.mapMonsters || []) {
          if (!m.alive || p._hitSet.has(m.id)) continue
          const dx = Math.abs(m.x - p.x)
          const dy = Math.abs(m.y - p.y)
          // ★ 命中判定：X 轴范围宽松（投射物沿X飞行），Y 轴范围收紧，避免越层误伤
          if (dx <= 45 * this.dpr && dy <= 45 * this.dpr) { hitMonster = m; break }
        }
      }
      if (hitMonster) {
        p._hitSet.add(hitMonster.id)
        const isCrit = Math.random() < (p.hero.crit || 0.05)
        // ★ 普攻弹道：用普攻伤害公式；技能弹道：用技能伤害公式
        let dmg
        if (p.isBasicAttack) {
          dmg = Math.max(1, this._getHeroAtk(p.hero) - Math.floor(hitMonster.def * 0.5))
          if (isCrit) dmg = Math.floor(dmg * 1.5)
          dmg = Math.max(1, dmg)
        } else {
          dmg = this._calcSkillDamageToMonster(hitMonster, p.skill, p.hero, isCrit)
        }
        this._damageMonster(hitMonster, dmg)
        // 灼烧状态（仅技能火球）
        if (p.burn) this._applyMonsterStatus(hitMonster, 'burn', p.burn, p.hero)
        this._pushDamageText(hitMonster, dmg, isCrit, p.isBasicAttack ? '#ffffff' : '#ff6b35')
        // 命中特效（普攻=冲击波命中，技能火球=火焰命中）
        if (p._fx && p._fx.playHitEffect) {
          if (p.isBasicAttack) {
            p._fx.playHitEffect('magic_impact', hitMonster.x - this.cameraX, hitMonster.y - this.cameraY - 30 * this.dpr, this.dpr)
          } else {
            p._fx.playHitEffect('fire_impact', hitMonster.x - this.cameraX, hitMonster.y - this.cameraY - 30 * this.dpr, this.dpr)
          }
        }
        console.log(`[FieldBattle] ${p.hero.name} ${p.isBasicAttack ? '普攻' : '火球'}命中 ${hitMonster.name}，伤害 ${dmg}${isCrit ? '（暴击）' : ''}，剩余HP ${hitMonster.hp}`)
        // ★ 让目标面板锁定真正被击中的怪（解决远程攻击需贴近才显示血条 / 扣血不跟手）
        this.battleSystem.battleTarget = hitMonster
        if (hitMonster.hp <= 0) {
          hitMonster.alive = false
          this.battleSystem.battleTarget = null
        }
        // 弹道命中即消散（可穿透则移除 _hitSet 限制，默认单目标）
        list.splice(i, 1)
        continue
      }
      if (p.life <= 0) list.splice(i, 1)
    }
  }

  /**
   * ★ 注册延迟发射的投射物（攻击动画完成后才真正生成弹道）
   * @param {Object} spawnCfg 延迟发射配置（delay 秒 + 生成投射物的回调参数）
   */
  proto._scheduleProjectile = function(spawnCfg) {
    if (!this.battleSystem.pendingProjectiles) this.battleSystem.pendingProjectiles = []
    this.battleSystem.pendingProjectiles.push({
      _delay: spawnCfg.delay || 0,
      spawn: spawnCfg.spawn
    })
  }

  /**
   * ★ 更新待发射投射物：计时结束（攻击动画完成）后真正生成弹道
   */
  proto._updatePendingProjectiles = function(dt) {
    const list = this.battleSystem.pendingProjectiles
    if (!list || list.length === 0) return
    for (let i = list.length - 1; i >= 0; i--) {
      const pp = list[i]
      pp._delay -= dt
      if (pp._delay <= 0) {
        try {
          pp.spawn()
        } catch (e) {
          console.error('[FieldBattle] 延迟投射物生成失败:', e)
        }
        list.splice(i, 1)
      }
    }
  }

  /**
   * ★ 冰晶术（冰刃波动剑）：X轴方向延伸生成冰刃序列，逐个生成再逐个消失
   */
  proto._castIceWaveAoE = function(skill, cpos, castDir, hero) {
    const cfg = skill.aoe
    const bladeCount = cfg.bladeCount || 8
    const bladeGap = (cfg.bladeGap || 60) * this.dpr
    const bladeWidth = (cfg.bladeWidth || 80) * this.dpr
    const freezeCfg = cfg.freeze || {}
    // 从施法位置沿 facing 方向生成冰刃，直到地图 X 边界
    const mapEndX = castDir > 0 ? (this.mapWidth || 6000) : 0
    const totalLen = Math.abs(mapEndX - cpos.x)
    const count = Math.min(bladeCount, Math.max(1, Math.floor(totalLen / bladeGap)))
    const blades = []
    for (let i = 0; i < count; i++) {
      const bx = cpos.x + castDir * (bladeWidth / 2 + i * bladeGap)
      if (castDir > 0 && bx > mapEndX) break
      if (castDir < 0 && bx < mapEndX) break
      blades.push({
        x: bx,
        w: bladeWidth,
        y: cpos.y,
        _born: false,   // 是否已生成
        _died: false,   // 是否已消失
        _hitSet: new Set(),  // 已命中的怪物id
        _delay: i * 0.25   // 逐个生成的延迟（秒）
      })
    }
    // 注册到战斗过程，由 _updateHeroSkillProcesses 驱动
    if (!this.battleSystem.skillProcesses) this.battleSystem.skillProcesses = []
    this.battleSystem.skillProcesses.push({
      type: 'iceWave',
      skill: skill,
      hero: hero,
      blades: blades,
      _timer: 0,
      _phase: 'extend',     // extend: 逐个生成；retract: 逐个消失
      _idx: 0,              // 当前生成/消失到第几个
      _total: blades.length,
      _extendDone: false,
      _retractDone: false,
      _elapsed: 0,
      _fx: this.game && this.game.effects,
      duration: 2.5,
      freeze: freezeCfg.enabled !== false
    })
  }

  /**
   * ★ 雷击术：范围内敌人无差别攻击，每个敌人最多3次雷击（间隔触发）+ 感电
   */
  proto._castThunderAoE = function(skill, cpos, hero) {
    const cfg = skill.aoe
    const radius = (cfg.radius || 300) * this.dpr
    const strikeCount = cfg.strikeCount || 3
    const duration = cfg.duration || 5
    const strikeInterval = cfg.strikeInterval || 0.8
    const elecCfg = cfg.electrify || {}
    const fx = this.game && this.game.effects
    // 命中范围内的所有存活怪物
    const targets = (this.mapMonsters || []).filter(m =>
      m.alive && Math.hypot(m.x - cpos.x, m.y - cpos.y) <= radius
    )
    if (targets.length === 0) {
      console.log(`[FieldBattle] ${hero.name} 雷击范围内无敌人`)
      return
    }
    // 每个怪物：挂感电状态 + 注册雷击定时过程
    if (elecCfg.enabled) {
      for (const m of targets) {
        this._applyMonsterStatus(m, 'electrify', { duration: duration, damageMult: elecCfg.damageMult || 0.2 }, hero)
      }
    }
    if (!this.battleSystem.skillProcesses) this.battleSystem.skillProcesses = []
    this.battleSystem.skillProcesses.push({
      type: 'thunder',
      skill: skill,
      hero: hero,
      targets: targets.map(m => m),
      _timer: 0,
      _strikeIndex: 0,
      strikeCount: strikeCount,
      strikeInterval: strikeInterval,
      duration: duration,
      _fx: fx,
      _elapsed: 0
    })
  }

  /**
   * ★ 更新怪物状态效果（灼烧DoT / 冰冻 / 感电 / 紧固 计时）
   */
  proto._updateMonsterStatusEffects = function(dt) {
    if (!this.mapMonsters) return
    for (const m of this.mapMonsters) {
      if (!m.statusEffects || m.statusEffects.length === 0) { m._frozen = false; m._rooted = false; continue }
      if (!m.alive) { m.statusEffects = []; m._frozen = false; m._rooted = false; continue }
      // 每帧先清状态标记，由下方按当前生效状态重新置位
      m._frozen = false
      m._rooted = false
      for (let i = m.statusEffects.length - 1; i >= 0; i--) {
        const e = m.statusEffects[i]
        e._remaining -= dt
        if (e._remaining <= 0) {
          if (e.type === 'atk_down') m._atkMul = 1
          m.statusEffects.splice(i, 1)
          continue
        }
        // 灼烧 DoT
        if (e.type === 'burn' && e.tickDamage > 0) {
          e._tickAccum = (e._tickAccum || 0) + dt
          if (e._tickAccum >= (e.tickInterval || 0.5)) {
            e._tickAccum = 0
            this._damageMonster(m, e.tickDamage)
            this._pushDamageText(m, e.tickDamage, false, '#ff6600')
            console.log(`[FieldBattle] ${m.name} 灼烧-${e.tickDamage}`)
            if (m.hp <= 0) { m.alive = false; m.statusEffects = []; this.battleSystem.battleTarget = null }
          }
        }
        // 冰冻：怪物无法行动（由 _updateMonsters 读取 m._frozen 跳过移动/攻击）
        if (e.type === 'freeze' && e._active) m._frozen = true
        // 紧固：定身（由 _updateMonsters 读取 m._rooted 跳过移动，但仍可受击/被技能命中）
        if (e.type === 'root' && e._active) m._rooted = true
      }
    }
  }

  /**
   * ★ 更新英雄技能过程（冰刃延伸/消失、雷击连击）
   */
  proto._updateHeroSkillProcesses = function(dt) {
    const procs = this.battleSystem.skillProcesses
    if (!procs || procs.length === 0) return
    for (let i = procs.length - 1; i >= 0; i--) {
      const p = procs[i]
      p._elapsed = (p._elapsed || 0) + dt

      if (p.type === 'iceWave') {
        this._updateIceWaveProcess(p, dt)
        if (p._retractDone || p._elapsed > (p.duration || 3)) procs.splice(i, 1)
      } else if (p.type === 'thunder') {
        this._updateThunderProcess(p, dt)
        if (p._strikeIndex >= p.strikeCount || p._elapsed > (p.duration || 5)) procs.splice(i, 1)
      }
    }
  }

  /**
   * ★ 冰刃波动剑过程：逐个生成（extend）→ 到达边界 → 逐个消失（retract）
   */
  proto._updateIceWaveProcess = function(p, dt) {
    const fx = p._fx
    if (!p._phase) p._phase = 'extend'
    if (!p._idx) p._idx = 0

    if (p._phase === 'extend') {
      // 生成下一个冰刃（带延迟，逐个出现）
      if (p._idx < p._total) {
        const blade = p.blades[p._idx]
        blade._born = true
        // 冰刃命中判定（Y轴带内，X轴带内）
        if (this.mapMonsters) {
          for (const m of this.mapMonsters) {
            if (!m.alive || blade._hitSet.has(m.id)) continue
            const dx = Math.abs(m.x - blade.x)
            const dy = Math.abs(m.y - blade.y)
            // ★ 冰刃命中：X 轴按刃宽（横向扫击），Y 轴收紧到 ±45*dpr 避免跨层误伤
            if (dx <= blade.w / 2 && dy <= 45 * this.dpr) {
              blade._hitSet.add(m.id)
              const isCrit = Math.random() < (p.hero.crit || 0.05)
              const dmg = this._calcSkillDamageToMonster(m, p.skill, p.hero, isCrit)
              this._damageMonster(m, dmg)
              if (p.freeze) this._applyMonsterStatus(m, 'freeze', { duration: (p.skill.aoe && p.skill.aoe.freeze && p.skill.aoe.freeze.duration) || 2 }, p.hero)
              this._pushDamageText(m, dmg, isCrit, '#66ddff')
              if (fx && fx.playHitEffect) {
                fx.playHitEffect('ice_impact', m.x - this.cameraX, m.y - this.cameraY - 30 * this.dpr, this.dpr)
              }
              console.log(`[FieldBattle] ${p.hero.name} 冰刃命中 ${m.name}，伤害 ${dmg}，已冰冻`)
              if (m.hp <= 0) { m.alive = false; this.battleSystem.battleTarget = null }
            }
          }
        }
        // 生成冰刃视觉（用闪电命中帧近似冰刃，或按需扩展）
        if (fx && fx.playHitEffect) {
          const sx = blade.x - this.cameraX
          const sy = blade.y - this.cameraY - 20 * this.dpr
          // 冰刃延展视觉：在 blade 范围内播放一个小的 ice_hit
          fx.playHitEffect('ice_impact', sx, sy, this.dpr)
        }
        p._idx++
      } else {
        p._phase = 'retract'
        p._idx = 0
      }
    } else if (p._phase === 'retract') {
      // 从起点逐个消失
      if (p._idx < p._total) {
        const blade = p.blades[p._idx]
        blade._died = true
        p._idx++
      } else {
        p._retractDone = true
      }
    }
  }

  /**
   * ★ 雷击过程：范围内怪物随机逐个受击（每个最多 strikeCount 次）
   */
  proto._updateThunderProcess = function(p, dt) {
    const fx = p._fx
    if (!p._strikeIndex) p._strikeIndex = 0
    p._strikeTimer = (p._strikeTimer || 0) + dt
    const interval = p.strikeInterval || 0.8
    // 每次间隔触发一轮雷击：对范围内存活怪物随机挑一只
    while (p._strikeTimer >= interval && p._strikeIndex < p.strikeCount) {
      p._strikeTimer -= interval
      const alive = (p.targets || []).filter(m => m.alive)
      if (alive.length === 0) { p._strikeIndex = p.strikeCount; break }
      // 随机命中一只
      const m = alive[Math.floor(Math.random() * alive.length)]
      const isCrit = Math.random() < (p.hero.crit || 0.05)
      const dmg = this._calcSkillDamageToMonster(m, p.skill, p.hero, isCrit)
      this._damageMonster(m, dmg)
      this._pushDamageText(m, dmg, isCrit, '#ffe066')
      if (fx && fx.playHitEffect) {
        fx.playHitEffect('magic_impact', m.x - this.cameraX, m.y - this.cameraY - 30 * this.dpr, this.dpr)
      }
      console.log(`[FieldBattle] ${p.hero.name} 雷击命中 ${m.name}，伤害 ${dmg}${isCrit ? '（暴击）' : ''}，剩余HP ${m.hp}`)
      if (m.hp <= 0) { m.alive = false; this.battleSystem.battleTarget = null }
      // 记录该怪物累计命中次数（达到上限后不再被随机选中）
      m._strikeCount = (m._strikeCount || 0) + 1
      p._strikeIndex++
    }
  }

  /**
   * ★ 推送伤害飘字
   */
  proto._pushDamageText = function(m, dmg, isCrit, color) {
    if (!this.battleSystem.damageTexts) this.battleSystem.damageTexts = []
    // ★ 隐身无敌：实际伤害已在 _damageMonster 中以"无敌"呈现，这里不再弹假伤害数字
    if (m && m._invisible) return
    const sx = m.x - this.cameraX
    const sy = m.y - this.cameraY
    this.battleSystem.damageTexts.push({
      text: `-${dmg}${isCrit ? '!' : ''}`,
      x: sx,
      y: sy - 40 * this.dpr,
      color: color || (isCrit ? '#FFD700' : '#ff4757'),
      life: 1.0,
      maxLife: 1.0,
      _startY: sy - 40 * this.dpr,
      isCrit: isCrit
    })
  }

  // ==========================================================================
  // 6. 怪物攻击玩家
  // ==========================================================================
  proto._updateMonsterAttack = function(dt) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return

    // 更新怪物抛射物（飞行/命中结算）
    this._fieldUpdateProjectiles(dt)
    this._fieldUpdateWarningZones(dt)

    // ★ 参战英雄列表（主角 + 跟随队友），怪物攻击其中最近者
    const battleHeroes = this.battleSystem.battleHeroes || []
    if (!battleHeroes.length) return

    // 1. 先递减所有怪物技能的冷却（单位：秒）
    for (const monster of this.mapMonsters) {
      if (!monster.alive || !monster.skillCDs) continue
      // ★ 延迟冷却阶段（buff/隐身/自愈类带 duration 的技能）：效果持续期间(_skillDelay)
      //   不可重复释放；_skillDelay 递减到 0 后才正式开始计 skillCDs（即"效果结束才开始冷却"）
      if (monster._skillDelay) {
        for (const k in monster._skillDelay) {
          if (monster._skillDelay[k] > 0) {
            monster._skillDelay[k] = Math.max(0, monster._skillDelay[k] - dt)
            if (monster._skillDelay[k] === 0) {
              const sk = (monster.skills || []).find(s => s.id === k)
              monster.skillCDs[k] = (sk && sk.cooldown) || 10
            }
          }
        }
      }
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

      // ★ 隐身计时：到期解除隐身（暗影突袭）
      if (monster._invisibleTimer && monster._invisibleTimer > 0) {
        monster._invisibleTimer -= dt
        if (monster._invisibleTimer <= 0) {
          monster._invisible = false
          monster._invisibleTimer = 0
          console.log(`[FieldBattle] ${monster.name} 隐身结束`)
        }
      }

      // ★ 冰冻 / 紧固(定身) 状态：怪物无法移动与行动（冰晶术/紧固施加），跳过移动/攻击/技能
      if (monster._frozen || monster._rooted) continue
      // ★ 眩晕状态：怪物被盾击眩晕，无法行动（跳过移动/攻击/技能），但仍可见击退位移
      if (monster._stunned && monster._stunned > 0) {
        monster._stunned = Math.max(0, monster._stunned - dt)
        monster.isMoving = false
        continue
      }

      // ★ 找最近的存活参战英雄作为攻击目标
      let nearestHero = null
      let nearestHeroPos = null
      let minHDist = Infinity
      for (const bh of battleHeroes) {
        if (!bh.hero || bh.hero.hp <= 0) continue
        const hp = bh.getPos()
        const hdx = hp.x - monster.x
        const hdy = hp.y - monster.y
        const hdist = Math.sqrt(hdx * hdx + hdy * hdy)
        if (hdist < minHDist) {
          minHDist = hdist
          nearestHero = bh.hero
          nearestHeroPos = hp
        }
      }
      // ★ 挑衅(taunt)：若存在正在挑衅的英雄，强制所有怪物锁定该英雄为攻击目标
      const tauntHero = this._fieldGetTauntHero()
      if (tauntHero) {
        nearestHero = tauntHero
        const tb = (this.battleSystem.battleHeroes || []).find(b => b.hero === tauntHero)
        nearestHeroPos = tb && tb.getPos ? tb.getPos() : { x: this.playerX, y: this.playerY }
      }
      if (!nearestHero || !nearestHeroPos) continue
      const mainHero = nearestHero

      const dx = nearestHeroPos.x - monster.x
      const dy = nearestHeroPos.y - monster.y
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

      // 5. 进入可攻击距离：普攻（近战）与技能（各自 range）解耦
      const maxSR = this._fieldMaxSkillRange(monster)
      // 5a. 技能：仅在技能自身 range 内释放（不搭普攻便车）
      if (dist <= maxSR) {
        const chosen = this._fieldChooseMonsterSkill(monster, dist, attackRange)
        if (chosen) {
          this._fieldCastMonsterSkill(monster, chosen, mainHero, dx, dy, dist)
          monster.skillUseCount = 0
          continue
        }
      }
      // 5b. 普攻：仅限近战攻击距离（attackRange），不被 9999 等全屏技能连带放大
      if (dist <= attackRange) {
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
    // ★ 兜底初始化：首次进入战斗时 strafeDir 可能未定义，
    //   若直接用 px * undefined 会导致 vx=NaN → monster.x/y 变 NaN，怪物永久卡死
    if (monster.strafeDir === undefined) monster.strafeDir = Math.random() > 0.5 ? 1 : -1
    if (monster.strafeTimer === undefined) monster.strafeTimer = 0
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
      const onDelay = monster._skillDelay && (monster._skillDelay[s.id] || 0) > 0
      if (!onDelay && (monster.skillCDs[s.id] || 0) <= 0) {
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
    const ready = monster.skills.filter(s => {
      const onDelay = monster._skillDelay && (monster._skillDelay[s.id] || 0) > 0
      return !onDelay && (monster.skillCDs[s.id] || 0) <= 0
    })
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
    if (monster.skillCDs) {
      const isBuffLike = (skill.type === 'buff' || skill.type === 'heal_self')
      const hasDuration = (skill.duration || 0) > 0
      if (isBuffLike && hasDuration) {
        // ★ 延迟冷却：效果持续期间(_skillDelay)不可重复释放；效果结束才开始计 CD
        monster._skillDelay = monster._skillDelay || {}
        monster._skillDelay[skill.id] = skill.duration
        monster.skillCDs[skill.id] = 0   // 延迟阶段 CD 尚未开始
      } else {
        monster.skillCDs[skill.id] = skill.cooldown || 10
      }
    }

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
      const dmg = Math.max(1, Math.floor(monster.atk * (monster._atkMul || 1) * (mult || skill.power || 1) - this._getHeroDef(hero) * 0.3))
      const res = this._applyHeroDamage(hero, dmg, this.playerX, this.playerY)
      if (res.hpDamage > 0) {
        this.battleSystem.damageTexts.push({
          text: `-${res.hpDamage}`,
          x: this.playerX - this.cameraX,
          y: this.playerY - this.cameraY - 60 * this.dpr,
          color: '#ff4757',
          life: 1.0, maxLife: 1.0,
          _startY: this.playerY - this.cameraY - 60 * this.dpr
        })
      }
    }

    if (skill.type === 'attack' || skill.type === 'magic') {
      // 远程攻击/魔法：必须走抛射物，禁止瞬结算（避免"隔空打人、无投射物"的视觉 bug）
      // 无 projectile 配置时兜底用默认弹道参数，保证有可见飞行过程
      if (!skill.projectile) {
        skill.projectile = { color: skill.type === 'magic' ? '#b15eff' : '#ff7b54' }
      }
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
      // ★ 暗影突袭：隐身（不可被玩家/队友选中，持续 duration 秒）
      if (skill.effect === 'invisible') {
        monster._invisible = true
        monster._invisibleTimer = skill.duration || 5
        console.log(`[FieldBattle] ${monster.name} 施放${skill.name}：进入隐身（${monster._invisibleTimer}s）`)
        if (this.game.showToast) this.game.showToast(`${monster.name} 隐入暗影！`)
      } else {
        if (this.game.showToast) this.game.showToast(`${monster.name} 使用 ${skill.name}！`)
      }
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
    // ★ 弹道命中的是当前被控者位置(playerX/Y)，应扣【被控者】的血，而非硬编码 party[0]
    //   （切换控制后被控者可能是李小宝等队友）
    const ctrl = this._getCurrentControlHero()
    const hero = ctrl && ctrl.hero ? ctrl.hero : this.party[0]
    for (let i = this.battleSystem.projectiles.length - 1; i >= 0; i--) {
      const p = this.battleSystem.projectiles[i]
      // ★ 英雄弹道（火球术等）由 _updateHeroProjectiles 处理，怪物弹道更新里跳过
      if (p.owner === 'hero') continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      // 命中判定（到达玩家附近）
      const hdx = this.playerX - p.x
      const hdy = this.playerY - p.y
      if (hero && hero.hp > 0 && (hdx * hdx + hdy * hdy) < (40 * this.dpr) ** 2) {
        const dmg = Math.max(1, Math.floor(p.atk * (p.power || 1) - this._getHeroDef(hero) * 0.3))
        const res = this._applyHeroDamage(hero, dmg, this.playerX, this.playerY)
        if (res.hpDamage > 0) {
          this.battleSystem.damageTexts.push({
            text: `-${res.hpDamage}`,
            x: this.playerX - this.cameraX,
            y: this.playerY - this.cameraY - 60 * this.dpr,
            color: '#ff4757',
            life: 1.0, maxLife: 1.0,
            _startY: this.playerY - this.cameraY - 60 * this.dpr
          })
        }
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
      // 到点（预警消失瞬间）：怪物开始跳跃动画飞向落点（不再瞬移）
      if (z.timer <= 0) {
        // ★ 跳跃动画：从怪物当前位置抛物线飞到预警落点
        if (z.monsterRef && z.monsterRef.hp > 0) {
          z.monsterRef._jumpState = {
            fromX: z.monsterRef.x,
            fromY: z.monsterRef.y,
            toX: z.x,
            toY: z.y,
            progress: 0,
            duration: 0.45,                          // 跳跃时长（秒）
            height: 160 * this.dpr,                  // 抛物线最高点高度
            zone: z                                 // 落地后结算伤害的预警区
          }
          z.monsterRef.isCastingSkill = true
          z.monsterRef.skillAnimTimer = 450          // 落地攻击演出时长（毫秒）
          z.monsterRef._jumpWarn = true              // 跳跃期间不黏住
        }
        list.splice(i, 1)
      }
    }
  }

  /**
   * ★ 怪物跳跃动画更新：抛物线飞行，落地时结算预警区伤害
   */
  proto._updateMonsterJumps = function(dt) {
    if (!this.mapMonsters) return
    for (const monster of this.mapMonsters) {
      const j = monster._jumpState
      if (!j) continue
      j.progress = Math.min(1, j.progress + dt / (j.duration || 1))
      const p = j.progress
      // 位置插值（X/Y 线性，高度抛物线）
      monster.x = j.fromX + (j.toX - j.fromX) * p
      monster.y = j.fromY + (j.toY - j.fromY) * p
      monster._jumpOffsetY = -Math.sin(Math.PI * p) * (j.height || 0)   // 渲染高度偏移（负数=向上）
      if (p >= 1) {
        // 落地：清除跳跃状态，结算伤害
        monster._jumpState = null
        monster._jumpOffsetY = 0
        monster.y = j.toY - 6 * this.dpr
        this._settleJumpDamage(j.zone, monster)
      }
    }
  }

  /**
   * ★ 跳跃落地伤害结算（玩家仍在预警区域则受伤）
   */
  proto._settleJumpDamage = function(z, monster) {
    if (!z || !monster || monster.hp <= 0) return
    const ctrl = this._getCurrentControlHero()
    const hero = ctrl && ctrl.hero ? ctrl.hero : this.party[0]
    if (hero && hero.hp > 0) {
      const hdx = this.playerX - z.x
      const hdy = this.playerY - z.y
      if ((hdx * hdx + hdy * hdy) <= z.r * z.r) {
        const dmg = Math.max(1, Math.floor(z.atk * (z.power || 1) - this._getHeroDef(hero) * 0.3))
        const res = this._applyHeroDamage(hero, dmg, this.playerX, this.playerY)
        if (res.hpDamage > 0) {
          this.battleSystem.damageTexts.push({
            text: `-${res.hpDamage}`,
            x: this.playerX - this.cameraX,
            y: this.playerY - this.cameraY - 60 * this.dpr,
            color: '#ff4757',
            life: 1.0, maxLife: 1.0,
            _startY: this.playerY - this.cameraY - 60 * this.dpr
          })
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
   * ★ 统一的英雄伤害结算（含护盾优先吸收，英雄联盟式白色护盾）
   *   所有怪物伤害入口都应走这里，避免绕过护盾逻辑。
   *   返回 { hpDamage, absorbed }
   */
  proto._applyHeroDamage = function(hero, rawDamage, sx, sy, attacker) {
    // ★ 守护(guard)：队友受击时伤害转由守护者承担
    const guardTarget = this._fieldResolveGuard(hero)
    if (guardTarget !== hero) {
      hero = guardTarget
      if (sx != null) {
        const gbh = (this.battleSystem.battleHeroes || []).find(b => b.hero === guardTarget)
        if (gbh && gbh.getPos) { const gp = gbh.getPos(); sx = gp.x; sy = gp.y }
      }
    }
    let hpDamage = rawDamage
    let absorbed = 0
    if (hero._shield && hero._shield > 0) {
      absorbed = Math.min(hero._shield, rawDamage)
      hero._shield -= absorbed
      hpDamage = rawDamage - absorbed
      if (hero._shield <= 0) hero._shield = 0
    }
    hero.hp = Math.max(0, hero.hp - hpDamage)
    if (hero.hp <= 0 && hero.alive !== false) {
      hero.alive = false
    }
    // ★ 非霸体施法被打断：英雄（AI）正在释放技能/普攻时受到 HP 伤害，技能放不出来
    if (hpDamage > 0) {
      this._interruptCastingForHero(hero)
    }
    const screenX = (sx != null) ? sx : this.playerX
    const screenY = (sy != null) ? sy : this.playerY
    if (absorbed > 0) {
      this.battleSystem.damageTexts.push({
        text: `🛡-${absorbed}`,
        x: screenX - this.cameraX,
        y: screenY - this.cameraY - 90 * this.dpr,
        color: '#ffffff',
        life: 1.0, maxLife: 1.0,
        _startY: screenY - this.cameraY - 90 * this.dpr
      })
    }
    // ★ 反击(counter)：被击中的英雄若处于反击状态，向攻击者反弹伤害
    if (hpDamage > 0 && attacker && attacker.alive !== false) {
      this._fieldApplyCounterReflect(attacker, hpDamage, hero)
    }
    return { hpDamage, absorbed }
  }

  /**
   * ★ 新增：在攻击动画的命中帧计算伤害
   */
  proto._dealMonsterDamage = function(monster, hero) {
    if (!hero || hero.hp <= 0 || monster.hasDealtDamage) return

    // ★ 守护(guard)：队友受击时伤害转由守护者承担（守护者即被击中的英雄）
    const guardTarget = this._fieldResolveGuard(hero)
    if (guardTarget !== hero) {
      hero = guardTarget
    }

    // 标记已造成伤害（防止同一攻击动画造成多次伤害）
    monster.hasDealtDamage = true

    // 计算伤害（★ 使用含 buff 加成的实际防御；虚弱状态 atk_down 降低怪物攻击）
    const damage = Math.max(1, Math.floor(monster.atk * (monster._atkMul || 1)) - Math.floor(this._getHeroDef(hero) * 0.4))

    // 暴击判定
    const isCrit = Math.random() < (monster.crit || 0.05)
    const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage

    // 应用伤害：★ 英雄护盾优先吸收（英雄联盟式白色护盾）
    //   护盾存在时先扣护盾，不足部分才扣 HP；被护盾完全吸收则不掉血
    let hpDamage = finalDamage
    let absorbed = 0
    if (hero._shield && hero._shield > 0) {
      absorbed = Math.min(hero._shield, finalDamage)
      hero._shield -= absorbed
      hpDamage = finalDamage - absorbed
      if (hero._shield <= 0) hero._shield = 0
    }
    hero.hp = Math.max(0, hero.hp - hpDamage)
    // ★ 标记本英雄最近受击时间（供 AI 条件优先级决策：自身/主角挨打时主动放护盾）
    hero._lastHitTime = Date.now() / 1000
    // ★ 阵亡标记：hp<=0 时同步 hero.alive（否则 AI 角色死亡后不会消失）
    if (hero.hp <= 0 && hero.alive !== false) {
      hero.alive = false
      console.log(`[FieldBattle] ${hero.name} 被击败！`)
    }

    // ★ 根据被攻击英雄的实际位置显示伤害数字
    let hpos = { x: this.playerX, y: this.playerY }
    const heroes = this.battleSystem.battleHeroes || []
    for (const bh of heroes) {
      if (bh.hero === hero) { hpos = bh.getPos(); break }
    }
    const screenX = hpos.x - this.cameraX
    const screenY = hpos.y - this.cameraY
    this.battleSystem.damageTexts.push({
      text: `-${hpDamage}${isCrit ? '!' : ''}`,
      x: screenX,
      y: screenY - 60 * this.dpr,
      color: isCrit ? '#FFD700' : '#FF4757',
      life: 1.0,
      maxLife: 1.0,
      _startY: screenY - 60 * this.dpr,
      isCrit: isCrit
    })
    // ★ 护盾吸收提示（白色，英雄联盟式护盾抵挡反馈）
    if (absorbed > 0) {
      this.battleSystem.damageTexts.push({
        text: `🛡-${absorbed}`,
        x: screenX,
        y: screenY - 90 * this.dpr,
        color: '#ffffff',
        life: 1.0,
        maxLife: 1.0,
        _startY: screenY - 90 * this.dpr,
        isCrit: false
      })
    }

    // ★ 反击(counter)：被击中的英雄若处于反击状态，向攻击者反弹伤害
    if (hpDamage > 0 && monster.alive !== false) {
      this._fieldApplyCounterReflect(monster, hpDamage, hero)
    }

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

    // 4. 渲染怪物血条（玩家血条/蓝条已移至 _renderWorldHealthBars，非战斗也显示）
    this._renderMonsterHealthBars(ctx)

    // 5. 角色切换按钮已统一由 field-scene 左上角角色卡片的 ↻ 按钮承载，此处不再单独绘制

    // 6. 攻击/技能动画由主角 ATTACK/SHIELD/BUFF 帧体现，不再绘制场上范围指示
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

    // 按钮文字（字号随按钮尺寸自适应，避免放大后文字过小）
    ctx.font = `${Math.round(btn.height * 0.32)}px sans-serif`
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
      // ★ BUFF 持续期间（cooldownDelay 递减中）按钮同样视为不可用
      const disabled = btn.cooldown > 0 || btn.cooldownDelay > 0
      // 按钮背景
      ctx.fillStyle = disabled ? 'rgba(128,128,128,0.8)' : 'rgba(74,158,255,0.8)'
      ctx.beginPath()
      this._roundRect(ctx, btn.x, btn.y, btn.width, btn.height, 10 * this.dpr)
      ctx.fill()

      // 按钮边框
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()

      // 按钮文字（字号随按钮尺寸自适应；名字较长时按字数缩小，避免溢出）
      const nameLen = (btn.text || '').length
      const fitScale = nameLen <= 2 ? 0.34 : (nameLen <= 3 ? 0.26 : 0.2)
      ctx.font = `${Math.round(btn.height * fitScale)}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(btn.text, btn.x + btn.width / 2, btn.y + btn.height / 2)

      // 冷却遮罩（BUFF 持续期间按 delay 剩余比例显示，之后按 cooldown 比例显示）
      if (disabled) {
        let cooldownRatio
        if (btn.cooldownDelay > 0) {
          const max = btn.cooldownDelayMax || (btn.skill.duration != null ? btn.skill.duration : ((btn.skill.turns || 1) * 2))
          cooldownRatio = Math.min(1, btn.cooldownDelay / max)
        } else {
          // 用 cooldownMax（毫秒）作为分母，避免 skill.cooldown 单位（秒）混乱
          const max = btn.cooldownMax || (btn.skill.cooldown || 3) * 1000
          cooldownRatio = Math.min(1, btn.cooldown / max)
        }
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
    // 玩家血条/蓝条/护盾条已移至 field-scene._renderWorldHealthBars（非战斗也显示，含护盾白条）
    // 此处仅渲染怪物血条
    this._renderMonsterHealthBars(ctx)
  }

  proto._renderMonsterHealthBars = function(ctx) {
    // ★ 怪物头顶血条已在 field-scene._renderCatMonster 中绘制（覆盖战斗/非战斗全场景）。
    //   此处保留为空以维持调用结构。
    return
  }

  // ==========================================================================
  // 13. 处理战斗UI点击
  // ==========================================================================
  proto._handleBattleUITap = function(tap) {
    if (!this.battleSystem.active) return false

    // ★ 角色切换按钮已移至 field-scene 左上角卡片，由那里点击后调用 _switchControl()

    // ★ 当前被控英雄（用于攻击原点与MP判定）
    const ctrl = this._getCurrentControlHero()
    const ctrlPos = ctrl ? ctrl.getPos() : { x: this.playerX, y: this.playerY }

    // 检查是否点击了攻击按钮
    if (this.battleSystem.attackButton) {
      const btn = this.battleSystem.attackButton
      if (tap.x >= btn.x && tap.x <= btn.x + btn.width &&
          tap.y >= btn.y && tap.y <= btn.y + btn.height) {
        console.log('[FieldBattle] 点击攻击按钮')

        // 普攻：先播动画，再判定范围内是否有目标
        const range = (this.battleSystem.attackRange || 100) * this.dpr
        const target = this._findNearestMonster(range, 'x', ctrlPos.x, ctrlPos.y)
        this._playerAttackMonster(target)  // target 可为 null，null 时只播动画不造成伤害
        return true
      }
    }

    // 检查是否点击了技能按钮
    if (this.battleSystem.skillButtons && this.battleSystem.skillButtons.length > 0) {
      for (const btn of this.battleSystem.skillButtons) {
        if (tap.x >= btn.x && tap.x <= btn.x + btn.width &&
            tap.y >= btn.y && tap.y <= btn.y + btn.height) {
          // ★ CD 中则不响应；BUFF 持续期间（cooldownDelay 递减中）也不可重复释放
          if (btn.cooldown > 0 || btn.cooldownDelay > 0) {
            if (btn.cooldownDelay > 0) {
              console.log(`[FieldBattle] 技能 ${btn.text} BUFF 持续中: ${Math.ceil(btn.cooldownDelay)}s`)
            } else {
              console.log(`[FieldBattle] 技能 ${btn.text} 冷却中: ${Math.ceil(btn.cooldown / 1000)}s`)
            }
            return true
          }

          // MP 不足也不响应
          const mainHero = ctrl ? ctrl.hero : null
          if (mainHero && mainHero.mp < (btn.skill.mpCost || 0)) {
            console.log(`[FieldBattle] 技能 ${btn.text} MP 不足`)
            if (this.game.showToast) this.game.showToast('MP 不足！')
            return true
          }

          console.log(`[FieldBattle] 点击技能按钮: ${btn.text}`)

          // 使用技能：先播动画，再判定范围内是否有目标
          const skillRange = (btn.skill.range != null ? btn.skill.range : 100) * this.dpr
          const skillAxis = btn.skill.axis || 'x'
          if (btn.skill.range === 0 || btn.skill.type === 'buff' || btn.skill.type === 'heal') {
            // buff类不需要目标
            this._playerAttackMonster(null, btn.skill)
          } else {
            // 攻击类：先找目标，无论有没有都播动画（target 可为 null）
            const target = this._findNearestMonster(skillRange, skillAxis, ctrlPos.x, ctrlPos.y)
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
  // 在攻击范围内寻找最近的怪物
  // axis: 'x' = 只按X轴距离判断（近战横砍），'xy' = X+Y距离（AOE/远程）
  // fromX/fromY: 可选，指定查询原点（用于队友AI；默认主角位置）
  proto._findNearestMonster = function(maxRange, axis, fromX, fromY) {
    return this._findNearestMonsterFromPos(maxRange, axis,
      fromX != null ? fromX : this.playerX,
      fromY != null ? fromY : this.playerY)
  }

  proto._findNearestMonsterFromPos = function(maxRange, axis, originX, originY, yTol) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return null
    const range = maxRange
    const useAxis = axis || 'x'  // 默认只按 X 轴

    let nearest = null
    let minDist = Infinity

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue
      // ★ 隐身怪物不可被选中（暗影突袭）
      if (monster._invisible) continue
      const dx = Math.abs(originX - monster.x)
      const dy = Math.abs(originY - monster.y)
      // X 轴距离必须InRange；Y 轴按配置决定是否判断
      const dist = useAxis === 'xy' ? Math.sqrt(dx * dx + dy * dy) : dx
      // Y 轴容差：近战允许一定Y偏差（角色身高的1.5倍），避免完全对齐才能打
      // 调用方可传入自定义 yTol 覆盖默认（队友AI需要更大容差，因为队友在主角身后跟随，Y轴天然错位）
      const yTolerance = (yTol !== undefined) ? yTol : (useAxis === 'xy' ? Infinity : (80 * this.dpr))

      if (dy > yTolerance) continue  // Y 轴偏差太大，打不到

      // 优先：已锁定的目标若在范围内直接选用
      if (this.battleSystem.battleTarget === monster && dist <= range) {
        return monster
      }
      if (dist <= range && dist < minDist) {
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
