/**
 * AOE技能验证：李小宝的火球术/冰晶术/雷击术
 * =========================================
 * 用真实 FieldScene + field-battle-system 代码验证：
 *  1. 火球术：X轴200范围命中 + 灼烧DoT
 *  2. 冰晶术：X轴延伸生成冰刃 + 冰冻状态（怪物无法行动）
 *  3. 雷击术：300范围 + 每个敌人最多3次雷击 + 感电易伤20%
 *
 * 用法: node scripts/tools/verify_skills.mjs
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
    console.warn(`[skills] require 失败: ${p} ->`, e.message)
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

// mock 特效（SkillEffectManager 简化版）
class MockEffects {
  constructor() { this.effects = [] }
  playHitEffect(type, x, y, dpr, onComplete) {
    this.effects.push({ type, x, y })
    return this.effects.length
  }
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
    this.assets = {
      get: () => ({ width: 64, height: 64 }),
      getImage: () => ({ width: 64, height: 64 }),
      loadSubpackage: async () => {},
      isLoaded: () => true
    }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], touches: {}, consumeTaps: () => this.input.taps.splice(0, this.input.taps.length) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
    this.effects = new MockEffects()
  }
}

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

const { FieldScene } = await import('../scenes/field-scene.js')
console.log('[skills] 加载真实 FieldScene OK')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()

const sys = scene.battleSystem
sys.active = true
sys.showBattleUI = true
scene._buildBattleHeroes()
scene._initBattleUI()

// ==================== 准备李小宝技能 ====================
// 从 heroes.js 读真实技能配置
const { HEROES } = await import('../data/heroes.js')
const lixiaobaoCfg = (HEROES || []).find(h => h.id === 'lixiaobao')
assert(lixiaobaoCfg && lixiaobaoCfg.skills, '加载李小宝技能配置')
const fireball = lixiaobaoCfg.skills.find(s => s.id === 'fireball')
const iceShard = lixiaobaoCfg.skills.find(s => s.id === 'ice_shard')
const thunder = lixiaobaoCfg.skills.find(s => s.id === 'thunder')
assert(fireball && fireball.aoe && fireball.aoe.enabled, '火球术已配置AOE')
assert(iceShard && iceShard.aoe && iceShard.aoe.enabled, '冰晶术已配置AOE')
assert(thunder && thunder.aoe && thunder.aoe.enabled, '雷击术已配置AOE')

// 用真实配置覆盖参战英雄技能
const heroSkillMap = { fireball, iceShard, thunder }
sys.battleHeroes.forEach(bh => {
  bh.hero.skills = Object.values(heroSkillMap)
  bh.hero.mp = 100
  bh.hero.maxMp = 100
  bh.hero.matk = 40
  bh.hero.atk = 22
})
scene._rebuildSkillButtons(sys.attackButton.x, sys.attackButton.y, sys.attackButton.width, 14 * scene.dpr)
// 当前被控者设为李小宝（确保是李小宝放技能）
scene._switchControl()
const ctrlHero = sys.battleHeroes[0]
assert(ctrlHero.hero.name === '李小宝' || ctrlHero.hero.name === '臻宝', `被控者: ${ctrlHero.hero.name}`)

// 确定施法者（李小宝的 hero 数据）
const lxb = sys.battleHeroes.find(b => b.hero.name === '李小宝') || sys.battleHeroes[0]

// 放置怪物：X轴前方(施法方向右侧)150/250/350 距离，Y 轴对齐
const cpos = scene._heroWorldPos[lxb.partyIndex] || { x: scene.playerX, y: scene.playerY }
const dir = 1  // 面朝右
scene.mapMonsters = [
  { id: 'm_far', name: '怪远', enemyId: 'wild_cat', alive: true, x: cpos.x + 150 * scene.dpr, y: cpos.y, hp: 500, maxHp: 500, def: 5, atk: 10, level: 1, attackCDTimer: 0, attackInterval: 2000, skillCDs: {} },
  { id: 'm_mid', name: '怪中', enemyId: 'wild_cat', alive: true, x: cpos.x + 250 * scene.dpr, y: cpos.y, hp: 500, maxHp: 500, def: 5, atk: 10, level: 1, attackCDTimer: 0, attackInterval: 2000, skillCDs: {} },
  { id: 'm_near', name: '怪近', enemyId: 'wild_cat', alive: true, x: cpos.x + 350 * scene.dpr, y: cpos.y, hp: 500, maxHp: 500, def: 5, atk: 10, level: 1, attackCDTimer: 0, attackInterval: 2000, skillCDs: {} },
]

// ==================== 测试1：火球术（飞行弹道） ====================
console.log('\n=== 测试1: 火球术（角色X轴脱手，向前飞行命中） ===')
// 配置：range=200*dpr=600px, speed=320*dpr=960px/s
// 怪远150dpr=450px（射程内），怪中250dpr=750px（超射程不命中），怪近350dpr=1050（超射程）
const mFar = scene.mapMonsters[0]
const mFarHp0 = mFar.hp
const mFarX0 = mFar.x
sys.skillProcesses = []
sys.projectiles = []
game.effects.effects = []
scene._playerAttackMonster(null, fireball)
assert(sys.projectiles.length === 1 && sys.projectiles[0].owner === 'hero', '火球生成英雄弹道')
const fb = sys.projectiles[0]
assert(fb.vx > 0 && fb.vy === 0, '火球沿X轴向前直线飞行', `vx=${fb.vx} vy=${fb.vy}`)
// 驱动火球飞行（450px @ 960px/s ≈ 0.47s ≈ 28帧）
for (let f = 0; f < 40; f++) {
  scene.update(1/60)
  if (f === 5 || f === 15 || f === 25 || f === 35) {
    const fb = sys.projectiles[0]
    console.log(`  [diag f=${f}] 火球x=${fb ? Math.round(fb.x) : '-'}, mFar.x=${Math.round(mFar.x)}, mFar.hp=${mFar.hp}`)
  }
}
console.log(`  [diag] 命中后: proj=${sys.projectiles.length}, mFar.hp=${mFar.hp}, statusEffects=${JSON.stringify((mFar.statusEffects||[]).map(e=>e.type))}, fx=${game.effects.effects.length} [${game.effects.effects.map(e=>e.type).join(',')}]`)
assert(sys.projectiles.length === 0, '火球命中后消散')
assert(mFar.hp < mFarHp0, '火球飞行命中射程内怪物', `hp ${mFarHp0}->${mFar.hp}`)
assert(mFar.statusEffects && mFar.statusEffects.some(e => e.type === 'burn'), '火球给怪物挂灼烧状态')
assert(game.effects.effects.some(e => e.type === 'fire_impact'), '火球播放 fire_impact 命中特效')
// 跑几帧验证灼烧DoT
const hpAfterBurn = mFar.hp
for (let f = 0; f < 70; f++) scene.update(1/60)   // 1.16s，灼烧应跳2次(间隔0.5s)
assert(mFar.hp < hpAfterBurn, '灼烧DoT持续扣血', `hp ${hpAfterBurn}->${mFar.hp}`)

// ==================== 测试2：冰晶术 ====================
console.log('\n=== 测试2: 冰晶术（冰刃波动剑 + 冰冻） ===')
const mMid = scene.mapMonsters[1]
const mMidHp0 = mMid.hp
sys.skillProcesses = []
game.effects.effects = []
// 重置怪物（满血、无状态）
scene.mapMonsters.forEach(m => { m.hp = 500; m.statusEffects = []; m._frozen = false })
scene._playerAttackMonster(null, iceShard)
assert(sys.skillProcesses.length === 1 && sys.skillProcesses[0].type === 'iceWave', '冰晶术注册冰刃过程')
// 驱动过程（冰刃逐个生成命中）——中途检查冰冻状态（冰冻持续2s，冰刃过程约3.3s，
// 在 30 帧(0.5s)时冰刃应已生成并命中，冰冻状态应在有效期内）
let frozenSeen = false
let hurtSeen = false
for (let f = 0; f < 200; f++) {
  scene.update(1/60)
  const hasFrozen = scene.mapMonsters.some(m => m.statusEffects && m.statusEffects.some(e => e.type === 'freeze'))
  if (hasFrozen) frozenSeen = true
  if (scene.mapMonsters.some(m => m.hp < 500)) hurtSeen = true
}
assert(frozenSeen, '冰刃命中的怪物进入冰冻状态')
assert(hurtSeen, '冰刃对怪物造成伤害')
assert(game.effects.effects.some(e => e.type === 'ice_impact'), '冰晶播放 ice_impact 命中特效')
assert(sys.skillProcesses.length === 0, '冰刃过程执行完毕')
// 冰冻期间怪物无法行动（在冰冻有效期内驱动几帧验证）
scene.mapMonsters.forEach(m => { m.hp = 500; m.statusEffects = []; m._frozen = false })
scene._playerAttackMonster(null, iceShard)
const frozenM = scene.mapMonsters.find(m => {
  for (let f = 0; f < 40; f++) {
    scene.update(1/60)
    if (m._frozen) return true
  }
  return false
})
if (frozenM) {
  const fx0 = frozenM.x
  for (let f = 0; f < 30; f++) scene.update(1/60)
  assert(Math.abs(frozenM.x - fx0) < 1, '冰冻怪物不移动', `dx=${Math.abs(frozenM.x - fx0)}`)
} else {
  failed++; console.log('  ✗ 未捕捉到冰冻怪物（冰冻未生效）')
}

// ==================== 测试3：雷击术 ====================
console.log('\n=== 测试3: 雷击术（300范围 + 3次 + 感电易伤） ===')
// 重置怪物（满血、无状态），放3只在300*dpr范围内
scene.mapMonsters.forEach(m => { m.hp = 500; m.alive = true; m.statusEffects = []; m._frozen = false; m._strikeCount = 0 })
scene.mapMonsters[0].x = cpos.x + 100 * scene.dpr
scene.mapMonsters[0].y = cpos.y + 50 * scene.dpr
scene.mapMonsters[1].x = cpos.x + 150 * scene.dpr
scene.mapMonsters[1].y = cpos.y - 60 * scene.dpr
scene.mapMonsters[2].x = cpos.x + 250 * scene.dpr
scene.mapMonsters[2].y = cpos.y + 20 * scene.dpr
sys.skillProcesses = []
game.effects.effects = []
scene._playerAttackMonster(null, thunder)
assert(sys.skillProcesses.length === 1 && sys.skillProcesses[0].type === 'thunder', '雷击注册过程')
// 感电状态立即挂上
const elecMonsters = scene.mapMonsters.filter(m => m.statusEffects && m.statusEffects.some(e => e.type === 'electrify'))
console.log(`  [diag] mapMonsters=${scene.mapMonsters.length}, 感电=${elecMonsters.length}, alive=${scene.mapMonsters.filter(m=>m.alive).length}`)
assert(elecMonsters.length === 3, '3只怪都挂上感电状态', `感电=${elecMonsters.length}`)
// 驱动雷击（3次 * 0.8s = 2.4s）
for (let f = 0; f < 180; f++) scene.update(1/60)   // 3s
const aliveMonsters = scene.mapMonsters.filter(m => m.alive)
const totalHpLost = scene.mapMonsters.reduce((s, m) => s + (500 - m.hp), 0)
assert(totalHpLost > 0, '雷击造成伤害', `总损失HP=${totalHpLost}`)
assert(game.effects.effects.some(e => e.type === 'magic_impact'), '雷击播放 magic_impact 命中特效')
// 感电易伤：验证 _calcSkillDamageToMonster 对感电怪物伤害加成
const elecM = scene.mapMonsters.find(m => m.statusEffects && m.statusEffects.some(e => e.type === 'electrify'))
if (elecM) {
  const base = Math.max(1, (lxb.hero.matk || 40) * (thunder.power || 2.0) - Math.floor(elecM.def * 0.5))
  const normal = scene._calcSkillDamageToMonster(elecM, thunder, lxb.hero, false)
  // 感电时 normal 应 >= base*1.2
  assert(normal >= Math.floor(base * 1.2) - 1, '感电易伤+20%生效', `base=${Math.floor(base)} normal=${normal} 预期>=${Math.floor(base * 1.2)}`)
}

// ==================== 测试4：魔力护盾（全体防御+30%） ====================
console.log('\n=== 测试4: 魔力护盾（全体队友防御+30%） ===')
const manaShield = lixiaobaoCfg.skills.find(s => s.id === 'mana_shield')
assert(manaShield && manaShield.effect === 'def_up' && manaShield.value === 0.3,
  '魔力护盾配置: def_up 全体防御+30%')
// 重置所有英雄 buff，记录原始防御
sys.battleHeroes.forEach(bh => { bh.hero._buffs = []; bh.hero.def = 10 })
const heroNames = sys.battleHeroes.map(bh => bh.hero.name).join(',')
console.log(`  参战英雄: ${heroNames}`)
// 释放魔力护盾（buff 技能，无目标）
scene._playerAttackMonster(null, manaShield)
// 断言：所有存活参战英雄都有 def_up buff
const allBuff = sys.battleHeroes.every(bh => {
  const b = (bh.hero._buffs || []).find(x => x.type === 'def_up')
  return b && b._active && Math.abs(b.value - 0.3) < 0.001
})
assert(allBuff, '全体参战英雄获得 def_up+30% buff')
// 断言：_getHeroDef 返回防御提升后数值（10 * 1.3 = 13）
const bh0 = sys.battleHeroes[0]
const defWithBuff = scene._getHeroDef(bh0.hero)
assert(defWithBuff === Math.floor(10 * 1.3), '防御实际提升30%（10→13）', `实际: ${defWithBuff}`)
// 断言：buff 有时长，到期后消失
for (let f = 0; f < 400; f++) scene.update(1/60)   // 6.67s（buff时长= turns3*2=6s）
const buffRemain = sys.battleHeroes.some(bh => (bh.hero._buffs || []).some(b => b.type === 'def_up' && b._active))
assert(!buffRemain, 'buff 到期后消失')
assert(scene._getHeroDef(bh0.hero) === 10, 'buff 消失后防御恢复', `实际: ${scene._getHeroDef(bh0.hero)}`)

// ==================== 测试5：BUFF 粒子效果（视觉反馈） ====================
console.log('\n=== 测试5: BUFF 粒子效果（生效冲击波/光环/到期清理） ===')
// 重新释放魔力护盾，验证：
// 1) 生效冲击波被记录（buffShockwaves）
// 2) buff 携带视觉颜色（_color）
// 3) 冲击波随 update 衰减并最终移除
sys.battleHeroes.forEach(bh => { bh.hero._buffs = []; bh.hero.def = 10 })
sys.buffShockwaves = []
scene._playerAttackMonster(null, manaShield)
assert(sys.buffShockwaves.length >= 1, 'buff 生效生成冲击波（视觉粒子）', `shockwaves=${sys.buffShockwaves.length}`)
const sw = sys.buffShockwaves[0]
assert(sw && sw._color && sw._color.includes('rgba'), '冲击波带颜色', `color=${sw && sw._color}`)
assert(sw && sw._dur > 0, '冲击波有持续时间', `dur=${sw && sw._dur}`)
// 所有 def_up buff 有 _color
const allBuffColored = sys.battleHeroes.every(bh => {
  const b = (bh.hero._buffs || []).find(x => x.type === 'def_up')
  return b && b._color && b._color.includes('rgba')
})
assert(allBuffColored, 'def_up buff 都携带视觉颜色')
// 冲击波随 update 衰减消失（0.7s ≈ 42帧）
const swCount = sys.buffShockwaves.length
for (let f = 0; f < 60; f++) scene.update(1/60)
assert(sys.buffShockwaves.length === 0, '冲击波完成后移除', `剩余: ${sys.buffShockwaves.length}`)
// 臻宝的 buff 也有颜色（atk_up 橙 / atk_up_self 红）
const warCry = lixiaobaoCfg.skills.find(s => s.id === 'war_cry') || { effect: 'atk_up', value: 0.3 }
console.log(`  战吼 effect=${warCry.effect} → 颜色 ${scene._getBuffColor(warCry.effect)}`)
assert(scene._getBuffColor('atk_up').includes('255,165,2'), 'atk_up(战吼) 橙色粒子')
assert(scene._getBuffColor('atk_up_self').includes('255,77,77'), 'atk_up_self(狂暴) 红色粒子')
assert(scene._getBuffColor('def_up').includes('95,159,255'), 'def_up(魔力护盾) 蓝色粒子')

// ==================== 测试6：渲染级验证（真的调用绘制 API） ====================
console.log('\n=== 测试6: 渲染级验证（光环/粒子/冲击波真的绘制） ===')
// 可记录调用的 ctx mock
const drawCalls = []
const trackingCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas' || p === 'measureText') return undefined
    return (...args) => { drawCalls.push(p); }
  },
  set() { return true }
})
// 重新释放 buff，确保有 buff + 冲击波
sys.battleHeroes.forEach(bh => { bh.hero._buffs = []; bh.hero.def = 10 })
sys.buffShockwaves = []
scene._playerAttackMonster(null, manaShield)
// 有 buff + 冲击波
const bhHero = sys.battleHeroes[0].hero
assert((bhHero._buffs || []).length > 0, '测试6前置: 英雄有buff')
assert(sys.buffShockwaves.length > 0, '测试6前置: 有冲击波')
// 调用光环渲染
drawCalls.length = 0
scene._renderHeroBuffAura(trackingCtx, 100, 200, bhHero)
const hasArc = drawCalls.includes('arc')
const hasEllipse = drawCalls.includes('ellipse')
const hasStroke = drawCalls.includes('stroke')
const hasFill = drawCalls.includes('fill')
const hasFillText = drawCalls.includes('fillText')
console.log(`  光环绘制调用: arc=${hasArc} ellipse=${hasEllipse} stroke=${hasStroke} fill=${hasFill} fillText=${hasFillText}`)
assert(hasArc || hasEllipse, '光环绘制了椭圆/圆（arc或ellipse被调用）')
assert(hasStroke || hasFill, '光环绘制了描边或填充')
// 调用冲击波渲染
drawCalls.length = 0
scene._renderBuffShockwaves(trackingCtx)
const swHasArc = drawCalls.includes('arc')
const swHasStroke = drawCalls.includes('stroke')
console.log(`  冲击波绘制调用: arc=${swHasArc} stroke=${swHasStroke}`)
assert(swHasArc && swHasStroke, '冲击波绘制了圆+描边（arc 兼容写法）')
// 即将消失闪烁分支（_remaining <= 1）
bhHero._buffs.forEach(b => { b._remaining = 0.5 })
drawCalls.length = 0
scene._renderHeroBuffAura(trackingCtx, 100, 200, bhHero)
console.log(`  闪烁分支绘制调用: ${drawCalls.length} 次`)
assert(drawCalls.length > 0, 'buff即将消失时仍绘制（闪烁提示）')
// 剩余时间数字绘制（_remaining <= 3 时 fillText 被调用）
bhHero._buffs.forEach(b => { b._remaining = 2.5 })
drawCalls.length = 0
scene._renderHeroBuffAura(trackingCtx, 100, 200, bhHero)
assert(drawCalls.includes('fillText'), '剩余时间数字被绘制（fillText）', `drawCalls=${drawCalls.slice(-5).join(',')}`)

// ★ 时间驱动动画验证：两次调用（间隔数百ms）绘制参数应不同（粒子在动）
const recordStyle = []
const styleCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas' || p === 'measureText') return undefined
    if (p === 'fillStyle' || p === 'strokeStyle') return undefined
    return (v) => { recordStyle.push(p + '=' + JSON.stringify(v)) }
  },
  set(t, p, v) { if (p === 'fillStyle' || p === 'strokeStyle') recordStyle.push(p + '=' + v); return true }
})
sys.battleHeroes.forEach(bh => { bh.hero._buffs = []; bh.hero.def = 10 })
scene._playerAttackMonster(null, manaShield)
const h0 = sys.battleHeroes[0].hero
const snap1 = []
const snap2 = []
// 捕获两次渲染的样式快照（时间推进）
scene._renderHeroBuffAura(styleCtx, 100, 200, h0)
snap1.push(recordStyle.join('|'))
recordStyle.length = 0
// 等待 ~200ms 让时间变化
await new Promise(r => setTimeout(r, 200))
scene._renderHeroBuffAura(styleCtx, 100, 200, h0)
snap2.push(recordStyle.join('|'))
const stylesDiffer = snap1[0] !== snap2[0]
console.log(`  时间驱动: 两次渲染样式${stylesDiffer ? '不同（粒子在动）' : '相同（静止！）'}`)
assert(stylesDiffer, '粒子动画随时间变化（非静止贴图）')

// ==================== 测试7：端到端渲染（scene.render 完整流程） ====================
console.log('\n=== 测试7: 端到端渲染（scene.render 完整流程画出buff） ===')
// 确保 buff 有效 + 冲击波存在
sys.battleHeroes.forEach(bh => { bh.hero._buffs = []; bh.hero.def = 10 })
sys.buffShockwaves = []
scene._playerAttackMonster(null, manaShield)
// 清空记录，调用完整渲染
drawCalls.length = 0
// 渲染会调用大量绘制；统计其中是否有 ellipse/arc（光环/冲击波/控制圈都用它）
scene.render(trackingCtx)
const endToEndEllipse = drawCalls.filter(c => c === 'ellipse').length
const endToEndArc = drawCalls.filter(c => c === 'arc').length
console.log(`  完整渲染: ellipse调用=${endToEndEllipse} 次, arc调用=${endToEndArc} 次`)
assert(endToEndEllipse > 0, '完整渲染中画了椭圆（冲击波/控制圈）', `ellipse=${endToEndEllipse}`)
assert(endToEndArc > 0, '完整渲染中画了圆/弧（光环粒子）', `arc=${endToEndArc}`)
// 再次确认 buff 数据在渲染时可被读取（battleHeroes 里 hero._buffs 非空）
const renderBuffOk = sys.battleHeroes.some(bh => (bh.hero._buffs || []).some(b => b._active && b._remaining > 0))
assert(renderBuffOk, '渲染时 buff 数据可读取（battleHeroes.hero._buffs）')

// ==================== 测试8：专业粒子系统 ====================
console.log('\n=== 测试8: 专业粒子系统（喷发/更新/衰减） ===')
// 前置：确保英雄有buff
sys.battleHeroes.forEach(bh => { bh.hero._buffs = []; bh.hero.def = 10 })
sys.buffParticles = []
sys.buffShockwaves = []
scene._playerAttackMonster(null, manaShield)
// 1) 释放buff后生成了粒子（_spawnBuffShockwave 触发喷发）
assert(sys.buffParticles.length > 0, '释放buff喷发粒子', `粒子数=${sys.buffParticles.length}`)
// 2) 粒子有速度/衰减/寿命属性（专业粒子的特征）
const p0 = sys.buffParticles[0]
assert(p0.vx !== undefined && p0.vy !== undefined, '粒子带速度(vx/vy)')
assert(p0.decay > 0 && p0.life > 0, '粒子带衰减与寿命(decay/life)')
assert(p0.gravity !== undefined, '粒子带重力(gravity)')
// 3) 更新后粒子移动/衰减
const p0x = p0.x
for (let f = 0; f < 10; f++) scene.update(1/60)
assert(p0.life < 1, '粒子寿命随时间衰减', `life=${p0.life}`)
// 4) 持续喷发：buff 存活期间粒子被补充（不会完全消失）
scene.update(1/60)
const particleCount = sys.buffParticles.length
assert(particleCount > 0, 'buff持续期间持续补充粒子', `粒子数=${particleCount}`)
// 5) 渲染不崩溃（可记录 ctx）
const pctx = new Proxy({}, { get(t,p){ if(p==='canvas'||p==='measureText')return undefined; return ()=>{} }, set(){return true} })
scene._renderBuffParticles(pctx)
assert(true, '粒子渲染正常执行')
// 6) buff 到期后粒子逐渐消失（跑足够长）
for (let f = 0; f < 500; f++) scene.update(1/60)
const finalParticles = sys.buffParticles.filter(p => p.life > 0).length
console.log(`  buff到期后剩余粒子: ${finalParticles}`)
assert(finalParticles < 10, 'buff到期后粒子基本消失', `剩余=${finalParticles}`)

// ==================== 测试9：角色卡 BUFF 状态显示 ====================
console.log('\n=== 测试9: 角色卡 BUFF 状态显示 ===')
// 释放魔力护盾后，角色卡应显示 BUFF（_refreshCharCard 被调用，CharacterState 挂上 _buffs）
sys.battleHeroes.forEach(bh => { bh.hero._buffs = []; bh.hero.def = 10 })
scene._refreshCharCard(sys.battleHeroes[0].hero)   // 重置角色卡
assert(!scene.charInfoPanel.character._buffs || scene.charInfoPanel.character._buffs.length === 0,
  '前置: 角色卡无BUFF')
scene._playerAttackMonster(null, manaShield)
// _refreshCharCard 应把 buffs 同步到角色卡显示对象
assert(scene.charInfoPanel.character._buffs && scene.charInfoPanel.character._buffs.length > 0,
  '开BUFF后角色卡显示BUFF状态', `buffs=${scene.charInfoPanel.character._buffs.length}`)
assert(scene.charInfoPanel.character._buffs[0].type === 'def_up', '角色卡BUFF类型正确')
assert(scene.charInfoPanel.character._buffs[0]._color && scene.charInfoPanel.character._buffs[0]._color.includes('rgba'),
  '角色卡BUFF带颜色（图标可着色）')
// 渲染卡片不崩溃 + 绘制了BUFF图标（fillText）
const cardCtxCalls = []
const cardCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas' || p === 'measureText') return undefined
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
    return (...a) => { cardCtxCalls.push(p); if (p === 'fillText') cardCtxCalls.push(a[0]) }
  },
  set() { return true }
})
scene.charInfoPanel.ctx = cardCtx
scene.charInfoPanel.renderMiniCard(cardCtx, 20, 80)
assert(cardCtxCalls.includes('fillText'), '角色卡绘制了文字')
// ★ 卡片本身不显示 BUFF（用户要求：BUFF 显示在弹出角色信息面板 renderDetailPanel）

// ★ 弹出的角色信息面板（renderDetailPanel）：显示 BUFF 状态 + 攻防数值随 BUFF 提升
scene.charInfoPanel.visible = true
const panelCtxCalls = []
const panelCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas' || p === 'measureText') return undefined
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
    return (...a) => { panelCtxCalls.push(p); if (p === 'fillText') panelCtxCalls.push(a[0]) }
  },
  set() { return true }
})
scene.charInfoPanel.ctx = panelCtx
scene.charInfoPanel.renderDetailPanel()
// BUFF 状态文字（防御提升/攻击提升）
const hasBuffLabel = panelCtxCalls.some(c => typeof c === 'string' && (c.includes('防御提升') || c.includes('攻击提升') || c.includes('金盾') || c.includes('狂暴')))
assert(hasBuffLabel, '角色信息面板显示BUFF状态', `文字: ${panelCtxCalls.filter(c => typeof c === 'string').filter(s => s.includes('提升') || s.includes('金盾') || s.includes('狂暴')).join(',')}`)

// ★ 攻防数值随 BUFF 提升（用户核心诉求：BUFF 增益体现在角色卡数值上）
const bhHero0 = sys.battleHeroes[0].hero
bhHero0.def = 10
bhHero0._buffs = []
scene._refreshCharCard(bhHero0)
const defBefore = scene.charInfoPanel.character._getDefWithBuff()
assert(defBefore === 10, '前置: 无BUFF时防御10', `实际: ${defBefore}`)
// 释放魔力护盾（全体防御+30%）
scene._playerAttackMonster(null, manaShield)
const defAfter = scene.charInfoPanel.character._getDefWithBuff()
assert(defAfter === 13, '魔力护盾后角色卡防御提升 10→13', `实际: ${defAfter}`)
// 战吼（攻击+30%）
const warCrySkill = lixiaobaoCfg.skills.find(s => s.id === 'war_cry')
if (warCrySkill) {
  sys.battleHeroes.forEach(bh => { bh.hero._buffs = []; bh.hero.def = 10 })
  bhHero0.atk = 20
  bhHero0._buffs = []
  scene._refreshCharCard(bhHero0)
  const atkBefore = scene.charInfoPanel.character._getAtkWithBuff()
  scene._playerAttackMonster(null, warCrySkill)
  const atkAfter = scene.charInfoPanel.character._getAtkWithBuff()
  assert(atkBefore === 20 && atkAfter === 26, '战吼后角色卡攻击提升 20→26', `实际: ${atkBefore}→${atkAfter}`)
}

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
