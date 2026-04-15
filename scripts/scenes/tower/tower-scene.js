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
    this._scrollStartY = 0      // 滚动开始时的touch Y
    this._scrollStartScroll = 0 // 滚动开始时的scrollY
    this._isDragging = false
    this.animTime = 0
  }

  init() {
    // 输入由全局 InputManager(wx.onTouchStart) 统一处理
    // 不再使用 canvas.addEventListener（真机无效）
  }


  // ========== 更新（通过 InputManager 处理输入） ==========

  update(dt) {
    this.animTime += dt / 1000
    if (this.phase === 'battle' && this.battle) {
      this.battle.update(dt)
      if (this.battle.phase === 'victory' || this.battle.phase === 'defeat') {
        this.phase = 'result'
        this.battleResult = this.battle.phase
      }
    }

    // 统一输入处理（与 town-scene 一致，使用 wx.onTouchStart）
    const input = this.game.input

    // 滚动处理（基于 touchmove 的 dragDelta）
    if (input.dragging) {
      if (this.phase === 'stage_select') {
        this.scrollY = Math.max(0, Math.min(this.scrollY - input.dragDelta.y, this._maxScroll()))
      } else if (this.phase === 'battle') {
        if (input.touches[0] && this.battle?.onTapMove) {
          const t = input.touches[0]
          this.battle.onTapMove(t.x, t.y)
        }
      }
    }

    // 点击处理（touchend 时 taps 数组有数据）
    if (input.taps.length > 0) {
      const tap = input.consumeTap()
      if (!tap) return

      if (this.phase === 'stage_select') {
        this._handleStageTap(tap.x, tap.y)
      } else if (this.phase === 'battle' && this.battle?.onTap) {
        this.battle.onTap(tap.x, tap.y)
      } else if (this.phase === 'result') {
        this._handleResultTap(tap.x, tap.y)
      }
    }
  }

  // ===== 选关界面点击检测 =====

  _handleStageTap(x, y) {
    for (const btn of this.stageButtons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.unlocked) this._startStage(btn.stage)
        return
      }
    }
    if (this._inBackButton(x, y)) this.game.popScene()
  }

  // ===== 结算界面点击检测 =====

  _handleResultTap(x, y) {
    const cx = this.width / 2
    const cy = this.height / 2 + 90
    if (x >= cx - 90 && x <= cx + 90 && y >= cy - 28 && y <= cy + 28) {
      this.phase = 'stage_select'
      this.battle = null
    }
  }

  _inBackButton(x, y) {
    return x >= 6 && x <= 82 && y >= 8 && y <= 48
  }

  _maxScroll() {
    const cardW = this.width - 24
    const cardH = 100
    const cardGap = 10
    const listTop = 104  // header(56) + tab(42) + 6
    let totalH = 0
    for (const ch of CHAPTERS) {
      totalH += 40 + 8  // 章节标题 + 间距
      const stageCount = Math.min(ch.endIdx - ch.startIdx + 1,
        TOWER_STAGES.length - ch.startIdx)
      totalH += stageCount * (cardH + cardGap)
    }
    return Math.max(0, totalH - (this.height - listTop))
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

  // ========== 渲染 ==========

  render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    if (this.phase === 'stage_select') this._renderStageSelect(ctx)
    else if (this.phase === 'battle') this.battle.render()
    else if (this.phase === 'result') this._renderResult(ctx)
  }

  // ===== 选关界面（重设计：大卡片 + 单列 + 清晰层级） =====

  _renderStageSelect(ctx) {
    const W = this.width, H = this.height, dpr = this.dpr

    // ===== 背景 =====
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

    // ===== 标题栏 =====
    ctx.fillStyle = 'rgba(13,17,23,0.92)'
    ctx.fillRect(0, 0, W, 56)
    ctx.fillStyle = '#c9a227'
    ctx.font = `bold ${22 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('\u{1F3F0} 闯关挑战', W / 2, 30)

    // 返回按钮（大触控区）
    ctx.fillStyle = 'rgba(201,162,39,0.15)'
    this._roundRect(ctx, 6, 8, 76, 40, 10)
    ctx.fill()
    ctx.fillStyle = '#c9a227'
    ctx.font = `${14 * dpr}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('\u2190 返回', 44, 28)

    // ===== 章节导航标签栏 =====
    const tabY = 58
    const tabH = 42
    ctx.fillStyle = 'rgba(13,17,23,0.85)'
    ctx.fillRect(0, tabY, W, tabH)

    const tabW = Math.min(100 * dpr, (W - 20) / CHAPTERS.length)
    const totalTabW = tabW * CHAPTERS.length
    const tabStartX = (W - totalTabW) / 2

    CHAPTERS.forEach((ch, ci) => {
      const tx = tabStartX + ci * tabW + 4
      const tw = tabW - 8
      ctx.fillStyle = ch.color + '18'
      this._roundRect(ctx, tx, tabY + 6, tw, tabH - 12, 8)
      ctx.fill()
      ctx.strokeStyle = ch.color + '44'
      ctx.lineWidth = 1
      this._roundRect(ctx, tx, tabY + 6, tw, tabH - 12, 8)
      ctx.stroke()

      ctx.fillStyle = ch.color
      ctx.font = `bold ${12 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${ch.icon} 第${ci+1}章`, tx + tw / 2, tabY + tabH / 2)
    })
    ctx.textBaseline = 'bottom'

    // ===== 关卡列表区域 =====
    const listTop = tabY + tabH + 6
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, listTop, W, H - listTop)
    ctx.clip()

    this.stageButtons = []
    // 屏幕坐标（含scroll偏移），与触摸事件y一致
    let curY = listTop + 4

    const cardW = W - 24
    const cardX = 12
    const cardGap = 10

    for (const ch of CHAPTERS) {
      // 章节分隔标题（渲染坐标 = 屏幕坐标 - scrollY）
      const chRenderY = curY - this.scrollY
      if (chRenderY > listTop - 30 && chRenderY < H + 20) {
        ctx.fillStyle = ch.color + '22'
        ctx.fillRect(cardX, chRenderY, cardW, 34)
        ctx.fillStyle = ch.color
        ctx.fillRect(cardX, chRenderY, 3, 34)
        ctx.fillStyle = ch.color
        ctx.font = `bold ${14 * dpr}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`${ch.icon} ${ch.name}`, cardX + 10, chRenderY + 23)
      }
      curY += 40

      // 章节内的关卡
      for (let si = ch.startIdx; si <= ch.endIdx && si < TOWER_STAGES.length; si++) {
        const stage = TOWER_STAGES[si]
        const x = cardX
        // 屏幕坐标（用于点击检测）
        const screenY = curY
        // 渲染坐标（用于绘制）
        const ry = curY - this.scrollY
        const h = 100
        const unlocked = si === 0 || this._isStageUnlocked(si)
        const isBoss = !!stage.boss
        const passed = this._isStageUnlocked(si)

        if (ry > H + 20 || ry + h < listTop) { curY += h + cardGap; continue }

        // 存屏幕坐标，点击时直接匹配触摸y
        this.stageButtons.push({ x, y: screenY, w: cardW, h, stage, unlocked })

        // ========== 卡片背景（用渲染坐标） ==========
        if (unlocked && !passed) {
          ctx.shadowBlur = isBoss ? 16 : 8
          ctx.shadowColor = isBoss ? '#e67e2255' : ch.color + '33'
          this._roundRect(ctx, x, ry, cardW, h, 12)
          ctx.shadowBlur = 0
        }

        const cardGrad = ctx.createLinearGradient(x, ry, x, ry + h)
        if (!unlocked) {
          cardGrad.addColorStop(0, '#12161d')
          cardGrad.addColorStop(1, '#161b23')
          ctx.strokeStyle = '#21262d'
        } else if (isBoss) {
          cardGrad.addColorStop(0, '#2d1810')
          cardGrad.addColorStop(1, '#351f14')
          ctx.strokeStyle = '#e67e22'
        } else if (passed) {
          cardGrad.addColorStop(0, '#0f1f16')
          cardGrad.addColorStop(1, '#142820')
          ctx.strokeStyle = '#2ecc71'
        } else {
          cardGrad.addColorStop(0, '#161b22')
          cardGrad.addColorStop(1, '#1c222b')
          ctx.strokeStyle = ch.color
        }
        ctx.lineWidth = (passed || isBoss) ? 2 : 1.2
        ctx.fillStyle = cardGrad
        this._roundRect(ctx, x, ry, cardW, h, 12)
        ctx.fill()
        ctx.stroke()

        // ===== 左侧：关卡编号徽章（大圆） =====
        const badgeR = 24
        const badgeCx = x + 32
        const badgeCy = ry + h / 2
        ctx.beginPath()
        ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2)
        if (!unlocked) {
          ctx.fillStyle = '#21262d'
        } else if (isBoss) {
          ctx.fillStyle = '#e67e22'
        } else if (passed) {
          ctx.fillStyle = '#2ecc71'
        } else {
          ctx.fillStyle = ch.color
        }
        ctx.fill()

        // 徽章内编号/勾号
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (passed && !isBoss) {
          ctx.fillStyle = '#fff'
          ctx.font = `bold ${20 * dpr}px sans-serif`
          ctx.fillText('✓', badgeCx, badgeCy)
        } else {
          ctx.fillStyle = unlocked ? '#fff' : '#555'
          ctx.font = `bold ${16 * dpr}px sans-serif`
          ctx.fillText(String(stage.id), badgeCx, badgeCy)
        }
        ctx.textBaseline = 'bottom'

        // ===== 右侧内容区（从徽章右边开始，留足间距） =====
        const contentX = x + 66

        // 第一行：关卡名称 + 状态标签
        ctx.textAlign = 'left'
        ctx.fillStyle = unlocked ? '#f0e6d3' : '#484f58'
        ctx.font = `bold ${15 * dpr}px sans-serif`
        let nameText = stage.name
        if (!unlocked) nameText = '???'
        ctx.fillText(nameText, contentX, ry + 28)

        // 名称右侧标签
        const nameRight = contentX + ctx.measureText(nameText).width + 8
        if (nameRight < x + cardW - 50) {
          if (isBoss && unlocked) {
            ctx.fillStyle = '#e67e22'
            ctx.font = `bold ${10 * dpr}px sans-serif`
            ctx.fillText('👑 BOSS', nameRight, ry + 28)
          } else if (passed && !isBoss) {
            ctx.fillStyle = '#2ecc71'
            ctx.font = `${10 * dpr}px sans-serif`
            ctx.fillText('✓ 已通过', nameRight, ry + 28)
          }
        }

        // 第二行：描述文字
        ctx.fillStyle = unlocked ? '#8b949e' : '#333'
        ctx.font = `${11 * dpr}px sans-serif`
        ctx.fillText(unlocked ? stage.desc : '击败前一关解锁', contentX, ry + 50)

        // 第三行：属性信息（HP、难度、怪物）
        const attrY = ry + 74
        ctx.font = `bold ${10 * dpr}px sans-serif`

        // HP
        ctx.fillStyle = unlocked ? '#ffd70099' : '#333'
        ctx.fillText(`💎${stage.crystalHp}HP`, contentX, attrY)

        // 星级
        const stars = stage.crystalHp <= 1000 ? 1 : stage.crystalHp <= 3000 ? 2 : stage.crystalHp <= 6000 ? 3 : 4
        const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(4 - stars)
        ctx.fillStyle = unlocked ? '#f39c1277' : '#333'
        ctx.fillText(starStr, contentX + 80 * dpr, attrY)

        // 怪物类型
        if (unlocked) {
          const mIcon = this._getMonsterIcon(stage.monsterType)
          const mName = MONSTER_NAMES[stage.monsterType] || stage.monsterType
          ctx.fillStyle = '#58a6ff88'
          ctx.fillText(`${mIcon} ${mName}`, contentX + 160 * dpr, attrY)
        }

        // ===== 锁定遮罩 =====
        if (!unlocked) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)'
          this._roundRect(ctx, x, ry, cardW, h, 12)
          ctx.fill()
          ctx.fillStyle = '#58a6ffaa'
          ctx.font = `${24 * dpr}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('🔒', x + cardW / 2, ry + h / 2)
          ctx.textBaseline = 'bottom'
        }

        curY += h + cardGap
      }
      curY += 8
    }

    ctx.restore()

    // ===== 滚动条 =====
    const maxScroll = this._maxScroll()
    if (maxScroll > 0) {
      const barH = Math.max(30, (H - listTop) * ((H - listTop) / (curY + this.scrollY + 50)))
      const barY = listTop + (H - listTop - barH) * (this.scrollY / maxScroll)
      ctx.fillStyle = '#21262d44'
      this._roundRect(ctx, W - 6, listTop, 4, H - listTop, 2)
      ctx.fill()
      ctx.fillStyle = '#c9a22766'
      this._roundRect(ctx, W - 6, barY, 4, barH, 2)
      ctx.fill()
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
