/**
 * verify_grassland_no_regen_integration.mjs
 * =========================================
 * 真实流程集成验证：new FieldScene({area:'grassland'}) + init() 后，
 * 阳光草原副本(areaInfo.isDungeon===true) 内，被控主控英雄无装备时不自动回血回蓝。
 * 与 verify_dungeon_no_auto_regen 的区别：本测试走【真实场景构造】，
 * 证明 gate 依赖的 this.areaInfo.isDungeon 在真实 grassland 流程里确实为 true。
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
  try { return nodeRequire(abs) } catch (e) { console.warn('[verify] require failed: ' + p); throw e }
}

const { HEROES } = await import(path.resolve(projectRoot, 'scripts', 'data', 'heroes.js'))
const mod = await import(path.resolve(projectRoot, 'scripts', 'scenes', 'field-scene.js'))
const FieldScene = mod.FieldScene

class MockGame {
  constructor() {
    this.ctx = canvasCtx
    this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = { _d: {}, _flags: new Set(), get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: (k) => { delete this.data._d[k] }, hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k) }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0, this.input.taps.length) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
  }
}

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  [OK] ' + name) }
  else { failed++; console.log('  [FAIL] ' + name + (detail ? '  ' + detail : '')) }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
scene.battleSystem.active = true
scene._buildBattleHeroes()
if (!scene.mapMonsters) scene.mapMonsters = []

const dt = 1 / 60
const ctrl = scene._getCurrentControlHero()
const hero = ctrl.hero
assert(!!hero, '拿到被控主控英雄(臻宝)')

// ★ 关键前提：真实 grassland 流程里 areaInfo.isDungeon 必须为 true（gate 生效前提）
assert(scene.areaInfo && scene.areaInfo.isDungeon === true, '真实 grassland：areaInfo.isDungeon === true', `isDungeon=${scene.areaInfo && scene.areaInfo.isDungeon}`)

// ★ 模拟"无装备回血回蓝属性"：清零 regen（真实无 regen 装备时本就是 0/undefined）
hero.mpRegen = 0
hero.hpRegen = 0
hero.mp = 10
hero.maxMp = 100
hero.hp = 10
hero.maxHp = 200

const mpBefore = hero.mp, hpBefore = hero.hp
for (let i = 0; i < 120; i++) {
  scene._regenAllHeroMp(dt)
  scene._regenAllHeroHp(dt)
}

assert(hero.mp === mpBefore, '阳光草原·被控主控英雄 MP 不自动回复', `mp ${mpBefore}->${hero.mp}`)
assert(hero.hp === hpBefore, '阳光草原·被控主控英雄 HP 不自动回复', `hp ${hpBefore}->${hero.hp}`)

// ★ 对照：装上 mpRegen 装备后，同一场景应回蓝（"装备例外"仍成立）
hero.mpRegen = 8
const mpBefore2 = hero.mp
for (let i = 0; i < 120; i++) scene._regenAllHeroMp(dt)
assert(hero.mp > mpBefore2, '阳光草原·装备 mpRegen 后仍生效（例外成立）', `mp ${mpBefore2}->${hero.mp}`)

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed === 0 ? 0 : 1)
