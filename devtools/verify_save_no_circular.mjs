/**
 * verify_save_no_circular.mjs
 *
 * 回归：存档 JSON 化崩溃（TypeError: Converting circular structure to JSON）
 *   根因：野外怪物是活对象，monster._lightCharge.zone.monsterRef === monster
 *        （光明冲锋警示区回引怪物），直接塞进存档 → DataManager.save() 整体失败。
 *
 * 验证三道防线：
 *   1. utils/save-sanitize.js: toSerializable 去瞬时态 / 断环 / 去函数
 *   2. FieldScene._persistMapMonsters(): 存档里只放纯数据快照
 *   3. DataManager.save(): safeStringify 兜底，任何脏数据都不会让存档写失败
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
  createImage: () => ({ width: 64, height: 64, _onload: null, set onload(f) { this._onload = f }, get onload() { return this._onload } }),
  getStorageSync: (k) => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}
class MockGame {
  constructor(dataAdapter) {
    this.ctx = canvasCtx; this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = dataAdapter || {
      _d: {}, _flags: new Set(),
      get: k => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: k => { delete this.data._d[k] },
      delete: k => { delete this.data._d[k] },
      hasFlag: k => this.data._flags.has(k), setFlag: k => this.data._flags.add(k), delFlag: k => this.data._flags.delete(k),
    }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true, get: () => ({ width: 64, height: 64 }) }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0) }
    this.showToast = () => {}; this.sceneManager = { changeScene: () => {} }
  }
}

const { toSerializable, safeStringify } = await import('../scripts/utils/save-sanitize.js')
const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const { ENEMIES_CH1, getEnemyByLevel } = await import('../scripts/data/enemies.js')
const { DataManager } = await import('../scripts/core/data-manager.js')

let passed = 0, failed = 0
const assert = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`) } else { failed++; console.log(`  ✗ ${n}  ${d || ''}`) } }

// ============================================================
console.log('\n【第 1 步】toSerializable 单元行为')
// ============================================================
{
  const src = { a: 1, _transient: { deep: 1 }, fn: () => {}, arr: [1, 2, { _x: 1, y: 2 }] }
  const out = toSerializable(src)
  assert(out.a === 1, '保留普通字段')
  assert(out._transient === undefined, '丢弃 `_` 前缀瞬时态')
  assert(out.fn === undefined, '丢弃函数')
  assert(out.arr[2].y === 2 && out.arr[2]._x === undefined, '递归净化数组内元素')

  const cyc = { name: 'monster' }
  cyc.self = cyc
  cyc.child = { back: cyc }
  const s = toSerializable(cyc)
  assert(s.name === 'monster', '环对象保留自身字段')
  assert(s.self === undefined && s.child.back === undefined, '循环引用被断开（祖先路径判定）')
  let ok = true
  try { JSON.stringify(s) } catch (e) { ok = false }
  assert(ok, '净化后可 JSON 序列化')

  // 共享引用（非循环）不应被误删
  const shared = { tag: 'skill' }
  const holder = { one: shared, two: shared }
  const hs = toSerializable(holder)
  assert(hs.one && hs.two && hs.one.tag === 'skill', '非环路的共享引用不被误删')

  // 深度/异常防护
  let deep = {}
  let cur = deep
  for (let i = 0; i < 50; i++) { cur.next = {}; cur = cur.next }
  let deepOk = true
  try { JSON.stringify(toSerializable(deep)) } catch (e) { deepOk = false }
  assert(deepOk, '超深结构被 maxDepth 截断且不抛错')
  assert(toSerializable(NaN) === null && toSerializable(Infinity) === null, 'NaN/Infinity 归一为 null')
}

// ============================================================
console.log('\n【第 2 步】safeStringify 兜底')
// ============================================================
{
  const cyc = { v: 1 }
  cyc.self = cyc
  let threw = false
  try { JSON.stringify(cyc) } catch (e) { threw = true }
  assert(threw, '原生 JSON.stringify 对环确实抛错（复现线上 BUG）')
  const json = safeStringify({ root: cyc })
  assert(typeof json === 'string' && json.length > 0, 'safeStringify 正常返回字符串')
  assert(JSON.parse(json).root.v === 1, 'safeStringify 保留有效数据')
}

// ============================================================
console.log('\n【第 3 步】真实场景：光明冲锋制造循环引用后存档')
// ============================================================
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()

scene.battleSystem.active = true
scene.battleSystem.showBattleUI = true
scene._buildBattleHeroes()

const dpr = scene.dpr
const bossId = 'lost_healer_cat'
const ed = ENEMIES_CH1[bossId]
const finalData = getEnemyByLevel(ed, ed?.level || 5)
const skills = scene._normalizeMonsterSkills(finalData.skills, bossId)
const lcSkill = skills.find(s => s.id === 'light_charge')
const monster = {
  id: 'grassland_monster_test_0', enemyId: bossId, name: finalData.name, alive: true, isBoss: true,
  x: scene.playerX + 50 * dpr, y: scene.playerY,
  hp: finalData.maxHp, maxHp: finalData.maxHp, atk: finalData.atk, def: finalData.def,
  crit: finalData.crit || 0, aiPattern: finalData.aiPattern,
  attackRange: finalData.attackRange || 80, attackInterval: finalData.attackInterval || 2000,
  moveSpeed: finalData.spd || 30, skills, skillCDs: scene._initSkillCDs(skills),
  inCombat: true, skillUseCount: 0, strafeDir: 1, strafeTimer: 0, strafeAngle: 0,
  isCastingSkill: false, skillAnimTimer: 0, skillCastId: null, attackCDTimer: 0,
}
scene.mapMonsters = [monster]
scene._heroWorldPos = scene._heroWorldPos || []
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }

assert(!!lcSkill, 'BOSS 具备 light_charge 技能')
scene._startLightCharge(monster, lcSkill, 50 * dpr, 0, 50 * dpr)

// 推进到 warn 阶段：lc.zone 被创建，zone.monsterRef === monster → 构成环
const dt = 1 / 60
for (let i = 0; i < Math.ceil(2.4 / dt) + 6; i++) scene.update(dt)
const lc = monster._lightCharge
assert(!!lc && !!lc.zone, '进入 warn 阶段并生成警示区 zone')
assert(lc && lc.zone && lc.zone.monsterRef === monster, '复现循环引用：zone.monsterRef === monster')

// 复现原始崩溃：直接把活怪物塞进存档
let crashed = false
try { JSON.stringify({ areas: { grassland: { monsters: [monster] } } }) } catch (e) { crashed = true }
assert(crashed, '未净化时 JSON.stringify 抛错（BUG 复现）')

// ★ 修复点：走 _persistMapMonsters 快照
const snap = scene._persistMapMonsters()
assert(Array.isArray(snap) && snap.length === 1, '快照保留 1 只怪物')
assert(snap[0]._lightCharge === undefined, '快照不含 _lightCharge')
assert(snap[0]._jumpState === undefined && snap[0]._energyCharge === undefined, '快照不含其它 `_` 瞬时态')
assert(snap[0].isCastingSkill === false && snap[0].skillCastId === null, '快照复位施法状态')
assert(snap[0].id === monster.id && snap[0].enemyId === bossId, '快照保留 id / enemyId 等持久字段')
assert(Array.isArray(snap[0].skills) && snap[0].skills.length > 0, '快照保留技能配置')

let snapOk = true, snapErr = null
try { JSON.stringify(game.data.get('fieldMonsters_grassland')) } catch (e) { snapOk = false; snapErr = e.message }
assert(snapOk, '存档中的怪物数据可正常 JSON 序列化', snapErr || '')

// ============================================================
console.log('\n【第 4 步】DataManager.save() 兜底：脏数据也能存进去')
// ============================================================
{
  const dm = new DataManager()
  dm.load()
  // 模拟"某个模块忘了净化"，直接塞活对象
  dm.set('fieldMonsters_grassland', [monster])
  dm.set('gold', 1234)
  const ok = dm.save()
  assert(ok === true, 'DataManager.save() 返回 true（不再因环崩溃）')
  assert(typeof _storage['meow_star_save'] === 'string', '存档确实写入 storage')
  const dm2 = new DataManager()
  assert(dm2.load() === true, '重新读档成功')
  assert(dm2.get('gold') === 1234, '读档后普通字段（gold）保留')
  const restored = dm2.get('fieldMonsters_grassland')
  assert(Array.isArray(restored) && restored.length === 1, '读档后怪物数组保留')
  assert(restored[0] && restored[0].enemyId === bossId, '读档后怪物持久字段保留')
  assert(restored[0] && restored[0].hp === monster.hp, '读档后怪物 hp 保留')
}

// ============================================================
console.log('\n【第 5 步】读档恢复：怪物不会卡在冲锋/施法状态')
// ============================================================
{
  // 在快照上人为混入老存档脏数据（含瞬时态 + 环残留）验证恢复侧防御
  const dirty = JSON.parse(JSON.stringify(snap))
  dirty[0]._lightCharge = { phase: 'warn', zone: { monsterRef: null } }
  dirty[0]._jumpState = { t: 1 }
  dirty[0].isCastingSkill = true
  dirty[0].skillAnimTimer = 999999
  const game2 = new MockGame()
  game2.data.set('fieldMonsters_grassland', dirty)
  const scene2 = new FieldScene(game2, { area: 'grassland' })
  await scene2.init()
  const m2 = scene2.mapMonsters && scene2.mapMonsters[0]
  assert(!!m2, '从存档恢复出怪物')
  assert(m2 && m2._lightCharge === undefined, '恢复时剔除 _lightCharge')
  assert(m2 && m2._jumpState === undefined, '恢复时剔除 _jumpState')
  assert(m2 && m2.isCastingSkill === false, '恢复后不在施法中（不会卡死）')
  assert(m2 && m2.skillAnimTimer === 0, '恢复后技能计时归零')
  assert(m2 && Array.isArray(m2.statusEffects) && m2.statusEffects.length === 0, '恢复后状态效果清空')
}

console.log(`\n结果: ${passed} 通过 / ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
