/**
 * verify_super_armor_fx.mjs
 * =========================================
 * 回归测试：霸体(superArmor)技能施放期间，应叠加可见的霸体光环特效。
 *  - _renderSuperArmorAura：英雄(金)/怪物(红)两种配色都正常绘制（含头顶「霸体」标记）
 *  - _heroSuperArmorOn：玩家(playerAnim.timer) / AI队友(_aiCastingSkill) 通道
 *  - _monsterSuperArmorOn：isCastingSkill + skillAnimTimer + _castingSkill.superArmor
 *  - 端到端：真实施放一次霸体技能 → 立即判定为 true；模拟施法结束(playerAnim=null) → 自动 false
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
  else { failed++; console.log('  [FAIL] ' + name + (detail ? '  ' + detail : '')) }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
scene.battleSystem.active = true
scene.battleSystem.currentControlIndex = 0
scene._buildBattleHeroes()
if (!scene.mapMonsters) scene.mapMonsters = []
scene._initBattleUI && scene._initBattleUI()
scene.time = 1

// ── 计数 ctx：统计绘制调用与文字 ──
function makeCountCtx() {
  const c = { arc: 0, fill: 0, stroke: 0, fillText: [], save: 0, restore: 0 }
  return {
    _c: c,
    save() { c.save++ }, restore() { c.restore++ },
    beginPath() {}, closePath() {},
    arc() { c.arc++ }, fill() { c.fill++ }, stroke() { c.stroke++ },
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, translate() {}, scale() {}, rotate() {},
    fillText(t) { c.fillText.push(t) },
    createRadialGradient() { return { addColorStop() {} } },
    createLinearGradient() { return { addColorStop() {} } },
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
    set globalCompositeOperation(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {}
  }
}

console.log('=== 1) _renderSuperArmorAura 绘制（英雄=金）===')
{
  const ctx = makeCountCtx()
  scene.dpr = 3
  scene._renderSuperArmorAura(ctx, 200, 400, false)
  assert(ctx._c.arc > 0, '英雄霸体光环有绘制(arc>0)', 'arc=' + ctx._c.arc)
  assert(ctx._c.fillText.includes('霸体'), '英雄头顶显示「霸体」文字', JSON.stringify(ctx._c.fillText))
}
console.log('=== 2) _renderSuperArmorAura 绘制（怪物=红）===')
{
  const ctx = makeCountCtx()
  scene._renderSuperArmorAura(ctx, 200, 400, true)
  assert(ctx._c.arc > 0, '怪物霸体光环有绘制(arc>0)', 'arc=' + ctx._c.arc)
  assert(ctx._c.fillText.includes('霸体'), '怪物头顶显示「霸体」文字', JSON.stringify(ctx._c.fillText))
}

console.log('=== 3) _heroSuperArmorOn 判定（isMain 通道）===')
{
  const fakeHero = { _castSuperArmor: false, _aiCastingSkill: null }
  scene.battleSystem.playerAnim = null
  // AI 队友通道 (isMain=false)
  fakeHero._aiCastingSkill = { superArmor: true }
  assert(scene._heroSuperArmorOn(fakeHero, false) === true, 'AI 施放霸体技能 → true')
  fakeHero._aiCastingSkill = { superArmor: false }
  assert(scene._heroSuperArmorOn(fakeHero, false) === false, 'AI 施放非霸体技能 → false')
  fakeHero._aiCastingSkill = null
  // 玩家通道 (isMain=true)：依赖真实 scene.party[0]
  const realHero = scene.party[0]
  scene.battleSystem.playerAnim = { timer: 0.5 }
  realHero._castSuperArmor = true
  assert(scene._heroSuperArmorOn(realHero, true) === true, '玩家 playerAnim 进行中 + 霸体 → true')
  scene.battleSystem.playerAnim = { timer: 0 } // 施法结束
  assert(scene._heroSuperArmorOn(realHero, true) === false, '玩家 playerAnim 结束 → false（光环自动熄灭）')
  scene.battleSystem.playerAnim = null
  realHero._castSuperArmor = false
  assert(scene._heroSuperArmorOn(realHero, true) === false, '非霸体空闲 → false')
}

console.log('=== 4) _monsterSuperArmorOn 判定 ===')
{
  const m1 = { isCastingSkill: true, skillAnimTimer: 500, _castingSkill: { superArmor: true } }
  assert(scene._monsterSuperArmorOn(m1) === true, '怪物施法(霸体) → true')
  const m2 = { isCastingSkill: true, skillAnimTimer: 500, _castingSkill: { superArmor: false } }
  assert(scene._monsterSuperArmorOn(m2) === false, '怪物施法(非霸体) → false')
  const m3 = { isCastingSkill: true, skillAnimTimer: 0, _castingSkill: { superArmor: true } }
  assert(scene._monsterSuperArmorOn(m3) === false, '施法计时归零 → false')
  const m4 = { isCastingSkill: false, skillAnimTimer: 500, _castingSkill: { superArmor: true } }
  assert(scene._monsterSuperArmorOn(m4) === false, '不在施法 → false')
}

console.log('=== 5) 端到端：真实施放霸体技能 → 立即可见，结束后熄灭 ===')
{
  const ctrl = scene._getCurrentControlHero()
  const hero = ctrl.hero
  hero.hp = 200; hero.maxHp = 200; hero.mp = 999; hero._hurtLock = 0; hero._castInterrupted = false
  scene.battleSystem.battleHeroes = [scene.battleSystem.battleHeroes[0]]
  const target = {
    id: 'tgt', name: '靶子', enemyId: 'wild_cat', alive: true,
    x: ctrl.getPos().x + 60 * scene.dpr, y: ctrl.getPos().y,
    hp: 100, maxHp: 100, def: 5,
    skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false, atk: 0
  }
  const superSkill = { id: 'test_super', name: '霸体大招', mpCost: 5, cooldown: 2, type: 'attack', range: 200, axis: 'x', power: 1.5, superArmor: true }
  hero.skills = [superSkill]

  scene._playerAttackMonster(target, superSkill)
  assert(hero._castSuperArmor === true, '施放后 hero._castSuperArmor=true')
  assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.timer > 0, '施放后 playerAnim.timer>0')
  assert(scene._heroSuperArmorOn(hero, true) === true, '施放瞬间 → 霸体光环应显示')

  // 模拟施法结束（playerAnim 归零，与 _updateBattle 行为一致）
  scene.battleSystem.playerAnim = null
  assert(scene._heroSuperArmorOn(hero, true) === false, '施法结束后 → 霸体光环自动熄灭')
}

console.log('\n结果：' + passed + ' 通过 / ' + failed + ' 失败')
process.exit(failed > 0 ? 1 : 0)
