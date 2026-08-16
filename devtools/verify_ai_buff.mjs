/**
 * AI 技能决策针对性验证（Node 端“自己测 AI”）
 * =========================================
 * 直接用真实 FieldScene 的 _allyTryCastSkill 做单元式断言，覆盖：
 *   A. 安全时主动开进攻 BUFF（战吼/狂暴）
 *   B. 脆皮接敌即主动开防御 BUFF（不再等挨打）
 *   C. 受击时优先选【防御】而非普攻
 *   D. 治疗技能真正回血（验证 _applyHeroBuff heal 分支）
 *   E. 多怪(≥2) 优先 AOE
 *   F. 挑衅/财运 现已实现 → AI 正常施放（不再是 noop 空转）
 *
 * 用法: node scripts/tools/verify_ai_buff.mjs
 */

// ==================== 全局 wx mock（与 simulate_game.mjs 一致） ====================
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
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {},
}

class MockGame {
  constructor() {
    this.ctx = canvasCtx; this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
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
const __dirname = process.cwd()
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => { const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p; return nodeRequire(abs) }

const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
scene.battleSystem.active = true
scene.dpr = 3
scene.cameraX = 0; scene.cameraY = 0

// ==================== 测试脚手架 ====================
let passed = 0, failed = 0
const assert = (cond, name, detail) => { if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) } }

const MONSTER = { id: 'm', name: '测试怪', alive: true, x: 60, y: 0, hp: 100, maxHp: 100, def: 5, atk: 10, level: 1 }

function makeHero(name, role, skills) {
  return {
    name, role,
    hp: 100, maxHp: 100, mp: 100, maxMp: 100,
    atk: 20, def: 10, matk: 20, crit: 0.05,
    skills, _buffs: [], _aiSkillsCD: {}, _aiSkillLock: 0, _lastHitTime: undefined,
    sprite: null,
  }
}
function setupBattle(heroes) {
  const bhs = heroes.map(h => ({ hero: h, sprite: null, partyIndex: 0, getPos: () => ({ x: 0, y: 0 }) }))
  scene.battleSystem.battleHeroes = bhs
  scene.battleSystem.currentControlIndex = 0
  scene.mapMonsters = [{ ...MONSTER }]
  // 清空上一轮残留 buff
  heroes.forEach(h => { h._buffs = []; h._aiSkillsCD = {}; h._aiSkillLock = 0; h._lastHitTime = undefined })
  return bhs
}

const SK = {
  warCry:   { id: 'war_cry', name: '战吼', type: 'buff', mpCost: 8, cooldown: 3, effect: 'atk_up', value: 0.3, turns: 3 },
  berserk:   { id: 'berserk', name: '狂暴', type: 'buff', mpCost: 15, cooldown: 3, effect: 'atk_up_self', value: 0.5, turns: 3 },
  magicShield: { id: 'magic_shield', name: '魔力护盾', type: 'buff', mpCost: 10, cooldown: 3, effect: 'def_up_self', value: 0.3, duration: 3 },
  holyShield: { id: 'holy_shield', name: '圣盾之光', type: 'buff', mpCost: 10, cooldown: 15, effect: 'def_up', value: 0.3, duration: 3 },
  slash:     { id: 'slash', name: '斩击', type: 'attack', mpCost: 0, range: 100, power: 1.2 },
  fireball:  { id: 'fireball', name: '火球', type: 'magic', mpCost: 7, cooldown: 5, aoe: { aoeType: 'lineX', enabled: true }, power: 1.4, range: 200 },
  healLight: { id: 'heal_light', name: '治愈之光', type: 'heal', mpCost: 10, cooldown: 8, power: 30, target: 'all_ally' },
  taunt:     { id: 'taunt', name: '挑衅', type: 'buff', mpCost: 5, cooldown: 5, effect: 'taunt', turns: 2 },
  fortune:   { id: 'fortune', name: '财运', type: 'buff', mpCost: 15, cooldown: 5, effect: 'gold_up', turns: 5 },
}

// ==================== 场景 A：安全时主动开进攻 BUFF ====================
console.log('\n=== A. 安全时主动开进攻 BUFF（臻宝 战吼/狂暴）===')
{
  const zhenbao = makeHero('臻宝', 'warrior', [SK.warCry, SK.berserk, SK.slash])
  const [bh] = setupBattle([zhenbao])
  const ok = scene._allyTryCastSkill(bh, scene.mapMonsters[0], 1)
  assert(ok === true, 'AI 释放了技能')
  const atkBuff = zhenbao._buffs.find(b => b.type === 'atk_up' || b.type === 'atk_up_self')
  assert(!!atkBuff, '进攻 BUFF 已生效（atk_up/atk_up_self）', `buffs=${JSON.stringify(zhenbao._buffs.map(b => b.type))}`)
  assert(zhenbao.mp < 100, '释放技能扣除 MP', `mp=${zhenbao.mp}`)
}

// ==================== 场景 B：脆皮接敌即主动开防御 BUFF ====================
console.log('\n=== B. 脆皮(法师)接敌即主动开防御 BUFF（不再等挨打）===')
{
  const lxb = makeHero('李小宝', 'mage', [SK.magicShield])
  const [bh] = setupBattle([lxb])
  const ok = scene._allyTryCastSkill(bh, scene.mapMonsters[0], 1)
  assert(ok === true, 'AI 释放了技能')
  const defBuff = lxb._buffs.find(b => b.type === 'def_up' || b.type === 'def_up_self')
  assert(!!defBuff, '防御 BUFF 已生效（满血也主动开）', `buffs=${JSON.stringify(lxb._buffs.map(b => b.type))}`)
}

// ==================== 场景 C：受击时优先选防御而非普攻 ====================
console.log('\n=== C. 受击时优先选【防御】而非普攻 ===')
{
  const zh = makeHero('臻宝', 'warrior', [SK.slash, SK.magicShield])
  const [bh] = setupBattle([zh])
  zh._lastHitTime = Date.now() / 1000   // 刚挨打
  const ok = scene._allyTryCastSkill(bh, scene.mapMonsters[0], 1)
  assert(ok === true, 'AI 释放了技能')
  const castSkill = zh._casting ? null : null
  // 通过 buff 是否生成判断选的是防御
  const defBuff = zh._buffs.find(b => b.type === 'def_up' || b.type === 'def_up_self')
  assert(!!defBuff, '受击时选的是防御 BUFF（非普攻）', `buffs=${JSON.stringify(zh._buffs.map(b => b.type))}`)
}

// ==================== 场景 D：治疗技能真正回血 ====================
console.log('\n=== D. 治疗技能真正回血（艾米 治愈之光）===')
{
  const amy = makeHero('艾米', 'healer', [SK.healLight])
  const injured = makeHero('伤员', 'warrior', [SK.slash])
  injured.hp = 50
  const bhs = setupBattle([amy, injured])
  const ok = scene._allyTryCastSkill(bhs[0], scene.mapMonsters[0], 1)
  assert(ok === true, 'AI 释放了治疗技能')
  assert(injured.hp > 50, '伤员生命被回复', `hp=${injured.hp}（前 50）`)
  assert(amy.hp > 100 - 1 && amy.hp <= 100, '治疗者自身也被回（满血封顶）', `hp=${amy.hp}`)
}

// ==================== 场景 E：多怪(≥2) 优先 AOE ====================
console.log('\n=== E. 多怪(≥2) 优先 AOE ===')
{
  const zh = makeHero('臻宝', 'warrior', [SK.fireball, SK.slash])
  const [bh] = setupBattle([zh])
  scene.mapMonsters = [MONSTER, { ...MONSTER, id: 'm2', x: 80, y: 0 }]  // 2 只
  const ok = scene._allyTryCastSkill(bh, scene.mapMonsters[0], 1)
  assert(ok === true, 'AI 释放了技能')
  // AOE 走 _castFireballAoE，会产生投射物；用 battleSystem.projectiles 判断
  const proj = (scene.battleSystem.projectiles || [])
  assert(proj.length > 0, 'AOE 生成了投射物', `proj=${proj.length}`)
}

// ==================== 场景 F：挑衅/财运 现已实现 → AI 正常施放 ====================
console.log('\n=== F. 挑衅/财运 已实现 → AI 正常施放（不再 noop 空转）===')
{
  const qdd = makeHero('钱多多', 'warrior', [SK.taunt, SK.fortune])
  const [bh] = setupBattle([qdd])
  const mpBefore = qdd.mp
  const ok = scene._allyTryCastSkill(bh, scene.mapMonsters[0], 1)
  assert(ok === true, '挑衅/财运 已实现 → AI 施放技能（返回 true）')
  assert(qdd.mp < mpBefore, '施放消耗 MP（不再是 noop 空转）', `mp ${mpBefore} -> ${qdd.mp}`)
  const castBuff = qdd._buffs.find(b => b.type === 'taunt' || b.type === 'gold_up')
  assert(!!castBuff, '施放后获得 taunt/gold_up buff（实现生效）', `buffs=${JSON.stringify(qdd._buffs.map(b => b.type))}`)
}

console.log(`\n=== AI BUFF 验证结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
