/**
 * backpack-panel.js - 背包面板 UI 组件（全场景通用）
 *
 * 挂载于 Game（与 SettingsPanel 同构）：任何场景下点右上角 🎒 按钮即可打开，
 * 打开期间 Game 主循环暂停场景 update（野外战斗中浏览背包不会被怪物偷袭）。
 *
 * 功能：
 * - 金币栏：读取 data.gold（映射 player.gold）
 * - 装备页：equipmentManager 背包内未装备的装备（稀有度描边 + 类型图标 + 名称）
 * - 消耗品页：data.materials 素材库存（名称/描述查 materials.js 定义表）
 * - 队伍装备页：charStateManager 各角色武器/防具/饰品三槽位（含角色简要属性）
 * - 物品详情弹窗：属性明细 / 描述 / 售价 / 佩戴者
 * - 分页（每页 16 格）、点遮罩或 ✕ 关闭
 */

import { roundRect, darkenColor, isInRect } from './canvas-utils.js'
import { RARITY_CONFIG, EQUIP_TYPE_CONFIG } from '../data/equipment.js'
import { equipmentManager } from '../managers/equipment-manager.js'
import { charStateManager } from '../data/character-state.js'
import { getMaterialDef } from '../data/materials.js'

// 属性展示名（装备 stats 键 → 中文标签）
const STAT_LABELS = {
  atk: '物攻', matk: '魔攻', def: '防御',
  maxHp: '生命上限', maxMp: '魔力上限', spd: '速度',
  crit: '暴击率', mpRegen: '回蓝', hpRegen: '回血',
  cdr: '冷却缩减', lifesteal: '吸血'
}
// 比率型属性（展示为百分比）
const PERCENT_STATS = new Set(['crit', 'cdr', 'lifesteal'])

// 面板布局常量（逻辑像素，绘制时 ×dpr）
const PANEL_W = 340
const PANEL_H = 560
const GRID_COLS = 4
const GRID_ROWS = 4
const CELL = 70
const CELL_GAP = 8
const PAGE_SIZE = GRID_COLS * GRID_ROWS
// 网格区起点（相对面板左上角）
const GRID_X = 18
const GRID_Y = 136

export class BackpackPanel {
  constructor(game) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr || 1

    // 面板状态
    this.visible = false
    this.animProgress = 0   // 0-1 打开动画进度
    this.tab = 'equip'      // 'equip' | 'item' | 'wear'
    this.page = 0
    this.selectedItem = null  // 详情弹窗：{ kind:'equip'|'material', data, wearer }
    this.wearHeroId = null    // 队伍装备页当前查看的角色
  }

  // ================================================================
  //  对外接口
  // ================================================================

  show() {
    this.visible = true
    this.animProgress = 0
    this.page = 0
    this.selectedItem = null
    this._playSFX('ui_popup')
  }

  hide() {
    this.visible = false
    this.animProgress = 0
    this.selectedItem = null
  }

  update(dt) {
    if (!this.visible) return
    if (this.animProgress < 1) {
      this.animProgress = Math.min(1, this.animProgress + dt * 5)
    }
  }

  /**
   * 触摸处理（面板可见时拦截所有点击）
   * @returns {boolean} 是否消费（可见时恒为 true）
   */
  handleTap(x, y) {
    if (!this.visible) return false

    // ── 1. 详情弹窗打开时：优先处理（点 ✕ 或弹窗外关闭）──
    if (this.selectedItem) {
      const d = this._detailRect()
      const cx = d.x + d.w - 22 * this.dpr
      const cy = d.y + 22 * this.dpr
      const r = 16 * this.dpr
      const onClose = Math.hypot(x - cx, y - cy) <= r
      const inCard = isInRect(x, y, d.x, d.y, d.w, d.h)
      if (onClose || !inCard) {
        this.selectedItem = null
        this._playSFX('ui_cancel')
      }
      return true
    }

    const p = this._panelRect()

    // ── 2. 面板右上角 ✕ ──
    const xc = p.x + p.w - 26 * this.dpr
    const yc = p.y + 26 * this.dpr
    if (Math.hypot(x - xc, y - yc) <= 16 * this.dpr) {
      this.hide()
      this._playSFX('ui_cancel')
      return true
    }

    // ── 3. 底部关闭按钮 ──
    const closeBtn = this._closeBtnRect()
    if (isInRect(x, y, closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h)) {
      this.hide()
      this._playSFX('ui_cancel')
      return true
    }

    // ── 4. 页签切换 ──
    const tabs = this._tabRects()
    for (const t of tabs) {
      if (isInRect(x, y, t.x, t.y, t.w, t.h)) {
        if (this.tab !== t.id) {
          this.tab = t.id
          this.page = 0
          if (t.id === 'wear') this._ensureWearHero()
          this._playSFX('ui_click')
        }
        return true
      }
    }

    // ── 5. 内容区（按页签分派）──
    if (this.tab === 'wear') {
      this._handleWearTap(x, y, p)
    } else {
      this._handleGridTap(x, y, p)
    }
    if (this.selectedItem) return true

    // ── 6. 分页按钮（仅列表页签）──
    if (this.tab !== 'wear') {
      const pg = this._pageBtnRects()
      if (pg.prev && isInRect(x, y, pg.prev.x, pg.prev.y, pg.prev.w, pg.prev.h)) {
        if (this.page > 0) { this.page--; this._playSFX('ui_click') }
        return true
      }
      if (pg.next && isInRect(x, y, pg.next.x, pg.next.y, pg.next.w, pg.next.h)) {
        if (this.page < this._maxPage()) { this.page++; this._playSFX('ui_click') }
        return true
      }
    }

    // ── 7. 点面板外遮罩关闭 ──
    if (!isInRect(x, y, p.x, p.y, p.w, p.h)) {
      this.hide()
      this._playSFX('ui_cancel')
    }
    return true
  }

  // ================================================================
  //  数据访问
  // ================================================================

  getGold() {
    try { return Math.floor((this.game.data && this.game.data.get('gold')) || 0) } catch (e) { return 0 }
  }

  /** 装备页列表：背包内未装备的装备 */
  _getEquipList() {
    try { return equipmentManager.getInventory() || [] } catch (e) { return [] }
  }

  /** 消耗品页列表：素材库存 [{ id, count, def }] */
  _getMaterialList() {
    let mats = {}
    try { mats = (this.game.data && this.game.data.get('materials')) || {} } catch (e) { mats = {} }
    return Object.keys(mats)
      .filter(id => mats[id] > 0)
      .map(id => ({ id, count: mats[id], def: getMaterialDef(id) }))
  }

  /** 当前页签的数据列表 */
  _getList() {
    return this.tab === 'item' ? this._getMaterialList() : this._getEquipList()
  }

  _maxPage() {
    const n = this._getList().length
    return Math.max(0, Math.ceil(n / PAGE_SIZE) - 1)
  }

  // ================================================================
  //  渲染
  // ================================================================

  render(ctx) {
    if (!this.visible && this.animProgress <= 0) return

    const alpha = this.visible ? this.animProgress : 0
    const scale = 0.85 + 0.15 * this.animProgress
    const cx = this.width / 2
    const cy = this.height / 2
    const dpr = this.dpr

    ctx.save()
    ctx.globalAlpha = alpha

    // 遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(0, 0, this.width, this.height)

    // 面板（缩放动画）
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.translate(-cx, -cy)

    const p = this._panelRect()
    const d = dpr

    // 面板背景
    ctx.fillStyle = '#1a1a2e'
    ctx.strokeStyle = '#ff9f43'
    ctx.lineWidth = 3 * d
    roundRect(ctx, p.x, p.y, p.w, p.h, 15 * d)
    ctx.fill()
    ctx.stroke()

    // 标题
    ctx.font = `bold ${24 * d}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🎒 背包', cx, p.y + 36 * d)

    // ✕ 关闭按钮（右上角圆钮）
    this._renderCloseIcon(ctx, p.x + p.w - 26 * d, p.y + 26 * d, 16 * d)

    // 金币栏（胶囊）
    const goldStr = `💰 ${this._fmtGold(this.getGold())}`
    ctx.font = `bold ${18 * d}px sans-serif`
    const goldW = ctx.measureText ? (ctx.measureText(goldStr).width || 110 * d) : 110 * d
    const pillW = Math.max(120 * d, goldW + 30 * d)
    const pillX = cx - pillW / 2
    const pillY = p.y + 54 * d
    const pillH = 26 * d
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 216, 77, 0.45)'
    ctx.lineWidth = 1 * d
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
    ctx.stroke()
    ctx.fillStyle = '#ffd84d'
    ctx.font = `bold ${16 * d}px sans-serif`
    ctx.fillText(goldStr, cx, pillY + pillH / 2 + 1 * d)

    // 页签
    const tabs = this._tabRects()
    for (const t of tabs) {
      const active = this.tab === t.id
      ctx.fillStyle = active ? '#ff9f43' : '#16213e'
      roundRect(ctx, t.x, t.y, t.w, t.h, 8 * d)
      ctx.fill()
      ctx.strokeStyle = active ? darkenColor('#ff9f43', -40) : '#2f3b5c'
      ctx.lineWidth = 1.5 * d
      roundRect(ctx, t.x, t.y, t.w, t.h, 8 * d)
      ctx.stroke()
      ctx.fillStyle = active ? '#ffffff' : '#8892b0'
      ctx.font = `bold ${15 * d}px sans-serif`
      ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2 + 1 * d)
    }

    // 内容区
    if (this.tab === 'wear') {
      this._renderWear(ctx, p)
    } else {
      this._renderGrid(ctx, p)
    }

    ctx.restore()  // 缩放动画
    ctx.restore()  // 遮罩

    // 详情弹窗（不参与缩放动画，直接置顶）
    if (this.selectedItem) this._renderDetail(ctx)
  }

  /** 列表网格（装备/消耗品共用） */
  _renderGrid(ctx, p) {
    const d = this.dpr
    const list = this._getList()
    if (this.page > this._maxPage()) this.page = this._maxPage()
    const start = this.page * PAGE_SIZE
    const slice = list.slice(start, start + PAGE_SIZE)

    if (list.length === 0) {
      ctx.font = `${15 * d}px sans-serif`
      ctx.fillStyle = '#8892b0'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(this.tab === 'item' ? '还没有收集到任何素材~ 🐾' : '背包空空如也~ 🐾',
        p.x + p.w / 2, p.y + (GRID_Y + 150) * d)
    }

    for (let i = 0; i < slice.length; i++) {
      const col = i % GRID_COLS
      const row = Math.floor(i / GRID_COLS)
      const cx = p.x + (GRID_X + col * (CELL + CELL_GAP) + CELL / 2) * d
      const cy = p.y + (GRID_Y + row * (CELL + CELL_GAP) + CELL / 2) * d
      const item = slice[i]
      if (this.tab === 'equip') {
        this._renderEquipCell(ctx, cx, cy, item)
      } else {
        this._renderMaterialCell(ctx, cx, cy, item)
      }
    }

    // 分页控件
    const pg = this._pageBtnRects()
    if (pg.prev && pg.next) {
      ctx.fillStyle = '#16213e'
      for (const b of [pg.prev, pg.next]) {
        roundRect(ctx, b.x, b.y, b.w, b.h, 6 * d)
        ctx.fill()
        ctx.strokeStyle = '#2f3b5c'
        ctx.lineWidth = 1.5 * d
        roundRect(ctx, b.x, b.y, b.w, b.h, 6 * d)
        ctx.stroke()
      }
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${16 * d}px sans-serif`
      ctx.fillText('◀', pg.prev.x + pg.prev.w / 2, pg.prev.y + pg.prev.h / 2 + 1 * d)
      ctx.fillText('▶', pg.next.x + pg.next.w / 2, pg.next.y + pg.next.h / 2 + 1 * d)
      ctx.fillStyle = '#8892b0'
      ctx.font = `${14 * d}px sans-serif`
      ctx.fillText(`${this.page + 1} / ${this._maxPage() + 1}`, p.x + p.w / 2, pg.prev.y + pg.prev.h / 2 + 1 * d)
    }

    // 底部关闭按钮
    this._renderBottomClose(ctx)
  }

  /** 装备格：稀有度描边 + 类型图标 + 名称截断 */
  _renderEquipCell(ctx, cx, cy, equip) {
    const d = this.dpr
    const rarity = RARITY_CONFIG[equip.rarity] || RARITY_CONFIG.common
    const typeCfg = EQUIP_TYPE_CONFIG[equip.type] || {}
    const x = cx - CELL / 2 * d
    const y = cy - CELL / 2 * d
    const s = CELL * d

    ctx.fillStyle = '#16213e'
    roundRect(ctx, x, y, s, s, 8 * d)
    ctx.fill()
    ctx.strokeStyle = rarity.color
    ctx.lineWidth = 2 * d
    roundRect(ctx, x, y, s, s, 8 * d)
    ctx.stroke()

    // 类型图标
    ctx.font = `${26 * d}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(typeCfg.icon || '❔', cx, y + 24 * d)

    // 名称（最多 4 字）
    ctx.fillStyle = '#dde3f0'
    ctx.font = `${10 * d}px sans-serif`
    ctx.fillText(this._trunc(equip.name || equip.id, 4), cx, y + s - 12 * d)
  }

  /** 素材格：图标 + 数量角标 + 名称截断 */
  _renderMaterialCell(ctx, cx, cy, item) {
    const d = this.dpr
    const x = cx - CELL / 2 * d
    const y = cy - CELL / 2 * d
    const s = CELL * d

    ctx.fillStyle = '#16213e'
    roundRect(ctx, x, y, s, s, 8 * d)
    ctx.fill()
    ctx.strokeStyle = '#3d5a80'
    ctx.lineWidth = 2 * d
    roundRect(ctx, x, y, s, s, 8 * d)
    ctx.stroke()

    ctx.font = `${26 * d}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.def.icon || '🧪', cx, y + 24 * d)

    // 数量角标（右下）
    ctx.font = `bold ${11 * d}px sans-serif`
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffd84d'
    ctx.fillText(`×${item.count}`, x + s - 6 * d, y + s - 12 * d)

    // 名称
    ctx.textAlign = 'center'
    ctx.fillStyle = '#dde3f0'
    ctx.font = `${10 * d}px sans-serif`
    ctx.fillText(this._trunc(item.def.name || item.id, 4), cx, y + s - 12 * d)
  }

  /** 队伍装备页：角色选择行 + 属性摘要 + 三槽位 */
  _renderWear(ctx, p) {
    const d = this.dpr
    const heroes = this._getHeroes()
    if (heroes.length === 0) {
      ctx.font = `${15 * d}px sans-serif`
      ctx.fillStyle = '#8892b0'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('还没有伙伴加入~ 🐾', p.x + p.w / 2, p.y + (GRID_Y + 120) * d)
      this._renderBottomClose(ctx)
      return
    }

    // 默认选中第一个
    this._ensureWearHero()
    const hero = heroes.find(h => h.id === this.wearHeroId)

    // 角色选择行（横排，最多 6 个）
    const btnS = 52
    const totalW = heroes.length * btnS + (heroes.length - 1) * 10
    let hx = p.x + p.w / 2 - totalW / 2 * d
    const hy = p.y + GRID_Y * d
    for (const h of heroes) {
      const sel = h.id === this.wearHeroId
      ctx.fillStyle = sel ? '#ff9f43' : '#16213e'
      roundRect(ctx, hx, hy, btnS * d, btnS * d, 8 * d)
      ctx.fill()
      ctx.strokeStyle = sel ? darkenColor('#ff9f43', -40) : '#2f3b5c'
      ctx.lineWidth = sel ? 2 * d : 1.5 * d
      roundRect(ctx, hx, hy, btnS * d, btnS * d, 8 * d)
      ctx.stroke()
      ctx.fillStyle = sel ? '#ffffff' : '#8892b0'
      ctx.font = `bold ${13 * d}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(this._trunc(h.name || h.id, 3), hx + btnS * d / 2, hy + btnS * d / 2)
      hx += (btnS + 10) * d
    }

    // 属性摘要
    ctx.font = `${13 * d}px sans-serif`
    ctx.fillStyle = '#a8b2cc'
    ctx.fillText(`Lv.${hero.level}   ❤️ ${hero.maxHp}   ⚔️ ${hero.atk}   🛡️ ${hero.def}`,
      p.x + p.w / 2, p.y + (GRID_Y + 80) * d)

    // 三槽位：武器/防具/饰品
    const slots = ['weapon', 'armor', 'accessory']
    const slotW = 100
    const gap = 13
    let sx = p.x + (PANEL_W / 2 - (slots.length * slotW + (slots.length - 1) * gap) / 2) * d
    const sy = p.y + (GRID_Y + 106) * d
    for (const slot of slots) {
      const equip = hero.equipment ? hero.equipment[slot] : null
      const cfg = EQUIP_TYPE_CONFIG[slot] || {}
      const rarity = equip ? (RARITY_CONFIG[equip.rarity] || RARITY_CONFIG.common) : null

      ctx.fillStyle = '#16213e'
      roundRect(ctx, sx, sy, slotW * d, 100 * d, 8 * d)
      ctx.fill()
      ctx.strokeStyle = rarity ? rarity.color : '#2f3b5c'
      ctx.lineWidth = rarity ? 2 * d : 1.5 * d
      roundRect(ctx, sx, sy, slotW * d, 100 * d, 8 * d)
      ctx.stroke()

      // 槽位标题
      ctx.font = `${11 * d}px sans-serif`
      ctx.fillStyle = '#8892b0'
      ctx.textAlign = 'center'
      ctx.fillText(cfg.name || slot, sx + slotW * d / 2, sy + 14 * d)

      if (equip) {
        ctx.font = `${24 * d}px sans-serif`
        ctx.fillText(cfg.icon || '❔', sx + slotW * d / 2, sy + 42 * d)
        ctx.font = `${10 * d}px sans-serif`
        ctx.fillStyle = rarity ? rarity.color : '#dde3f0'
        ctx.fillText(this._trunc(equip.name, 5), sx + slotW * d / 2, sy + 74 * d)
      } else {
        ctx.font = `${22 * d}px sans-serif`
        ctx.fillStyle = '#3d4a6b'
        ctx.fillText('空', sx + slotW * d / 2, sy + 50 * d)
      }
      sx += (slotW + gap) * d
    }

    this._renderBottomClose(ctx)
  }

  /** 物品详情弹窗（置顶，不随面板缩放） */
  _renderDetail(ctx) {
    const d = this.dpr
    const sel = this.selectedItem
    const dr = this._detailRect()
    const cx = dr.x + dr.w / 2

    // 弹窗遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fillRect(0, 0, this.width, this.height)

    const equip = sel.kind === 'equip' ? sel.data : null
    const rarity = equip ? (RARITY_CONFIG[equip.rarity] || RARITY_CONFIG.common) : null
    const borderColor = rarity ? rarity.color : '#3d5a80'

    // 卡片
    ctx.fillStyle = '#1e2a4a'
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2.5 * d
    roundRect(ctx, dr.x, dr.y, dr.w, dr.h, 14 * d)
    ctx.fill()
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 名称
    ctx.font = `bold ${20 * d}px sans-serif`
    ctx.fillStyle = borderColor
    const title = equip ? equip.name : sel.data.def.name
    ctx.fillText(title, cx, dr.y + 30 * d)

    // 副标题：稀有度 · 类型 / 数量
    ctx.font = `${13 * d}px sans-serif`
    ctx.fillStyle = '#8892b0'
    let sub = ''
    if (equip) {
      sub = `${rarity.name} · ${(EQUIP_TYPE_CONFIG[equip.type] || {}).name || equip.type}`
      if (sel.wearer) sub += ` · ${sel.wearer} 佩戴中`
    } else {
      sub = `消耗品 · 持有 ${sel.data.count} 个`
    }
    ctx.fillText(sub, cx, dr.y + 54 * d)

    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1 * d
    ctx.beginPath()
    ctx.moveTo(dr.x + 20 * d, dr.y + 68 * d)
    ctx.lineTo(dr.x + dr.w - 20 * d, dr.y + 68 * d)
    ctx.stroke()

    let yy = dr.y + 86 * d

    if (equip) {
      // 属性行
      ctx.font = `${14 * d}px sans-serif`
      const stats = equip.stats || {}
      const keys = Object.keys(stats)
      if (keys.length === 0) {
        ctx.fillStyle = '#8892b0'
        ctx.fillText('无属性加成', cx, yy)
        yy += 20 * d
      }
      for (const k of keys) {
        const label = STAT_LABELS[k] || k
        const v = stats[k]
        const valStr = PERCENT_STATS.has(k) ? `+${Math.round(v * 100)}%` : `+${v}`
        const neg = (typeof v === 'number' && v < 0)
        ctx.fillStyle = neg ? '#ff6b81' : '#7bed9f'
        ctx.fillText(`${label}  ${neg ? String(v).replace('+', '') : valStr}`, cx, yy)
        yy += 20 * d
      }
    } else {
      ctx.fillStyle = '#7fe3ff'
      ctx.font = `bold ${14 * d}px sans-serif`
      ctx.fillText(`持有数量：${sel.data.count}`, cx, yy)
      yy += 20 * d
    }

    // 描述（自动换行）
    yy += 6 * d
    ctx.font = `${13 * d}px sans-serif`
    ctx.fillStyle = '#a8b2cc'
    const desc = equip ? (equip.desc || '') : (sel.data.def.desc || '')
    for (const line of this._wrapText(ctx, desc, dr.w - 44 * d, 13 * d)) {
      ctx.fillText(line, cx, yy)
      yy += 18 * d
    }

    // 售价（装备）
    if (equip) {
      yy = dr.y + dr.h - 52 * d
      ctx.font = `bold ${14 * d}px sans-serif`
      ctx.fillStyle = '#ffd84d'
      ctx.fillText(`💰 售出可得 ${equip.sellPrice != null ? equip.sellPrice : '—'} 金币`, cx, yy)
    }

    // 底部提示
    ctx.font = `${11 * d}px sans-serif`
    ctx.fillStyle = '#5c6784'
    ctx.fillText('点击空白处关闭', cx, dr.y + dr.h - 24 * d)

    // ✕
    this._renderCloseIcon(ctx, dr.x + dr.w - 22 * d, dr.y + 22 * d, 14 * d)
  }

  // ================================================================
  //  内部：布局矩形（物理像素）
  // ================================================================

  _panelRect() {
    const d = this.dpr
    return {
      x: (this.width - PANEL_W * d) / 2,
      y: (this.height - PANEL_H * d) / 2,
      w: PANEL_W * d,
      h: PANEL_H * d
    }
  }

  _tabRects() {
    const d = this.dpr
    const p = this._panelRect()
    const y = p.y + 86 * d
    const h = 34 * d
    // 单行三页签：总宽 312（左右各留 14），每页签 100，间距 6
    return [
      { id: 'equip', label: '⚔️ 装备', x: p.x + 14 * d, y, w: 100 * d, h },
      { id: 'item', label: '🧪 消耗品', x: p.x + 120 * d, y, w: 100 * d, h },
      { id: 'wear', label: '👕 队伍装备', x: p.x + 226 * d, y, w: 100 * d, h }
    ]
  }

  _closeBtnRect() {
    const d = this.dpr
    const p = this._panelRect()
    return { x: p.x + p.w / 2 - 60 * d, y: p.y + (PANEL_H - 62) * d, w: 120 * d, h: 44 * d }
  }

  _pageBtnRects() {
    const d = this.dpr
    const p = this._panelRect()
    if (this._getList().length <= PAGE_SIZE) return {}
    const y = p.y + (GRID_Y + GRID_ROWS * (CELL + CELL_GAP) + 6) * d
    return {
      prev: { x: p.x + 80 * d, y, w: 50 * d, h: 28 * d },
      next: { x: p.x + PANEL_W * d - 130 * d, y, w: 50 * d, h: 28 * d }
    }
  }

  /** 详情弹窗矩形（高度按内容动态计算，clamp） */
  _detailRect() {
    const d = this.dpr
    const sel = this.selectedItem
    let h = 220
    if (sel) {
      if (sel.kind === 'equip') {
        h = 150 + Object.keys(sel.data.stats || {}).length * 20
      } else {
        h = 170
      }
      const desc = sel.kind === 'equip' ? (sel.data.desc || '') : (sel.data.def.desc || '')
      h += this._wrapText(this.ctx, desc, (280 - 44) * d, 13 * d).length * 18
    }
    h = Math.min(h, 420)
    const w = 280 * d
    return {
      x: (this.width - w) / 2,
      y: (this.height - h * d) / 2,
      w,
      h: h * d
    }
  }

  // ================================================================
  //  内部：交互分派
  // ================================================================

  _handleGridTap(x, y, p) {
    const d = this.dpr
    const list = this._getList()
    if (this.page > this._maxPage()) this.page = this._maxPage()
    const start = this.page * PAGE_SIZE
    for (let i = 0; i < PAGE_SIZE; i++) {
      const idx = start + i
      if (idx >= list.length) break
      const col = i % GRID_COLS
      const row = Math.floor(i / GRID_COLS)
      const cellX = p.x + (GRID_X + col * (CELL + CELL_GAP)) * d
      const cellY = p.y + (GRID_Y + row * (CELL + CELL_GAP)) * d
      if (isInRect(x, y, cellX, cellY, CELL * d, CELL * d)) {
        const item = list[idx]
        if (this.tab === 'equip') {
          this.selectedItem = { kind: 'equip', data: item, wearer: null }
        } else {
          this.selectedItem = { kind: 'material', data: item }
        }
        this._playSFX('ui_click')
        return
      }
    }
  }

  _handleWearTap(x, y, p) {
    const d = this.dpr
    const heroes = this._getHeroes()
    if (heroes.length === 0) return
    this._ensureWearHero()
    const hero = heroes.find(h => h.id === this.wearHeroId)

    // 角色选择按钮
    const btnS = 52
    const totalW = heroes.length * btnS + (heroes.length - 1) * 10
    let hx = p.x + p.w / 2 - totalW / 2 * d
    const hy = p.y + GRID_Y * d
    for (const h of heroes) {
      if (isInRect(x, y, hx, hy, btnS * d, btnS * d)) {
        if (this.wearHeroId !== h.id) {
          this.wearHeroId = h.id
          this._playSFX('ui_click')
        }
        return
      }
      hx += (btnS + 10) * d
    }

    // 三槽位
    const slots = ['weapon', 'armor', 'accessory']
    const slotW = 100
    const gap = 13
    let sx = p.x + (PANEL_W / 2 - (slots.length * slotW + (slots.length - 1) * gap) / 2) * d
    const sy = p.y + (GRID_Y + 106) * d
    for (const slot of slots) {
      if (isInRect(x, y, sx, sy, slotW * d, 100 * d)) {
        const equip = hero.equipment ? hero.equipment[slot] : null
        if (equip) {
          this.selectedItem = { kind: 'equip', data: equip, wearer: hero.name }
          this._playSFX('ui_click')
        }
        return
      }
      sx += (slotW + gap) * d
    }
  }

  // ================================================================
  //  内部：工具
  // ================================================================

  _getHeroes() {
    try { return charStateManager.getAllCharacters() || [] } catch (e) { return [] }
  }

  /** 队伍装备页：确保选中一个有效角色（无效/未选时选第一个） */
  _ensureWearHero() {
    const heroes = this._getHeroes()
    if (heroes.length === 0) { this.wearHeroId = null; return }
    if (!this.wearHeroId || !heroes.find(h => h.id === this.wearHeroId)) {
      this.wearHeroId = heroes[0].id
    }
  }

  _renderCloseIcon(ctx, cx, cy, r) {
    const d = this.dpr
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#8892b0'
    ctx.lineWidth = 1.5 * d
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    const k = r * 0.42
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2 * d
    ctx.beginPath()
    ctx.moveTo(cx - k, cy - k)
    ctx.lineTo(cx + k, cy + k)
    ctx.moveTo(cx + k, cy - k)
    ctx.lineTo(cx - k, cy + k)
    ctx.stroke()
  }

  _renderBottomClose(ctx) {
    const d = this.dpr
    const b = this._closeBtnRect()
    const grad = ctx.createLinearGradient
      ? ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
      : null
    if (grad) {
      grad.addColorStop(0, '#ff9f43')
      grad.addColorStop(1, darkenColor('#ff9f43', -60))
      ctx.fillStyle = grad
    } else {
      ctx.fillStyle = '#ff9f43'
    }
    roundRect(ctx, b.x, b.y, b.w, b.h, 10 * d)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${18 * d}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('关闭', b.x + b.w / 2, b.y + b.h / 2 + 1 * d)
  }

  _trunc(s, n) {
    s = String(s || '')
    return s.length > n ? s.slice(0, n) + '..' : s
  }

  _fmtGold(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  /** 简易自动换行（measureText 不可用时按字宽估算） */
  _wrapText(ctx, text, maxWidth, fontSize) {
    text = String(text || '')
    if (!text) return []
    const lines = []
    let line = ''
    for (const ch of text) {
      const tryLine = line + ch
      let w = NaN
      try {
        if (ctx && typeof ctx.measureText === 'function') {
          const m = ctx.measureText(tryLine)
          if (m && typeof m.width === 'number') w = m.width
        }
      } catch (e) { /* ignore */ }
      if (!isFinite(w)) w = tryLine.length * fontSize * 1.05
      if (w > maxWidth && line) {
        lines.push(line)
        line = ch
      } else {
        line = tryLine
      }
    }
    if (line) lines.push(line)
    return lines.length ? lines : ['']
  }

  _playSFX(name) {
    try {
      if (this.game && this.game.audio && this.game.audio.playSFX) {
        this.game.audio.playSFX(name)
      }
    } catch (e) { /* ignore */ }
  }
}
