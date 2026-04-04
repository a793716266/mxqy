/**
 * character-info-panel.js - 角色信息面板UI组件
 */

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
    
    // 经验条进度
    const expProgress = char.getExpProgress()
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
    const hpProgress = char.hp / char.maxHp
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
   * 渲染详细面板
   */
  renderDetailPanel() {
    if (!this.visible) return null
    
    const char = this.character
    if (!char) return null
    
    const screenWidth = this.game.width
    const screenHeight = this.game.height
    
    // 面板尺寸
    const panelWidth = 280 * this.dpr
    const panelHeight = 400 * this.dpr
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
    
    const expProgress = char.getExpProgress()
    this.ctx.fillStyle = '#4caf50'
    this.ctx.fillRect(leftMargin, offsetY, expBarWidth * expProgress, expBarHeight)
    offsetY += lineHeight
    
    // 分隔线
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    this.ctx.beginPath()
    this.ctx.moveTo(leftMargin, offsetY)
    this.ctx.lineTo(panelX + panelWidth - 20 * this.dpr, offsetY)
    this.ctx.stroke()
    offsetY += 15 * this.dpr
    
    // 属性列表
    this.ctx.font = `bold ${16 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillText('属性', leftMargin, offsetY)
    offsetY += lineHeight
    
    const stats = [
      { name: '生命值', value: char.maxHp, icon: '❤️', color: '#ff5555' },
      { name: '魔法值', value: char.maxMp, icon: '💙', color: '#5555ff' },
      { name: '攻击力', value: char.atk, icon: '⚔️', color: '#ff8800' },
      { name: '防御力', value: char.def, icon: '🛡️', color: '#00aaff' },
      { name: '速度', value: char.spd, icon: '⚡', color: '#ffdd00' }
    ]
    
    this.ctx.font = `${14 * this.dpr}px sans-serif`
    for (const stat of stats) {
      this.ctx.fillStyle = '#a0a0a0'
      this.ctx.fillText(`${stat.icon} ${stat.name}`, leftMargin, offsetY)
      this.ctx.fillStyle = stat.color
      this.ctx.textAlign = 'right'
      this.ctx.fillText(stat.value.toString(), panelX + panelWidth - 20 * this.dpr, offsetY)
      this.ctx.textAlign = 'left'
      offsetY += lineHeight * 0.9
    }
    
    offsetY += 10 * this.dpr
    
    // 分隔线
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    this.ctx.beginPath()
    this.ctx.moveTo(leftMargin, offsetY)
    this.ctx.lineTo(panelX + panelWidth - 20 * this.dpr, offsetY)
    this.ctx.stroke()
    offsetY += 15 * this.dpr
    
    // 当前状态
    this.ctx.font = `bold ${16 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillText('状态', leftMargin, offsetY)
    offsetY += lineHeight
    
    this.ctx.font = `${14 * this.dpr}px sans-serif`
    this.ctx.fillStyle = '#ff5555'
    this.ctx.fillText(`❤️ HP: ${char.hp} / ${char.maxHp}`, leftMargin, offsetY)
    offsetY += lineHeight * 0.9
    
    this.ctx.fillStyle = '#5555ff'
    this.ctx.fillText(`💙 MP: ${char.mp} / ${char.maxMp}`, leftMargin, offsetY)
    
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
      }
    }
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
   * 绘制圆角矩形
   */
  _roundRect(x, y, w, h, r) {
    this.ctx.beginPath()
    this.ctx.moveTo(x + r, y)
    this.ctx.lineTo(x + w - r, y)
    this.ctx.arcTo(x + w, y, x + w, y + r, r)
    this.ctx.lineTo(x + w, y + h - r)
    this.ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    this.ctx.lineTo(x + r, y + h)
    this.ctx.arcTo(x, y + h, x, y + h - r, r)
    this.ctx.lineTo(x, y + r)
    this.ctx.arcTo(x, y, x + r, y, r)
    this.ctx.closePath()
  }
}
