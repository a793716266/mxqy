/**
 * enhance-panel.js - 城镇装备强化器（类似 DNF 强化机）
 * 由城镇内的「装备强化器」机器打开。强化消耗【金币 + 火焰核心】。
 * 选中角色 → 选中装备（已穿戴槽位 / 背包共享库存）→ 查看双消耗 → 强化。
 */

import {
  equipmentManager,
  ENHANCE_MAX_LEVEL,
  ENHANCE_MATERIAL_ID,
  ENHANCE_MATERIAL_COST,
} from '../managers/equipment-manager.js'
import { RARITY_CONFIG, EQUIP_TYPE_CONFIG } from '../data/equipment.js'
import { charStateManager } from '../data/character-state.js'
import { getMaterialDef } from '../data/materials.js'
import { roundRect, isInRect } from './canvas-utils.js'

export class EnhancePanel {
  constructor(game) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr

    // 队伍（强化可针对任意出战角色）
    this.party = charStateManager.getAllCharacters()
    this.partyIndex = 0
    this.character = this.party[0] || null

    this.active = false
    this.selectedSlot = null
    this.selectedInventoryItem = null

    this.panelWidth = Math.min(640 * this.dpr, this.width * 0.96)
    this.panelHeight = Math.min(580 * this.dpr, this.height * 0.92)
    this.panelX = (this.width - this.panelWidth) / 2
    this.panelY = (this.height - this.panelHeight) / 2

    this.inventoryScrollY = 0
    this.inventoryMaxScroll = 0

    // toast 提示（{text, color, until}）
    this._toast = null
  }

  open() {
    this.active = true
    // 默认选中当前被控角色
    const ctrlId = this.game.controlledHeroId
    const idx = this.party.findIndex(c => c.id === ctrlId)
    this.partyIndex = idx >= 0 ? idx : 0
    this.character = this.party[this.partyIndex]
    this.selectedSlot = null
    this.selectedInventoryItem = null
    this.inventoryScrollY = 0
  }

  close() {
    this.active = false
    this.selectedSlot = null
    this.selectedInventoryItem = null
  }

  _switchHero(dir) {
    const n = this.party.length
    if (n === 0) return
    this.partyIndex = (this.partyIndex + dir + n) % n
    this.character = this.party[this.partyIndex]
    this.selectedSlot = null
    this.selectedInventoryItem = null
  }

  handleTap(tx, ty) {
    if (!this.active) return false

    // 关闭按钮
    const closeBtnX = this.panelX + this.panelWidth - 30 * this.dpr
    const closeBtnY = this.panelY + 35 * this.dpr
    if (Math.sqrt((tx - closeBtnX) ** 2 + (ty - closeBtnY) ** 2) <= 20 * this.dpr) {
      this.close()
      return true
    }

    // 角色切换箭头
    const heroY = this.panelY + 95 * this.dpr
    if (this._isInRect(tx, ty, this.panelX + 30 * this.dpr, heroY - 18 * this.dpr, 44 * this.dpr, 44 * this.dpr)) {
      this._switchHero(-1); return true
    }
    if (this._isInRect(tx, ty, this.panelX + this.panelWidth - 74 * this.dpr, heroY - 18 * this.dpr, 44 * this.dpr, 44 * this.dpr)) {
      this._switchHero(1); return true
    }

    // 装备槽
    const slotY = this.panelY + 150 * this.dpr
    const slotSpacing = 100 * this.dpr
    const slots = ['weapon', 'armor', 'accessory']
    for (let i = 0; i < slots.length; i++) {
      const sx = this.panelX + 40 * this.dpr
      const sy = slotY + i * slotSpacing
      if (this._isInRect(tx, ty, sx, sy, 70 * this.dpr, 70 * this.dpr)) {
        this.selectedSlot = slots[i]
        return true
      }
    }

    // 背包物品
    const invX = this.panelX + 150 * this.dpr
    const invY = this.panelY + 150 * this.dpr
    const invW = this.panelWidth - 170 * this.dpr
    const invH = 280 * this.dpr
    const itemSize = 65 * this.dpr
    const spacing = 10 * this.dpr
    const cols = Math.max(1, Math.floor(invW / (itemSize + spacing)))
    const inventory = equipmentManager.getInventory()
    for (let i = 0; i < inventory.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const ix = invX + col * (itemSize + spacing)
      const iy = invY + row * (itemSize + spacing) - this.inventoryScrollY
      if (this._isInRect(tx, ty, ix, iy, itemSize, itemSize)) {
        this.selectedInventoryItem = inventory[i]
        return true
      }
    }

    // 强化按钮
    if (this._getEnhanceTarget()) {
      const btnX = this.panelX + this.panelWidth / 2 - 110 * this.dpr
      const btnY = this.panelY + this.panelHeight - 70 * this.dpr
      if (this._isInRect(tx, ty, btnX, btnY, 220 * this.dpr, 48 * this.dpr)) {
        this._enhanceItem()
        return true
      }
    }

    return true
  }

  handleScroll(deltaY) {
    if (!this.active) return
    const invW = this.panelWidth - 170 * this.dpr
    const itemSize = 65 * this.dpr
    const spacing = 10 * this.dpr
    const cols = Math.max(1, Math.floor(invW / (itemSize + spacing)))
    const invH = 280 * this.dpr
    const totalHeight = Math.ceil(equipmentManager.getInventory().length / cols) * (itemSize + spacing)
    this.inventoryMaxScroll = Math.max(0, totalHeight - invH)
    this.inventoryScrollY = Math.max(0, Math.min(this.inventoryScrollY + deltaY * this.dpr, this.inventoryMaxScroll))
  }

  // ======== 强化逻辑（金币 + 火焰核心双消耗）========

  _getEnhanceTarget() {
    if (this.selectedInventoryItem) return this.selectedInventoryItem
    if (this.selectedSlot) return (this.character && this.character.equipment[this.selectedSlot]) || null
    return null
  }

  _getMaterials() {
    const mats = (this.game.data.get && this.game.data.get('materials')) || {}
    return mats[ENHANCE_MATERIAL_ID] || 0
  }

  _showToast(text, color) {
    this._toast = { text, color: color || '#ffffff', until: Date.now() + 1800 }
  }

  _enhanceItem() {
    const target = this._getEnhanceTarget()
    if (!target) return

    if (!equipmentManager.canEnhance(target)) {
      this._showToast(`已达最高强化等级 +${ENHANCE_MAX_LEVEL}`, '#e74c3c')
      return
    }

    const goldCost = equipmentManager.enhanceCost(target)
    const gold = this.game.data.get('gold') || 0
    const mats = this._getMaterials()

    if (gold < goldCost) {
      this._showToast(`金币不足（需要 ${goldCost}）`, '#e74c3c')
      return
    }
    if (mats < ENHANCE_MATERIAL_COST) {
      this._showToast(`火焰核心不足（需要 ${ENHANCE_MATERIAL_COST}，持有 ${mats}）`, '#e74c3c')
      return
    }

    const result = equipmentManager.enhance(this.character, target)
    if (!result.ok) {
      this._showToast(result.reason || '强化失败', '#e74c3c')
      return
    }

    // 扣金币 + 扣材料 + 持久化（与穿戴/卸下同一范式）
    this.game.data.set('gold', gold - goldCost)
    const m = (this.game.data.get('materials')) || {}
    m[ENHANCE_MATERIAL_ID] = Math.max(0, (m[ENHANCE_MATERIAL_ID] || 0) - ENHANCE_MATERIAL_COST)
    this.game.data.set('materials', m)
    this.game.data.set('characterStates', charStateManager.serialize())
    this.game.data.set('equipmentData', equipmentManager.serialize())

    this._showToast(`强化成功 +${result.level}（-${goldCost} 金币 / -${ENHANCE_MATERIAL_COST} 火焰核心）`, '#2ecc71')
  }

  // ======== 渲染 ========

  render(ctx) {
    if (!this.active) return

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, this.width, this.height)

    const grad = ctx.createLinearGradient(this.panelX, this.panelY, this.panelX, this.panelY + this.panelHeight)
    grad.addColorStop(0, '#3a2f1a')
    grad.addColorStop(1, '#1f1a10')
    ctx.fillStyle = grad
    ctx.beginPath()
    this._roundRect(ctx, this.panelX, this.panelY, this.panelWidth, this.panelHeight, 20 * this.dpr)
    ctx.fill()
    ctx.strokeStyle = '#f39c12'
    ctx.lineWidth = 3 * this.dpr
    ctx.stroke()

    // 标题
    ctx.font = `bold ${22 * this.dpr}px sans-serif`
    ctx.fillStyle = '#f39c12'
    ctx.textAlign = 'center'
    ctx.fillText('装备强化器', this.panelX + this.panelWidth / 2, this.panelY + 38 * this.dpr)

    // 关闭
    const closeBtnX = this.panelX + this.panelWidth - 50 * this.dpr
    ctx.fillStyle = '#e74c3c'
    ctx.beginPath()
    ctx.arc(closeBtnX + 20 * this.dpr, this.panelY + 35 * this.dpr, 18 * this.dpr, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `bold ${24 * this.dpr}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText('×', closeBtnX + 20 * this.dpr, this.panelY + 43 * this.dpr)

    // 角色选择器
    const heroY = this.panelY + 95 * this.dpr
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    this._roundRect(ctx, this.panelX + 80 * this.dpr, heroY - 22 * this.dpr, this.panelWidth - 160 * this.dpr, 44 * this.dpr, 10 * this.dpr)
    ctx.fill()
    ctx.font = `bold ${18 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ecf0f1'
    ctx.textAlign = 'center'
    ctx.fillText(this.character ? `角色：${this.character.name}` : '无角色', this.panelX + this.panelWidth / 2, heroY + 6 * this.dpr)
    ctx.font = `${26 * this.dpr}px sans-serif`
    ctx.fillStyle = '#f1c40f'
    ctx.fillText('◀', this.panelX + 52 * this.dpr, heroY + 8 * this.dpr)
    ctx.fillText('▶', this.panelX + this.panelWidth - 52 * this.dpr, heroY + 8 * this.dpr)

    // 装备槽
    const slotY = this.panelY + 150 * this.dpr
    const slotSpacing = 100 * this.dpr
    const slots = ['weapon', 'armor', 'accessory']
    for (let i = 0; i < slots.length; i++) {
      const slotType = slots[i]
      const sx = this.panelX + 40 * this.dpr
      const sy = slotY + i * slotSpacing
      const isSel = this.selectedSlot === slotType
      ctx.fillStyle = isSel ? 'rgba(243,156,18,0.3)' : 'rgba(0,0,0,0.3)'
      ctx.beginPath()
      this._roundRect(ctx, sx, sy, 70 * this.dpr, 70 * this.dpr, 10 * this.dpr)
      ctx.fill()
      ctx.strokeStyle = isSel ? '#f39c12' : 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()

      const typeConfig = EQUIP_TYPE_CONFIG[slotType]
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = '#bdc3c7'
      ctx.textAlign = 'center'
      ctx.fillText(typeConfig.name, sx + 35 * this.dpr, sy - 8 * this.dpr)

      const equipment = this.character && this.character.equipment[slotType]
      if (equipment) {
        const rarity = RARITY_CONFIG[equipment.rarity]
        ctx.fillStyle = rarity.color
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        this._roundRect(ctx, sx + 5 * this.dpr, sy + 5 * this.dpr, 60 * this.dpr, 60 * this.dpr, 8 * this.dpr)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.font = `${32 * this.dpr}px sans-serif`
        ctx.fillText(typeConfig.icon, sx + 35 * this.dpr, sy + 42 * this.dpr)
        const enhLv = equipmentManager.getEnhanceLevel(equipment.id)
        ctx.font = `${12 * this.dpr}px sans-serif`
        ctx.fillStyle = rarity.color
        ctx.textAlign = 'left'
        ctx.fillText(equipment.name + (enhLv > 0 ? ` +${enhLv}` : ''), sx + 80 * this.dpr, sy + 30 * this.dpr)
      }
    }

    // 背包
    const invX = this.panelX + 150 * this.dpr
    const invY = this.panelY + 150 * this.dpr
    const invW = this.panelWidth - 170 * this.dpr
    const invH = 280 * this.dpr
    ctx.font = `${16 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ecf0f1'
    ctx.textAlign = 'left'
    ctx.fillText('背包装备（共享库存）', invX, invY - 10 * this.dpr)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    this._roundRect(ctx, invX, invY, invW, invH, 10 * this.dpr)
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    this._roundRect(ctx, invX, invY, invW, invH, 10 * this.dpr)
    ctx.clip()
    const itemSize = 65 * this.dpr
    const spacing = 10 * this.dpr
    const cols = Math.max(1, Math.floor(invW / (itemSize + spacing)))
    const inventory = equipmentManager.getInventory()
    for (let i = 0; i < inventory.length; i++) {
      const item = inventory[i]
      const col = i % cols
      const row = Math.floor(i / cols)
      const ix = invX + col * (itemSize + spacing) + spacing
      const iy = invY + row * (itemSize + spacing) + spacing - this.inventoryScrollY
      if (iy + itemSize < invY || iy > invY + invH) continue
      const isSel = this.selectedInventoryItem === item
      const rarity = RARITY_CONFIG[item.rarity]
      ctx.fillStyle = isSel ? 'rgba(243,156,18,0.5)' : 'rgba(0,0,0,0.5)'
      ctx.beginPath()
      this._roundRect(ctx, ix, iy, itemSize, itemSize, 8 * this.dpr)
      ctx.fill()
      ctx.strokeStyle = rarity.color
      ctx.lineWidth = isSel ? 3 * this.dpr : 2 * this.dpr
      ctx.stroke()
      ctx.font = `${Math.floor(itemSize * 0.45)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      ctx.fillText(EQUIP_TYPE_CONFIG[item.type].icon, ix + itemSize / 2, iy + itemSize / 2 + 8 * this.dpr)
      const enhLv = equipmentManager.getEnhanceLevel(item.id)
      if (enhLv > 0) {
        ctx.font = `${12 * this.dpr}px sans-serif`
        ctx.fillStyle = '#f1c40f'
        ctx.textAlign = 'right'
        ctx.fillText(`+${enhLv}`, ix + itemSize - 4 * this.dpr, iy + itemSize - 4 * this.dpr)
      }
    }
    ctx.restore()
    if (this.inventoryMaxScroll > 0) {
      ctx.font = `${12 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.textAlign = 'right'
      ctx.fillText('滑动查看更多', invX + invW - 10 * this.dpr, invY + invH - 10 * this.dpr)
    }

    // 详情 + 双消耗
    const detailX = this.panelX + 40 * this.dpr
    const detailY = this.panelY + this.panelHeight - 170 * this.dpr
    const item = this._getEnhanceTarget()
    ctx.textAlign = 'left'
    if (!item) {
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText('选择装备以查看强化费用', detailX, detailY)
    } else {
      const rarity = RARITY_CONFIG[item.rarity]
      const enhLv = equipmentManager.getEnhanceLevel(item.id)
      const matName = getMaterialDef(ENHANCE_MATERIAL_ID).name
      ctx.font = `bold ${16 * this.dpr}px sans-serif`
      ctx.fillStyle = rarity.color
      ctx.fillText(`${rarity.name} ${item.name}` + (enhLv > 0 ? ` +${enhLv}` : ''), detailX, detailY)
      const goldCost = equipmentManager.enhanceCost(item)
      const hasMat = this._getMaterials()
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = '#f1c40f'
      ctx.fillText(`金币 ${goldCost}（持有 ${this.game.data.get('gold') || 0}）`, detailX, detailY + 26 * this.dpr)
      ctx.fillStyle = (hasMat >= ENHANCE_MATERIAL_COST) ? '#ff7675' : '#e74c3c'
      ctx.fillText(`${matName} ×${ENHANCE_MATERIAL_COST}（持有 ${hasMat}）`, detailX, detailY + 50 * this.dpr)
    }

    // 强化按钮
    const btnX = this.panelX + this.panelWidth / 2 - 110 * this.dpr
    const btnY = this.panelY + this.panelHeight - 70 * this.dpr
    const canDo = !!item && equipmentManager.canEnhance(item)
    const canAfford = item && (this.game.data.get('gold') || 0) >= equipmentManager.enhanceCost(item) && this._getMaterials() >= ENHANCE_MATERIAL_COST
    const enabled = canDo && canAfford
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + 48 * this.dpr)
    btnGrad.addColorStop(0, enabled ? '#f1c40f' : '#7f8c8d')
    btnGrad.addColorStop(1, enabled ? '#d4ac0d' : '#616a6b')
    ctx.fillStyle = btnGrad
    ctx.beginPath()
    this._roundRect(ctx, btnX, btnY, 220 * this.dpr, 48 * this.dpr, 10 * this.dpr)
    ctx.fill()
    ctx.font = `bold ${18 * this.dpr}px sans-serif`
    ctx.fillStyle = enabled ? '#fff' : 'rgba(255,255,255,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText(canDo ? '强化装备' : '已满级', btnX + 110 * this.dpr, btnY + 30 * this.dpr)

    // toast
    if (this._toast) {
      if (Date.now() < this._toast.until) {
        const ty = this.panelY + this.panelHeight - 120 * this.dpr
        ctx.font = `bold ${15 * this.dpr}px sans-serif`
        ctx.textAlign = 'center'
        const tw = ctx.measureText(this._toast.text).width + 30 * this.dpr
        const tx = this.panelX + this.panelWidth / 2
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.beginPath()
        this._roundRect(ctx, tx - tw / 2, ty - 20 * this.dpr, tw, 30 * this.dpr, 8 * this.dpr)
        ctx.fill()
        ctx.fillStyle = this._toast.color
        ctx.fillText(this._toast.text, tx, ty)
      } else {
        this._toast = null
      }
    }
  }

  _roundRect(ctx, x, y, w, h, r) { roundRect(ctx, x, y, w, h, r) }
  _isInRect(px, py, rx, ry, rw, rh) { return isInRect(px, py, rx, ry, rw, rh) }
}
