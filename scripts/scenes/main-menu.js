/**
 * main-menu.js - 主菜单场景
 */

export class MainMenuScene {
  constructor(game) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    this.particles = []
    this.titleY = 0
    this.buttons = []
    this.subtitleOpacity = 0

    // 预生成星星粒子
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 3 + 1,
        speed: Math.random() * 20 + 10,
        opacity: Math.random()
      })
    }
  }

  init() {
    const cx = this.width / 2
    const cy = this.height / 2
    const btnW = 240 * this.dpr
    const btnH = 60 * this.dpr

    this.buttons = [
      {
        text: '🎮 开始冒险',
        x: cx - btnW / 2,
        y: cy + 40 * this.dpr,
        w: btnW,
        h: btnH,
        color: '#ff9f43',
        action: () => {
          this.game.data.set('currentChapter', 1)
          this.game.changeScene('town')
        }
      },
      {
        text: '📖 继续游戏',
        x: cx - btnW / 2,
        y: cy + 120 * this.dpr,
        w: btnW,
        h: btnH,
        color: '#54a0ff',
        action: () => {
          if (this.game.data.hasSave()) {
            const saveData = this.game.data.load()
            this.game.changeScene('map', saveData)
          } else {
            console.log('[MainMenu] 没有存档')
          }
        }
      },
      {
        text: '🐱 猫咪图鉴',
        x: cx - btnW / 2,
        y: cy + 200 * this.dpr,
        w: btnW,
        h: btnH,
        color: '#5f27cd',
        action: () => {
          this.game.changeScene('collection')
        }
      }
    ]
  }

  update(dt) {
    this.time += dt

    // 更新粒子
    for (const p of this.particles) {
      p.y -= p.speed * dt
      p.opacity = 0.3 + Math.sin(this.time * 2 + p.x) * 0.3
      if (p.y < -10) {
        p.y = this.height + 10
        p.x = Math.random() * this.width
      }
    }

    // 副标题淡入
    if (this.subtitleOpacity < 1) {
      this.subtitleOpacity = Math.min(1, this.subtitleOpacity + dt * 0.5)
    }

    // 按钮交互
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        const tx = tap.x
        const ty = tap.y
        for (const btn of this.buttons) {
          if (tx >= btn.x && tx <= btn.x + btn.w &&
              ty >= btn.y && ty <= btn.y + btn.h) {
            btn.action()
            break
          }
        }
      }
    }
  }

  render(ctx) {
    const w = this.width
    const h = this.height

    // 背景渐变
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
    bgGrad.addColorStop(0, '#0c0c1d')
    bgGrad.addColorStop(0.5, '#1a1a3e')
    bgGrad.addColorStop(1, '#2d1b69')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, h)

    // 星星粒子
    for (const p of this.particles) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 255, 200, ${p.opacity})`
      ctx.fill()
    }

    // 标题
    const titleSize = 52 * this.dpr
    ctx.font = `bold ${titleSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 标题发光效果
    const glowY = h * 0.25 + Math.sin(this.time * 1.5) * 10 * this.dpr
    ctx.shadowColor = '#ff9f43'
    ctx.shadowBlur = 20 * this.dpr
    ctx.fillStyle = '#ffffff'
    ctx.fillText('🐱 喵星奇缘', w / 2, glowY)
    ctx.shadowBlur = 0

    // 副标题
    const subSize = 20 * this.dpr
    ctx.font = `${subSize}px sans-serif`
    ctx.fillStyle = `rgba(200, 200, 220, ${this.subtitleOpacity})`
    ctx.fillText('探索猫咪的奇幻世界', w / 2, glowY + 50 * this.dpr)

    // 按钮
    for (const btn of this.buttons) {
      this._drawButton(ctx, btn)
    }

    // 版本信息
    ctx.font = `${12 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'center'
    ctx.fillText('v0.1 Alpha', w / 2, h - 20 * this.dpr)
  }

  _drawButton(ctx, btn) {
    const { x, y, w, h, text, color } = btn
    const r = 12 * this.dpr

    // 按钮背景
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

    // 渐变填充
    const grad = ctx.createLinearGradient(x, y, x, y + h)
    grad.addColorStop(0, color)
    grad.addColorStop(1, this._darkenColor(color, 0.3))
    ctx.fillStyle = grad
    ctx.fill()

    // 边框
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 2
    ctx.stroke()

    // 文字
    ctx.font = `bold ${24 * this.dpr}px sans-serif`
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
