/**
 * verify_hurt_lock.mjs
 * =========================================
 * 回归测试：受击硬直锁（_hurtLock）。
 * 验证「任何角色（主角 / AI 队友 / 怪物）被打中瞬间完全无法行动
 *  —— 不能移动、不能攻击、不能放技能」，且锁会随时间解除。
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
function assert(cond, name) {
  if (cond) { passed++; console.log('  [OK] ' + name) }
  else { failed++; console.log('  [FAIL] ' + name) }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
scene.battleSystem.active = true
scene.battleSystem.currentControlIndex = 0
scene._buildBattleHeroes()
if (!scene.mapMonsters) scene.mapMonsters = []

const dt = 1 / 60
const ctrl = scene._getCurrentControlHero()
const hero = ctrl.hero
assert(!!hero, 'got controlled hero (main character)')

// 1. hero hurt sets _hurtLock
console.log('\n=== 1. hero hurt sets hurt-lock ===')
hero._hurtLock = 0
scene.mainCharacterSprite.state = 'idle'
scene._triggerHeroHurt(hero, false)
assert(hero._hurtLock > 0)
assert(Math.abs(hero._hurtLock - 0.28) < 1e-6)
hero._hurtLock = 0
scene._triggerHeroHurt(hero, true)
assert(Math.abs(hero._hurtLock - 0.5) < 1e-6)
hero._hurtLock = 0
scene._dealMonsterDamage({ name: 'm', alive: true, atk: 5, hasDealtDamage: false }, hero)
assert(hero._hurtLock > 0)

// 2. player cannot attack while locked
console.log('\n=== 2. player cannot attack/cast while locked ===')
hero._hurtLock = 0.3
scene.mainCharacterSprite.state = 'idle'
scene._playerAttackMonster(null)
assert(scene.mainCharacterSprite.state !== 'attack')
assert(hero._hurtLock > 0)
hero._hurtLock = 0
scene._playerAttackMonster(null)
assert(scene.mainCharacterSprite.state === 'attack')

// 3. hero lock decrements over time
console.log('\n=== 3. hero hurt-lock decrements per frame ===')
hero._hurtLock = 0.28
const before = hero._hurtLock
scene._updateHeroStatus(dt)
assert(hero._hurtLock < before)
hero._hurtLock = 0.28
for (let i = 0; i < 20; i++) scene._updateHeroStatus(dt)
assert(hero._hurtLock <= 0)

// 4. AI teammate cannot act while locked
console.log('\n=== 4. AI teammate cannot act while locked ===')
let mate = null
for (const h of scene.battleSystem.battleHeroes) {
  if (h.hero.id !== hero.id) { mate = h; break }
}
if (!mate) {
  console.log('  (note) no teammate, skip AI teammate case')
} else {
  const mpos = mate.getPos()
  const mateMon = {
    name: 'target', enemyId: 'wild_cat', alive: true,
    x: mpos.x, y: mpos.y, hp: 100, maxHp: 100, atk: 5, def: 2,
    skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false
  }
  scene.mapMonsters.push(mateMon)

  mate.hero._hurtLock = 0.3
  mate.hero._aiAttacking = false
  mate.hero._aiAttackCD = 0
  mate.hero._aiSkillLock = 999
  mate.hero._aiSkillsCD = {}
  mate.sprite.state = 'idle'
  scene._updateAllyAI(dt)
  assert(mate.hero._aiAttacking === false)
  assert(mate.sprite.state !== 'attack' && mate.sprite.state !== 'skill')
  assert(mate.hero._hurtLock > 0)

  mate.hero._hurtLock = 0
  mate.hero._aiAttacking = false
  mate.hero._aiAttackCD = 0
  mate.hero._aiSkillLock = 999
  mate.hero._aiSkillsCD = {}
  mate.sprite.state = 'idle'
  scene._updateAllyAI(dt)
  const acted = (mate.hero._aiAttacking === true) || (mate.sprite.state === 'attack') || (mate.sprite.state === 'skill')
  assert(acted)

  mate.hero._hurtLock = 0.3
  scene._updateHeroStatus(dt)
  assert(mate.hero._hurtLock < 0.3)
}

// 5. monster hurt sets _hurtLock
console.log('\n=== 5. monster hurt sets hurt-lock ===')
const mon = {
  name: 'mob', enemyId: 'wild_cat', alive: true,
  x: 400, y: 400, hp: 100, maxHp: 100, atk: 5, def: 2,
  skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false
}
scene.mapMonsters.push(mon)
scene._damageMonster(mon, 10)
assert(mon._hurtLock > 0)
assert(Math.abs(mon._hurtLock - 0.3) < 1e-6)

// 6. monster cannot act while locked
console.log('\n=== 6. monster cannot act while locked ===')
mon._hurtLock = 0.22
mon.isMoving = false; mon.isAttacking = false; mon.isCastingSkill = false
const mlockBefore = mon._hurtLock
scene._updateMonsterAttack(dt)
assert(mon._hurtLock < mlockBefore)
assert(mon.isMoving === false)
assert(mon.isAttacking === false && mon.isCastingSkill === false)

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
