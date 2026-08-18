/**
 * skill-effect-manager.js - 技能特效管理器
 * 用于播放序列帧动画特效
 */

export class SkillEffectManager {
  constructor(game) {
    this.game = game
    this.effects = [] // 活动特效列表
  }

  // ★ 包含完整角色图像的 cast 特效类型——这些特效不能由 effects.render() 独立绘制
  // （因为尺寸/位置与角色精灵不匹配），只能通过角色渲染管线（getCurrentFrame）绘制
  static CAST_BODY_TYPES = new Set([
    'fireball_cast', 'ice_shard_cast', 'lightning_cast', 'cast_atk'
  ])

  /**
   * 创建技能特效
   * @param {Object} config - 特效配置
   * @param {string} config.type - 特效类型（fireball_cast, ice_shard等）
   * @param {number} config.x - X坐标
   * @param {number} config.y - Y坐标
   * @param {number} config.frameCount - 总帧数
   * @param {number} config.frameDuration - 每帧持续时间（毫秒）
   * @param {boolean} config.loop - 是否循环
   * @param {number} config.scale - 缩放比例
   * @param {Function} config.onComplete - 完成回调
   * @param {Function} config.onFrameChange - 帧变化回调
   */
  createEffect(config) {
    const images = this._getEffectImages(config.type)
    // ★ cast 类型特效：直接标记 _consumedByChar，阻止 effects.render() 独立绘制
    // 这些特效包含完整角色图像，只能通过角色渲染管线绘制（getCurrentFrame）
    const isCastBody = SkillEffectManager.CAST_BODY_TYPES.has(config.type)
    const effect = {
      id: `effect_${Date.now()}_${Math.random()}`,
      type: config.type,
      x: config.x || 0,
      y: config.y || 0,
      // ★ 世界坐标锚定（可选）：设置后由渲染端每帧减去相机重投影，
      //   使特效始终钉在目标世界位置（如落雷闪光跟随怪物），不受相机滚动影响
      worldX: (config.worldX !== undefined) ? config.worldX : undefined,
      worldY: (config.worldY !== undefined) ? config.worldY : undefined,
      frameCount: images.length, // 使用实际加载的帧数
      currentFrame: 0,
      frameDuration: config.frameDuration || 50, // 默认50ms一帧（20fps）
      loop: config.loop || false,
      scale: config.scale || 1,
      alpha: config.alpha || 1,
      rotation: config.rotation || 0,
      elapsedTime: 0,
      isPlaying: true,
      onComplete: config.onComplete,
      onFrameChange: config.onFrameChange,
      images: images,
      _consumedByChar: isCastBody  // ★ cast 类型直接标记，避免 effects.render() 绘制
    }

    this.effects.push(effect)
    
    console.log(`[SkillEffect] 创建特效: ${config.type}, 帧数: ${effect.frameCount}, cast绑定: ${isCastBody}`)
    
    return effect.id
  }

  /**
   * 获取特效的所有帧图片
   * 自动从已加载的资源中按前缀匹配所有帧
   */
  _getEffectImages(type, frameCount) {
    const images = []
    const prefix = this._getEffectPrefix(type)
    
    // 从已加载的资源中按前缀收集所有匹配的帧
    const allImages = this.game.assets.images
    const frameKeys = Object.keys(allImages)
      .filter(key => key.startsWith(prefix + '_'))
      .sort()
    
    for (const key of frameKeys) {
      const img = allImages[key]
      if (img) {
        images.push(img)
      }
    }
    
    if (images.length === 0) {
      console.warn(`[SkillEffect] 找不到特效帧: ${prefix}_*`)
      return images
    }
    
    // ★ frameCount 参数：限制返回帧数，支持截断动画片段
    if (frameCount !== undefined && frameCount > 0) {
      return images.slice(0, frameCount)
    }
    
    return images
  }

  /**
   * 获取特效资源前缀
   */
  _getEffectPrefix(type) {
    if (!type) return 'EFFECT_SLASH'   // ★ null/undefined防御
    const typeMap = {
      'fireball_cast': 'EFFECT_FIREBALL_CAST',
      'fireball_hit': 'EFFECT_FIREBALL_HIT',
      'ice_shard_cast': 'EFFECT_ICE_SHARD_CAST',
      'ice_shard_hit': 'EFFECT_ICE_SHARD_HIT',
      'lightning_cast': 'EFFECT_LIGHTNING_CAST',
      'lightning_hit': 'EFFECT_LIGHTNING_HIT',
      'thunder': 'EFFECT_THUNDER',
      // 李小宝法杖普攻施法（已统一为 cast_universal 精灵表）
      'cast_atk': null,
      // 物理攻击命中特效（复用闪电击中帧作为通用打击效果）
      'slash_hit': 'EFFECT_LIGHTNING_HIT',
      'staff_strike_hit': 'EFFECT_LIGHTNING_HIT'
    }
    if (typeMap[type] === undefined) {
      console.warn(`[SkillEffect] _getEffectPrefix: 未知特效类型 '${type}'，将使用 type.toUpperCase() 作为前缀`)
    }
    return typeMap[type] || (type ? type.toUpperCase() : 'EFFECT_SLASH')
  }

  /**
   * 更新所有特效
   * @param {number} dt - 时间增量（毫秒）
   */
  update(dt) {
    const toRemove = []
    const effects = this.effects || []

    for (const effect of effects) {
      if (!effect.isPlaying) continue

      // 更新时间
      effect.elapsedTime += dt

      // 检查是否需要切换帧
      const targetFrame = Math.floor(effect.elapsedTime / effect.frameDuration)
      
      if (targetFrame !== effect.currentFrame) {
        effect.currentFrame = targetFrame
        
        // 触发帧变化回调
        if (effect.onFrameChange) {
          effect.onFrameChange(effect.currentFrame, effect)
        }
      }

      // 检查是否播放完成
      if (effect.currentFrame >= effect.frameCount) {
        if (effect.loop) {
          // 循环播放
          effect.currentFrame = 0
          effect.elapsedTime = 0
        } else {
          // 播放完成
          effect.isPlaying = false
          toRemove.push(effect.id)
          
          // 触发完成回调
          if (effect.onComplete) {
            effect.onComplete(effect)
          }
        }
      }
    }

    // 移除已完成的特效
    for (const id of toRemove) {
      this.removeEffect(id)
    }
  }

  /**
   * 渲染所有特效
   * @param {CanvasRenderingContext2D} ctx - Canvas上下文
   */
  render(ctx) {
    const effects = this.effects || []
    for (const effect of effects) {
      if (!effect.isPlaying) continue
      if (!effect.images || effect.images.length === 0) continue
      // ★ 已被角色绑定的特效不再重复绘制（避免两套画面）
      if (effect._consumedByChar) continue
      // ★ 已被场景 2.5D Y 排序渲染的特效不再重复绘制（避免两套画面）
      if (effect._ySorted) continue

      const currentImage = effect.images[effect.currentFrame]
      if (!currentImage) continue

      ctx.save()
      
      // 设置透明度
      ctx.globalAlpha = effect.alpha

      // 移动到特效位置
      ctx.translate(effect.x, effect.y)

      // 旋转
      if (effect.rotation !== 0) {
        ctx.rotate(effect.rotation)
      }

      // 渲染尺寸：原始像素 × scale（特效图片已是高分辨率，直接缩放即可）
      const width = currentImage.width * effect.scale
      const height = currentImage.height * effect.scale

      // 绘制特效（居中）
      ctx.drawImage(
        currentImage,
        -width / 2,
        -height / 2,
        width,
        height
      )

      ctx.restore()
    }
  }

  /**
   * 移除特效
   * @param {string} effectId - 特效ID
   */
  removeEffect(effectId) {
    const index = this.effects.findIndex(e => e.id === effectId)
    if (index !== -1) {
      this.effects.splice(index, 1)
      console.log(`[SkillEffect] 移除特效: ${effectId}`)
    }
  }

  /**
   * 停止特效
   * @param {string} effectId - 特效ID
   */
  stopEffect(effectId) {
    const effect = this.effects.find(e => e.id === effectId)
    if (effect) {
      effect.isPlaying = false
    }
  }

  /**
   * 暂停特效
   * @param {string} effectId - 特效ID
   */
  pauseEffect(effectId) {
    const effect = this.effects.find(e => e.id === effectId)
    if (effect) {
      effect.isPlaying = false
    }
  }

  /**
   * 恢复特效
   * @param {string} effectId - 特效ID
   */
  resumeEffect(effectId) {
    const effect = this.effects.find(e => e.id === effectId)
    if (effect) {
      effect.isPlaying = true
    }
  }

  /**
   * 清除所有特效
   */
  clear() {
    this.effects = []
  }

  /**
   * 获取活动的特效数量
   */
  getActiveCount() {
    return this.effects.filter(e => e.isPlaying).length
  }

  /**
   * ★ 播放施法特效（便捷方法，供战斗系统调用）
   * 创建一个 cast 类型特效，播放完毕后自动回调 onComplete
   * @param {string} effectType - 特效类型（如 'fireball', 'ice_shard', 'thunder'）
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} dpr - 设备像素比（用于计算缩放）
   * @param {Function} onComplete - 播放完成回调
   * @returns {string} effectId
   */
  playCastEffect(effectType, x, y, dpr, onComplete) {
    const castType = effectType + '_cast'
    // 如果没有对应的前缀映射，尝试直接用 effectType
    const testPrefix = this._getEffectPrefix(castType)
    const hasImages = this._getEffectImages(testPrefix).length > 0
    const actualType = hasImages ? castType : effectType

    console.log(`[SkillEffect] playCastEffect: type=${effectType}, castType=${castType}, 实际使用=${actualType}`)

    const effectId = this.createEffect({
      type: actualType,
      x, y,
      scale: dpr > 1 ? 1.5 : 1,
      frameDuration: 250,   // 250ms/帧 × 8帧 = 2秒完整施法动画
      onComplete: () => {
        if (onComplete) onComplete()
      }
    })
    return effectId
  }

  /**
   * ★ 播放命中特效（便捷方法，供战斗系统调用）
   * 创建一个 hit 类型特效，用于攻击命中时的视觉反馈
   * @param {string} effectType - 特效类型（如 'fireball_impact', 'physical_impact'）
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} dpr - 设备像素比
   * @param {Function} onComplete - 可选完成回调
   */
  playHitEffect(effectType, x, y, dpr, onComplete, opts) {
    // 命中特效类型映射
    const hitTypeMap = {
      'magic_impact': 'lightning_hit',
      'heal_impact': 'lightning_hit',
      'fire_impact': 'fireball_hit',
      'ice_impact': 'ice_shard_hit',
      'physical_impact': 'slash_hit'
    }
    const mappedType = hitTypeMap[effectType] || effectType || 'slash_hit'

    // ★ world:true 时 x/y 当作世界坐标，特效锚定到世界位置（每帧随相机重投影）
    const useWorld = !!(opts && opts.world)
    const effectId = this.createEffect({
      type: mappedType,
      x: useWorld ? 0 : x,
      y: useWorld ? 0 : y,
      worldX: useWorld ? x : undefined,
      worldY: useWorld ? y : undefined,
      scale: dpr > 1 ? 1.2 : 1,
      frameDuration: 40,
      loop: false,
      onComplete
    })
    return effectId
  }

  /**
   * ★ 获取指定类型特效的当前帧图片（用于绑定到角色渲染）
   * 返回 null 表示没有匹配的活跃特效
   * 注意：不检查 _consumedByChar 标记——consumed 只影响 effects.render() 是否绘制，
   *       不影响 getCurrentFrame 的查找（角色渲染管线需要每帧都获取当前帧）
   */
  getCurrentFrame(type) {
    const effect = this.effects.find(e => e.isPlaying && e.type === type)
    if (!effect || !effect.images || effect.images.length === 0) return null
    const idx = Math.min(effect.currentFrame, effect.images.length - 1)
    return {
      image: effect.images[idx],
      frameIndex: effect.currentFrame,
      totalFrames: effect.frameCount,
      isPlaying: effect.isPlaying,
      scale: effect.scale
    }
  }

  /**
   * ★ 标记指定类型的特效为"已被角色消耗"（render时跳过）
   * 用于施法动画绑定：特效帧已作为角色图像画过一次，不需要再叠一层
   * ⚠️ 只消耗仍在播放的特效，避免误标记已结束但尚未移除的过期特效
   */
  consumeByCharacter(type) {
    for (const effect of this.effects) {
      if (effect.isPlaying && effect.type === type && !effect._consumedByChar) {
        effect._consumedByChar = true
      }
    }
  }
}
