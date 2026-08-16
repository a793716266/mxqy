/**
 * verify_blade_storm_superarmor.mjs
 * =========================================
 * 回归测试：臻宝「剑气风暴(blade_storm)」已被配置为霸体(superArmor)技能。
 * 验证点：
 *   1. 数据层：HEROES 中 zhenbao 的 blade_storm 技能 superArmor === true
 *   2. 运行时：施放后 hero._castSuperArmor === true（战斗逻辑读取 skill.superArmor）
 *   3. 视觉层：霸体光环判定 _heroSuperArmorOn(hero, isMain) === true（playerAnim 进行中）
 *   4. 抗打断：施放期间受 HP 伤害 → _castInterrupted 仍为 false（霸体不被打断）
 *   5. 对比：非霸体技能受同样伤害 → _castInterrupted 立即为 true（证明是 superArmor 标志在起作用）
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
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) { console.warn('[verify] require failed: ' + p); throw e }
}

const { HEROES } = await import('../scripts/data/heroes.js')
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

const dt = 1 / 60
const ctrl = scene._getCurrentControlHero()
const hero = ctrl.hero
hero.hp = 200; hero.maxHp = 200; hero.mp = 999; hero._hurtLock = 0; hero._castInterrupted = false
scene.battleSystem.battleHeroes = [scene.battleSystem.battleHeroes[0]] // 隔离仅保留臻宝

// 数据层校验
console.log('\n=== 1. 数据层：臻宝 blade_storm 配置 superArmor ===')
const zhenbao = HEROES.find(h => h.id === 'zhenbao')
assert(!!zhenbao, '找到臻宝数据')
const bsData = zhenbao && zhenbao.skills && zhenbao.skills.find(s => s.id === 'blade_storm')
assert(!!bsData, '臻宝技能含 blade_storm')
assert(bsData && bsData.superArmor === true, 'blade_storm.superArmor === true（数据已配置霸体）', bsData ? `superArmor=${bsData.superArmor}` : 'skill missing')

// 取运行时英雄身上的真实 blade_storm 技能对象
const bsSkill = hero.skills.find(s => s.id === 'blade_storm')
assert(!!bsSkill, '运行时 hero.skills 含 blade_storm')
assert(bsSkill && bsSkill.superArmor === true, '运行时技能对象携带 superArmor === true（透传未被归一化丢弃）')

// 放置一个靶子怪物（在吸附范围内），供施法与朝向
function makeTarget(hp) {
  return {
    id: 'tgt', name: '靶子', enemyId: 'wild_cat', alive: true,
    x: ctrl.getPos().x + 60 * scene.dpr, y: ctrl.getPos().y,
    hp, maxHp: hp, def: 5, atk: 0, attackInterval: 999999, attackCDTimer: 999999,
    skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false
  }
}

// ============ 用例A：施放剑气风暴（霸体）→ 光环显示 + 受击不打断 ============
console.log('\n=== 2. 施放剑气风暴 → 霸体光环显示，受击不打断 ===')
const tA = makeTarget(1000)
scene.mapMonsters = [tA]
hero._castInterrupted = false
hero._hurtLock = 0
scene.battleSystem.playerAnim = null
scene._playerAttackMonster(tA, bsSkill)
assert(hero._castSuperArmor === true, '施放后 hero._castSuperArmor === true', `super=${hero._castSuperArmor}`)
assert(hero._castToken > 0, '施放后 castToken 已生成')
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.timer > 0, 'playerAnim 进行中（timer>0）')
assert(scene._heroSuperArmorOn(hero, true) === true, '霸体光环判定为显示（isMain=true）')
assert(scene._heroSuperArmorOn(hero, false) === false, 'isMain=false 时不误判为主控（区分主控/队友通道）')

// 模拟施放期间被怪物打中（HP 伤害 → 触发 _interruptCastingForHero）
const x = ctrl.getPos().x, y = ctrl.getPos().y
scene._applyHeroDamage(hero, 15, x, y, { name: 'attacker', alive: true })
assert(hero._castInterrupted === false, '霸体施法期间受击 → _castInterrupted 仍为 false（不被打断）')
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm', '受击后 blade_storm 状态机未被清除（仍在释放）')
assert(hero._castSuperArmor === true, '受击后 _castSuperArmor 仍为 true')

// 推进若干帧，确认大招继续运行（timer 递减 / 仍在进行）
const timerBefore = scene.battleSystem.playerAnim.timer
for (let i = 0; i < 10; i++) scene._updateBattleSystem(dt)
assert(hero._castInterrupted === false, '持续推进 10 帧后仍未被打断')
assert(scene.battleSystem.playerAnim == null || scene.battleSystem.playerAnim.timer < timerBefore, '剑气风暴状态机持续推进（timer 递减或已结束）')

// ============ 用例B（对比）：非霸体技能受同样伤害 → 立即被打断 ============
console.log('\n=== 3. 对比：非霸体技能受击 → 立即打断（证明 superArmor 标志是差异来源）===')
const normalSkill = { id: 'test_normal', name: '普通攻击', type: 'attack', range: 100, power: 1, mpCost: 0 }
const tB = makeTarget(1000)
scene.mapMonsters = [tB]
hero._castInterrupted = false
hero._hurtLock = 0
hero._castSuperArmor = false
scene.battleSystem.playerAnim = null
scene._playerAttackMonster(tB, normalSkill)
assert(hero._castSuperArmor === false, '普通技能施放后 _castSuperArmor === false（对照）')
scene._applyHeroDamage(hero, 15, x, y, { name: 'attacker', alive: true })
assert(hero._castInterrupted === true, '非霸体技能受击 → _castInterrupted === true（被打断）')

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed === 0 ? 0 : 1)
