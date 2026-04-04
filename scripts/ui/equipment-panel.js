/**
 * equipment-panel.js - 装备管理界面
 * 显示角色装备槽、背包装备列表、装备详情
 */

import { equipmentManager } from '../managers/equipment-manager.js'
import { RARITY_CONFIG, EQUIP_TYPE_CONFIG } from '../data/equipment.js'
import { charStateManager } from '../data/character-state.js'

export class EquipmentPanel {
  constructor(game, character) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    
    this.character = character
    this.active = false
    this.selectedSlot = null // 当前选中的装备槽
    this.selectedInventoryItem = null // 当前选中的背包装备
    
    // 面板尺寸 - 根据屏幕大小自适应
    this.panelWidth = Math.min(600 * this.dpr, this.width * 0.95)
    this.panelHeight = Math.min(500 * this.dpr, this.height * 0.85)
    this.panelX = (this.width - this.panelWidth) / 2
    this.panelY = (this.height - this.panelHeight) / 2
    
    console.log(`[EquipmentPanel] 屏幕尺寸: ${this.width}x${this.height}, 面板尺寸: ${this.panelWidth}x${this.panelHeight}`)
    
    // 背包滚动
    this.inventoryScrollY = 0
    this.inventoryMaxScroll = 0
  }
  
  /**
   * 打开面板
   */
  open(character = null) {
    if (character) {
      this.character = character
    }
    this.active = true
    this.selectedSlot = null
    this.selectedInventoryItem = null
    this.inventoryScrollY = 0
  }
  
  /**
   * 关闭面板
   */
  close() {
    this.active = false
    this.selectedSlot = null
    this.selectedInventoryItem = null
  }
  
  /**
   * 处理点击
   */
  handleTap(tx, ty) {
    if (!this.active) return false
    
    // 检查关闭按钮
    const closeBtnX = this.panelX + this.panelWidth - 50 * this.dpr
    const closeBtnY = this.panelY + 15 * this.dpr
    if (this._isInRect(tx, ty, closeBtnX, closeBtnY, 40 * this.dpr, 40 * this.dpr)) {
      this.close()
      return true
    }
    
    // 检查装备槽点击
    const slotY = this.panelY + 80 * this.dpr
    const slotSpacing = 100 * this.dpr
    const slots = ['weapon', 'armor', 'accessory']
    
    for (let i = 0; i < slots.length; i++) {
      const slotX = this.panelX + 60 * this.dpr
      const slotYPos = slotY + i * slotSpacing
      const slotSize = 70 * this.dpr
      
      if (this._isInRect(tx, ty, slotX, slotYPos, slotSize, slotSize)) {
        this.selectedSlot = slots[i]
        this.selectedInventoryItem = null
        return true
      }
    }
    
    // 检查背包物品点击
    const inventory = equipmentManager.getInventory()
    const invX = this.panelX + 160 * this.dpr
    const invY = this.panelY + 80 * this.dpr
    const invWidth = 380 * this.dpr
    const invHeight = 280 * this.dpr
    const itemSize = 65 * this.dpr
    const cols = 5
    
    for (let i = 0; i < inventory.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const itemX = invX + col * (itemSize + 10 * this.dpr)
      const itemY = invY + row * (itemSize + 10 * this.dpr) - this.inventoryScrollY
      
      if (this._isInRect(tx, ty, itemX, itemY, itemSize, itemSize)) {
        this.selectedInventoryItem = inventory[i]
        this.selectedSlot = null
        return true
      }
    }
    
    // 检查操作按钮
    if (this.selectedSlot && this.selectedInventoryItem) {
      // 穿戴按钮
      const btnY = this.panelY + this.panelHeight - 70 * this.dpr
      if (this.selectedInventoryItem.type === this.selectedSlot) {
        const equipBtnX = this.panelX + 80 * this.dpr
        const equipBtnW = 150 * this.dpr
        const equipBtnH = 45 * this.dpr
        
        if (this._isInRect(tx, ty, equipBtnX, btnY, equipBtnW, equipBtnH)) {
          this._equipItem()
          return true
        }
      }
    }
    
    if (this.selectedSlot) {
      const currentEquip = this.character.equipment[this.selectedSlot]
      if (currentEquip) {
        // 卸下按钮
        const unequipBtnX = this.panelX + 250 * this.dpr
        const unequipBtnY = this.panelY + this.panelHeight - 70 * this.dpr
        const unequipBtnW = 150 * this.dpr
        const unequipBtnH = 45 * this.dpr
        
        if (this._isInRect(tx, ty, unequipBtnX, unequipBtnY, unequipBtnW, unequipBtnH)) {
          this._unequipItem()
          return true
        }
      }
    }
    
    return true
  }
  
  /**
   * 穿戴装备
   */
  _equipItem() {
    if (!this.selectedSlot || !this.selectedInventoryItem) return
    
    const oldEquip = equipmentManager.equip(this.character, this.selectedInventoryItem)
    
    // 如果有旧装备，添加回背包
    if (oldEquip) {
      // 旧装备已经在equip方法中处理了
    }
    
    this.selectedInventoryItem = null
    this.selectedSlot = null
    
    // 保存数据
    const charData = charStateManager.serialize()
    this.game.data.set('characterStates', charData)
    this.game.data.set('equipmentData', equipmentManager.serialize())
  }
  
  /**
   * 卸下装备
   */
  _unequipItem() {
    if (!this.selectedSlot) return
    
    equipmentManager.unequip(this.character, this.selectedSlot)
    
    this.selectedSlot = null
    
    // 保存数据
    const charData = charStateManager.serialize()
    this.game.data.set('characterStates', charData)
    this.game.data.set('equipmentData', equipmentManager.serialize())
  }
  
  /**
   * 处理滚动
   */
  handleScroll(deltaY) {
    if (!this.active) return
    
    const inventory = equipmentManager.getInventory()
    const itemSize = 65 * this.dpr
    const spacing = 10 * this.dpr
    const cols = 5
    const rows = Math.ceil(inventory.length / cols)
    const totalHeight = rows * (itemSize + spacing)
    const visibleHeight = 280 * this.dpr
    
    this.inventoryMaxScroll = Math.max(0, totalHeight - visibleHeight)
    
    this.inventoryScrollY += deltaY * this.dpr
    this.inventoryScrollY = Math.max(0, Math.min(this.inventoryScrollY, this.inventoryMaxScroll))
  }
  
  /**
   * 渲染面板
   */
  render(ctx) {
    if (!this.active) return
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 面板背景
    const panelGrad = ctx.createLinearGradient(
      this.panelX, this.panelY,
      this.panelX, this.panelY + this.panelHeight
    )
    panelGrad.addColorStop(0, '#2c3e50')
    panelGrad.addColorStop(1, '#34495e')
    
    ctx.fillStyle = panelGrad
    ctx.beginPath()
    this._roundRect(ctx, this.panelX, this.panelY, this.panelWidth, this.panelHeight, 20 * this.dpr)
    ctx.fill()
    
    // 边框
    ctx.strokeStyle = '#f39c12'
    ctx.lineWidth = 3 * this.dpr
    ctx.stroke()
    
    // 标题（动态字体大小）
    const titleFontSize = Math.min(24, this.panelHeight * 0.05) * this.dpr
    ctx.font = `bold ${titleFontSize}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(`装备管理 - ${this.character.name}`, this.panelX + this.panelWidth / 2, this.panelY + 40 * this.dpr)
    
    // 关闭按钮
    const closeBtnX = this.panelX + this.panelWidth - 50 * this.dpr
    const closeBtnY = this.panelY + 15 * this.dpr
    ctx.fillStyle = '#e74c3c'
    ctx.beginPath()
    ctx.arc(closeBtnX + 20 * this.dpr, closeBtnY + 20 * this.dpr, 18 * this.dpr, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `bold ${24 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('×', closeBtnX + 20 * this.dpr, closeBtnY + 28 * this.dpr)
    
    // 渲染装备槽
    this._renderEquipmentSlots(ctx)
    
    // 渲染背包
    this._renderInventory(ctx)
    
    // 渲染装备详情
    this._renderDetails(ctx)
    
    // 渲染操作按钮
    this._renderActionButtons(ctx)
  }
  
  /**
   * 渲染装备槽
   */
  _renderEquipmentSlots(ctx) {
    const slotY = this.panelY + 80 * this.dpr
    const slotSpacing = 100 * this.dpr
    const slots = ['weapon', 'armor', 'accessory']
    
    for (let i = 0; i < slots.length; i++) {
      const slotType = slots[i]
      const slotX = this.panelX + 60 * this.dpr
      const slotYPos = slotY + i * slotSpacing
      const slotSize = 70 * this.dpr
      
      // 槽位背景
      const isSelected = this.selectedSlot === slotType
      ctx.fillStyle = isSelected ? 'rgba(243, 156, 18, 0.3)' : 'rgba(0, 0, 0, 0.3)'
      ctx.beginPath()
      this._roundRect(ctx, slotX, slotYPos, slotSize, slotSize, 10 * this.dpr)
      ctx.fill()
      
      // 边框
      ctx.strokeStyle = isSelected ? '#f39c12' : 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
      
      // 装备类型标签
      const typeConfig = EQUIP_TYPE_CONFIG[slotType]
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = '#bdc3c7'
      ctx.textAlign = 'center'
      ctx.fillText(typeConfig.name, slotX + slotSize / 2, slotYPos - 8 * this.dpr)
      
      // 装备图标或空槽图标
      const equipment = this.character.equipment[slotType]
      if (equipment) {
        // 稀有度背景色
        const rarityConfig = RARITY_CONFIG[equipment.rarity]
        ctx.fillStyle = rarityConfig.color
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        this._roundRect(ctx, slotX + 5 * this.dpr, slotYPos + 5 * this.dpr, slotSize - 10 * this.dpr, slotSize - 10 * this.dpr, 8 * this.dpr)
        ctx.fill()
        ctx.globalAlpha = 1
        
        // 图标
        ctx.font = `${32 * this.dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(typeConfig.icon, slotX + slotSize / 2, slotYPos + slotSize / 2 + 10 * this.dpr)
      } else {
        // 空槽提示
        ctx.font = `${28 * this.dpr}px sans-serif`
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.textAlign = 'center'
        ctx.fillText(typeConfig.icon, slotX + slotSize / 2, slotYPos + slotSize / 2 + 10 * this.dpr)
      }
      
      // 装备名称（如果有）
      if (equipment) {
        const rarityConfig = RARITY_CONFIG[equipment.rarity]
        ctx.font = `${12 * this.dpr}px sans-serif`
        ctx.fillStyle = rarityConfig.color
        ctx.textAlign = 'left'
        ctx.fillText(equipment.name, slotX + slotSize + 10 * this.dpr, slotYPos + 30 * this.dpr)
        
        // 属性简略
        ctx.font = `${11 * this.dpr}px sans-serif`
        ctx.fillStyle = '#bdc3c7'
        let yOffset = slotYPos + 50 * this.dpr
        if (equipment.stats.atk) {
          ctx.fillText(`攻击 +${equipment.stats.atk}`, slotX + slotSize + 10 * this.dpr, yOffset)
          yOffset += 16 * this.dpr
        }
        if (equipment.stats.def) {
          ctx.fillText(`防御 +${equipment.stats.def}`, slotX + slotSize + 10 * this.dpr, yOffset)
          yOffset += 16 * this.dpr
        }
      }
    }
  }
  
  /**
   * 渲染背包
   */
  _renderInventory(ctx) {
    // 根据面板尺寸动态计算背包区域
    const margin = 20 * this.dpr
    const invX = this.panelX + margin + 140 * this.dpr
    const invY = this.panelY + 80 * this.dpr
    const invWidth = this.panelWidth - margin * 2 - 140 * this.dpr
    const invHeight = Math.min(280 * this.dpr, this.panelHeight - 200 * this.dpr)
    
    // 背包标题
    ctx.font = `${16 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ecf0f1'
    ctx.textAlign = 'left'
    ctx.fillText('背包装备', invX, invY - 10 * this.dpr)
    
    // 背包背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.beginPath()
    this._roundRect(ctx, invX, invY, invWidth, invHeight, 10 * this.dpr)
    ctx.fill()
    
    // 裁剪区域
    ctx.save()
    ctx.beginPath()
    this._roundRect(ctx, invX, invY, invWidth, invHeight, 10 * this.dpr)
    ctx.clip()
    
    // 渲染物品
    const inventory = equipmentManager.getInventory()
    const itemSize = Math.min(65 * this.dpr, invWidth / 6) // 根据宽度调整物品大小
    const spacing = 10 * this.dpr
    const cols = Math.floor(invWidth / (itemSize + spacing))
    
    for (let i = 0; i < inventory.length; i++) {
      const item = inventory[i]
      const col = i % cols
      const row = Math.floor(i / cols)
      const itemX = invX + col * (itemSize + spacing) + spacing
      const itemY = invY + row * (itemSize + spacing) + spacing - this.inventoryScrollY
      
      // 跳过不可见的物品
      if (itemY + itemSize < invY || itemY > invY + invHeight) continue
      
      const isSelected = this.selectedInventoryItem === item
      const typeConfig = EQUIP_TYPE_CONFIG[item.type]
      const rarityConfig = RARITY_CONFIG[item.rarity]
      
      // 物品背景
      ctx.fillStyle = isSelected ? 'rgba(243, 156, 18, 0.5)' : 'rgba(0, 0, 0, 0.5)'
      ctx.beginPath()
      this._roundRect(ctx, itemX, itemY, itemSize, itemSize, 8 * this.dpr)
      ctx.fill()
      
      // 稀有度边框
      ctx.strokeStyle = rarityConfig.color
      ctx.lineWidth = isSelected ? 3 * this.dpr : 2 * this.dpr
      ctx.stroke()
      
      // 图标
      ctx.font = `${Math.floor(itemSize * 0.45)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(typeConfig.icon, itemX + itemSize / 2, itemY + itemSize / 2 + 8 * this.dpr)
    }
    
    ctx.restore()
    
    // 背包为空提示
    if (inventory.length === 0) {
      ctx.font = `${16 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.textAlign = 'center'
      ctx.fillText('背包为空', invX + invWidth / 2, invY + invHeight / 2)
    }
    
    // 滚动提示
    if (this.inventoryMaxScroll > 0) {
      ctx.font = `${12 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.textAlign = 'right'
      ctx.fillText('滑动查看更多', invX + invWidth - 10 * this.dpr, invY + invHeight - 10 * this.dpr)
    }
  }
  
  /**
   * 渲染装备详情
   */
  _renderDetails(ctx) {
    const detailX = this.panelX + 160 * this.dpr
    const detailY = this.panelY + 380 * this.dpr
    const detailWidth = 380 * this.dpr
    
    const item = this.selectedInventoryItem || (this.selectedSlot ? this.character.equipment[this.selectedSlot] : null)
    
    if (!item) {
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.textAlign = 'center'
      ctx.fillText('选择装备查看详情', detailX + detailWidth / 2, detailY)
      return
    }
    
    const rarityConfig = RARITY_CONFIG[item.rarity]
    
    // 名称
    ctx.font = `bold ${16 * this.dpr}px sans-serif`
    ctx.fillStyle = rarityConfig.color
    ctx.textAlign = 'left'
    ctx.fillText(`${rarityConfig.name} ${item.name}`, detailX, detailY)
    
    // 描述
    ctx.font = `${12 * this.dpr}px sans-serif`
    ctx.fillStyle = '#bdc3c7'
    ctx.fillText(item.desc, detailX, detailY + 20 * this.dpr)
    
    // 属性
    let xOffset = detailX
    const statY = detailY + 42 * this.dpr
    ctx.font = `${12 * this.dpr}px sans-serif`
    
    if (item.stats.atk) {
      ctx.fillStyle = '#e74c3c'
      ctx.fillText(`攻击 +${item.stats.atk}`, xOffset, statY)
      xOffset += 80 * this.dpr
    }
    if (item.stats.def) {
      ctx.fillStyle = '#3498db'
      ctx.fillText(`防御 +${item.stats.def}`, xOffset, statY)
      xOffset += 80 * this.dpr
    }
    if (item.stats.maxHp) {
      ctx.fillStyle = '#2ecc71'
      ctx.fillText(`生命 +${item.stats.maxHp}`, xOffset, statY)
      xOffset += 80 * this.dpr
    }
    if (item.stats.maxMp) {
      ctx.fillStyle = '#9b59b6'
      ctx.fillText(`魔力 +${item.stats.maxMp}`, xOffset, statY)
    }
  }
  
  /**
   * 渲染操作按钮
   */
  _renderActionButtons(ctx) {
    const btnY = this.panelY + this.panelHeight - 70 * this.dpr
    const btnW = 150 * this.dpr
    const btnH = 45 * this.dpr
    
    // 穿戴按钮（选中背包物品和对应槽位时显示）
    if (this.selectedSlot && this.selectedInventoryItem) {
      if (this.selectedInventoryItem.type === this.selectedSlot) {
        const equipBtnX = this.panelX + 80 * this.dpr
        
        const btnGrad = ctx.createLinearGradient(equipBtnX, btnY, equipBtnX, btnY + btnH)
        btnGrad.addColorStop(0, '#2ecc71')
        btnGrad.addColorStop(1, '#27ae60')
        
        ctx.fillStyle = btnGrad
        ctx.beginPath()
        this._roundRect(ctx, equipBtnX, btnY, btnW, btnH, 10 * this.dpr)
        ctx.fill()
        
        ctx.font = `bold ${16 * this.dpr}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.fillText('穿戴装备', equipBtnX + btnW / 2, btnY + btnH / 2 + 6 * this.dpr)
      }
    }
    
    // 卸下按钮（选中槽位且槽位有装备时显示）
    if (this.selectedSlot) {
      const currentEquip = this.character.equipment[this.selectedSlot]
      if (currentEquip) {
        const unequipBtnX = this.panelX + 250 * this.dpr
        
        const btnGrad = ctx.createLinearGradient(unequipBtnX, btnY, unequipBtnX, btnY + btnH)
        btnGrad.addColorStop(0, '#e67e22')
        btnGrad.addColorStop(1, '#d35400')
        
        ctx.fillStyle = btnGrad
        ctx.beginPath()
        this._roundRect(ctx, unequipBtnX, btnY, btnW, btnH, 10 * this.dpr)
        ctx.fill()
        
        ctx.font = `bold ${16 * this.dpr}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.fillText('卸下装备', unequipBtnX + btnW / 2, btnY + btnH / 2 + 6 * this.dpr)
      }
    }
  }
  
  // 辅助方法：圆角矩形
  _roundRect(ctx, x, y, w, h, r) {
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
  
  // 辅助方法：检测点是否在矩形内
  _isInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh
  }
}
