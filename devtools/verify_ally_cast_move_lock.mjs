/**
 * verify_ally_cast_move_lock.mjs
 * =========================================
 * 回归测试：AI 控制的英雄（如臻宝）在施放技能期间应被锁定移动，不能自由走位。
 * 修复前：_allyTryCastSkill 只对 buff/heal 设 _castLock，其余技能（攻击/魔法/AOE/剑气风暴）无移动锁；
 *         且 AI 移动块从未读取 _castLock/_castAxisLock，0.8s 后英雄恢复自由 XY 移动（"放技能还能走位"）。
 * 验证点：
 *   A. 技能类型 → 施法锁分配正确：剑气风暴/BUFF → _castLock(全锁)；普攻/魔法/AOE → _castAxisLock(锁Y)
 *   B. 移动门控：_castLock>0 时完全不动；_castAxisLock>0 时锁 Y（X 可动）；无锁时自由移动
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
scene._buildBattleHeroes()
scene.battleSystem.currentControlIndex = 1   // ★ 必须在 _buildBattleHeroes 之后设置（该方法内部会重置 currentControlIndex=0），
                                            //   使 index0（臻宝）成为 AI 控制的队友，从而走 _updateAllyAI 移动分支
if (!scene.mapMonsters) scene.mapMonsters = []
scene._initBattleUI && scene._initBattleUI()

const dt = 1 / 60
const allies = scene.battleSystem.battleHeroes
assert(allies.length >= 2, '至少 2 名参战英雄（确保臻宝可作 AI 队友）')
const zhenbaoBH = allies[0]            // 假设 index0 为臻宝（人类英雄，走 _updateAllyAI 移动分支）
const hero = zhenbaoBH.hero
assert(hero.id === 'zhenbao' || hero.name === '臻宝', 'index0 为臻宝', `id=${hero.id},name=${hero.name}`)
// ★ Mock 一个 sprite 桩（真实游戏里 bh.sprite 是 CharacterSprite；harness 无渲染对象，移动块靠它判定 isMoving 且 if(!sprite) continue 会整段跳过）
zhenbaoBH.sprite = { state: 'idle', animFrame: 0, isMoving: false, facingLeft: false }
const ctrlBH = allies[1]
// 让所有英雄健康、无受击，避免干扰 AI 选技
for (const b of allies) { b.hero.hp = b.hero.maxHp || 100; b.hero._lastHitTime = 0; b.hero._buffs = [] }
hero._aiAttacking = false
hero._aiAttackTimer = 0
hero._aiSkillLock = 0

// ============ 用例 A：技能类型 → 施法锁分配正确 ============
// 用空地图（monsterCount=0）+ 仅一个可用技能，强制 _allyTryCastSkill 走轮转分支选中该技能
function castSkillAndCheck(skill, expectField, label) {
  scene.mapMonsters = []                 // 空地图 → 无怪 → 分支⑦选中唯一技能
  hero.skills = [skill]
  hero.mp = 999
  hero._aiSkillsCD = {}
  hero._aiSkillLock = 0
  hero._aiLastSkillIdx = -1
  hero._castLock = 0
  hero._castAxisLock = 0
  hero._aiAttacking = false
  hero._aiAttackTimer = 0
  const dummy = { id: 'd', name: 'd', x: 0, y: 0, def: 0, alive: true }
  const cast = scene._allyTryCastSkill(zhenbaoBH, dummy, 1)
  assert(cast === true, `[${label}] _allyTryCastSkill 成功施放`)
  const onLock = hero._castLock > 0
  const onAxis = hero._castAxisLock > 0
  if (expectField === 'castLock') {
    assert(onLock && !onAxis, `[${label}] 设置 _castLock（全锁）`, `castLock=${hero._castLock}, axis=${hero._castAxisLock}`)
  } else {
    assert(onAxis && !onLock, `[${label}] 设置 _castAxisLock（锁Y）`, `castLock=${hero._castLock}, axis=${hero._castAxisLock}`)
  }
}
const bladeStorm = hero.skills.find(s => s.id === 'blade_storm') || { id: 'blade_storm', name: '剑气风暴', type: 'blade_storm', mpCost: 25 }
const warCry = hero.skills.find(s => s.effect === 'atk_up') || { id: 'war_cry', name: '战吼', type: 'buff', effect: 'atk_up', mpCost: 8 }
// ★ 注意：0-MP 普攻(slash) 被 _allyTryCastSkill 的 isRealSkill 过滤排除（走普攻分支），
//   这里验证「攻击型真技能」走 _allyTryCastSkill 的锁分配，用 shield_bash(mpCost:5)。
const shieldBash = hero.skills.find(s => s.id === 'shield_bash') || { id: 'shield_bash', name: '盾击', type: 'attack', mpCost: 5, cooldown: 6 }
console.log('\n=== A. 技能类型 → 施法锁分配 ===')
castSkillAndCheck(bladeStorm, 'castLock', '剑气风暴(blade_storm)')
castSkillAndCheck(warCry, 'castLock', '战吼(buff)')
castSkillAndCheck(shieldBash, 'castAxis', '盾击(攻击型真技能)')

// ============ 用例 B：移动门控（_castLock / _castAxisLock）============
// 让每帧都走到移动块、且不被施法覆盖：大技能锁冷却 + 大普攻CD；用场景内怪物作移动目标
function setupMoveTarget(dx, dy) {
  scene.aiRecall = false
  const base = zhenbaoBH.getPos()
  const m = { id: 'tgt', name: '靶子', enemyId: 'wild_cat', alive: true,
    x: base.x + dx * scene.dpr, y: base.y + dy * scene.dpr, hp: 100, maxHp: 100, def: 5,
    atk: 0, attackInterval: 999999, attackCDTimer: 999999, skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false }
  scene.mapMonsters = [m]
  return base
}
function runMoveFrames(n) {
  for (let i = 0; i < n; i++) scene._updateAllyAI(dt)
}
function resetLocks() { hero._castLock = 0; hero._castAxisLock = 0; hero._aiAttacking = false; hero._aiAttackTimer = 0; hero._aiSkillLock = 9999; hero._aiAttackCD = 9999 }
function posNow() { const p = zhenbaoBH.getPos(); return { x: p.x, y: p.y } }

console.log('\n=== B. 移动门控 ===')
// B1：_castLock（全锁）→ 完全不动（水平目标）
{
  const base = setupMoveTarget(200, 0); resetLocks(); hero._castLock = 0.8
  const p0 = posNow(); runMoveFrames(5); const p1 = posNow()
  assert(p0.x === p1.x && p0.y === p1.y, '_castLock>0：水平目标下完全不动', `dx=${p1.x-p0.x}, dy=${p1.y-p0.y}`)
}
// B2：_castAxisLock（锁Y）→ 水平目标：X 可动、Y 不动
{
  const base = setupMoveTarget(200, 0); resetLocks(); hero._castAxisLock = 0.9
  const p0 = posNow(); runMoveFrames(5); const p1 = posNow()
  assert(Math.abs(p1.x - p0.x) > 1, '_castAxisLock>0：水平目标下 X 轴可移动', `dx=${p1.x-p0.x}`)
  assert(p1.y === p0.y, '_castAxisLock>0：水平目标下 Y 轴锁定不动', `dy=${p1.y-p0.y}`)
}
// B3：_castAxisLock（锁Y）→ 垂直目标：Y 完全不动（root）
{
  const base = setupMoveTarget(0, 200); resetLocks(); hero._castAxisLock = 0.9
  const p0 = posNow(); runMoveFrames(5); const p1 = posNow()
  assert(p1.y === p0.y, '_castAxisLock>0：垂直目标下 Y 轴锁定不动', `dy=${p1.y-p0.y}`)
}
// B4：无锁 → 自由移动（对照）
{
  const base = setupMoveTarget(200, 0); resetLocks()
  const p0 = posNow(); runMoveFrames(5); const p1 = posNow()
  assert(Math.abs(p1.x - p0.x) > 1, '无锁：水平目标下自由移动', `dx=${p1.x-p0.x}`)
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed === 0 ? 0 : 1)
