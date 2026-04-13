/**
 * tower-scene.js - 闯关模块入口（优化版）
 *
 * 流程：
 *   选关(stage_select) → 战前卡牌(card_select, 在TowerBattle内) → 战斗(battle) → 结算(result)
 *
 * 核心机制：
 * - 角色死亡后复活，保留等级/装备/技能
 * - 手动技能释放 + 自动平A
 * - 掉落装备有拾取时限，品质分级特效
 * - 击杀升级解锁技能
 * - 开局卡牌选择加成效果
 */

import { TOWER_STAGES } from '../../data/tower/stages.js'
import { TowerBattle } from './tower-battle.js'
import { charStateManager } from '../../data/character-state.js'

// 章节配置
const CHAPTERS = [
  { name: '第1章：初入试炼', startIdx: 0, endIdx: 4, color: '#2ecc71', icon: '🌿' },
  { name: '第2章：兽人领地', startIdx: 5, endIdx: 9, color: '#e67e22', icon: '⚔' },
  { name: '第3章：亡灵禁地', startIdx: 10, endIdx: 14, color: '#9b59b6', icon: '💀' },
]

// 怪物名称映射
const MONSTER_NAMES = {
  slime: '史莱姆', goblin: '哥布林', orc: '兽人',
  wolf: '恶狼', undead: '亡灵', demon: '恶魔', dragon: '幼龙'
}

export class TowerScene {
  constructor(game) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr || 1

    this.phase = 'stage_select'
    this.currentStage = null
    this.battle = null

    // UI 状态
    this.stageButtons = []
    this.scrollY = 0
    this.touchStartY = 0
    this.isTouchScrolling = false
    this.animTime = 0
  }

  init() {
    this._initInput()
  }

  _initInput() {
    const canvas = this.game.canvas
    canvas.addEventListener('touchstart', e => {
      e.preventDefault()
      const t = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      this._onTouchStart((t.clientX - rect.left) * this.dpr, (t.clientY - rect.top) * this.dpr)
    })
    canvas.addEventListener('touchmove', e => {
      e.preventDefault()
      const t = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      this._onTouchMove((t.clientX - rect.left) * this.dpr, (t.clientY - rect.top) * this.dpr)
    })
    canvas.addEventListener('touchend', e => {
      e.preventDefault()
      const t = e.changedTouches[0]
      const rect = canvas.getBoundingClientRect()
      this._onTouchEnd((t.clientX - rect.left) * this.dpr, (t.clientY - rect.top) * this.dpr)
    })
    canvas.addEventListener('mousedown', e => {
      const rect = canvas.getBoundingClientRect()
      this._onTouchStart((e.clientX - rect.left) * this.dpr, (e.clientY - rect.top) * this.dpr)
    })
    canvas.addEventListener('mousemove', e => {
      if (this.isTouchScrolling) return
      const rect = canvas.getBoundingClientRect()
      this._onTouchMove((e.clientX - rect.left) * this.dpr, (e.clientY - rect.top) * this.dpr)
    })
    canvas.addEventListener('mouseup', e => {
      const rect = canvas.getBoundingClientRect()
      this._onTouchEnd((e.clientX - rect.left) * this.dpr, (e.clientY - rect.top) * this.dpr)
    })
  }

  _onTouchStart(x, y) {
    this.touchStartY = y
    this.isTouchScrolling = false
    if (this.phase === 'stage_select') this._onTap(x, y)
    else if (this.phase === 'battle') this.battle.onTap(x, y)
    else if (this.phase === 'result') this._onResultTap(x, y)
  }

  _onTouchMove(x, y) {
    const delta = y - this.touchStartY
    if (Math.abs(delta) > 10) this.isTouchScrolling = true
    if (this.phase === 'stage_select' && this.isTouchScrolling) {
      this.scrollY = Math.max(0, Math.min(this.scrollY - delta, this._maxScroll()))
      this.touchStartY = y
    } else if (this.phase === 'battle') {
      this.battle.onTapMove(x, y)
    }
  }

  _onTouchEnd() {
    this.isTouchScrolling = false
  }

  _onTap(x, y) {
    if (this.phase !== 'stage_select') return
    for (const btn of this.stageButtons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.unlocked) this._startStage(btn.stage)
        return
      }
    }
    if (this._inBackButton(x, y)) this.game.popScene()
  }

  _onResultTap(x, y) {
    const cx = this.width / 2
    const cy = this.height / 2 + 90
    if (x >= cx - 90 && x <= cx + 90 && y >= cy - 28 && y <= cy + 28) {
      this.phase = 'stage_select'
      this.battle = null
    }
  }

  _inBackButton(x, y) {
    return x >= 8 && x <= 72 && y >= 10 && y <= 46
  }

  _maxScroll() {
    const rowH = 132
    const rows = Math.ceil(TOWER_STAGES.length / 2)
    const contentH = rows * rowH + 80 // chapter headers add space
    return Math.max(0, contentH - (this.height - 60))
  }

  _startStage(stage) {
    this.currentStage = stage
    this.phase = 'battle'
    const party = this._loadTowerParty()
    this.battle = new TowerBattle(this, stage, party)
  }

  // ========== 角色加载 ==========

  _loadTowerParty() {
    const party = []

    // 从探险模式读取队伍身份（只同步：谁在队伍里）
    const allChars = charStateManager.getAllCharacters()
    if (allChars.length === 0) {
      console.warn('[Tower] 没有可用角色，使用默认角色')
      return this._getDefaultParty()
    }

    for (const cs of allChars) {
      // 只取身份信息（id/name/role），其他全部从模板重新生成（1级、无装备）
      const tmpl = this._getHeroTemplate(cs.id)
      if (!tmpl) {
        console.warn(`[Tower] 未知角色 ${cs.id}，跳过`)
        continue
      }

      party.push({
        id: tmpl.id,
        name: tmpl.name,
        role: tmpl.role,

        // 属性全部从模板取（1级初始值）
        maxHp: tmpl.maxHp,
        maxMp: tmpl.maxMp,
        atk: tmpl.atk,
        def: tmpl.def,
        spd: tmpl.spd,

        currentHp: tmpl.maxHp,
        currentMp: tmpl.maxMp,
        level: 1,
        exp: 0,

        // 技能从角色模板取
        skills: [...tmpl.skills],

        // 装备为空——战斗中通过掉落获取
        equipment: {},

        // 战斗状态
        isDead: false,
        respawnTimer: 0,
        x: 0, y: 0, targetX: 0, targetY: 0,
        attackTimer: 0, isAttacking: false,
        attackAnimTimer: 0, skillCDs: {},
        statusEffects: [],
      })
    }

    return party || this._getDefaultParty()
  }

  /** 默认角色模板（当没有存档时回退使用） */
  _getDefaultParty() {
    const templates = [
      { id: 'zhenbao', name: '臻宝', role: 'warrior', maxHp: 120, maxMp: 30, atk: 18, def: 12, spd: 10 },
      { id: 'lixiaobao', name: '李小宝', role: 'mage', maxHp: 80, maxMp: 80, atk: 22, def: 6, spd: 11 },
    ]
    return templates.map(t => ({
      ...t,
      currentHp: t.maxHp, currentMp: t.maxMp, level: 1, exp: 0,
      isDead: false, respawnTimer: 0, x: 0, y: 0, targetX: 0, targetY: 0,
      attackTimer: 0, isAttacking: false, attackAnimTimer: 0, skillCDs: {},
      statusEffects: [], equipment: {}, skills: [
        { id: 'basic_attack', name: '攻击', type: 'attack', power: 1.0, mpCost: 0, desc: '基础攻击' }
      ],
    }))
  }

  _getHeroTemplate(id) {
    const templates = {
      zhenbao: {
        id: 'zhenbao', name: '臻宝', role: 'warrior',
        maxHp: 120, maxMp: 30, atk: 18, def: 12, spd: 10,
        skills: [
          { id: 'slash', name: '斩击', type: 'attack', power: 1.2, mpCost: 0, desc: '基础物理攻击' },
          { id: 'shield_bash', name: '盾击', type: 'attack', power: 0.8, mpCost: 5, desc: '盾击+眩晕', cd: 4000 },
          { id: 'war_cry', name: '战吼', type: 'buff', mpCost: 8, desc: '全体攻击+30%', unlockLevel: 3, cd: 8000 },
          { id: 'berserk', name: '狂暴', type: 'buff', mpCost: 15, desc: '自身攻击+50%', unlockLevel: 5, cd: 12000 }
        ]
      },
      lixiaobao: {
        id: 'lixiaobao', name: '李小宝', role: 'mage',
        maxHp: 80, maxMp: 80, atk: 22, def: 6, spd: 11,
        skills: [
          { id: 'fireball', name: '火球术', type: 'magic', power: 1.5, mpCost: 8, cd: 5000,
            desc: '火球穿透3个敌人', pierceCount: 3 },
          { id: 'ice_shard', name: '冰晶术', type: 'magic', power: 1.0, mpCost: 6, cd: 3500,
            desc: '冰晶穿透5个敌人', pierceCount: 5 },
          { id: 'lightning', name: '雷击术', type: 'magic', power: 0.8, mpCost: 15, cd: 10000,
            desc: '雷电穿透10个敌人', pierceCount: 10, unlockLevel: 4 }
        ]
      },
      lufei: {
        id: 'lufei', name: '路飞', role: 'fighter',
        maxHp: 100, maxMp: 20, atk: 20, def: 8, spd: 12,
        skills: [
          { id: 'punch', name: '橡皮拳', type: 'attack', power: 1.0, mpCost: 0, desc: '物理攻击' },
          { id: 'gatling', name: '机关枪', type: 'attack', power: 0.4, mpCost: 10, hits: 5, desc: '5连击', unlockLevel: 3, cd: 8000 },
          { id: 'gear_second', name: '二档', type: 'buff', mpCost: 12, desc: '速度攻击提升', unlockLevel: 5, cd: 12000 }
        ]
      },
      tangguo: {
        id: 'tangguo', name: '糖果', role: 'healer',
        maxHp: 90, maxMp: 60, atk: 12, def: 10, spd: 9,
        skills: [
          { id: 'candy_strike', name: '糖果击', type: 'attack', power: 0.9, mpCost: 0, desc: '物理攻击' },
          { id: 'heal', name: '甜蜜治疗', type: 'heal', power: 0.8, mpCost: 6, desc: '治疗队友', cd: 5000 },
          { id: 'group_heal', name: '糖果风暴', type: 'heal', power: 0.5, mpCost: 15, target: 'all', desc: '治疗全体', unlockLevel: 4, cd: 12000 }
        ]
      }
    }
    return templates[id] || templates.zhenbao
  }

  _applyEquipment(hero) {
    for (const slot of ['weapon', 'armor', 'accessory']) {
      const eq = hero.equipment[slot]
      if (!eq) continue
      const s = eq.stats || eq
      hero.maxHp += s.maxHp || 0
      hero.atk += s.atk || 0
      hero.def += s.def || 0
      hero.spd += s.spd || 0
    }
    hero.currentHp = Math.min(hero.currentHp || hero.maxHp, hero.maxHp)
  }

  // ========== 更新 ==========

  update(dt) {
    this.animTime += dt / 1000
    if (this.phase === 'battle' && this.battle) {
      this.battle.update(dt)
      if (this.battle.phase === 'victory' || this.battle.phase === 'defeat') {
        this.phase = 'result'
        this.battleResult = this.battle.phase
      }
    }
  }

  // ========== 渲染 ==========

  render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    if (this.phase === 'stage_select') this._renderStageSelect(ctx)
    else if (this.phase === 'battle') this.battle.render()
    else if (this.phase === 'result') this._renderResult(ctx)
  }

  // ===== 选关界面 =====

  _renderStageSelect(ctx) {
    const W = this.width, H = this.height, dpr = this.dpr

    // 背景
    const bgGrad = ctx.createLinearGradient(0, 0, W, H)
    bgGrad.addColorStop(0, '#0a0e14')
    bgGrad.addColorStop(0.5, '#0d1117')
    bgGrad.addColorStop(1, '#0a0e14')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, W, H)

    // 装饰性网格线
    ctx.strokeStyle = 'rgba(201,162,39,0.04)'
    ctx.lineWidth = 1
    const gridSize = 40
    for (let gx = 0; gx < W; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
    }
    for (let gy = 0; gy < H; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    }

    // 标题栏
    ctx.fillStyle = 'rgba(13,17,23,0.92)'
    ctx.fillRect(0, 0, W, 56)
    ctx.fillStyle = '#c9a227'
    ctx.font = `bold ${22 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('\u{1F3F0} 闯关挑战', W / 2, 36)

    // 返回按钮
    ctx.fillStyle = '#c9a227'
    ctx.font = `${15 * dpr}px sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('\u2190 返回', 16, 36)

    // 关卡列表区域
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 56, W, H - 56)
    ctx.clip()

    this.stageButtons = []
    const cols = 2
    const cardW = (W - 28) / cols
    const cardH = 118
    const padX = 8
    const padY = 10
    let curY = 66 - this.scrollY

    // 按章节渲染
    for (const ch of CHAPTERS) {
      // 章节标题
      if (curY > -30 && curY < H + 10) {
        ctx.fillStyle = ch.color + '22'
        ctx.fillRect(8, curY, W - 16, 32)
        ctx.fillStyle = ch.color
        ctx.font = `bold ${15 * dpr}px sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText(`${ch.icon} ${ch.name}`, 16, curY + 21)
      }
      curY += 38

      // 章节内的关卡
      for (let si = ch.startIdx; si <= ch.endIdx && si < TOWER_STAGES.length; si++) {
        const stage = TOWER_STAGES[si]
        const col = (si - ch.startIdx) % cols
        const row = Math.floor((si - ch.startIdx) / cols)
        const x = padX + col * (cardW + padX)
        const y = curY + row * (cardH + padY)

        if (y > H + 10 || y + cardH < 56) continue

        const unlocked = si === 0 || this._isStageUnlocked(si)
        const isBoss = !!stage.boss
        const passed = this._isStageUnlocked(si)

        this.stageButtons.push({ x, y, w: cardW, h: cardH, stage, unlocked })

        // 卡片背景
        const cardGrad = ctx.createLinearGradient(x, y, x, y + cardH)
        if (!unlocked) {
          cardGrad.addColorStop(0, '#151920')
          cardGrad.addColorStop(1, '#181d24')
        } else if (isBoss) {
          cardGrad.addColorStop(0, '#2d1810')
          cardGrad.addColorStop(1, '#351f14')
        } else if (passed) {
          cardGrad.addColorStop(0, '#14261c')
          cardGrad.addColorStop(1, '#182e23')
        } else {
          cardGrad.addColorStop(0, '#1c2128')
          cardGrad.addColorStop(1, '#21262d')
        }

        ctx.fillStyle = cardGrad
        ctx.strokeStyle = !unlocked ? '#21262d' :
          (isBoss ? '#e67e22' : (passed ? '#2ecc71' : (si === 0 ? '#c9a227' : '#30363d')))
        ctx.lineWidth = isBoss || si === 0 ? 2 : 1.2
        this._roundRect(ctx, x, y, cardW, cardH, 10)
        ctx.fill()
        ctx.stroke()

        // 关卡编号徽章
        ctx.fillStyle = isBoss ? '#e67e22' : unlocked ? ch.color : '#30363d'
        ctx.beginPath()
        ctx.arc(x + 18, y + 18, 12, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${11 * dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(stage.id), x + 18, y + 18)
        ctx.textBaseline = 'bottom'

        // 关卡名称
        ctx.fillStyle = unlocked ? '#f0e6d3' : '#484f58'
        ctx.font = `bold ${14 * dpr}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillText(stage.name, x + 36, y + 22)

        // BOSS标记
        if (isBoss && unlocked) {
          ctx.fillStyle = '#e67e22'
          ctx.font = `${9 * dpr}px sans-serif`
          ctx.fillText(' \uD83C\uDDEF\uD83C\uDDF5 BOSS', x + 36 + ctx.measureText(stage.name).width + 4, y + 22)
        }

        // 已通关勾选
        if (passed && !isBoss) {
          ctx.fillStyle = '#2ecc71'
          ctx.font = `${12 * dpr}px sans-serif`
          ctx.textAlign = 'right'
          ctx.fillText('\u2713 已通过', x + cardW - 8, y + 22)
        }

        // 描述
        ctx.fillStyle = unlocked ? '#8b949e' : '#484f58'
        ctx.font = `${11 * dpr}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillText(stage.desc, x + 12, y + 46)

        // 信息行（水晶HP + 怪物类型）
        ctx.fillStyle = unlocked ? '#c9a22755' : '#333'
        ctx.font = `${10 * dpr}px sans-serif`
        ctx.fillText(`\u{1F48E} 水晶 ${stage.crystalHp}`, x + 12, y + 64)

        const monsterIcon = this._getMonsterIcon(stage.monsterType)
        ctx.fillStyle = unlocked ? '#58a6ff88' : '#333'
        ctx.fillText(`${monsterIcon} ${MONSTER_NAMES[stage.monsterType] || stage.monsterType}`, x + 12, y + 80)

        // 难度星级（根据水晶血量估算）
        const stars = stage.crystalHp <= 1000 ? 1 : stage.crystalHp <= 3000 ? 2 : stage.crystalHp <= 6000 ? 3 : 4
        const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(4 - stars)
        ctx.fillStyle = unlocked ? '#f39c1288' : '#333'
        ctx.font = `${10 * dpr}px sans-serif`
        ctx.fillText(starStr, x + 12, y + 96)

        // 最大怪物数提示
        ctx.fillStyle = '#484f5866'
        ctx.font = `${9 * dpr}px sans-serif`
        ctx.textAlign = 'right'
        ctx.fillText(`最多${stage.maxMonsters}怪`, x + cardW - 8, y + 96)

        // 锁定遮罩
        if (!unlocked) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)'
          this._roundRect(ctx, x, y, cardW, cardH, 10)
          ctx.fill()
          ctx.fillStyle = '#58a6ff'
          ctx.font = `${26 * dpr}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('\uD83D\uDD12', x + cardW / 2, y + cardH / 2)
        }
      }
      // 移到下一章的起始位置
      const chapterStageCount = ch.endIdx - ch.startIdx + 1
      const chapterRows = Math.ceil(chapterStageCount / cols)
      curY += chapterRows * (cardH + padY) + 16
    }

    ctx.restore()

    // 滚动条
    const maxScroll = this._maxScroll()
    if (maxScroll > 0) {
      const ratio = (H - 56) / (curY + this.scrollY + 50)
      const barH = Math.max(24, (H - 56) * Math.min(ratio, 1))
      const barY = 56 + (H - 56 - barH) * (this.scrollY / maxScroll)
      // 滚动条轨道
      ctx.fillStyle = '#21262d'
      ctx.fillRect(W - 5, 56, 4, H - 56)
      ctx.fillStyle = '#c9a22755'
      ctx.fillRect(W - 5, barY, 4, barH)
    }
  }

  _getMonsterIcon(type) {
    const icons = {
      slime: '\uD83E\uDD17', goblin: '\uD83E\uDDD8', orc: '\uD83E\uDDDC',
      wolf: '\uD83D\uDC3A', undead: '\uD83E\uDDDB', demon: '\uD83D\uDC80', dragon: '\uD83D\uDC32'
    }
    return icons[type] || '?'
  }

  // ===== 结算界面 =====

  _renderResult(ctx) {
    const W = this.width, H = this.height, dpr = this.dpr
    const isWin = this.battleResult === 'victory'

    // 背景渐变
    const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7)
    if (isWin) {
      bgGrad.addColorStop(0, 'rgba(25,25,15,0.95)')
      bgGrad.addColorStop(1, 'rgba(10,10,5,0.98)')
    } else {
      bgGrad.addColorStop(0, 'rgba(25,10,10,0.95)')
      bgGrad.addColorStop(1, 'rgba(10,5,5,0.98)')
    }
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, W, H)

    // 结果标题动画
    const titleScale = 1 + Math.sin(this.animTime * 3) * 0.02
    ctx.save()
    ctx.translate(W / 2, H * 0.2)
    ctx.scale(titleScale, titleScale)

    if (isWin) {
      // 胜利光效
      ctx.shadowBlur = 30 + Math.sin(this.animTime * 2) * 10
      ctx.shadowColor = '#ffd700'
      ctx.fillStyle = '#ffd700'
    } else {
      ctx.shadowBlur = 20
      ctx.shadowColor = '#ff4444'
      ctx.fillStyle = '#ff4444'
    }
    ctx.font = `bold ${36 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(isWin ? '\uD83C\uDF89 闯关胜利！' : '\uD83D\uDC80 挑战失败', 0, 0)
    ctx.shadowBlur = 0
    ctx.restore()

    // 副标题
    ctx.fillStyle = isWin ? '#f0d07040' : '#ff444420'
    ctx.font = `${14 * dpr}px sans-serif`
    ctx.fillText(isWin ? '敌方水晶已被摧毁！' : '再接再厉，勇士！', W / 2, H * 0.2 + 36 * dpr)

    // 统计面板
    const panelW = Math.min(320 * dpr, W * 0.85)
    const panelH = 200 * dpr
    const panelX = (W - panelW) / 2
    const panelY = H * 0.32

    ctx.fillStyle = 'rgba(20,22,28,0.85)'
    this._roundRect(ctx, panelX, panelY, panelW, panelH, 14)
    ctx.fill()
    ctx.strokeStyle = isWin ? '#c9a22744' : '#ff444433'
    ctx.lineWidth = 1.5
    this._roundRect(ctx, panelX, panelY, panelW, panelH, 14)
    ctx.stroke()

    // 面板标题
    ctx.fillStyle = '#8b949e'
    ctx.font = `bold ${14 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('=== 战斗统计 ===', W / 2, panelY + 26 * dpr)

    const stats = this.battle?.getStats()
    if (stats) {
      const statLines = [
        { label: '击杀怪物', value: stats.kills, icon: '\uD83D\uDD1A', color: '#e74c3c' },
        { label: '收集装备', value: stats.dropsCollected, icon: '\u{1F6E1}', color: '#3498db' },
        { label: '总伤害输出', value: this._formatNumber(stats.damageDealt), icon: '\u2694', color: '#e67e22' },
        { label: '获得金币', value: '+' + (stats.goldEarned || 0), icon: '\uD83D\uDCB0', color: '#f1c40f' },
        { label: '战斗时长', value: `${Math.floor(stats.time / 60)}:${String(Math.floor(stats.time % 60)).padStart(2,'0')}`, icon: '\u23F1', color: '#9b59b6' },
      ]

      statLines.forEach((line, i) => {
        const ly = panelY + 54 * dpr + i * 28 * dpr
        ctx.fillStyle = line.icon + '  '
        ctx.font = `${14 * dpr}px sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText(line.label, panelX + 20 * dpr, ly)

        ctx.fillStyle = line.color
        ctx.font = `bold ${14 * dpr}px sans-serif`
        ctx.textAlign = 'right'
        ctx.fillText(String(line.value), panelX + panelW - 20 * dpr, ly)

        // 分隔线
        if (i < statLines.length - 1) {
          ctx.strokeStyle = '#30363d'
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(panelX + 16 * dpr, ly + 12 * dpr)
          ctx.lineTo(panelX + panelW - 16 * dpr, ly + 12 * dpr)
          ctx.stroke()
        }
      })
    }

    // 角色等级变化（如果有）
    if (this.battle?.party) {
      const lvlY = panelY + panelH + 16 * dpr
      ctx.fillStyle = '#c9a227'
      ctx.font = `bold ${12 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('-- 角色状态 --', W / 2, lvlY)

      this.battle.party.forEach((c, i) => {
        const lx = W / 2 - (this.battle.party.length - 1) * 50 * dpr + i * 100 * dpr - 30 * dpr
        const ly2 = lvlY + 26 * dpr
        ctx.fillStyle = c.isDead ? '#484f58' : '#f0e6d3'
        ctx.font = `${11 * dpr}px sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText(`${c.name} Lv.${c.level}`, lx, ly2)

        if ((c.totalExp || 0) > 0) {
          ctx.fillStyle = '#ffd700'
          ctx.font = `${9 * dpr}px sans-serif`
          ctx.fillText(`(+${c.totalExp}exp)`, lx + ctx.measureText(`${c.name} Lv.${c.level}`).width + 6, ly2)
        }
      })
    }

    // 返回按钮
    const btnW = 180 * dpr, btnH = 50 * dpr
    const btnX = W / 2 - btnW / 2
    const btnY = H * 0.78

    // 按钮发光效果（胜利时）
    if (isWin) {
      const glowAlpha = 0.15 + Math.sin(this.animTime * 2) * 0.08
      ctx.fillStyle = `rgba(255,215,0,${glowAlpha})`
      this._roundRect(ctx, btnX - 4, btnY - 4, btnW + 8, btnH + 8, 14)
      ctx.fill()
    }

    ctx.fillStyle = isWin ? '#c9a227' : '#6e5e3c'
    this._roundRect(ctx, btnX, btnY, btnW, btnH, 10)
    ctx.fill()
    ctx.strokeStyle = isWin ? '#ffd700' : '#8b7744'
    ctx.lineWidth = 2
    this._roundRect(ctx, btnX, btnY, btnW, btnH, 10)
    ctx.stroke()

    ctx.fillStyle = isWin ? '#0d1117' : '#1a1a2e'
    ctx.font = `bold ${17 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(isWin ? '\u2728 继续挑战' : '\u{1F504} 重试关卡', W / 2, btnY + btnH / 2)
    ctx.textBaseline = 'bottom'
  }

  _formatNumber(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return String(Math.floor(n))
  }

  // 工具方法
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  _isStageUnlocked(idx) {
    const data = this.game.data?.get?.('tower_progress') || {}
    return data[`stage_${idx - 1}`] === true
  }

  saveProgress(stageIndex) {
    const data = this.game.data?.get?.('tower_progress') || {}
    data[`stage_${stageIndex}`] = true
    this.game.data?.set?.('tower_progress', data)
    this.game.data?.save?.()
  }

  onResize() {}

  destroy() {}
}
