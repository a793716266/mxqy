/**
 * field-scene.js - 野外探索场景（可移动大地图）
 */

import { ENEMIES_CH1 } from '../data/enemies.js'
import { HEROES } from '../data/heroes.js'

export class FieldScene {
  constructor(game, data) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    
    // 区域信息
    this.areaId = data?.area || 'grassland'
    this.areaInfo = this._getAreaInfo()
    
    // 玩家位置
    this.playerX = this.width / 2
    this.playerY = this.height / 2
    this.playerSpeed = 150 * this.dpr
    this.playerDirection = 'down'
    
    // 动画系统
    this.animFrame = 0
    this.animTimer = 0
    this.isMoving = false
    this.frameDuration = 0.15 // 每帧150ms
    
    // 摇杆控制
    this.joystick = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 }
    
    // 队伍
    this.party = this._initParty()
    
    // 遭遇计时
    this.steps = 0
    this.encounterThreshold = 15 + Math.random() * 10
    
    // UI
    this.showMinimap = true
    this.showMenu = false
    
    // 地图元素（宝箱、资源点）
    this.mapObjects = this._generateMapObjects()
  }
  
  _getAreaInfo() {
    const areas = {
      grassland: {
        name: '阳光草原',
        bgKey: 'BG_GRASSLAND',
        enemies: ['slime', 'goblin', 'wild_cat'],
        bossEnemy: null,
        color: '#7bed9f'
      },
      forest: {
        name: '迷雾森林',
        bgKey: 'BG_FOREST',
        enemies: ['forest_sprite', 'wolf', 'goblin'],
        bossEnemy: 'forest_guardian',
        color: '#2ed573'
      },
      cave: {
        name: '暗影洞穴',
        bgKey: 'BG_CAVE',
        enemies: ['shadow_bat', 'cave_spider', 'dark_spirit'],
        bossEnemy: 'shadow_boss',
        color: '#636e72'
      }
    }
    return areas[this.areaId] || areas.grassland
  }
  
  _initParty() {
    const savedParty = this.game.data.get('party')
    if (savedParty && savedParty.length > 0) {
      return savedParty
    }
    // 默认队伍
    return HEROES.slice(0, 2).map(h => ({
      ...h,
      hp: h.maxHp,
      mp: h.maxMp,
      buffs: []
    }))
  }
  
  _generateMapObjects() {
    const objects = []
    // 随机生成宝箱和资源点
    for (let i = 0; i < 5; i++) {
      objects.push({
        type: 'chest',
        x: Math.random() * (this.width - 100) + 50,
        y: Math.random() * (this.height - 200) + 50,
        collected: false
      })
    }
    return objects
  }
  
  init() {
    // 初始化摇杆区域
    this.joystickArea = {
      x: 50 * this.dpr,
      y: this.height - 200 * this.dpr,
      r: 80 * this.dpr
    }
    
    // 注册触摸事件监听
    this._onTouchMove = (e) => {
      if (this.joystick.active) {
        for (const t of e.touches) {
          this.joystick.currentX = t.clientX * this.dpr
          this.joystick.currentY = t.clientY * this.dpr
        }
      }
    }
    
    this._onTouchEnd = (e) => {
      this.joystick.active = false
    }
    
    this.game.input.onMove(this._onTouchMove)
    this.game.input.onEnd(this._onTouchEnd)
  }
  
  destroy() {
    // 清理事件监听
    this.game.input.offMove(this._onTouchMove)
    this.game.input.offEnd(this._onTouchEnd)
  }
  
  update(dt) {
    this.time += dt
    
    // 摇杆控制移动
    this.isMoving = false
    
    if (this.joystick.active) {
      const dx = this.joystick.currentX - this.joystick.startX
      const dy = this.joystick.currentY - this.joystick.startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist > 10 * this.dpr) {
        this.isMoving = true
        const moveX = (dx / dist) * this.playerSpeed * dt
        const moveY = (dy / dist) * this.playerSpeed * dt
        
        this.playerX += moveX
        this.playerY += moveY
        
        // 边界限制
        this.playerX = Math.max(30 * this.dpr, Math.min(this.width - 30 * this.dpr, this.playerX))
        this.playerY = Math.max(80 * this.dpr, Math.min(this.height - 100 * this.dpr, this.playerY))
        
        // 更新方向
        if (Math.abs(dx) > Math.abs(dy)) {
          this.playerDirection = dx > 0 ? 'right' : 'left'
        } else {
          this.playerDirection = dy > 0 ? 'down' : 'up'
        }
        
        // 步数累计
        this.steps += dist * dt * 0.01
        
        // 检查遭遇
        if (this.steps >= this.encounterThreshold) {
          this._triggerEncounter()
        }
      }
    }
    
    // 动画帧更新
    this.animTimer += dt
    const currentFrameDuration = this.isMoving ? this.frameDuration : this.frameDuration * 3 // 待机动画更慢
    
    if (this.animTimer >= currentFrameDuration) {
      this.animTimer = 0
      const heroId = this.party[0]?.id || 'zhenbao'
      
      if (this.isMoving) {
        // 走路动画：zhenbao 8帧，lixiaobao 4帧
        const walkFrames = heroId === 'zhenbao' ? 8 : 4
        this.animFrame = (this.animFrame + 1) % walkFrames
      } else {
        // 待机动画：2帧循环
        this.animFrame = (this.animFrame + 1) % 2
      }
    }
    
    // 点击处理
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        this._handleTap(tap)
      }
    }
  }
  
  _handleTap(tap) {
    // 返回按钮
    const backBtn = { x: this.width - 50 * this.dpr, y: 20 * this.dpr, w: 40 * this.dpr, h: 40 * this.dpr }
    if (tap.x >= backBtn.x && tap.x <= backBtn.x + backBtn.w &&
        tap.y >= backBtn.y && tap.y <= backBtn.y + backBtn.h) {
      this.game.changeScene('town')
      return
    }
    
    // 摇杆区域
    const ja = this.joystickArea
    const dist = Math.sqrt((tap.x - ja.x) ** 2 + (tap.y - ja.y) ** 2)
    if (dist <= ja.r * 1.5) {
      // 开始摇杆控制
      this.joystick.active = true
      this.joystick.startX = tap.x
      this.joystick.startY = tap.y
      this.joystick.currentX = tap.x
      this.joystick.currentY = tap.y
      return
    }
    
    // 检查地图对象
    for (const obj of this.mapObjects) {
      if (obj.collected) continue
      const dist = Math.sqrt((tap.x - obj.x) ** 2 + (tap.y - obj.y) ** 2)
      if (dist < 50 * this.dpr) {
        this._collectObject(obj)
        return
      }
    }
  }
  
  _collectObject(obj) {
    obj.collected = true
    const gold = 10 + Math.floor(Math.random() * 20)
    this.game.data.set('gold', (this.game.data.get('gold') || 100) + gold)
    console.log(`[Field] 收集宝箱获得 ${gold} 金币`)
  }
  
  _triggerEncounter() {
    this.steps = 0
    this.encounterThreshold = 15 + Math.random() * 10
    
    // 随机选择敌人
    const enemyId = this.areaInfo.enemies[Math.floor(Math.random() * this.areaInfo.enemies.length)]
    const enemy = ENEMIES_CH1[enemyId]
    
    if (enemy) {
      // 保存队伍状态
      this.game.data.set('party', this.party)
      // 进入战斗
      this.game.changeScene('battle', {
        party: this.party,
        enemy: enemy,
        bg: this.areaInfo.bgKey,
        nodeId: this.areaId
      })
    }
  }
  
  render(ctx) {
    // 背景
    const bgImage = this.game.assets.get(this.areaInfo.bgKey)
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, this.width, this.height)
    } else {
      ctx.fillStyle = this.areaInfo.color
      ctx.fillRect(0, 0, this.width, this.height)
    }
    
    // 地图对象（宝箱等）
    this._renderMapObjects(ctx)
    
    // 玩家角色
    this._renderPlayer(ctx)
    
    // 顶部UI
    this._renderTopUI(ctx)
    
    // 摇杆
    this._renderJoystick(ctx)
    
    // 返回按钮
    ctx.font = `${24 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.fillText('✕', this.width - 20 * this.dpr, 50 * this.dpr)
    
    // 小地图
    if (this.showMinimap) {
      this._renderMinimap(ctx)
    }
  }
  
  _renderPlayer(ctx) {
    const size = 60 * this.dpr
    
    // 获取当前动画帧图片
    let frameImg = null
    const heroId = this.party[0]?.id || 'zhenbao'
    
    if (this.isMoving) {
      // 走路动画帧
      const walkKey = `HERO_${heroId.toUpperCase()}_WALK_${this.animFrame}`
      frameImg = this.game.assets.get(walkKey)
    } else {
      // 待机动画帧
      const idleKey = `HERO_${heroId.toUpperCase()}_IDLE_${this.animFrame}`
      frameImg = this.game.assets.get(idleKey)
    }
    
    // 如果动画帧不存在，尝试使用静态立绘
    if (!frameImg) {
      frameImg = this.game.assets.get(`HERO_${heroId.toUpperCase()}`)
    }
    
    if (frameImg) {
      // 绘制角色图片
      ctx.drawImage(
        frameImg,
        this.playerX - size / 2,
        this.playerY - size / 2,
        size,
        size
      )
      
      // 底部阴影
      ctx.beginPath()
      ctx.ellipse(this.playerX, this.playerY + size / 2 + 5 * this.dpr, size / 2.5, 8 * this.dpr, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fill()
      
      // 移动时添加轻微的方向指示器
      if (this.isMoving) {
        ctx.beginPath()
        const arrowDist = size / 2 + 10 * this.dpr
        let arrowX = this.playerX
        let arrowY = this.playerY
        
        switch (this.playerDirection) {
          case 'up': arrowY -= arrowDist; break
          case 'down': arrowY += arrowDist; break
          case 'left': arrowX -= arrowDist; break
          case 'right': arrowX += arrowDist; break
        }
        
        ctx.arc(arrowX, arrowY, 4 * this.dpr, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fill()
      }
    } else {
      // 备用：圆圈 + emoji
      ctx.beginPath()
      ctx.arc(this.playerX, this.playerY, size / 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.stroke()
      
      ctx.font = `${30 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🧑', this.playerX, this.playerY)
    }
  }
  
  _renderMapObjects(ctx) {
    for (const obj of this.mapObjects) {
      if (obj.collected) continue
      
      // 宝箱图标
      ctx.font = `${24 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('📦', obj.x, obj.y)
    }
  }
  
  _renderTopUI(ctx) {
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, this.width, 70 * this.dpr)
    
    // 区域名
    ctx.font = `bold ${22 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText(`📍 ${this.areaInfo.name}`, 20 * this.dpr, 45 * this.dpr)
    
    // 队伍状态（简化）
    ctx.font = `${16 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(`👥 ${this.party.length}`, 20 * this.dpr, 65 * this.dpr)
  }
  
  _renderJoystick(ctx) {
    const ja = this.joystickArea
    
    // 摇杆底座
    ctx.beginPath()
    ctx.arc(ja.x, ja.y, ja.r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 摇杆手柄
    if (this.joystick.active) {
      const dx = this.joystick.currentX - this.joystick.startX
      const dy = this.joystick.currentY - this.joystick.startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const maxDist = ja.r * 0.7
      
      let handleX = ja.x + (dx / dist) * Math.min(dist, maxDist)
      let handleY = ja.y + (dy / dist) * Math.min(dist, maxDist)
      
      ctx.beginPath()
      ctx.arc(handleX, handleY, 25 * this.dpr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(ja.x, ja.y, 25 * this.dpr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fill()
    }
    
    // 提示文字
    ctx.font = `${12 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('移动', ja.x, ja.y + ja.r + 20 * this.dpr)
  }
  
  _renderMinimap(ctx) {
    const mapSize = 80 * this.dpr
    const mapX = this.width - mapSize - 15 * this.dpr
    const mapY = 85 * this.dpr
    
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.beginPath()
    this._roundRect(ctx, mapX, mapY, mapSize, mapSize, 5 * this.dpr)
    ctx.fill()
    
    // 玩家位置
    const px = mapX + (this.playerX / this.width) * mapSize
    const py = mapY + (this.playerY / this.height) * mapSize
    
    ctx.beginPath()
    ctx.arc(px, py, 3 * this.dpr, 0, Math.PI * 2)
    ctx.fillStyle = '#ff9f43'
    ctx.fill()
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
}
