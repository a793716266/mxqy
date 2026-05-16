/**
 * sunny-grassland-bg.js - 阳光草原战斗背景生成器
 *
 * 功能说明：
 * 1. 使用城镇素材（草地/花朵）装饰战斗场景背景
 * 2. 根据战斗节点ID自动选择主题（目前只实现草原主题）
 * 3. 装饰元素固定在画面底部，不打扰战斗区域
 * 4. 支持调试日志，方便排查资源加载问题
 *
 * 使用素材（位于 /images/map/town/）：
 * - TOWN_GRASS.png  草地装饰
 * - TOWN_FLOWER1.png 花朵装饰1
 * - TOWN_FLOWER2.png 花朵装饰2
 * - TOWN_FLOWER3.png 花朵装饰3
 *
 * 性能优化说明：
 * - 渐变背景+装饰+遮罩整体缓存到单个离屏Canvas，每帧只需一次 drawImage
 * - 仅在 init 和 resize 时重建缓存，每帧零梯度计算、零循环
 *
 * 作者：技术美术
 * 日期：2026-05-10
 */

// ========== 背景装饰配置（模块级常量，只初始化一次） ==========
// 装饰元素固定在画面中下部（y坐标 0.72~0.88，即72%~88%高度）
// 这个范围确保装饰在战斗区域下方，且不会被屏幕底部截断
// scale: 1.0 = 原始大小，>1.0 放大，<1.0 缩小
const BG_DECORATIONS = {
  // 草原主题（节点1-2）：只使用草地和花朵
  grassland: [
    // 草地装饰（分布在画面底部，y: 0.74~0.86）
    { type: 'TOWN_GRASS',   x: 0.18, y: 0.12, scale: 0.5 },
    { type: 'TOWN_GRASS',   x: 0.23, y: 0.24, scale: 0.5 },
    { type: 'TOWN_GRASS',   x: 0.33, y: 0.33, scale: 0.5 },
    { type: 'TOWN_GRASS',   x: 0.35, y: 0.12, scale: 0.5 },
    { type: 'TOWN_GRASS',   x: 0.25, y: 0.55, scale: 0.5 },
    { type: 'TOWN_GRASS',   x: 0.45, y: 0.60, scale: 0.5 },

    // 花朵装饰（穿插在草地之间，y: 0.74~0.83）
    { type: 'TOWN_FLOWER1', x: 0.15, y: 0.12, scale: 0.5 },
    { type: 'TOWN_FLOWER2', x: 0.32, y: 0.22, scale: 0.5 },
    { type: 'TOWN_FLOWER3', x: 0.50, y: 0.33, scale: 0.5 },
    { type: 'TOWN_FLOWER1', x: 0.65, y: 0.21, scale: 0.5 },
    { type: 'TOWN_FLOWER2', x: 0.80, y: 0.32, scale: 0.5 },
  ],

  // 森林主题（节点3-4）：也只用草地+花朵（石头/树已移除）
  forest: [
    { type: 'TOWN_GRASS',   x: 0.10, y: 0.81, scale: 1.2 },
    { type: 'TOWN_GRASS',   x: 0.30, y: 0.85, scale: 1.0 },
    { type: 'TOWN_GRASS',   x: 0.55, y: 0.78, scale: 1.3 },
    { type: 'TOWN_GRASS',   x: 0.75, y: 0.83, scale: 1.1 },

    { type: 'TOWN_FLOWER1', x: 0.20, y: 0.77, scale: 0.9 },
    { type: 'TOWN_FLOWER3', x: 0.45, y: 0.84, scale: 0.8 },
    { type: 'TOWN_FLOWER2', x: 0.68, y: 0.79, scale: 1.0 },
  ],
}

// 已警告过的未加载资源集合（模块级，避免每次 install 重建）
const warnedAssets = new Set()

export function installBattleBackground(BattleSceneClass) {
  const proto = BattleSceneClass.prototype

  // ========== 初始化背景 ==========
  /**
   * 初始化战斗背景生成器
   * 在 BattleScene.init() 中调用
   */
  proto._initBattleBackground = function() {
    this._bgTheme = this._detectBattleTheme()
    // 构建背景缓存（渐变+装饰一次性绘制到离屏Canvas）
    this._buildBgCache()
  }

  // ========== 检测战斗主题 ==========
  /**
   * 根据节点ID检测应该使用的背景主题
   * @returns {string} 主题名称：'grassland' | 'forest'
   */
  proto._detectBattleTheme = function() {
    const nodeId = this.nodeId || 0
    if (nodeId <= 2) return 'grassland'
    if (nodeId <= 4) return 'forest'
    return 'grassland'
  }

  // ========== 创建离屏Canvas（兼容浏览器和微信小游戏） ==========
  /**
   * 根据运行环境创建离屏Canvas
   * 浏览器：document.createElement('canvas')
   * 微信小游戏：wx.createCanvas()
   */
  function createOffscreenCanvas(w, h) {
    let canvas
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas')
    } else if (typeof wx !== 'undefined' && wx.createCanvas) {
      canvas = wx.createCanvas()
    } else {
      // 兜底：创建一个最小canvas，避免崩溃
      console.error('[阳光草原背景] 无法创建离屏Canvas：未知环境')
      canvas = { getContext: () => null, width: w, height: h }
    }
    canvas.width = w
    canvas.height = h
    return canvas
  }

  // ========== 构建背景缓存（核心优化） ==========
  /**
   * 将整个静态背景绘制到离屏Canvas，每帧只需 drawImage 一次
   * 调用时机：
   *   - _initBattleBackground（初始化）
   *   - resize（画布尺寸变化）
   *   - 主题切换（节点变化）
   * 离屏Canvas尺寸 = 物理像素尺寸（width × height）
   */
  proto._buildBgCache = function() {
    const w = this.width
    const h = this.height
    const dpr = this.dpr
    const theme = this._bgTheme || 'grassland'

    // 创建离屏Canvas（兼容浏览器和微信小游戏）
    const offscreen = createOffscreenCanvas(w, h)
    const ctx = offscreen.getContext('2d')

    // ---- 步骤1：绘制渐变底色 ----
    let color1 = '#4a7c59'
    let color2 = '#3d6b4a'
    if (theme === 'forest') {
      color1 = '#2d5016'
      color2 = '#1a3a0a'
    }
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
    bgGrad.addColorStop(0, color1)
    bgGrad.addColorStop(1, color2)
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, h)

    // ---- 步骤2：绘制装饰元素（按y排序，保证正确遮挡） ----
    const decorations = BG_DECORATIONS[theme] || BG_DECORATIONS.grassland

    // 按 y 坐标升序排列（画家算法：先画远的/上面的，再画近的/下面的）
    const sorted = [...decorations].sort((a, b) => a.y - b.y)

    for (const deco of sorted) {
      const img = this.game.assets.get(deco.type)
      if (img && img.complete && img.naturalWidth > 0) {
        const drawX = w * deco.x
        const drawY = h * deco.y
        const drawW = img.width * deco.scale * dpr
        const drawH = img.height * deco.scale * dpr
        ctx.drawImage(img, drawX - drawW / 2, drawY - drawH / 2, drawW, drawH)
      } else if (!warnedAssets.has(deco.type)) {
        console.warn(`[阳光草原背景] 资源未加载: ${deco.type}`)
        warnedAssets.add(deco.type)
      }
    }

    // ---- 步骤3：顶部渐变遮罩 ----
    const topGrad = ctx.createLinearGradient(0, 0, 0, 60 * dpr)
    topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)')
    topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, w, 60 * dpr)

    // ---- 步骤4：底部渐变遮罩 ----
    const bottomGrad = ctx.createLinearGradient(0, h - 140 * dpr, 0, h)
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)')
    ctx.fillStyle = bottomGrad
    ctx.fillRect(0, h - 140 * dpr, w, 140 * dpr)

    // 保存缓存引用
    this._bgCacheCanvas = offscreen
  }

  // ========== 渲染战斗背景（每帧调用，极度简化） ==========
  /**
   * 渲染战斗背景——直接从离屏Canvas绘制，零梯度/零循环
   * @param {CanvasRenderingContext2D} ctx - 主画布 2D 上下文
   */
  proto._renderBattleBackground = function(ctx) {
    if (this._bgCacheCanvas) {
      ctx.drawImage(this._bgCacheCanvas, 0, 0)
    } else {
      // 缓存尚未构建（防御性编程），立即构建
      this._buildBgCache()
      if (this._bgCacheCanvas) ctx.drawImage(this._bgCacheCanvas, 0, 0)
    }
  }

  // ========== 重写 destroy：释放离屏Canvas，防止内存泄漏 ==========
  const originalDestroy = proto.destroy
  proto.destroy = function() {
    // 先释放离屏Canvas引用，帮助GC回收显存
    if (this._bgCacheCanvas) {
      this._bgCacheCanvas = null
    }
    // 调用原始 destroy
    if (typeof originalDestroy === 'function') {
      originalDestroy.call(this)
    }
  }

  // ========== 重写 resize：尺寸变化时重建缓存 ==========
  const originalResize = proto.resize
  proto.resize = function(w, h) {
    // 先调用原始 resize
    if (typeof originalResize === 'function') {
      originalResize.call(this, w, h)
    }
    // 重建背景缓存（尺寸变了，离屏Canvas需要重新绘制）
    if (this._bgCacheCanvas) {
      this._buildBgCache()
    }
  }
}
