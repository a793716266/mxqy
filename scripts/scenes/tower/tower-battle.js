/**
 * tower-battle.js - 闯关战斗核心（重构版 - 纯调度器）
 *
 * 架构：Context对象模式
 *   本文件只保留 class TowerBattle 的构造函数、update 主循环、生命周期管理
 *   所有业务逻辑拆分到独立模块:
 *     - tower-config.js    : 常量/精灵帧映射/配置表
 *     - tower-collision.js : 碰撞检测工具函数
 *     - tower-effects.js    : 特效引擎（粒子/飘字/命中帧/光环等）
 *     - tower-combat.js     : 伤害计算/技能施放/Buff系统
 *     - tower-monsters.js   : 怪物AI/攻击/技能实现/渲染
 *     - tower-characters.js: 角色更新/AI移动/动画/渲染
 *     - tower-waves.js      : 波次刷怪/虫洞/过场动画/掉落物
 *     - tower-equipment.js : 装备穿戴/背包/合成/出售/面板
 *     - tower-ui.js        : 全部Canvas渲染/交互/HUD/技能栏/策略栏
 *
 * @author Meow Star Native Team
 * @version 2.0 (refactored)
 */

// ============================================================
//  外部依赖（CommonJS require）
// ============================================================
const _equipModule = require('../../data/equipment.js')

// ============================================================
//  加载子模块
// ============================================================
const Config = require('./tower-config')
const Collision = require('./tower-collision')
const Effects = require('./tower-effects')
const Combat = require('./tower-combat')
const Monsters = require('./tower-monsters')
const Characters = require('./tower-characters')
const Waves = require('./tower-waves')
const Equipment = require('./tower-equipment')
const UI = require('./tower-ui')

// ============================================================
//  从 config 模块重新导出常用常量（保持向后兼容）
// ============================================================
const { QUALITY_COLORS, QUALITY_NAMES, QUALITY_DROP_CHANCE, DROP_LIFETIME, RESPAWN_TABLE, EXP_TABLE,
         MONSTER_SPRITES, HERO_SPRITES, HIT_EFFECTS, SKILL_VISUAL,
         BURN_DEBUFF, RARITY_CONFIG } = Config

// ============================================================
//  TowerBattle 类 - 纯调度器
// ============================================================

class TowerBattle {
  /**
   * 构造闯关战斗场景
   * @param {object} opts - 配置选项
   * @param {HTMLCanvasElement|wx.Canvas} opts.canvas - Canvas元素
   * @param {number} opts.width - 画布宽度
   * @param {number} opts.height - 画布高度
   * @param {object} opts.stage - 关卡数据 { id, name, waves, ... }
   * @param {object} opts.scene - 父Scene引用（用于存档）
   */
  constructor(opts) {
    this.canvas = opts.canvas
    this.ctx = opts.canvas.getContext('2d') || opts.canvas.getContext({ alpha: false })
    this.width = opts.width
    this.height = opts.height
    this.dpr = opts.dpr || 1
    this.stage = opts.stage
    this.scene = opts.scene
    this.assets = opts.assets

    // ===== 阶段状态 =====
    this.phase = 'card_select'  // card_select → battle → victory/defeat

    // ===== 战斗实体 =====
    this.party = (opts.party || []).map(c => ({
      // 确保所有必要字段都存在
      ...c,
      currentHp: c.currentHp ?? c.maxHp,
      currentMp: c.currentMp ?? c.maxMp,
      _animStartTime: c._animStartTime || Date.now(),
      animState: c.animState || 'idle',
      skillCDs: c.skillCDs || {},
      buffs: c.buffs || [],
      statusEffects: c.statusEffects || [],
      equippedItems: c.equippedItems || {},
      autoAttackEnabled: c.autoAttackEnabled !== false,
      // Buff系统依赖的基础属性
      _baseSpd: c._baseSpd || c.spd || c.moveSpeed || 180,
      _baseMoveSpeed: c._baseMoveSpeed || c.moveSpeed || 180,
    }))
    this.monsters = []           // 怪物数组
    this.projectiles = []         // 投射物数组
    this.droppedItems = []       // 地面掉落物品

    // ===== 特效系统 =====
    this.effects = []             // 特效对象数组（飘字/粒子/光环/光束等）
    this.particles = []           // 简单粒子数组
    this.floatingTexts = []       // 浮动文字

    // ===== 相机 =====
    this.camera = { shakeX: 0, shakeY: 0 }

    // ===== 虫洞传送系统（替代水晶） =====
    this.wormhole = {
      active: false, x: 0, y: 0, radius: 60, interactRadius: 80,
      spawnAnim: 0, animTimer: 0, pulseTimer: 0, triggered: false, lastTriggerTime: 0
    }
    this.transition = { active: false, phase: 'none', alpha: 0, timer: 0, label: '', callback: null, holdDuration: 800 }

    // ===== 波次系统 =====
    this.waveIndex = 0            // 当前波次（0-based，对应waveDefs数组索引）
    this.totalWaves = Array.isArray(this.stage?.waves) ? this.stage.waves.length : (this.stage?.waves || 5)
    this.waveActive = false
    this.waveCooldownTimer = 0
    this.allWavesDone = false
    this.waveSpawnedCount = 0
    this.waveTotalCount = 0
    this._waveConfig = null

    // ===== 过场冷却（防止连穿） =====
    this._transitionCooldown = 0

    // ===== 卡牌选择阶段 =====
    this.cardPhase = { cards: [], selectedIndex: -1, confirmed: false, animTimer: Date.now(), _confirmTime: 0 }

    // ===== 装备/背包系统 =====
    this.inventory = []
    this.maxInventorySize = 8
    this.gold = 0
    this.equipPanel = { visible: false, item: null, selectedCharIndex: -1, animTimer: 0, charButtons: [], invIndex: -1 }
    this._sellTargetIndex = -1
    this._lastTapSlot = null
    this._hoveredItem = null
    this._tooltipTimer = null
    this._synthCost = 50
    this._DOUBLE_TAP_MS = 350

    // ===== 角色选择/UI状态 =====
    this.selectedCharIndex = 0
    this.skillMenu = { visible: false, charIndex: -1, openTimer: 0, maxDuration: 10000, buttons: [], aiButton: null }

    // ===== 战术设置 =====
    this.battleTactics = {
      targetPriority: 'nearest',  // nearest | lowestHp | ranged
      holdPosition: false,          // 坚守位置（不自动移动）
    }

    // ===== 统计数据 =====
    this.stats = { kills: 0, dropsCollected: 0, time: 0, damageDealt: 0, damageTaken: 0 }

    // ===== 时间 =====
    this.battleTime = 0
    this._lastUpdateTime = 0
    this._respawnBoost = 0
    this._expBonus = 0

    // ===== 回调标记 =====
    this._backToResult = false

    // ===== 波次/刷怪状态（子模块引用）=====
    this.stageConfig = this.stage           // 子模块兼容别名
    this.waveDefs = this.stage?.waves || [] // 波次定义数组
    this.waveCooldown = this.stage?.waveCooldown || 3000
    this.spawnTimer = 0                     // 刷怪计时器
    this._firstWaveSpawned = false          // 首波是否已刷
    this._waveClearCooldownActive = false   // 波次清除冷却中
    this._dropRareBoost = 0                // 稀有掉落加成
    this._RARITY_CONFIG = RARITY_CONFIG     // 品质配置（从Config导入）

    // ===== UI 边界/按钮缓存（子模块引用）=====
    this._backBtnBounds = null              // 返回按钮区域
    this._bottomPanelBounds = null          // 底部面板区域
    this._tacticButtons = []                // 战术按钮
    this._skillBarButtons = []              // 技能栏按钮
    this._inventorySlots = []               // 背包格子
    this._charEquipSlots = []               // 角色装备槽
    this._synthButton = null                // 合成按钮
    this._sellButton = null                 // 出售按钮
    this._charSwitchBtns = []               // 角色切换按钮
    this.tapPos = null                      // 最后点击位置

    console.log(`[Tower] ⚔️ 创建战斗实例: ${this.stage.name}, 总波次: ${this.totalWaves}`)

    // 初始化
    this._initCardPhase()
  }

  // ========== 初始化阶段 ==========

  /** 初始化卡牌选择阶段（生成3张随机祝福卡） */
  _initCardPhase() {
    const cards = this._generateBlessingCards(3)
    this.cardPhase = { cards, selectedIndex: -1, confirmed: false, animTimer: Date.now(), _confirmTime: 0 }
    this.phase = 'card_select'
  }

  /** 生成N张随机祝福卡牌 */
  _generateBlessingCards(count) {
    const pool = [
      { name: '锋利之刃', icon: '🗡', desc: '全体攻击力+15%', color: '#f97316', rare: true,
        effect: (battle) => { (battle.party || []).forEach(c => { c.atk = Math.floor(c.atk * 1.15) }) }},
      { name: '守护壁垒', icon: '🛡️', desc: '全体防御力+20%', color: '#3b82f6', rare: false,
        effect: (battle) => { (battle.party || []).forEach(c => { c.def = Math.floor((c.def || 5) * 1.2) }) }},
      { name: '极速靴', icon: '💨', desc: '全体移动速度+25%', color: '#10b981', rare: false,
        effect: (battle) => { (battle.party || []).forEach(c => { c.moveSpeed = Math.floor((c.moveSpeed || 120) * 1.25) }) }},
      { name: '生命源泉', icon: '💖', desc: '全体最大HP+30%', color: '#ef4444', rare: true,
        effect: (battle) => { (battle.party || []).forEach(c => { const bonus = Math.floor(c.maxHp * 0.3); c.maxHp += bonus; c.currentHp += bonus }) }},
      { name: '暴怒之血', icon: '😤', desc: '全体暴击率+10%', color: '#ef4444', rare: false,
        effect: (battle) => { (battle.party || []).forEach(c => { c.critChance = (c.critChance || 0) + 0.1 }) }},
      { name: '经验加成', icon: '📚', desc: '获得经验+50%', color: '#a78bfa', rare: false,
        effect: (battle) => { battle._expBonus = 0.5 } },
      { name: '金币祝福', icon: '💰', desc: '开局+100金币', color: '#f1c40f', rare: false,
        effect: (battle) => { battle.gold += 100 } },
      { name: '复活加速', icon: '✨', desc: '复活时间-30%', color: '#c084fc', rare: true,
        effect: (battle) => { battle._respawnBoost = 0.3 } },
    ]
    const selected = []
    for (let i = 0; i < count; i++) {
      let idx
      do { idx = Math.floor(Math.random() * pool.length) } while (selected.includes(idx))
      selected.push(idx)
    }
    return selected.map(i => ({ ...pool[i] }))
  }

  /** 应用卡牌效果（由UI模块调用确认后触发） */
  _applyCardEffect(card) {
    if (card && card.effect) {
      try {
        card.effect(this)
      } catch (e) {
        console.error(`[Tower] ⚠️ 卡牌效果执行异常: ${card.name}`, e)
      }
    }
    console.log(`[Tower] 🃜 卡牌效果生效: ${card.name}`)
  }

  // ========== 位置初始化 ==========

  /** 初始化角色和怪物位置 */
  _initPositions() {
    const area = this._getBattleArea()
    const areaH = area.bottom - area.top
    const areaW = area.right - area.left

    // ★ 角色站在战斗区域下半部（视觉上在下方1/3处），不用绝对bottom偏移
    const charBaseY = area.top + areaH * 0.68

    console.log(`[InitPos] battleArea: L=${area.left} R=${area.right} T=${area.top} B=${area.bottom} W=${Math.round(areaW)} H=${Math.round(areaH)}`)
    console.log(`[InitPos] charBaseY=${Math.round(charBaseY)}, bottom-baseY差=${Math.round(area.bottom - charBaseY)}`)

    // 角色初始位置（左侧区域分散排列）
    if (Array.isArray(this.party)) {
      this.party.forEach((c, i) => {
        c.x = area.left + areaW * 0.08 + i * (areaW * 0.10) + (Math.random() - 0.5) * 20
        c.y = charBaseY + (Math.random() - 0.5) * 20
        c.targetX = c.x; c.targetY = c.y
        c.facingRight = true
        c.animState = 'idle'
        c._animStartTime = Date.now()
        c.isDead = false; c.respawnTimer = 0
        c.currentHp = c.maxHp; c.currentMp = c.maxMp || 30
        c.skillCDs = {}; c.buffs = []; c.statusEffects = []
        c.equippedItems = {}
        c.autoAttackEnabled = true
        // ★ 确保初始位置在战斗区域内
        this._clampToBattleArea(c)
        c.targetX = c.x; c.targetY = c.y // clamp 后重新同步目标点
        console.log(`[InitPos] char[${i}] ${c.name||c.heroType}: x=${Math.round(c.x)} y=${Math.round(c.y)}`)
      })
    }

    // 怪物出生位置（右侧区域，与角色相近的y范围）
    if (Array.isArray(this.monsters)) {
      this.monsters.forEach(m => {
        m.x = area.right - areaW * 0.08 - Math.random() * areaW * 0.12
        m.y = area.top + areaH * (0.25 + Math.random() * 0.50)
        m.facingRight = false
        m._animStartTime = Date.now(); m.isDead = false; m.deathTimer = 450
        this._clampToBattleArea(m)
        console.log(`[InitPos] monster ${m.type}: x=${Math.round(m.x)} y=${Math.round(m.y)}`)
      })
    }
  }

  _getBattleArea() {
    // 与原始调参一致：顶部留 topBarH+30，底部留 17% 屏幕高度，左右各 20px
    const safeTop = Math.max(this.height * 0.065, 44) + 30
    const safeBottom = this.height - Math.max(this.height * 0.17, 110) - 15
    return { left: 20, right: this.width - 20, top: safeTop, bottom: safeBottom }
  }

  /** 将实体钳制在战斗区域内 */
  _clampToBattleArea(entity) {
    if (!entity) return
    const area = this._getBattleArea()
    const r = (entity.radius || entity.width || 16) / 2
    entity.x = Math.max(area.left + r, Math.min(area.right - r, entity.x))
    entity.y = Math.max(area.top + r, Math.min(area.bottom - r, entity.y))
  }

  /** 将目标坐标钳制在战斗区域内，返回 [x, y] */
  _clampTargetToArea(x, y) {
    const area = this._getBattleArea()
    return [
      Math.max(area.left, Math.min(area.right, x)),
      Math.max(area.top, Math.min(area.bottom, y))
    ]
  }

  // ========== 主更新循环（调度中心）==========

  /**
   * 每帧调用 - 核心调度器
   * @param {number} dt - 时间差(ms)
   */
  update(dt) {
    if (this.phase === 'card_select') return
    if (this.phase !== 'battle' && this.phase !== 'victory' && this.phase !== 'defeat') return

    this.battleTime += dt

    // ★ 全局防护：任何子系统崩溃不影响其他系统和触屏事件
    try {
      this._runUpdateLoop(dt)
    } catch (err) {
      if (!this._lastErrLogTime || Date.now() - this._lastErrLogTime > 3000) {
        console.error('[Tower] update 异常:', err.message || err, err.stack || '')
        this._lastErrLogTime = Date.now()
      }
    }
  }

  /** 实际更新逻辑（被 try-catch 保护） */
  _runUpdateLoop(dt) {
    const now = Date.now()

    // 1. 更新角色（移动/动画/AI/攻击）
    Characters.updateCharacters(this, dt)

    // 2. 更新怪物（AI/攻击/技能/动画）
    Monsters.updateMonsters(this, dt)

    // 3. 投射物更新
    this._updateProjectiles(dt)

    // 4. 特效系统更新（ctx 可能未初始化时跳过）
    if (this.ctx && this.assets) {
      Effects.updateEffects(this, dt)
    }
    Effects.updateParticles(this, dt)

    // 5. 浮动文字更新
    this._updateFloatingTexts(dt)

    // 6. 掉落物更新
    Equipment.updateDroppedItems(this, dt)

    // 7. 虫洞/过场更新
    Waves.updateWormhole(this, dt)
    Waves.updateTransition(this, dt)
    Waves.checkWormholeInteraction(this)

    // 8. Buff/Debuff 更新（角色Buff衰减、怪物灼烧DoT）
    Combat.updateBuffs(this, dt)

    // 9. 波次管理
    this._updateSpawner(dt)

    // 10. 相机衰减
    this._updateCamera(dt)

    // 11. 胜负检测
    this._checkWinLose()
  }

  // 投射物更新（保留在调度器中，因为涉及怪物碰撞检测）
  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      try {
        if (!p._bornTime) p._bornTime = Date.now()
        if (Date.now() - p._bornTime > 4000) { p.hit = true; continue }

        const dx = p.targetX - p.x, dy = p.targetY - p.y, dist = Math.sqrt(dx*dx + dy*dy)
        if (dist < 18) {
          p.hit = true
          if (p.onHit) {
            try { p.onHit(p) } catch(e){ /* 忽略回调异常 */ }
          }
        } else {
          p.x += (dx/dist) * p.speed * (dt/1000)
          p.y += (dy/dist) * p.speed * (dt/1000)
          if (!p.trail) p.trail = []
          p.trail.push({x:p.x,y:p.y})
          if(p.trail.length>10) p.trail.shift()
        }
      } catch(e) {
        p.hit = true // 异常投射物标记移除
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.hit)
  }

  _updateSpawner(dt) {
    if (this.transition.active) return
    Waves.checkWaveSpawn(this, dt)
  }

  _updateFloatingTexts(dt) {
    for (const ft of this.floatingTexts) { ft.y += ft.vy * (dt / 1000); ft.life -= dt / 1000 }
    this.floatingTexts = this.floatingTexts.filter(ft => ft.life > 0)
  }

  _updateCamera(dt) {
    this.camera.shakeX *= 0.85; this.camera.shakeY *= 0.85
    if (Math.abs(this.camera.shakeX) < 0.1) this.camera.shakeX = 0
    if (Math.abs(this.camera.shakeY) < 0.1) this.camera.shakeY = 0
    // ★ 移动指示器衰减
    if (this._moveIndicator && this._moveIndicator.timer > 0) {
      this._moveIndicator.timer -= dt
      if (this._moveIndicator.timer <= 0) this._moveIndicator = null
    }
  }

  // ========== 胜负检测 ==========
  
  _checkWinLose() {
    if (this.phase === 'battle') {
      // ===== 败北检测 =====
      const trulyAllDead = this.party.every(c => c.isDead)
      if (trulyAllDead) {
        const anyoneRespawning = this.party.some(c => c.respawnTimer > 0)
        if (!anyoneRespawning && !this._defeatTriggered) {
          this._defeatTriggered = true
          setTimeout(() => {
            if (this.phase === 'battle' && this.party.every(c => c.isDead)) this._triggerDefeat()
          }, 1500)
        }
      }

      // ===== 胜利检测 =====
      if (!this._victoryTriggered) {
        const aliveMonsters = (this.monsters || []).filter(m => !m.isDead).length
        if (this.allWavesDone && aliveMonsters === 0) {
          this._victoryTriggered = true
          this._triggerVictory()
        }
      }
    }
  }

  _triggerVictory() {
    if (this.phase !== 'battle') return
    this.stats.time = this.battleTime
    this.camera.shakeX = 12; this.camera.shakeY = 12
    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2, speed = 100 + Math.random() * 220
      this.particles.push({
        x: this.width/2, y: this.height/2, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        size: 3+Math.random()*7, color: ['#ffd700','#ff8c00','#ffffff','#a855f7'][Math.floor(Math.random()*4)],
        life:1, decay: 0.4+Math.random()*0.6
      })
    }
    this.scene.saveProgress(this.stage.id - 1)
    this.phase = 'victory'
    console.log('[Tower] 🎉 胜利！')
  }

  _triggerDefeat() {
    if (this.phase !== 'battle') return
    this.stats.time = this.battleTime
    this.camera.shakeX = 18; this.camera.shakeY = 18
    this.phase = 'defeat'
    console.log('[Tower] ☠️ 失败！')
  }

  getStats() {
    return { ...this.stats, time: this.battleTime / 1000 }
  }

  // ========== 渲染 ==========

  /** 每帧渲染 - 核心渲染调度器 */
  render() {
    const ctx = this.ctx
    if (!ctx) return

    try {
    ctx.save()
    // ★ 相机震动统一由 UI.render() 处理，此处不再 translate 避免双重叠加

    switch (this.phase) {
      case 'card_select': {
        console.log(`[Tower] 🔍 render() card_select 分支, party=${Array.isArray(this.party)?this.party.length:typeof this.party}`)
        try { UI.renderCardSelect(ctx, this) } catch(e) {
          console.error(`[Tower] 💥 renderCardSelect 崩溃!`, e)
        }
        console.log(`[Tower] 🔍 render() card_select 分支完成`)
        break
      }
      case 'battle':
        UI.render(ctx, this)
        break
      case 'victory':
      case 'defeat':
        UI.render(ctx, this)
        UI.renderResultScreen(ctx, this)
        break
      default:
        UI.render(ctx, this)
    }

    ctx.restore()
    } catch (e) {
      console.error(`[Tower] 💥 TowerBattle.render() 崩溃! phase=${this.phase}, error=`, e)
      ctx.restore()
    }
  }

  // ========== 输入处理 ==========

  /** 处理点击/触控 */
  onTap(x, y) { UI.onTap(this, x, y) }

  /** 虚拟摇杆输入：将方向映射到当前选中角色的 targetX/Y（速度帧率无关） */
  onJoystickInput(dx, dy) {
    const c = this.party[this.selectedCharIndex]
    if (!c || c.dead) return
    const area = this._getBattleArea()
    const r = c.width / 2 || 20
    const BASE_SPEED = 280   // px/s

    if (dx === 0 && dy === 0) {
      // 松开：停止移动（让 AI 可以接管）
      c.targetX = c.x
      c.targetY = c.y
      return
    }

    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const actualSpeed = BASE_SPEED * dist
    // 目标位置：方向向量 × 速度 / 60fps（近似每帧速度）
    const perFrame = actualSpeed / 60
    const newX = Math.max(area.left + r, Math.min(area.right - r, c.x + (dx / dist) * perFrame))
    const newY = Math.max(area.top + r, Math.min(area.bottom - r, c.y + (dy / dist) * perFrame))

    c.targetX = newX
    c.targetY = newY
    c._manualMoveTime = Date.now()   // 重置手动移动保护（1.5s 内 AI 不接管）
  }

  // ========== 生命周期 ==========

  /** 销毁释放资源 */
  destroy() {
    this.party = []; this.monsters = []; this.projectiles = []
    this.effects = []; this.particles = []; this.floatingTexts = []
    this.droppedItems = []; this.cardPhase = null
    this.equipPanel = null; this.skillMenu = null
    console.log('[Tower] 🔧 战斗实例已销毁')
  }

  // ========== 调试接口 ==========

  /** [调试] 返回当前内部状态摘要 */
  getDebugInfo() {
    return {
      phase: this.phase, waveIndex: this.waveIndex, totalWaves: this.totalWaves,
      partyCount: this.party.length, monsterCount: this.monsters.length,
      effectCount: this.effects.length, particleCount: this.particles.length,
      gold: this.gold, inventorySize: this.inventory.length,
      battleTime: this.battleTime, stats: this.stats
    }
  }
}

// ============================================================
//  导出
// ============================================================
module.exports = TowerBattle
