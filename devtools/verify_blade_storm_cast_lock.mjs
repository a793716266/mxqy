/**
 * verify_blade_storm_cast_lock.mjs
 * =========================================
 * 回归测试：臻宝「剑气风暴(blade_storm)」——释放锁 + 霸体不被打断动画。
 * 覆盖用户反馈的两个问题：
 *   问题1：释放时不允许移动、也不允许释放其他技能（包括 AI 也不能）。
 *   问题2：霸体的动画（连续突刺）不应被怪物攻击打断。
 *
 * 验证点：
 *   P1 玩家移动锁：施放后 castLockTimer > 0（X+Y 全锁），且期间递减。
 *   P2 玩家技能锁：blade_storm 进行中再按其他技能/普攻 → 提前 return（不消耗 token、状态机不被覆盖）。
 *   P3 霸体动画不被打断：blade_storm 进行中受 HP 伤害 → 不切受击动画(state 仍 attack)、_hurtLock 仍为 0、状态机不中断。
 *   P4 AI 技能锁：AI 施放 blade_storm 后 _castLock=1.2，期间再尝试施放其他技能 → 返回 false（被守卫拦截）。
 *   P5 AI 移动锁：AI _castLock>0 时 _updateAllyAI 完全不移动；解除锁后会向怪物移动（基准）。
 *   P6 AI 霸体动画：AI 施放 blade_storm（_castSuperArmor=true）受击 → 状态机 _aiCastingSkill 不被清除、sprite 不切 hurt。
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
if (!scene.battleSystem.attackRange) scene.battleSystem.attackRange = 100
if (!scene.playerSpeed) scene.playerSpeed = 200
if (!scene.battleSystem.pendingDamages) scene.battleSystem.pendingDamages = []
if (!scene.battleSystem.projectiles) scene.battleSystem.projectiles = []

const dt = 1 / 60
const ctrl = scene._getCurrentControlHero()
const hero = ctrl.hero
hero.hp = 200; hero.maxHp = 200; hero.mp = 999; hero._hurtLock = 0; hero._castInterrupted = false; hero._castSuperArmor = false
scene.battleSystem.battleHeroes = [scene.battleSystem.battleHeroes[0]] // 隔离仅保留主控（臻宝）

function makeTarget(x, y, hp) {
  return {
    id: 'tgt', name: '靶子', enemyId: 'wild_cat', alive: true,
    x: x != null ? x : ctrl.getPos().x + 60 * scene.dpr,
    y: y != null ? y : ctrl.getPos().y,
    hp: hp || 1000, maxHp: hp || 1000, def: 5, atk: 0, attackInterval: 999999, attackCDTimer: 999999,
    skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false
  }
}

const bsSkill = hero.skills.find(s => s.id === 'blade_storm')
assert(!!bsSkill && bsSkill.superArmor === true, '前置：臻宝 blade_storm 携带 superArmor=true')

// ===================== P1 / P2 / P3：玩家侧 =====================
console.log('\n=== P1/P2/P3：玩家施放剑气风暴 → 移动锁 + 技能锁 + 霸体动画不被打断 ===')
const tP = makeTarget()
scene.mapMonsters = [tP]
hero._hurtLock = 0; hero._castInterrupted = false; hero._castSuperArmor = false
scene.battleSystem.playerAnim = null
scene.battleSystem.castLockTimer = 0
scene.battleSystem.castAxisLockTimer = 0
const tokenBefore = hero._castToken || 0
scene._playerAttackMonster(tP, bsSkill)

// P1：全锁
assert(scene.battleSystem.castLockTimer > 0, 'P1 施放后 castLockTimer>0（X+Y 全锁移动）', `castLockTimer=${scene.battleSystem.castLockTimer}`)
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm', 'P1 playerAnim.type === blade_storm')
assert(hero._castSuperArmor === true, 'P1 施放后 _castSuperArmor === true')

// P2：blade_storm 进行中再按其他技能 → 应被拦截
const otherSkill = { id: 'test_atk', name: '普通攻击', type: 'attack', range: 100, power: 1, mpCost: 0 }
const tOther = makeTarget(ctrl.getPos().x - 80 * scene.dpr)
scene.mapMonsters = [tOther]
const tokenMid = hero._castToken
scene._playerAttackMonster(tOther, otherSkill)
assert(hero._castToken === tokenMid, 'P2 大招进行中按其他技能 → 不消耗新 castToken（被守卫拦截）', `token ${tokenMid}->${hero._castToken}`)
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm', 'P2 大招状态机未被其他技能覆盖')
assert(hero._castSuperArmor === true, 'P2 大招进行中 _castSuperArmor 仍为 true（未被普攻重置为 false）')

// P3：大招进行中被怪物打中 → 霸体动画不被打断
const hitX = ctrl.getPos().x, hitY = ctrl.getPos().y
const spriteStateBefore = scene.mainCharacterSprite.state
scene.mainCharacterSprite.state = 'attack' // 大招渲染态
scene._applyHeroDamage(hero, 20, hitX, hitY, { name: 'attacker', alive: true })
assert(scene.mainCharacterSprite.state === 'attack', 'P3 受击后主控 sprite.state 仍为 attack（未切 hurt，连续突刺动画不被打断）', `state=${scene.mainCharacterSprite.state}`)
assert(hero._hurtLock === 0, 'P3 受击后 _hurtLock 仍为 0（霸体不受击硬直）', `hurtLock=${hero._hurtLock}`)
assert(hero._castInterrupted === false, 'P3 受击后 _castInterrupted 仍为 false（霸体不被打断）')
assert(scene.battleSystem.playerAnim && scene.battleSystem.playerAnim.type === 'blade_storm', 'P3 受击后 blade_storm 状态机未被清除')

// 推进帧直到大招结束，确认 castLockTimer 在自然递减并解除
for (let i = 0; i < 200; i++) scene._updateBattleSystem(dt)
assert(scene.battleSystem.castLockTimer <= 0, 'P1 大招结束后 castLockTimer 已归零（锁自然解除，不卡死）', `castLockTimer=${scene.battleSystem.castLockTimer}`)
assert(hero._castSuperArmor === false, 'P1 大招结束后 _castSuperArmor 已复位为 false（不残留）', `super=${hero._castSuperArmor}`)

// ===================== P4 / P5 / P6：AI 侧 =====================
console.log('\n=== P4/P5/P6：AI 队友施放剑气风暴 → 技能锁 + 移动锁 + 霸体动画 ===')
// 构造一个拥有 blade_storm 的 AI 队友（合成 battle hero）
const allyHero = {
  id: 'ally_test', name: 'AI队友', role: 'warrior',
  hp: 200, maxHp: 200, mp: 999, maxMp: 999, atk: 50, def: 10, crit: 0.05,
  skills: [JSON.parse(JSON.stringify(bsSkill))],
  _aiSkillsCD: {}, _aiSkillLock: 0, _aiAttackCD: 0,
  _castLock: 0, _castAxisLock: 0, _castSuperArmor: false,
  _aiAttacking: false, _aiAttackTimer: 0, _aiCastingSkill: null, _hurtLock: 0
}
const allySprite = { state: 'idle', animFrame: 0, animTimer: 0, facingLeft: false, isMoving: false }
const allyPos = { x: ctrl.getPos().x + 200 * scene.dpr, y: ctrl.getPos().y }
const allyBh = { hero: allyHero, sprite: allySprite, isFollower: false, partyIndex: 1, getPos: () => allyPos }
scene.battleSystem.battleHeroes = [ctrl, allyBh]
scene.battleSystem.currentControlIndex = 0
scene.aiRecall = false
scene.followers = []
scene.battleSystem.pendingDamages = []
if (!scene.battleSystem.playerAttackInterval) scene.battleSystem.playerAttackInterval = 0.5

// 目标怪物（在 AI 队友附近，可被锁定）
const tAI = makeTarget(allyPos.x + 150 * scene.dpr, allyPos.y, 1000)
scene.mapMonsters = [tAI]

// P4：AI 成功施放 → _castLock=1.2 且记录 _aiCastingSkill；再尝试施放其他技能被拦截
const r1 = scene._allyTryCastSkill(allyBh, tAI, 1)
assert(r1 === true, 'P4 AI 成功施放剑气风暴')
assert(allyHero._castLock === 1.2, 'P4 AI 剑气风暴设置 _castLock=1.2（完全移动锁）', `lock=${allyHero._castLock}`)
assert(allyHero._aiCastingSkill && allyHero._aiCastingSkill.type === 'blade_storm', 'P4 AI 记录 _aiCastingSkill=blade_storm')
assert(allyHero._castSuperArmor === true, 'P4 AI 施放后 _castSuperArmor === true')
const r2 = scene._allyTryCastSkill(allyBh, tAI, 1)
assert(r2 === false, 'P4 大招施放期间（_castLock>0）AI 不能穿插其他技能（守卫拦截）')

// P5：移动锁 —— 解除 _castLock 与 _aiAttacking 后，AI 会向怪物移动（基准）；设 _castLock 后不移动
allyHero._castLock = 0
allyHero._aiAttacking = false; allyHero._aiAttackTimer = 0
allyHero._aiSkillLock = 0; allyHero._aiSkillsCD = {}
const beforeMove = { x: allyPos.x, y: allyPos.y }
scene._updateAllyAI(dt)
const movedBase = Math.hypot(allyPos.x - beforeMove.x, allyPos.y - beforeMove.y)
assert(movedBase > 0, 'P5 基准：AI 无锁定时会向怪物移动', `moved=${movedBase.toFixed(2)}`)

allyHero._castLock = 1.2
allyHero._aiAttacking = false; allyHero._aiAttackTimer = 0
const beforeLock = { x: allyPos.x, y: allyPos.y }
scene._updateAllyAI(dt)
const movedLock = Math.hypot(allyPos.x - beforeLock.x, allyPos.y - beforeLock.y)
assert(movedLock === 0, 'P5 AI _castLock>0 时完全不移动（大招站桩）', `moved=${movedLock}`)

// P6：AI 霸体动画不被打断 —— 受击后 _aiCastingSkill 不清、sprite 不切 hurt
// 让 _triggerHeroHurt 能找到 AI 的 sprite（加入 followers 的 character 通道）
scene.followers = [{ character: allyHero, sprite: allySprite }]
allyHero._castLock = 1.2
allySprite.state = 'skill' // AI 大招渲染态
const castBeforeHit = allyHero._aiCastingSkill
scene._applyHeroDamage(allyHero, 20, allyPos.x, allyPos.y, { name: 'attacker', alive: true })
assert(allyHero._aiCastingSkill === castBeforeHit && castBeforeHit && castBeforeHit.type === 'blade_storm', 'P6 受击后 AI 大招状态机未被清除（霸体不被打断）')
assert(allySprite.state === 'skill', 'P6 受击后 AI sprite.state 仍为 skill（未切 hurt，动画不被打断）', `state=${allySprite.state}`)
assert(allyHero._hurtLock === 0, 'P6 受击后 AI _hurtLock 仍为 0（霸体不受击硬直）', `hurtLock=${allyHero._hurtLock}`)

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed === 0 ? 0 : 1)
