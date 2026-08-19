/**
 * verify_blade_storm_frames.mjs
 * 回归测试：玩家「剑气风暴(blade_storm)」收尾帧必须是 ATTACK_07（而非被 3 帧普攻折叠）。
 *
 * 背景：臻宝普攻改为只播 ATTACK_01~03（_totalFramesMap.attack=3）后，渲染公式
 *   frameNum = (animFrame % total) + 1   (total = _totalFramesMap[state])
 * 若剑气风暴用 state='attack'，则收尾帧 07（animFrame=6）→ (6%3)+1 = ATTACK_01，收尾动作丢失。
 * 修复：玩家剑气风暴改用 state='skill'（8 帧，与 AI 一致），frame 07 → ATTACK_07。
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

// 轻量 MockCanvas/ctx（与 verify_blade_storm_cast_lock 同款）
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
scene.battleSystem.battleHeroes = [scene.battleSystem.battleHeroes[0]]

const bsSkill = hero.skills.find(s => s.id === 'blade_storm')
assert(!!bsSkill, '前置：臻宝含 blade_storm 技能')

// 施放玩家剑气风暴
const target = { id: 'tgt', name: '靶子', enemyId: 'wild_cat', alive: true, x: ctrl.getPos().x + 60 * scene.dpr, y: ctrl.getPos().y, hp: 1000, maxHp: 1000, def: 5, atk: 0, attackInterval: 999999, attackCDTimer: 999999, skills: [], skillCDs: {}, isMoving: false, isAttacking: false, isCastingSkill: false }
scene.mapMonsters = [target]
scene.battleSystem.playerAnim = null
scene.battleSystem.castLockTimer = 0
scene._playerAttackMonster(target, bsSkill)

// 断言 1：施放后主控 sprite 渲染态必须是 'skill'（8 帧），不能用 'attack'（3 帧会折叠收尾帧）
assert(scene.mainCharacterSprite.state === 'skill', "玩家剑气风暴渲染态=skill（非'attack'，否则收尾帧07被折叠）", `state=${scene.mainCharacterSprite.state}`)

// 断言 2：驱动状态机直到大招结束，收尾阶段必须出现 ATTACK_07 渲染帧
let sawFinish = false
let sawFrame07 = false
let sawFrame01as07 = false
for (let i = 0; i < 250; i++) {
  scene._updateBattleSystem(dt)
  const pa = scene.battleSystem.playerAnim
  if (pa && pa.phase === 'finish') {
    sawFinish = true
    const key = scene.mainCharacterSprite.getCurrentFrameKey()
    if (key === 'HERO_ZHENBAO_ATTACK_07') sawFrame07 = true
    if (key === 'HERO_ZHENBAO_ATTACK_01') sawFrame01as07 = true
  }
  if (!scene.battleSystem.playerAnim) break  // 大招结束
}
assert(sawFinish, '驱动过程中进入了 finish（收尾）阶段')
assert(sawFrame07, '收尾阶段渲染帧包含 HERO_ZHENBAO_ATTACK_07（收尾动作正确）')
assert(!sawFrame01as07, '收尾阶段未出现 ATTACK_01（即收尾帧未被 3 帧折叠成 01）')

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
