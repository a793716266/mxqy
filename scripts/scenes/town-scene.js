/**
 * town-scene.js - 城镇主界面（安全区）
 */

export class TownScene {
  constructor(game) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    
    // 菜单状态
    this.activeMenu = null  // null, 'party', 'inventory', 'save', 'quest'
    this.selectedHero = 0
    
    // 按钮
    this.buttons = []
    
    // 对话
    this.dialogue = null
    this.dialogueQueue = []
    
    // 臻宝角色动画
    this.heroAnimFrame = 0
    this.heroAnimTimer = 0
    this.heroFrameDuration = 0.45 // 待机动画更慢（0.15 * 3）
  }
  
  init() {
    const cx = this.width / 2
    const btnW = 200 * this.dpr
    const btnH = 50 * this.dpr
    const startY = this.height - 280 * this.dpr
    
    this.buttons = [
      {
        id: 'explore',
        text: '🗺️ 探索野外',
        x: cx - btnW / 2,
        y: startY,
        w: btnW,
        h: btnH,
        color: '#ff9f43',
        action: () => this._openExploreMenu()
      },
      {
        id: 'party',
        text: '👥 队伍管理',
        x: cx - btnW / 2,
        y: startY + 60 * this.dpr,
        w: btnW,
        h: btnH,
        color: '#54a0ff',
        action: () => { this.activeMenu = 'party' }
      },
      {
        id: 'inventory',
        text: '🎒 背包',
        x: cx - btnW / 2,
        y: startY + 120 * this.dpr,
        w: btnW,
        h: btnH,
        color: '#5f27cd',
        action: () => { this.activeMenu = 'inventory' }
      },
      {
        id: 'save',
        text: '💾 存档',
        x: cx - btnW / 2,
        y: startY + 180 * this.dpr,
        w: btnW,
        h: btnH,
        color: '#10ac84',
        action: () => this._save()
      }
    ]
    
    // 初始对话
    if (!this.game.data.get('introShown')) {
      this.dialogueQueue = [
        { name: '村长', text: '欢迎来到喵星村！' },
        { name: '村长', text: '你是被选中的人类勇士，将带领猫咪们对抗暗影势力。' },
        { name: '村长', text: '村外最近出现了很多怪物，请务必小心！' },
        { name: '村长', text: '点击"探索野外"开始冒险吧。' }
      ]
      this._showNextDialogue()
      this.game.data.set('introShown', true)
    }
  }
  
  _showNextDialogue() {
    if (this.dialogueQueue.length > 0) {
      this.dialogue = this.dialogueQueue.shift()
    } else {
      this.dialogue = null
    }
  }
  
  _openExploreMenu() {
    // 显示探索区域选择
    this.activeMenu = 'explore'
  }
  
  _save() {
    this.game.data.save()
    this.dialogueQueue = [{ name: '系统', text: '存档成功！' }]
    this._showNextDialogue()
  }
  
  update(dt) {
    this.time += dt
    
    // 更新臻宝动画
    this.heroAnimTimer += dt
    if (this.heroAnimTimer >= this.heroFrameDuration) {
      this.heroAnimTimer = 0
      this.heroAnimFrame = (this.heroAnimFrame + 1) % 2 // idle动画2帧循环
    }
    
    // 处理点击
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        // 对话框点击
        if (this.dialogue) {
          this._showNextDialogue()
          return
        }
        
        // 菜单关闭按钮
        if (this.activeMenu) {
          const closeBtn = { x: this.width - 50 * this.dpr, y: 100 * this.dpr, w: 40 * this.dpr, h: 40 * this.dpr }
          if (tap.x >= closeBtn.x && tap.x <= closeBtn.x + closeBtn.w &&
              tap.y >= closeBtn.y && tap.y <= closeBtn.y + closeBtn.h) {
            this.activeMenu = null
            return
          }
        }
        
        // 主菜单按钮
        if (!this.activeMenu && this.buttons && Array.isArray(this.buttons)) {
          for (const btn of this.buttons) {
            if (tap.x >= btn.x && tap.x <= btn.x + btn.w &&
                tap.y >= btn.y && tap.y <= btn.y + btn.h) {
              btn.action()
              return
            }
          }
        }
        
        // 探索区域选择
        if (this.activeMenu === 'explore') {
          this._handleExploreTap(tap)
        }
      }
    }
  }
  
  _handleExploreTap(tap) {
    const areas = this._getExploreAreas()
    const cx = this.width / 2
    const itemW = 300 * this.dpr
    const itemH = 60 * this.dpr
    
    areas.forEach((area, i) => {
      const y = 200 * this.dpr + i * (itemH + 20 * this.dpr)
      if (tap.x >= cx - itemW/2 && tap.x <= cx + itemW/2 &&
          tap.y >= y && tap.y <= y + itemH) {
        // 进入野外地图
        this.game.changeScene('field', { area: area.id })
      }
    })
  }
  
  _getExploreAreas() {
    const progress = this.game.data.get('progress') || 1
    const areas = [
      { id: 'grassland', name: '阳光草原', level: '1-3', unlocked: true },
      { id: 'forest', name: '迷雾森林', level: '4-6', unlocked: progress >= 2 },
      { id: 'cave', name: '暗影洞穴', level: '7-9', unlocked: progress >= 3 }
    ]
    return areas
  }
  
  render(ctx) {
    // 背景 - 城镇图片
    const bgImage = this.game.assets.get('BG_TOWN')
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, this.width, this.height)
      ctx.fillStyle = 'rgba(0,0,0,0.1)' // 降低遮罩透明度，让背景更清晰
      ctx.fillRect(0, 0, this.width, this.height)
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, this.height)
      bgGrad.addColorStop(0, '#2d3436')
      bgGrad.addColorStop(1, '#636e72')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, this.width, this.height)
    }
    
    // 渲染臻宝角色（在背景上）
    this._renderHero(ctx)
    
    // 顶部状态栏
    this._renderTopBar(ctx)
    
    // 主菜单按钮
    if (!this.activeMenu && this.buttons && Array.isArray(this.buttons)) {
      for (const btn of this.buttons) {
        this._drawButton(ctx, btn)
      }
    }
    
    // 子菜单
    if (this.activeMenu === 'party') {
      this._renderPartyMenu(ctx)
    } else if (this.activeMenu === 'explore') {
      this._renderExploreMenu(ctx)
    } else if (this.activeMenu === 'inventory') {
      this._renderInventoryMenu(ctx)
    }
    
    // 对话框
    if (this.dialogue) {
      this._renderDialogue(ctx)
    }
  }
  
  _renderHero(ctx) {
    // 臻宝位置 - 在屏幕中央偏下
    const heroX = this.width / 2
    const heroY = this.height * 0.65
    
    // 渲染臻宝idle动画
    const frameKey = `HERO_ZHENBAO_IDLE_${this.heroAnimFrame}`
    let heroImg = this.game.assets.get(frameKey)
    
    // 如果没有动画帧，使用静态立绘
    if (!heroImg) {
      heroImg = this.game.assets.get('HERO_ZHENBAO')
    }
    
    if (heroImg) {
      const dpr = this.dpr
      const targetHeight = 120 * dpr
      const scale = targetHeight / heroImg.height
      const targetWidth = heroImg.width * scale
      
      ctx.save()
      ctx.drawImage(
        heroImg,
        heroX - targetWidth / 2,
        heroY - targetHeight / 2,
        targetWidth,
        targetHeight
      )
      ctx.restore()
    }
  }
  
  _renderTopBar(ctx) {
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, this.width, 80 * this.dpr)
    
    // 金币
    ctx.font = `bold ${20 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffd700'
    ctx.textAlign = 'left'
    ctx.fillText(`💰 ${this.game.data.get('gold') || 100}`, 20 * this.dpr, 50 * this.dpr)
    
    // 队伍数量
    const party = this.game.data.get('party') || []
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`👥 ${party.length}/6`, 200 * this.dpr, 50 * this.dpr)
    
    // 位置
    ctx.textAlign = 'right'
    ctx.fillText('📍 喵星村', this.width - 20 * this.dpr, 50 * this.dpr)
  }
  
  _renderExploreMenu(ctx) {
    // 半透明背景
    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 标题
    ctx.font = `bold ${32 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('🗺️ 选择探索区域', this.width / 2, 140 * this.dpr)
    
    // 关闭按钮
    ctx.font = `${24 * this.dpr}px sans-serif`
    ctx.fillText('✕', this.width - 30 * this.dpr, 125 * this.dpr)
    
    // 区域列表
    const areas = this._getExploreAreas()
    const cx = this.width / 2
    const itemW = 300 * this.dpr
    const itemH = 60 * this.dpr
    
    areas.forEach((area, i) => {
      const y = 200 * this.dpr + i * (itemH + 20 * this.dpr)
      const unlocked = area.unlocked
      
      // 背景
      ctx.fillStyle = unlocked ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)'
      ctx.beginPath()
      this._roundRect(ctx, cx - itemW/2, y, itemW, itemH, 10 * this.dpr)
      ctx.fill()
      
      // 边框
      ctx.strokeStyle = unlocked ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 文字
      ctx.textAlign = 'left'
      ctx.font = `bold ${20 * this.dpr}px sans-serif`
      ctx.fillStyle = unlocked ? '#ffffff' : 'rgba(255,255,255,0.3)'
      ctx.fillText(area.name, cx - itemW/2 + 20 * this.dpr, y + 30 * this.dpr)
      
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = unlocked ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)'
      ctx.fillText(`等级 ${area.level}`, cx - itemW/2 + 20 * this.dpr, y + 48 * this.dpr)
      
      if (!unlocked) {
        ctx.textAlign = 'right'
        ctx.fillStyle = 'rgba(255,100,100,0.6)'
        ctx.fillText('🔒 未解锁', cx + itemW/2 - 20 * this.dpr, y + 38 * this.dpr)
      }
    })
  }
  
  _renderPartyMenu(ctx) {
    // 半透明背景
    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 标题
    ctx.font = `bold ${32 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('👥 队伍管理', this.width / 2, 140 * this.dpr)
    
    // 关闭按钮
    ctx.font = `${24 * this.dpr}px sans-serif`
    ctx.fillText('✕', this.width - 30 * this.dpr, 125 * this.dpr)
    
    // 队伍列表
    const party = this.game.data.get('party') || []
    const itemW = this.width - 40 * this.dpr
    const itemH = 80 * this.dpr
    
    party.forEach((hero, i) => {
      const y = 180 * this.dpr + i * (itemH + 10 * this.dpr)
      
      // 背景
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.beginPath()
      this._roundRect(ctx, 20 * this.dpr, y, itemW, itemH, 10 * this.dpr)
      ctx.fill()
      
      // 名称
      ctx.textAlign = 'left'
      ctx.font = `bold ${18 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`${hero.name}  Lv.${hero.level}`, 30 * this.dpr, y + 25 * this.dpr)
      
      // HP条
      const hpPercent = hero.hp / hero.maxHp
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fillRect(30 * this.dpr, y + 35 * this.dpr, 150 * this.dpr, 8 * this.dpr)
      ctx.fillStyle = hpPercent > 0.3 ? '#10ac84' : '#ee5a52'
      ctx.fillRect(30 * this.dpr, y + 35 * this.dpr, 150 * this.dpr * hpPercent, 8 * this.dpr)
      
      ctx.font = `${12 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`${hero.hp}/${hero.maxHp}`, 190 * this.dpr, y + 42 * this.dpr)
    })
  }
  
  _renderInventoryMenu(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    ctx.font = `bold ${32 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('🎒 背包', this.width / 2, 140 * this.dpr)
    ctx.fillText('✕', this.width - 30 * this.dpr, 125 * this.dpr)
    
    ctx.font = `${18 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('暂无物品', this.width / 2, this.height / 2)
  }
  
  _renderDialogue(ctx) {
    const boxH = 150 * this.dpr
    const y = this.height - boxH - 20 * this.dpr
    
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.9)'
    ctx.beginPath()
    this._roundRect(ctx, 20 * this.dpr, y, this.width - 40 * this.dpr, boxH, 10 * this.dpr)
    ctx.fill()
    
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 名字
    ctx.font = `bold ${20 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ff9f43'
    ctx.textAlign = 'left'
    ctx.fillText(this.dialogue.name, 30 * this.dpr, y + 30 * this.dpr)
    
    // 文字
    ctx.font = `${18 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(this.dialogue.text, 30 * this.dpr, y + 60 * this.dpr)
    
    // 提示
    ctx.font = `${14 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'right'
    ctx.fillText('点击继续', this.width - 30 * this.dpr, y + boxH - 15 * this.dpr)
  }
  
  _drawButton(ctx, btn) {
    const { x, y, w, h, text, color } = btn
    const r = 10 * this.dpr
    
    ctx.beginPath()
    this._roundRect(ctx, x, y, w, h, r)
    
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
  
  _roundRect(ctx, x, y, w, h, r) {
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
