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
    
    // 摇杆控制（固定位置摇杆）
    this.joystick = { active: false, touchId: null, currentX: 0, currentY: 0 }
    this.joystickConfig = null
    
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
    
    // 固定摇杆配置（底座在左下角固定位置）
    const joystickCenterX = 130 * this.dpr
    const joystickCenterY = this.height - 130 * this.dpr
    this.joystickConfig = {
      centerX: joystickCenterX,     // 底座中心X（固定）
      centerY: joystickCenterY,     // 底座中心Y（固定）
      baseRadius: 60 * this.dpr,    // 底座半径
      handleRadius: 30 * this.dpr,  // 手柄半径
      maxOffset: 50 * this.dpr,     // 手柄最大偏移
      deadZone: 5 * this.dpr        // 死区阈值（降低提高灵敏度）
    }
    
    // 初始化队友
    this._initFollowers()
    
    // 注册触摸事件监听（用touchIdentifier跟踪摇杆触摸点）
    this._onTouchStart = (e) => {
      if (!this.joystick.active && e.touches) {
        for (const t of e.touches) {
          const tx = t.clientX * this.dpr
          const ty = t.clientY * this.dpr
          const dx = tx - this.joystickConfig.centerX
          const dy = ty - this.joystickConfig.centerY
          // 判断是否在摇杆底座范围内（宽松判定，1.5倍半径）
          if (Math.sqrt(dx * dx + dy * dy) < this.joystickConfig.baseRadius * 1.5) {
            this.joystick.active = true
            this.joystick.touchId = t.identifier
            this.joystick.currentX = tx
            this.joystick.currentY = ty
            break
          }
        }
      }
    }
    
    this._onTouchMove = (e) => {
      if (this.joystick.active && e.touches) {
        for (const t of e.touches) {
          if (t.identifier === this.joystick.touchId) {
            this.joystick.currentX = t.clientX * this.dpr
            this.joystick.currentY = t.clientY * this.dpr
            break
          }
        }
      }
    }
    
    this._onTouchEnd = (e) => {
      if (this.joystick.active && e.changedTouches) {
        for (const t of e.changedTouches) {
          if (t.identifier === this.joystick.touchId) {
            this.joystick.active = false
            this.joystick.touchId = null
            break
          }
        }
      }
    }
    
    wx.onTouchStart(this._onTouchStart)
    this.game.input.onMove(this._onTouchMove)
    this.game.input.onEnd(this._onTouchEnd)
  }
  
  /**
   * 销毁移动系统
   */
  destroy() {
    // 清理事件监听
    if (this._onTouchStart) {
      wx.offTouchStart(this._onTouchStart)
    }
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
      const dx = this.joystick.currentX - this.joystickConfig.centerX
      const dy = this.joystick.currentY - this.joystickConfig.centerY
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 立即更新方向（偏移 > 死区）
      if (dist > this.joystickConfig.deadZone) {
        // 根据水平移动分量更新朝向
        if (Math.abs(dx) > Math.abs(dy)) {
          this.playerDirection = dx > 0 ? 'right' : 'left'
          this.facingLeft = dx < 0 // 向左移动时 facingLeft 为 true
        } else {
          this.playerDirection = dy > 0 ? 'down' : 'up'
          // 上下移动时不改变水平朝向
        }
      }

      if (dist > this.joystickConfig.deadZone) {
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

    // 根据主角类型确定帧率和帧数（1秒循环）
    const heroId = this.mainCharacter?.id || 'zhenbao'
    const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao'

    let frameDuration, totalFrames
    if (this.isMoving) {
      // 走路动画
      if (heroId === 'zhenbao') {
        frameDuration = 0.100 // 臻宝10帧（减帧版），100ms/帧 ≈ 1秒循环
        totalFrames = 10
      } else if (isCat) {
        frameDuration = 0.083 // 猫咪12帧（减帧版），83ms/帧 ≈ 1秒循环
        totalFrames = 12
      } else {
        frameDuration = 0.125 // 其他8帧，125ms/帧 = 1秒循环
        totalFrames = 8
      }
    } else {
      // 待机动画（1秒循环）
      if (heroId === 'zhenbao') {
        frameDuration = 0.200 // 臻宝5帧（减帧版），200ms/帧 = 1秒循环
        totalFrames = 5
      } else if (isCat) {
        frameDuration = 0.125 // 猫咪8帧（减帧版），125ms/帧 ≈ 1秒循环
        totalFrames = 8
      } else {
        frameDuration = 0.500 // 其他2帧，500ms/帧 = 1秒循环
        totalFrames = 2
      }
    }

    if (this.animTimer >= frameDuration) {
      this.animTimer = 0
      this.animFrame = (this.animFrame + 1) % totalFrames
    }
  }
  
  /**
   * 处理点击事件（摇杆激活）
   */
  handleTap(tap) {
    if (!tap) return false
    
    // 摇杆区域点击由touchStart事件处理，不再通过tap激活
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

      // 根据角色类型确定帧率和帧数（1秒循环）
      const heroId = follower.character.id
      const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao'

      let frameDuration, totalFrames
      if (follower.isMoving) {
        // 走路动画
        if (heroId === 'zhenbao') {
          frameDuration = 0.100
          totalFrames = 10
        } else if (isCat) {
          frameDuration = 0.083
          totalFrames = 12
        } else {
          frameDuration = 0.125
          totalFrames = 8
        }
      } else {
        // 待机动画
        if (heroId === 'zhenbao') {
          frameDuration = 0.200
          totalFrames = 5
        } else if (isCat) {
          frameDuration = 0.125
          totalFrames = 8
        } else {
          frameDuration = 0.500
          totalFrames = 2
        }
      }

      if (follower.animTimer >= frameDuration) {
        follower.animTimer = 0
        follower.animFrame = (follower.animFrame + 1) % totalFrames
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
    const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao'
    
    // 获取动画帧
    let frameKey = null
    
    if (heroId === 'zhenbao') {
      // 臻宝使用新版动画（HERO_ZHENBAO_WALK_01格式，索引从1开始）
      const frameType = isMoving ? 'WALK' : 'IDLE'
      frameKey = `HERO_ZHENBAO_${frameType}_${(animFrame + 1).toString().padStart(2, '0')}`
    } else if (isCat) {
      // 猫咪使用特殊动画（CAT_WALK_01格式，索引从1开始）
      const frameType = isMoving ? 'WALK' : 'IDLE'
      frameKey = `CAT_${frameType}_${(animFrame + 1).toString().padStart(2, '0')}`
    } else {
      // 普通英雄使用标准动画（HERO_XXX_WALK_0格式，索引从0开始）
      const frameType = isMoving ? 'WALK' : 'IDLE'
      frameKey = `HERO_${heroId.toUpperCase()}_${frameType}_${animFrame}`
    }
    
    let img = this.game.assets.get(frameKey)
    
    // 如果没有动画帧，使用静态立绘
    if (!img) {
      if (isCat) {
        img = this.game.assets.get(`CAT_${heroId.toUpperCase()}`)
      } else {
        img = this.game.assets.get(`HERO_${heroId.toUpperCase()}`)
      }
    }
    
    if (img) {
      const targetHeight = 130 * this.dpr
      const scale = targetHeight / img.height
      const targetWidth = img.width * scale
      
      ctx.save()
      
      if (facingLeft) {
        // 向左时不翻转（图片本身朝左）
        ctx.drawImage(
          img,
          screenPos.x - targetWidth / 2,
          screenPos.y - targetHeight / 2,
          targetWidth,
          targetHeight
        )
      } else {
        // 向右时翻转
        ctx.translate(screenPos.x, screenPos.y)
        ctx.scale(-1, 1)
        ctx.translate(-screenPos.x, -screenPos.y)
        ctx.drawImage(
          img,
          screenPos.x - targetWidth / 2,
          screenPos.y - targetHeight / 2,
          targetWidth,
          targetHeight
        )
      }
      
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
    const jc = this.joystickConfig
    
    // 固定底座位置
    const baseX = jc.centerX
    const baseY = jc.centerY
    
    if (this.joystick.active) {
      const dx = this.joystick.currentX - jc.centerX
      const dy = this.joystick.currentY - jc.centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      // 计算手柄位置（限制在最大偏移范围内）
      let handleX = baseX
      let handleY = baseY
      if (dist > 0) {
        const clampedDist = Math.min(dist, jc.maxOffset)
        handleX = baseX + (dx / dist) * clampedDist
        handleY = baseY + (dy / dist) * clampedDist
      }
      
      // 底座
      ctx.beginPath()
      ctx.arc(baseX, baseY, jc.baseRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
      
      // 手柄
      ctx.beginPath()
      ctx.arc(handleX, handleY, jc.handleRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
    } else {
      // 未激活：显示半透明摇杆提示
      ctx.beginPath()
      ctx.arc(baseX, baseY, jc.baseRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
      
      ctx.beginPath()
      ctx.arc(baseX, baseY, jc.handleRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fill()
      
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('移动', baseX, baseY)
    }
  }
}
