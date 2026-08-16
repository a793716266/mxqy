/**
 * 回归测试：切换控制后召回/解散对原主角生效（Issue #2）
 *         + 非霸体盟友技能被攻击不再打断（Issue #1）
 *
 * 直接加载真实 FieldScene，驱动战斗/切换/召回/解散，断言行为。
 */
import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  return nodeRequire(abs)
}
const canvasCtx = new Proxy({}, { get: (t, p) => {
  if (p === 'canvas' || p === 'measureText') return undefined
  if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
  return () => {}
}, set: () => true })
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => ({ width: 64, height: 64, _onload: null, set onload(f){ this._onload=f }, get onload(){return this._onload} }),
  getStorageSync: (k) => _storage[k], setStorageSync: (k,v)=>{_storage[k]=v},
  getSystemInfoSync: () => ({ windowWidth:750, windowHeight:1334, pixelRatio:3 }),
  onTouchStart:()=>{}, onTouchMove:()=>{}, onTouchEnd:()=>{}, onTouchCancel:()=>{},
  requestAnimationFrame:(cb)=>setTimeout(()=>cb(Date.now()),16),
  canvasToTempFilePath:()=>{}, vibrateShort:()=>{}, showToast:()=>{}, showLoading:()=>{}, hideLoading:()=>{},
  setKeepScreenOn:()=>{}, getMenuButtonBoundingClientRect:()=>({top:50,bottom:90,left:280,right:470,width:190,height:40}),
  onShow:()=>{}, onHide:()=>{}, downloadFile:()=>({onProgressUpdate:()=>{},onHeadersReceived:()=>{}}),
}
class MockGame {
  constructor(){ this.ctx=canvasCtx; this.width=750*3; this.height=1334*3; this.dpr=3;
    this.data={ _d:{}, _flags:new Set(), get:k=>this.data._d[k], set:(k,v)=>{this.data._d[k]=v}, del:k=>{delete this.data._d[k]}, hasFlag:k=>this.data._flags.has(k), setFlag:k=>this.data._flags.add(k), delFlag:k=>this.data._flags.delete(k) };
    this.assets={ getImage:()=>({width:64,height:64}), loadSubpackage:async()=>{}, isLoaded:()=>true };
    this.audio={play:()=>{},playSound:()=>{}}; this.input={taps:[],joystick:{active:false,dx:0,dy:0},consumeTaps:()=>this.input.taps.splice(0)};
    this.showToast=()=>{}; this.sceneManager={changeScene:()=>{}}; }
}
const { FieldScene } = await import('../scripts/scenes/field-scene.js')

let passed = 0, failed = 0
const assert = (cond, msg, extra) => {
  if (cond) { console.log('  ✓', msg); passed++ }
  else { console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); failed++ }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
const D = scene.dpr

// ============ Issue #1：非霸体盟友技能被攻击不应打断 ============
console.log('\n=== (1) 非霸体盟友技能被攻击不应打断 ===')
const hero = {
  name: '测试英雄',
  _aiAttacking: true, _aiAttackTimer: 0.5, _castAxisLock: 0.1, _castLock: 0.1,
  _aiCastingSkill: { name: '火球术', superArmor: false },
  _sprite: { state: 'attack', animFrame: 2 },
}
scene._interruptCastingForHero(hero)
assert(hero._aiAttacking === true, '受击后仍在施法(_aiAttacking 保持 true)', hero._aiAttacking)
assert(hero._aiCastingSkill && hero._aiCastingSkill.name === '火球术', '正在释放的技能未被清除', hero._aiCastingSkill)
assert(hero._aiAttackTimer === 0.5, '攻击计时未被清零', hero._aiAttackTimer)
assert(hero._castLock === 0.1, '施法锁定未被清零', hero._castLock)

// 霸体技能同样不应被打断（保持一致性）
const hero2 = { name: '霸体英雄', _aiAttacking: true, _aiAttackTimer: 0.4, _castAxisLock: 0, _castLock: 0.3,
  _aiCastingSkill: { name: '钢铁意志', superArmor: true }, _sprite: { state: 'attack' } }
scene._interruptCastingForHero(hero2)
assert(hero2._aiAttacking === true && hero2._aiCastingSkill.name === '钢铁意志', '霸体技能同样不被打断', hero2._aiCastingSkill)

// ============ 起战斗 + 切换控制 ============
const mon = { name: 'dummy', alive: true, x: scene.playerX + 60 * D, y: scene.playerY, hp: 100, maxHp: 100, atk: 10, def: 5, skills: [], skillCDs: {} }
scene.battleSystem.active = true
scene.battleSystem.battleTarget = mon
scene._buildBattleHeroes()
scene._initBattleUI()

const ctrlBefore = scene._getCurrentControlHero()
assert(ctrlBefore.hero.name === '臻宝', '初始被控角色=臻宝(party[0])', ctrlBefore && ctrlBefore.hero.name)

scene._switchControl()
const ctrl = scene._getCurrentControlHero()
assert(ctrl.hero.name === '李小宝', '切换后被控角色=李小宝', ctrl && ctrl.hero.name)
const zhen = scene.battleSystem.battleHeroes.find(b => b.partyIndex === 0)
assert(zhen && zhen.hero.name === '臻宝', '切换后臻宝变为 AI 英雄(partyIndex 0)', zhen && zhen.hero.name)

// ============ Issue #2-A：召回（aiRecall=true）应把臻宝聚拢到被控角色身边 ============
console.log('\n=== (2) 切换控制后召回/解散对原主角(臻宝)生效 ===')
const zp0 = zhen.getPos()
zp0.x = scene.playerX + 400 * D
zp0.y = scene.playerY + 400 * D
const ctrlPosBefore = ctrl.getPos()

scene.aiRecall = true
scene._recallAlliesToPlayer()
const zp1 = zhen.getPos()
const cp1 = ctrl.getPos()
const dist = Math.hypot(zp1.x - cp1.x, zp1.y - cp1.y)
const radius = 55 * D
assert(dist <= radius * 1.7, '召回后臻宝聚拢到被控角色身边', { dist: Math.round(dist), radius: Math.round(radius) })
assert(Math.abs(cp1.x - ctrlPosBefore.x) < 1 && Math.abs(cp1.y - ctrlPosBefore.y) < 1, '召回不移动被控角色(李小宝)', { before: ctrlPosBefore, after: cp1 })

// ============ Issue #2-B：解散（aiRecall=false）臻宝应自行靠近最近怪物 ============
scene.aiRecall = false
// 让 dm 成为场上唯一怪物（避免附近的 dummy 把 臻宝 卡在攻击状态、无法验证寻路）
const dm = { name: '散怪', alive: true, id: 'dissolve1', x: ctrl.getPos().x + 320 * D, y: ctrl.getPos().y, hp: 1000, maxHp: 1000, atk: 5, def: 2, skills: [], skillCDs: {} }
scene.mapMonsters = [dm]
scene.battleSystem.battleTarget = dm
const ap0 = zhen.getPos()
const d0 = Math.hypot(ap0.x - dm.x, ap0.y - dm.y)
for (let i = 0; i < 60; i++) scene._updateAllyAI(1 / 60)
const ap1 = zhen.getPos()
const d1 = Math.hypot(ap1.x - dm.x, ap1.y - dm.y)
assert(d1 < d0 - 30 * D, '解散后臻宝自行靠近最近怪物(距离明显缩短)', { d0: Math.round(d0), d1: Math.round(d1) })

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)