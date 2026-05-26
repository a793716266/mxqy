/**
 * field-movement.js - 野外移动系统（从field-scene提取）
 * 这套移动逻辑已经在阳光草原验证过，非常好用
 */

import { charStateManager } from '../data/character-state.js'
import { CollisionEngine } from '../engine/collision-engine.js'
import { getAnimParams } from '../data/animation-config.js'

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
    this._effectiveMoving = false   // 带滞后的有效移动状态，防止walk/idle闪烁
    this._movingHoldFrames = 0      // 停止移动后的保持计数器（帧）
    this._MOVING_HOLD = 5           // 停止后保持5帧(约80ms)不切回idle
    this.frameDuration = 0.15
    
    // 摇杆控制（固定位置摇杆）
    this.joystick = { active: false, touchId: null, currentX: 0, currentY: 0 }
    this.joystickConfig = null
    
    // 队友跟随系统（新逻辑：每个队友跟随前方队友）
    this.followers = []
    this.followerSpacing = 60 * this.dpr  // 队友之间的最小间距
    this.playerHistory = []  // 保留以防其他地方使用
    this.historyMaxLength = 120
    this.historyInterval = 3
    this.historyFrameCount = 0
    
    // 主角（将在init()中初始化）
    this.mainCharacter = null
    
    // 碰撞检测系统（统一使用 CollisionEngine，不再自行实现）
    this._collisionEngine = new CollisionEngine({ dpr: this.dpr })
    this.playerRadius = 16 * this.dpr  // 玩家碰撞半径（脚底小圆）
    this.collisionFootOffsetY = 36 * this.dpr  // 碰撞检测点Y偏移（从角色中心→脚底）
    
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
   * 设置障碍物数据（委托给统一碰撞引擎）
   * @param {Array} obstacles - 障碍物数组，每个元素格式：{ type: 'rect', x, y, width, height, name }
   */
  setObstacles(obstacles) {
    this._collisionEngine.setObstacles(obstacles)
    console.log(`[FieldMovement] 通过 CollisionEngine 设置了障碍物`)
  }

  /**
   * 检查玩家当前位置是否与障碍物碰撞
   * 委托给统一碰撞引擎（脚底碰撞检测）
   */
  _checkCollision(x, y) {
    return this._collisionEngine.checkStaticCollision(x, y, {
      radius: this.playerRadius / this.dpr,
      footOffsetY: this.collisionFootOffsetY / this.dpr
    })
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
          // 上下移动时，如果水平分量超过死区，也更新水平朝向
          // 这样斜方向切换时不会出现倒着走的情况
          if (Math.abs(dx) > this.joystickConfig.deadZone) {
            this.facingLeft = dx < 0
          }
        }
      }

      if (dist > this.joystickConfig.deadZone) {
        this.isMoving = true
        const moveX = (dx / dist) * this.playerSpeed * dt
        const moveY = (dy / dist) * this.playerSpeed * dt

        // 保存旧位置
        const oldX = this.playerX
        const oldY = this.playerY

        this.playerX += moveX
        this.playerY += moveY

        // 边界限制（严格限制在地图内，用玩家半径作为边距）
        const boundaryMargin = this.playerRadius
        this.playerX = Math.max(boundaryMargin, Math.min(this.mapWidth - boundaryMargin, this.playerX))
        this.playerY = Math.max(boundaryMargin, Math.min(this.mapHeight - boundaryMargin, this.playerY))

        // 碰撞检测 - 碰撞则回退（支持分轴滑动：委托给统一引擎）
        const corrected = this._collisionEngine.moveWithSlide(
          oldX, oldY, this.playerX, this.playerY,
          { radius: this.playerRadius / this.dpr, footOffsetY: this.collisionFootOffsetY / this.dpr }
        )
        this.playerX = corrected.x
        this.playerY = corrected.y

        // 更新相机位置（跟随玩家）
        this._updateCamera()
      }
    }

    // 更新队友跟随
    this._updateFollowers(dt)

    // 移动状态滞后（防止摇杆死区抖动导致walk/idle闪烁）
    if (this.isMoving) {
      this._effectiveMoving = true
      this._movingHoldFrames = 0
    } else {
      this._movingHoldFrames++
      if (this._movingHoldFrames > this._MOVING_HOLD) {
        if (this._effectiveMoving) {
          // 真正停止移动了，重置动画到idle起始
          this.animFrame = 0
          this.animTimer = 0
        }
        this._effectiveMoving = false
        this._movingHoldFrames = 0
      }
    }

    // 动画帧更新
    this.animTimer += dt

    // 根据主角类型确定帧率和帧数（1秒循环）
    const heroId = this.mainCharacter?.id || 'zhenbao'
    const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao'

    const anim = getAnimParams(heroId, this._effectiveMoving)
    let frameDuration = anim.dur
    let totalFrames = anim.frames

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
   * 新逻辑：队友排成一列，每个跟随前一个
   */
  _initFollowers() {
    const allChars = charStateManager.getAllCharacters()
    
    // 从第二个角色开始，都是跟随队友
    for (let i = 1; i < allChars.length; i++) {
      this.followers.push({
        character: allChars[i],
        // 初始位置：在主角后方 followerspacing 距离
        x: this.playerX - (i * this.followerSpacing),
        y: this.playerY + (i % 2 === 0 ? -20 * this.dpr : 20 * this.dpr),  // 错开Y轴避免重叠
        animFrame: 0,
        animTimer: 0,
        isMoving: false,
        _effectiveMoving: false,
        _movingHoldFrames: 0,
        facingLeft: this.facingLeft
      })
    }
    
    console.log(`[FieldMovement] 初始化了 ${this.followers.length} 个跟随队友，间距: ${this.followerSpacing}`)
  }
  
  /**
   * 更新队友跟随
   * 新逻辑：每个队友跟随前方队友（或主角），保持固定间距
   */
  _updateFollowers(dt) {
    if (this.followers.length === 0) return

    // 依次更新每个队友（从第一个开始，确保顺序正确）
    for (let i = 0; i < this.followers.length; i++) {
      const follower = this.followers[i]
      
      // 目标位置：前方队友或主角
      let targetX, targetY, targetFacingLeft
      if (i === 0) {
        // 第一个队友跟随主角
        targetX = this.playerX
        targetY = this.playerY
        targetFacingLeft = this.facingLeft
      } else {
        // 后续队友跟随前一个队友
        const prevFollower = this.followers[i - 1]
        targetX = prevFollower.x
        targetY = prevFollower.y
        targetFacingLeft = prevFollower.facingLeft
      }
      
      // 计算期望位置（在目标后方 followerspacing 距离）
      // 根据目标的朝向，计算后方位置
      let desiredX, desiredY
      if (targetFacingLeft) {
        // 目标面向左，队友应该在目标右边
        desiredX = targetX + this.followerSpacing
        desiredY = targetY
      } else {
        // 目标面向右，队友应该在目标左边
        desiredX = targetX - this.followerSpacing
        desiredY = targetY
      }
      
      // 平滑移动到期望位置
      const dx = desiredX - follower.x
      const dy = desiredY - follower.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      // 判断是否需要移动
      // 条件1：距离大于停止阈值
      // 条件2：主角还在移动，或者距离还比较大（避免停止后队友跑太远）
      const stopThreshold = 10 * this.dpr
      const shouldMove = dist > stopThreshold && (this._effectiveMoving || dist > this.followerSpacing * 1.5)
      
      if (shouldMove) {
        const speed = this.playerSpeed * 0.95
        const moveX = (dx / dist) * speed * dt
        const moveY = (dy / dist) * speed * dt
        
        follower.x += moveX
        follower.y += moveY
        follower.facingLeft = targetFacingLeft
        follower.isMoving = true

        // 队友边界限制（防止跑出地图）
        const fMargin = this.playerRadius * 0.8
        follower.x = Math.max(fMargin, Math.min(this.mapWidth - fMargin, follower.x))
        follower.y = Math.max(fMargin, Math.min(this.mapHeight - fMargin, follower.y))
      } else {
        // 距离足够近，停止移动
        const wasMoving = follower.isMoving
        follower.isMoving = false
        
        if (wasMoving && !follower.isMoving) {
          follower.animFrame = 0
          follower.animTimer = 0
        }
      }
      
      // 防重叠检测（只在移动时执行，避免振荡）
      if (follower.isMoving || follower._effectiveMoving) {
        // 队友之间的防重叠检测
        for (let j = 0; j < i; j++) {
          const other = this.followers[j]
          const sepDx = follower.x - other.x
          const sepDy = follower.y - other.y
          const sepDist = Math.sqrt(sepDx * sepDx + sepDy * sepDy)
          
          // 如果距离太近，推开
          if (sepDist < this.followerSpacing && sepDist > 0) {
            const pushForce = (this.followerSpacing - sepDist) / 2
            const pushX = (sepDx / sepDist) * pushForce
            const pushY = (sepDy / sepDist) * pushForce
            
            follower.x += pushX
            follower.y += pushY
            other.x -= pushX
            other.y -= pushY
          }
        }
        
        // 队友与主角之间的防重叠检测
        const playerDx = follower.x - this.playerX
        const playerDy = follower.y - this.playerY
        const playerDist = Math.sqrt(playerDx * playerDx + playerDy * playerDy)
        
        if (playerDist < this.followerSpacing && playerDist > 0) {
          const pushForce = (this.followerSpacing - playerDist) / 2
          follower.x += (playerDx / playerDist) * pushForce
          follower.y += (playerDy / playerDist) * pushForce
        }
      }
      
      // 队友移动状态滞后（与主角相同的防闪烁机制）
      if (follower.isMoving) {
        follower._effectiveMoving = true
        follower._movingHoldFrames = 0
      } else {
        follower._movingHoldFrames++
        if (follower._movingHoldFrames > this._MOVING_HOLD) {
          follower._effectiveMoving = false
          follower._movingHoldFrames = 0
        }
      }
      
      // 更新队友动画
      follower.animTimer += dt

      // 根据角色类型确定帧率和帧数（1秒循环）
      const heroId = follower.character.id
      const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao'

      const anim = getAnimParams(heroId, follower._effectiveMoving)
      let frameDuration = anim.dur
      let totalFrames = anim.frames

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
      // 臻宝使用新版动画（walk帧从walk_01开始，+1偏移）
      const frameType = isMoving ? 'WALK' : 'IDLE'
      const offset = isMoving ? 1 : 1
      frameKey = `HERO_ZHENBAO_${frameType}_${(animFrame + offset).toString().padStart(2, '0')}`
    } else if (heroId === 'lixiaobao') {
      // 李小宝使用透明背景动画（walk/idle帧从01开始，+1偏移）
      const frameType = isMoving ? 'WALK' : 'IDLE'
      const offset = isMoving ? 1 : 1
      frameKey = `HERO_LIXIAOBAO_${frameType}_${(animFrame + offset).toString().padStart(2, '0')}`
    } else if (heroId === 'slime_cat') {
      // 史莱姆猫使用专属动画资源（transparent/slime_cat目录）
      const frameType = isMoving ? 'WALK' : 'IDLE'
      if (isMoving) {
        frameKey = `SLIME_CAT_WALK_${(animFrame + 1).toString().padStart(2, '0')}`
      } else {
        frameKey = `SLIME_CAT_IDLE_${animFrame + 1}`
      }
    } else if (heroId === 'shadow_mouse') {
      // 暗影鼠使用专属动画资源
      if (isMoving) {
        frameKey = `SHADOW_MOUSE_WALK_${(animFrame + 1).toString().padStart(2, '0')}`
      } else {
        frameKey = `SHADOW_MOUSE_IDLE_${String(animFrame + 1).padStart(2, '0')}`
      }
    } else if (isCat) {
      // 其他猫咪使用通用动画（CAT_WALK_01格式，索引从1开始）
      const frameType = isMoving ? 'WALK' : 'IDLE'
      frameKey = `CAT_${frameType}_${(animFrame + 1).toString().padStart(2, '0')}`
    } else {
      // 普通英雄使用标准动画（HERO_XXX_WALK_0格式，索引从0开始）
      const frameType = isMoving ? 'WALK' : 'IDLE'
      frameKey = `HERO_${heroId.toUpperCase()}_${frameType}_${animFrame}`
    }
    
    let img = this.game.assets.get(frameKey)
    
    // 如果没有动画帧，fallback 到同类型第一帧（避免走路时闪到idle帧）
    if (!img) {
      const fallbackType = isMoving ? 'WALK' : 'IDLE'
      if (heroId === 'slime_cat') {
        img = this.game.assets.get(isMoving ? 'SLIME_CAT_WALK_01' : 'SLIME_CAT_IDLE_1')
      } else if (heroId === 'shadow_mouse') {
        img = this.game.assets.get(`SHADOW_MOUSE_${fallbackType}_01`)
      } else if (heroId === 'zhenbao') {
        img = this.game.assets.get(`HERO_ZHENBAO_${fallbackType}_01`)
      } else if (heroId === 'lixiaobao') {
        img = this.game.assets.get(`HERO_LIXIAOBAO_${fallbackType}_01`)
      } else if (isCat) {
        img = this.game.assets.get(`CAT_${fallbackType}_01`)
      } else {
        img = this.game.assets.get(`HERO_${heroId.toUpperCase()}_${fallbackType}_0`)
      }
    }
    
    if (img) {
      const targetHeight = 80 * this.dpr
      const scale = targetHeight / img.height
      const targetWidth = img.width * scale
      
      // 绘制脚下阴影（椭圆）- 位于角色脚底附近
      const shadowY = screenPos.y + targetHeight * 0.45
      const shadowRx = targetWidth * 0.4
      const shadowRy = targetHeight * 0.12
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(screenPos.x, shadowY, shadowRx, shadowRy, 0, 0, Math.PI * 2)
      const shadowGrad = ctx.createRadialGradient(
        screenPos.x, shadowY, 0,
        screenPos.x, shadowY, shadowRx
      )
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.35)')
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shadowGrad
      ctx.fill()
      ctx.restore()
      
      ctx.save()
      
      // 根据角色素材默认朝向决定是否翻转：
      // 臻宝/李小宝: 默认朝右 → 向左(facingLeft)时翻转
      // 其他角色: 默认朝左 → 向右(!facingLeft)时翻转
      if (heroId === 'zhenbao' || heroId === 'lixiaobao') {
        if (facingLeft) {
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
        } else {
          ctx.drawImage(
            img,
            screenPos.x - targetWidth / 2,
            screenPos.y - targetHeight / 2,
            targetWidth,
            targetHeight
          )
        }
      } else {
        // 李小宝及其他角色：默认朝左
        if (!facingLeft) {
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
        } else {
          ctx.drawImage(
            img,
            screenPos.x - targetWidth / 2,
            screenPos.y - targetHeight / 2,
            targetWidth,
            targetHeight
          )
        }
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
          follower._effectiveMoving
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
        this._effectiveMoving
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
