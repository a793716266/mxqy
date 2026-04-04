/**
 * field-movement.js - 野外移动系统（从field-scene提取）
 * 这套移动逻辑已经在阳光草原验证过，非常好用
 */

import { charStateManager } from '../data/character-state.js'

/**
 * 野外移动控制器
 * 完整的移动、动画、相机跟随、队友跟随系统
 */
export class FieldMovement {
  constructor(game, options = {}) {
    this.game = game
    this.dpr = game.dpr
    this.width = game.width
    this.height = game.height
    
    // 地图尺寸
    this.mapWidth = options.mapWidth || 2000 * this.dpr
    this.mapHeight = options.mapHeight || 1500 * this.dpr
    
    // 相机位置
    this.cameraX = 0
    this.cameraY = 0
    
    // 玩家位置（相对于地图）
    this.playerX = options.playerX || this.mapWidth / 2
    this.playerY = options.playerY || this.mapHeight / 2
    this.playerSpeed = options.playerSpeed || 150 * this.dpr
    this.playerDirection = options.playerDirection || 'down'
    this.facingLeft = options.facingLeft !== undefined ? options.facingLeft : false
    
    // 动画系统
    this.animFrame = 0
    this.animTimer = 0
    this.isMoving = false
    this.frameDuration = 0.15
    
    // 摇杆控制
    this.joystick = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 }
    this.joystickArea = null
    
    // 队友跟随系统
    this.followers = []
    this.followerDistance = 35 * this.dpr
    this.playerHistory = []
    this.historyMaxLength = 90
    this.historyInterval = 3
    this.historyFrameCount = 0
    
    // 主角（将在init()中初始化）
    this.mainCharacter = null
    
    // 触摸事件回调
    this._onTouchMove = null
    this._onTouchEnd = null
  }
  
  /**
   * 初始化移动系统
   */
  init() {
    // 初始化主角（必须在charStateManager.init()之后）
    const allChars = charStateManager.getAllCharacters()
    this.mainCharacter = allChars.length > 0 ? allChars[0] : null
    
    // 初始化相机位置
    this._updateCamera()
    
    // 初始化摇杆区域
    this.joystickArea = {
      x: 50 * this.dpr,
      y: this.height - 200 * this.dpr,
      r: 80 * this.dpr
    }
    
    // 初始化队友
    this._initFollowers()
    
    // 注册触摸事件监听
    this._onTouchMove = (e) => {
      if (this.joystick.active && e.touches && Array.isArray(e.touches)) {
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
  
  /**
   * 销毁移动系统
   */
  destroy() {
    // 清理事件监听
    if (this._onTouchMove) {
      this.game.input.offMove(this._onTouchMove)
    }
    if (this._onTouchEnd) {
      this.game.input.offEnd(this._onTouchEnd)
    }
  }
  
  /**
   * 更新移动系统
   */
  update(dt) {
    // 摇杆控制移动
    const wasMoving = this.isMoving
    this.isMoving = false

    if (this.joystick.active) {
      const dx = this.joystick.currentX - this.joystick.startX
      const dy = this.joystick.currentY - this.joystick.startY
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 立即更新方向（无论是否移动）
      if (dist > 5 * this.dpr) {
        // 根据水平移动分量更新朝向
        if (Math.abs(dx) > Math.abs(dy)) {
          this.playerDirection = dx > 0 ? 'right' : 'left'
          this.facingLeft = dx < 0 // 向左移动时 facingLeft 为 true
        } else {
          this.playerDirection = dy > 0 ? 'down' : 'up'
          // 上下移动时不改变水平朝向
        }
      }

      if (dist > 10 * this.dpr) {
        this.isMoving = true
        const moveX = (dx / dist) * this.playerSpeed * dt
        const moveY = (dy / dist) * this.playerSpeed * dt

        this.playerX += moveX
        this.playerY += moveY

        // 边界限制（地图边界）
        const margin = 50 * this.dpr
        this.playerX = Math.max(margin, Math.min(this.mapWidth - margin, this.playerX))
        this.playerY = Math.max(margin, Math.min(this.mapHeight - margin, this.playerY))

        // 更新相机位置（跟随玩家）
        this._updateCamera()
      }
    }

    // 更新队友跟随
    this._updateFollowers(dt)

    // 检测从移动切换到idle，重置动画帧
    if (wasMoving && !this.isMoving) {
      this.animFrame = 0
      this.animTimer = 0
    }

    // 动画帧更新
    this.animTimer += dt
    const currentFrameDuration = this.isMoving ? this.frameDuration : this.frameDuration * 3

    if (this.animTimer >= currentFrameDuration) {
      this.animTimer = 0

      if (this.isMoving) {
        // 走路动画：8帧
        this.animFrame = (this.animFrame + 1) % 8
      } else {
        // 待机动画：2帧循环
        this.animFrame = (this.animFrame + 1) % 2
      }
    }
  }
  
  /**
   * 处理点击事件（摇杆激活）
   */
  handleTap(tap) {
    if (!tap) return false
    
    const jx = tap.x
    const jy = tap.y
    const distToJoystick = Math.sqrt(
      (jx - this.joystickArea.x) ** 2 + (jy - this.joystickArea.y) ** 2
    )
    
    if (distToJoystick <= this.joystickArea.r * 1.5) {
      // 点击在摇杆区域内（范围是半径的1.5倍，更容易激活）
      this.joystick.active = true
      this.joystick.startX = jx
      this.joystick.startY = jy
      this.joystick.currentX = jx
      this.joystick.currentY = jy
      return true
    }
    
    return false
  }
  
  /**
   * 初始化跟随队友
   */
  _initFollowers() {
    const allChars = charStateManager.getAllCharacters()
    
    // 从第二个角色开始，都是跟随队友
    for (let i = 1; i < allChars.length; i++) {
      this.followers.push({
        character: allChars[i],
        x: this.playerX - i * this.followerDistance,
        y: this.playerY,
        animFrame: 0,
        animTimer: 0,
        isMoving: false,
        facingLeft: this.facingLeft
      })
    }
    
    console.log(`[FieldMovement] 初始化了 ${this.followers.length} 个跟随队友`)
  }
  
  /**
   * 更新队友跟随
   */
  _updateFollowers(dt) {
    if (this.followers.length === 0) return

    // 记录主角位置历史（每3帧记录一次，避免太密集）
    this.historyFrameCount++
    if (this.historyFrameCount >= this.historyInterval) {
      this.historyFrameCount = 0
      this.playerHistory.unshift({
        x: this.playerX,
        y: this.playerY,
        facingLeft: this.facingLeft
      })
      
      // 限制历史长度
      if (this.playerHistory.length > this.historyMaxLength) {
        this.playerHistory.pop()
      }
    }

    // 每个队友跟随不同的历史位置
    for (let i = 0; i < this.followers.length; i++) {
      const follower = this.followers[i]
      
      // 计算队友应该在的历史位置索引
      const historyIndex = Math.min((i + 1) * 10, this.playerHistory.length - 1)
      
      if (historyIndex >= 0 && this.playerHistory.length > 0) {
        const targetPos = this.playerHistory[historyIndex]
        
        // 平滑移动到目标位置
        const dx = targetPos.x - follower.x
        const dy = targetPos.y - follower.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        // 如果距离大于阈值，移动队友
        if (dist > 10 * this.dpr) {
          const speed = this.playerSpeed * 0.95
          const moveX = (dx / dist) * speed * dt
          const moveY = (dy / dist) * speed * dt
          
          follower.x += moveX
          follower.y += moveY
          follower.facingLeft = targetPos.facingLeft
          follower.isMoving = true
        } else {
          // 距离足够近，停止移动
          if (!this.isMoving) {
            const wasMoving = follower.isMoving
            follower.isMoving = false
            
            if (wasMoving && !follower.isMoving) {
              follower.animFrame = 0
              follower.animTimer = 0
            }
          }
        }
      }
      
      // 更新队友动画
      follower.animTimer += dt
      const frameDuration = follower.isMoving ? this.frameDuration : this.frameDuration * 3
      
      if (follower.animTimer >= frameDuration) {
        follower.animTimer = 0
        
        if (follower.isMoving) {
          follower.animFrame = (follower.animFrame + 1) % 8
        } else {
          follower.animFrame = (follower.animFrame + 1) % 2
        }
      }
    }
  }
  
  /**
   * 更新相机位置（跟随玩家）
   */
  _updateCamera() {
    const targetCameraX = this.playerX - this.width / 2
    const targetCameraY = this.playerY - this.height / 2
    
    // 限制相机在地图范围内
    this.cameraX = Math.max(0, Math.min(this.mapWidth - this.width, targetCameraX))
    this.cameraY = Math.max(0, Math.min(this.mapHeight - this.height, targetCameraY))
  }
  
  /**
   * 世界坐标转屏幕坐标
   */
  worldToScreen(worldX, worldY) {
    return {
      x: worldX - this.cameraX,
      y: worldY - this.cameraY
    }
  }
  
  /**
   * 渲染角色（主角或队友）
   */
  renderCharacter(ctx, character, x, y, animFrame, facingLeft, isMoving) {
    // 空值检查
    if (!character) {
      return
    }
    
    const screenPos = this.worldToScreen(x, y)
    
    // 只渲染可见的角色
    if (screenPos.x < -100 || screenPos.x > this.width + 100 ||
        screenPos.y < -100 || screenPos.y > this.height + 100) {
      return
    }
    
    const heroId = character.id || 'zhenbao'
    
    // 获取动画帧
    const frameType = isMoving ? 'WALK' : 'IDLE'
    const frameKey = `HERO_${heroId.toUpperCase()}_${frameType}_${animFrame}`
    let img = this.game.assets.get(frameKey)
    
    // 如果没有动画帧，使用静态立绘
    if (!img) {
      img = this.game.assets.get(`HERO_${heroId.toUpperCase()}`)
    }
    
    if (img) {
      const targetHeight = 60 * this.dpr
      const scale = targetHeight / img.height
      const targetWidth = img.width * scale
      
      ctx.save()
      
      if (facingLeft) {
        ctx.translate(screenPos.x, screenPos.y)
        ctx.scale(-1, 1)
        ctx.translate(-screenPos.x, -screenPos.y)
      }
      
      ctx.drawImage(
        img,
        screenPos.x - targetWidth / 2,
        screenPos.y - targetHeight / 2,
        targetWidth,
        targetHeight
      )
      
      ctx.restore()
    }
  }
  
  /**
   * 渲染主角和队友
   */
  renderCharacters(ctx) {
    // 渲染队友
    for (const follower of this.followers) {
      if (follower.character) {
        this.renderCharacter(
          ctx,
          follower.character,
          follower.x,
          follower.y,
          follower.animFrame,
          follower.facingLeft,
          follower.isMoving
        )
      }
    }
    
    // 渲染主角
    if (this.mainCharacter) {
      this.renderCharacter(
        ctx,
        this.mainCharacter,
        this.playerX,
        this.playerY,
        this.animFrame,
        this.facingLeft,
        this.isMoving
      )
    }
  }
  
  /**
   * 渲染摇杆（完全复制field-scene的代码）
   */
  renderJoystick(ctx) {
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
}
