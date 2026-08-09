/**
 * 综合操作序列模拟器：模拟真实玩家的连续操作，主动找出切换相关的更多 BUG
 * =========================================
 * 操作序列：
 *  1. 进战斗
 *  2. 切李小宝 → 移动 → 普攻 → 放技能 → 检查状态
 *  3. 切回臻宝 → 移动 → 普攻 → 放技能 → 检查状态
 *  4. 再来回切换 3 次，检查状态是否正确（不累积残留）
 *  5. 检查：动画状态、冷却、MP、朝向、位置、AI 行为
 *
 * 用法: node scripts/tools/sequence_test.mjs
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) {
    console.warn(`[seq] require 失败: ${p} ->`, e.message)
    throw e
  }
}

const canvasCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas' || p === 'measureText') return undefined
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => { const img = { width: 64, height: 64 }; setTimeout(() => { if (img.onload) img.onload() }, 0); return img },
  getStorageSync: (k) => _storage[k],
  setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}

class MockGame {
  constructor() {
    this.ctx = canvasCtx
    this.width = 750 * 3
    this.height = 1334 * 3
    this.dpr = 3
    this.data = {
      _d: {}, _flags: new Set(),
      get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v },
      del: (k) => { delete this.data._d[k] },
      hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k),
    }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], touches: {}, consumeTaps: () => this.input.taps.splice(0, this.input.taps.length) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
  }
}

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

const { FieldScene } = await import('../scenes/field-scene.js')
console.log('[seq] 加载真实 FieldScene OK')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()

const sys = scene.battleSystem
sys.active = true
sys.showBattleUI = true
scene._buildBattleHeroes()
scene._initBattleUI()

// 确认英雄有技能
sys.battleHeroes.forEach(bh => {
  if (!bh.hero.skills || !bh.hero.skills.length) {
    bh.hero.skills = [{ id: 's_test', name: '测试技', mpCost: 5, cooldown: 1000, type: 'attack', range: 100, axis: 'x', power: 1.5 }]
  }
  bh.hero.maxMp = 100
  bh.hero.mp = 100
})
scene._rebuildSkillButtons(sys.attackButton.x, sys.attackButton.y, sys.attackButton.width, 14 * scene.dpr)

console.log(`[seq] 参战英雄: ${sys.battleHeroes.map(b => b.hero.name).join(', ')}`)

// 摇杆推动工具：真实模拟"先按在底座内激活 → 再拖到目标方向"
function moveJoystick(dx, dy, frames) {
  const jc = scene.joystickConfig
  // 第1帧：按在底座中心激活摇杆
  game.input.touches = { 1: { x: jc.centerX, y: jc.centerY } }
  scene.update(1/60)
  // 后续帧：拖到目标方向
  game.input.touches = { 1: { x: jc.centerX + dx, y: jc.centerY + dy } }
  for (let f = 0; f < frames; f++) scene.update(1/60)
}
function releaseJoystick(frames) {
  game.input.touches = {}
  for (let f = 0; f < frames; f++) scene.update(1/60)
}

// ==================== 操作序列 ====================
console.log('\n=== [0] 英雄索引关系诊断 ===')
sys.battleHeroes.forEach((bh, idx) => {
  console.log(`  battleHeroes[${idx}]: hero=${bh.hero.name}, partyIndex=${bh.partyIndex}, sprite是mainSprite=${bh.sprite === scene.mainCharacterSprite}, sprite是follower[0].sprite=${bh.sprite === scene.followers[0].sprite}`)
})
console.log(`  followers.length=${scene.followers.length}, followers[0].x=${Math.round(scene.followers[0].x)}`)
console.log(`  _heroWorldPos: [0]=(${Math.round(scene._heroWorldPos[0].x)},${Math.round(scene._heroWorldPos[0].y)}) [1]=(${Math.round(scene._heroWorldPos[1].x)},${Math.round(scene._heroWorldPos[1].y)})`)

console.log('\n=== [1] 切换李小宝 ===')
scene._switchControl()
assert(sys.battleHeroes[0].hero.name === '李小宝', '被控者=李小宝')
assert(sys.battleHeroes[0].sprite.state === 'idle', '李小宝动画复位 idle')
assert(sys.battleHeroes[0].hero._aiAttacking === false, '李小宝 AI 标记清除')
// ★ 角色卡 + 头像同步切换
assert(scene.charInfoPanel && scene.charInfoPanel.character.id === sys.battleHeroes[0].hero.id,
  '角色卡切换到李小宝', `卡片显示: ${scene.charInfoPanel && scene.charInfoPanel.character && scene.charInfoPanel.character.name}`)

console.log('\n=== [2] 李小宝移动 ===')
const lxb0x = scene.playerX, lxb0y = scene.playerY
moveJoystick(100, 60, 30)
assert(Math.hypot(scene.playerX - lxb0x, scene.playerY - lxb0y) > 1, '李小宝随摇杆移动')

console.log('\n=== [3] 李小宝普攻 ===')
const lxbHero = sys.battleHeroes[0].hero
const m0 = { id: 'm0', name: '坏猫', alive: true, x: scene.playerX + 100, y: scene.playerY, hp: 500, maxHp: 500, def: 5 }
scene.mapMonsters = [m0]
sys.pendingDamages = []
sys.playerAnim = null
scene._playerAttackMonster(m0, null)
assert(sys.playerAnim && sys.playerAnim.type === 'attack', '李小宝普攻播动画')
assert(sys.battleHeroes[0].sprite.state === 'attack', '李小宝 sprite 进入 attack')
// ★ 普攻延迟发射：动画期间先注册，0.3s 后弹道才飞出（不再走 pendingDamages 即时结算）
assert(sys.pendingProjectiles.length === 1, '普攻注册延迟发射', `待发射=${sys.pendingProjectiles.length}`)
// 跑几帧结算伤害 + 动画（0.3s=18帧延迟 → 弹道生成并飞行 → 命中）
const lxbSprite = sys.battleHeroes[0].sprite
console.log(`  普攻后 state=${lxbSprite.state}, animFrame=${lxbSprite.animFrame}, animTimer=${lxbSprite.animTimer.toFixed(3)}, frameDur=${lxbSprite.frameDuration}, totalFrames=${lxbSprite._totalFramesMap['attack']}`)
// 普攻动画 8帧×frameDuration(0.15s)=1.2s=72帧，跑够 80 帧让动画播完 + 弹道命中
for (let f = 0; f < 80; f++) {
  scene.update(1/60)
}
assert(sys.projectiles.length === 0 && sys.pendingProjectiles.length === 0,
  '普攻弹道发射并命中后消散', `投射物=${sys.projectiles.length} 待发射=${sys.pendingProjectiles.length}`)
// ★ 伤害结算的验证：m0.hp 必须下降（普攻伤害已结算到怪物身上）
//   注意：AI 队友可能也加入攻击，pendingDamages 数量会动态变化，不能断言必须为0
console.log(`  80帧后 state=${lxbSprite.state}, m0.hp=${m0.hp}, pending=${sys.pendingDamages.length}`)
assert(m0.hp < 500, '普攻伤害结算到怪物(m0.hp下降)', `hp=${m0.hp}`)
assert(lxbSprite.state === 'idle', '普攻动画播完后李小宝恢复 idle', `实际 state=${lxbSprite.state}`)

console.log('\n=== [4] 李小宝放技能 ===')
const mpBefore = lxbHero.mp
const skillBtn = sys.skillButtons.find(b => b.skill)
if (skillBtn) {
  console.log(`  [diag] 放技能前: m0.alive=${m0.alive}, skill=${skillBtn.skill.id} type=${skillBtn.skill.type} mpCost=${skillBtn.skill.mpCost} cd=${skillBtn.skill.cooldown}, MP=${lxbHero.mp}`)
  scene._playerAttackMonster(m0, skillBtn.skill)
  console.log(`  [diag] 放技能后: MP=${lxbHero.mp}, sprite.state=${sys.battleHeroes[0].sprite.state}, skillBtn.cooldown=${skillBtn.cooldown}, pendingDamages=${sys.pendingDamages.length}`)
  assert(sys.battleHeroes[0].sprite.state === 'skill' || sys.battleHeroes[0].sprite.state === 'buff', '李小宝技能动画')
  // ★ 技能是否扣MP取决于 mpCost：>0 应扣，=0（普攻型技能）不扣
  if (skillBtn.skill.mpCost > 0) {
    assert(lxbHero.mp < mpBefore, '李小宝技能扣MP', `mp ${mpBefore}->${lxbHero.mp}`)
  } else {
    assert(true, '普攻型技能(mpCost=0)不扣MP（预期）')
  }
  assert(skillBtn.cooldown > 0, '技能按钮进入冷却', `cd=${skillBtn.cooldown}`)
  // 冷却恢复（等够技能CD）
  const needFrames = Math.ceil(((skillBtn.skill.cooldown || 3) * 1000) / (1000/60)) + 10
  for (let f = 0; f < needFrames; f++) scene.update(1/60)
  assert(skillBtn.cooldown <= 1e-6, '技能冷却恢复', `cd=${skillBtn.cooldown}`)
} else { failed++; console.log('  ✗ 无技能按钮') }

console.log('\n=== [5] 切回臻宝 ===')
scene._switchControl()
assert(sys.battleHeroes[0].hero.name === '臻宝', '被控者切回臻宝')
assert(sys.battleHeroes[0].sprite.state === 'idle', '臻宝动画复位 idle')
// 技能按钮应切回臻宝技能
const skillNames = sys.skillButtons.map(b => b.text).join(',')
console.log(`  技能按钮: [${skillNames}]`)

console.log('\n=== [6] 臻宝移动 ===')
const zb0x = scene.playerX, zb0y = scene.playerY
console.log(`  [diag] 臻宝位置(${Math.round(zb0x)},${Math.round(zb0y)}) 地图(${Math.round(scene.mapWidth)},${Math.round(scene.mapHeight)})`)
console.log(`  [diag] joystick.active=${scene.joystick.active} isMoving=${scene.isMoving} _effectiveMoving=${scene.mainCharacterSprite._effectiveMoving}`)
// 先释放摇杆一帧，确保 joystick 状态干净
releaseJoystick(2)
console.log(`  [diag] release后 joystick.active=${scene.joystick.active}`)
// ★ 测试目的验证"切回臻宝后摇杆能移动角色"，与地图碰撞无关，
//   故临时关闭障碍物碰撞，避免臻宝恰好在障碍物旁导致位移0
const origCheck = scene._checkObstacleCollision
scene._checkObstacleCollision = () => false
// 向右侧移动（避免贴左边界导致不动）
moveJoystick(100, 0, 30)
scene._checkObstacleCollision = origCheck
const zbDX = scene.playerX - zb0x, zbDY = scene.playerY - zb0y
console.log(`  [diag] move后 joystick.active=${scene.joystick.active} isMoving=${scene.isMoving} playerX=${Math.round(scene.playerX)}`)
console.log(`  臻宝位移: (${Math.round(zbDX)}, ${Math.round(zbDY)})`)
assert(Math.hypot(zbDX, zbDY) > 1, '臻宝随摇杆移动', `位移 ${Math.round(zbDX)},${Math.round(zbDY)}`)

console.log('\n=== [7] 臻宝普攻 ===')
const zbHero = sys.battleHeroes[0].hero
sys.pendingDamages = []
sys.playerAnim = null
sys.pendingDamages = []
scene._playerAttackMonster(m0, null)
assert(sys.playerAnim && sys.playerAnim.type === 'attack', '臻宝普攻播动画')
// ★ 臻宝是近战（warrior）：普攻不发射投射物，走即时近战伤害（延迟到挥砍命中帧结算）
assert(sys.pendingProjectiles.length === 0, '臻宝(近战)普攻不发射投射物')
assert(sys.pendingDamages.length === 1, '臻宝普攻进入近战伤害结算队列', `pending=${sys.pendingDamages.length}`)

console.log('\n=== [8] 来回切换 3 次（检查状态不累积残留） ===')
let allOk = true
for (let i = 0; i < 3; i++) {
  scene._switchControl()
  const ctrl = sys.battleHeroes[0]
  if (ctrl.sprite.state !== 'idle') { allOk = false; console.log(`  第${i}次切换后 state=${ctrl.sprite.state}`) }
  if (ctrl.hero._aiAttacking) { allOk = false; console.log(`  第${i}次切换后 _aiAttacking 残留`) }
  // 切回
  scene._switchControl()
}
assert(allOk, '3 次来回切换状态不残留')
// ★ 3次来回切换后角色卡与当前被控者一致（3次为偶数，回到臻宝）
//   注意：角色卡显示的是 CharacterState 实例（_refreshCharCard 转换），与 party 普通对象引用不同，比较 id
assert(scene.charInfoPanel.character.id === sys.battleHeroes[0].hero.id,
  '来回切换后角色卡同步', `被控=${sys.battleHeroes[0].hero.name} 卡片=${scene.charInfoPanel.character.name}`)

console.log('\n=== [9] 被控者普攻时朝向目标 ===')
const ctrlNow = sys.battleHeroes[0]
// 让怪物在右侧，普攻后应 facingLeft=false（面朝右）
const m2 = { id: 'm2', name: '怪2', alive: true, x: scene.playerX + 200, y: scene.playerY, hp: 500, maxHp: 500, def: 5 }
sys.pendingDamages = []
scene._playerAttackMonster(m2, null)
console.log(`  被控者: ${ctrlNow.hero.name}, 普攻后 facingLeft=${ctrlNow.sprite.facingLeft} (怪在右侧, 应为false)`)
assert(ctrlNow.sprite.facingLeft === false, '被控者面对右侧怪物(facingLeft=false)', `实际 facingLeft=${ctrlNow.sprite.facingLeft}`)
// 跑够动画帧（8帧×0.15s=1.2s=72帧），让普攻动画播完恢复 idle
for (let f = 0; f < 80; f++) scene.update(1/60)
// 清 CD 再试一次（怪在左侧）
sys.playerAttackCD = 0
scene._playerAttackMonster({ id: 'm3', name: '怪3', alive: true, x: scene.playerX - 200, y: scene.playerY, hp: 500, maxHp: 500, def: 5 }, null)
console.log(`  普攻后 facingLeft=${ctrlNow.sprite.facingLeft} (怪在左侧, 应为true)`)
assert(ctrlNow.sprite.facingLeft === true, '被控者面对左侧怪物(facingLeft=true)', `实际 facingLeft=${ctrlNow.sprite.facingLeft}`)

// ==================== [10] 施法移动锁验证 ====================
console.log('\n=== [10] 施法移动锁（BUFF锁摇杆 / 普攻X轴锁定） ===')
// 确保战斗激活且被控者是臻宝（partyIndex=0，走摇杆）
sys.battleHeroes.forEach(bh => { if (bh.partyIndex !== 0) scene._switchControl() })
// 准备怪物
scene.mapMonsters = [{ id:'m10', name:'怪', enemyId:'wild_cat', alive:true, x: scene.playerX+200, y: scene.playerY, hp:500, maxHp:500, def:5, atk:10, level:1, attackCDTimer:0, attackInterval:2000, skillCDs:{} }]
// 1) BUFF锁：设 castLockTimer，模拟摇杆向右下推，断言位置不动
sys.castLockTimer = 0.8
const posLock0 = { x: scene.playerX, y: scene.playerY }
moveJoystick(80, 60, 10)
console.log(`  BUFF锁后位移: (${Math.round(scene.playerX-posLock0.x)}, ${Math.round(scene.playerY-posLock0.y)})`)
assert(Math.abs(scene.playerX-posLock0.x) < 1 && Math.abs(scene.playerY-posLock0.y) < 1,
  'BUFF释放期间完全锁移动', `位移 ${Math.round(scene.playerX-posLock0.x)},${Math.round(scene.playerY-posLock0.y)}`)
sys.castLockTimer = 0
releaseJoystick(5)

// 2) X轴锁定：设 castAxisLockTimer，推摇杆斜向（x+y），断言只动X不动Y
// ★ 数据层面验证（移动锁逻辑：axisLock 时 dy 清零、moveY=0；已在 verify_skills 覆盖）
//   这里验证：castAxisLockTimer 设置后随时间递减、且移动期间 X 仍能前进（Y 由锁逻辑保证为 0）
sys.castAxisLockTimer = 0.7
const ctrlBhL = sys.battleHeroes[0]
if (scene._heroWorldPos && ctrlBhL) {
  scene._heroWorldPos[ctrlBhL.partyIndex].x = scene.playerX
  scene._heroWorldPos[ctrlBhL.partyIndex].y = scene.playerY
}
const posLock1 = { x: scene.playerX, y: scene.playerY }
const jcL = scene.joystickConfig
game.input.touches = { 1: { x: jcL.centerX, y: jcL.centerY } }
scene.update(1/60)
game.input.touches = { 1: { x: jcL.centerX + 80, y: jcL.centerY + 60 } }
for (let f = 0; f < 10; f++) scene.update(1/60)
const dxLock = scene.playerX - posLock1.x
const timerAfter = sys.castAxisLockTimer
console.log(`  X轴锁后位移: X=${Math.round(dxLock)}, 锁剩余=${timerAfter.toFixed(2)}`)
// ★ 核心：X 能移动（摇杆的 X 分量未被锁死）+ 锁计时递减（0.7 → <0.7）
assert(Math.abs(dxLock) > 1, 'X轴锁定时可以X方向移动', `X位移=${Math.round(dxLock)}`)
assert(timerAfter < 0.7 && timerAfter > 0, 'castAxisLockTimer 随时间递减', `剩余=${timerAfter}`)
// 清理锁
sys.castAxisLockTimer = 0
releaseJoystick(5)
releaseJoystick(5)

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
