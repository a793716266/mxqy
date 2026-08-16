/**
 * verify_jump_warn.mjs
 * =========================================
 * 回归测试：怪物 jump_attack（跳跃攻击）预警技能应按配置 warnDuration（秒）延迟结算，
 * 而非被当成毫秒导致预警区在当帧瞬间到期（表现为"瞬间过来"）。
 * 同时校验预警圈半径取配置 damageRadius。
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

import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) { console.warn('[verify] require failed: ' + p); throw e }
}

const mod = await import('../scripts/scenes/field-scene.js')
const FieldScene = mod.FieldScene

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  [OK] ' + name) }
  else { failed++; console.log('  [✗] ' + name + (detail != null ? '  → ' + detail : '')) }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
const sys = scene.battleSystem
sys.active = true
scene._buildBattleHeroes()
const hero = sys.battleHeroes[0].hero
const dpr = scene.dpr

function makeMonster(name) {
  return {
    name, enemyId: 'm_' + name, x: 300, y: 400, atk: 12, def: 14,
    hp: 110, maxHp: 110, alive: true, skills: [], skillCDs: {}
  }
}
function castJump(monster, warnDuration, damageRadius) {
  sys.warningZones = []
  const skill = { id: 'jump', name: '跳跃攻击', power: 1.5, type: 'jump_attack', range: 300, cooldown: 3, warnDuration, damageRadius }
  scene._fieldCastMonsterSkill(monster, skill, hero, 1, 0, 100)
  return skill
}

console.log('\n=== 测试1: 史莱姆猫 跳跃攻击 warnDuration=1.5（秒）===')
const m1 = makeMonster('史莱姆猫')
castJump(m1, 1.5, 100)
assert(sys.warningZones.length === 1, '施法创建预警区')
const z1 = sys.warningZones[0]
assert(z1 && Math.abs(z1.timer - 1.5) < 0.02, '预警时长=配置秒数 1.5', z1 && z1.timer)
assert(z1 && Math.abs(z1.total - 1.5) < 0.02, 'total=1.5（渲染进度基准）', z1 && z1.total)
assert(z1 && Math.abs(z1.r / dpr - 100) < 1, '预警半径=damageRadius 100', z1 && (z1.r / dpr))
// 0.5s 内预警区不应消失（未到时被打断前：这里只驱动预警倒计时）
for (let f = 0; f < 30; f++) scene._fieldUpdateWarningZones(1 / 60)
assert(sys.warningZones.length === 1, '0.5s 时预警区仍在（未瞬间结算）')
// 再推进到 1.6s，预警区应到期移除（触发跳跃落地）
for (let f = 0; f < 90; f++) scene._fieldUpdateWarningZones(1 / 60)
assert(sys.warningZones.length === 0, '超过预警时长后预警区移除（进入跳跃落地）')
assert(m1.skillAnimTimer > 0, '施法状态时长与预警对齐（毫秒，>0）', m1.skillAnimTimer)

console.log('\n=== 测试2: 暗影鼠 暗影咬 warnDuration=1.0 / damageRadius=50 ===')
const m2 = makeMonster('暗影鼠')
castJump(m2, 1.0, 50)
const z2 = sys.warningZones[0]
assert(z2 && Math.abs(z2.timer - 1.0) < 0.02, '预警时长=1.0 秒', z2 && z2.timer)
assert(z2 && Math.abs(z2.r / dpr - 50) < 1, '预警半径=50', z2 && (z2.r / dpr))

console.log('\n=== 测试3: 默认 warnDuration（缺省）应≈1.0 秒，而非 0.001 秒 ===')
const m3 = makeMonster('缺省怪')
const skill3 = { id: 'jump', name: '跳跃攻击', power: 1.5, type: 'jump_attack', range: 300, cooldown: 3, damageRadius: 100 }
sys.warningZones = []
scene._fieldCastMonsterSkill(m3, skill3, hero, 1, 0, 100)
const z3 = sys.warningZones[0]
assert(z3 && z3.timer >= 0.9 && z3.timer <= 1.1, '缺省预警≈1.0 秒', z3 && z3.timer)

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
if (failed > 0) process.exit(1)
