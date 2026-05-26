/**
 * renderer-2.5d.js — 2.5D伪3D Y轴排序渲染引擎
 *
 * 所有地图场景（小镇/阳光草原/未来新地图）共用此引擎。
 * 核心原理：
 *   1. 将所有参与前后遮挡的实体收集到一个数组
 *   2. 按 (layer, sortY) 排序 — layer小的先画，同layer按sortY升序
 *   3. 排序后统一绘制 → 产生"前面遮挡后面"的伪3D效果
 *
 * 层级设计：
 *   layer=0  装饰物（草/花）— 始终最底层
 *   layer=2  障碍物/NPC/怪物/玩家 — 全部按底部Y坐标排序
 *
 * 使用方式：
 *   const engine = new Renderer2D5({ dpr, width, height })
 *   engine.setCamera(camX, camY)
 *   engine.setAssets(game.assets)
 *   engine.beginFrame()
 *   engine.addDecoration(mapObj)       // 装饰物自动layer=0
 *   engine.addObstacle(mapObj)          // 障碍物自动layer=2
 *   engine.addNPC(npcData, screenPos)   // NPC自动layer=2
 *   engine.addMonster(monster, sx, sy)  // 怪物自动layer=2
 *   engine.addPlayer(renderFn)          // 玩家自动layer=2
 *   engine.render(ctx)                  // 排序+绘制一步完成
 */

export class Renderer2D5 {
  constructor(options = {}) {
    /** @type {number} 设备像素比 */
    this.dpr = options.dpr || 1
    /** @type {number} 屏幕宽度（物理像素） */
    this.width = options.width || 0
    /** @type {number} 屏幕高度（物理像素） */
    this.height = options.height || 0
    /** @type {number} 相机X（物理像素） */
    this.cameraX = 0
    /** @type {number} 相机Y（物理像素） */
    this.cameraY = 0
    /** @type {Object|null} 资源管理器（需有 .get(key) 方法） */
    this.assets = null
    /** @type {Array<RenderEntity>} 实体列表（每帧重建） */
    this._entities = []
  }

  // ─── 配置方法 ───────────────────────────────

  /** 更新相机位置（每帧调用） */
  setCamera(x, y) {
    this.cameraX = x
    this.cameraY = y
  }

  /** 绑定资源管理器 */
  setAssets(assets) {
    this.assets = assets
  }

  /** 清空实体列表（每帧 beginFrame 时调用） */
  clear() {
    this._entities.length = 0
  }

  // ─── 实体添加便捷方法 ──────────────────────

  /**
   * 添加装饰物（草、花等）— layer=0 始终最底
   * @param {Object} obj  地图对象 { x, y, width, height, w, h, assetKey }
   *                       坐标为逻辑像素（自动 × dpr），或设 dprScale=false 跳过
   * @param {{ dprScale?: boolean }} [opts]
   */
  addDecoration(obj, opts = {}) {
    const scale = opts.dprScale !== false ? this.dpr : 1
    if (!this.assets) return
    const img = this.assets.get(obj.assetKey)
    if (!img) return

    const screenX = obj.x * scale - this.cameraX
    const screenY = obj.y * scale - this.cameraY
    const w = (obj.w || obj.width || img.width) * scale
    const h = (obj.h || obj.height || img.height) * scale

    if (this._outOfView(screenX, screenY, w, h, 50)) return

    this._entities.push({
      layer: opts.layer !== undefined ? opts.layer : 0,
      sortY: opts.sortY !== undefined ? opts.sortY : 0,
      type: 'decoration',
      _img: img, _sx: screenX, _sy: screenY, _w: w, _h: h,
      _rotation: obj.rotation || 0,
    })
  }

  /**
   * 添加障碍物（树、建筑、石块）— layer=2 参与Y排序
   * @param {Object} obj  同上
   * @param {{ dprScale?: boolean, name?: string }} [opts]
   */
  addObstacle(obj, opts = {}) {
    const scale = opts.dprScale !== false ? this.dpr : 1
    if (!this.assets) return
    const img = this.assets.get(obj.assetKey)
    if (!img) return

    const screenX = obj.x * scale - this.cameraX
    const screenY = obj.y * scale - this.cameraY
    const w = (obj.w || obj.width || img.width) * scale
    const h = (obj.h || obj.height || img.height) * scale

    if (this._outOfView(screenX, screenY, w, h, 100)) return

    this._entities.push({
      layer: opts.layer !== undefined ? opts.layer : 2,
      sortY: opts.sortY !== undefined ? opts.sortY : (obj.y * scale / this.dpr) + (obj.h || obj.height || 80),
      type: 'obstacle',
      name: opts.name || obj.name,
      _img: img, _sx: screenX, _sy: screenY, _w: w, _h: h,
      _rotation: obj.rotation || 0,
    })
  }

  /**
   * 添加NPC — layer=2
   * @param {Object} npc       NPC数据对象
   * @param {{x:number,y:number}} screenPos  屏幕坐标
   * @param {Object} [extra]    额外渲染参数 { nearbyNPC, dpr }
   */
  addNPC(npc, screenPos, extra = {}) {
    if (this._outOfView(screenPos.x, screenPos.y, 0, 0, 100)) return

    this._entities.push({
      layer: 2,
      sortY: (npc.y / this.dpr) + 30,
      type: 'npc',
      _npc: npc, _sx: screenPos.x, _sy: screenPos.y, _extra: extra,
    })
  }

  /**
   * 添加怪物 — layer=2
   * @param {Object} monster 怪物数据
   * @param {number} sx      屏幕X
   * @param {number} sy      屏幕Y
   */
  addMonster(monster, sx, sy) {
    if (this._outOfView(sx, sy, 0, 0, 100)) return

    this._entities.push({
      layer: 2,
      sortY: (monster.y / this.dpr) + 40,
      type: 'monster',
      _monster: monster, _sx: sx, _sy: sy,
    })
  }

  /**
   * 添加玩家（主角+队友整体）— layer=2
   * sortY 由调用方指定，通常为 playerY/dpr + 偏移
   * @param {number} sortY     排序用的Y值
   * @param {Function} renderFn 绘制回调 (ctx) => void
   */
  addPlayer(sortY, renderFn) {
    this._entities.push({
      layer: 2,
      sortY,
      type: 'player',
      _renderFn: renderFn,
    })
  }

  /**
   * 添加宝箱/交互物 — layer=2
   * @param {Object} obj  { x, y, collected }
   * @param {number} sx   屏幕X
   * @param {number} sy   屏幕Y
   */
  addChest(obj, sx, sy) {
    if (obj.collected) return
    if (this._outOfView(sx, sy, 0, 0, 50)) return

    this._entities.push({
      layer: 2,
      sortY: obj.y,
      type: 'chest',
      _sx: sx, _sy: sy,
    })
  }

  // ─── 低级别接口（高级用户）───────────────────

  /**
   * 直接添加原始实体（完全自定义）
   * @param {{ layer:number, sortY:number, type:string, render:(ctx)=>void }} entity
   */
  addEntity(entity) {
    this._entities.push(entity)
  }

  // ─── 核心：排序 + 绘制 ───────────────────────

  /**
   * 执行渲染
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ renderNPC?:(ctx,npc,sx,sy,extra)=>void,
   *           renderMonster?:(ctx,monster,sx,sy)=>void,
   *           renderChest?:(ctx,sx,sy)=>void }} [hooks]
   *   自定义渲染钩子 — 如果不提供则使用内置默认绘制
   */
  render(ctx, hooks = {}) {
    // 排序：layer 升序 → 同层 sortY 升序
    this._entities.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer
      return a.sortY - b.sortY
    })

    // 绘制（player 类型只画一次，防止重复）
    let playerRendered = false
    for (const e of this._entities) {
      switch (e.type) {
        case 'decoration':
        case 'obstacle':
          if (e._rotation) {
            ctx.save()
            ctx.translate(e._sx + e._w / 2, e._sy + e._h / 2)
            ctx.rotate(e._rotation * Math.PI / 180)
            ctx.drawImage(e._img, -e._w / 2, -e._h / 2, e._w, e._h)
            ctx.restore()
          } else {
            ctx.drawImage(e._img, e._sx, e._sy, e._w, e._h)
          }
          break

        case 'npc':
          if (hooks.renderNPC) {
            hooks.renderNPC(ctx, e._npc, e._sx, e._sy, e._extra)
          } else {
            this._defaultRenderNPC(ctx, e._npc, e._sx, e._sy, e._extra)
          }
          break

        case 'monster':
          if (hooks.renderMonster) {
            hooks.renderMonster(ctx, e._monster, e._sx, e._sy)
          } else {
            console.warn('[Renderer2D5] monster 未提供 renderMonster 钩子')
          }
          break

        case 'chest':
          if (hooks.renderChest) {
            hooks.renderChest(ctx, e._sx, e._sy)
          } else {
            ctx.font = `${24 * this.dpr}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('📦', e._sx, e._sy)
          }
          break

        case 'player':
          if (!playerRendered && e._renderFn) {
            e._renderFn(ctx)
            playerRendered = true
          }
          break

        default:
          // 自定义类型：如果有 render 方法则调用
          if (typeof e.render === 'function') {
            e.render(ctx, e)
          }
          break
      }
    }
  }

  // ─── 内置默认渲染 ───────────────────────────

  /** 默认NPC绘制（小镇场景用） */
  _defaultRenderNPC(ctx, npc, sx, sy, extra) {
    const dpr = extra.dpr || this.dpr

    // 互动范围指示
    if (extra.nearbyNPC === npc) {
      ctx.beginPath()
      ctx.arc(sx, sy, npc.interactionRadius, 0, Math.PI * 2)
      ctx.fillStyle = `${npc.color}33`
      ctx.fill()
    }

    // 图标
    ctx.font = `${40 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(npc.sprite, sx, sy)

    // 名称标签
    ctx.font = `bold ${14 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.strokeText(npc.name, sx, sy - 35 * dpr)
    ctx.fillText(npc.name, sx, sy - 35 * dpr)
  }

  // ─── 内部工具 ────────────────────────────────

  /**
   * 视野裁剪判断
   * @private
   */
  _outOfView(sx, sy, w, h, margin) {
    if (w === 0 && h === 0) {
      return sx < -margin || sx > this.width + margin ||
             sy < -margin || sy > this.height + margin
    }
    return sx + w < -margin || sx > this.width + margin ||
           sy + h < -margin || sy > this.height + margin
  }
}
