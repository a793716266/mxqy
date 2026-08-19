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

    // ★ 受击状态：hurt_01=普通受击 hurt_02=被击飞；_hurtTimer 倒计时后切回 idle
    this._hurtVariant = 1
    this._hurtTimer = 0

    // ★ 移速倍率：走路/待机动画帧推进速率 = dt × _moveSpeedMult。
    //   由外部（场景）按角色实际移速写入（如被 slow 减速→<1，动画变慢消除滑步；
    //   加速 buff/装备→>1，动画变快）。攻击(attack)状态不乘此值，仍走 _atkSpeedMult。
    this._moveSpeedMult = 1

    // ★ 动画完成检测（用于 BUFF/技能动画播放完成后才应用效果）
    this._prevFrame = -1
    this._frameCount = 0
    this._totalFramesMap = {
      idle: config.totalIdleFrames || 8,
      walk: config.totalWalkFrames || 8,
      attack: config.totalAttackFrames || 8,
      shield: config.totalShieldFrames || 8,
      skill: config.totalSkillFrames || 8,
      buff: config.totalBuffFrames || 8,
      support: config.totalSupportFrames || 8
    }
    // ★ 各动画图片高度比例（用于统一角色显示大小）
    //   scaleCompensation = idle高度 / 该动画角色实际高度
    //   默认全 1.0，各角色在下方按需覆盖【自己】的项（切勿整表重新赋值，会冲掉其他角色的补偿）
    this._animScaleCompensation = {
      idle: 1.0, walk: 1.0, attack: 1.0, shield: 1.0, skill: 1.0, buff: 1.0, support: 1.0
    }

    // ★ zhenbao 的 skill 用 ATTACK 帧（SLASH 已弃用），需修正帧数
    if (this.spriteType === 'zhenbao') {
      this._totalFramesMap.skill = 8
      // ★ 臻宝普攻只播放 ATTACK 01~03（更跟手、打击感更利落），不影响技能(skill=8帧)
      this._totalFramesMap.attack = 3
      // idle/walk/attack=337px, shield=232px, buff=380px(角色仅占64%)
      this._animScaleCompensation.shield = 337 / 232        // shield 图片矮，放大
      this._animScaleCompensation.buff = 337 / (380 * 0.64) // buff 角色仅占64%，补偿
    }
    this.onAnimationComplete = null  // 回调函数，参数是动画类型

    // ★ 李小宝 cast 精灵表（attack 普攻复用 cast_universal.png，8帧横排）
    //   战斗场景已统一使用此精灵表，野外副本/主地图的 CharacterSprite 渲染也复用，
    //   保证李小宝攻击动画与正规战斗一致（而非复用 walk/idle 帧）
    //   注意：分包资源可能在构造时尚未加载，故延迟到首次渲染时再取（见 _getCastSheet）
    this._castSheet = null
    this._castSheetTried = false
    this._castTotalFrames = 8
    this._castFrameW = 0
    this._castFrameH = 0
    if (this.spriteType === 'lixiaobao') {
      // ★ 李小宝 cast 精灵表单帧高(223)小于 idle 帧高(337)，若直接按比例缩放会显示变小，
      //   故用补偿系数把 cast 动画显示高度拉回与 idle 一致（同 zhenbao shield 补偿机制）
      //   仅对李小宝生效，避免影响臻宝等其他角色的 attack 尺寸
      this._animScaleCompensation.attack = 337 / 223
    }
  }

  /**
   * 延迟获取李小宝 cast 精灵表（分包资源可能晚于构造时加载）
   * @returns {HTMLImageElement|null}
   */
  _getCastSheet() {
    if (this._castSheetTried) return this._castSheet
    this._castSheetTried = true
    if (this.spriteType === 'lixiaobao') {
      const sheet = this.game.assets?.get?.('LIXIAOBAO_CAST_SPRITESHEET') || null
      if (sheet && sheet.width) {
        this._castSheet = sheet
        this._castTotalFrames = 8
        this._castFrameW = Math.floor(sheet.width / this._castTotalFrames)
        this._castFrameH = sheet.height
      }
    }
    return this._castSheet
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
    // ★ 受击状态：保持 pose 不推进帧，倒计时结束后切回 idle
    if (this.state === 'hurt') {
      if (facingLeft !== undefined) this.facingLeft = facingLeft
      this._hurtTimer -= dt
      if (this._hurtTimer <= 0) {
        this.state = 'idle'
        this.animFrame = 0
        this._hurtVariant = 1
      }
      return
    }

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
    // ★ 攻速：仅普攻(attack)状态按攻速倍率加速挥砍动画（狂暴+60%攻速→挥砍更快）
    // ★ 移速：walk/idle 等非战斗状态按 _moveSpeedMult 缩放（实际移速变慢则动画变慢，消除滑步）
    const _spd = (this.state === 'attack') ? (this._atkSpeedMult || 1) : (this._moveSpeedMult || 1)
    this.animTimer += dt * _spd
    if (this.animTimer >= this.frameDuration) {
      this.animTimer = 0

      // ★ 战斗状态（attack/shield/skill/buff）期间强制不移动，保证动画正常播放完成
      const battleStates = ['attack', 'shield', 'skill', 'buff', 'support']
      const inBattleAnim = battleStates.includes(this.state)
      const effectiveMoving = inBattleAnim ? false : this._effectiveMoving
      const totalFrames = effectiveMoving ? this.totalWalkFrames : this.totalIdleFrames
      const nextFrame = (this.animFrame + 1) % totalFrames

      // ★ 检测战斗动画完成
      if (!effectiveMoving) {
        if (inBattleAnim) {
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

    // ★ 受击状态：直接返回对应 hurt 变体帧（hurt_01 普通受击 / hurt_02 被击飞）
    if (this.state === 'hurt') {
      const frameStr = String(this._hurtVariant || 1).padStart(2, '0')
      return `${prefix}_HURT_${frameStr}`
    }

    // ★ 战斗状态（attack/shield/skill/buff）期间，即使移动也优先返回对应动画帧，
    //    防止移动/其他动画改变正在播放的技能动画
    const battleStates = ['attack', 'shield', 'skill', 'buff', 'support']
    const inBattleAnim = battleStates.includes(this.state)
    if (inBattleAnim || (!this._effectiveMoving && (this.state === 'attack' || this.state === 'shield' || this.state === 'skill' || this.state === 'buff'))) {
      const total = this._totalFramesMap[this.state] || 8
      const frameNum = (this.animFrame % total) + 1  // 从 01 开始
      const frameStr = String(frameNum).padStart(2, '0')

      // zhenbao 各状态对应的动画帧：
      // - attack（普攻）→ ATTACK（8帧轻攻击）
      // - shield（盾击）→ SHIELD（8帧盾牌攻击）
      // - skill（攻击型技能）→ ATTACK（8帧，SLASH 已弃用）
      // - buff（增益技能）→ BUFF（8帧）
      if (this.spriteType === 'zhenbao') {
        const actionMap = { attack: 'ATTACK', shield: 'SHIELD', skill: 'ATTACK', buff: 'BUFF' }
        const action = actionMap[this.state]
        if (action) return `${prefix}_${action}_${frameStr}`
      }

      // 其他角色：统一用 ATTACK 帧（无资源时 getCurrentFrameImage 会 fallback 到 idle）
      return `${prefix}_ATTACK_${frameStr}`
    }

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
   * 获取当前帧的缩放补偿系数
   * ★ 补偿必须与"实际绘制的图"对应：李小宝的 attack 补偿(337/223)只在真正使用 cast 精灵表时才成立；
   *   若精灵表未加载而回退到 idle/walk 帧(337px)，再乘补偿会导致显示过大，故此处按帧类型判定。
   * @param {Object|HTMLImageElement} frameImg 当前帧
   * @returns {number} 补偿系数
   */
  _getScaleCompensation(frameImg) {
    if (!this._animScaleCompensation) return 1.0
    // ★ 李小宝战斗施法状态都用 cast 精灵表（337/223 补偿）；
    //   若精灵表未加载而回退到 idle/walk 帧(337px)，不套用补偿，避免显示过大
    const lxbCastStates = ['attack', 'skill', 'buff', 'shield']
    if (this.spriteType === 'lixiaobao' && lxbCastStates.includes(this.state)) {
      return (frameImg && frameImg._isSpriteSheet) ? this._animScaleCompensation.attack : 1.0
    }
    return this._animScaleCompensation[this.state] || 1.0
  }

  /**
   * 获取当前动画帧图片
   * @returns {HTMLImageElement|Object|null} HTMLImageElement 或精灵表裁切对象（含 _isSpriteSheet）
   */
  getCurrentFrameImage() {
    // ★ 李小宝所有战斗施法状态（普攻attack/技能skill/增益buff/盾击shield）统一使用
    //   cast_universal.png 精灵表（8帧横排），与正规战斗一致。
    //   否则 skill/buff/shield 会请求不存在的 HERO_LIXIAOBAO_ATTACK_XX 资源而 fallback 到 idle，
    //   导致技能动画"丢失"（放技能时显示待机帧）。
    const castSheet = this._getCastSheet()
    const lxbCastStates = ['attack', 'skill', 'buff', 'shield']
    if (this.spriteType === 'lixiaobao' && lxbCastStates.includes(this.state) && castSheet) {
      const idx = this.animFrame % this._castTotalFrames
      return {
        _isSpriteSheet: true,
        _sheet: castSheet,
        _sx: idx * this._castFrameW,
        _sy: 0,
        _sw: this._castFrameW,
        _sh: this._castFrameH,
        width: this._castFrameW,
        height: this._castFrameH
      }
    }

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
    const targetHeight = this.targetHeight

    // ★ 先初始化基准高度（idle 帧），再取当前帧图片，保证精灵表对象的逻辑尺寸一致
    if (!this._baseImgHeight) {
      const idleKey = `${this.assetPrefix}_IDLE_${String(this.idleFrameOffset).padStart(this.idleFramePad, '0')}`
      const idleImg = this.game.assets?.get?.(idleKey)
      this._baseImgHeight = idleImg ? idleImg.height : 337
    }

    const frameImg = this.getCurrentFrameImage()
    if (!frameImg) return

    // 补偿系数（默认 1.0，zhenbao/lixiaobao 等有预设值，用于修正动画留白差异导致的显示大小不一）
    const comp = this._getScaleCompensation(frameImg)
    const scale = (targetHeight / this._baseImgHeight) * comp
    const renderWidth = frameImg.width * scale
    const renderHeight = frameImg.height * scale

    // 绘制阴影（用 targetHeight 定位）
    this._renderShadow(ctx, screenX, screenY, renderWidth)

    // 绘制角色：脚部对齐 screenY + targetHeight/2
    const footY = screenY + this.targetHeight / 2
    const drawY = footY - renderHeight

    ctx.save()
    const shouldFlip = this._shouldFlip()

    if (shouldFlip) {
      ctx.translate(screenX, footY)
      ctx.scale(-1, 1)
      if (frameImg._isSpriteSheet) {
        ctx.drawImage(frameImg._sheet, frameImg._sx, frameImg._sy, frameImg._sw, frameImg._sh, -renderWidth / 2, -renderHeight, renderWidth, renderHeight)
      } else {
        ctx.drawImage(frameImg, -renderWidth / 2, -renderHeight, renderWidth, renderHeight)
      }
    } else {
      if (frameImg._isSpriteSheet) {
        ctx.drawImage(frameImg._sheet, frameImg._sx, frameImg._sy, frameImg._sw, frameImg._sh, screenX - renderWidth / 2, drawY, renderWidth, renderHeight)
      } else {
        ctx.drawImage(frameImg, screenX - renderWidth / 2, drawY, renderWidth, renderHeight)
      }
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

    // ★ 与 render 一致的缩放逻辑（含补偿系数）
    if (!this._baseImgHeight) {
      const idleKey = `${this.assetPrefix}_IDLE_${String(this.idleFrameOffset).padStart(this.idleFramePad, '0')}`
      const idleImg = this.game.assets?.get?.(idleKey)
      this._baseImgHeight = idleImg ? idleImg.height : frameImg.height
    }

    const comp = this._getScaleCompensation(frameImg)
    const scale = (targetHeight / this._baseImgHeight) * comp
    const renderWidth = frameImg.width * scale
    const renderHeight = frameImg.height * scale

    const footY = screenY + this.targetHeight / 2
    const drawY = footY - renderHeight
    
    ctx.save()
    
    const shouldFlip = this._shouldFlip()
    
    if (shouldFlip) {
      ctx.translate(screenX, footY)
      ctx.scale(-1, 1)
      if (frameImg._isSpriteSheet) {
        ctx.drawImage(frameImg._sheet, frameImg._sx, frameImg._sy, frameImg._sw, frameImg._sh, -renderWidth / 2, -renderHeight, renderWidth, renderHeight)
      } else {
        ctx.drawImage(frameImg, -renderWidth / 2, -renderHeight, renderWidth, renderHeight)
      }
    } else {
      if (frameImg._isSpriteSheet) {
        ctx.drawImage(frameImg._sheet, frameImg._sx, frameImg._sy, frameImg._sw, frameImg._sh, screenX - renderWidth / 2, drawY, renderWidth, renderHeight)
      } else {
        ctx.drawImage(frameImg, screenX - renderWidth / 2, drawY, renderWidth, renderHeight)
      }
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
