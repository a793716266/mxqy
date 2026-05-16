/**
 * character-sprite.js - 通用角色精灵类
 * 
 * 功能：
 * 1. 封装角色渲染逻辑（行走/空闲动画）
 * 2. 自动根据角色配置选择正确的资源key
 * 3. 处理朝向翻转
 * 4. 绘制角色阴影（可配置）
 * 5. 可在任何场景中复用（field-scene, battle-scene, town-scene等）
 * 
 * 使用示例：
 *   // 在场景中
 *   const zhenbaoData = HEROES.find(h => h.id === 'zhenbao')
 *   const sprite = new CharacterSprite(game, zhenbaoData)
 *   sprite.update(dt, isMoving, facingLeft)
 *   sprite.render(ctx, screenX, screenY)
 */

export class CharacterSprite {
  /**
   * @param {Object} game - 游戏实例（用于获取assets和dpr）
   * @param {Object} charData - 角色数据（来自heroes.js或enemies.js）
   * @param {Object} [opts] - 可选配置（覆盖charData中的renderConfig）
   */
  constructor(game, charData, opts = {}) {
    this.game = game
    this.charData = charData
    this.dpr = game.dpr || 1
    
    // 从 charData.renderConfig 或 opts 读取渲染配置
    const config = { ...(charData.renderConfig || {}), ...opts }
    
    // ===== 资源配置 =====
    // 资源key前缀（如 'HERO_ZHENBAO', 'SLIME_CAT'）
    this.assetPrefix = config.assetPrefix || this._autoDetectPrefix()
    
    // 角色类型（用于判断翻转规则等）
    // 'zhenbao' | 'lixiaobao' | 'slime_cat' | 'shadow_mouse' | 'cat' | 'hero' | 'enemy' | 'aimi'
    this.spriteType = config.spriteType || this._autoDetectType()
    
    // ===== 动画配置 =====
    // 帧数
    this.totalWalkFrames = config.totalWalkFrames || 8
    this.totalIdleFrames = config.totalIdleFrames || 8
    
    // 帧偏移（某些角色从1开始，某些从0开始）
    this.walkFrameOffset = config.walkFrameOffset || 1
    this.idleFrameOffset = config.idleFrameOffset || 1
    
    // 帧编号补零位数（某些角色使用不补零的编号，如 SLIME_CAT_IDLE_1）
    this.walkFramePad = config.walkFramePad !== undefined ? config.walkFramePad : 2
    this.idleFramePad = config.idleFramePad !== undefined ? config.idleFramePad : 2
    
    // 帧持续时间（秒）
    this.frameDuration = config.frameDuration || 0.15
    
    // ===== 渲染配置 =====
    // 目标高度（逻辑像素）
    this.targetHeight = (config.targetHeight || 80) * this.dpr
    
    // 翻转配置
    // 翻转规则：'same' = facingLeft=true时翻转，'opposite' = facingLeft=false时翻转
    this.flipRule = config.flipRule || this._autoDetectFlipRule()
    
    // 阴影配置
    this.shadow = config.shadow !== false
    this.shadowOffset = (config.shadowOffset || 5) * this.dpr
    this.shadowWidthRatio = config.shadowWidthRatio || 0.8
    this.shadowHeight = (config.shadowHeight || 8) * this.dpr
    this.shadowColor = config.shadowColor || 'rgba(0,0,0,0.3)'
    
    // ===== 动画状态 =====
    this.animFrame = 0
    this.animTimer = 0
    this.isMoving = false
    this._effectiveMoving = false
    this._movingHoldFrames = 0
    this._MOVING_HOLD = config.movingHoldFrames || 5 // 停止后保持5帧(约80ms)不切回idle
    
    // 朝向
    this.facingLeft = false
    
    // ===== 战斗相关状态（用于battle-scene）=====
    this.state = 'idle' // 'idle' | 'walk' | 'attack' | 'skill' | 'hurt' | 'dead'
    this.attackCompleteCallback = null

    // ★ 动画完成检测（用于 BUFF/技能动画播放完成后才应用效果）
    this._prevFrame = -1
    this._frameCount = 0
    this._totalFramesMap = {
      idle: config.totalIdleFrames || 8,
      walk: config.totalWalkFrames || 8,
      attack: config.totalAttackFrames || 8,
      skill: config.totalSkillFrames || 8,
      buff: config.totalBuffFrames || 8,
      support: config.totalSupportFrames || 8
    }
    this.onAnimationComplete = null  // 回调函数，参数是动画类型
  }
  
  /**
   * 自动检测资源前缀
   */
  _autoDetectPrefix() {
    const id = this.charData.id?.toLowerCase() || ''
    
    // 预定义角色
    if (id === 'zhenbao') return 'HERO_ZHENBAO'
    if (id === 'lixiaobao') return 'HERO_LIXIAOBAO'
    if (id === 'slime_cat') return 'SLIME_CAT'
    if (id === 'shadow_mouse') return 'SHADOW_MOUSE'
    
    // 猫咪角色
    if (id.includes('cat') || id === 'mao') return 'CAT'
    
    // 通用英雄
    return `HERO_${this.charData.id?.toUpperCase() || 'UNKNOWN'}`
  }
  
  /**
   * 自动检测角色类型
   */
  _autoDetectType() {
    const id = this.charData.id?.toLowerCase() || ''
    
    if (id === 'zhenbao') return 'zhenbao'
    if (id === 'lixiaobao') return 'lixiaobao'
    if (id === 'slime_cat') return 'slime_cat'
    if (id === 'shadow_mouse') return 'shadow_mouse'
    if (id.includes('cat') || id === 'mao') return 'cat'
    if (this.charData.isBoss || this.charData.isElite) return 'enemy'
    return 'hero'
  }
  
  /**
   * 自动检测翻转规则
   */
  _autoDetectFlipRule() {
    // zhenbao/lixiaobao/aimi: facingLeft=true 时翻转
    // 其他角色: facingLeft=false 时翻转（默认朝右）
    const type = this.spriteType
    if (type === 'zhenbao' || type === 'lixiaobao' || type === 'aimi') {
      return 'same' // facingLeft=true 时翻转
    }
    return 'opposite' // facingLeft=false 时翻转
  }
  
  /**
   * 更新动画状态
   * @param {number} dt - 帧间隔（秒）
   * @param {boolean} [isMoving] - 是否正在移动（不传则不更新移动状态）
   * @param {boolean} [facingLeft] - 是否朝向左侧（不传则不更新朝向）
   */
  update(dt, isMoving, facingLeft) {
    // 更新移动状态
    if (isMoving !== undefined) {
      this.isMoving = isMoving
      
      // 移动状态滞后机制（防止walk/idle闪烁）
      if (isMoving) {
        this._effectiveMoving = true
        this._movingHoldFrames = this._MOVING_HOLD
      } else {
        if (this._movingHoldFrames > 0) {
          this._movingHoldFrames--
        } else {
          this._effectiveMoving = false
        }
      }
    }
    
    // 更新朝向
    if (facingLeft !== undefined) {
      this.facingLeft = facingLeft
    }
    
    // 动画帧更新
    this.animTimer += dt
    if (this.animTimer >= this.frameDuration) {
      this.animTimer = 0
      const totalFrames = this._effectiveMoving ? this.totalWalkFrames : this.totalIdleFrames
      const nextFrame = (this.animFrame + 1) % totalFrames

      // ★ 检测战斗动画完成（attack/skill/buff/support）
      if (!this._effectiveMoving) {
        const battleStates = ['attack', 'skill', 'buff', 'support']
        if (battleStates.includes(this.state)) {
          const stateTotal = this._totalFramesMap[this.state] || 8
          // 当前帧是最后一帧，下一帧就是完成
          if (this.animFrame >= stateTotal - 1) {
            if (typeof this.onAnimationComplete === 'function') {
              this.onAnimationComplete(this.state)
            }
          }
        }
      }

      this.animFrame = nextFrame
      this._prevFrame = this.animFrame
      this._frameCount++
    }
  }
  
  /**
   * 获取当前动画帧的资源key
   * @returns {string} 资源key
   */
  getCurrentFrameKey() {
    const prefix = this.assetPrefix
    const frameNum = this.animFrame + (this._effectiveMoving ? this.walkFrameOffset : this.idleFrameOffset)
    
    if (this._effectiveMoving) {
      // 行走帧
      const pad = this.walkFramePad
      const frameStr = String(frameNum).padStart(pad, '0')
      return `${prefix}_WALK_${frameStr}`
    } else {
      // 空闲帧
      const pad = this.idleFramePad
      const frameStr = String(frameNum).padStart(pad, '0')
      return `${prefix}_IDLE_${frameStr}`
    }
  }
  
  /**
   * 获取当前动画帧图片
   * @returns {HTMLImageElement|null}
   */
  getCurrentFrameImage() {
    const key = this.getCurrentFrameKey()
    const img = this.game.assets?.get?.(key)
    
    // Fallback：如果当前帧不存在，尝试第一帧
    if (!img) {
      const fallbackType = this._effectiveMoving ? 'WALK' : 'IDLE'
      const fallbackPad = this._effectiveMoving ? this.walkFramePad : this.idleFramePad
      const fallbackNum = this._effectiveMoving ? this.walkFrameOffset : this.idleFrameOffset
      const fallbackKey = `${this.assetPrefix}_${fallbackType}_${String(fallbackNum).padStart(fallbackPad, '0')}`
      return this.game.assets?.get?.(fallbackKey) || null
    }
    
    return img
  }
  
  /**
   * 获取静态头像图片（用于UI显示）
   * @returns {HTMLImageElement|null}
   */
  getAvatarImage() {
    // 尝试获取avatar字段指定的资源
    if (this.charData.avatar) {
      const img = this.game.assets?.get?.(this.charData.avatar)
      if (img) return img
    }
    
    // 尝试获取空闲第一帧
    const idleKey = `${this.assetPrefix}_IDLE_${String(this.idleFrameOffset).padStart(this.idleFramePad, '0')}`
    return this.game.assets?.get?.(idleKey) || null
  }
  
  /**
   * 判断是否需要翻转渲染
   */
  _shouldFlip() {
    if (this.flipRule === 'same') {
      return this.facingLeft // facingLeft=true 时翻转
    } else {
      return !this.facingLeft // facingLeft=false 时翻转
    }
  }
  
  /**
   * 渲染阴影
   */
  _renderShadow(ctx, screenX, screenY, renderWidth) {
    if (!this.shadow) return
    
    ctx.beginPath()
    ctx.ellipse(
      screenX,
      screenY + this.targetHeight / 2 + this.shadowOffset,
      renderWidth * this.shadowWidthRatio / 2,
      this.shadowHeight,
      0, 0, Math.PI * 2
    )
    ctx.fillStyle = this.shadowColor
    ctx.fill()
  }
  
  /**
   * 渲染角色（包含阴影）
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {number} screenX - 屏幕X坐标（角色中心点）
   * @param {number} screenY - 屏幕Y坐标（角色中心点）
   */
  render(ctx, screenX, screenY) {
    const frameImg = this.getCurrentFrameImage()
    if (!frameImg) return
    
    const dpr = this.dpr
    const targetHeight = this.targetHeight
    
    // 计算绘制尺寸
    const imgWidth = frameImg.width
    const imgHeight = frameImg.height
    const scale = targetHeight / imgHeight
    const renderWidth = imgWidth * scale
    const renderHeight = targetHeight
    
    // 绘制阴影
    this._renderShadow(ctx, screenX, screenY, renderWidth)
    
    // 绘制角色
    ctx.save()
    
    const shouldFlip = this._shouldFlip()
    
    if (shouldFlip) {
      ctx.translate(screenX, screenY)
      ctx.scale(-1, 1)
      ctx.drawImage(frameImg, -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight)
    } else {
      ctx.drawImage(frameImg, screenX - renderWidth / 2, screenY - renderHeight / 2, renderWidth, renderHeight)
    }
    
    ctx.restore()
  }
  
  /**
   * 渲染角色（不包含阴影，用于需要自定义阴影的场景）
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   * @param {number} screenX - 屏幕X坐标（角色中心点）
   * @param {number} screenY - 屏幕Y坐标（角色中心点）
   */
  renderCharacterOnly(ctx, screenX, screenY) {
    const frameImg = this.getCurrentFrameImage()
    if (!frameImg) return
    
    const targetHeight = this.targetHeight
    
    // 计算绘制尺寸
    const imgWidth = frameImg.width
    const imgHeight = frameImg.height
    const scale = targetHeight / imgHeight
    const renderWidth = imgWidth * scale
    const renderHeight = targetHeight
    
    // 绘制角色
    ctx.save()
    
    const shouldFlip = this._shouldFlip()
    
    if (shouldFlip) {
      ctx.translate(screenX, screenY)
      ctx.scale(-1, 1)
      ctx.drawImage(frameImg, -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight)
    } else {
      ctx.drawImage(frameImg, screenX - renderWidth / 2, screenY - renderHeight / 2, renderWidth, renderHeight)
    }
    
    ctx.restore()
  }
  
  // ==================== 战斗场景相关方法 ====================
  
  /**
   * 更新战斗中的动画状态（用于battle-scene）
   * @param {number} dt - 帧间隔（秒）
   */
  updateBattleAnimation(dt) {
    // 子类可重写此方法
    this.update(dt, false, this.facingLeft)
  }
  
  /**
   * 获取战斗中的渲染配置（用于battle-scene）
   * @returns {Object} 渲染配置
   */
  getBattleRenderConfig() {
    return {
      assetPrefix: this.assetPrefix,
      totalWalkFrames: this.totalWalkFrames,
      totalIdleFrames: this.totalIdleFrames,
      walkFrameOffset: this.walkFrameOffset,
      idleFrameOffset: this.idleFrameOffset,
      walkFramePad: this.walkFramePad,
      idleFramePad: this.idleFramePad,
      spriteType: this.spriteType
    }
  }
  
  /**
   * 获取角色数据（用于战斗计算）
   * @returns {Object} 角色数据
   */
  getCharData() {
    return this.charData
  }
  
  /**
   * 获取技能列表
   * @returns {Array} 技能列表
   */
  getSkills() {
    return this.charData.skills || []
  }
  
  /**
   * 获取属性值
   * @param {string} attr - 属性名（如 'maxHp', 'atk', 'def' 等）
   * @returns {number} 属性值
   */
  getAttribute(attr) {
    return this.charData[attr] || 0
  }
}
