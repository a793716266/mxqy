/**
 * battle-scene.js - 实时自由攻击战斗系统（ARPG）—— 协调器
 *
 * 本文件是 BattleScene 的主入口，仅负责：
 *   - 类定义和构造函数（属性初始化）
 *   - init() 生命周期方法
 *   - 导入并安装所有功能模块
 *
 * 功能模块（按职责拆分，位于 ./battle/ 目录）：
 *   - battle-combat.js     → 移动/碰撞/AI/属性计算/自动战斗核心 (~1600行)
 *   - battle-damage.js     → 伤害结算/施法特效/状态效果 (~650行)
 *   - battle-animation.js  → 帧动画/粒子特效/敌人攻击动画 (~1100行)
 *   - battle-renderer.js   → 全部渲染操作 (~2000行)
 *   - battle-input.js      → 输入处理/感化剧情/几何工具 (~450行)
 *   - battle-assets.js     → 图片资源key/缩放/颜色 (~150行)
 *
 * 模块通过 install 函数将方法挂载到 BattleScene.prototype 上，
 * 因此外部调用方式完全不变：scene._updateAutoBattle(dt), scene.render(ctx) 等
 */

import { ENEMIES_CH1, getEnemyByLevel } from '../data/enemies.js'
import { HEROES } from '../data/heroes.js'
import { charStateManager, CharacterState } from '../data/character-state.js'
import { getBossDrop, getRandomEquipment } from '../data/equipment.js'
import { Renderer2D5 } from '../engine/renderer-2.5d.js'
import { CollisionEngine } from '../engine/collision-engine.js'
import { SceneBase } from '../core/scene-base.js'
import { CharacterSprite } from '../core/character-sprite.js'

// 导入所有功能模块的安装函数
import { installBattleCombat } from './battle/battle-combat.js'
import { installBattleDamage } from './battle/battle-damage.js'
import { installBattleAnimation } from './battle/battle-animation.js'
import { installBattleRenderer } from './battle/battle-renderer.js'
import { installBattleInput } from './battle/battle-input.js'
import { installBattleAssets } from './battle/battle-assets.js'
import { installBattleBackground } from './battle/sunny-grassland-bg.js'

export class BattleScene extends SceneBase {
  constructor(game, data) {
    super(game)
    
    // ====== 战斗数据 ======
    this.party = data.party || []
    this.enemies = data.enemies || (data.enemy ? [data.enemy] : [])
    this.enemy = this.enemies[0] || {}
    this.bgKey = data.bg || 'BG_GRASSLAND'
    this.nodeId = data.nodeId
    this.monsterId = data.monsterId
    this._testMode = data._testMode || false  // ★ 测试模式标记

    // ====== 战斗状态（实时制） ======
    this.phase = 'intro'  // intro, auto_battle, animating, victory, defeat, purify
    this.turn = 1
    this.selectedHero = null
    this.selectedSkill = null
    this.actionQueue = []

    // ====== 实时战斗控制 ======
    this.battleSpeed = 1
    this.isPaused = false
    this.time = 0
    this.MAX_CONCURRENT_ATTACKS = 2
    this.activeAttackers = new Set()

    // ====== 攻击计时器系统 ======
    this.heroAttackTimers = {}
    this.enemyAttackTimers = {}

    // ====== 状态效果系统 ======
    this.statusEffects = {
      enemies: {},
      heroes: {}
    }

    // ====== 实时距离战斗系统常量 ======
    this.unitStates = {}
    this.MELEE_RANGE = 80 * this.dpr  // 近战接触距离：80像素（原40太小，敌人因碰撞无法接近）
    this.RANGED_RANGE = this.height * 0.22
    this.MOVE_SPEED_BASE = 120

    // ====== 动画相关 ======
    this.shakeAmount = 0
    this.damageTexts = []
    this.flashAlpha = 0

    // ====== 滚动日志 ======
    this.log = []
    this.logScroll = 0

    // ====== 调试日志系统 ======
    this._debugLogs = []           // 存储调试日志
    this._debugLogEnabled = true   // 是否启用日志收集
    this._maxDebugLogs = 1000      // 最多保存1000条日志

    // ====== 敌人动画位置 ======
    this.enemyBaseX = this.width * 0.7
    this.enemyBaseY = this.height * 0.28
    this.enemyX = this.enemyBaseX
    this.enemyY = this.enemyBaseY

    // ====== UI区域定义 ======
    this.skillButtons = []
    this.targetAreas = []
    this.heroAreas = []

    // ====== 攻击动画状态 ======
    this.attackingHero = null
    this.attackAnim = null
    this.heroBasePositions = []
    this.currentSkill = null
    this.currentAttackTarget = null
    this._currentEnemySkill = null

    // 敌人攻击动画
    this.enemyAttacking = false
    this.enemyAttackAnim = null
    this.enemyAttackTarget = null
    this.enemyAttackQueue = []
    this.currentEnemyIndex = 0

    // 角色分页
    this.heroPage = 0
    this.heroPerPage = 3
    this.totalHeroPages = Math.ceil((this.party.length || 0) / this.heroPerPage)

    // 敌人动画状态（由 _initEnemyAnimations 填充）
    this.enemyAnimStates = {}

    // 角色动画状态（由 _initHeroAnimations 填充）
    this.heroAnimStates = {}
    this.lastCastEffectType = {}

    // HP/MP延迟过渡动画（构造时hp可能尚未设置，用maxHp兜底）
    this.enemyHpDelay = this.enemies.map(e => {
      const hp = e.hp || e.maxHp || 100
      const currentSegment = hp <= 0 ? 0 : Math.floor((hp - 1) / 100)
      return { delay: 1.0, lastSegment: currentSegment }
    })
    this.enemyDeathAnim = this.enemies.map(() => ({ alpha: 1.0, fading: false, timer: 0 }))
    this.heroHpDelay = this.party.map(h => h.hp / h.maxHp)
    this.heroMpDelay = this.party.map(h => h.mp / h.maxMp)

    // 代码特效系统
    this.codeEffects = []

    // 2.5D 渲染引擎
    this._renderEngine = new Renderer2D5({ dpr: this.dpr, width: this.width, height: this.height })
    this._renderEngine.setAssets(this.game.assets)

    // 物理碰撞引擎
    this._physics = new CollisionEngine({ dpr: this.dpr })

    // 感化剧情状态
    this.purifyTimer = 0
    this.purifyStep = 0

    // Timer 管理（统一清理，防止跨场景泄漏）
    this._pendingTimers = []

    // ====== 队长操作模式（摇杆+技能按钮） ======
    this._captainMode = true            // 启用摇杆操作
    this._controlledHero = null         // 当前操控的角色对象（init时设置为party[0]）
    this._joystick = { active: false, touchId: null, currentX: 0, currentY: 0 }
    this._joystickConfig = null         // init时由 _initCaptainUI 填充
    this._aoeFx = null                  // 扇形技能/攻击范围指示（王者荣耀式）
    this._attackBtn = null              // 普攻按钮区域 {x, y, radius}
    this.enemyIsAttacking = {}         // 敌人攻击状态标记（防止undefined错误）
    this._skillBtns = []                // 技能按钮 [{skill, x, y, radius, disabled}]
    this._switchBtns = []               // 角色切换按钮 [{hero, x, y, w, h}]

    // 初始化动画状态
    this._initEnemyAnimations()
    this._initHeroAnimations()
    
    // 安装战斗背景生成器
    installBattleBackground(BattleScene)
  }

  // 统一 setTimeout 封装（自动跟踪，destroy 时统一清理）
  _scheduleTimer(fn, delay) {
    const id = setTimeout(() => {
      const idx = this._pendingTimers.indexOf(id)
      if (idx >= 0) this._pendingTimers.splice(idx, 1)
      fn()
    }, delay)
    this._pendingTimers.push(id)
    return id
  }

  init() {
    console.log('[Battle] 初始化实时战斗场景')
    console.log('[Battle] 构造函数接收的 data.party:', this.party)
    console.log('[Battle] 构造函数接收的 data.enemies:', this.enemies)
    console.log('[Battle] 构造函数接收的 data._testMode:', this._testMode)
    
    // 初始化调试日志系统
    this._initDebugLogSystem()

    console.log('[Battle] party:', this.party)
    console.log('[Battle] enemies:', this.enemies)

    // ★ 敌人数据映射（用于summon技能查找召唤怪数据）
    this._enemyDataMap = ENEMIES_CH1

    if (!this.party || !Array.isArray(this.party)) {
      console.error('[Battle] party 数据不存在或不是数组')
      this.party = []
    }

    // 标准化 enemies：支持 {id, level} 格式和完整数据格式
    this.enemies = this.enemies.map(enemy => {
      // 如果只有 id 和 level，查表补全数据
      if (enemy.id && !enemy.name) {
        // _enemyDataMap 是对象，需要先取 values 再 find
        const enemyData = Object.values(this._enemyDataMap).find(e => e.id === enemy.id)
        if (!enemyData) {
          console.error(`[Battle] 找不到敌人数据: ${enemy.id}`)
          console.error(`[Battle] 可用的敌人数据:`, Object.keys(this._enemyDataMap))
          return enemy
        }
        const level = enemy.level || 1
        const fullData = getEnemyByLevel(enemyData, level)
        console.log(`[Battle] 加载敌人数据: ${enemy.id} Lv.${level}, 名称: ${fullData.name}, maxHp:${fullData.maxHp}, hp:${fullData.hp}`)
        const result = { ...fullData, hp: fullData.maxHp || fullData.hp }
        console.log(`[Battle] 敌人数据加载结果: ${result.name}, HP=${result.hp}, maxHp=${result.maxHp}`)
        return result
      }
      // 已有完整数据，补全 hp
      if (!enemy.hp && enemy.hp !== 0) enemy.hp = enemy.maxHp
      console.log(`[Battle] 敌人已有完整数据: ${enemy.name}, HP=${enemy.hp}, maxHp=${enemy.maxHp}`)
      return enemy
    })
    console.log(`[Battle] 敌人加载完成:`, this.enemies.map(e => `${e.name}(HP:${e.hp}/${e.maxHp})`).join(', '))

    // ★ 强制修复：确保 lost_healer_cat 的 spriteType 正确
    this.enemies.forEach((enemy, idx) => {
      if (enemy.id === 'lost_healer_cat' || enemy.name === '迷途的治愈猫') {
        console.log(`[Battle] 强制修复：${enemy.name} 的 spriteType`)
        if (!enemy.renderConfig) {
          enemy.renderConfig = {}
        }
        enemy.renderConfig.spriteType = 'aimi'
        enemy.type = 'aimi'  // 同时设置 type
        enemy.spriteType = 'aimi'  // 再设置一个直接属性，三重保险
        console.log(`[Battle] 修复后: renderConfig.spriteType=${enemy.renderConfig.spriteType}, type=${enemy.type}`)
      }
    })

    this.enemy = this.enemies[0] || {}

    // ★ BOSS 专属音乐：任一敌人是 BOSS 就切到 The King（PvZ Zomboss 风格）
    //
    // ⚠️ 这不是副本 BOSS 战的主路径！副本战斗根本不进 BattleScene
    //    （changeScene('battle') 全工程只在 map-scene 与 main-menu 出现；
    //     副本是 FieldScene 里的实时 battleSystem，进图即 active）。
    //    副本 BOSS 的切歌在 `field-scene._updateBossBGM()`。
    //    这段只是兜底：哪天有别的地方（map-scene 等）用 BattleScene 打 BOSS，
    //    这里能保证音乐还是对的。
    //
    // 为什么写在这里、而不是改 SCENE_BGM['battle']：
    //   SCENE_BGM 是"场景 → 曲目"的静态映射，表达不了"同样是 battle 场景、
    //   但这次打的是 BOSS"这个区别 —— 它无法读到敌人数据。
    //
    // 为什么能覆盖默认曲：
    //   playBGM() 会置 audio._explicitBGM = true；而 game.changeScene 的顺序是
    //   init() → audio.setScene(sceneName)，setScene 看到 _explicitBGM 为真就会
    //   尊重场景的选择、不再播放 bgm_battle。非 BOSS 战这里不调用，
    //   _explicitBGM 保持 false，setScene 照常兜底播 bgm_battle。
    if (this.enemies.some(e => e && e.isBoss)) {
      if (this.game.audio && this.game.audio.playBGM) {
        this.game.audio.playBGM('bgm_the_king')
      }
    }

    // 标准化 party：支持字符串数组（['hero_lixiaobao']）和对象数组（[{id: 'hero_lixiaobao'}]）两种格式
    this.party = this.party.map(h => {
      // 如果是字符串（英雄ID），先查 HEROES 获取完整数据
      if (typeof h === 'string') {
        const heroData = HEROES.find(hd => hd.id === h)
        if (!heroData) {
          console.error(`[Battle] 找不到英雄数据: ${h}`)
          return { id: h, hp: 100, maxHp: 100, mp: 50, maxMp: 50, atk: 10, def: 10, spd: 10, skills: [], buffs: [] }
        }
        return {
          ...heroData,
          hp: heroData.maxHp,
          mp: heroData.maxMp,
          buffs: []
        }
      }
      // 如果是对象，补全属性
      return {
        ...h,
        hp: Math.min(h.hp || h.maxHp || 100, h.maxHp || 100),
        mp: Math.min(h.mp || h.maxMp || 50, h.maxMp || 50),
        buffs: h.buffs || []
      }
    })
    
    // ★ 测试模式：自动将李小宝设为1000级
    console.log(`[Battle] init() 开始，_testMode=${this._testMode}`)
    if (this._testMode) {
      console.log('[Battle] 测试模式：将李小宝设为1000级')
      const lixiaobaoIndex = this.party.findIndex(h => h.id === 'lixiaobao')
      if (lixiaobaoIndex >= 0) {
        const heroData = HEROES.find(h => h.id === 'lixiaobao')
        if (heroData) {
          const state = new CharacterState(heroData)
          state.setTestLevel(1000)
          // 更新party中的属性
          this.party[lixiaobaoIndex] = {
            ...this.party[lixiaobaoIndex],
            maxHp: state.maxHp,
            maxMp: state.maxMp,
            atk: state.atk,
            def: state.def,
            spd: state.spd,
            hp: state.hp,
            mp: state.mp,
            level: state.level,
            exp: 0
          }
          console.log(`[Battle] 李小宝已设为 Lv.1000，属性：HP=${state.maxHp}, ATK=${state.atk}, DEF=${state.def}`)
        }
      }
    }

    // ★ 为每个队伍成员创建 CharacterSprite（用于统一渲染）
    this.party.forEach((hero, index) => {
      const heroData = HEROES.find(h => h.id === hero.id)
      if (heroData) {
        const spriteData = { ...heroData, ...hero }
        hero.sprite = new CharacterSprite(this.game, spriteData)
      }
    })

    // ★ 重新初始化英雄动画状态（构造函数调用时party还是字符串，现在已转为对象）
    this._initHeroAnimations()

    console.log('[Battle] 处理后的 party:', this.party)
    console.log('[Battle] 处理后的 enemies:', this.enemies)

    this._initHeroAreas()
    this._initAllHeroPositions()
    this._initEnemyPositions()
    
    // ★ 测试模式：禁用英雄自动攻击，但保留敌人AI
    if (this._testMode) {
      console.log('[Battle] 测试模式：已禁用英雄自动攻击，使用摇杆和攻击按钮手动控制')
      // 只初始化敌人攻击计时器（敌人AI需要）
      this._initEnemyAttackTimersOnly()
      // ★ 强制：将英雄【自动攻击】计时器设为永远不会触发的值（测试模式靠按钮手动控制）
      this.party.forEach(hero => {
        this.heroAttackTimers[hero.id] = {
          attackTimer: Infinity,  // ★ 无穷大，永远不会自动触发
          skillCDs: {},
          _hasFirstAttacked: false,
          _needsFirstStrike: false
        }
        // ★ 技能 CD 初始化为 0（就绪），确保技能按钮可用；
        //   手动释放技能时由 _captainManualSkill 按 nodeId 决定是否重新计 CD
        hero.skills.forEach(skill => {
          this.heroAttackTimers[hero.id].skillCDs[skill.id] = 0
        })
      })
      console.log('[Battle] 测试模式：英雄攻击计时器已禁用', this.heroAttackTimers)
    } else {
      // 正常模式：初始化所有攻击计时器
      this._initAutoBattleTimers()
    }
    
    this._initUnitStates()

    this._addLog(`⚔️ 战斗开始！`)
    this._addLog(`野生的 ${this.enemies.map(e => e.name).join('、')} 出现了！`)

    this.phase = 'auto_battle'
    this.time = 0

    // 初始化队长模式
    // ★ 强制启用队长模式（确保触摸事件绑定）
    this._captainMode = true
    if (this._captainMode && this.party.length > 0) {
      this._controlledHero = this.party[0]
      this._initCaptainUI()
      this._initCaptainInput()
      console.log(`[Battle] 队长模式启用，操控角色：${this._controlledHero.name}`)
      console.log(`[Battle] 摇杆配置:`, this._joystickConfig)
      console.log(`[Battle] 攻击按钮:`, this._attackBtn)
    } else {
      console.error('[Battle] 队长模式未启用！_captainMode=', this._captainMode, ', party.length=', this.party.length)
    }
    
    // ★ 初始化程序化背景生成器
    this._initBattleBackground()
    
    console.log('[Battle] 立即进入自动战斗模式, phase=' + this.phase)
    console.log('[Battle] init() 完成, _captainMode=' + this._captainMode + ', _controlledHero=' + (this._controlledHero ? this._controlledHero.name : 'null'))
  }

  _initCaptainUI() {
    const dpr = this.dpr
    const h = this.height
    const w = this.width

    // 摇杆（左下角固定）
    this._joystickConfig = {
      centerX: 100 * dpr,
      centerY: h - 120 * dpr,
      baseRadius: 55 * dpr,
      handleRadius: 28 * dpr,
      maxOffset: 45 * dpr,
      deadZone: 5 * dpr,
    }

    // 普攻按钮（右下角大圆）
    this._attackBtn = {
      x: w - 80 * dpr,
      y: h - 130 * dpr,
      radius: 38 * dpr,
    }

    // 技能按钮（普攻上方扇形排列）
    this._refreshSkillButtons()

    // 角色切换按钮（底部横排）
    this._refreshSwitchButtons()
  }

  _refreshSkillButtonCDs() {
    const hero = this._controlledHero
    if (!hero) return
    const timer = this.heroAttackTimers[hero.id]
    console.log(`[CD-DEBUG] _refreshSkillButtonCDs: hero=${hero?.name}, timer=${!!timer}, skillCDs=${timer ? JSON.stringify(timer.skillCDs) : 'N/A'}`)
    for (const btn of this._skillBtns) {
      const cdRemaining = timer ? timer.skillCDs[btn.skill.id] || 0 : 0
      btn.disabled = cdRemaining > 0 || hero.mp < (btn.skill.mpCost || 0)
      btn.cdRemaining = cdRemaining
    }
  }

  _refreshSkillButtons() {
    const hero = this._controlledHero
    this._skillBtns = []
    if (!hero || !hero.skills) {
      console.log(`[CD-DEBUG] _refreshSkillButtons: hero=${hero?.name}, skills=${hero?.skills?.length || 0}`)
      return
    }

    const dpr = this.dpr
    const h = this.height
    const w = this.width
    const baseX = w - 80 * dpr        // 与普攻同列
    const baseY = h - 200 * dpr       // 普攻上方
    const btnR = 24 * dpr
    const spacing = 55 * dpr

    // 取前 3 个非普攻技能（skip mpCost===0 的普攻技能）
    const nonBasicSkills = hero.skills.filter(s => (s.mpCost || 0) > 0 || s.type !== 'attack')
    const displaySkills = nonBasicSkills.length >= 3 ? nonBasicSkills : hero.skills
    const skills = displaySkills.slice(0, 3)

    skills.forEach((skill, i) => {
      const angle = -Math.PI * 0.65 + i * (Math.PI * 0.5 / Math.max(1, skills.length - 1))
      const sx = baseX + Math.cos(angle) * spacing
      const sy = baseY + Math.sin(angle) * spacing
      const timer = this.heroAttackTimers[hero.id]
      const cdRemaining = timer ? timer.skillCDs[skill.id] || 0 : 0
      this._skillBtns.push({
        skill,
        x: sx,
        y: sy,
        radius: btnR,
        disabled: cdRemaining > 0 || hero.mp < (skill.mpCost || 0),
        cdRemaining,
      })
    })
  }

  _refreshSwitchButtons() {
    const dpr = this.dpr
    const h = this.height
    const w = this.width
    const btnW = 44 * dpr
    const btnH = 44 * dpr
    const gap = 6 * dpr
    const totalW = this.party.length * btnW + (this.party.length - 1) * gap
    const startX = (w - totalW) / 2
    const startY = h - 45 * dpr

    this._switchBtns = this.party.map((hero, i) => ({
      hero,
      x: startX + i * (btnW + gap),
      y: startY,
      w: btnW,
      h: btnH,
    }))
  }

  destroy() {
    // 清理队长模式触摸事件
    this._cleanupCaptainInput()
    // 清理所有 pending timer（防止跨场景泄漏）
    this._pendingTimers.forEach(id => clearTimeout(id))
    this._pendingTimers = []
    this._renderEngine.clear()
    this._physics.clearUnits()
    this.codeEffects = []
    this.damageTexts = []
  }

  pause() {
    if (this.phase === 'auto_battle' || this.phase === 'animating') {
      this.isPaused = true
    }
  }

  resume() {
    this.isPaused = false
  }

  resize(w, h) {
    this.width = w
    this.height = h
    this.RANGED_RANGE = this.height * 0.22
  }

  // ========== 调试日志系统（微信小游戏版） ==========
  /**
   * 初始化调试日志系统
   */
  _initDebugLogSystem() {
    if (this._debugLogInitialized) return
    
    // 微信小游戏环境：只初始化标记，不包装 console.log
    this._debugLogInitialized = true
    console.log('[Debug] 日志系统已初始化，调试日志将保存到 scene._debugLogs 数组')
  }

  /**
   * 添加调试日志（输出到控制台 + 保存到内存）
   * @param {string} message - 日志消息
   */
  _addDebugLog(message) {
    if (!this._debugLogEnabled) return
    
    // 输出到控制台（微信开发者工具可以看到）
    console.log(message)
    
    // 保存到数组
    const timestamp = new Date().toLocaleTimeString()
    const logMessage = `[${timestamp}] ${message}`
    this._debugLogs.push(logMessage)
    
    // 限制日志数量（最多保存1000条）
    if (this._debugLogs.length > this._maxDebugLogs) {
      this._debugLogs.shift()
    }
  }

  /**
   * 获取调试日志（用于复制到剪贴板或发送到服务器）
   * @returns {string} 所有日志的文本内容
   */
  getDebugLogs() {
    if (this._debugLogs.length === 0) {
      return '[Debug] 没有调试日志'
    }
    return this._debugLogs.join('\n')
  }

  /**
   * 清空调试日志
   */
  clearDebugLogs() {
    this._debugLogs = []
    console.log('[Debug] 调试日志已清空')
  }
  
  /**
   * 将调试日志发送到服务器（通过微信小游戏的 wx.request）
   * @param {string} serverUrl - 服务器URL
   */
  uploadDebugLogs(serverUrl) {
    if (this._debugLogs.length === 0) {
      console.log('[Debug] 没有调试日志可上传')
      return
    }
    
    const content = this._debugLogs.join('\n')
    
    // 微信小游戏环境使用 wx.request
    if (typeof wx !== 'undefined' && wx.request) {
      wx.request({
        url: serverUrl,
        method: 'POST',
        data: {
          logs: content,
          timestamp: Date.now()
        },
        success: () => console.log('[Debug] 日志上传成功'),
        fail: (err) => console.error('[Debug] 日志上传失败', err)
      })
    } else {
      // 浏览器环境使用 fetch
      fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: content
      }).then(() => console.log('[Debug] 日志上传成功'))
        .catch(err => console.error('[Debug] 日志上传失败', err))
    }
  }
}

// ========== 安装所有功能模块到 BattleScene.prototype ==========
// 安装顺序不重要，因为每个模块只往 prototype 上添加自己的一组方法
installBattleAssets(BattleScene)
installBattleCombat(BattleScene)
installBattleDamage(BattleScene)
installBattleAnimation(BattleScene)
installBattleRenderer(BattleScene)
installBattleInput(BattleScene)
