/**
 * 验证：① 英雄受击泛红(_hurtFlash)  ② 怪物受击击退(非霸体)
 *   - 击退方向 = 远离攻击者
 *   - 霸体(永久/施放霸体技能)免疫
 *   - 落点撞障碍 → 取消击退
 *   - 越界 → 钳制在地图内（不推出地图）
 * 复用 simulate_game.mjs 的 wx mock + 真实 FieldScene 加载框架。
 */

// ==================== 全局 wx mock ====================
const canvasCtx = new Proxy({}, {
  get(t, p) { if (p === 'canvas' || p === 'measureText') return undefined; if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} }); return () => {} },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => { const img = { width: 64, height: 64 }; setTimeout(() => { if (img.onload) img.onload() }, 0); return img },
  getStorageSync: (k) => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}
class MockGame {
  constructor() {
    this.ctx = canvasCtx; this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = { _d: {}, _flags: new Set(), get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k) }
    this.assets = { get: () => ({ width: 64, height: 64 }), isLoaded: () => true }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => [] }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {}, changeSceneByObject: () => {} }
  }
}
import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => { const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p; return nodeRequire(abs) }

const { FieldScene } = await import(path.resolve(projectRoot, 'scripts/scenes/field-scene.js'))
const { CollisionEngine } = await import(path.resolve(projectRoot, 'scripts/engine/collision-engine.js'))

let passed = 0, failed = 0
function assert(cond, name, detail) { if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) } }

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
scene.battleSystem.active = true
scene.battleSystem.showBattleUI = true
scene._buildBattleHeroes()
const sys = scene.battleSystem
const dpr = scene.dpr

// 地图边界 + 碰撞引擎
scene.mapWidth = 2000 * dpr
scene.mapHeight = 1400 * dpr
const engine = new CollisionEngine({ dpr })
scene._collisionEngine = engine

const mkMonster = (over) => Object.assign({
  id: 'mt', name: '测试怪', alive: true, x: 500 * dpr, y: 500 * dpr,
  hp: 100, maxHp: 100, def: 0, atk: 5, level: 1, enemyId: 'wild_cat'
}, over)

console.log('\n=== A: 英雄受击泛红(_hurtFlash) ===')
const ctrlHero = sys.battleHeroes[0].hero
ctrlHero._hurtFlash = 0
scene._applyHeroDamage(ctrlHero, 20, scene.playerX, scene.playerY)
assert(ctrlHero._hurtFlash === 1, '受击后 _hurtFlash 置 1')
scene._updateBattleSystem(1 / 60)
assert(ctrlHero._hurtFlash > 0 && ctrlHero._hurtFlash < 1, '帧更新后 _hurtFlash 递减', `实际: ${ctrlHero._hurtFlash}`)
for (let i = 0; i < 60; i++) scene._updateBattleSystem(1 / 60)
assert(ctrlHero._hurtFlash === 0, '足够帧后 _hurtFlash 归零')

console.log('\n=== B: 非霸体怪物受击击退(远离攻击者) ===')
const mB = mkMonster({ x: 500 * dpr, y: 500 * dpr })
const x0 = mB.x
scene._damageMonster(mB, 10, { knockback: true, fromX: 0, fromY: 500 * dpr })
assert(mB.x > x0 + (18 * dpr - 1), '朝远离攻击者方向被击退', `Δx=${Math.round(mB.x - x0)} (期望≈${18 * dpr})`)
assert(mB._hurtLock > 0, '击退同时施加受击硬直')

console.log('\n=== C: 霸体怪物免疫击退 ===')
// C1 永久 superArmor
const mC1 = mkMonster({ x: 500 * dpr, y: 500 * dpr, superArmor: true })
const xC1 = mC1.x
scene._damageMonster(mC1, 10, { knockback: true, fromX: 0, fromY: 500 * dpr })
assert(mC1.x === xC1, '永久 superArmor 怪物不击退')
// C2 正在施放 superArmor 技能
const mC2 = mkMonster({ x: 500 * dpr, y: 500 * dpr, skills: [{ id: 'sa', superArmor: true }], skillCastId: 'sa' })
const xC2 = mC2.x
scene._damageMonster(mC2, 10, { knockback: true, fromX: 0, fromY: 500 * dpr })
assert(mC2.x === xC2, '施放霸体技能中怪物不击退')

console.log('\n=== D: 落点撞障碍 → 取消击退 ===')
// 障碍放在击退落点右侧（怪物被向左推的攻击者来自 x=0，故向右推；落点应被障碍吞掉）
engine.setObstacles([{ type: 'rect', x: 519, y: 500, width: 200, height: 200, name: '石柱' }])
const mD = mkMonster({ x: 500 * dpr, y: 500 * dpr })
const xD = mD.x
scene._damageMonster(mD, 10, { knockback: true, fromX: 0, fromY: 500 * dpr })
assert(mD.x === xD, '击退落点撞障碍时不位移(取消击退)', `Δx=${Math.round(mD.x - xD)}`)
engine.setObstacles([]) // 清障碍

console.log('\n=== E: 越界 → 钳制在地图内 ===')
const mE = mkMonster({ x: scene.mapWidth - 30 * dpr - 10, y: 500 * dpr })
const xE0 = mE.x
// 攻击者在怪物左侧(远处) → 击退方向向右(越界)
scene._damageMonster(mE, 10, { knockback: true, fromX: 0, fromY: 500 * dpr })
const maxX = scene.mapWidth - 30 * dpr
assert(mE.x <= maxX + 0.5, '击退后不超出地图右边界', `x=${Math.round(mE.x)} maxX=${Math.round(maxX)}`)
assert(mE.x >= xE0, '击退有效位移(向边界方向)后被钳制', `Δx=${Math.round(mE.x - xE0)}`)

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
