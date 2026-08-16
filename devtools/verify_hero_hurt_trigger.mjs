/**
 * verify_hero_hurt_trigger.mjs
 * =========================================
 * 回归测试：验证怪物攻击英雄时，受击动画状态机被正确触发。
 * 直接复用 simulate_game.mjs 的微信环境 mock + 真实 FieldScene 加载方式，
 * 但只做最小断言：怪物近身伤害(_dealMonsterDamage) 与 通用伤害(_applyHeroDamage)
 * 都应把对应英雄的 CharacterSprite 切到 'hurt' 状态。
 */

// ==================== 全局 wx mock ====================
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

// ==================== mock Game ====================
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

// ==================== 加载真实场景 ====================
import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) { console.warn(`[verify] require 加载失败: ${p} ->`, e.message); throw e }
}

const mod = await import('../scripts/scenes/field-scene.js')
const FieldScene = mod.FieldScene

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()

console.log('\n=== 验证：受击动画触发链路 ===')
assert(!!scene.battleSystem, 'battleSystem 已创建')
assert(!!scene.mainCharacterSprite, 'mainCharacterSprite 已创建')
assert(scene.mainCharacter && scene.mainCharacter.id === 'zhenbao', 'mainCharacter 为臻宝', `实际: ${scene.mainCharacter && scene.mainCharacter.id}`)

// 激活战斗系统并构建参战英雄
scene.battleSystem.active = true
scene._buildBattleHeroes()
assert(scene.battleSystem.battleHeroes.length >= 1, '已构建参战英雄')
const zhenbao = scene.mainCharacter

// ---- 用例1：怪物近身接触伤害(_dealMonsterDamage) → 主角 hurt_01 ----
console.log('\n--- 用例1：怪物近身攻击主角(_dealMonsterDamage) ---')
const monster = { name: '坏猫', alive: true, atk: 10, x: scene.playerX + 40 * scene.dpr, y: scene.playerY, hasDealtDamage: false }
const hpBefore = zhenbao.hp
scene.mainCharacterSprite.state = 'idle'
scene._dealMonsterDamage(monster, zhenbao)
assert(zhenbao.hp < hpBefore, '主角受到伤害', `hp: ${hpBefore} -> ${zhenbao.hp}`)
assert(scene.mainCharacterSprite.state === 'hurt', "主角进入 'hurt' 状态", `实际: ${scene.mainCharacterSprite.state}`)
assert(scene.mainCharacterSprite._hurtVariant === 1, '使用 hurt_01 变体(普通受击)', `实际: ${scene.mainCharacterSprite._hurtVariant}`)
assert(Math.abs(scene.mainCharacterSprite._hurtTimer - 0.28) < 1e-6, '普通受击计时 0.28s', `实际: ${scene.mainCharacterSprite._hurtTimer}`)

// ---- 用例2：通用英雄伤害(_applyHeroDamage) → 主角 hurt_01 ----
console.log('\n--- 用例2：通用伤害结算(_applyHeroDamage) ---')
const mon2 = { name: '坏狗', alive: true, atk: 5 }
scene.mainCharacterSprite.state = 'idle'
scene._applyHeroDamage(zhenbao, 8, scene.playerX, scene.playerY, mon2)
assert(scene.mainCharacterSprite.state === 'hurt', "主角进入 'hurt' 状态", `实际: ${scene.mainCharacterSprite.state}`)
assert(scene.mainCharacterSprite._hurtVariant === 1, '使用 hurt_01 变体', `实际: ${scene.mainCharacterSprite._hurtVariant}`)

// ---- 用例3：被击飞(_triggerHeroHurt(hero,true)) → hurt_02 ----
console.log('\n--- 用例3：被击飞覆盖为 hurt_02 ---')
scene.mainCharacterSprite.state = 'idle'
scene._triggerHeroHurt(zhenbao, true)
assert(scene.mainCharacterSprite.state === 'hurt', "主角进入 'hurt' 状态", `实际: ${scene.mainCharacterSprite.state}`)
assert(scene.mainCharacterSprite._hurtVariant === 2, '使用 hurt_02 变体(被击飞)', `实际: ${scene.mainCharacterSprite._hurtVariant}`)
assert(Math.abs(scene.mainCharacterSprite._hurtTimer - 0.5) < 1e-6, '被击飞计时 0.5s', `实际: ${scene.mainCharacterSprite._hurtTimer}`)

// ---- 用例4：hurt 状态自动恢复 idle ----
console.log('\n--- 用例4：受击计时结束自动恢复 idle ---')
scene.mainCharacterSprite.state = 'hurt'
scene.mainCharacterSprite._hurtVariant = 1
scene.mainCharacterSprite._hurtTimer = 0.28
for (let i = 0; i < 20; i++) scene.mainCharacterSprite.update(1 / 60, false, true)
assert(scene.mainCharacterSprite.state === 'idle', "受击结束后恢复 'idle'", `实际: ${scene.mainCharacterSprite.state}`)

// ---- 用例5：队友(李小宝)受击也触发其 sprite（无专属 hurt 资源时回退 idle 不报错）----
console.log('\n--- 用例5：队友受击不报错(undefined) ---')
const lxb = scene.followers && scene.followers[0] && scene.followers[0].character
if (lxb) {
  const lxbSprite = scene.followers[0].sprite
  lxbSprite.state = 'idle'
  let err = null
  try { scene._dealMonsterDamage({ name: 'm', alive: true, atk: 5, hasDealtDamage: false }, lxb) } catch (e) { err = e }
  assert(err === null, '队友受击不抛异常', err && err.message)
} else {
  console.log('  (提示) 当前 followers 为空，跳过队友用例')
}

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
