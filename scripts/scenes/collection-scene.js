/**
 * collection-scene.js - 猫咪图鉴场景
 */

import { CAT_COLLECTION } from '../data/cats.js'

export class CollectionScene {
  constructor(game) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    
    // 滚动偏移
    this.scrollY = 0
    this.maxScrollY = 0
    
    // 已解锁的猫咪
    this.unlockedCats = game.data.get('unlockedCats') || [1, 2, 3]
    
    // 返回按钮
    this.backBtn = null
  }
  
  init() {
    // 计算最大滚动距离
    const itemHeight = 120 * this.dpr
    const totalHeight = CAT_COLLECTION.length * itemHeight
    this.maxScrollY = Math.max(0, totalHeight - this.height + 100 * this.dpr)
    
    // 返回按钮
    const btnW = 160 * this.dpr
    const btnH = 50 * this.dpr
    this.backBtn = {
      x: this.width - btnW - 20 * this.dpr,
      y: 20 * this.dpr,
      w: btnW,
      h: btnH
    }
  }
  
  update(dt) {
    this.time += dt
    
    // 返回按钮
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        if (tap.x >= this.backBtn.x && tap.x <= this.backBtn.x + this.backBtn.w &&
            tap.y >= this.backBtn.y && tap.y <= this.backBtn.y + this.backBtn.h) {
          this.game.changeScene('main-menu')
          return
        }
      }
    }
    
    // 滚动处理
    if (this.game.input.dragging) {
      const delta = this.game.input.dragDelta.y
      this.scrollY -= delta
      this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.scrollY))
    }
  }
  
  render(ctx) {
    // 背景
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.height)
    bgGrad.addColorStop(0, '#1a1a2e')
    bgGrad.addColorStop(1, '#16213e')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 标题
    ctx.font = `bold ${36 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🐱 猫咪图鉴', this.width / 2, 50 * this.dpr)
    
    // 已解锁数量
    ctx.font = `${18 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(`已解锁: ${this.unlockedCats.length} / ${CAT_COLLECTION.length}`, this.width / 2, 90 * this.dpr)
    
    // 猫咪列表
    const startY = 130 * this.dpr - this.scrollY
    const itemHeight = 120 * this.dpr
    const padding = 20 * this.dpr
    
    ctx.save()
    // 裁剪区域（防止滚动时超出）
    ctx.beginPath()
    ctx.rect(0, 130 * this.dpr, this.width, this.height - 180 * this.dpr)
    ctx.clip()
    
    CAT_COLLECTION.forEach((cat, i) => {
      const y = startY + i * itemHeight
      // 跳过屏幕外的
      if (y + itemHeight < 0 || y > this.height) return
      
      const isUnlocked = this.unlockedCats.includes(cat.id)
      this._drawCatItem(ctx, cat, padding, y, this.width - padding * 2, itemHeight - 10 * this.dpr, isUnlocked)
    })
    
    ctx.restore()
    
    // 返回按钮
    this._drawButton(ctx, this.backBtn, '← 返回', '#ff6b6b')
  }
  
  _drawCatItem(ctx, cat, x, y, w, h, unlocked) {
    const r = 10 * this.dpr
    
    // 背景（手动画圆角矩形）
    ctx.fillStyle = unlocked ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
    ctx.fill()
    
    // 边框
    ctx.strokeStyle = unlocked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    const avatarSize = 60 * this.dpr
    
    if (unlocked) {
      // 猫咪立绘
      const catImgKey = `CAT_${String(cat.id).padStart(2, '0')}`
      const catImg = this.game.assets.get(catImgKey)
      
      if (catImg) {
        // 绘制猫咪图片
        ctx.drawImage(catImg, x + 15 * this.dpr, y + (h - avatarSize) / 2, avatarSize, avatarSize)
      } else {
        // 备用：emoji
        ctx.font = `${40 * this.dpr}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('🐱', x + 20 * this.dpr, y + h / 2)
      }
      
      // 名称
      ctx.font = `bold ${22 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(cat.name, x + avatarSize + 25 * this.dpr, y + 30 * this.dpr)
      
      // 类型
      ctx.font = `${16 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(cat.type, x + avatarSize + 25 * this.dpr, y + 55 * this.dpr)
      
      // 描述
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText(cat.desc, x + avatarSize + 25 * this.dpr, y + 80 * this.dpr)
    } else {
      // 未解锁 - 显示问号
      ctx.font = `${40 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillText('?', x + avatarSize / 2 + 15 * this.dpr, y + h / 2)
      
      ctx.font = `${20 * this.dpr}px sans-serif`
      ctx.fillText('未解锁', x + w / 2 + 20 * this.dpr, y + h / 2)
    }
  }
  
  _drawButton(ctx, btn, text, color) {
    const { x, y, w, h } = btn
    const r = 8 * this.dpr

    // 手动画圆角矩形
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
    
    const grad = ctx.createLinearGradient(x, y, x, y + h)
    grad.addColorStop(0, color)
    grad.addColorStop(1, this._darkenColor(color, 0.3))
    ctx.fillStyle = grad
    ctx.fill()
    
    ctx.font = `bold ${20 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + w / 2, y + h / 2)
  }
  
  _darkenColor(hex, amount) {
    const num = parseInt(hex.slice(1), 16)
    let r = (num >> 16) & 255
    let g = (num >> 8) & 255
    let b = num & 255
    r = Math.floor(r * (1 - amount))
    g = Math.floor(g * (1 - amount))
    b = Math.floor(b * (1 - amount))
    return `rgb(${r},${g},${b})`
  }
}
