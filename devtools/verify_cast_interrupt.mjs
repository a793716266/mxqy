/**
 * verify_cast_interrupt.mjs
 * =========================================
 * 回归测试：非霸体技能被打断时，其待结算效果（延迟伤害 / 延迟弹道 / 技能过程 / BUFF）应一并作废；
 * 霸体(superArmor)技能不受打断影响，效果照常结算。
 * （已隔离：仅保留被控英雄，禁用怪物反击，避免 AI 队友/其他怪污染断言）
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

const dt = 1 / 60
const ctrl = scene._getCurrentControlHero()
const hero = ctrl.hero
assert(!!hero, 'got controlled hero')
hero.hp = 200; hero.maxHp = 200; hero.mp = 999; hero._hurtLock = 0; hero._castInterrupted = false
// ★ 隔离：仅保留被控英雄（臻宝），移除 AI 队友，避免其攻击污染"玩家技能是否造成伤害"的断言
scene.battleSystem.battleHeroes = [scene.battleSystem.battleHeroes[0]]
// 禁用怪物反击（永不主动攻击），保证只有玩家技能会扣怪血
function disableMonsterAttack(m) { m.atk = 0; m.attackInterval = 999999; m.attackCDTimer = 999999; m.skills = []; m.skillCDs = {}; m.isMoving = false; m.isAttacking = false; m.isCastingSkill = false }

const dmgSkill = { id: 'test_dmg', name: '测试伤害', mpCost: 5, cooldown: 2, type: 'attack', range: 100, axis: 'x', power: 1.5 }
const superSkill = { id: 'test_super', name: '霸体大招', mpCost: 5, cooldown: 2, type: 'attack', range: 100, axis: 'x', power: 1.5, superArmor: true }
const buffSkill = { id: 'test_buff', name: '测试护盾', mpCost: 5, cooldown: 2, type: 'buff', effect: 'def_up', value: 0.3, duration: 5 }
hero.skills = [dmgSkill, superSkill, buffSkill]

function makeTarget(hp) {
  const m = {
    id: 'tgt', name: '靶子', enemyId: 'wild_cat', alive: true,
    x: ctrl.getPos().x + 60 * scene.dpr, y: ctrl.getPos().y,
    hp, maxHp: hp, def: 5,
    skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false
  }
  disableMonsterAttack(m)
  return m
}
function drive(frames) { for (let i = 0; i < frames; i++) scene._updateBattleSystem(dt) }
function diag(tag) { console.log(`    [diag ${tag}] token=${hero._castToken} super=${hero._castSuperArmor} interrupted=${hero._castInterrupted} pd=${(scene.battleSystem.pendingDamages||[]).length} buffs=${JSON.stringify((hero._buffs||[]).map(b=>b.type))}`) }

// ============ 用例1：非霸体伤害技能被打断 → 延迟伤害作废 ============
console.log('\n=== 1. 非霸体伤害技能被打断 → 伤害不结算 ===')
const t1 = makeTarget(100)
scene.mapMonsters = [t1]
scene.battleSystem.pendingDamages = []
scene.battleSystem.pendingProjectiles = []
hero._castInterrupted = false
scene._playerAttackMonster(t1, dmgSkill)
diag('cast1')
assert((scene.battleSystem.pendingDamages || []).some(pd => pd.hero === hero && pd._castToken === hero._castToken), '施法后产生带 castToken 的延迟伤害')
assert(hero._castToken > 0, '施法 token 已生成')
scene._applyHeroDamage(hero, 20, ctrl.getPos().x, ctrl.getPos().y, { name: 'attacker', alive: true })
diag('interrupt1')
assert(hero._castInterrupted === true, '被打断置 _castInterrupted')
drive(40)
assert(t1.hp === 100, '被打断后目标怪物未受到伤害', `靶子HP=${t1.hp}`)

// ============ 用例2：霸体伤害技能被打断 → 伤害照常结算 ============
console.log('\n=== 2. 霸体(superArmor)技能被打断 → 伤害照常结算 ===')
const t2 = makeTarget(1000)
scene.mapMonsters = [t2]
scene.battleSystem.pendingDamages = []
scene.battleSystem.pendingProjectiles = []
hero._castInterrupted = false
hero._hurtLock = 0
scene._playerAttackMonster(t2, superSkill)
diag('cast2')
assert(superSkill.superArmor === true, '测试技能标记为霸体')
scene._applyHeroDamage(hero, 20, ctrl.getPos().x, ctrl.getPos().y, { name: 'attacker', alive: true })
diag('interrupt2')
assert(hero._castInterrupted === false, '霸体技能被打断时不置 _castInterrupted')
drive(40)
assert(t2.hp < 1000, '霸体技能伤害照常结算（靶子掉血）', `靶子HP=${t2.hp}`)

// ============ 用例3：非霸体 BUFF 技能被打断 → BUFF 回滚 ============
console.log('\n=== 3. 非霸体 BUFF 技能被打断 → BUFF 作废 ===')
scene.mapMonsters = [makeTarget(100)]
scene.battleSystem.pendingDamages = []
scene.battleSystem.pendingProjectiles = []
hero._castInterrupted = false
hero._hurtLock = 0
hero._buffs = []
scene._playerAttackMonster(null, buffSkill)
diag('cast3')
assert((hero._buffs || []).some(b => b.type === 'def_up'), 'BUFF 技能立即生效（def_up）')
assert((hero._buffs[0] && hero._buffs[0]._castToken) === hero._castToken, 'BUFF 带 castToken')
scene._applyHeroDamage(hero, 20, ctrl.getPos().x, ctrl.getPos().y, { name: 'attacker', alive: true })
diag('interrupt3')
assert(hero._castInterrupted === true, 'BUFF 施法被打断')
drive(2)
assert(!(hero._buffs || []).some(b => b.type === 'def_up'), '被打断后 BUFF 已回滚（def_up 消失）', `buffs=${JSON.stringify(hero._buffs)}`)

// ============ 用例4：未被打断时，非霸体技能正常结算 ============
console.log('\n=== 4. 未被打断 → 非霸体技能正常结算 ===')
const t4 = makeTarget(1000)
scene.mapMonsters = [t4]
scene.battleSystem.pendingDamages = []
scene.battleSystem.pendingProjectiles = []
hero._castInterrupted = false
hero._hurtLock = 0
scene._playerAttackMonster(t4, dmgSkill)
diag('cast4')
drive(40)
diag('drive4')
assert(t4.hp < 1000, '未打断时伤害正常结算', `靶子HP=${t4.hp}`)

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed === 0 ? 0 : 1)
