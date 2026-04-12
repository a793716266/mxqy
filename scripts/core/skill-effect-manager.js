/**
 * skill-effect-manager.js - 技能特效管理器
 * 用于播放序列帧动画特效
 */

export class SkillEffectManager {
  constructor(game) {
    this.game = game
    this.effects = [] // 活动特效列表
  }

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
    const effect = {
      id: `effect_${Date.now()}_${Math.random()}`,
      type: config.type,
      x: config.x || 0,
      y: config.y || 0,
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
      images: images
    }

    this.effects.push(effect)
    
    console.log(`[SkillEffect] 创建特效: ${config.type}, 帧数: ${config.frameCount}`)
    
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
    }
    
    return images
  }

  /**
   * 获取特效资源前缀
   */
  _getEffectPrefix(type) {
    const typeMap = {
      'fireball_cast': 'EFFECT_FIREBALL_CAST',
      'fireball_hit': 'EFFECT_FIREBALL_HIT',
      'ice_shard_cast': 'EFFECT_ICE_SHARD_CAST',
      'ice_shard_hit': 'EFFECT_ICE_SHARD_HIT',
      'lightning_cast': 'EFFECT_LIGHTNING_CAST',
      'lightning_hit': 'EFFECT_LIGHTNING_HIT',
      'thunder': 'EFFECT_THUNDER',
      // 物理攻击命中特效（复用闪电击中帧作为通用打击效果）
      'slash_hit': 'EFFECT_LIGHTNING_HIT',
      'staff_strike_hit': 'EFFECT_LIGHTNING_HIT'
    }
    return typeMap[type] || type.toUpperCase()
  }

  /**
   * 更新所有特效
   * @param {number} dt - 时间增量（毫秒）
   */
  update(dt) {
    const toRemove = []

    for (const effect of this.effects) {
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
    for (const effect of this.effects) {
      if (!effect.isPlaying) continue
      if (!effect.images || effect.images.length === 0) continue
      // ★ 已被角色绑定的特效不再重复绘制（避免两套画面）
      if (effect._consumedByChar) continue

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
   * ★ 获取指定类型特效的当前帧图片（用于绑定到角色渲染）
   * 返回 null 表示没有匹配的活跃特效
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
   */
  consumeByCharacter(type) {
    for (const effect of this.effects) {
      if (effect.type === type && !effect._consumedByChar) {
        effect._consumedByChar = true
      }
    }
  }
}
