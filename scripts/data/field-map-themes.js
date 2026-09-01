/**
 * field-map-themes.js —— 野外地图「主题化」生成系统
 * ==================================================================
 * 背景：原先所有野外区域（阳光草原 / 魔法塔 / 集市小镇 / 古城遗迹 …）
 *       的地图对象都硬编码指向 GRASSLAND_MAP_OBJECTS，导致除草原外的
 *       区域实际都在渲染「草原那张图」，只是背景色不同。
 *
 * 目标：把地图拆成「主题配置 + 程序化生成」，一张新地图 = 一段配置，
 *       全部复用现有 TOWN_* 图集，不新增任何美术资源。
 *
 * 设计要点（务必遵守）：
 *   1. **确定性**：用 areaId 做种子（mulberry32），同一区域每次生成的
 *      布局完全一致。怪物位置会存档，地图不能每次进入都变。
 *   2. **可达性**：每张地图定义一条 spawn → boss 的折线 `path`，
 *      生成后按 `corridor` 半宽挖空走廊，并在出生点/Boss点开圆场，
 *      保证「一定走得通」。devtools/verify_field_map_themes.mjs 用
 *      网格 BFS 强制校验连通性。
 *   3. **草原零回归**：grassland 走 legacy 分支，直接复用原
 *      GRASSLAND_MAP_OBJECTS / generateGrasslandCollisions()，
 *      对象数、碰撞体、出生点(200,2900)、Boss 点(3400,240) 全部不变。
 *
 * 坐标：全部为「逻辑像素」（field-scene 渲染时 × dpr）。
 */

import {
  GRASSLAND_MAP_CONFIG,
  GRASSLAND_MAP_OBJECTS,
  GLAND_OBJ_TYPE,
  generateGrasslandCollisions,
} from './grassland-map-data.js'

const OBSTACLE = GLAND_OBJ_TYPE.OBSTACLE
const DECORATION = GLAND_OBJ_TYPE.DECORATION

/** 默认地图尺寸（逻辑像素） */
const DEFAULT_MAP = { width: 4000, height: 3000 }

// ────────────────────────────────────────────────────────────
// 一、可复用的素材池（全部来自 asset-manager 已注册的 TOWN_* 图集）
//
// ★ 素材语义速查（按实际像素内容核对过，勿凭文件名臆断）：
//   TOWN_ROCK            灰色岩石群（方形，万能障碍：塔壁/洞壁/遗迹石阵）
//   TOWN_TREE            大绿树（圆润冠）
//   TOWN_FOREST          深绿松树丛（成片密林）
//   TOWN_BUILDINGS_010   枯树（无叶）
//   TOWN_BUILDINGS_015   蓝色旗帜杆（魔法/营地标记）
//   TOWN_BUILDINGS_022   木桶      026 树桩   027 原木
//   TOWN_BUILDINGS_029   木路牌    031 碎石堆 032 小土斑
//   TOWN_BUILDINGS_014/021/025  木栅栏（横向长条）
//   TOWN_BUILDINGS_012/017/019/020/023/024/030  泥土/沙斑贴片（装饰）
//   TOWN_BUILDINGS_001/002/004~009/011/016  水面/悬崖贴片（装饰/池塘）
//   TOWN_BUILDINGS_013   宝箱样式（★勿用：与可交互宝箱混淆）
//   TOWN_MAPS_002/003    蓝顶/红顶房子   TOWN_MAPS_004 帐篷  TOWN_MAPS_005 石水井
//   TOWN_MOUNTAIN        黄色沙丘（★只适合沙漠/海滩系，勿当城墙）
// ────────────────────────────────────────────────────────────

/** 岩石（灰）——洞壁 / 塔基 / 遗迹石阵通用 */
const ROCK = 'TOWN_ROCK'
/** 枯树 / 蓝旗 / 木桶等小型道具 */
const DEAD_TREE = 'TOWN_BUILDINGS_010_93X140'
const BANNER = 'TOWN_BUILDINGS_015_51X117'
const BARREL = 'TOWN_BUILDINGS_022_46X63'
const SIGNPOST = 'TOWN_BUILDINGS_029_69X54'
const LOG = 'TOWN_BUILDINGS_027_64X34'
const STUMP = 'TOWN_BUILDINGS_026_60X48'
const PEBBLES = 'TOWN_BUILDINGS_031_61X39'

/** 木栅栏（横向长条，围摊位 / 围栏线） */
const FENCES = [
  'TOWN_BUILDINGS_014_131X43', 'TOWN_BUILDINGS_021_99X43', 'TOWN_BUILDINGS_025_62X43',
]

/** 泥土 / 沙斑贴片（decor 贴地，不参与碰撞） */
const DIRT_PATCHES = [
  'TOWN_BUILDINGS_012_85X57', 'TOWN_BUILDINGS_017_67X56', 'TOWN_BUILDINGS_019_65X55',
  'TOWN_BUILDINGS_020_71X55', 'TOWN_BUILDINGS_023_57X56', 'TOWN_BUILDINGS_024_54X57',
  'TOWN_BUILDINGS_030_57X43', 'TOWN_BUILDINGS_032_30X50',
]

/** 水面 / 悬崖贴片（decor 或池塘 landmark） */
const WATER_TILES = [
  'TOWN_BUILDINGS_001_85X84', 'TOWN_BUILDINGS_002_86X85', 'TOWN_BUILDINGS_004_80X82',
  'TOWN_BUILDINGS_005_80X83', 'TOWN_BUILDINGS_006_80X81', 'TOWN_BUILDINGS_007_80X82',
  'TOWN_BUILDINGS_008_85X69', 'TOWN_BUILDINGS_009_75X74', 'TOWN_BUILDINGS_011_72X68',
  'TOWN_BUILDINGS_016_64X56',
]

/** 房子 / 帐篷 / 水井（maps 系列，仅小镇 / 遗迹类主题使用） */
const HOUSES = ['TOWN_MAPS_002_142X278', 'TOWN_MAPS_003_158X278']
const TENT = 'TOWN_MAPS_004_138X133'
const WELL = 'TOWN_MAPS_005_87X103'

/** 小树 / 灌木（trees 系列，含树桩与灰石，适合林下点缀） */
const TREES_SMALL = [
  'TOWN_TREES_001_46X41', 'TOWN_TREES_002_51X38', 'TOWN_TREES_003_48X43',
  'TOWN_TREES_004_45X38', 'TOWN_TREES_005_42X34', 'TOWN_TREES_006_40X31',
  'TOWN_TREES_007_47X33', 'TOWN_TREES_008_45X37', 'TOWN_TREES_009_41X42',
  'TOWN_TREES_010_47X32', 'TOWN_TREES_011_49X32', 'TOWN_TREES_012_43X36',
  'TOWN_TREES_013_40X38', 'TOWN_TREES_014_41X40', 'TOWN_TREES_015_38X35',
  'TOWN_TREES_016_39X36', 'TOWN_TREES_017_32X32',
]

const GRASS_TUFT = ['TOWN_GRASS', 'TOWN_GRASS2', 'TOWN_GRASS3']
const FLOWERS = ['TOWN_FLOWER1', 'TOWN_FLOWER2', 'TOWN_FLOWER3']

// ────────────────────────────────────────────────────────────
// 二、随机与几何工具
// ────────────────────────────────────────────────────────────

/** mulberry32：小巧确定性 PRNG */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a 字符串 → 32 位种子 */
function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 两个矩形之间的间隙（相交为 0） */
function rectGap(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  return Math.sqrt(dx * dx + dy * dy)
}

/** 点到线段距离 */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2)
}

/** 点到折线距离 */
function distToPolyline(px, py, points) {
  if (!points || points.length === 0) return Infinity
  if (points.length === 1) return Math.sqrt((px - points[0][0]) ** 2 + (py - points[0][1]) ** 2)
  let min = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegment(px, py, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
    if (d < min) min = d
  }
  return min
}

/** 折线上按累计长度取点（t ∈ [0,1]） */
export function pointOnPolyline(points, t) {
  if (!points || points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { x: points[0][0], y: points[0][1] }
  let total = 0
  const segs = []
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.sqrt((points[i + 1][0] - points[i][0]) ** 2 + (points[i + 1][1] - points[i][1]) ** 2)
    segs.push(len)
    total += len
  }
  let target = Math.max(0, Math.min(1, t)) * total
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const r = segs[i] === 0 ? 0 : target / segs[i]
      return {
        x: points[i][0] + (points[i + 1][0] - points[i][0]) * r,
        y: points[i][1] + (points[i + 1][1] - points[i][1]) * r,
      }
    }
    target -= segs[i]
  }
  return { x: points[points.length - 1][0], y: points[points.length - 1][1] }
}

// ────────────────────────────────────────────────────────────
// 三、对象构造
// ────────────────────────────────────────────────────────────

function mkObj(type, assetKey, x, y, w, h, pad, name) {
  const o = {
    type,
    assetKey,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(w),
    height: Math.round(h),
    w: Math.round(w),
    h: Math.round(h),
    name: name || 'obstacle',
  }
  if (type === OBSTACLE && pad) o.collisionPadding = pad
  return o
}

// ────────────────────────────────────────────────────────────
// 四、碰撞规则（层次感：碰撞只覆盖物体「占地」的底部，不悬空）
//     —— 规则与 grassland-map-data 保持一致，并扩展到新素材族
// ────────────────────────────────────────────────────────────

function getCollisionRule(assetKey) {
  if (assetKey === 'TOWN_TREE') return { hRatio: 0.30, wRatio: 0.50, minW: 28, minH: 20, yStart: 0.70 }
  if (assetKey === 'TOWN_FOREST') return { hRatio: 0.35, wRatio: 0.50, minW: 32, minH: 28, yStart: 0.65 }
  if (assetKey === 'TOWN_ROCK') return { hRatio: 0.60, wRatio: 0.65, minW: 20, minH: 18, yStart: 0.40 }
  if (assetKey.startsWith('TOWN_TREES_')) return { hRatio: 0.40, wRatio: 0.55, minW: 22, minH: 16, yStart: 0.60 }
  if (assetKey === 'TOWN_MOUNTAIN') return { hRatio: 0.62, wRatio: 0.80, minW: 60, minH: 60, yStart: 0.38 }
  if (assetKey.startsWith('TOWN_MAPS_')) return { hRatio: 0.75, wRatio: 0.80, minW: 50, minH: 70, yStart: 0.25 }
  // 枯树按树处理：只挡树干底部，树冠可走位遮挡
  if (assetKey === 'TOWN_BUILDINGS_010_93X140') return { hRatio: 0.28, wRatio: 0.42, minW: 26, minH: 20, yStart: 0.72 }
  // 旗帜杆：只挡细杆底端
  if (assetKey === 'TOWN_BUILDINGS_015_51X117') return { hRatio: 0.22, wRatio: 0.30, minW: 14, minH: 14, yStart: 0.78 }
  if (
    assetKey.startsWith('TOWN_BUILDINGS_') ||
    assetKey === 'TOWN_SHOP' || assetKey === 'TOWN_WEAPON_SHOP' ||
    assetKey === 'TOWN_POTION_SHOP' || assetKey === 'TOWN_QUEST_BOARD'
  ) {
    return { hRatio: 0.45, wRatio: 0.85, minW: 40, minH: 34, yStart: 0.55 }
  }
  // 兜底：整块（贴地小物件，如草堆）
  return { hRatio: 1, wRatio: 1, minW: 1, minH: 1, yStart: 0 }
}

/** 单个地图对象的碰撞矩形（与 buildCollisionsFromObjects 同一套规则） */
function objectCollisionRect(obj) {
  const pad = obj.collisionPadding || 0
  const objW = obj.w || obj.width || 64
  const objH = obj.h || obj.height || 64
  const rule = getCollisionRule(obj.assetKey)
  if (rule.hRatio < 1) {
    const collH = Math.max(rule.minH, objH * rule.hRatio)
    const collW = Math.max(rule.minW, objW * rule.wRatio)
    return {
      x: obj.x + (objW - collW) / 2,
      y: obj.y + objH * rule.yStart,
      w: collW,
      h: collH,
    }
  }
  return { x: obj.x + pad, y: obj.y + pad, w: objW - pad * 2, h: objH - pad * 2 }
}

/** 点到矩形的最近距离 */
function pointToRectDist(px, py, r) {
  const cx = Math.max(r.x, Math.min(px, r.x + r.w))
  const cy = Math.max(r.y, Math.min(py, r.y + r.h))
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
}

/** 由地图对象生成碰撞体（逻辑像素） */
export function buildCollisionsFromObjects(objects) {
  const collisions = []
  for (const obj of objects) {
    if (obj.type !== OBSTACLE) continue
    const r = objectCollisionRect(obj)
    collisions.push({
      type: 'rect',
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.w),
      height: Math.round(r.h),
      name: obj.name || 'obstacle',
    })
  }
  return collisions
}

// ────────────────────────────────────────────────────────────
// 五、生成步骤（step 解释器）
//     kind: border | scatter | row | grid | landmark | pathDecor
// ────────────────────────────────────────────────────────────

/** 在矩形区域内按最小间距做拒绝采样，返回落点或 null */
function sampleSpot(rng, area, w, h, footprints, minGap, attempts = 40) {
  const maxX = area.x + area.w - w
  const maxY = area.y + area.h - h
  if (maxX < area.x || maxY < area.y) return null
  for (let i = 0; i < attempts; i++) {
    const x = area.x + rng() * (maxX - area.x)
    const y = area.y + rng() * (maxY - area.y)
    let ok = true
    for (const f of footprints) {
      if (rectGap(f, { x, y, w, h }) < minGap) { ok = false; break }
    }
    if (ok) return { x, y }
  }
  return null
}

function pickAsset(rng, step, index) {
  if (step.asset) return step.asset
  const list = step.assets || []
  if (list.length === 0) return 'TOWN_ROCK'
  return list[Math.floor(rng() * list.length) % list.length]
}

function runStep(step, ctx) {
  const { rng, obstacles, decorations, footprints, mapW, mapH } = ctx
  const isDecor = !!step.decor
  const target = isDecor ? decorations : obstacles
  const w = step.w
  const h = step.h
  const pad = step.pad || 0
  const name = step.name || (isDecor ? 'decoration' : 'obstacle')
  const jitter = step.jitter || 0

  const push = (assetKey, x, y) => {
    const obj = mkObj(isDecor ? DECORATION : OBSTACLE, assetKey, x, y, w, h, pad, name)
    target.push(obj)
    if (!isDecor) footprints.push({ x: obj.x, y: obj.y, w: obj.w, h: obj.h })
    return obj
  }

  switch (step.kind) {
    case 'border': {
      // 沿四边铺一圈（塔壁 / 洞壁 / 镇墙 / 树墙），四角封死
      const inset = step.inset != null ? step.inset : 30
      const spacing = step.spacing || 320
      const left = inset, top = inset
      const right = mapW - inset - w
      const bottom = mapH - inset - h
      const cols = Math.max(2, Math.round((right - left) / spacing) + 1)
      const rows = Math.max(2, Math.round((bottom - top) / spacing) + 1)
      const jx = () => (rng() - 0.5) * 2 * jitter
      const jy = () => (rng() - 0.5) * 2 * jitter
      for (let c = 0; c < cols; c++) {
        const x = left + ((right - left) * c) / (cols - 1)
        push(step.asset, x + jx(), top + jy())
        push(step.asset, x + jx(), bottom + jy())
      }
      for (let r = 1; r < rows - 1; r++) {
        const y = top + ((bottom - top) * r) / (rows - 1)
        push(step.asset, left + jx(), y + jy())
        push(step.asset, right + jx(), y + jy())
      }
      break
    }

    case 'scatter': {
      const area = step.area || [0, 0, mapW, mapH]
      const rect = { x: area[0], y: area[1], w: area[2], h: area[3] }
      const minGap = step.minGap != null ? step.minGap : 120
      for (let i = 0; i < step.count; i++) {
        const spot = sampleSpot(rng, rect, w, h, isDecor ? [] : footprints, minGap)
        if (!spot) continue
        push(pickAsset(rng, step, i), spot.x, spot.y)
      }
      break
    }

    case 'row': {
      const [x1, y1] = step.from
      const [x2, y2] = step.to
      const n = Math.max(1, step.count || 2)
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1)
        const jx = (rng() - 0.5) * 2 * jitter
        const jy = (rng() - 0.5) * 2 * jitter
        push(pickAsset(rng, step, i), x1 + (x2 - x1) * t + jx, y1 + (y2 - y1) * t + jy)
      }
      break
    }

    case 'grid': {
      const [ox, oy] = step.origin
      const cols = step.cols || 1
      const rows = step.rows || 1
      const stepX = step.stepX || 300
      const stepY = step.stepY || 300
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ox + c * stepX + (rng() - 0.5) * 2 * jitter
          const y = oy + r * stepY + (rng() - 0.5) * 2 * jitter
          if (x < 0 || y < 0 || x + w > mapW || y + h > mapH) continue
          push(pickAsset(rng, step, r * cols + c), x, y)
        }
      }
      break
    }

    case 'landmark': {
      const [x, y] = step.at
      push(step.asset, x - w / 2, y - h / 2)
      break
    }

    default:
      break
  }
}

/** 沿主路径铺地砖（装饰层，最底）。rotate:true 时砖块按段方向旋转（竖直段转 90°） */
function runPathDecor(theme, ctx) {
  const cfg = theme.pathDecor
  if (!cfg || !theme.path || theme.path.length < 2) return
  const { rng, decorations } = ctx
  const spacing = cfg.spacing || 150
  const points = theme.path
  let carry = 0
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    const steps = Math.floor((len + carry) / spacing)
    // ★ 段方向角：竖直段把横砖转 90°，避免出现一串「橙色台阶」
    const segAngle = cfg.rotate ? Math.atan2(y2 - y1, x2 - x1) : 0
    for (let s = 0; s <= steps; s++) {
      const d = s * spacing - carry
      const t = len === 0 ? 0 : d / len
      if (t < 0 || t > 1) continue
      const x = x1 + (x2 - x1) * t
      const y = y1 + (y2 - y1) * t
      const obj = mkObj(
        DECORATION, cfg.asset,
        x - cfg.w / 2 + (rng() - 0.5) * 10,
        y - cfg.h / 2 + (rng() - 0.5) * 10,
        cfg.w, cfg.h, 0, '地面'
      )
      if (cfg.rotate && Math.abs(segAngle) > Math.PI / 4) obj.rotation = Math.PI / 2
      decorations.push(obj)
    }
    carry = (carry + len) % spacing
  }
}

/** 挖走廊：移除「碰撞矩形」离主路径过近的障碍物 */
function carveCorridor(objects, path, halfWidth) {
  if (!path || path.length < 2) return objects
  return objects.filter(o => {
    if (o.type !== OBSTACLE) return true
    const r = objectCollisionRect(o)
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    return distToPolyline(cx, cy, path) > halfWidth
  })
}

/**
 * 清出圆形空场（出生点 / Boss 点）
 * ★ 必须按「碰撞矩形」而不是「精灵中心」判定：山体/城墙这类大素材的
 *   碰撞框偏在精灵下半部，只看中心会让高个素材的下摆压住关键点。
 */
function clearCircle(objects, cx, cy, radius) {
  return objects.filter(o => {
    const r = objectCollisionRect(o)
    return pointToRectDist(cx, cy, r) > radius
  })
}

// ────────────────────────────────────────────────────────────
// 六、主题配置表
// ────────────────────────────────────────────────────────────

export const FIELD_MAP_THEMES = {
  /**
   * 阳光草原 —— legacy：
   * 直接复用原有手写对象表，保证零回归（对象数 / 碰撞体 / 出生点 / Boss 点全部不变）。
   * 此处仅补充 path（供宝箱沿路投放）与背景渲染参数。
   */
  grassland: {
    legacy: true,
    name: '阳光草原',
    width: DEFAULT_MAP.width,
    height: DEFAULT_MAP.height,
    bg: {
      fill: GRASSLAND_MAP_CONFIG.bgColor,
      dark: GRASSLAND_MAP_CONFIG.bgDarkColor,
      tile: 100,
      darkRatio: 0.4,
    },
    spawn: { x: 200, y: 2900 },
    boss: { x: 3400, y: 240 },
    corridor: 0, // legacy 不改动画布
    path: [[200, 2900], [900, 2450], [900, 1650], [1850, 1650], [1850, 1050], [2750, 1050], [3400, 240]],
  },

  /**
   * 魔法塔危机（第二章）—— 奥法庭院：
   * 紫色石板地 + 灰岩塔基环阵 + 沿路蓝旗（魔力路标）+ 枯木与碎石。
   * 注：图集里没有石砖墙素材，故边界用大块灰岩垒砌，不使用沙丘。
   */
  magic_tower: {
    name: '魔法塔危机',
    width: DEFAULT_MAP.width,
    height: DEFAULT_MAP.height,
    bg: { fill: '#3b3352', dark: '#322c47', tile: 100, darkRatio: 0.3 },
    spawn: { x: 300, y: 2720 },
    boss: { x: 3420, y: 300 },
    corridor: 135,
    path: [
      [300, 2720], [860, 2500], [860, 1820], [1620, 1820],
      [1620, 1180], [2380, 1180], [2380, 700], [3050, 700], [3420, 300],
    ],
    pathStroke: { color: 'rgba(214,206,255,0.13)', width: 120 },
    steps: [
      { kind: 'border', asset: ROCK, w: 205, h: 195, spacing: 205, jitter: 26, inset: 30, pad: 10, name: '塔基石阵' },
      // 塔基环阵：三组灰岩群
      { kind: 'grid', asset: ROCK, w: 150, h: 142, cols: 4, rows: 3, stepX: 560, stepY: 460, origin: [1250, 520], jitter: 30, pad: 6, name: '岩阵' },
      { kind: 'grid', asset: ROCK, w: 150, h: 142, cols: 3, rows: 2, stepX: 600, stepY: 500, origin: [420, 540], jitter: 30, pad: 6, name: '岩阵' },
      { kind: 'grid', asset: ROCK, w: 150, h: 142, cols: 3, rows: 2, stepX: 560, stepY: 520, origin: [560, 2000], jitter: 30, pad: 6, name: '岩阵' },
      // 魔力路标：蓝旗夹道（坐标已按「碰撞中心离路径 > corridor」校准，防被挖走廊误删）
      { kind: 'row', asset: BANNER, w: 58, h: 133, from: [560, 2200], to: [560, 1900], count: 2, jitter: 12, pad: 6, name: '魔力旗' },
      { kind: 'row', asset: BANNER, w: 58, h: 133, from: [1000, 1950], to: [1350, 1950], count: 2, jitter: 12, pad: 6, name: '魔力旗' },
      { kind: 'row', asset: BANNER, w: 58, h: 133, from: [1650, 820], to: [2100, 820], count: 3, jitter: 12, pad: 6, name: '魔力旗' },
      // 枯木点缀
      { kind: 'scatter', asset: DEAD_TREE, w: 96, h: 145, count: 10, area: [280, 280, 3440, 2440], minGap: 260, pad: 6, name: '枯木' },
      { kind: 'scatter', asset: PEBBLES, w: 64, h: 41, count: 26, area: [200, 200, 3600, 2600], minGap: 110, pad: 4, name: '碎石' },
      { kind: 'scatter', asset: BARREL, w: 52, h: 71, count: 8, area: [350, 350, 3300, 2300], minGap: 220, pad: 4, name: '封印桶' },
      { kind: 'scatter', assets: GRASS_TUFT, w: 38, h: 34, count: 40, area: [140, 140, 3720, 2720], minGap: 40, decor: true },
      { kind: 'scatter', asset: 'TOWN_FLOWER3', w: 30, h: 30, count: 24, area: [140, 140, 3720, 2720], minGap: 44, decor: true },
    ],
  },

  /** 集市小镇（第三章）—— 树墙围镇 + 帐篷摊位群 + 三大店铺 + 中心水井广场 */
  merchant_town: {
    name: '集市小镇',
    width: DEFAULT_MAP.width,
    height: DEFAULT_MAP.height,
    bg: { fill: '#c9a678', dark: '#bb9863', tile: 110, darkRatio: 0.32 },
    spawn: { x: 300, y: 2700 },
    boss: { x: 3300, y: 420 },
    corridor: 150,
    path: [
      [300, 2700], [300, 1500], [1700, 1500], [1700, 760], [3300, 760], [3300, 420],
    ],
    pathDecor: { asset: 'TOWN_ROAD_H', w: 190, h: 190, spacing: 175, rotate: true },
    steps: [
      // 镇界：绿树围出小镇轮廓（不用沙丘）
      { kind: 'border', asset: 'TOWN_TREE', w: 120, h: 205, spacing: 165, jitter: 24, inset: 25, pad: 10, name: '镇树' },
      // 集市摊位：帐篷 + 栅栏围挡 + 货垛
      { kind: 'row', asset: TENT, w: 150, h: 145, from: [560, 2350], to: [560, 1250], count: 4, jitter: 18, pad: 6, name: '摊位帐篷' },
      { kind: 'row', asset: TENT, w: 150, h: 145, from: [1060, 2250], to: [1060, 1350], count: 3, jitter: 18, pad: 6, name: '摊位帐篷' },
      { kind: 'row', assets: FENCES, w: 120, h: 40, from: [420, 1150], to: [700, 1150], count: 3, jitter: 8, pad: 4, name: '围栏' },
      { kind: 'row', assets: FENCES, w: 120, h: 40, from: [920, 1100], to: [1200, 1100], count: 3, jitter: 8, pad: 4, name: '围栏' },
      { kind: 'scatter', asset: 'TOWN_GRASS_PILE', w: 56, h: 50, count: 20, area: [420, 1150, 3200, 1600], minGap: 90, pad: 6, name: '货垛' },
      { kind: 'scatter', asset: BARREL, w: 52, h: 71, count: 14, area: [350, 350, 3300, 2300], minGap: 150, pad: 4, name: '酒桶' },
      { kind: 'row', asset: SIGNPOST, w: 54, h: 59, from: [1650, 1900], to: [1650, 1600], count: 2, jitter: 10, pad: 4, name: '集市路牌' },
      // 住宅（蓝顶/红顶房子，靠镇边）
      { kind: 'landmark', asset: 'TOWN_MAPS_002_142X278', w: 150, h: 294, at: [2500, 2300], pad: 8, name: '民居' },
      { kind: 'landmark', asset: 'TOWN_MAPS_003_158X278', w: 165, h: 291, at: [1350, 700], pad: 8, name: '民居' },
      // 三大店铺 + 告示板
      { kind: 'landmark', asset: 'TOWN_SHOP', w: 300, h: 300, at: [2900, 2450], pad: 8, name: '杂货铺' },
      { kind: 'landmark', asset: 'TOWN_WEAPON_SHOP', w: 290, h: 290, at: [700, 2650], pad: 8, name: '铁匠铺' },
      { kind: 'landmark', asset: 'TOWN_POTION_SHOP', w: 300, h: 300, at: [2750, 1450], pad: 8, name: '药剂店' },
      { kind: 'landmark', asset: 'TOWN_QUEST_BOARD', w: 150, h: 150, at: [520, 1750], pad: 6, name: '告示板' },
      // 中心广场水井（放广场空地，不能贴路径转角——会被挖走廊 carve 掉）
      { kind: 'landmark', asset: WELL, w: 100, h: 118, at: [1350, 1250], pad: 6, name: '水井' },
      { kind: 'scatter', assets: DIRT_PATCHES, w: 72, h: 50, count: 22, area: [250, 250, 3500, 2500], minGap: 130, decor: true, name: '土斑' },
      { kind: 'scatter', assets: GRASS_TUFT, w: 36, h: 32, count: 45, area: [140, 140, 3720, 2720], minGap: 40, decor: true },
      { kind: 'scatter', assets: FLOWERS, w: 28, h: 28, count: 22, area: [140, 140, 3720, 2720], minGap: 44, decor: true },
    ],
  },

  /** 古城遗迹（第四章）—— 灰岩残垣阵 + 倒塌枯木 + 荒井，寸草斑驳 */
  ancient_ruins: {
    name: '古城遗迹',
    width: DEFAULT_MAP.width,
    height: DEFAULT_MAP.height,
    bg: { fill: '#6f5c46', dark: '#63513d', tile: 120, darkRatio: 0.38 },
    spawn: { x: 300, y: 2720 },
    boss: { x: 3480, y: 340 },
    corridor: 140,
    path: [
      [300, 2720], [950, 2320], [950, 1500], [2100, 1500], [2100, 820], [3480, 340],
    ],
    pathStroke: { color: 'rgba(228,212,178,0.15)', width: 130 },
    steps: [
      // 城界：大块灰岩垒砌的残垣
      { kind: 'border', asset: ROCK, w: 220, h: 208, spacing: 215, jitter: 28, inset: 22, pad: 10, name: '残垣' },
      // 倒塌柱础：灰岩群散布
      { kind: 'scatter', asset: ROCK, w: 170, h: 160, count: 14, area: [320, 320, 3360, 2360], minGap: 230, pad: 8, name: '塌柱' },
      // 枯木与断桩
      { kind: 'scatter', asset: DEAD_TREE, w: 96, h: 145, count: 12, area: [300, 300, 3400, 2400], minGap: 240, pad: 6, name: '枯木' },
      { kind: 'scatter', asset: STUMP, w: 72, h: 58, count: 16, area: [250, 250, 3500, 2500], minGap: 150, pad: 4, name: '朽桩' },
      { kind: 'scatter', asset: LOG, w: 90, h: 48, count: 10, area: [300, 300, 3400, 2400], minGap: 200, pad: 4, name: '断梁' },
      // 荒废水井地标（离路径 > corridor，防 carve）
      { kind: 'landmark', asset: WELL, w: 100, h: 118, at: [2400, 1800], pad: 6, name: '荒井' },
      { kind: 'scatter', asset: PEBBLES, w: 64, h: 41, count: 34, area: [220, 220, 3560, 2560], minGap: 100, pad: 4, name: '瓦砾' },
      { kind: 'scatter', assets: DIRT_PATCHES, w: 76, h: 52, count: 26, area: [220, 220, 3560, 2560], minGap: 120, decor: true, name: '斑驳地面' },
      { kind: 'scatter', assets: GRASS_TUFT, w: 38, h: 34, count: 40, area: [140, 140, 3720, 2720], minGap: 40, decor: true },
      { kind: 'scatter', asset: 'TOWN_GRASS_PILE', w: 52, h: 46, count: 14, area: [200, 200, 3600, 2600], minGap: 90, decor: true, name: '杂草堆' },
    ],
  },

  /** 虚无之雾（终章）—— 幽蓝石阵 + 枯木 + 幽光蓝旗，寸草不生 */
  void_mist: {
    name: '虚无之雾',
    width: DEFAULT_MAP.width,
    height: DEFAULT_MAP.height,
    bg: { fill: '#1d1b33', dark: '#181629', tile: 110, darkRatio: 0.42 },
    spawn: { x: 300, y: 2700 },
    boss: { x: 3200, y: 600 },
    corridor: 150,
    path: [
      [300, 2700], [1000, 2300], [1000, 1600], [1900, 1600], [1900, 1000], [2600, 1000], [3200, 600],
    ],
    pathStroke: { color: 'rgba(150,146,230,0.12)', width: 125 },
    steps: [
      { kind: 'border', asset: ROCK, w: 215, h: 202, spacing: 210, jitter: 30, inset: 25, pad: 10, name: '虚空石壁' },
      { kind: 'scatter', asset: ROCK, w: 165, h: 156, count: 12, area: [350, 350, 3300, 2300], minGap: 250, pad: 8, name: '虚空石阵' },
      // 幽光蓝旗路标：坐标按「碰撞中心到路径 > corridor(150)+余量」校准，贴路径会被 carveCorridor 挖掉
      { kind: 'row', asset: BANNER, w: 58, h: 133, from: [2100, 1310], to: [2100, 1120], count: 2, jitter: 14, pad: 6, name: '引魂旗' },
      { kind: 'row', asset: BANNER, w: 58, h: 133, from: [760, 2100], to: [760, 1900], count: 2, jitter: 14, pad: 6, name: '引魂旗' },
      { kind: 'row', asset: BANNER, w: 58, h: 133, from: [1300, 1700], to: [1700, 1700], count: 2, jitter: 14, pad: 6, name: '引魂旗' },
      { kind: 'scatter', asset: DEAD_TREE, w: 96, h: 145, count: 9, area: [320, 320, 3360, 2360], minGap: 260, pad: 6, name: '枯木' },
      { kind: 'scatter', asset: PEBBLES, w: 64, h: 41, count: 28, area: [250, 250, 3500, 2500], minGap: 110, pad: 4, name: '碎石' },
      { kind: 'scatter', asset: 'TOWN_FLOWER3', w: 30, h: 30, count: 18, area: [200, 200, 3600, 2600], minGap: 60, decor: true, name: '幽蓝花' },
    ],
  },

  /** 迷雾森林（探索区）—— 密林 + 灌木 + 林间水塘，曲折林道 */
  forest: {
    name: '迷雾森林',
    width: DEFAULT_MAP.width,
    height: DEFAULT_MAP.height,
    bg: { fill: '#24512f', dark: '#1e4a2b', tile: 100, darkRatio: 0.5 },
    spawn: { x: 240, y: 2760 },
    boss: { x: 3450, y: 280 },
    corridor: 120,
    path: [
      [240, 2760], [780, 2400], [780, 1800], [1500, 1800],
      [1500, 1200], [2300, 1200], [2300, 620], [3450, 280],
    ],
    pathStroke: { color: 'rgba(216,200,158,0.15)', width: 115 },
    steps: [
      { kind: 'border', asset: 'TOWN_TREE', w: 110, h: 190, spacing: 150, jitter: 22, inset: 20, pad: 10, name: '林墙' },
      { kind: 'scatter', asset: 'TOWN_TREE', w: 110, h: 190, count: 58, area: [180, 180, 3640, 2640], minGap: 145, pad: 10, name: '大树' },
      { kind: 'scatter', asset: 'TOWN_FOREST', w: 240, h: 190, count: 9, area: [260, 260, 3480, 2480], minGap: 250, pad: 10, name: '灌木丛' },
      { kind: 'scatter', assets: TREES_SMALL, w: 80, h: 72, count: 46, area: [180, 180, 3640, 2640], minGap: 85, pad: 6, name: '小树' },
      { kind: 'scatter', asset: ROCK, w: 60, h: 56, count: 16, area: [220, 220, 3560, 2560], minGap: 130, pad: 4, name: '苔石' },
      // 林间水塘（水面贴片，可通行遮挡无关紧要——只作视觉丰富）
      { kind: 'landmark', asset: 'TOWN_BUILDINGS_002_86X85', w: 230, h: 226, at: [2650, 2100], pad: 0, name: '水塘' },
      { kind: 'landmark', asset: 'TOWN_BUILDINGS_005_80X83', w: 160, h: 165, at: [1000, 900], pad: 0, name: '水洼' },
      { kind: 'scatter', assets: GRASS_TUFT, w: 38, h: 34, count: 70, area: [140, 140, 3720, 2720], minGap: 40, decor: true },
      { kind: 'scatter', asset: 'TOWN_GRASS_PILE', w: 50, h: 45, count: 24, area: [160, 160, 3680, 2680], minGap: 70, decor: true },
      { kind: 'scatter', assets: FLOWERS, w: 28, h: 28, count: 30, area: [140, 140, 3720, 2720], minGap: 40, decor: true },
    ],
  },

  /** 暗影洞穴（探索区）—— 灰岩洞壁 + 石笋阵，狭窄通道 */
  cave: {
    name: '暗影洞穴',
    width: DEFAULT_MAP.width,
    height: DEFAULT_MAP.height,
    bg: { fill: '#2c2b36', dark: '#272631', tile: 90, darkRatio: 0.45 },
    spawn: { x: 320, y: 2700 },
    boss: { x: 3100, y: 900 },
    corridor: 125,
    path: [
      [320, 2700], [900, 2400], [900, 1900], [1600, 1900],
      [1600, 1300], [2300, 1300], [2300, 1000], [3100, 900],
    ],
    pathStroke: { color: 'rgba(190,190,205,0.10)', width: 110 },
    steps: [
      // 洞壁：大块灰岩层层垒砌
      { kind: 'border', asset: ROCK, w: 225, h: 212, spacing: 195, jitter: 20, inset: 0, pad: 10, name: '洞壁' },
      { kind: 'scatter', asset: ROCK, w: 175, h: 165, count: 16, area: [400, 400, 3200, 2200], minGap: 220, pad: 8, name: '石笋' },
      { kind: 'scatter', asset: ROCK, w: 120, h: 114, count: 22, area: [300, 300, 3400, 2400], minGap: 160, pad: 6, name: '石笋' },
      { kind: 'scatter', asset: PEBBLES, w: 64, h: 41, count: 30, area: [200, 200, 3600, 2600], minGap: 100, pad: 4, name: '砾石' },
      { kind: 'scatter', asset: STUMP, w: 66, h: 53, count: 8, area: [350, 350, 3300, 2300], minGap: 200, pad: 4, name: '石化木' },
      { kind: 'scatter', asset: 'TOWN_GRASS3', w: 36, h: 32, count: 20, area: [160, 160, 3680, 2680], minGap: 50, decor: true, name: '苔藓' },
    ],
  },
}

/** 未配置主题的区域统一回落到草原，行为与 _getAreaInfo 的默认分支一致 */
const FALLBACK_THEME_ID = 'grassland'

// ────────────────────────────────────────────────────────────
// 七、构建入口
// ────────────────────────────────────────────────────────────

/** 生成结果缓存（同一进程内只算一次） */
const _cache = new Map()

/**
 * 构建指定区域的地图
 * @param {string} areaId
 * @returns {{ id:string, name:string, width:number, height:number,
 *             bg:Object, spawn:{x,y}, boss:{x,y}, corridor:number,
 *             path:Array, objects:Array, collisions:Array }}
 */
export function buildFieldMap(areaId) {
  const id = FIELD_MAP_THEMES[areaId] ? areaId : FALLBACK_THEME_ID
  if (_cache.has(id)) return _cache.get(id)

  const theme = FIELD_MAP_THEMES[id]

  let objects
  let collisions
  let spawn = theme.spawn
  let boss = theme.boss

  if (theme.legacy) {
    // ── 草原：原样复用，零回归 ──
    objects = GRASSLAND_MAP_OBJECTS
    collisions = generateGrasslandCollisions()
  } else {
    const rng = mulberry32(hashSeed(id))
    const ctx = {
      rng,
      obstacles: [],
      decorations: [],
      footprints: [],
      mapW: theme.width || DEFAULT_MAP.width,
      mapH: theme.height || DEFAULT_MAP.height,
    }
    for (const step of theme.steps || []) runStep(step, ctx)
    runPathDecor(theme, ctx)

    let merged = ctx.obstacles.concat(ctx.decorations)
    // 挖走廊：保证 spawn → boss 一定走得通
    if (theme.corridor > 0) merged = carveCorridor(merged, theme.path, theme.corridor)
    // 出生点 / Boss 点开圆场
    merged = clearCircle(merged, spawn.x, spawn.y, 240)
    merged = clearCircle(merged, boss.x, boss.y, 190)

    objects = merged
    collisions = buildCollisionsFromObjects(merged)
  }

  const result = {
    id,
    name: theme.name,
    width: theme.width || DEFAULT_MAP.width,
    height: theme.height || DEFAULT_MAP.height,
    bg: theme.bg,
    spawn,
    boss,
    corridor: theme.corridor || 0,
    path: theme.path || [],
    pathStroke: theme.pathStroke || null,
    objects,
    collisions,
  }
  _cache.set(id, result)
  return result
}

/** 取区域地图（带缓存；等价于 buildFieldMap，语义更清晰） */
export function getFieldMap(areaId) {
  return buildFieldMap(areaId)
}

/** 所有已配置的主题 id（供 devtools 遍历校验） */
export function listFieldMapThemes() {
  return Object.keys(FIELD_MAP_THEMES)
}

/** 清空生成缓存（仅供 devtools 校验「确定性」使用） */
export function __resetFieldMapCache() {
  _cache.clear()
}

/** 判断逻辑坐标点是否落在障碍里（怪物生成 / 宝箱投放避障） */
export function isPointInMapObstacle(logicX, logicY, radius = 60, collisions) {
  if (!collisions) return false
  for (const obs of collisions) {
    if (obs.type === 'rect') {
      const closestX = Math.max(obs.x, Math.min(logicX, obs.x + obs.width))
      const closestY = Math.max(obs.y, Math.min(logicY, obs.y + obs.height))
      const dx = logicX - closestX
      const dy = logicY - closestY
      if (dx * dx + dy * dy < radius * radius) return true
    } else if (obs.type === 'circle') {
      const dx = logicX - obs.x
      const dy = logicY - obs.y
      if (Math.sqrt(dx * dx + dy * dy) < radius + obs.radius) return true
    }
  }
  return false
}
