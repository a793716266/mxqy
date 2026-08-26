/**
 * verify_blade_storm_superarmor.mjs
 * =========================================
 * 回归测试：臻宝「剑气风暴(blade_storm)」霸体(superArmor)期间，其动画绝不被打断。
 * 覆盖两类受击场景（此前测试的两处盲区）：
 *   1. 主控英雄(臻宝)自己被击 → 霸体豁免，动画继续
 *   2. 【队友(李小宝)被击】→ 不能串扰误杀臻宝的剑气风暴动画（用户真实 bug）
 * 同时验证 _castBladeStorm 自身落霸体标志（不再依赖 _playerAttackMonster 包装层）。
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
// ★ 关键：保留队友李小宝，构造一个最小英雄对象加入战斗，用于"队友被击"场景
const allyHero = {
  id: 'lixiaobao', name: '李小宝', hp: 200, maxHp: 200, mp: 999,
  _castToken: 0, _castInterrupted: false, _castSuperArmor: false,
  _hurtLock: 0, _aiAttacking: false, _aiAttackTimer: 0, _aiCastingSkill: null,
  _castAxisLock: 0, _castLock: 0, _buffs: [], _shield: 0
}
const allyPos = { x: ctrl.getPos().x + 120 * scene.dpr, y: ctrl.getPos().y }
scene.battleSystem.battleHeroes.push({ hero: allyHero, sprite: null, getPos: () => allyPos })

// 数据层校验
console.log('\n=== 1. 数据层：臻宝 blade_storm 配置 superArmor ===')
const zhenbao = HEROES.find(h => h.id === 'zhenbao')
assert(!!zhenbao, '找到臻宝数据')
const bsData = zhenbao && zhenbao.skills && zhenbao.skills.find(s => s.id === 'blade_storm')
assert(!!bsData, '臻宝技能含 blade_storm')
assert(bsData && bsData.superArmor === true, 'blade_storm.superArmor === true（数据已配置霸体）', bsData ? `superArmor=${bsData.superArmor}` : 'skill missing')

const bsSkill = hero.skills.find(s => s.id === 'blade_storm')
assert(!!bsSkill, '运行时 hero.skills 含 blade_storm')
assert(bsSkill && bsSkill.superArmor === true, '运行时技能对象携带 superArmor === true')

function makeTarget(hp) {
  return {
    id: 'tgt', name: '靶子', enemyId: 'wild_cat', alive: true,
    x: ctrl.getPos().x + 60 * scene.dpr, y: ctrl.getPos().y,
    hp, maxHp: hp, def: 5, atk: 0, attackInterval: 999999, attackCDTimer: 999999,
    skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false
  }
}

// ============ 用例A：真实入口施放剑气风暴（_playerAttackMonster 路由到 _castBladeStorm）============
console.log('\n=== 2. 真实入口施放 → 霸体标志 + playerAnim ===')
const tA = makeTarget(1000)
scene.mapMonsters = [tA]
hero._castInterrupted = false
hero._hurtLock = 0
scene.battleSystem.playerAnim = null
scene._playerAttackMonster(tA, bsSkill)
assert(hero._castSuperArmor === true, '施放后 hero._castSuperArmor === true（包装层+_castBladeStorm 双保险）', `super=${hero._castSuperArmor}`)
assert(hero._castToken > 0, '施放后 castToken 已生成')
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm' && scene.battleSystem.playerAnim.timer > 0, 'playerAnim 进行中（blade_storm, timer>0）')

// ============ 用例B：隔离验证 _castBladeStorm 自身落霸体标志（Fix 1 回归，不再依赖包装层）============
console.log('\n=== 3. 隔离验证 _castBladeStorm 自身落霸体标志 ===')
hero._castSuperArmor = false
hero._castInterrupted = false
hero._castToken = 0
scene.battleSystem.playerAnim = null
scene._castBladeStorm(bsSkill, ctrl)
assert(hero._castSuperArmor === true, '_castBladeStorm 自身把 superArmor 落到英雄实例（Fix1）', `super=${hero._castSuperArmor}`)
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm', '_castBladeStorm 自身建起 blade_storm playerAnim')
// 恢复
scene.battleSystem.playerAnim.timer = 5.0

// ============ 用例C：霸体抗打断 — 主控英雄(臻宝)自己被击 ============
console.log('\n=== 4. 霸体抗打断：臻宝自己被击 → 动画继续 ===')
hero._castInterrupted = false
hero._hurtLock = 0
scene.battleSystem.playerAnim = scene.battleSystem.playerAnim || { type: 'blade_storm', timer: 5.0 }
if (scene.battleSystem.playerAnim.type !== 'blade_storm') scene.battleSystem.playerAnim = { type: 'blade_storm', timer: 5.0 }
const x = ctrl.getPos().x, y = ctrl.getPos().y
scene._applyHeroDamage(hero, 15, x, y, { name: 'attacker', alive: true })
assert(hero._castInterrupted === false, '霸体施法期间受击 → _castInterrupted 仍为 false（不被打断）')
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm', '受击后 blade_storm 状态机未被清除（仍在释放）')
assert(hero._castSuperArmor === true, '受击后 _castSuperArmor 仍为 true')

// ============ 用例D（核心回归）：队友(李小宝)被击 → 臻宝剑气风暴动画不被串扰 ============
console.log('\n=== 5. 队友(李小宝)被击 → 臻宝剑气风暴动画存活（Fix2 核心回归）===')
// 确保臻宝正在施放且未被打断
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm', '前置：臻宝剑气风暴进行中')
// ★ 让李小宝真正处于"非霸体施法中"状态（_castToken>0 + 非霸体技能），
//   这样 _interruptCastingForHero 才会合法地把它标记打断——否则非施法英雄
//   命中后 early-return，根本不会置 _castInterrupted，那样就不是"互不污染"的对照了。
allyHero._castInterrupted = false
allyHero._hurtLock = 0
allyHero._castSuperArmor = false   // 李小宝非霸体
allyHero._castToken = 5            // 正在施法（普通攻击），命中应被打断
allyHero._aiCastingSkill = { id: 'ally_atk', name: '李小宝普攻', superArmor: false }
scene._applyHeroDamage(allyHero, 15, allyPos.x, allyPos.y, { name: 'attacker', alive: true })
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm', '李小宝被击后，臻宝的 blade_storm playerAnim 仍存在（未被误清）')
assert(hero._castInterrupted === false, '李小宝被击后，臻宝 _castInterrupted 仍为 false（主控霸体动画未被串扰打断）')
assert(allyHero._castInterrupted === true, '李小宝自身(非霸体·施法中)被击打断标记正确置位（各自状态互不污染）')
assert(allyHero._aiCastingSkill === null, '李小宝被打断后其自身施法状态被清空（仅影响自己，不波及臻宝）')

// 推进若干帧，确认大招继续运行（timer 递减 / 仍在进行）
const timerBefore = scene.battleSystem.playerAnim ? scene.battleSystem.playerAnim.timer : 0
for (let i = 0; i < 10; i++) scene._updateBattleSystem(dt)
assert(hero._castInterrupted === false, '队友被击后持续推进 10 帧，臻宝仍未被打断')
assert(scene.battleSystem.playerAnim == null || scene.battleSystem.playerAnim.timer < timerBefore || scene.battleSystem.playerAnim.timer > 0, '剑气风暴状态机持续推进（timer 递减或已正常结束）')

// ============ 用例E（对比）：非霸体技能受同样伤害 → 立即被打断 ============
console.log('\n=== 6. 对比：非霸体技能受击 → 立即打断（证明 superArmor 标志是差异来源）===')
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
