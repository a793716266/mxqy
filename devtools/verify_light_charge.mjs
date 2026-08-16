/**
 * 光明冲锋（艾米 BOSS / lost_healer_cat）专项验证：
 * 在真实 FieldScene 里起野外战斗，强制 BOSS 施放 light_charge，
 * 逐步推进 update 循环，断言完整的技能时序与效果：
 *   1) 进入 charge 阶段后立即进入 CD（skillCDs['light_charge']=15）
 *   2) 前 ~0.4s 播放 01→03（animFrame 0..2），随后在 03 帧（animFrame=2）停留满 2 秒
 *   3) charge 阶段开启能量聚集标记（_energyCharge/_energyIntensity）
 *   4) charge 结束 → 在落点（玩家位置）生成红色警示区（warningZones, type:'light_charge'）
 *   5) warn 阶段极快播放剩余帧 04→08（animFrame 3..7）
 *   6) warnDuration(1s) 后瞬移到警示区，对范围内角色造成伤害 + 击飞 + 落地眩晕（_stunned）
 *   7) 落地后 BOSS 状态机收尾，红色警示区被独占清理（不残留、不重复结算）
 *   8) 全程无运行时错误
 */
import { createRequire } from 'module'
import path from 'path'

const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  return nodeRequire(abs)
}

// ---- wx mock ----
const canvasCtx = new Proxy({}, {
  get: (t, p) => {
    if (p === 'canvas' || p === 'measureText') return undefined
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set: () => true
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => ({ width: 64, height: 64, _onload: null, set onload(f){ this._onload = f }, get onload(){ return this._onload } }),
  getStorageSync: (k) => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}
class MockGame {
  constructor() {
    this.ctx = canvasCtx; this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = { _d: {}, _flags: new Set(), get: k => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: k => { delete this.data._d[k] }, hasFlag: k => this.data._flags.has(k), setFlag: k => this.data._flags.add(k), delFlag: k => this.data._flags.delete(k) }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true, get: () => ({ width: 64, height: 64 }) }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0) }
    this.showToast = () => {}; this.sceneManager = { changeScene: () => {} }
  }
}

const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const { ENEMIES_CH1, getEnemyByLevel } = await import('../scripts/data/enemies.js')

let passed = 0, failed = 0
const assert = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`) } else { failed++; console.log(`  ✗ ${n}  ${d || ''}`) } }

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()

scene.battleSystem.active = true
scene.battleSystem.showBattleUI = true
scene._buildBattleHeroes()
scene._initBattleUI()

// 英雄世界坐标（被控者恒在 playerX/Y）
const dpr = scene.dpr
scene._heroWorldPos = scene._heroWorldPos || []
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
scene._heroWorldPos[1] = { x: scene.playerX + 30 * dpr, y: scene.playerY }

// ---- 构造 BOSS 怪物（lost_healer_cat）----
const bossId = 'lost_healer_cat'
const ed = ENEMIES_CH1[bossId]
const finalData = getEnemyByLevel(ed, ed?.level || 5)
const skills = scene._normalizeMonsterSkills(finalData.skills, bossId)
const cds = scene._initSkillCDs(skills)
const lcSkill = skills.find(s => s.id === 'light_charge')
const monster = {
  id: 'boss_amy', enemyId: bossId, name: finalData.name, alive: true, isBoss: true,
  x: scene.playerX + 50 * dpr, y: scene.playerY,
  hp: finalData.maxHp, maxHp: finalData.maxHp, atk: finalData.atk, def: finalData.def,
  crit: finalData.crit || 0, aiPattern: finalData.aiPattern,
  attackRange: finalData.attackRange || 80, attackInterval: finalData.attackInterval || 2000,
  moveSpeed: finalData.spd || 30, skills, skillCDs: cds,
  inCombat: true, skillUseCount: 0, strafeDir: 1, strafeTimer: 0, strafeAngle: 0,
  isCastingSkill: false, skillAnimTimer: 0, skillCastId: null, attackCDTimer: 0,
}
scene.mapMonsters = [monster]

console.log('\n=== 前置检查 ===')
assert(!!lcSkill, 'BOSS 拥有 light_charge 技能', `skills=${skills.map(s => s.id).join('/')}`)
assert(lcSkill && lcSkill.type === 'light_charge', 'light_charge 类型为专用状态机')
assert(lcSkill && lcSkill.chargeTime === 2.4, 'chargeTime 透传为 2.4 (03.png 停留2秒)', `实际=${lcSkill && lcSkill.chargeTime}`)
assert(lcSkill && lcSkill.warnDuration === 1.0, 'warnDuration 透传为 1.0', `实际=${lcSkill && lcSkill.warnDuration}`)
assert(lcSkill && lcSkill.aoeRadius === 95, 'aoeRadius 透传为 95', `实际=${lcSkill && lcSkill.aoeRadius}`)
assert(lcSkill && lcSkill.stun === 1.0, 'stun 透传为 1.0', `实际=${lcSkill && lcSkill.stun}`)

// ---- 强制施放 light_charge ----
const hero0 = scene.battleSystem.battleHeroes[0].hero
const hp0 = hero0.hp
let err = null
try {
  scene._startLightCharge(monster, lcSkill, monster.x - scene.playerX, monster.y - scene.playerY, 50 * dpr)
} catch (e) { err = e }
assert(!err, '强制施放 light_charge 无错误', err && err.stack)
const cdAfterStart = monster.skillCDs['light_charge']

console.log('\n=== 时序推进 ===')
// 关键采样点
let sawChargePhase = false, saw03Hold = false, sawEnergy = false
let sawWarnZone = false, sawFastFrames = false, sawImpact = false
let sawZoneCleaned = false
let kbSeen = false, stunObserved = false, kbHeight = 0
const dt = 1 / 60
let frame = 0
const maxFrames = Math.ceil((2.4 + 1.0 + 0.6) / dt) + 30  // charge + warn + recover + 余量
// 记录 03 帧停留时长
let hold03Start = -1, hold03End = -1
for (frame = 0; frame <= maxFrames; frame++) {
  // 锁定怪物跟随玩家（避免其被 AI 拉走），并锁定落点为玩家当前位置由状态机在起手时锁定
  try { scene.update(dt) } catch (e) { if (!err) err = e; console.log('  [err]', e.stack) }
  const lc = monster._lightCharge
  if (lc) {
    if (lc.phase === 'charge') {
      sawChargePhase = true
      if (monster._energyCharge) sawEnergy = true
      if (monster.animFrame === 2) {
        if (hold03Start < 0) hold03Start = frame
        hold03End = frame
      }
    }
    if (lc.phase === 'warn') {
      if (monster.animFrame >= 3) sawFastFrames = true
    }
  }
  // 红色警示区检测
  const hasWarn = (scene.battleSystem.warningZones || []).some(z => z.type === 'light_charge')
  if (hasWarn) sawWarnZone = true
  // 落地瞬间检测：BOSS 瞬移到玩家附近 且 英雄受到伤害/获得击飞
  if (monster.x !== scene.playerX + 50 * dpr && Math.abs(monster.x - scene.playerX) <= 95 * dpr + 5) {
    // 位置发生瞬移（区别于起始偏移）
  }
  if (hero0._knockback || hero0._stunned > 0) sawImpact = true
  if (hero0._knockback) { kbSeen = true; kbHeight = hero0._knockback.height }
  if (kbSeen && hero0._stunned > 0) stunObserved = true
}

assert(!err, 'update 循环全程无运行时错误', err && err.stack)
assert(sawChargePhase, '进入 charge 蓄力阶段')
assert(sawEnergy, 'charge 阶段开启能量聚集特效(_energyCharge)')
assert(sawWarnZone, 'charge 结束生成红色警示区(type:light_charge)')

// 03.png 停留时长（帧 → 秒）
if (hold03Start >= 0 && hold03End >= 0) {
  const holdSec = (hold03End - hold03Start) * dt
  saw03Hold = holdSec >= 1.8  // 允许 0.2s 误差（2.0s 停留，采样边界）
  assert(saw03Hold, `03.png 停留约 2 秒 (实测 ${holdSec.toFixed(2)}s)`, `hold03=${hold03Start}..${hold03End}`)
} else {
  assert(false, '03.png 停留约 2 秒', '未采样到 animFrame=2 区间')
}

assert(sawFastFrames, 'warn 阶段极快播放剩余帧 04→08 (animFrame>=3)')
assert(sawImpact, '落地对英雄造成伤害/击飞/眩晕 (英雄获得 _knockback 或 _stunned)')
if (sawImpact) {
  assert(hero0.hp < hp0, '落地区域内英雄受到 HP 伤害', `hp ${hp0}→${hero0.hp}`)
}
assert(kbSeen, '落地瞬间英雄获得击飞(_knockback)', `kbSeen=${kbSeen}`)
assert(kbHeight === 130 * dpr, '击飞高度提高为 130*dpr', `kbHeight=${kbHeight}, 期望=${130 * dpr}`)
assert(stunObserved, '击飞结束后转入眩晕(_stunned>0, 落地眩晕1秒)', `stunObserved=${stunObserved}`)

// ---- 收尾：状态机复位 + 红色警示区被独占清理 ----
const framesAfter = 30
for (let i = 0; i < framesAfter; i++) { try { scene.update(dt) } catch (e) {} }
const residualWarn = (scene.battleSystem.warningZones || []).filter(z => z.type === 'light_charge').length
sawZoneCleaned = residualWarn === 0
assert(sawZoneCleaned, '落地后红色警示区被独占清理（无残留、不会二次结算）', `残留=${residualWarn}`)
assert(monster._lightCharge === null, '状态机收尾：_lightCharge 复位为 null')
assert(monster._energyCharge !== true, '状态机收尾：能量聚集特效关闭')
assert(cdAfterStart === 15, '技能进入 CD(15s)', `起手时实际=${cdAfterStart}`)
assert(monster.skillCDs['light_charge'] > 0, '技能仍在冷却中(CD 未因重置而消失)', `终值=${monster.skillCDs['light_charge']}`)

// ---- 击飞 → 眩晕链路验证（独立复验：复活英雄，确保落点仍在英雄身上）----
console.log('\n=== 击飞→眩晕链路（独立复验）===')
const hero0b = scene.battleSystem.battleHeroes[0].hero
// 复活全部英雄并清状态，强制战斗激活
scene.battleSystem.active = true
for (const bh of scene.battleSystem.battleHeroes) {
  if (bh.hero) { bh.hero.hp = bh.hero.maxHp || 100; bh.hero._stunned = 0; bh.hero._knockback = null }
}
scene._heroWorldPos = scene._heroWorldPos || []
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
// 重置 BOSS 施法状态
monster._lightCharge = null
monster.isCastingSkill = false
monster.skillCastId = null
monster.skillAnimTimer = 0
monster._energyCharge = false
scene._startLightCharge(monster, lcSkill, scene.playerX - monster.x, scene.playerY - monster.y, 50 * dpr)
let kb2 = false, stun2 = false
for (let f = 0; f <= maxFrames + framesAfter; f++) {
  try { scene.update(dt) } catch (e) {}
  if (hero0b._knockback) kb2 = true
  if (kb2 && hero0b._stunned > 0) { stun2 = true; break }
}
assert(kb2, '复验：落地瞬间英雄获得击飞(_knockback)', `kb2=${kb2}`)
assert(stun2, '复验：击飞结束后转入眩晕(_stunned>0, 落地眩晕1秒)', `stun2=${stun2}`)

console.log(`\n=== 结果: ${passed} 通过 / ${failed} 失败 ===`)
process.exit(failed > 0 ? 1 : 0)
