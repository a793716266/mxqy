/**
 * movement-controller.js - 移动控制器（可复用）
 * 封装玩家移动、相机跟随、队友跟随等核心逻辑
 */

import { charStateManager } from '../data/character-state.js'

/**
 * 摇杆控制器
 */
export class JoystickController {
  constructor(dpr, options = {}) {
    this.dpr = dpr
    
    // 摇杆区域配置
    this.area = {
      x: options.x || 50 * dpr,
      y: options.y || 200 * dpr, // 注意：这里需要在场景中设置正确的Y值
      r: options.r || 80 * dpr
    }
    
    // 摇杆状态
    this.active = false
    this.startX = 0
    this.startY = 0
    this.currentX = 0
    this.currentY = 0
    
    // 回调
    this.onTouchMove = null
    this.onTouchEnd = null
  }
  
  /**
   * 初始化摇杆（设置Y坐标）
   */
  setAreaY(y) {
    this.area.y = y
  }
  
  /**
   * 绑定输入事件
   */
  bindInput(game) {
    this.onTouchMove = (e) => {
      if (this.active && e.touches && Array.isArray(e.touches)) {
        for (const t of e.touches) {
          this.currentX = t.clientX * this.dpr
          this.currentY = t.clientY * this.dpr
        }
      }
    }
    
    this.onTouchEnd = (e) => {
      this.active = false
    }
    
    game.input.onMove(this.onTouchMove)
    game.input.onEnd(this.onTouchEnd)
  }
  
  /**
   * 解绑输入事件
   */
  unbindInput(game) {
    if (this.onTouchMove) {
      game.input.offMove(this.onTouchMove)
    }
    if (this.onTouchEnd) {
      game.input.offEnd(this.onTouchEnd)
    }
  }
  
  /**
   * 处理点击事件
   */
  handleTap(tap) {
    if (!tap) return false
    
    const dx = tap.x - this.area.x
    const dy = tap.y - this.area.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    
    if (dist <= this.area.r) {
      this.active = true
      this.startX = tap.x
      this.startY = tap.y
      this.currentX = tap.x
      this.currentY = tap.y
      return true
    }
    
    return false
  }
  
  /**
   * 获取摇杆偏移量
   */
  getOffset() {
    if (!this.active) {
      return { dx: 0, dy: 0, dist: 0 }
    }
    
    const dx = this.currentX - this.startX
    const dy = this.currentY - this.startY
    const dist = Math.sqrt(dx * dx + dy * dy)
    
    return { dx, dy, dist }
  }
}

/**
 * 玩家移动控制器
 */
export class PlayerMovementController {
  constructor(dpr, options = {}) {
    this.dpr = dpr
    
    // 玩家状态
    this.playerX = options.playerX || 0
    this.playerY = options.playerY || 0
    this.playerSpeed = options.playerSpeed || 150 * dpr
    this.playerDirection = options.playerDirection || 'right'
    this.facingLeft = options.facingLeft !== undefined ? options.facingLeft : false
    
    // 地图边界
    this.mapWidth = options.mapWidth || 2000 * dpr
    this.mapHeight = options.mapHeight || 1500 * dpr
    this.boundaryMargin = options.boundaryMargin || 50 * dpr
    
    // 动画状态
    this.animFrame = 0
    this.animTimer = 0
    this.isMoving = false
    this.frameDuration = options.frameDuration || 0.15
    
    // 图片朝向（如果图片本身朝左，设为true）
    this.imageFacesLeft = options.imageFacesLeft !== undefined ? options.imageFacesLeft : true
  }
  
  /**
   * 更新移动（基于摇杆输入）
   */
  update(dt, joystick) {
    const offset = joystick.getOffset()
    const wasMoving = this.isMoving
    this.isMoving = false
    
    // 更新方向
    if (offset.dist > 5 * this.dpr) {
      if (Math.abs(offset.dx) > Math.abs(offset.dy)) {
        this.playerDirection = offset.dx > 0 ? 'right' : 'left'
        // 根据图片朝向决定翻转逻辑
        this.facingLeft = this.imageFacesLeft ? (offset.dx > 0) : (offset.dx < 0)
      } else {
        this.playerDirection = offset.dy > 0 ? 'down' : 'up'
      }
    }
    
    // 更新位置
    if (offset.dist > 10 * this.dpr) {
      this.isMoving = true
      const moveX = (offset.dx / offset.dist) * this.playerSpeed * dt
      const moveY = (offset.dy / offset.dist) * this.playerSpeed * dt
      
      this.playerX += moveX
      this.playerY += moveY
      
      // 边界限制
      this.playerX = Math.max(this.boundaryMargin, Math.min(this.mapWidth - this.boundaryMargin, this.playerX))
      this.playerY = Math.max(this.boundaryMargin, Math.min(this.mapHeight - this.boundaryMargin, this.playerY))
    }
    
    // 更新动画
    if (wasMoving && !this.isMoving) {
      this.animFrame = 0
      this.animTimer = 0
    }
    
    this.animTimer += dt
    const currentFrameDuration = this.isMoving ? this.frameDuration : this.frameDuration * 3
    
    if (this.animTimer >= currentFrameDuration) {
      this.animTimer = 0
      if (this.isMoving) {
        this.animFrame = (this.animFrame + 1) % 8 // 走路8帧
      } else {
        this.animFrame = (this.animFrame + 1) % 2 // 待机2帧
      }
    }
  }
  
  /**
   * 设置玩家位置
   */
  setPosition(x, y) {
    this.playerX = x
    this.playerY = y
  }
  
  /**
   * 设置地图尺寸
   */
  setMapSize(width, height) {
    this.mapWidth = width
    this.mapHeight = height
  }
}

/**
 * 相机控制器
 */
export class CameraController {
  constructor(width, height, dpr, options = {}) {
    this.screenWidth = width
    this.screenHeight = height
    this.dpr = dpr
    
    // 相机位置
    this.cameraX = 0
    this.cameraY = 0
    
    // 地图尺寸
    this.mapWidth = options.mapWidth || 2000 * dpr
    this.mapHeight = options.mapHeight || 1500 * dpr
  }
  
  /**
   * 跟随目标
   */
  follow(targetX, targetY) {
    this.cameraX = targetX - this.screenWidth / 2
    this.cameraY = targetY - this.screenHeight / 2
    
    // 边界限制
    this.cameraX = Math.max(0, Math.min(this.mapWidth - this.screenWidth, this.cameraX))
    this.cameraY = Math.max(0, Math.min(this.mapHeight - this.screenHeight, this.cameraY))
  }
  
  /**
   * 转换世界坐标到屏幕坐标
   */
  worldToScreen(worldX, worldY) {
    return {
      x: worldX - this.cameraX,
      y: worldY - this.cameraY
    }
  }
  
  /**
   * 设置地图尺寸
   */
  setMapSize(width, height) {
    this.mapWidth = width
    this.mapHeight = height
  }
}

/**
 * 队友跟随系统
 */
export class FollowerSystem {
  constructor(dpr, options = {}) {
    this.dpr = dpr
    
    // 配置
    this.followerDistance = options.followerDistance || 35 * dpr
    this.historyMaxLength = options.historyMaxLength || 90
    this.historyInterval = options.historyInterval || 3
    this.historyFrameCount = 0
    
    // 主角移动历史
    this.playerHistory = []
    
    // 队友列表
    this.followers = []
  }
  
  /**
   * 初始化队友
   */
  init(playerX, playerY, imageFacesLeft = true) {
    this.followers = []
    this.playerHistory = []
    
    const allChars = charStateManager.getAllCharacters()
    for (let i = 1; i < allChars.length; i++) {
      this.followers.push({
        character: allChars[i],
        x: playerX,
        y: playerY,
        isMoving: false,
        animFrame: 0,
        animTimer: 0,
        facingLeft: imageFacesLeft
      })
    }
    
    console.log(`[FollowerSystem] 初始化了 ${this.followers.length} 个跟随队友`)
  }
  
  /**
   * 更新队友跟随
   */
  update(dt, playerX, playerY, playerFacingLeft, playerIsMoving, playerSpeed) {
    // 记录主角移动历史
    this.historyFrameCount++
    if (this.historyFrameCount >= this.historyInterval) {
      this.historyFrameCount = 0
      this.playerHistory.unshift({
        x: playerX,
        y: playerY,
        facingLeft: playerFacingLeft
      })
      if (this.playerHistory.length > this.historyMaxLength) {
        this.playerHistory.pop()
      }
    }
    
    // 更新每个队友
    const frameDuration = 0.15
    this.followers.forEach((follower, i) => {
      const historyIndex = Math.min((i + 1) * 10, this.playerHistory.length - 1)
      
      if (historyIndex >= 0 && this.playerHistory[historyIndex]) {
        const targetPos = this.playerHistory[historyIndex]
        const dx = targetPos.x - follower.x
        const dy = targetPos.y - follower.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        if (dist > 5 * this.dpr) {
          const speed = playerSpeed * 0.95
          follower.x += (dx / dist) * speed * dt
          follower.y += (dy / dist) * speed * dt
          follower.isMoving = true
          follower.facingLeft = targetPos.facingLeft
        } else {
          follower.isMoving = false
        }
      }
      
      // 更新队友动画
      if (!playerIsMoving) {
        const wasMoving = follower.isMoving
        follower.isMoving = false
        if (wasMoving && !follower.isMoving) {
          follower.animFrame = 0
          follower.animTimer = 0
        }
      }
      
      follower.animTimer += dt
      const currentFrameDuration = playerIsMoving ? frameDuration : frameDuration * 3
      if (follower.animTimer >= currentFrameDuration) {
        follower.animTimer = 0
        if (playerIsMoving) {
          follower.animFrame = (follower.animFrame + 1) % 8
        } else {
          follower.animFrame = (follower.animFrame + 1) % 2
        }
      }
    })
  }
  
  /**
   * 获取所有队友
   */
  getFollowers() {
    return this.followers
  }
}
