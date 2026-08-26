/**
 * debug_blade_storm_frames.mjs
 * 集成复现：用真实 scene.update(dt) 驱动（含 mainCharacterSprite.update + _updateBattleSystem），
 * 逐帧打印 getCurrentFrameKey()，看剑气风暴动画帧序列是否被 update() 推进破坏。
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  return nodeRequire(abs)
}
const canvasCtx = { canvas: { width: 750 * 3, height: 1334 * 3 }, drawImage() {}, save() {}, restore() {}, translate() {}, scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {}, fillText() {}, measureText: () => ({ width: 0 }), setTransform() {}, clearRect() {}, createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineCap: '' }
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
const { HEROES } = await import('../scripts/data/heroes.js')
const mod = await import('../scripts/scenes/field-scene.js')
const FieldScene = mod.FieldScene
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
scene.battleSystem.battleHeroes = [scene.battleSystem.battleHeroes[0]]
const bsSkill = hero.skills.find(s => s.id === 'blade_storm')
const target = { id: 'tgt', name: '靶子', enemyId: 'wild_cat', alive: true, x: ctrl.getPos().x + 60 * scene.dpr, y: ctrl.getPos().y, hp: 1000, maxHp: 1000, def: 5, atk: 0, attackInterval: 999999, attackCDTimer: 999999, skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false }
scene.mapMonsters = [target]
scene.battleSystem.playerAnim = null
scene.battleSystem.castLockTimer = 0
console.log('frameDuration=', scene.mainCharacterSprite.frameDuration, ' _totalFramesMap.skill=', scene.mainCharacterSprite._totalFramesMap.skill)
scene._playerAttackMonster(target, bsSkill)
let lastPhase = ''
let bad = 0
for (let i = 0; i < 250; i++) {
  scene.update(dt)   // ★ 真实 update：内部 _updateBattleSystem(1144) + mainCharacterSprite.update(1159)
  const sp = scene.mainCharacterSprite
  const pa = scene.battleSystem.playerAnim
  const key = sp.getCurrentFrameKey()
  const phase = pa ? pa.phase : '(end)'
  if (phase !== lastPhase) { console.log(`-- phase ${lastPhase} -> ${phase} @frame ${i}`); lastPhase = phase }
  if (pa && pa.type === 'blade_storm' && !/HERO_ZHENBAO_ATTACK_0[237]/.test(key)) {
    bad++
    if (bad <= 12) console.log(`  [BAD] frame ${i} phase=${phase} key=${key} animFrame=${sp.animFrame} animTimer=${sp.animTimer.toFixed(3)} state=${sp.state} pa.frame=${pa.frame}`)
  }
  if (!scene.battleSystem.playerAnim && phase !== '(end)') break
}
console.log(`\n=== 异常帧数(bad)=${bad} ===`)
process.exit(0)
