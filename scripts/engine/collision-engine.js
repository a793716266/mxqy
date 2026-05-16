/**
 * collision-engine.js — 统一物理碰撞引擎
 *
 * 所有场景共用此引擎，消除各场景各自实现的不一致和重复代码。
 *
 * 核心能力：
 *   1. 静态障碍物碰撞检测（点/圆 vs 矩形/圆形）
 *   2. 动态单位间碰撞分离（多轮迭代推开）
 *   3. 战场边界钳制
 *   4. 调试可视化（红边=碰撞圆，绿框=边界）
 *
 * 坐标系约定（全项目统一）：
 *   - 视觉中心 (cx, cy) = 角色图片绘制中心
 *   - 脚底位置 (cx, cy + footOffsetY) = 碰撞圆心
 *   - 所有碰撞检测基于脚底位置
 *
 * 使用方式：
 *   const engine = new CollisionEngine({ dpr })
 *
 *   // 静态障碍物（field/town 场景）
 *   engine.setObstacles(collisionDataArray)
 *   if (engine.checkStaticCollision(x, y)) { return true }
 *
 *   // 动态单位（battle 场景）
 *   engine.clearUnits()
 *   engine.addUnit({ id, x, y, radius, footOffsetY, faction, state })
 *   engine.setBoundary(bounds)
 *   engine.separate()          // 执行碰撞分离
 *   engine.clampAll()          // 边界钳制
 *
 *   // 调试
 *   engine.renderDebug(ctx)    // 绘制所有碰撞区域
 */

export class CollisionEngine {
  /**
   * @param {{ dpr:number }} options
   */
  constructor(options = {}) {
    /** @type {number} 设备像素比 */
    this.dpr = options.dpr || 1

    // ── 静态障碍物 ──
    /** @type {Array<{type:string,x,y,width,height,radius,name}>} 物理像素坐标 */
    this.obstacles = []

    // ── 动态单位 ──
    /** @type {Array<Object>} 注册的动态单位（每帧重建） */
    this._units = []

    // ── 边界 ──
    /** @type {{left,right,top,bottom}|null} 战场边界（物理像素） */
    this._bounds = null

    // ── 调试 ──
    /** @type {boolean} 是否启用调试绘制 */
    this.debugMode = false
  }

  // ════════════════════════════════════════
  // ══  一、静态障碍物（地图场景用）　　　　═
  // ════════════════════════════════════════

  /**
   * 设置障碍物数据
   * @param {Array} obstacles 逻辑像素坐标的障碍物数组
   *   内部自动转换为物理像素（× dpr）
   * 格式：[{ type:'rect', x,y,width,height,name }, { type:'circle', x,y,radius,name }]
   */
  setObstacles(obstacles) {
    const dpr = this.dpr
    this.obstacles = (obstacles || []).map(obs => {
      if (obs.type === 'rect') {
        return {
          type: 'rect',
          x: obs.x * dpr,
          y: obs.y * dpr,
          width: obs.width * dpr,
          height: obs.height * dpr,
          name: obs.name || '障碍',
        }
      } else if (obs.type === 'circle') {
        return {
          type: 'circle',
          x: obs.x * dpr,
          y: obs.y * dpr,
          radius: obs.radius * dpr,
          name: obs.name || '圆形障碍',
        }
      }
      return null
    }).filter(Boolean)

    console.log(`[CollisionEngine] 设置了 ${this.obstacles.length} 个静态障碍物`)
  }

  /**
   * 检测指定点是否与任意静态障碍物碰撞
   * @param {number} cx 角色视觉中心X（物理像素）
   * @param {number} cy 角色视觉中心Y（物理像素）
   * @param {{ radius?: number, footOffsetY?: number }} [opts] 覆盖默认参数
   * @returns {boolean}
   */
  checkStaticCollision(cx, cy, opts = {}) {
    if (!this.obstacles || this.obstacles.length === 0) return false

    const radius = (opts.radius || 16) * this.dpr
    const footOffsetY = (opts.footOffsetY || 36) * this.dpr
    const footX = cx
    const footY = cy + footOffsetY

    for (const obs of this.obstacles) {
      if (obs.type === 'rect') {
        const closestX = Math.max(obs.x, Math.min(footX, obs.x + obs.width))
        const closestY = Math.max(obs.y, Math.min(footY, obs.y + obs.height))
        const distX = footX - closestX
        const distY = footY - closestY
        if (Math.sqrt(distX * distX + distY * distY) < radius) return true
      } else if (obs.type === 'circle') {
        const dist = Math.sqrt((footX - obs.x) ** 2 + (footY - obs.y) ** 2)
        if (dist < radius + obs.radius) return true
      }
    }
    return false
  }

  /**
   * 带分轴滑动的碰撞检测与回退（FieldMovement 用）
   * 尝试完整移动 → X轴单独 → Y轴单独 → 完全回退
   * @param {number} oldX 旧位置X
   * @param {number} oldY 旧位置Y
   * @param {number} newX 新位置X
   * @param {number} newY 新位置Y
   * @param {{ radius?:number, footOffsetY?:number }} [opts]
   * @returns {{ x:number, y:number }} 修正后的位置
   */
  moveWithSlide(oldX, oldY, newX, newY, opts = {}) {
    // 先尝试直接移动
    if (!this.checkStaticCollision(newX, newY, opts)) {
      return { x: newX, y: newY }
    }
    // 尝试只走 X
    if (!this.checkStaticCollision(newX, oldY, opts)) {
      return { x: newX, y: oldY }
    }
    // 尝试只走 Y
    if (!this.checkStaticCollision(oldX, newY, opts)) {
      return { x: oldX, y: newY }
    }
    // 都不行，完全回退
    return { x: oldX, y: oldY }
  }

  /**
   * 检测逻辑坐标点是否在障碍物内（用于怪物生成等场景）
   * @param {number} logicX 逻辑像素X
   * @param {number} logicY 逻辑像素Y
   * @param {number} [extraRadius=0] 额外避让半径（逻辑像素）
   */
  isPointInObstacle(logicX, logicY, extraRadius = 0) {
    const px = logicX * this.dpr
    const py = logicY * this.dpr
    const r = extraRadius * this.dpr

    for (const obs of this.obstacles) {
      if (obs.type === 'rect') {
        if (px >= obs.x - r && px <= obs.x + obs.width + r &&
            py >= obs.y - r && py <= obs.y + obs.height + r) {
          return true
        }
      } else if (obs.type === 'circle') {
        const dist = Math.sqrt((px - obs.x) ** 2 + (py - obs.y) ** 2)
        if (dist < obs.radius + r) return true
      }
    }
    return false
  }

  // ════════════════════════════════════════
  // ══  二、动态单位（战斗场景用）　　　　　═
  // ════════════════════════════════════════

  /** 清空所有动态单位（每帧调用） */
  clearUnits() {
    this._units.length = 0
  }

  /**
   * 注册一个动态单位
   * @param {Object} unit
   * @param {string} unit.id           单位唯一标识
   * @param {number} unit.x            视觉中心X（物理像素，会被修改！引用语义）
   * @param {number} unit.y            视觉中心Y（物理像素，会被修改！）
   * @param {number} unit.radius       脚底碰撞半径（物理像素）
   * @param {number} unit.footOffsetY  脚底偏移（物理像素）
   * @param {string} unit.faction      阵营 ('hero' | 'enemy')
   * @param {string} unit.state        当前状态（用于判断是否跳过碰撞分离）
   */
  addUnit(unit) {
    this._units.push(unit)
  }

  /** 获取单位脚底位置 */
  _getFootPos(unit) {
    return {
      x: unit.x,
      y: unit.y + (unit.footOffsetY || 0)
    }
  }

  /** 获取两个单位之间的脚底距离 */
  getDistance(a, b) {
    const fa = this._getFootPos(a)
    const fb = this._getFootPos(b)
    const dx = fa.x - fb.x
    const dy = fa.y - fb.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * 设置战场边界（物理像素）
   * @param {{ left:number, right:number, top:number, bottom:number }} bounds
   */
  setBounds(bounds) {
    this._bounds = bounds
  }

  /**
   * 将所有动态单位钳制在边界内
   * 基于视觉中心钳制（确保整个精灵不超出屏幕）
   * @param {number} [visualR=30] 视觉边界半径（精灵半宽，物理像素）
   */
  clampAll(visualR) {
    const vr = (visualR || 30) * this.dpr
    if (!this._bounds) return

    for (const u of this._units) {
      u.x = Math.max(this._bounds.left + vr, Math.min(this._bounds.right - vr, u.x))
      u.y = Math.max(this._bounds.top + vr, Math.min(this._bounds.bottom - vr, u.y))
    }
  }

  /**
   * 钳制单个单位到边界内
   * @param {Object} unit
   * @param {number} [visualR=30]
   */
  clampUnit(unit, visualR) {
    const vr = (visualR || 30) * this.dpr
    if (!this._bounds) return
    unit.x = Math.max(this._bounds.left + vr, Math.min(this._bounds.right - vr, unit.x))
    unit.y = Math.max(this._bounds.top + vr, Math.min(this._bounds.bottom - vr, unit.y))
  }

  /**
   * 全局碰撞分离：所有动态单位之间都不重叠
   * 支持跳过"交战对"（敌我双方战斗状态时不推开）
   *
   * @param {Object} [opts]
   * @param {number} [opts.pushForce=1.0]     推力系数
   * @param {number} [opts.passes=3]           迭代轮数
   * @param {number} [opts.extraMargin=4]      非交战对额外余量（dpr倍数）
   */
  separate(opts = {}) {
    const PUSH_FORCE = opts.pushForce || 1.0
    const MAX_PASSES = opts.passes || 3
    const EXTRA_MARGIN = (opts.extraMargin || 4) * this.dpr
    const units = this._units
    if (units.length < 2) return

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let hasOverlap = false

      for (let i = 0; i < units.length; i++) {
        for (let j = i + 1; j < units.length; j++) {
          const a = units[i]
          const b = units[j]

          const aFoot = this._getFootPos(a)
          const bFoot = this._getFootPos(b)
          const dx = bFoot.x - aFoot.x
          const dy = bFoot.y - aFoot.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          // 判断是否是"交战对"
          const isHeroEnemyPair = (a.faction !== b.faction)
          const aInCombat = (a.state === 'moving_to_attack' || a.state === 'in_range' || a.state === 'attacking')
          const bInCombat = (b.state === 'moving_to_attack' || b.state === 'in_range' || b.state === 'attacking')
          const isCombatPair = isHeroEnemyPair && (aInCombat || bInCombat)

          if (isCombatPair) continue  // 交战对：完全跳过

          const baseRadiusSum = (a.radius || 10 * this.dpr) + (b.radius || 10 * this.dpr)
          const minDist = baseRadiusSum + EXTRA_MARGIN

          if (dist < minDist && dist > 0.01) {
            hasOverlap = true
            const passFactor = pass === 0 ? 1.0 : pass === 1 ? 0.5 : 0.25
            const overlap = (minDist - dist) * PUSH_FORCE * 0.5 * passFactor
            const nx = dx / dist
            const ny = dy / dist
            a.x -= nx * overlap
            a.y -= ny * overlap
            b.x += nx * overlap
            b.y += ny * overlap
          }
        }
      }

      if (!hasOverlap) break
    }

    // 分离后统一边界限制
    this.clampAll()
  }

  /**
   * 检查移动目标点是否有其他单位阻挡
   * @param {Object} moverState  移动者单位
   * @param {number} targetX     目标X（视觉中心）
   * @param {number} targetY     目标Y（视觉中心）
   * @returns {Object|null} 阻挡的单位，无阻挡返回 null
   */
  getMovementBlocker(moverState, targetX, targetY) {
    const moverRadius = moverState.radius || 10 * this.dpr
    const moverFootY = targetY + (moverState.footOffsetY || 0)
    const checkRadius = moverRadius * 0.8

    for (const u of this._units) {
      if (u === moverState) continue
      const footPos = this._getFootPos(u)
      const dx = targetX - footPos.x
      const dy = moverFootY - footPos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < checkRadius + (u.radius || 10 * this.dpr)) return u
    }
    return null
  }

  // ════════════════════════════════════════
  // ══  三、调试可视化　　　　　　　　　　　　═
  // ════════════════════════════════════════

  /**
   * 绘制所有碰撞区域的调试信息
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} [opts]
   * @param {boolean} [opts.showObstacles=true]   显示静态障碍物
   * @param {boolean} [opts.showUnits=true]       显示动态单位
   * @param {boolean} [opts.showBounds=true]      显示边界框
   */
  renderDebug(ctx, opts = {}) {
    const dpr = this.dpr
    ctx.save()

    if (opts.showObstacles !== false && this.obstacles.length > 0) {
      this._renderObstaclesDebug(ctx, dpr)
    }

    if (opts.showUnits !== false && this._units.length > 0) {
      this._renderUnitsDebug(ctx, dpr)
    }

    if (opts.showBounds !== false && this._bounds) {
      this._renderBoundsDebug(ctx, dpr)
    }

    ctx.restore()
  }

  /** 绘制静态障碍物调试信息 */
  _renderObstaclesDebug(ctx, dpr) {
    ctx.lineWidth = 1.5 * dpr
    for (const obs of this.obstacles) {
      if (obs.type === 'rect') {
        ctx.strokeStyle = 'rgba(255, 180, 0, 0.6)'
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height)
        ctx.fillStyle = 'rgba(255, 180, 0, 0.08)'
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height)
      } else if (obs.type === 'circle') {
        ctx.strokeStyle = 'rgba(255, 180, 0, 0.6)'
        ctx.beginPath()
        ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = 'rgba(255, 180, 0, 0.08)'
        ctx.fill()
      }
    }
  }

  /** 绘制动态单位碰撞调试信息 */
  _renderUnitsDebug(ctx, dpr) {
    ctx.lineWidth = 1.5 * dpr
    ctx.font = `${10 * dpr}px monospace`
    ctx.textAlign = 'left'

    for (const u of this._units) {
      const cx = u.x
      const cy = u.y
      const footX = cx
      const footY = cy + (u.footOffsetY || 0)
      const radius = u.radius || 10 * dpr
      const isBoss = u.isBoss
      const faction = u.faction || ''

      // 碰撞圆（红/橙色）
      ctx.strokeStyle = isBoss ? 'rgba(255, 120, 0, 0.9)' : 'rgba(255, 40, 40, 0.9)'
      ctx.beginPath()
      ctx.arc(footX, footY, radius, 0, Math.PI * 2)
      ctx.stroke()

      // 脚底点（红/橙填充圆）
      ctx.fillStyle = isBoss ? 'rgba(255, 120, 0, 0.9)' : 'rgba(255, 0, 0, 0.9)'
      ctx.beginPath()
      ctx.arc(footX, footY, isBoss ? 4 * dpr : 3 * dpr, 0, Math.PI * 2)
      ctx.fill()

      // 视觉中心（蓝填充圆）
      ctx.fillStyle = 'rgba(60, 140, 255, 0.9)'
      ctx.beginPath()
      ctx.arc(cx, cy, 3 * dpr, 0, Math.PI * 2)
      ctx.fill()

      // 标签
      ctx.fillStyle = isBoss ? '#ff8800' : '#ff4444'
      const label = `●脚底${isBoss ? '(Boss)' : ''}`
      ctx.fillText(label, footX + radius + 3 * dpr, footY)
      ctx.fillStyle = '#3c8cff'
      ctx.fillText('●中心', cx + 30 * dpr, cy)
    }
  }

  /** 绘制边界调试信息 */
  _renderBoundsDebug(ctx, dpr) {
    const b = this._bounds
    if (!b) return
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.5)'
    ctx.lineWidth = 2 * dpr
    ctx.setLineDash([8 * dpr, 4 * dpr])
    ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top)
    ctx.setLineDash([])
  }

  // ════════════════════════════════════════
  // ══  四、辅助方法　　　　　　　　　　　　　═
  // ════════════════════════════════════════

  /** 障碍物数量（调试用） */
  get obstacleCount() {
    return this.obstacles.length
  }

  /** 动态单位数量（调试用） */
  get unitCount() {
    return this._units.length
  }
}
