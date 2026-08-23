/**
 * character-info-panel.js - 角色信息面板UI组件
 */

import { roundRect } from './canvas-utils.js'
import { equipmentManager } from '../managers/equipment-manager.js'
import { EQUIP_TYPE_CONFIG, RARITY_CONFIG } from '../data/equipment.js'

export class CharacterInfoPanel {
  constructor(game, character) {
    this.game = game
    this.ctx = game.ctx
    this.dpr = game.dpr
    this.character = character
    
    // 面板状态
    this.visible = false
    this.x = 0
    this.y = 0
    this.width = 0
    this.height = 0
  }
  
  /**
   * 显示面板
   */
  show() {
    this.visible = true
  }

  /**
   * ★ 切换面板显示的角色（角色切换控制后更新卡片/头像）
   */
  setCharacter(character) {
    this.character = character
  }
  
  /**
   * 隐藏面板
   */
  hide() {
    this.visible = false
  }
  
  /**
   * 切换显示状态
   */
  toggle() {
    this.visible = !this.visible
  }
  
  /**
   * 渲染角色信息卡片（简略版，显示在右上角）
   */
  renderMiniCard(x, y) {
    const char = this.character
    if (!char) return
    
    const cardWidth = 180 * this.dpr
    const cardHeight = 100 * this.dpr

    // 背景
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    this._roundRect(x, y, cardWidth, cardHeight, 10 * this.dpr)
    this.ctx.fill()

    // 边框
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    this.ctx.lineWidth = 2
    this._roundRect(x, y, cardWidth, cardHeight, 10 * this.dpr)
    this.ctx.stroke()

    // 角色头像框
    const avatarSize = 60 * this.dpr
    const avatarX = x + 15 * this.dpr
    const avatarY = y + 20 * this.dpr

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    this.ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize)

    // 角色头像（如果有）
    const avatarImg = this.game.assets.get(`HERO_${char.id.toUpperCase()}`)
    if (avatarImg) {
      this.ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize)
    } else {
      // 默认emoji
      this.ctx.font = `${40 * this.dpr}px sans-serif`
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'middle'
      this.ctx.fillText('🐱', avatarX + avatarSize / 2, avatarY + avatarSize / 2)
    }

    // 角色名称和等级
    this.ctx.font = `bold ${16 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffffff'
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'top'
    this.ctx.fillText(char.name, avatarX + avatarSize + 10 * this.dpr, avatarY)

    // 等级
    this.ctx.font = `${14 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffd700'
    this.ctx.fillText(`Lv.${char.level}`, avatarX + avatarSize + 10 * this.dpr, avatarY + 22 * this.dpr)

    // 经验条
    const expBarX = avatarX + avatarSize + 10 * this.dpr
    const expBarY = avatarY + 44 * this.dpr
    const expBarWidth = 85 * this.dpr
    const expBarHeight = 8 * this.dpr

    // 经验条背景
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    this.ctx.fillRect(expBarX, expBarY, expBarWidth, expBarHeight)

    // 经验条进度（★ 防御：char 可能是 party 普通对象无 getExpProgress 方法）
    const expProgress = (typeof char.getExpProgress === 'function') ? char.getExpProgress() : 0
    this.ctx.fillStyle = '#4caf50'
    this.ctx.fillRect(expBarX, expBarY, expBarWidth * expProgress, expBarHeight)

    // 经验文字
    this.ctx.font = `${10 * this.dpr}px sans-serif`
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    this.ctx.textAlign = 'center'
    this.ctx.fillText(
      `${char.exp}/${char.maxExp}`,
      expBarX + expBarWidth / 2,
      expBarY + expBarHeight + 2 * this.dpr
    )

    // HP条
    const hpBarX = x + 15 * this.dpr
    const hpBarY = y + cardHeight - 25 * this.dpr
    const hpBarWidth = cardWidth - 30 * this.dpr
    const hpBarHeight = 10 * this.dpr

    // HP条背景
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    this.ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight)

    // HP条进度
    const hpProgress = Math.max(0, Math.min(1, char.hp / (char.maxHp || 1)))

    // ── ★ 扣血追赶动画（残影层）：受击瞬间真实血量掉落，白色残影保持高位再缓慢追回 ──
    const lagProgress = this._updateHpLag(char, hpProgress)
    // 1) 残影层（亮白，先画，长度=受击前的血量，缓慢缩短）
    if (lagProgress > hpProgress) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      this.ctx.fillRect(hpBarX, hpBarY, hpBarWidth * lagProgress, hpBarHeight)
    }
    // 2) 真实血量层（后画，盖住前段；颜色随血量绿→橙→红）
    this.ctx.fillStyle = this._getHpColor(hpProgress)
    this.ctx.fillRect(hpBarX, hpBarY, hpBarWidth * hpProgress, hpBarHeight)

    // HP文字
    this.ctx.font = `${10 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffffff'
    this.ctx.textAlign = 'center'
    this.ctx.fillText(
      `HP ${char.hp}/${char.maxHp}`,
      hpBarX + hpBarWidth / 2,
      hpBarY + hpBarHeight / 2 + 3 * this.dpr
    )

    return { x, y, width: cardWidth, height: cardHeight }
  }
  
  /**
   * ★ 估算面板内容垂直总占用（含所有节 + BUFF，留底部安全空白）
   * 渲染前先调用以决定 panelHeight，让「状态 / HP / MP / BUFF」必落在面板内不溢出
   */
  _calcDetailPanelContentHeight(char, buffsCount) {
    const dpr = this.dpr
    const lineH = 35 * dpr
    const sep = 15 * dpr
    const slotH = 66 * dpr
    const safePad = 24 * dpr
    let h = 0
    h += 70 * dpr                 // 顶部 title bar
    h += lineH                    // Lv.${char.level} ${char.title}
    h += lineH * 0.8              // 经验: ${...} / ${...}  文字
    h += lineH                    // 经验条 + 百分比 (lineHeight 内含 12 进度条)
    h += sep                      // 分隔线
    h += lineH                    // 「属性」标题
    h += lineH * 0.9 * 5          // 5 项属性（生命/魔法/攻击/防御/速度）
    h += 10 * dpr                 // 间隔
    h += lineH                    // 「装备」标题与第一槽间已有 14 dpr gap 但与 35 title 行高同段共存
    h += slotH                    // 装备槽本身
    h += 16 * dpr                 // 装备槽底到下行分隔线
    h += sep                      // 分隔线
    h += lineH                    // 「状态」标题
    // HP/MP 行：图标+条+数字，每行 18 icon + 8 gap = 26 dpr
    const stateRowH = 26 * dpr
    h += stateRowH                // HP 行（带迷你血条）
    h += stateRowH                // MP 行（带迷你蓝条）
    if (buffsCount > 0) h += lineH * 0.9 * buffsCount   // BUFF 列表
    h += safePad                  // 底部安全留白
    return Math.max(540 * dpr, h)  // 永不低于原 540 dpr
  }

  /**
   * 渲染详细面板
   */
  renderDetailPanel() {
    if (!this.visible) return null

    const char = this.character
    if (!char) return null

    const screenWidth = this.game.width
    const screenHeight = this.game.height

    // 面板尺寸 — ★ panelHeight 自适应（5 节 + BUFF 计算预估），避免「状态」节溢出
    const panelWidth = 280 * this.dpr
    // 先扫一遍拿到活跃 BUFF 数量（用于后续决定面板高度与 BUFF 列表绘制）
    const buffs = (char._buffs || []).filter(b => b._active && b._remaining > 0)
    const panelHeight = Math.min(
      screenHeight - 120 * this.dpr,
      this._calcDetailPanelContentHeight(char, buffs.length)
    )
    const panelX = (screenWidth - panelWidth) / 2
    const panelY = (screenHeight - panelHeight) / 2
    
    // 半透明遮罩
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    this.ctx.fillRect(0, 0, screenWidth, screenHeight)
    
    // 主面板背景
    this.ctx.fillStyle = 'rgba(20, 30, 50, 0.95)'
    this._roundRect(panelX, panelY, panelWidth, panelHeight, 15 * this.dpr)
    this.ctx.fill()
    
    // 边框
    this.ctx.strokeStyle = '#4a9eff'
    this.ctx.lineWidth = 3
    this._roundRect(panelX, panelY, panelWidth, panelHeight, 15 * this.dpr)
    this.ctx.stroke()
    
    // 标题栏
    this.ctx.fillStyle = 'rgba(74, 158, 255, 0.3)'
    this.ctx.fillRect(panelX, panelY, panelWidth, 50 * this.dpr)
    
    // 角色名称
    this.ctx.font = `bold ${20 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffffff'
    this.ctx.textAlign = 'center'
    this.ctx.fillText(char.name, panelX + panelWidth / 2, panelY + 32 * this.dpr)
    
    // 关闭按钮
    this.ctx.font = `${24 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ff5555'
    this.ctx.textAlign = 'right'
    this.ctx.fillText('✕', panelX + panelWidth - 15 * this.dpr, panelY + 35 * this.dpr)
    
    // 内容区域
    let offsetY = panelY + 70 * this.dpr
    const lineHeight = 35 * this.dpr
    const leftMargin = panelX + 20 * this.dpr
    
    // 等级和称号
    this.ctx.font = `${16 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffd700'
    this.ctx.textAlign = 'left'
    this.ctx.fillText(`Lv.${char.level} ${char.title}`, leftMargin, offsetY)
    offsetY += lineHeight
    
    // 经验值
    this.ctx.fillStyle = '#a0a0a0'
    this.ctx.font = `${14 * this.dpr}px sans-serif`
    this.ctx.fillText(`经验: ${char.exp} / ${char.maxExp}`, leftMargin, offsetY)
    offsetY += lineHeight * 0.8
    
    // 经验条
    const expBarWidth = panelWidth - 40 * this.dpr
    const expBarHeight = 12 * this.dpr
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    this.ctx.fillRect(leftMargin, offsetY, expBarWidth, expBarHeight)

    // ★ 防御：char 可能是 party 普通对象无 getExpProgress 方法
    const expProgress = (typeof char.getExpProgress === 'function') ? char.getExpProgress() : 0
    this.ctx.fillStyle = '#4caf50'
    this.ctx.fillRect(leftMargin, offsetY, expBarWidth * expProgress, expBarHeight)

    // ★ 描边 + 百分比文字：经验为 0 时进度槽轮廓仍清晰可见，不显空白
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    this.ctx.lineWidth = 1 * this.dpr
    this.ctx.strokeRect(leftMargin, offsetY, expBarWidth, expBarHeight)
    this.ctx.font = `${10 * this.dpr}px sans-serif`
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(`${Math.round(expProgress * 100)}%`, leftMargin + expBarWidth / 2, offsetY + expBarHeight / 2)
    this.ctx.textAlign = 'left'
    offsetY += lineHeight
    
    // 分隔线
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    this.ctx.beginPath()
    this.ctx.moveTo(leftMargin, offsetY)
    this.ctx.lineTo(panelX + panelWidth - 20 * this.dpr, offsetY)
    this.ctx.stroke()
    offsetY += 15 * this.dpr
    
    // 属性列表（★ 攻击/防御显示含 BUFF 加成后的数值，有 BUFF 时金色高亮）
    this.ctx.font = `bold ${16 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillText('属性', leftMargin, offsetY)
    offsetY += lineHeight

    // buffs 已在外层决策 panelHeight 时算过，复用
    const hasAtkBuff = buffs.some(b => b.type === 'atk_up' || b.type === 'atk_up_self')
    const hasDefBuff = buffs.some(b => b.type === 'def_up' || b.type === 'def_up_self')
    let atkVal = char.atk || 0
    let defVal = char.def || 0
    if (typeof char._getAtkWithBuff === 'function') atkVal = char._getAtkWithBuff()
    if (typeof char._getDefWithBuff === 'function') defVal = char._getDefWithBuff()

    const stats = [
      { name: '生命值', value: char.maxHp, icon: '❤️', color: '#ff5555', buffed: false },
      { name: '魔法值', value: char.maxMp, icon: '💙', color: '#5555ff', buffed: false },
      { name: '攻击力', value: atkVal, icon: '⚔️', color: '#ff8800', buffed: hasAtkBuff },
      { name: '防御力', value: defVal, icon: '🛡️', color: '#00aaff', buffed: hasDefBuff },
      { name: '速度', value: char.spd, icon: '⚡', color: '#ffdd00', buffed: false }
    ]
    
    this.ctx.font = `${14 * this.dpr}px sans-serif`
    for (const stat of stats) {
      this.ctx.fillStyle = '#a0a0a0'
      this.ctx.fillText(`${stat.icon} ${stat.name}`, leftMargin, offsetY)
      // 有 BUFF 时数值金色 + ▲ 标记
      this.ctx.fillStyle = stat.buffed ? '#ffd700' : stat.color
      this.ctx.textAlign = 'right'
      this.ctx.fillText(stat.value.toString() + (stat.buffed ? '▲' : ''), panelX + panelWidth - 20 * this.dpr, offsetY)
      this.ctx.textAlign = 'left'
      offsetY += lineHeight * 0.9
    }
    
    offsetY += 10 * this.dpr

    // ── 装备槽 + 卸下（点击角色卡查看装备，可卸下回归背包）──
    const slotDefs = ['weapon', 'armor', 'accessory']
    const eqGap = 10 * this.dpr
    const eqSlotW = (panelWidth - 40 * this.dpr - eqGap * 2) / 3
    const eqSlotH = 66 * this.dpr
    const eqX0 = leftMargin
    const eqY = offsetY
    this.ctx.font = `bold ${16 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffffff'
    this.ctx.textAlign = 'left'
    this.ctx.fillText('装备', leftMargin, eqY)
    const slotBounds = []
    for (let i = 0; i < slotDefs.length; i++) {
      const slot = slotDefs[i]
      const sx = eqX0 + i * (eqSlotW + eqGap)
      const cfg = EQUIP_TYPE_CONFIG[slot] || {}
      const eq = (char.equipment && char.equipment[slot]) || null
      const rarity = eq ? (RARITY_CONFIG[eq.rarity] || RARITY_CONFIG.common) : null
      // 槽底
      this.ctx.fillStyle = '#16213e'
      roundRect(this.ctx, sx, eqY + 14 * this.dpr, eqSlotW, eqSlotH, 8 * this.dpr)
      this.ctx.fill()
      this.ctx.strokeStyle = rarity ? rarity.color : '#2f3b5c'
      this.ctx.lineWidth = rarity ? 2 * this.dpr : 1.5 * this.dpr
      roundRect(this.ctx, sx, eqY + 14 * this.dpr, eqSlotW, eqSlotH, 8 * this.dpr)
      this.ctx.stroke()
      // 槽名
      this.ctx.font = `${11 * this.dpr}px sans-serif`
      this.ctx.fillStyle = '#8892b0'
      this.ctx.textAlign = 'center'
      this.ctx.fillText(cfg.name || slot, sx + eqSlotW / 2, eqY + 28 * this.dpr)
      let unequipBtn = null
      if (eq) {
        this.ctx.font = `${22 * this.dpr}px sans-serif`
        this.ctx.fillStyle = '#dde3f0'
        this.ctx.fillText(cfg.icon || '❔', sx + eqSlotW / 2, eqY + 56 * this.dpr)
        // 卸下按钮（仅装备存在时）
        const ubW = eqSlotW - 8 * this.dpr
        const ubH = 18 * this.dpr
        const ubX = sx + 4 * this.dpr
        const ubY = eqY + 14 * this.dpr + eqSlotH - ubH - 4 * this.dpr
        this.ctx.fillStyle = '#e67e22'
        roundRect(this.ctx, ubX, ubY, ubW, ubH, 5 * this.dpr)
        this.ctx.fill()
        this.ctx.fillStyle = '#ffffff'
        this.ctx.font = `bold ${11 * this.dpr}px sans-serif`
        this.ctx.fillText('卸下', ubX + ubW / 2, ubY + ubH / 2 + 1 * this.dpr)
        unequipBtn = { x: ubX, y: ubY, width: ubW, height: ubH }
      } else {
        this.ctx.font = `${20 * this.dpr}px sans-serif`
        this.ctx.fillStyle = '#3d4a6b'
        this.ctx.fillText('空', sx + eqSlotW / 2, eqY + 56 * this.dpr)
      }
      slotBounds.push({ slot, x: sx, y: eqY + 14 * this.dpr, width: eqSlotW, height: eqSlotH, unequipBtn })
    }
    offsetY = eqY + 14 * this.dpr + eqSlotH + 16 * this.dpr

    // 分隔线
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    this.ctx.beginPath()
    this.ctx.moveTo(leftMargin, offsetY)
    this.ctx.lineTo(panelX + panelWidth - 20 * this.dpr, offsetY)
    this.ctx.stroke()
    offsetY += 15 * this.dpr
    
    // 当前状态（★ 重设计：可视化 HP / MP 迷你条 + 数值右浮，告别「贴底拥挤的纯文字三行」）
    this.ctx.font = `bold ${16 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillText('状态', leftMargin, offsetY)
    offsetY += lineHeight

    // HP 行：❤️ + 文字 + 迷你血条 + 数值右浮
    {
      const rowY = offsetY
      const iconSize = 18 * this.dpr
      const label = '❤️ HP'
      const labelX = leftMargin
      // 标签
      this.ctx.font = `bold ${14 * this.dpr}px sans-serif`
      this.ctx.fillStyle = '#ffb3b3'
      this.ctx.textAlign = 'left'
      this.ctx.textBaseline = 'middle'
      this.ctx.fillText(label, labelX, rowY + iconSize / 2)
      // 数字（右下绝对位置，与文字基线齐）
      const valueText = `${char.hp} / ${char.maxHp}`
      this.ctx.font = `bold ${13 * this.dpr}px sans-serif`
      this.ctx.fillStyle = '#ff8080'
      this.ctx.textAlign = 'right'
      this.ctx.fillText(valueText, panelX + panelWidth - 20 * this.dpr, rowY + iconSize / 2)
      // 迷你血条：占据中间区
      const barX = labelX + 64 * this.dpr
      const barY = rowY + 2 * this.dpr
      const barW = (panelX + panelWidth - 20 * this.dpr) - barX - 78 * this.dpr
      const barH = 14 * this.dpr
      const hpProgress = Math.max(0, Math.min(1, char.hp / (char.maxHp || 1)))
      // 底（半透黑+圆角）
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      roundRect(this.ctx, barX, barY, barW, barH, 6 * this.dpr)
      this.ctx.fill()
      // ★ 扣血残影层（先画，受击旧值）
      const lagProgress = this._updateHpLag(char, hpProgress)
      if (lagProgress > hpProgress) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
        roundRect(this.ctx, barX, barY, barW * lagProgress, barH, 6 * this.dpr)
        this.ctx.fill()
      }
      // 实际 HP（后画，颜色随血量绿→橙→红）
      this.ctx.fillStyle = this._getHpColor(hpProgress)
      roundRect(this.ctx, barX, barY, barW * hpProgress, barH, 6 * this.dpr)
      this.ctx.fill()
      // 描边
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
      this.ctx.lineWidth = 1
      roundRect(this.ctx, barX, barY, barW, barH, 6 * this.dpr)
      this.ctx.stroke()
      offsetY += iconSize + 8 * this.dpr
    }

    // MP 行：💙 + 文字 + 迷你蓝条 + 数值右浮
    {
      const rowY = offsetY
      const iconSize = 18 * this.dpr
      const label = '💙 MP'
      const labelX = leftMargin
      this.ctx.font = `bold ${14 * this.dpr}px sans-serif`
      this.ctx.fillStyle = '#b3c8ff'
      this.ctx.textAlign = 'left'
      this.ctx.textBaseline = 'middle'
      this.ctx.fillText(label, labelX, rowY + iconSize / 2)
      const valueText = `${char.mp} / ${char.maxMp}`
      this.ctx.font = `bold ${13 * this.dpr}px sans-serif`
      this.ctx.fillStyle = '#80a8ff'
      this.ctx.textAlign = 'right'
      this.ctx.fillText(valueText, panelX + panelWidth - 20 * this.dpr, rowY + iconSize / 2)
      const barX = labelX + 64 * this.dpr
      const barY = rowY + 2 * this.dpr
      const barW = (panelX + panelWidth - 20 * this.dpr) - barX - 78 * this.dpr
      const barH = 14 * this.dpr
      const mpProgress = Math.max(0, Math.min(1, char.mp / (char.maxMp || 1)))
      // 底
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      roundRect(this.ctx, barX, barY, barW, barH, 6 * this.dpr)
      this.ctx.fill()
      // 实际 MP（蓝紫色渐变，简化为蓝紫）
      const mpColor = mpProgress > 0.5 ? '#6c8eff' : mpProgress > 0.2 ? '#9b7bff' : '#ff77aa'
      this.ctx.fillStyle = mpColor
      roundRect(this.ctx, barX, barY, barW * mpProgress, barH, 6 * this.dpr)
      this.ctx.fill()
      // 描边
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
      this.ctx.lineWidth = 1
      roundRect(this.ctx, barX, barY, barW, barH, 6 * this.dpr)
      this.ctx.stroke()
      offsetY += iconSize + 8 * this.dpr
    }
    // 复位基线（之后 BUFF 列表绘制用）
    this.ctx.textBaseline = 'top'

    // ★ BUFF 状态列表（开 BUFF 后显示：名称 + 效果 + 剩余秒数）
    if (buffs.length > 0) {
      this.ctx.font = `${14 * this.dpr}px sans-serif`
      for (const b of buffs) {
        const hex = this._rgbaToHex(b._color)
        const buffLabel = b.type === 'def_up' ? '防御提升' :
                          b.type === 'def_up_self' ? '金盾防御' :
                          b.type === 'atk_up' ? '攻击提升' :
                          b.type === 'atk_up_self' ? '狂暴攻击' :
                          b.type === 'spd_up' ? '速度提升' : '增益'
        this.ctx.fillStyle = hex
        this.ctx.fillText(`✦ ${buffLabel}`, leftMargin, offsetY)
        // 剩余秒数（右侧）
        this.ctx.textAlign = 'right'
        this.ctx.fillStyle = '#ffffff'
        this.ctx.fillText(`${Math.ceil(b._remaining)}s`, panelX + panelWidth - 20 * this.dpr, offsetY)
        this.ctx.textAlign = 'left'
        offsetY += lineHeight * 0.9
      }
    }
    
    return {
      x: panelX,
      y: panelY,
      width: panelWidth,
      height: panelHeight,
      closeBtn: {
        x: panelX + panelWidth - 40 * this.dpr,
        y: panelY + 10 * this.dpr,
        width: 30 * this.dpr,
        height: 30 * this.dpr
      },
      slots: slotBounds
    }
  }
  
  /**
   * ★ 扣血追赶（残影）动画状态更新
   * 受击时残影保持旧血量高位，随后以固定速率追赶到当前血量（经典格斗游戏扣血效果）；
   * 回血/满血时残影直接跟随，不做动画。
   * @param {Object} char 角色（含 hp/maxHp）
   * @param {number} hpProgress 当前血量比例 0~1
   * @returns {number} 残影层比例 0~1（恒 >= hpProgress）
   */
  _updateHpLag(char, hpProgress) {
    const nowT = Date.now()
    if (!this._hpLagLastT) this._hpLagLastT = nowT
    let dt = (nowT - this._hpLagLastT) / 1000
    this._hpLagLastT = nowT
    if (dt < 0) dt = 0
    if (dt > 0.1) dt = 0.1   // 切后台回来防止跳变

    if (!this._hpLagMap) this._hpLagMap = {}
    const key = char.id || char.name || 'main'
    const maxHp = char.maxHp || 1
    let lag = this._hpLagMap[key]
    const hpVal = hpProgress * maxHp
    if (typeof lag !== 'number' || lag < hpVal) {
      // 未初始化 / 回血：残影直接跟随真实血量
      lag = hpVal
    } else {
      // 受击：残影缓慢追赶（每秒追回 20% 满血，一次明显受击约 1~2 秒追完）
      lag = Math.max(hpVal, lag - maxHp * 0.2 * dt)
    }
    this._hpLagMap[key] = lag
    return Math.max(0, Math.min(1, lag / maxHp))
  }

  /**
   * 获取HP条颜色
   */
  _getHpColor(progress) {
    if (progress > 0.6) return '#4caf50'
    if (progress > 0.3) return '#ff9800'
    return '#f44336'
  }

  /**
   * 把 rgba(...) 转成 hex（用于 buff 图标颜色）
   */
  _rgbaToHex(c) {
    if (!c) return '#5f9fff'
    const m = c.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/)
    if (!m) return c
    const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3])
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
  }
  
  /**
   * 绘制圆角矩形
   */
  /** @deprecated 使用 canvas-utils.roundRect() */
  _roundRect(x, y, w, h, r) { roundRect(this.ctx, x, y, w, h, r) }
}
