/**
 * 复现并验证："切换李小宝后摇杆移动，臻宝原地播走路动画" bug
 * =========================================
 * 1) 切换控制到李小宝
 * 2) 模拟摇杆推动（game.input.joystick）
 * 3) 跑若干帧 update
 * 4) 断言：李小宝位置移动了（被控者正常移动）
 *          臻宝(mainCharacterSprite.isMoving) 为 false（不再原地踏步）
 *          臻宝位置不动（AI 站位逻辑：有怪则去站位，无怪静止）
 *
 * 用法: node scripts/tools/repro_switch_move.mjs
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) {
    console.warn(`[repro] require 失败: ${p} ->`, e.message)
    throw e
  }
}

const canvasCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas' || p === 'measureText') return undefined
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => {
    const img = { width: 64, height: 64 }
    setTimeout(() => { if (img.onload) img.onload() }, 0)
    return img
  },
  getStorageSync: (k) => _storage[k],
  setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}

class MockGame {
  constructor() {
    this.ctx = canvasCtx
    this.width = 750 * 3
    this.height = 1334 * 3
    this.dpr = 3
    this.data = {
      _d: {}, _flags: new Set(),
      get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v },
      del: (k) => { delete this.data._d[k] },
      hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k),
    }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = {
      taps: [],
      joystick: { active: false, dx: 0, dy: 0, dist: 0 },
      consumeTaps: () => this.input.taps.splice(0, this.input.taps.length),
    }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
  }
}

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

const { FieldScene } = await import('../scenes/field-scene.js')
console.log('[repro] 加载真实 FieldScene OK')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()

const sys = scene.battleSystem
sys.active = true
sys.showBattleUI = true
scene._buildBattleHeroes()
scene._initBattleUI()

// 切换控制到李小宝
scene._switchControl()
assert(sys.battleHeroes[0].hero.name === '李小宝', '切换后被控者为李小宝')

// 记录初始位置
const lxbStartX = scene.playerX, lxbStartY = scene.playerY
const heroPos0Start = { x: scene._heroWorldPos[0].x, y: scene._heroWorldPos[0].y }

// 模拟摇杆：在底座内按下并向右下拖（InputManager.touches 驱动 _updateJoystickInput）
const jc = scene.joystickConfig
game.input.touches = {
  1: { x: jc.centerX, y: jc.centerY },
}
// 先按下一帧激活摇杆
scene.update(1/60)
// 向右下拖动（dx=100, dy=60，超出死区）
game.input.touches = {
  1: { x: jc.centerX + 100, y: jc.centerY + 60 },
}

// 跑 30 帧（0.5秒），李小宝应以 playerSpeed 移动
let lxbMoved = false
for (let f = 0; f < 30; f++) {
  scene.update(1/60)
  const dx = scene.playerX - lxbStartX
  const dy = scene.playerY - lxbStartY
  if (Math.hypot(dx, dy) > 1) lxbMoved = true
}

console.log(`\n  李小宝(被控)位移: (${Math.round(scene.playerX - lxbStartX)}, ${Math.round(scene.playerY - lxbStartY)})`)
assert(lxbMoved, '被控的李小宝随摇杆移动', `位移 ${Math.round(scene.playerX - lxbStartX)},${Math.round(scene.playerY - lxbStartY)}`)

// 关键断言：臻宝（mainCharacterSprite）的位置移动状态与动画必须一致（不能原地踏步）
const zhenDX = scene._heroWorldPos[0].x - heroPos0Start.x
const zhenDY = scene._heroWorldPos[0].y - heroPos0Start.y
const zhenPosMoved = Math.abs(zhenDX) > 1 || Math.abs(zhenDY) > 1
console.log(`  臻宝 isMoving=${scene.mainCharacterSprite.isMoving} facingLeft=${scene.mainCharacterSprite.facingLeft}`)
console.log(`  臻宝位置变化: (${Math.round(zhenDX)}, ${Math.round(zhenDY)}) 是否移动=${zhenPosMoved}`)

// ★ 核心断言：动画 isMoving 必须与位置移动一致
//   - 若臻宝位置没动，则 isMoving 必须为 false（修复前是 true = 原地踏步）
//   - 若臻宝位置在动（去站位），isMoving 应为 true（正常）
if (!zhenPosMoved) {
  assert(scene.mainCharacterSprite.isMoving === false,
    '臻宝位置未移动时 isMoving=false（不原地踏步）', `实际 isMoving=${scene.mainCharacterSprite.isMoving}`)
} else {
  assert(scene.mainCharacterSprite.isMoving === true,
    '臻宝移动时 isMoving=true（动画与位移一致）', `实际 isMoving=${scene.mainCharacterSprite.isMoving}`)
}

// ==================== 场景2：地图无怪物，臻宝应安静待命不乱跑 ====================
console.log('\n=== 场景2: 清空怪物，臻宝应回撤待命 ===')
// 先禁用自动补充（_checkAndRespawnMonsters 会补到 10 只，导致"无怪"场景不成立）
scene._checkAndRespawnMonsters = () => {}
scene.mapMonsters = []   // 清空怪物
const zhenPosBefore = { x: scene._heroWorldPos[0].x, y: scene._heroWorldPos[0].y }
// 让被控的李小宝继续用摇杆往右下移动
for (let f = 0; f < 60; f++) {   // 1 秒
  scene.update(1/60)
}
const zhenDX2 = scene._heroWorldPos[0].x - zhenPosBefore.x
const zhenDY2 = scene._heroWorldPos[0].y - zhenPosBefore.y
console.log(`  无怪后臻宝位移: (${Math.round(zhenDX2)}, ${Math.round(zhenDY2)}) isMoving=${scene.mainCharacterSprite.isMoving}`)
// 无怪时臻宝应回到被控者(李小宝)身边待命，位移不应过大（回撤阈值 80*dpr=240px）
const zhenDistFromPlayer = Math.hypot(scene._heroWorldPos[0].x - scene.playerX, scene._heroWorldPos[0].y - scene.playerY)
console.log(`  臻宝与被控者距离: ${Math.round(zhenDistFromPlayer)} (阈值 ${Math.round(120 * scene.dpr)})`)
assert(zhenDistFromPlayer <= 120 * scene.dpr + 20,
  '无怪时臻宝回到被控者身边待命（不乱跑）', `距离=${Math.round(zhenDistFromPlayer)}`)
// 等待足够帧数让回撤完成（回撤速度≈427px/s，给足 4 秒）
for (let f = 0; f < 240; f++) scene.update(1/60)
assert(scene.mainCharacterSprite.isMoving === false,
  '无怪待命时臻宝静止（isMoving=false）', `实际 isMoving=${scene.mainCharacterSprite.isMoving}`)

// ==================== 场景3：角色与怪物不碰撞（两个角色一致） ====================
console.log('\n=== 场景3: 角色与怪物不碰撞（臻宝与李小宝一致） ===')
// 放一只怪在李小宝移动路径正前方（极近）
scene.mapMonsters = [{
  id: 'm_collide', name: '坏猫', enemyId: 'wild_cat', alive: true,
  x: scene.playerX + 30, y: scene.playerY,
  hp: 500, maxHp: 500, def: 5, atk: 10, level: 1,
  attackCDTimer: 0, attackInterval: 2000, skillCDs: {}
}]
// 记录进入战斗前的状态
const beforeActive = scene.battleSystem.active
const beforeEntering = scene.isEnteringBattle
// 被控的李小宝直接朝怪物方向摇杆移动（穿过它）
const c2x = scene.playerX
const c2y = scene.playerY
// 临时关障碍物碰撞，专注验证"角色与怪物"不碰撞
const origCheck2 = scene._checkObstacleCollision
scene._checkObstacleCollision = () => false
// 内联模拟摇杆：先按底座中心激活，再向右拖
game.input.touches = { 1: { x: jc.centerX, y: jc.centerY } }
scene.update(1/60)
game.input.touches = { 1: { x: jc.centerX + 100, y: jc.centerY } }
for (let f = 0; f < 40; f++) scene.update(1/60)
scene._checkObstacleCollision = origCheck2
const c2DX = scene.playerX - c2x
// 关键断言：穿过怪物没有被阻挡/没有触发进战斗
assert(Math.abs(c2DX) > 1, '被控角色穿过怪物不被阻挡', `位移 ${Math.round(c2DX)}`)
assert(scene.battleSystem.active === beforeActive && !scene.isEnteringBattle,
  '穿过怪物不触发进战斗', `active ${beforeActive}->${scene.battleSystem.active}`)
console.log(`  穿过怪物后: 位移 ${Math.round(c2DX)}, active=${scene.battleSystem.active}, isEnteringBattle=${scene.isEnteringBattle}`)

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
