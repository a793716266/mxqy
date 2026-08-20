/**
 * 验证：角色加入管线完整性（艾米/安妮/钱多多/小贝 四位伙伴）
 *  - P1 修复：_checkNewFollowers 补全战斗层（sprite + party + battleHeroes + _heroWorldPos）
 *  - P0 修复：_checkChapterUnlocks 按 unlockChapter 门控解锁 + 章节进度推进
 * 用法: node devtools/verify_party_join.mjs
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
const { charStateManager } = await import('../scripts/data/character-state.js')
const { HEROES } = await import('../scripts/data/heroes.js')

let passed = 0, failed = 0
const assert = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`) } else { failed++; console.log(`  ✗ ${n}  ${d || ''}`) } }

console.log('\n=== 构建 + 初始化场景 ===')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
const sys = scene.battleSystem
sys.active = true
scene._buildBattleHeroes()

// 初始：臻宝 + 李小宝（默认解锁），其余 4 位伙伴尚未加入
assert(scene.followers.length === 1, '初始仅 1 名跟随队友（李小宝）', `=${scene.followers.length}`)
assert(sys.battleHeroes.length === 2, '初始 battleHeroes = 2（臻宝+李小宝）', `=${sys.battleHeroes.length}`)
assert(!charStateManager.getCharacter('amy'), '初始艾米未解锁')
assert(!charStateManager.getCharacter('annie'), '初始安妮未解锁')

const joinedFully = (id) => {
  const f = scene.followers.find(x => x.character.id === id)
  const p = scene.party.find(x => x.id === id)
  const b = sys.battleHeroes.find(x => x.hero.id === id)
  return {
    follower: !!f,
    followerSprite: !!(f && f.sprite && typeof f.sprite.animFrame === 'number'),
    party: !!p,
    battle: !!b,
    battleSprite: !!(b && b.sprite && typeof b.sprite.animFrame === 'number'),
  }
}

// ============ 路径A：艾米（Boss 击败触发，unlockChapter=1 不走章节门控） ============
console.log('\n=== 路径A：艾米（Boss 路径）完整加入 ===')
charStateManager.unlockCharacter('amy')
scene._checkNewFollowers()
const a = joinedFully('amy')
assert(a.follower, '艾米进入跟随层 followers')
assert(a.followerSprite, '艾米跟随精灵 CharacterSprite 已创建')
assert(a.party, '艾米进入 party（HP 条/数据层）')
assert(a.battle, '艾米进入 battleHeroes（实时战斗层）')
assert(a.battleSprite, '艾米 battleHeroes 含精灵（修复前为 undefined）')
assert(scene._heroWorldPos.length === sys.battleHeroes.length, '_heroWorldPos 与 battleHeroes 尺寸一致', `=${scene._heroWorldPos.length}/${sys.battleHeroes.length}`)

// ============ 路径B：安妮（unlockChapter=2，章节门控） ============
console.log('\n=== 路径B：安妮（章节 2 门控）完整加入 ===')
game.data.set('currentChapter', 2)
scene._checkChapterUnlocks()
scene._checkNewFollowers()
assert(charStateManager.getCharacter('annie'), 'currentChapter=2 触发安妮解锁')
const an = joinedFully('annie')
assert(an.follower && an.followerSprite && an.party && an.battle && an.battleSprite, '安妮完整加入（跟随层+精灵+party+battleHeroes+精灵）')

// ============ 路径C：钱多多（unlockChapter=3） ============
console.log('\n=== 路径C：钱多多（章节 3 门控）完整加入 ===')
game.data.set('currentChapter', 3)
scene._checkChapterUnlocks()
scene._checkNewFollowers()
assert(charStateManager.getCharacter('qianduoduo'), 'currentChapter=3 触发钱多多解锁')
const q = joinedFully('qianduoduo')
assert(q.follower && q.followerSprite && q.party && q.battle && q.battleSprite, '钱多多完整加入')

// ============ 路径D：小贝（unlockChapter=4） ============
console.log('\n=== 路径D：小贝（章节 4 门控）完整加入 ===')
game.data.set('currentChapter', 4)
scene._checkChapterUnlocks()
scene._checkNewFollowers()
assert(charStateManager.getCharacter('xiaobei'), 'currentChapter=4 触发小贝解锁')
const x = joinedFully('xiaobei')
assert(x.follower && x.followerSprite && x.party && x.battle && x.battleSprite, '小贝完整加入')

// ============ 完整性 + 幂等 ============
console.log('\n=== 完整性 + 幂等 ===')
assert(sys.battleHeroes.length === 6, '六位角色全部进入 battleHeroes', `=${sys.battleHeroes.length}`)
assert(scene.followers.length === 5, '五位跟随队友（李小宝+4猫）', `=${scene.followers.length}`)
const beforeF = scene.followers.length, beforeB = sys.battleHeroes.length
scene._checkNewFollowers() // 重复调用
scene._checkNewFollowers()
assert(scene.followers.length === beforeF, '重复调用 _checkNewFollowers 不重复加入（幂等）', `${beforeF}->${scene.followers.length}`)
assert(sys.battleHeroes.length === beforeB, '重复调用不重复构建 battleHeroes（幂等）')
assert(scene._heroWorldPos.length === sys.battleHeroes.length, '幂等后 _heroWorldPos 仍与 battleHeroes 一致')

// ============ 集成：草原通关 → 章节推进 + 门控解锁 ============
console.log('\n=== 集成：草原通关触发章节推进 + 门控解锁 ===')
const game2 = new MockGame()
// ★ 重置共享单例，确保集成测试从干净状态验证「章节门控」确实生效
charStateManager.characters.clear()
charStateManager._initialized = false
const scene2 = new FieldScene(game2, { area: 'grassland' })
await scene2.init()
const sys2 = scene2.battleSystem
sys2.active = true
scene2._buildBattleHeroes()
assert((game2.data.get('currentChapter') || 1) === 1, '集成前 currentChapter=1')
// 模拟全图怪物已全部死亡（数组非空但全部 alive=false）→ 触发 _checkDungeonClear 的通关分支
scene2.mapMonsters = [{ id: 'm_dead', name: '已死怪', alive: false, isBoss: true }]
scene2._checkDungeonClear(1 / 60)
// ★ 语义修正：草原(ch1)通关后 currentChapter 保持 1（已通关章节），不跳到 2
assert((game2.data.get('currentChapter') || 1) === 1, '草原通关后 currentChapter 保持 1（非 1→2）', `=${game2.data.get('currentChapter')}`)
assert(charStateManager.getCharacter('amy'), '草原通关（Boss击败）解锁艾米')
// ★ 关键纠正：击败草原BOSS=艾米加入，安妮(unlockChapter:2) 需待第2章区域通关，不应此刻解锁
assert(!charStateManager.getCharacter('annie'), '草原通关不会误解锁安妮（安妮需第2章区域通关）')
const ja = joinedFully2(scene2, sys2, 'amy')
assert(ja.follower && ja.followerSprite && ja.battle && ja.battleSprite, '集成：艾米完整加入（Boss路径，带回合战斗精灵）')
assert(!joinedFully2(scene2, sys2, 'annie').follower, '集成：草原通关后安妮尚未加入（需第2章区域通关）')
// ★ 验证门控生效：手动推进到第2章后，安妮通过章节门控解锁并完整加入
game2.data.set('currentChapter', 2)
scene2._checkChapterUnlocks()
scene2._checkNewFollowers()
assert(charStateManager.getCharacter('annie'), 'currentChapter=2 后安妮经章节门控解锁')
const jn = joinedFully2(scene2, sys2, 'annie')
assert(jn.follower && jn.followerSprite && jn.battle && jn.battleSprite, '集成：安妮（第2章门控）完整加入')

function joinedFully2(sc, sy, id) {
  const f = sc.followers.find(x => x.character.id === id)
  const b = sy.battleHeroes.find(x => x.hero.id === id)
  return { follower: !!f, followerSprite: !!(f && f.sprite), battle: !!b, battleSprite: !!(b && b.sprite) }
}

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
