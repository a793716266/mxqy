/**
 * 验证：暗影鼠「暗影咬」(jump_attack) 技能动画严格按素材语义分相播放
 *   预警(起跳) = skill 帧 1-4，飞跃 = 5-7，落地收尾 = 8，结束后干净复位 idle
 * 回归保护：此前 bug 是落地收尾清理块用 _jumpLandingTimer!=null 判断，
 *   而该值在跳跃全程为 0 → 每帧误把施法状态清零 → 帧被 idle 分支接管循环。
 */
import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => nodeRequire(p.startsWith('.') ? path.resolve(scenesDir, p) : p)
const canvasCtx = new Proxy({}, { get: () => () => {}, set: () => true })
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas, createImage: () => { const img = { width: 64, height: 64, _onload: null }; setTimeout(() => img.onload && img.onload(), 0); return img },
  getStorageSync: (k) => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16), canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {}, setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }), onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}
class MockGame {
  constructor() { this.ctx = canvasCtx; this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3; this.data = { _d: {}, _flags: new Set(), get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: (k) => delete this.data._d[k], hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k) }; this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true }; this.audio = { play: () => {}, playSound: () => {} }; this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0, this.input.taps.length) }; this.showToast = () => {}; this.sceneManager = { changeScene: () => {} } }
}
const { FieldScene } = await import('../scripts/scenes/field-scene.js')

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
scene.battleSystem.active = true
scene.battleSystem.showBattleUI = true
scene._buildBattleHeroes()
const sys = scene.battleSystem
const hero = scene._getCurrentControlHero().hero
const smCfg = scene._getMonsterConfig('shadow_mouse')
assert(smCfg && smCfg.animationConfig && smCfg.animationConfig.skill, '暗影鼠技能动画配置存在')
const skill = smCfg.skills.find(s => s.type === 'jump_attack')
assert(skill && skill.warnDuration > 0, '暗影咬为 jump_attack 且含 warnDuration')

const monster = {
  id: 'sm_test', name: '暗影鼠', enemyId: 'shadow_mouse', alive: true,
  x: hero.x + 200 * scene.dpr, y: hero.y, hp: 80, maxHp: 80, def: 10, atk: 16, level: 3,
  skillCDs: {}, aiPattern: 'aggressive', isCastingSkill: false, skillAnimTimer: 0, _castingSkill: null,
  _jumpWarn: false, _jumpWarnTimer: 0, _jumpWarnDur: 0, _jumpLandingTimer: 0, _jumpState: null, _jumpPrepZone: null,
  superArmor: true, // 隔离“英雄打断”，专测动画驱动本身
}
scene.mapMonsters = [monster]
scene._fieldCastMonsterSkill(monster, skill, hero, -1, 0, 200 * scene.dpr)

assert(monster.isCastingSkill === true, '施法后 isCastingSkill=true', `实际:${monster.isCastingSkill}`)
assert(monster.skillAnimTimer > 0, '施法后 skillAnimTimer>0(应为999999)')

// 采集每帧 skill 帧号与相位
const seq = []
for (let f = 0; f < 200; f++) {
  scene.update(1 / 60)
  const frame = monster.animFrame + 1
  let phase = monster._jumpLandingTimer > 0 ? 'land' : monster._jumpState ? 'fly' : monster._jumpWarn ? 'warn' : 'idle'
  seq.push({ f, frame, phase, cast: monster.isCastingSkill })
  if (!monster.isCastingSkill && monster._jumpState === null && monster._jumpLandingTimer <= 0 && f > 20) break
}

const warnFrames = seq.filter(s => s.phase === 'warn').map(s => s.frame)
const flyFrames = seq.filter(s => s.phase === 'fly').map(s => s.frame)
const landFrames = seq.filter(s => s.phase === 'land').map(s => s.frame)

console.log('\n=== 验证暗影咬分相帧序列 ===')
console.log(`  起跳帧集合: [${[...new Set(warnFrames)].join(',')}]  期望 ⊆ {1,2,3,4}`)
console.log(`  飞跃帧集合: [${[...new Set(flyFrames)].join(',')}]  期望 ⊆ {4,5,6,7}（4 为起跳/飞跃接缝帧，1帧）`)
console.log(`  收尾帧集合: [${[...new Set(landFrames)].join(',')}]  期望 ⊆ {7,8}（7 为飞跃/收尾接缝帧，1帧）`)

assert(warnFrames.length > 0, '存在起跳相位')
assert(warnFrames.every(f => f >= 1 && f <= 4), '起跳相位帧号全部在 1-4', `实际:[${warnFrames.join(',')}]`)
assert(flyFrames.length > 0, '存在飞跃相位')
assert(flyFrames.every(f => f >= 4 && f <= 7), '飞跃相位帧号在 4-7（含 1 帧接缝帧4）', `实际:[${flyFrames.join(',')}]`)
assert(flyFrames.includes(5) && flyFrames.includes(6) && flyFrames.includes(7), '飞跃相位完整播放 5/6/7')
assert(landFrames.length > 0, '存在收尾相位')
assert(landFrames.every(f => f >= 7 && f <= 8), '收尾相位帧号在 7-8（含 1 帧接缝帧7）', `实际:[${landFrames.join(',')}]`)
assert(landFrames.includes(8), '收尾相位钉在第 8 帧')

// 顺序：起跳必须出现在飞跃之前，飞跃在收尾之前
const iWarn = seq.findIndex(s => s.phase === 'warn')
const iFly = seq.findIndex(s => s.phase === 'fly')
const iLand = seq.findIndex(s => s.phase === 'land')
assert(iWarn < iFly && iFly < iLand, '相位顺序为 起跳→飞跃→收尾', `warn@${iWarn} fly@${iFly} land@${iLand}`)

// 结束后干净复位
const last = seq[seq.length - 1]
assert(last.cast === false, '技能结束后 isCastingSkill=false（干净复位）', `实际:${last.cast}`)
assert(monster._jumpState === null && monster._jumpLandingTimer <= 0, '结束后跳跃状态清理')

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
