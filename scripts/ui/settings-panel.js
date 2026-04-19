/**
 * settings-panel.js - 设置面板 UI 组件
 *
 * 功能：
 * - BGM 音量控制（滑块）
 * - 音效音量控制（滑块）
 * - 静音开关
 */

export class SettingsPanel {
  constructor(game) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr

    // 面板状态
    this.visible = false
    this.animProgress = 0  // 0-1 动画进度

    // 设置项
    this.settings = {
      bgmVolume: this.game.audio._bgmVolume || 0.6,
      sfxVolume: this.game.audio._sfxVolume || 0.8,
      muted: this.game.audio._muted || false
    }

    // 按钮和滑块
    this.buttons = []
    this.sliders = []
    this._initControls()
  }

  _initControls() {
    const cx = this.width / 2
    const panelW = 300 * this.dpr
    const panelH = 360 * this.dpr
    const panelX = cx - panelW / 2
    const panelY = this.height / 2 - panelH / 2

    // 静音开关
    this.buttons.push({
      id: 'mute',
      x: panelX + panelW - 60 * this.dpr,
      y: panelY + 30 * this.dpr,
      w: 50 * this.dpr,
      h: 30 * this.dpr,
      value: this.settings.muted,
      action: (btn) => {
        btn.value = !btn.value
        this.settings.muted = btn.value
        this.game.audio.setMuted(btn.value)
        this.game.audio.playSFX('ui_click')
      }
    })

    // BGM 滑块
    this.sliders.push({
      id: 'bgm',
      x: panelX + 30 * this.dpr,
      y: panelY + 100 * this.dpr,
      w: panelW - 60 * this.dpr,
      h: 8 * this.dpr,
      min: 0,
      max: 1,
      value: this.settings.bgmVolume,
      label: 'BGM 音量',
      onChange: (val) => {
        this.settings.bgmVolume = val
        this.game.audio.setBGMVolume(val)
      }
    })

    // SFX 滑块
    this.sliders.push({
      id: 'sfx',
      x: panelX + 30 * this.dpr,
      y: panelY + 180 * this.dpr,
      w: panelW - 60 * this.dpr,
      h: 8 * this.dpr,
      min: 0,
      max: 1,
      value: this.settings.sfxVolume,
      label: '音效音量',
      onChange: (val) => {
        this.settings.sfxVolume = val
        this.game.audio.setSFXVolume(val)
      }
    })

    // 关闭按钮
    this.buttons.push({
      id: 'close',
      x: panelX + panelW / 2 - 60 * this.dpr,
      y: panelY + panelH - 60 * this.dpr,
      w: 120 * this.dpr,
      h: 40 * this.dpr,
      text: '关闭',
      color: '#ff9f43',
      action: () => {
        this.hide()
        this.game.audio.playSFX('ui_cancel')
      }
    })

    // 拖动状态
    this._dragging = null
  }

  show() {
    this.visible = true
    this.animProgress = 0
    this.game.audio.playSFX('ui_popup')
  }

  hide() {
    this.visible = false
    this.animProgress = 0
  }

  handleTap(x, y) {
    if (!this.visible) return false

    // 检查滑块拖动（允许在滑块区域内开始拖动）
    for (const slider of this.sliders) {
      const thumbX = slider.x + slider.value * slider.w
      const thumbR = 12 * this.dpr
      if (x >= slider.x - thumbR && x <= slider.x + slider.w + thumbR &&
          y >= slider.y - thumbR * 2 && y <= slider.y + slider.h + thumbR * 2) {
        this._dragging = slider
        this._updateSlider(slider, x)
        this.game.audio.playSFX('ui_click')
        return true
      }
    }

    // 检查按钮点击
    for (const btn of this.buttons) {
      if (x >= btn.x && x <= btn.x + btn.w &&
          y >= btn.y && y <= btn.y + btn.h) {
        btn.action(btn)
        return true
      }
    }

    // 点击遮罩层关闭
    const cx = this.width / 2
    const panelW = 300 * this.dpr
    const panelH = 360 * this.dpr
    const panelX = cx - panelW / 2
    const panelY = this.height / 2 - panelH / 2

    if (x < panelX || x > panelX + panelW || y < panelY || y > panelY + panelH) {
      this.hide()
      return true
    }

    return true
  }

  handleDrag(x, y) {
    if (this._dragging) {
      this._updateSlider(this._dragging, x)
      return true
    }
    return false
  }

  handleDragEnd() {
    if (this._dragging) {
      this._dragging = null
    }
  }

  _updateSlider(slider, x) {
    const newValue = Math.max(slider.min, Math.min(slider.max, (x - slider.x) / slider.w))
    slider.value = newValue
    slider.onChange(newValue)
  }

  update(dt) {
    if (!this.visible) return

    // 动画
    if (this.animProgress < 1) {
      this.animProgress = Math.min(1, this.animProgress + dt * 5)
    }
  }

  render(ctx) {
    if (!this.visible && this.animProgress <= 0) return

    const alpha = this.visible ? this.animProgress : 0
    const scale = 0.8 + 0.2 * this.animProgress
    const cx = this.width / 2
    const cy = this.height / 2

    ctx.save()
    ctx.globalAlpha = alpha

    // 遮罩层
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(0, 0, this.width, this.height)

    // 面板
    const panelW = 300 * this.dpr
    const panelH = 360 * this.dpr
    const panelX = cx - panelW / 2
    const panelY = cy - panelH / 2

    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.translate(-cx, -cy)

    // 面板背景
    ctx.fillStyle = '#1a1a2e'
    ctx.strokeStyle = '#ff9f43'
    ctx.lineWidth = 3 * this.dpr

    const r = 15 * this.dpr
    this._roundRect(ctx, panelX, panelY, panelW, panelH, r)
    ctx.fill()
    ctx.stroke()

    // 标题
    ctx.font = `bold ${24 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('⚙️ 设置', cx, panelY + 45 * this.dpr)

    // 静音开关
    const muteBtn = this.buttons.find(b => b.id === 'mute')
    if (muteBtn) {
      ctx.font = `${16 * this.dpr}px sans-serif`
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.fillText('静音', muteBtn.x - 60 * this.dpr, muteBtn.y + 22 * this.dpr)

      // 开关背景
      const swW = 50 * this.dpr
      const swH = 30 * this.dpr
      ctx.fillStyle = muteBtn.value ? '#4CAF50' : '#555555'
      this._roundRect(ctx, muteBtn.x, muteBtn.y, swW, swH, swH / 2)
      ctx.fill()

      // 开关滑块
      const knobX = muteBtn.value ? muteBtn.x + swW - swH / 2 : muteBtn.x + swH / 2
      ctx.beginPath()
      ctx.arc(knobX, muteBtn.y + swH / 2, swH / 2 - 3 * this.dpr, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }

    // 滑块
    for (const slider of this.sliders) {
      // 标签
      ctx.font = `${16 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(slider.label, slider.x, slider.y - 15 * this.dpr)

      // 滑块背景
      ctx.fillStyle = '#333333'
      this._roundRect(ctx, slider.x, slider.y, slider.w, slider.h, slider.h / 2)
      ctx.fill()

      // 滑块进度
      const fillW = slider.value * slider.w
      if (fillW > 0) {
        ctx.fillStyle = '#ff9f43'
        this._roundRect(ctx, slider.x, slider.y, fillW, slider.h, slider.h / 2)
        ctx.fill()
      }

      // 滑块手柄
      const thumbX = slider.x + fillW
      ctx.beginPath()
      ctx.arc(thumbX, slider.y + slider.h / 2, 12 * this.dpr, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#ff9f43'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()

      // 音量值
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = '#aaaaaa'
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.round(slider.value * 100)}%`, slider.x + slider.w, slider.y - 15 * this.dpr)
    }

    // 关闭按钮
    const closeBtn = this.buttons.find(b => b.id === 'close')
    if (closeBtn) {
      const btnGrad = ctx.createLinearGradient(closeBtn.x, closeBtn.y, closeBtn.x, closeBtn.y + closeBtn.h)
      btnGrad.addColorStop(0, closeBtn.color)
      btnGrad.addColorStop(1, this._darkenColor(closeBtn.color, 0.3))
      ctx.fillStyle = btnGrad
      this._roundRect(ctx, closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h, 10 * this.dpr)
      ctx.fill()

      ctx.font = `bold ${18 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.fillText(closeBtn.text, closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2 + 5 * this.dpr)
    }

    ctx.restore()
    ctx.restore()
  }

  _roundRect(ctx, x, y, w, h, r) {
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
