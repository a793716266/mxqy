/**
 * 验证：AI 托管臻宝释放剑气风暴
 *  根因1：连续突刺演出缺失（旧 _allyCastBladeStorm 只发一发月牙）
 *  根因2：霸体光环被错误耦合到被控角色的 playerAnim（AI 臻宝永不显示）
 * 用法: node devtools/verify_blade_storm_ally.mjs
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

console.log('\n=== 构建 + 初始化场景 ===')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
const dpr = scene.dpr
const sys = scene.battleSystem
sys.active = true
scene._buildBattleHeroes()

// 抓出臻宝（构建默认 heroes[0] = 臻宝）
const zhenbaoHero = sys.battleHeroes[0].hero
assert(zhenbaoHero.id === 'zhenbao' || zhenbaoHero.id === 'zhen宝', '被控者默认是臻宝', `id=${zhenbaoHero.id}`)

// ★ 模拟"切换控制"：让臻宝变为 AI 托管（被控者换到 index0 = 李小宝）。
//   等价于内部 _switchControl 的核心动作：heroes[0] 永远是当前被控英雄，
//   _getCurrentControlHero() 返回 heroes[0]。我们手动 swap 避免 UI 副作用。
const list = sys.battleHeroes
if (list[0].hero === zhenbaoHero) { const t = list[0]; list[0] = list[1]; list[1] = t }
sys.currentControlIndex = 0
const zhenbaoBh = sys.battleHeroes.find(b => b.hero === zhenbaoHero)
assert(!!zhenbaoBh, '找到臻宝的 battleHero 引用')
const ctrlHero = scene._getCurrentControlHero()
assert(ctrlHero && ctrlHero.hero !== zhenbaoHero, '当前被控英雄已非臻宝（臻宝处于 AI 托管）', `ctrl=${ctrlHero && ctrlHero.hero.id}`)

// 剑气风暴技能配置
const blade = zhenbaoHero.skills && zhenbaoHero.skills.find(s => s.id === 'blade_storm')
assert(!!blade, '臻宝拥有剑气风暴技能')
assert(blade && blade.superArmor === true, '剑气风暴带 superArmor 标记')

// 在臻宝正前方放一只怪（用于验证突刺命中 + 吸附 + 收尾弹道）
const zpos = zhenbaoBh.getPos()
const monster = { id: 'm_bs', name: '坏猫', alive: true, enemyId: 'wild_cat', x: zpos.x + 100 * dpr, y: zpos.y, hp: 500, maxHp: 500, def: 5, atk: 10, level: 1, attackInterval: 9999, attackCDTimer: 9999 }
scene.mapMonsters = [monster]

// ============ 根因2（修复前）：霸体光环应按"角色自身"判定，与被控角色解耦 ============
console.log('\n=== 根因2：霸体光环按角色判定（与被控角色解耦）===')
assert(scene._heroSuperArmorOn(zhenbaoHero) === false, '未施法时 AI 臻宝无霸体光环')
// 制造"被控的李小宝正在放技能"的情形（playerAnim.timer>0），验证臻宝霸体不依赖它
sys.playerAnim = { type: 'attack', timer: 5 }
assert(scene._heroSuperArmorOn(zhenbaoHero) === false, '被控角色在放技能时，AI 臻宝（未放）仍不应显示霸体（解耦验证）')
sys.playerAnim = null

// ============ 启动 AI 剑气风暴 ============
console.log('\n=== 启动 AI 剑气风暴（_startAllyBladeStorm）===')
const projBefore = (sys.projectiles || []).filter(p => p.bladeStorm).length
scene._startAllyBladeStorm(zhenbaoBh, monster, blade)
assert(!!zhenbaoHero._aiBladeStorm, '已初始化 _aiBladeStorm 状态机')
assert(zhenbaoHero._aiBladeStorm && zhenbaoHero._aiBladeStorm.phase === 'charge', '初始阶段 = charge（蓄力）')
assert(zhenbaoHero._aiBladeStorm && zhenbaoHero._aiBladeStorm.combo === 5, '突刺次数 combo = 5')
assert(zhenbaoHero._aiAttacking === true, 'AI 施法标记 _aiAttacking=true（期间跳过移动/重新施法）')
assert(zhenbaoHero._castSuperArmor === true, '释放瞬间即获得霸体（_castSuperArmor=true）')
assert(zhenbaoHero._aiCastingSkill === blade, '记录正在释放的技能（供霸体光环/打断判定）')

// 根因2（施法期间）：AI 臻宝霸体光环应亮起（走 _aiCastingSkill 通道）
assert(scene._heroSuperArmorOn(zhenbaoHero) === true, 'AI 臻宝施法期间霸体光环亮起（_aiCastingSkill.superArmor）')
// 解耦证明：即便被控的李小宝此刻没在放技能、甚至 playerAnim 为空，臻宝霸体光环仍亮
sys.playerAnim = null
assert(scene._heroSuperArmorOn(zhenbaoHero) === true, '被控角色未施法时，AI 臻宝霸体光环依旧亮（彻底解耦）')

// 旧的一次性弹道行为应被消除：启动瞬间不应有月牙弹道
const projAfterStart = (sys.projectiles || []).filter(p => p.bladeStorm).length
assert(projAfterStart === projBefore, '启动时【不】立即生成月牙弹道（旧 _allyCastBladeStorm 行为已废弃）')

// ============ 根因1：逐帧推进状态机，验证连续突刺演出 ============
console.log('\n=== 根因1：逐帧推进状态机（charge→5连突刺→finish）===')
const startPos = zhenbaoBh.getPos()
let sawCharge = false, sawDash = false, sawFinish = false
const dashStepsSeen = new Set()
const animFramesSeen = new Set()
let sawFrame7 = false
const hpBefore = monster.hp
const dt = 1 / 60
for (let f = 0; f < 200; f++) {
  const pa = zhenbaoHero._aiBladeStorm
  if (!pa) break
  if (pa.phase === 'charge') sawCharge = true
  if (pa.phase === 'dash') { sawDash = true; dashStepsSeen.add(pa.dashStep) }
  if (pa.phase === 'finish') { sawFinish = true; if (zhenbaoBh.sprite && zhenbaoBh.sprite.animFrame === 6) sawFrame7 = true }
  if (zhenbaoBh.sprite) animFramesSeen.add(zhenbaoBh.sprite.animFrame)
  scene._updateAllyBladeStorm(zhenbaoBh, dt)
}
const hpAfter = monster.hp

assert(sawCharge, '经历 charge（蓄力）阶段')
assert(sawDash, '经历 dash（突刺）阶段')
assert(sawFinish, '经历 finish（收尾）阶段')
assert(dashStepsSeen.size === blade.combo, `连续突刺执行 combo=${blade.combo} 次（distinct dashStep 见 ${[...dashStepsSeen].sort((a,b)=>a-b)}）`, `size=${dashStepsSeen.size}`)
assert(animFramesSeen.has(1) && animFramesSeen.has(2), `突刺期间切换 02/03 帧（animFrame 含 1 与 2，实际见 ${[...animFramesSeen]})`)
assert(sawFrame7, '收尾播放 07 帧（animFrame=6）')
assert(hpAfter < hpBefore, `突刺命中前方怪物并造成伤害（hp ${hpBefore}→${hpAfter}）`)

// 收尾后应生成月牙弹道
const projFinal = (sys.projectiles || []).filter(p => p.bladeStorm).length
assert(projFinal > projBefore, `收尾阶段生成月牙剑气弹道（bladeStorm projectile +${projFinal - projBefore}）`)

// 站桩：AI 剑气风暴期间臻宝不应被移动打断
const endPos = zhenbaoBh.getPos()
const movedDist = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y)
assert(movedDist < 5 * dpr, `剑气风暴期间臻宝未被移动打断（位移 ${Math.round(movedDist / dpr)} 逻辑像素）`)

// 结束清场
assert(zhenbaoHero._aiBladeStorm === null, '状态机结束后 _aiBladeStorm 被清空')
assert(zhenbaoHero._aiAttacking === false, '状态机结束后 _aiAttacking 复位')
assert(zhenbaoHero._castSuperArmor === false, '状态机结束后霸体解除')
assert(zhenbaoHero._aiCastingSkill === null, '状态机结束后 _aiCastingSkill 清空')

// 根因2（施法后）：霸体光环应熄灭
assert(scene._heroSuperArmorOn(zhenbaoHero) === false, '施法结束后 AI 臻宝霸体光环熄灭')

// ============ 集成：经 _updateAllyAI 路由推进（验证 _aiAttacking 分支接线正确） ============
console.log('\n=== 集成：_updateAllyAI 路由推进 ===')
scene._startAllyBladeStorm(zhenbaoBh, monster, blade)
const phase0 = zhenbaoHero._aiBladeStorm.phase
for (let f = 0; f < 10; f++) scene._updateAllyAI(dt)
assert(!!zhenbaoHero._aiBladeStorm, '经 _updateAllyAI 推进后状态机仍在（路由生效，未崩溃）')
assert(zhenbaoHero._aiBladeStorm.phase !== phase0 || zhenbaoHero._aiBladeStorm.chargeTimer < 1.0, '经 _updateAllyAI 推进后阶段已变化（chargeTimer 递减）')
// 收尾清理，避免污染
zhenbaoHero._aiBladeStorm = null
zhenbaoHero._aiAttacking = false
zhenbaoHero._castSuperArmor = false
zhenbaoHero._aiCastingSkill = null

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
