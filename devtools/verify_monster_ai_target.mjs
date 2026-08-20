/**
 * 怪物 AI「攻击目标 / 伤害坐标」对齐验证探针
 * =========================================
 * 验证 field-battle-system.js 的修复：
 *   A. 怪物锁定非被控者（如集火脆皮李小宝）时，技能弹道/落点/飘字对齐【锁定目标】，
 *      而非错误写死被控者 playerX/Y。
 *   B. target:'all'（暗影领域）真正遍历全队结算（不再只打被控者一人）。
 *   C. jump_attack 落点基于锁定目标，且落地伤害遍历全队（真 AOE，而非只结算被控者）。
 *   D. charge 冲锋距离单位正确（逻辑像素 dashDistance 与物理像素 dist 不再混算导致翻倍）。
 *
 * 复用 simulate_game.mjs 的微信环境 mock + 真实 FieldScene 加载。
 * 用法: node devtools/verify_monster_ai_target.mjs
 */

// ==================== 全局 wx mock ====================
const canvasCtx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'canvas' || prop === 'measureText') return undefined
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => { const img = { width: 64, height: 64, _onload: null }; setTimeout(() => { if (img.onload) img.onload() }, 0); return img },
  getStorageSync: (k) => _storage[k],
  setStorageSync: (k, v) => { _storage[k] = v },
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

import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) { console.warn(`[模拟器] require 失败: ${p} ->`, e.message); throw e }
}

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
const dpr = scene.dpr

console.log(`\n参战英雄: ${sys.battleHeroes.map(b => b.hero.name).join(', ')}  dpr=${dpr}`)
assert(sys.battleHeroes.length >= 2, '至少 2 名参战英雄')

const zhen = sys.battleHeroes[0]   // 被控者（默认臻宝）
const lxb = sys.battleHeroes[1]    // 队友（李小宝）
assert(zhen.hero.name === '臻宝', '初始被控者=臻宝')
assert(lxb.hero.name === '李小宝', '队友=李小宝')

function makeMonster(skill, overrides) {
  return Object.assign({
    id: 'm_ai', name: '测试怪', alive: true, enemyId: 'wild_cat',
    x: 0, y: 0, hp: 200, maxHp: 200, atk: 20, def: 5, level: 1,
    moveSpeed: 30 * dpr, attackRange: 80, attackInterval: 2000,
    strafeDir: 1, strafeTimer: 0, strafeAngle: 0,
    isCastingSkill: false, skillAnimTimer: 0, skillCastId: null,
    inCombat: true, skillUseCount: 0, attackCDTimer: 0,
    hasDealtDamage: false, isAttacking: false,
    skills: [skill], skillCDs: { [skill.id]: 0 },
  }, overrides || {})
}

// ==================== 测试 A：弹道对齐锁定目标（非被控者） ====================
console.log('\n=== 测试A: 锁定李小宝时弹道指向李小宝（非被控者臻宝） ===')
{
  // 李小宝（锁定目标）放在怪旁边；臻宝（被控者）放远
  const lxbPos = { x: scene.playerX + 40 * dpr, y: scene.playerY }
  const zhenPos = { x: scene.playerX + 400 * dpr, y: scene.playerY }
  scene._heroWorldPos[1] = lxbPos
  scene._heroWorldPos[0] = zhenPos
  const monster = makeMonster({ id: 'atk_a', name: '抓挠', type: 'attack', power: 1.0, cooldown: 1, range: 120 })
  monster.x = lxbPos.x + 10 * dpr
  monster.y = lxbPos.y
  sys.projectiles = []
  const dx = lxbPos.x - monster.x, dy = lxbPos.y - monster.y, dist = Math.hypot(dx, dy)
  scene._fieldCastMonsterSkill(monster, monster.skills[0], lxb.hero, dx, dy, dist)
  assert(sys.projectiles.length === 1, '生成 1 个弹道', `projectiles=${sys.projectiles.length}`)
  const p = sys.projectiles[0]
  assert(Math.abs(p.tx - lxbPos.x) < 1 && Math.abs(p.ty - lxbPos.y) < 1,
    '弹道 tx/ty 指向锁定目标(李小宝)', `tx=${Math.round(p.tx)} 李小宝=${Math.round(lxbPos.x)} 臻宝=${Math.round(zhenPos.x)}`)
  assert(p.targetHero === lxb.hero, '弹道记录锁定目标 hero（非被控者）')
  // 反证：若错误地写死被控者，tx 会≈臻宝位置（差值很大）
  assert(Math.abs(p.tx - zhenPos.x) > 100 * dpr, '弹道确实未指向被控者臻宝', `tx=${Math.round(p.tx)} 臻宝=${Math.round(zhenPos.x)}`)
}

// ==================== 测试 B：target:'all' 真全屏 ====================
console.log('\n=== 测试B: 暗影领域(target:all) 遍历全队结算 ===')
{
  zhen.hero.hp = zhen.hero.maxHp = 100
  lxb.hero.hp = lxb.hero.maxHp = 100
  const monster = makeMonster({ id: 'all_b', name: '暗影领域', type: 'attack', target: 'all', power: 1.2, cooldown: 5, range: 200 })
  sys.projectiles = []
  sys.damageTexts = []
  const dx = 0, dy = 0, dist = 1
  scene._fieldCastMonsterSkill(monster, monster.skills[0], lxb.hero, dx, dy, dist)
  assert(sys.projectiles.length === 0, 'target:all 不生成单发弹道（直接 AOE 结算）')
  assert(zhen.hero.hp < 100, 'target:all 打中臻宝(全队)', `臻宝HP=${zhen.hero.hp}`)
  assert(lxb.hero.hp < 100, 'target:all 打中李小宝(全队)', `李小宝HP=${lxb.hero.hp}`)
}

// ==================== 测试 C：jump_attack 落点对齐锁定目标 + 真 AOE ====================
console.log('\n=== 测试C: 跳跃攻击落点对齐锁定目标(李小宝) + 落地结算全队 ===')
{
  // 把李小宝(锁定目标)与臻宝(被控者)都放进落点圈内（间距 < aoeRadius）
  const lockPos = { x: scene.playerX + 40 * dpr, y: scene.playerY }
  scene._heroWorldPos[1] = lockPos                                   // 李小宝=锁定目标
  scene._heroWorldPos[0] = { x: lockPos.x + 30 * dpr, y: lockPos.y + 10 * dpr }  // 臻宝也在圈内
  zhen.hero.hp = zhen.hero.maxHp = 100
  lxb.hero.hp = lxb.hero.maxHp = 100
  const jumpSkill = { id: 'jump_c', name: '跳跃攻击', type: 'jump_attack', power: 1.5, cooldown: 6, range: 120, warnDuration: 1.0, aoeRadius: 110 }
  const monster = makeMonster(jumpSkill)
  monster.x = lockPos.x; monster.y = lockPos.y
  // ★ 关键：_updateMonsterJumps 遍历 scene.mapMonsters 驱动跳跃落地，测试怪必须注册进去否则落点永不推进/结算
  if (!scene.mapMonsters) scene.mapMonsters = []
  scene.mapMonsters.push(monster)
  sys.warningZones = []
  sys.damageTexts = []
  const dx = 0, dy = 0, dist = 1
  scene._fieldCastMonsterSkill(monster, jumpSkill, lxb.hero, dx, dy, dist)
  assert(sys.warningZones.length === 1, '跳跃攻击生成预警圈', `zones=${sys.warningZones.length}`)
  const zone = sys.warningZones[0]
  assert(Math.abs(zone.x - lockPos.x) < 1 && Math.abs(zone.y - lockPos.y) < 1,
    '预警圈落点对齐锁定目标(李小宝)', `zone.x=${Math.round(zone.x)} 李小宝=${Math.round(lockPos.x)} 臻宝=${Math.round(scene._heroWorldPos[0].x)}`)
  assert(Math.abs(zone.x - scene._heroWorldPos[0].x) > 10 * dpr, '落点确实未对齐被控者臻宝', `zone.x=${Math.round(zone.x)} 臻宝=${Math.round(scene._heroWorldPos[0].x)}`)
  // 驱动预警倒计时归零 → 生成跳跃 → 驱动落地结算
  for (let i = 0; i < 120; i++) scene._fieldUpdateWarningZones(1 / 60)
  for (let i = 0; i < 120; i++) scene._updateMonsterJumps(1 / 60)
  assert(lxb.hero.hp < 100, '跳跃落地打中锁定目标李小宝', `李小宝HP=${lxb.hero.hp}`)
  assert(zhen.hero.hp < 100, '跳跃落地打中圈内臻宝(真 AOE 全队)', `臻宝HP=${zhen.hero.hp}`)
}

// ==================== 测试 D：charge 冲锋距离单位 ====================
console.log('\n=== 测试D: charge 冲锋距离单位（不翻倍） ===')
{
  // 令 dist(物理) < dashDistance*dpr，原 bug 会 min(逻辑,物理)*dpr 放大近一倍
  const monster = makeMonster({ id: 'chg_d', name: '冲锋', type: 'charge', power: 2.0, cooldown: 8, dashDistance: 120 })
  monster.x = 0; monster.y = 0
  const distC = 50 * dpr   // 物理像素，远小于 120*dpr
  const dxC = distC, dyC = 0
  const xBefore = monster.x
  scene._fieldCastMonsterSkill(monster, monster.skills[0], lxb.hero, dxC, dyC, distC)
  const moved = monster.x - xBefore
  const expected = Math.min(120 * dpr, distC)   // = 50*dpr
  assert(Math.abs(moved - expected) < 1,
    `charge 位移正确(=min(dashDistance*dpr, dist)=${expected})`, `实际位移=${Math.round(moved)} 期望=${expected}`)
  assert(Math.abs(moved - 120 * dpr) > 1, 'charge 未被错误放大到整段 dashDistance(原bug)', `位移=${Math.round(moved)}`)
}

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
