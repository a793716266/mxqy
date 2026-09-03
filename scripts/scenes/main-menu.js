/**
 * main-menu.js - 主菜单场景
 */

export class MainMenuScene {
  constructor(game) {
    this.game = game
    this.game.audio.playBGM('bgm_menu')  // 主菜单BGM
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    this.particles = []
    this.titleY = 0
    this.buttons = []
    this.subtitleOpacity = 0
    // 确认弹窗（null = 未打开）。清档不可逆，必须拦一道 —— 见 _showNewGameConfirm
    this._confirm = null

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

    // 设置按钮（右上角）
    this.settingsBtn = {
      x: this.width - 70 * this.dpr,
      y: 20 * this.dpr,
      w: 50 * this.dpr,
      h: 50 * this.dpr
    }
  }

  init() {
    const cx = this.width / 2
    const cy = this.height / 2
    const btnW = 240 * this.dpr
    const btnH = 60 * this.dpr

    // 缓存是否有存档（控制「继续游戏」按钮可用状态）
    this._hasSaveCache = this.game.data.hasSave()

    // 进入场景时清空残留的确认弹窗状态（场景实例可能被复用）
    this._confirm = null

    // ★ 诊断日志：方便真机排查「继续游戏」是否读到了正确位置
    //   （重新载入小程序后，currentLocation.scene 应为 town/field 等真实位置，不能是 main-menu）
    const _loc = this.game.data.get('progression.currentLocation')
    console.log('[MainMenu] 启动诊断 → hasSave:', this._hasSaveCache,
      '| currentLocation:', JSON.stringify(_loc),
      '| gold:', this.game.data.get('player.gold'))
    if (this._hasSaveCache && _loc && _loc.scene === 'main-menu') {
      console.warn('[MainMenu] ⚠️ currentLocation 仍是 main-menu，继续游戏会死循环，已兜底 town')
    }

    this.buttons = [
      {
        text: this._hasSaveCache ? '🎮 开始新游戏' : '🎮 开始冒险',
        x: cx - btnW / 2,
        y: cy + 40 * this.dpr,
        w: btnW,
        h: btnH,
        color: '#ff9f43',
        action: (tap) => {
          // 已有存档时「开始新游戏」会清档（不可逆），先弹确认框拦截误触
          if (this._hasSaveCache) {
            this._showNewGameConfirm(tap)
            return
          }
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
        // ★ 无存档时灰显禁用（hasSave 在 init 时确定）
        disabled: !this._hasSaveCache,
        action: () => {
          if (!this.game.data.hasSave()) {
            console.log('[MainMenu] 没有存档，继续游戏不可用')
            return
          }
          // 读档拿到精确位置
          this.game.data.load()
          const loc = this.game.data.get('progression.currentLocation') || { scene: 'town' }
          const payload = {}
          if (loc.nodeId) payload.nodeId = loc.nodeId
          if (loc.area) payload.area = loc.area
          if (loc.controlledHeroId) payload.controlledHeroId = loc.controlledHeroId
          console.log('[MainMenu] 继续游戏 → 恢复位置:', loc.scene, payload)
          // 兜底：极端情况下 loc.scene 仍是 main-menu（旧档/异常），避免死循环回主菜单
          const targetScene = (loc.scene && loc.scene !== 'main-menu') ? loc.scene : 'town'
          this.game.changeScene(targetScene, payload)
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
      },
      // ⚔️ 战斗测试（BUFF测试）- 仅开发测试用
      {
        text: '⚔️ 战斗测试 (BUFF测试)',
        x: cx - btnW / 2,
        y: cy + 280 * this.dpr,
        w: btnW,
        h: btnH,
        color: '#ee5a24',
        action: () => {
          console.log('[MainMenu] 进入战斗测试模式（李小宝1000级 vs BOSS艾米）')
          this.game.changeScene('battle', {
            _testMode: true,
            enemies: [
              { id: 'lost_healer_cat', level: 10 }  // BOSS艾米
            ],
            party: ['lixiaobao', 'zhenbao']
          })
        }
      },
      // 🎬 观看开场动画（引擎内过场演出，复用现有精灵）
      {
        text: '🎬 观看开场',
        x: cx - 110 * this.dpr,
        y: this.height - 96 * this.dpr,
        w: 220 * this.dpr,
        h: 48 * this.dpr,
        color: '#10ac84',
        action: () => {
          console.log('[MainMenu] 播放开场过场 ch1_intro')
          this.game.playCutscene('ch1_intro', () => this.game.changeScene('main-menu'))
        }
      }
    ]
  }

  update(dt) {
    this.time += dt

    // 更新粒子
    // 更新粒子（安全检查）
    if (this.particles && Array.isArray(this.particles)) {
      for (const p of this.particles) {
        p.y -= p.speed * dt
        p.opacity = 0.3 + Math.sin(this.time * 2 + p.x) * 0.3
        if (p.y < -10) {
          p.y = this.height + 10
          p.x = Math.random() * this.width
        }
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

        // 检查设置按钮
        if (this.settingsBtn &&
            tx >= this.settingsBtn.x && tx <= this.settingsBtn.x + this.settingsBtn.w &&
            ty >= this.settingsBtn.y && ty <= this.settingsBtn.y + this.settingsBtn.h) {
          this.game.audio.playSFX('ui_confirm')
          this.game.settings.show()
          return
        }

        // ★ 确认清档弹窗打开时，只处理弹窗内按钮，屏蔽主菜单按钮
        if (this._confirm) {
          const o = this._confirm
          // 防误触：吞掉"原按钮位置"附近的二次点按（同根手指补点），避免秒确认
          if (o.openTap) {
            const dx = tx - o.openTap.x
            const dy = ty - o.openTap.y
            if (dx * dx + dy * dy <= o.ignoreRadius * o.ignoreRadius) return
          }
          const inBtn = (b) => tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h
          if (inBtn(o.btnCancel)) {
            this.game.audio.playSFX('ui_confirm')
            this._confirm = null
            return
          }
          if (inBtn(o.btnOk)) {
            this.game.audio.playSFX('ui_confirm')
            this.game.data.clear()
            this.game.data.set('currentChapter', 1)
            this._confirm = null
            this.game.changeScene('town')
            return
          }
          // 点弹窗外不自动关闭 → 强制二选一，避免误触关掉又顺手重新开始
          return
        }

        if (this.buttons && Array.isArray(this.buttons)) {
          for (const btn of this.buttons) {
            if (tx >= btn.x && tx <= btn.x + btn.w &&
                ty >= btn.y && ty <= btn.y + btn.h) {
              this.game.audio.playSFX('ui_confirm')
              btn.action(tap)
              break
            }
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
    // 渲染粒子（安全检查）
    if (this.particles && Array.isArray(this.particles)) {
      for (const p of this.particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 200, ${p.opacity})`
        ctx.fill()
      }
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

    // 按钮（安全检查）
    if (this.buttons && Array.isArray(this.buttons)) {
      for (const btn of this.buttons) {
        this._drawButton(ctx, btn)
      }
    }

    // 版本信息
    ctx.font = `${12 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'center'
    ctx.fillText('v0.1 Alpha', w / 2, h - 20 * this.dpr)

    // 绘制设置按钮
    this._drawSettingsButton(ctx)

    // 确认清档弹窗（最高层，盖在所有 UI 之上）
    if (this._confirm) this._drawConfirm(ctx)
  }

  _drawSettingsButton(ctx) {
    const btn = this.settingsBtn
    if (!btn) return

    const r = 12 * this.dpr

    // 按钮背景
    ctx.beginPath()
    ctx.arc(btn.x + btn.w / 2, btn.y + btn.h / 2, btn.w / 2, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 2 * this.dpr
    ctx.stroke()

    // 齿轮图标 (⚙️)
    ctx.font = `${28 * this.dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('⚙️', btn.x + btn.w / 2, btn.y + btn.h / 2)
  }

  _drawButton(ctx, btn) {
    const { x, y, w, h, text, color } = btn
    const r = 12 * this.dpr
    const disabled = !!btn.disabled

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

    if (disabled) {
      // 灰显禁用态
      ctx.fillStyle = 'rgba(120,120,130,0.5)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.font = `bold ${24 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, x + w / 2, y + h / 2)
      return
    }

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

  // ============================================================
  // 确认清档弹窗（防误触）
  // ============================================================

  /**
   * 打开「确认清除存档」弹窗。
   * 关键防误触设计：
   *  - 记录打开弹窗那次点按的屏幕坐标 (openTap)，在 update() 里把"同位置附近"的
   *    二次点按直接吞掉，避免玩家快速连点「开始新游戏」时，第二下正好落在确认按钮上秒清档。
   *  - 确认/取消按钮放在弹窗底部，与「开始新游戏」按钮在屏幕上的位置明显错开，
   *    从空间上再隔一道，双保险。
   *  - 弹窗外点按不自动关闭，强制二选一。
   *
   * @param {{x:number,y:number}|null} tap 打开弹窗的那次点按位置
   */
  _showNewGameConfirm(tap) {
    const summary = this.game.data.getSaveSummary(true)
    const cx = this.width / 2
    const cy = this.height / 2
    const panelW = 320 * this.dpr
    const panelH = 300 * this.dpr
    const px = cx - panelW / 2
    const py = cy - panelH / 2
    const btnW = 130 * this.dpr
    const btnH = 52 * this.dpr
    const gap = 20 * this.dpr
    const btnY = py + panelH - btnH - 24 * this.dpr
    this._confirm = {
      // 打开弹窗的那次点按位置，用于屏蔽"同位置二次点按"防误触
      openTap: tap ? { x: tap.x, y: tap.y } : null,
      ignoreRadius: 80 * this.dpr,
      summary,
      panel: { x: px, y: py, w: panelW, h: panelH },
      // 取消（安全）放在左，确认清除（危险）放在右，且都远离原「开始新游戏」按钮
      btnCancel: {
        text: '取消',
        x: cx - btnW - gap / 2,
        y: btnY,
        w: btnW,
        h: btnH,
        color: '#54a0ff',
      },
      btnOk: {
        text: '确认清除',
        x: cx + gap / 2,
        y: btnY,
        w: btnW,
        h: btnH,
        color: '#ee5253',
      },
    }
  }

  _drawConfirm(ctx) {
    const o = this._confirm
    const { x, y, w, h } = o.panel
    const cx = x + w / 2

    // 半透明遮罩（盖住菜单，突出弹窗）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'
    ctx.fillRect(0, 0, this.width, this.height)

    // 面板背景
    const r = 16 * this.dpr
    this._roundRectPath(ctx, x, y, w, h, r)
    ctx.fillStyle = '#2b2b46'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
    ctx.lineWidth = 2 * this.dpr
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 标题（警示红）
    ctx.font = `bold ${22 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ff6b6b'
    ctx.fillText('⚠️ 将清除当前存档', cx, y + 34 * this.dpr)

    // 副警告
    ctx.font = `${15 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText('重新开始会清空全部进度，且无法恢复', cx, y + 64 * this.dpr)

    // 存档摘要 —— 让玩家看清自己要丢掉什么
    const s = o.summary
    const lines = [
      `📍 进度：第 ${s.chapter} 章 / 等级 ${s.level}`,
      `💰 金币：${s.gold}`,
      `👥 队伍：${s.partyCount} 名伙伴`,
      `🐱 图鉴：${s.catCount} 只猫咪`,
    ]
    ctx.font = `${15 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    let ly = y + 100 * this.dpr
    for (const l of lines) {
      ctx.fillText(l, cx, ly)
      ly += 26 * this.dpr
    }

    // 两个按钮（复用主菜单按钮样式）
    this._drawButton(ctx, o.btnCancel)
    this._drawButton(ctx, o.btnOk)
  }

  // 圆角矩形路径（弹窗面板用；_drawButton 已有自己的 roundRect 逻辑，这里独立一份避免耦合）
  _roundRectPath(ctx, x, y, w, h, r) {
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
}
