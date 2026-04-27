/**
 * tower-collision.js - 碰撞检测与实体分离工具
 *
 * 从 tower-battle.js 提取的通用碰撞分离逻辑，
 * 用于角色-角色、角色-怪物、怪物-怪物之间的重叠推开。
 *
 * 所有函数均为纯函数，接收实体对象和参数，直接修改实体位置。
 */

/**
 * 通用碰撞分离 —— 替代三个几乎相同的 _separate* 方法
 * @param {Array} entitiesA - 第一组实体列表（需有 x, y 属性）
 * @param {Array|null} entitiesB - 第二组实体列表（如果为null则只做组内分离）
 * @param {number} minDist - 最小间距
 * @param {number} pushSpeed - 推开速度 px/s
 * @param {number} dt - 时间间隔 ms
 * @param {object} opts - 可选配置
 * @param {number} opts.iterations - 迭代次数（默认2）
 * @param {boolean} opts.syncTarget - 是否同步更新 targetX/targetY（默认true）
 * @param {boolean} opts.clampArea - 是否做边界钳制（默认true，需传入clampToBattleArea）
 */
function separateEntities(entitiesA, entitiesB, minDist, pushSpeed, dt, opts = {}) {
  const listA = entitiesA.filter(e => !e.isDead && !(e.isSpawning || false))
  const listB = entitiesB ? entitiesB.filter(e => !e.isDead && !(e.isSpawning || false)) : null
  if (listA.length < 2 && !listB) return
  if (listA.length === 0 || (listB !== null && listB.length === 0)) return

  const iterations = opts.iterations || 2
  const syncTarget = opts.syncTarget !== false
  const clampArea = opts.clampArea !== false

  for (let iter = 0; iter < iterations; iter++) {
    if (!listB) {
      // 组内分离
      for (let i = 0; i < listA.length; i++) {
        for (let j = i + 1; j < listA.length; j++) {
          pushApart(listA[i], listA[j], minDist, pushSpeed, dt, { syncTarget, clampArea })
        }
      }
    } else {
      // 组间分离
      for (const a of listA) {
        for (const b of listB) {
          pushApart(a, b, minDist, pushSpeed, dt, { syncTarget, clampArea })
        }
      }
    }
  }
}

/**
 * 推开两个实体（separateEntities 的内部核心）
 * @param {object} a - 实体A（需有 x, y）
 * @param {object} b - 实体B（需有 x, y）
 * @param {number} minDist - 最小允许距离
 * @param {number} pushSpeed - 推开速度 px/s
 * @param {number} dt - dt(ms)
 * @param {object} opts - 选项
 */
function pushApart(a, b, minDist, pushSpeed, dt, opts = {}) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < minDist && dist > 0.1) {
    const overlap = minDist - dist
    const nx = dx / dist
    const ny = dy / dist
    const pushAmt = Math.min(overlap * (opts.pushRatio || 0.5), pushSpeed * dt / 1000)

    // 推开实际位置
    a.x -= nx * pushAmt
    a.y -= ny * pushAmt
    b.x += nx * pushAmt
    b.y += ny * pushAmt

    // 同步目标坐标
    if (opts.syncTarget) {
      if (a.targetX !== undefined) { a.targetX -= nx * pushAmt; a.targetY -= ny * pushAmt }
      if (b.targetX !== undefined) { b.targetX += nx * pushAmt; b.targetY += ny * pushAmt }
    }

    // 边界钳制 - 只有在提供了回调函数时才执行
    if (opts.clampArea && typeof opts.clampToBattleArea === 'function') {
      opts.clampToBattleArea(a)
      opts.clampToBattleArea(b)
      if (a.targetX !== undefined && typeof opts.clampTargetToArea === 'function') {
        [a.targetX, a.targetY] = opts.clampTargetToArea(a.targetX, a.targetY)
      }
      if (b.targetX !== undefined && typeof opts.clampTargetToArea === 'function') {
        [b.targetX, b.targetY] = opts.clampTargetToArea(b.targetX, b.targetY)
      }
    }
  }
}

module.exports = {
  separateEntities,
  pushApart,
}
