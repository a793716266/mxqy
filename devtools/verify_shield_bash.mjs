/**
 * 验证臻宝盾击：突进(lunge) + 霸体 + 护盾延时 + 2.5D 层级显示
 * 用法: node devtools/verify_shield_bash.mjs
 */
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
  createImage: () => { const img = { width: 64, height: 64 }; setTimeout(() => img.onload && img.onload(), 0); return img },
  getStorageSync: k => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}
class MockGame {
  constructor() {
    this.ctx = canvasCtx; this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = { _d: {}, _flags: new Set(), get: k => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: k => { delete this.data._d[k] }, hasFlag: k => this.data._flags.has(k), setFlag: k => this.data._flags.add(k), delFlag: k => this.data._flags.delete(k) }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
  }
}
import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = p => { const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p; return nodeRequire(abs) }
const { FieldScene } = await import('../scripts/scenes/field-scene.js')

let passed = 0, failed = 0
const assert = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`) } else { failed++; console.log(`  ✗ ${n}  ${d || ''}`) } }
const fakeCtx = new Proxy({}, { get: (t, p) => (p === 'createRadialGradient' || p === 'createLinearGradient') ? () => ({ addColorStop() {} }) : () => {}, set: () => true })

console.log('\n=== 构建 + 初始化场景 ===')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
const dpr = scene.dpr
const sys = scene.battleSystem
sys.active = true
scene._buildBattleHeroes()
const zhenbao = sys.battleHeroes[0].hero
assert(zhenbao.id === 'zhen宝' || zhenbao.id === 'zhenbao', '被控者默认是臻宝', `id=${zhenbao.id}`)
// 怪物放在臻宝右侧（朝向 +x），确保突进方向 = +1
const monster = { id: 'm_sb', name: '坏猫', alive: true, enemyId: 'wild_cat', x: scene.playerX + 120 * dpr, y: scene.playerY, hp: 200, maxHp: 200, def: 5, atk: 10, level: 1, attackInterval: 9999, attackCDTimer: 9999 }
scene.mapMonsters = [monster]
scene._initBattleUI()
const sbBtn = (sys.skillButtons || []).find(b => b.skill && b.skill.id === 'shield_bash')
assert(!!sbBtn, '存在盾击技能按钮')

// ============ A. 霸体 + 护盾延时 + 突进位移（集成：真实 cast + 驱动 update） ============
console.log('\n=== A. 释放盾击：霸体 / 护盾延时 / 突进 ===')
assert(zhenbao._castSuperArmor !== true, '释放前无霸体标记')
const x0 = scene.playerX
scene.facingLeft = false
scene._playerAttackMonster(monster, sbBtn.skill)
assert(sys.playerAnim && sys.playerAnim.type === 'shield', '盾击进入 shield 动画', `type=${sys.playerAnim && sys.playerAnim.type}`)
assert(sys.playerAnim.lungeDist === 60 * dpr, '突进距离写入 playerAnim(60*dpr)', `lungeDist=${sys.playerAnim && sys.playerAnim.lungeDist}`)
assert(zhenbao._castSuperArmor === true, '释放瞬间即获得霸体(突进全程不被打断)', `=${zhenbao._castSuperArmor}`)
// 驱动 ~0.6s（> 突进0.18s + 命中延迟0.4s）
for (let f = 0; f < 36; f++) scene.update(1 / 60)
const x1 = scene.playerX
const lungeMoved = x1 - x0
assert(lungeMoved > 45 * dpr && lungeMoved < 70 * dpr, `突进使臻宝向前位移 ≈ ${Math.round(lungeMoved / dpr)}px(逻辑, 配置60)`, `Δ=${Math.round(lungeMoved / dpr)}`)
assert(zhenbao._shield > 0, '盾击生成护盾', `shield=${zhenbao._shield}`)
assert(zhenbao._shieldTimer > 3.0 && zhenbao._shieldTimer <= 4.0, `护盾持续 ≈4s(更长于旧2s): ${zhenbao._shieldTimer.toFixed(2)}s`, `=${zhenbao._shieldTimer}`)
assert(!!sys.castLockTimer || zhenbao._castSuperArmor, '突进期间移动被锁/霸体覆盖')

// ============ B. 突进撞障碍：整段取消（不穿墙） ============
console.log('\n=== B. 突进遇障碍取消（直接单元测 _applyShieldBashLunge） ===')
// 复位玩家到已知位置，正前方放一大块障碍物（逻辑坐标，setObstacles 会再 ×dpr，与真实地图数据一致）
scene.playerX = 1000 * dpr
scene.playerY = 1000 * dpr
if (!scene._heroWorldPos) scene._heroWorldPos = []
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
const plx = scene.playerX / dpr   // 玩家逻辑坐标
const ply = scene.playerY / dpr
scene.obstacles = [{ type: 'rect', x: plx + 10, y: ply - 200, width: 300, height: 400, name: '石墙' }]
if (scene._collisionEngine && scene._collisionEngine.setObstacles) scene._collisionEngine.setObstacles(scene.obstacles)
const paObs = { lungeDist: 60 * dpr, dir: 1, lungeDuration: 0.18, lungeElapsed: 0, _lungeDone: false }
const beforeObs = scene.playerX
for (let f = 0; f < 20; f++) scene._applyShieldBashLunge(paObs, 1 / 60)
const afterObs = scene.playerX
const movedObs = afterObs - beforeObs
assert(movedObs < 40 * dpr, `遇障碍突进被取消(仅前移 ${Math.round(movedObs / dpr)}px 即停)`, `Δ=${Math.round(movedObs / dpr)}px, _lungeDone=${paObs._lungeDone}`)
assert(paObs._lungeDone === true, '障碍触发后 _lungeDone 标记（不再推进）')
// 对照：无障碍时应能走完 60px
scene.obstacles = []
if (scene._collisionEngine && scene._collisionEngine.setObstacles) scene._collisionEngine.setObstacles([])
scene.playerX = 1000 * dpr
const paClear = { lungeDist: 60 * dpr, dir: 1, lungeDuration: 0.18, lungeElapsed: 0, _lungeDone: false }
for (let f = 0; f < 20; f++) scene._applyShieldBashLunge(paClear, 1 / 60)
assert((scene.playerX - 1000 * dpr) > 50 * dpr, `无障碍时突进走完 ≈${Math.round((scene.playerX - 1000 * dpr) / dpr)}px`, `Δ=${Math.round((scene.playerX - 1000 * dpr) / dpr)}`)

// ============ C. 突进不越地图边界 ============
console.log('\n=== C. 突进地图边界钳制 ===')
const mw = scene.mapWidth || 4000 * dpr
scene.playerX = mw - 60 * dpr          // 紧贴右边界
const paEdge = { lungeDist: 60 * dpr, dir: 1, lungeDuration: 0.18, lungeElapsed: 0, _lungeDone: false }
for (let f = 0; f < 20; f++) scene._applyShieldBashLunge(paEdge, 1 / 60)
const margin = 50 * dpr
assert(scene.playerX <= mw - margin + 1, `突进后不越右边界(${Math.round(scene.playerX / dpr)} ≤ ${Math.round((mw - margin) / dpr)})`)

// ============ D. 护盾按 2.5D 层级显示（layer=2 实体） ============
console.log('\n=== D. 护盾 2.5D 层级实体 ===')
// 用假 engine 捕获 _renderYSortedEntities 注册的实体
const captured = []
const fakeEngine = {
  setCamera() {}, clear() {},
  addDecoration() {}, addObstacle() {}, addChest() {}, addMonster() {}, addPlayer() {},
  addEntity(e) { captured.push(e) }, render() {}
}
const realEngine = scene._renderer2d5
scene._renderer2d5 = fakeEngine
// 确保持盾英雄与坐标就位
zhenbao._shield = 50; zhenbao._shieldMax = 50; zhenbao._shieldTimer = 4.0
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
scene._renderYSortedEntities(fakeCtx)
scene._renderer2d5 = realEngine
const bubble = captured.find(e => e.type === 'heroShieldBubble')
assert(!!bubble, '护盾以 heroShieldBubble 实体加入 2.5D 渲染层')
assert(bubble && bubble.layer === 2, '护盾实体处于 layer=2（与角色/霸体光环同层，Y 排序）', `layer=${bubble && bubble.layer}`)
assert(bubble && typeof bubble.sortY === 'number', '护盾实体带 sortY（脚底世界Y，前后遮挡正确）', `sortY=${bubble && bubble.sortY}`)
// 护盾清零后不应再生成气泡
captured.length = 0
zhenbao._shield = 0
scene._renderer2d5 = fakeEngine
scene._renderYSortedEntities(fakeCtx)
scene._renderer2d5 = realEngine
assert(!captured.find(e => e.type === 'heroShieldBubble'), '护盾消失后不再渲染气泡实体')

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
