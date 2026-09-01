/**
 * verify_field_scene_themes.mjs
 * =============================
 * 真实场景集成验证：对 7 个区域逐个 `new FieldScene(game, {area})` + `init()`，
 * 断言「尺寸 / 出生点 / 碰撞体 / Boss 位 / 宝箱位 / 渲染」全部取自该区域的主题配置，
 * 而不是共用草原那一份。
 *
 * 与 verify_field_map_themes.mjs 的分工：
 *   - 后者验证「主题数据本身」正确（连通性 / 确定性 / 素材注册 / 越界）
 *   - 本脚本验证「FieldScene 真的接上了这套数据」（接线是否正确，而非数据是否正确）
 *
 * 运行：node --loader ./devtools/_dungeon_enemies_loader.mjs devtools/verify_field_scene_themes.mjs
 */

const canvasCtx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'canvas' || prop === 'measureText') return undefined
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => { const img = { width: 64, height: 64, _onload: null }; setTimeout(() => { if (img.onload) img.onload() }, 0); return img },
  getStorageSync: (k) => _storage[k],
  setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}

import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  return nodeRequire(abs)
}

const THEMES = await import(path.resolve(projectRoot, 'scripts', 'data', 'field-map-themes.js'))
const { FieldScene } = await import(path.resolve(projectRoot, 'scripts', 'scenes', 'field-scene.js'))

class MockGame {
  constructor() {
    this.ctx = canvasCtx
    this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = {
      _d: {}, _flags: new Set(),
      get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: (k) => { delete this.data._d[k] },
      hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k)
    }
    // ★ renderer-2.5d 走 assets.get(assetKey) 取图；mock 返回固定尺寸占位图，
    //   使渲染路径真正跑到 drawImage，而非在取图处提前短路。
    const _img = { width: 64, height: 64 }
    this.assets = {
      get: () => _img,
      getImage: () => _img,
      has: () => true,
      loadSubpackage: async () => {},
      isLoaded: () => true
    }
    this.audio = { play: () => {}, playBGM: () => {}, stopBGM: () => {}, playSound: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0, this.input.taps.length) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
  }
}

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  [OK] ' + name) }
  else { failed++; console.log('  [FAIL] ' + name + (detail ? '  → ' + detail : '')) }
}

const AREAS = ['grassland', 'magic_tower', 'merchant_town', 'ancient_ruins', 'void_mist', 'forest', 'cave']

console.log('═══ FieldScene 主题接入集成验证 ═══\n')

for (const area of AREAS) {
  console.log(`── 区域 [${area}] ──`)
  const theme = THEMES.getFieldMap(area)
  const game = new MockGame()
  let scene = null, initErr = null
  try {
    scene = new FieldScene(game, { area })
    await scene.init()
  } catch (e) {
    initErr = e
  }
  assert(!initErr, `${area}: 构造 + init() 不抛异常`, initErr && initErr.message)

  if (initErr) { console.log(''); continue }

  const dpr = scene.dpr

  // 1. 地图尺寸来自主题
  assert(scene.mapWidth === theme.width * dpr, `${area}: mapWidth 取自主题 (${theme.width})`,
    `实际 ${scene.mapWidth / dpr}`)
  assert(scene.mapHeight === theme.height * dpr, `${area}: mapHeight 取自主题 (${theme.height})`,
    `实际 ${scene.mapHeight / dpr}`)

  // 2. 出生点来自主题
  assert(Math.abs(scene.playerX - theme.spawn.x * dpr) < 0.001, `${area}: 出生点 X 取自主题 (${theme.spawn.x})`,
    `实际 ${scene.playerX / dpr}`)
  assert(Math.abs(scene.playerY - theme.spawn.y * dpr) < 0.001, `${area}: 出生点 Y 取自主题 (${theme.spawn.y})`,
    `实际 ${scene.playerY / dpr}`)

  // 3. 碰撞体来自主题（不再是 getMapCollisionsSync 对未知 id 返回 []）
  assert(Array.isArray(scene.obstacles) && scene.obstacles.length === theme.collisions.length,
    `${area}: 碰撞体数量 == 主题 (${theme.collisions.length})`,
    `实际 ${scene.obstacles && scene.obstacles.length}`)

  // 4. 出生点与 Boss 点不落在障碍内
  assert(!THEMES.isPointInMapObstacle(theme.spawn.x, theme.spawn.y, 16, scene.obstacles),
    `${area}: 出生点不在障碍内`)
  assert(!THEMES.isPointInMapObstacle(theme.boss.x, theme.boss.y, 16, scene.obstacles),
    `${area}: Boss 点不在障碍内`)

  // 5. Boss 实际生成在主题的 boss 锚点
  const boss = (scene.mapMonsters || []).find(m => m.isBoss)
  if (area === 'grassland' || scene.areaInfo.bossEnemy) {
    assert(!!boss, `${area}: 生成了 Boss (${scene.areaInfo.bossEnemy})`)
    if (boss) {
      assert(Math.abs(boss.x - theme.boss.x * dpr) < 0.001 && Math.abs(boss.y - theme.boss.y * dpr) < 0.001,
        `${area}: Boss 位于主题锚点 (${theme.boss.x},${theme.boss.y})`,
        `实际 (${Math.round(boss.x / dpr)},${Math.round(boss.y / dpr)})`)
    }
  }

  // 6. 宝箱沿主路径投放且可达
  const chests = (scene.mapObjects || []).filter(o => o.type === 'chest')
  assert(chests.length === 5, `${area}: 生成 5 个宝箱`, `实际 ${chests.length}`)
  const unreachable = chests.filter(c => THEMES.isPointInMapObstacle(c.x / dpr, c.y / dpr, 16, scene.obstacles))
  assert(unreachable.length === 0, `${area}: 全部宝箱不在障碍内`, `${unreachable.length} 个卡住`)

  // 7. 渲染不抛异常（覆盖 _renderProgrammaticMap + _renderYSortedEntities 两处改造）
  let renderErr = null
  try {
    scene._renderProgrammaticMap(canvasCtx)
    scene._renderYSortedEntities(canvasCtx)
  } catch (e) { renderErr = e }
  assert(!renderErr, `${area}: 渲染流程不抛异常`, renderErr && renderErr.message)

  // 8. 宝箱交互：点击收集 → 金币迸出粒子 + 飘字 + 开箱渲染不抛异常
  const chest0 = chests[0]
  scene._collectObject(chest0)
  assert(chest0.collected === true, `${area}: 宝箱点击后标记已收集`)
  const fxN = (scene._chestFx || []).length
  assert(fxN === 8, `${area}: 收集宝箱迸出 8 枚金币粒子`, `实际 ${fxN}`)
  const floater = (scene._dropFloaters || []).find(f => /金币/.test(f.text))
  assert(!!floater, `${area}: 生成「+N 金币」飘字`, '未找到飘字')
  let openRenderErr = null
  try {
    scene._renderYSortedEntities(canvasCtx)
    scene._renderChestFx(canvasCtx)
    scene._updateChestFx(0.016)
  } catch (e) { openRenderErr = e }
  assert(!openRenderErr, `${area}: 开箱特效渲染/更新不抛异常`, openRenderErr && openRenderErr.message)

  console.log('')
}

// ── 跨区域差异化：各区域的渲染对象集合必须互不相同（证明不再是「都画草原」）──
console.log('── 跨区域差异化 ──')
const sigs = new Map()
for (const area of AREAS) {
  const t = THEMES.getFieldMap(area)
  const sig = t.objects.map(o => `${o.assetKey}:${Math.round(o.x)}:${Math.round(o.y)}`).join('|')
  sigs.set(area, sig)
}
const uniq = new Set(sigs.values())
assert(uniq.size === AREAS.length, `7 个区域的对象布局两两不同（实际 ${uniq.size} 种）`,
  `存在共用布局，说明仍有区域复用同一份地图`)

// 各区域背景色互不相同
const bgs = AREAS.map(a => THEMES.getFieldMap(a).bg.fill)
assert(new Set(bgs).size === AREAS.length, `7 个区域地面配色两两不同`, bgs.join(','))

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exit(1)
