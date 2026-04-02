/**
 * input-manager.js - 触摸/点击输入管理
 * 微信小游戏使用全局触摸事件，不是 canvas 的事件
 */

export class InputManager {
  constructor(dpr) {
    this.dpr = dpr || 1
    this.touches = {}       // 当前帧触摸
    this.lastTouches = {}   // 上一帧触摸
    this.taps = []          // 本帧点击
    this.dragging = false
    this.dragStart = null
    this.dragDelta = { x: 0, y: 0 }
    this.moveEvents = []    // 触摸移动事件
    this.endEvents = []     // 触摸结束事件

    // 微信小游戏使用全局触摸事件
    wx.onTouchStart((e) => this._onTouchStart(e))
    wx.onTouchMove((e) => this._onTouchMove(e))
    wx.onTouchEnd((e) => this._onTouchEnd(e))
  }

  // 注册触摸移动监听器
  onMove(callback) {
    this.moveEvents.push(callback)
  }

  // 注册触摸结束监听器
  onEnd(callback) {
    this.endEvents.push(callback)
  }

  // 移除监听器
  offMove(callback) {
    const idx = this.moveEvents.indexOf(callback)
    if (idx >= 0) this.moveEvents.splice(idx, 1)
  }

  offEnd(callback) {
    const idx = this.endEvents.indexOf(callback)
    if (idx >= 0) this.endEvents.splice(idx, 1)
  }

  _onTouchStart(e) {
    for (const t of e.touches) {
      this.touches[t.identifier] = {
        x: t.clientX * this.dpr,
        y: t.clientY * this.dpr
      }
    }
  }

  _onTouchMove(e) {
    this.dragging = true
    for (const t of e.touches) {
      const prev = this.touches[t.identifier]
      const currX = t.clientX * this.dpr
      const currY = t.clientY * this.dpr
      if (prev) {
        this.dragDelta = {
          x: currX - prev.x,
          y: currY - prev.y
        }
      }
      this.touches[t.identifier] = { x: currX, y: currY }
    }
    
    // 触发移动事件监听器
    for (const cb of this.moveEvents) {
      cb(e)
    }
  }

  _onTouchEnd(e) {
    for (const t of e.changedTouches) {
      const pos = { x: t.clientX * this.dpr, y: t.clientY * this.dpr }
      const prev = this.touches[t.identifier]
      if (prev) {
        const dx = pos.x - prev.x
        const dy = pos.y - prev.y
        if (Math.sqrt(dx * dx + dy * dy) < 10 * this.dpr) {
          this.taps.push(pos)
        }
      }
      delete this.touches[t.identifier]
    }
    this.dragging = false
    this.dragDelta = { x: 0, y: 0 }
    
    // 触发结束事件监听器
    for (const cb of this.endEvents) {
      cb(e)
    }
  }

  update() {
    // taps 在 update 后会被场景消费，不需要手动清理
  }

  // 检查某个区域是否被点击
  isTapped(x, y, w, h) {
    for (const tap of this.taps) {
      if (tap.x >= x && tap.x <= x + w && tap.y >= y && tap.y <= y + h) {
        return true
      }
    }
    return false
  }

  // 消费点击（防止重复触发）
  consumeTap() {
    if (this.taps.length > 0) {
      return this.taps.shift()
    }
    return null
  }

  clearTaps() {
    this.taps = []
  }
}
