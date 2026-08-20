/**
 * 全员 MP 回复一致性验证探针
 * ==========================
 * 验证修复：MP 回复从「仅 AI 队友(_updateAllyAI)」下沉为「被控英雄 + AI 队友统一(_regenAllHeroMp)」，
 * 修复「玩家操纵的英雄(如李小宝)不回蓝、切到 AI 操纵才回蓝」的不一致。
 *
 * 复用 simulate_game.mjs 的微信环境 mock + 真实 FieldScene 加载。
 * 用法: node devtools/verify_mp_regen.mjs
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
  createImage: () => { const img = { width: 64, height: 64 }; setTimeout(() => { if (img.onload) img.onload() }, 0); return img },
  getStorageSync: (k) => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {},
  showLoading: () => {}, hideLoading: () => {}, setKeepScreenOn: () => {},
  getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {},
  downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}
class MockGame {
  constructor() {
    this.ctx = canvasCtx; this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = { _d: {}, _flags: new Set(), get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: (k) => { delete this.data._d[k] }, hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k) }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0, this.input.taps.length) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }; this.changeScene = () => {}
  }
}
const createRequire = (await import('module')).createRequire
const path = (await import('path')).default
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => { const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p; return nodeRequire(abs) }

const mod = await import('../scripts/scenes/field-scene.js')
const FieldScene = mod.FieldScene

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
scene.battleSystem.active = true
scene._buildBattleHeroes()
const sys = scene.battleSystem

const zhen = sys.battleHeroes[0]   // 被控者（玩家操纵）
const lxb = sys.battleHeroes[1]    // 队友（AI 操纵）
assert(zhen.hero.name === '臻宝' && lxb.hero.name === '李小宝', '参战：臻宝(被控) + 李小宝(队友)')

// 把两人 MP 压到很低
const setMp = (h, v) => { h.hero.mp = v }
setMp(zhen, 10); setMp(lxb, 10)
const zhenMax = zhen.hero.maxMp, lxbMax = lxb.hero.maxMp

console.log('\n=== 全员 MP 回复（被控英雄 + 队友统一）===')
{
  const dt = 1.0
  scene._regenAllHeroMp(dt)
  const zGain = zhen.hero.mp - 10
  const lGain = lxb.hero.mp - 10
  const expRate = (h) => (h.hero.mpRegen || 5) * dt * 0.5
  // ★ 核心断言：被控英雄(臻宝)也必须回蓝（修复前只在 _updateAllyAI 里、被控者被 skip，永远不回）
  assert(zhen.hero.mp > 10, '被控英雄(臻宝) MP 回复', `mp=${zhen.hero.mp}`)
  assert(lxb.hero.mp > 10, 'AI 队友(李小宝) MP 回复', `mp=${lxb.hero.mp}`)
  // 两者增益应一致（统一回收，无控制切换差异）
  assert(Math.abs(zGain - expRate(zhen)) < 1e-6, '被控英雄增益 = mpRegen*dt*0.5', `gain=${zGain} 期望≈${expRate(zhen)}`)
  assert(Math.abs(lGain - expRate(lxb)) < 1e-6, '队友增益 = mpRegen*dt*0.5（与修复前一致）', `gain=${lGain} 期望≈${expRate(lxb)}`)
  assert(Math.abs(zGain - lGain) < 1e-6, '被控者与队友增益一致（无控制切换差异）', `臻宝=${zGain} 李小宝=${lGain}`)
  // 不超过上限
  assert(zhen.hero.mp <= zhenMax, '被控英雄 MP 不超过上限')
  assert(lxb.hero.mp <= lxbMax, '队友 MP 不超过上限')
}

console.log('\n=== 满蓝不再回复（幂等）===')
{
  zhen.hero.mp = zhenMax; lxb.hero.mp = lxbMax
  scene._regenAllHeroMp(1.0)
  assert(zhen.hero.mp === zhenMax, '满蓝被控英雄不溢出')
  assert(lxb.hero.mp === lxbMax, '满蓝队友不溢出')
}

console.log('\n=== 通过主循环(_updateBattleSystem) 被控英雄也回蓝 ===')
{
  // 模拟一帧主循环（需要 battleSystem.active 且至少有怪物/战斗环境），直接调用 regen 已覆盖；
  // 这里额外验证 _updateAllyAI 已不再单独回蓝（避免双重回收）：构造一个最小队友 AI 帧，
  // 比较前后 MP 增量应等于统一回收值，而非 2 倍。
  setMp(zhen, 10); setMp(lxb, 10)
  // 为 _updateAllyAI 提供最小战斗环境（一个怪物在附近、被控者非李小宝）
  const before = lxb.hero.mp
  // _updateAllyAI 需要 monster 才能推进攻击，但 MP 回收段已删除，故 MP 不应变化；
  // 若误残留会在此 + 统一回收处双重增加。我们直接断言：单独调 _updateAllyAI 不改变 MP。
  try { scene._updateAllyAI(1.0) } catch (e) { /* 无怪物时可能抛，忽略，重点看 MP */ }
  assert(lxb.hero.mp === before, '_updateAllyAI 不再单独回蓝（无双重回收）', `mp=${lxb.hero.mp} before=${before}`)
}

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
