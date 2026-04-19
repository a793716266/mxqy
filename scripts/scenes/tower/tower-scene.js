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
import { SCENE } from '../../game.js'

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
    // 动态读取尺寸（窗口resize时自动同步）
    Object.defineProperties(this, {
      width: { get() { return game.width } },
      height: { get() { return game.height } },
      dpr:   { get() { return game.dpr || 1 } },
    })

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
      // 检测战斗内"返回城镇"按钮点击
      if (this.battle._backToResult) {
        this.battle._backToResult = false
        this.phase = 'result'
        this.battleResult = this.battle.phase  // 'victory' 或 'defeat'
        return
      }
      // 检测胜利/失败自动切换
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
      } else if (this.phase === 'battle' && this.battle?.onTapMove) {
        // 滑动时也更新悬浮位置
        if (input.touches[0]) {
          const t = input.touches[0]
          this.battle.onTapMove(t.x, t.y)
        }
      }
    }

    // 战斗阶段：即使没有滑动，只要手指在屏幕上就检测装备悬浮
    if (this.phase === 'battle' && !input.dragging && this.battle?.onTapMove) {
      const keys = Object.keys(input.touches)
      if (keys.length > 0) {
        const t = input.touches[keys[0]]
        this.battle.onTapMove(t.x, t.y)
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
        if (btn.unlocked) {
          this.game.audio.playSFX('ui_confirm')
          this._startStage(btn.stage)
        }
        return
      }
    }
    if (this._inBackButton(x, y)) {
      this.game.audio.playSFX('ui_cancel')
      this.game.changeScene(SCENE.TOWN)
    }
  }

  // ===== 结算界面点击检测 =====

  _handleResultTap(x, y) {
    const W = this.width, H = this.height, dpr = this.dpr
    // 按钮位置与 _renderResult 中一致
    const btnW = 180 * dpr, btnH = 50 * dpr
    const btnX = W / 2 - btnW / 2
    const btnY = H * 0.78
    if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
      this.game.audio.playSFX('ui_confirm')
      this.phase = 'stage_select'
      this.battle = null
      // 返回选关界面，停止战斗BGM
      this.game.audio.stopBGM()
      console.log('[Tower] 结果页返回选关')
    }
  }

  _inBackButton(x, y) {
    const dpr = this.dpr
    return x >= 6 * dpr && x <= 76 * dpr && y >= 8 * dpr && y <= 44 * dpr
  }

  _maxScroll() {
    const dpr = this.dpr
    const padding = 10 * dpr
    const colGap = 10 * dpr
    const cardW = (this.width - padding * 2 - colGap) / 2
    const cardH = 110 * dpr
    const cardGap = 10 * dpr
    const listTop = (52 + 38 + 6) * dpr   // headerH + tabH + 间距
    let totalH = 0

    for (const ch of CHAPTERS) {
      totalH += 36 * dpr   // 章节标题
      const stageCount = Math.min(ch.endIdx - ch.startIdx + 1,
        TOWER_STAGES.length - ch.startIdx)
      // 双列布局：每行2个卡片
      const rows = Math.ceil(stageCount / 2)
      totalH += rows * (cardH + cardGap) - cardGap  // 最后一个不加gap
      totalH += 8 * dpr     // 章节间距
    }
    return Math.max(0, totalH - (this.height - listTop))
  }

  _startStage(stage) {
    this.currentStage = stage
    this.phase = 'battle'
    const party = this._loadTowerParty()
    this.battle = new TowerBattle(this, stage, party)
    // 切换到塔防战斗BGM
    this.game.audio.playBGM('bgm_tower')
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
        matk: tmpl.matk || 0,
        def: tmpl.def,
        spd: tmpl.spd,
        mpRegen: tmpl.mpRegen || 0,
        hpRegen: tmpl.hpRegen || 0,
        cdr: tmpl.cdr || 0,
        lifesteal: tmpl.lifesteal || 0,
        atkGrowth: tmpl.atkGrowth || 0.05,
        matkGrowth: tmpl.matkGrowth || 0.05,

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
      { id: 'zhenbao', name: '臻宝', role: 'warrior', maxHp: 120, maxMp: 30, atk: 22, matk: 8, def: 12, spd: 10, mpRegen: 0, hpRegen: 0, cdr: 0, lifesteal: 0, atkGrowth: 0.12, matkGrowth: 0.04 },
      { id: 'lixiaobao', name: '李小宝', role: 'mage', maxHp: 80, maxMp: 80, atk: 10, matk: 45, def: 6, spd: 11, mpRegen: 2, hpRegen: 0, cdr: 0, lifesteal: 0, atkGrowth: 0.04, matkGrowth: 0.12 },
    ]
    return templates.map(t => ({
      ...t,
      currentHp: t.maxHp, currentMp: t.maxMp, level: 1, exp: 0,
      isDead: false, respawnTimer: 0, x: 0, y: 0, targetX: 0, targetY: 0,
      attackTimer: 0, isAttacking: false, attackAnimTimer: 0, skillCDs: {},
      statusEffects: [], equipment: {}, buffs: [], skills: [
        { id: 'basic_attack', name: '攻击', type: 'attack', power: 1.0, mpCost: 0, desc: '基础攻击' }
      ],
    }))
  }

  _getHeroTemplate(id) {
    const templates = {
      zhenbao: {
        id: 'zhenbao', name: '臻宝', role: 'warrior',
        maxHp: 120, maxMp: 30, atk: 22, matk: 8, def: 12, spd: 10,
        mpRegen: 0, hpRegen: 0, cdr: 0, lifesteal: 0,
        // 物理成长：atk每级+12%，matk每级+4%
        atkGrowth: 0.12, matkGrowth: 0.04,
        skills: [
          { id: 'slash', name: '斩击', type: 'attack', power: 1.2, mpCost: 0, desc: '基础物理攻击' },
          { id: 'shield_bash', name: '盾击', type: 'attack', power: 0.8, mpCost: 5, desc: '盾击+眩晕', cd: 4000 },
          { id: 'war_cry', name: '战吼', type: 'buff', mpCost: 8, desc: '全体攻击+30%', unlockLevel: 3, cd: 8000 },
          { id: 'berserk', name: '狂暴', type: 'buff', mpCost: 15, desc: '自身攻击+50%', unlockLevel: 5, cd: 12000 }
        ]
      },
      lixiaobao: {
        id: 'lixiaobao', name: '李小宝', role: 'mage',
        maxHp: 80, maxMp: 80, atk: 10, matk: 45, def: 6, spd: 11,
        mpRegen: 2, hpRegen: 0, cdr: 0, lifesteal: 0,
        // 法术成长：atk每级+4%，matk每级+12%
        atkGrowth: 0.04, matkGrowth: 0.12,
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
        maxHp: 100, maxMp: 20, atk: 20, matk: 10, def: 8, spd: 12,
        mpRegen: 1, hpRegen: 0, cdr: 0, lifesteal: 0,
        // 平衡成长：atk每级+10%，matk每级+6%
        atkGrowth: 0.10, matkGrowth: 0.06,
        skills: [
          { id: 'punch', name: '橡皮拳', type: 'attack', power: 1.0, mpCost: 0, desc: '物理攻击' },
          { id: 'gatling', name: '机关枪', type: 'attack', power: 0.4, mpCost: 10, hits: 5, desc: '5连击', unlockLevel: 3, cd: 8000 },
          { id: 'gear_second', name: '二档', type: 'buff', mpCost: 12, desc: '速度攻击提升', unlockLevel: 5, cd: 12000 }
        ]
      },
      tangguo: {
        id: 'tangguo', name: '糖果', role: 'healer',
        maxHp: 90, maxMp: 60, atk: 8, matk: 18, def: 10, spd: 9,
        mpRegen: 3, hpRegen: 2, cdr: 0, lifesteal: 0,
        // 辅助成长：atk每级+5%，matk每级+10%
        atkGrowth: 0.05, matkGrowth: 0.10,
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
      hero.matk += s.matk || 0
      hero.def += s.def || 0
      hero.spd += s.spd || 0
      hero.maxMp += s.maxMp || 0
      hero.mpRegen += s.mpRegen || 0
      hero.hpRegen += s.hpRegen || 0
      hero.cdr += s.cdr || 0
      hero.lifesteal += s.lifesteal || 0
    }
    // CDR 上限 40%
    hero.cdr = Math.min(0.4, hero.cdr)
    hero.currentHp = Math.min(hero.currentHp || hero.maxHp, hero.maxHp)
    hero.currentMp = Math.min(hero.currentMp || hero.maxMp, hero.maxMp)
  }

  // ========== 渲染 ==========

  render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    if (this.phase === 'stage_select') this._renderStageSelect(ctx)
    else if (this.phase === 'battle') this.battle.render()
    else if (this.phase === 'result') this._renderResult(ctx)
  }

  // ===== 选关界面（重设计：双列网格 + 清晰层级 + 合理间距） =====

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
    const gridSize = 40 * dpr
    for (let gx = 0; gx < W; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
    }
    for (let gy = 0; gy < H; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    }

    // ===== 标题栏（高度随dpr缩放） =====
    const headerH = 52 * dpr
    ctx.fillStyle = 'rgba(13,17,23,0.92)'
    ctx.fillRect(0, 0, W, headerH)
    ctx.fillStyle = '#c9a227'
    ctx.font = `bold ${20 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('\u{1F3F0} 闯关挑战', W / 2, headerH / 2)

    // 返回按钮
    ctx.fillStyle = 'rgba(201,162,39,0.15)'
    this._roundRect(ctx, 6 * dpr, 8 * dpr, 70 * dpr, 36 * dpr, 8 * dpr)
    ctx.fill()
    ctx.fillStyle = '#c9a227'
    ctx.font = `${13 * dpr}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('\u2190 返回', 40 * dpr, headerH / 2)

    // ===== 章节导航标签栏 =====
    const tabY = headerH
    const tabH = 38 * dpr
    ctx.fillStyle = 'rgba(13,17,23,0.85)'
    ctx.fillRect(0, tabY, W, tabH)

    const tabPadding = 12 * dpr
    const tabBtnH = tabH - 10 * dpr
    const totalTabW = CHAPTERS.reduce((sum, ch) => {
      ctx.font = `bold ${11 * dpr}px sans-serif`
      return sum + ctx.measureText(`${ch.icon} 第${CHAPTERS.indexOf(ch)+1}章`).width + 24 * dpr
    }, 0)
    const tabStartX = Math.max(tabPadding, (W - totalTabW) / 2)
    let tabX = tabStartX

    CHAPTERS.forEach((ch, ci) => {
      ctx.font = `bold ${11 * dpr}px sans-serif`
      const tw = ctx.measureText(`${ch.icon} 第${ci+1}章`).width + 20 * dpr
      ctx.fillStyle = ch.color + '18'
      this._roundRect(ctx, tabX, tabY + 5 * dpr, tw, tabBtnH, 6 * dpr)
      ctx.fill()
      ctx.strokeStyle = ch.color + '44'
      ctx.lineWidth = 1
      this._roundRect(ctx, tabX, tabY + 5 * dpr, tw, tabBtnH, 6 * dpr)
      ctx.stroke()

      ctx.fillStyle = ch.color
      ctx.font = `bold ${11 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${ch.icon} 第${ci+1}章`, tabX + tw / 2, tabY + tabH / 2)
      tabX += tw + 8 * dpr
    })
    ctx.textBaseline = 'bottom'

    // ===== 关卡列表区域 =====
    const listTop = tabY + tabH + 6 * dpr
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, listTop, W, H - listTop)
    ctx.clip()

    this.stageButtons = []
    let curY = listTop + 4 * dpr

    // 双列布局参数
    const padding = 10 * dpr
    const colGap = 10 * dpr
    const cardW = (W - padding * 2 - colGap) / 2
    const cardH = 110 * dpr   // 卡片高度随dpr缩放，确保内容不溢出
    const cardGap = 10 * dpr

    for (const ch of CHAPTERS) {
      // 章节分隔标题
      const chRenderY = curY - this.scrollY
      if (chRenderY > listTop - 30 * dpr && chRenderY < H + 20 * dpr) {
        ctx.fillStyle = ch.color + '18'
        ctx.fillRect(padding, chRenderY, W - padding * 2, 30 * dpr)
        ctx.fillStyle = ch.color
        ctx.fillRect(padding, chRenderY, 3 * dpr, 30 * dpr)
        ctx.fillStyle = ch.color
        ctx.font = `bold ${13 * dpr}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`${ch.icon} ${ch.name}`, padding + 12 * dpr, chRenderY + 21 * dpr)
      }
      curY += 36 * dpr

      // 章节内的关卡（双列布局）
      let colIdx = 0
      for (let si = ch.startIdx; si <= ch.endIdx && si < TOWER_STAGES.length; si++) {
        const stage = TOWER_STAGES[si]
        const x = padding + colIdx * (cardW + colGap)
        const screenY = curY
        const ry = curY - this.scrollY
        const unlocked = si === 0 || this._isStageUnlocked(si)
        const isBoss = !!stage.boss
        const passed = this._isStageUnlocked(si)

        if (ry > H + 20 * dpr || ry + cardH < listTop - 20 * dpr) {
          colIdx++
          if (colIdx >= 2) { colIdx = 0; curY += cardH + cardGap }
          continue
        }

        this.stageButtons.push({ x, y: screenY, w: cardW, h: cardH, stage, unlocked })

        // ========== 卡片背景 ==========
        if (unlocked && !passed) {
          ctx.shadowBlur = isBoss ? 12 * dpr : 6 * dpr
          ctx.shadowColor = isBoss ? '#e67e2255' : ch.color + '33'
          this._roundRect(ctx, x, ry, cardW, cardH, 10 * dpr)
          ctx.shadowBlur = 0
        }

        const cardGrad = ctx.createLinearGradient(x, ry, x, ry + cardH)
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
        ctx.lineWidth = (passed || isBoss) ? 1.5 : 1
        ctx.fillStyle = cardGrad
        this._roundRect(ctx, x, ry, cardW, cardH, 10 * dpr)
        ctx.fill()
        ctx.stroke()

        // ===== 左上角：关卡编号徽章（紧凑圆角方块） =====
        const badgeSize = 26 * dpr
        const badgeX = x + 8 * dpr
        const badgeY = ry + 8 * dpr
        this._roundRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 6 * dpr)
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
          ctx.font = `bold ${14 * dpr}px sans-serif`
          ctx.fillText('✓', badgeX + badgeSize / 2, badgeY + badgeSize / 2)
        } else {
          ctx.fillStyle = unlocked ? '#fff' : '#555'
          ctx.font = `bold ${13 * dpr}px sans-serif`
          ctx.fillText(String(stage.id), badgeX + badgeSize / 2, badgeY + badgeSize / 2)
        }

        // ===== 内容区布局 =====
        const contentX = x + 40 * dpr
        const innerW = cardW - 48 * dpr   // 可用内容宽度

        if (!unlocked) {
          // ---- 锁定卡片：极简布局 ----
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillStyle = '#484f58'
          ctx.font = `bold ${14 * dpr}px sans-serif`
          ctx.fillText('???', contentX, ry + 12 * dpr)

          ctx.fillStyle = '#444c56'
          ctx.font = `${10 * dpr}px sans-serif`
          ctx.fillText('击败前一关解锁', contentX, ry + 34 * dpr)

          // 底部属性（暗色）
          const attrY = ry + cardH - 20 * dpr
          ctx.font = `bold ${9 * dpr}px sans-serif`
          ctx.fillStyle = '#2a2f38'
          const diffStars = stage.id <= 3 ? 1 : stage.id <= 7 ? 2 : stage.id <= 11 ? 3 : 4
          ctx.fillText(`⚔️ ${diffStars}星难度`, contentX, attrY)
          ctx.fillText('\u2606'.repeat(4), contentX + 66 * dpr, attrY)

          // 居中大锁图标
          ctx.fillStyle = 'rgba(0,0,0,0.35)'
          this._roundRect(ctx, x, ry, cardW, cardH, 10 * dpr)
          ctx.fill()
          ctx.fillStyle = '#58a6ff99'
          ctx.font = `${22 * dpr}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('🔒', x + cardW / 2, ry + cardH / 2)
        } else {
          // ---- 解锁卡片：完整信息 ----

          // 第一行：关卡名称
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillStyle = isBoss ? '#f0d0a0' : passed ? '#8fd4a0' : '#f0e6d3'
          ctx.font = `bold ${13 * dpr}px sans-serif`
          let displayName = stage.name
          while (ctx.measureText(displayName).width > innerW - 38 * dpr && displayName.length > 1) {
            displayName = displayName.slice(0, -1)
          }
          if (displayName !== stage.name) displayName += '..'
          ctx.fillText(displayName, contentX, ry + 10 * dpr)

          // 名称右侧状态标签
          const labelX = contentX + ctx.measureText(displayName).width + 6 * dpr
          if (labelX < x + cardW - 42 * dpr) {
            if (isBoss) {
              ctx.fillStyle = '#e67e2288'
              this._roundRect(ctx, labelX, ry + 10 * dpr, 44 * dpr, 15 * dpr, 3 * dpr)
              ctx.fill()
              ctx.fillStyle = '#e67e22'
              ctx.font = `bold ${9 * dpr}px sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText('👑 BOSS', labelX + 22 * dpr, ry + 17.5 * dpr)
            } else if (passed) {
              ctx.fillStyle = '#2ecc7188'
              this._roundRect(ctx, labelX, ry + 11 * dpr, 42 * dpr, 15 * dpr, 3 * dpr)
              ctx.fill()
              ctx.fillStyle = '#2ecc71'
              ctx.font = `${9 * dpr}px sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText('✓ 已通过', labelX + 21 * dpr, ry + 18.5 * dpr)
            }
          }

          // 第二行：描述
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillStyle = '#8b949e'
          ctx.font = `${10 * dpr}px sans-serif`
          let displayDesc = stage.desc
          while (ctx.measureText(displayDesc).width > innerW && displayDesc.length > 1) {
            displayDesc = displayDesc.slice(0, -1)
          }
          if (displayDesc !== stage.desc) displayDesc += '..'
          ctx.fillText(displayDesc, contentX, ry + 30 * dpr)

          // 第三行：底部属性栏（三段式：难度 | 星级 | 怪物）
          const attrY = ry + cardH - 20 * dpr
          ctx.font = `bold ${9 * dpr}px sans-serif`
          ctx.textBaseline = 'top'

          // 左段：难度
          const diffStars = stage.id <= 3 ? 1 : stage.id <= 7 ? 2 : stage.id <= 11 ? 3 : 4
          ctx.fillStyle = '#a855f788'
          ctx.fillText(`⚔️ ${diffStars}星难度`, contentX, attrY)

          // 中段：星级
          const starStr = '\u2605'.repeat(diffStars) + '\u2606'.repeat(4 - diffStars)
          ctx.fillStyle = isBoss ? '#e67e2288' : '#f39c1266'
          const starX = x + cardW * 0.45
          ctx.fillText(starStr, starX, attrY)

          // 右段：怪物类型
          const mIcon = this._getMonsterIcon(stage.monsterType)
          const mName = MONSTER_NAMES[stage.monsterType] || stage.monsterType
          ctx.fillStyle = '#58a6ff77'
          // 从右侧往左定位，避免溢出
          const mNameFull = `${mIcon} ${mName}`
          let mNameDisplay = mNameFull
          const maxMNameW = x + cardW - contentX - starX - 16 * dpr
          ctx.font = `bold ${9 * dpr}px sans-serif`
          while (ctx.measureText(mNameDisplay).width > maxMNameW && mNameDisplay.length > 3) {
            mNameDisplay = mNameDisplay.slice(0, -1)
          }
          if (mNameDisplay !== mNameFull && mNameDisplay.length > 2) mNameDisplay += '.'
          ctx.fillText(mNameDisplay, starX + 52 * dpr, attrY)
        }

        colIdx++
        if (colIdx >= 2) { colIdx = 0; curY += cardH + cardGap }
      }
      // 如果当前章节是奇数个卡片，换行
      if (colIdx > 0) { curY += cardH + cardGap }
      curY += 8 * dpr
    }

    ctx.restore()

    // ===== 滚动条 =====
    const maxScroll = this._maxScroll()
    if (maxScroll > 0) {
      const barAreaH = H - listTop
      const barH = Math.max(30 * dpr, barAreaH * (barAreaH / (curY + this.scrollY + 80 * dpr)))
      const barY = listTop + (barAreaH - barH) * (this.scrollY / maxScroll)
      ctx.fillStyle = '#21262d44'
      this._roundRect(ctx, W - 5 * dpr, listTop, 4 * dpr, barAreaH, 2 * dpr)
      ctx.fill()
      ctx.fillStyle = '#c9a22766'
      this._roundRect(ctx, W - 5 * dpr, barY, 4 * dpr, barH, 2 * dpr)
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
    ctx.fillText(isWin ? '所有波次已通过！' : '再接再厉，勇士！', W / 2, H * 0.2 + 36 * dpr)

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
