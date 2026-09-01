/**
 * verify_field_map_themes.mjs —— 野外地图主题系统回归校验
 * ==================================================================
 * 校验内容：
 *   1. 每个主题都能生成对象（障碍 / 装饰齐全）
 *   2. 所有 assetKey 都在 ASSETS 里注册过（防止渲染时 assets.get 返回空 → 地图空白）
 *   3. 所有对象落在地图边界内
 *   4. 碰撞体数量 == 障碍物数量
 *   5. 出生点 / Boss 点不在障碍里
 *   6. ★ 连通性：网格 BFS 必须能从出生点走到 Boss 点（按真实角色碰撞半径判定）
 *   7. ★ 确定性：清空缓存后重新生成，布局逐字节一致
 *   8. ★ 草原零回归：对象数 / 碰撞体 / 出生点 / Boss 点与原实现完全一致
 *   9. 宝箱投放点（沿主路径）全部可达且不在障碍里
 *  10. 各主题之间布局互不相同（防止配置复制粘贴忘记改）
 *
 * 运行：node devtools/verify_field_map_themes.mjs
 */

import {
  buildFieldMap,
  listFieldMapThemes,
  isPointInMapObstacle,
  pointOnPolyline,
  __resetFieldMapCache,
} from '../scripts/data/field-map-themes.js'
import {
  GRASSLAND_MAP_OBJECTS,
  generateGrasslandCollisions,
} from '../scripts/data/grassland-map-data.js'
import { ASSETS } from '../scripts/core/asset-manager.js'

// ── 与 field-scene 保持一致的角色碰撞参数（逻辑像素） ──
const PLAYER_RADIUS = 16
const PLAYER_FOOT_OFFSET = 36
const BFS_STEP = 40

let pass = 0
let fail = 0
const failures = []

function ok(cond, msg) {
  if (cond) { pass++; return true }
  fail++
  failures.push(msg)
  console.log(`  ❌ ${msg}`)
  return false
}

function section(title) {
  console.log(`\n── ${title} ──`)
}

/** 网格 BFS：出生点 → Boss 点是否连通 */
function isReachable(map, from, to) {
  const cols = Math.ceil(map.width / BFS_STEP)
  const rows = Math.ceil(map.height / BFS_STEP)
  const blocked = (cx, cy) => {
    if (cx < PLAYER_RADIUS || cy < PLAYER_RADIUS) return true
    if (cx > map.width - PLAYER_RADIUS || cy > map.height - PLAYER_RADIUS) return true
    // 角色视觉中心 (cx,cy)，碰撞圆心在 (cx, cy + footOffset)
    return isPointInMapObstacle(cx, cy + PLAYER_FOOT_OFFSET, PLAYER_RADIUS, map.collisions)
  }
  const toIdx = (c, r) => r * cols + c
  const startC = Math.round(from.x / BFS_STEP)
  const startR = Math.round(from.y / BFS_STEP)
  const goalC = Math.round(to.x / BFS_STEP)
  const goalR = Math.round(to.y / BFS_STEP)

  if (blocked(from.x, from.y)) return { ok: false, reason: '出生点本身就卡在障碍里' }
  if (blocked(to.x, to.y)) return { ok: false, reason: 'Boss 点本身就卡在障碍里' }

  const visited = new Uint8Array(cols * rows)
  const queue = [[startC, startR]]
  visited[toIdx(startC, startR)] = 1
  let head = 0
  while (head < queue.length) {
    const [c, r] = queue[head++]
    if (Math.abs(c - goalC) <= 1 && Math.abs(r - goalR) <= 1) return { ok: true }
    const neighbors = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]
    for (const [nc, nr] of neighbors) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const idx = toIdx(nc, nr)
      if (visited[idx]) continue
      visited[idx] = 1
      if (blocked(nc * BFS_STEP, nr * BFS_STEP)) continue
      queue.push([nc, nr])
    }
  }
  return { ok: false, reason: 'BFS 找不到通路（地图被障碍隔断）' }
}

/** 复刻 field-scene._generateMapObjects 的宝箱沿路投放算法 */
function simulateChests(map) {
  const chests = []
  const path = map.path && map.path.length >= 2
    ? map.path
    : [[map.spawn.x, map.spawn.y], [map.boss.x, map.boss.y]]
  const fractions = [0.14, 0.32, 0.5, 0.68, 0.86]
  let seed = 12345
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  for (const f of fractions) {
    const p = pointOnPolyline(path, f)
    for (let k = 0; k < 12; k++) {
      const ang = rand() * Math.PI * 2
      const rad = k === 0 ? 0 : (30 + rand() * (map.corridor || 120) * 0.8)
      const x = p.x + Math.cos(ang) * rad
      const y = p.y + Math.sin(ang) * rad
      if (x < 0 || y < 0 || x > map.width || y > map.height) continue
      if (isPointInMapObstacle(x, y, 40, map.collisions)) continue
      chests.push({ x, y })
      break
    }
  }
  return chests
}

// ════════════════════════════════════════════════════════════
console.log('═══ 野外地图主题系统校验 ═══')

const themes = listFieldMapThemes()
console.log(`已配置主题: ${themes.join(', ')}`)
ok(themes.length >= 6, `主题数量应 >= 6，实际 ${themes.length}`)

const signatures = new Map()

for (const id of themes) {
  section(`主题 [${id}]`)
  const map = buildFieldMap(id)

  const obstacles = map.objects.filter(o => o.type === 'obstacle')
  const decorations = map.objects.filter(o => o.type === 'decoration')

  // 1. 基本产出
  ok(map.objects.length > 0, `${id}: 未生成任何地图对象`)
  ok(obstacles.length > 0, `${id}: 未生成障碍物`)
  ok(decorations.length > 0, `${id}: 未生成装饰物`)
  console.log(`  对象 ${map.objects.length}（障碍 ${obstacles.length} / 装饰 ${decorations.length}），碰撞体 ${map.collisions.length}`)

  // 2. assetKey 必须已注册
  const missing = new Set()
  for (const o of map.objects) {
    if (!ASSETS[o.assetKey]) missing.add(o.assetKey)
  }
  ok(missing.size === 0, `${id}: 存在未注册的 assetKey -> ${[...missing].join(', ')}`)

  // 3. 越界检查
  const outOfBounds = map.objects.filter(o =>
    o.x < -50 || o.y < -50 ||
    o.x + (o.w || o.width) > map.width + 50 ||
    o.y + (o.h || o.height) > map.height + 50
  )
  ok(outOfBounds.length === 0, `${id}: ${outOfBounds.length} 个对象超出地图边界（首个 ${JSON.stringify(outOfBounds[0])}）`)

  // 4. 碰撞体数量 == 障碍数量
  ok(map.collisions.length === obstacles.length,
    `${id}: 碰撞体数 ${map.collisions.length} != 障碍数 ${obstacles.length}`)

  // 5. 出生点 / Boss 点净空
  ok(!isPointInMapObstacle(map.spawn.x, map.spawn.y, 60, map.collisions),
    `${id}: 出生点 (${map.spawn.x},${map.spawn.y}) 落在障碍里`)
  ok(!isPointInMapObstacle(map.boss.x, map.boss.y, 60, map.collisions),
    `${id}: Boss 点 (${map.boss.x},${map.boss.y}) 落在障碍里`)

  // 6. 连通性
  const reach = isReachable(map, map.spawn, map.boss)
  ok(reach.ok, `${id}: 出生点 → Boss 点不连通 —— ${reach.reason || ''}`)
  if (reach.ok) console.log('  ✅ 出生点 → Boss 点连通')

  // 7. 确定性
  __resetFieldMapCache()
  const rebuilt = buildFieldMap(id)
  const sig = JSON.stringify(rebuilt.objects)
  ok(sig === JSON.stringify(map.objects), `${id}: 重新生成后布局不一致（非确定性）`)
  signatures.set(id, sig)

  // 9. 宝箱投放
  const chests = simulateChests(map)
  ok(chests.length === 5, `${id}: 只投出 ${chests.length}/5 个宝箱（路径被障碍堵死？）`)
  ok(chests.every(c => !isPointInMapObstacle(c.x, c.y + PLAYER_FOOT_OFFSET, PLAYER_RADIUS, map.collisions)),
    `${id}: 存在不可达的宝箱`)
  if (chests.length === 5) console.log('  ✅ 5 个宝箱沿主路径投放且均可达')
}

// 10. 主题之间互不相同
section('主题差异化')
const uniq = new Set(signatures.values())
ok(uniq.size === signatures.size,
  `存在完全相同的地图布局（${signatures.size} 个主题只有 ${uniq.size} 种布局）`)

// 8. 草原零回归
section('草原（grassland）零回归')
const grass = buildFieldMap('grassland')
ok(grass.objects.length === GRASSLAND_MAP_OBJECTS.length,
  `草原对象数变了：${grass.objects.length} != ${GRASSLAND_MAP_OBJECTS.length}`)
ok(grass.objects === GRASSLAND_MAP_OBJECTS, '草原对象不再是原 GRASSLAND_MAP_OBJECTS 引用')
const rawGrassCollisions = generateGrasslandCollisions()
ok(JSON.stringify(grass.collisions) === JSON.stringify(rawGrassCollisions), '草原碰撞体与原实现不一致')
ok(grass.spawn.x === 200 && grass.spawn.y === 2900, `草原出生点变了: ${JSON.stringify(grass.spawn)}`)
ok(grass.boss.x === 3400 && grass.boss.y === 240, `草原 Boss 点变了: ${JSON.stringify(grass.boss)}`)
ok(grass.width === 4000 && grass.height === 3000, `草原地图尺寸变了: ${grass.width}x${grass.height}`)
ok(grass.bg.fill === '#5daE4a', `草原背景色变了: ${grass.bg.fill}`)

// 未知区域回落
section('未知区域回落')
const unknown = buildFieldMap('no_such_area_xyz')
ok(unknown.id === 'grassland', `未知区域应回落到 grassland，实际 ${unknown.id}`)

// ════════════════════════════════════════════════════════════
console.log(`\n═══ 结果: ${pass} 通过 / ${fail} 失败 ═══`)
if (fail > 0) {
  console.log('失败项：')
  failures.forEach(f => console.log(`  - ${f}`))
  process.exit(1)
}
console.log('✅ 全部通过')
