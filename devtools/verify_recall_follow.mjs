/**
 * 回归测试：切换控制 + 召回后，原主角(臻宝, 现为 AI 英雄)必须跟随被控角色(李小宝)。
 *
 * 修复前缺陷：召回后 臻宝 走到第一个障碍物边界(约 x=1073)即被 moveWithSlide 永久卡死，
 *            玩家一路右移，间距越拉越大(最终 ~3922)，表现为「臻宝被召回后不跟随」。
 *            根因：主角跟随分支没有障碍物绕行/兜底恢复（猫咪队友有，主角没有）。
 *
 * 本测试断言：
 *  (1) 召回瞬间 臻宝 聚拢到被控角色身边（基础召回生效）；
 *  (2) 长时间移动后 臻宝 已明显前进（未被障碍物卡死在原地）；
 *  (3) 终点间距有界（不再越落越远）。
 *
 * 直接加载真实 FieldScene，驱动战斗/切换/召回/移动，断言行为。
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

const zhenPos = () => { const b = scene.battleSystem.battleHeroes.find(x => x.hero.name === '臻宝'); return b ? b.getPos() : null }
const liPos = () => { const b = scene.battleSystem.battleHeroes.find(x => x.hero.name === '李小宝'); return b ? b.getPos() : null }
const gap = () => Math.hypot(zhenPos().x - scene.playerX, zhenPos().y - scene.playerY)

// ============ 起战斗 + 切换控制（臻宝 → 李小宝）+ 召回 ============
scene.battleSystem.active = true
scene._buildBattleHeroes()
const ctrlBefore = scene._getCurrentControlHero()
assert(ctrlBefore.hero.name === '臻宝', '初始被控角色=臻宝(party[0])', ctrlBefore && ctrlBefore.hero.name)

scene._switchControl()
const ctrl = scene._getCurrentControlHero()
assert(ctrl.hero.name === '李小宝', '切换后被控角色=李小宝', ctrl && ctrl.hero.name)
const zhen = scene.battleSystem.battleHeroes.find(b => b.hero.name === '臻宝')
assert(!!zhen, '切换后 臻宝 仍存在于 battleHeroes', zhen && zhen.hero.name)

scene.aiRecall = true
scene._recallAlliesToPlayer()
const zpRecall = zhenPos()
const cpRecall = ctrl.getPos()
const recallDist = Math.hypot(zpRecall.x - cpRecall.x, zpRecall.y - cpRecall.y)
assert(recallDist <= 55 * D * 1.7, '召回后 臻宝 聚拢到被控角色身边(环内)', { recallDist: Math.round(recallDist), max: Math.round(55*D*1.7) })

// 真实玩家速度驱动（被控者 李小宝）。同步其世界坐标（模拟真实每帧输入同步）。
const drive = (frames, { combat }) => {
  scene.battleSystem.active = combat
  scene.mapMonsters = []
  scene.battleSystem.battleTarget = null
  scene.playerX = liPos().x; scene.playerY = liPos().y
  if (scene._heroWorldPos[1]) scene._heroWorldPos[1].x = scene.playerX
  const ci = scene.battleSystem.battleHeroes[0].partyIndex
  for (let i = 0; i < frames; i++) {
    scene.playerX += scene.playerSpeed * (1/60)   // 真实满速右移（playerSpeed 已含 dpr，无需再乘 D）
    if (scene._heroWorldPos && scene._heroWorldPos[ci]) scene._heroWorldPos[ci].x = scene.playerX
    scene._updateFollowers(1/60)
    if (scene.battleSystem.active) scene._updateBattleSystem(1/60)
  }
}

// ============ 场景 A：战斗 + 召回，长时间右移（附近无怪）→ 必须跟随 ============
console.log('\n=== (A) 战斗 + 召回 + 无怪：长时间右移后 臻宝 跟随被控角色 ===')
const zStartA = zhenPos().x
const gStartA = gap()
drive(600, { combat: true })
const zEndA = zhenPos().x
const gEndA = gap()
const movedA = zEndA - zStartA
assert(movedA > 2500, '臻宝 已明显前进(未被障碍物卡死在 x≈1073)', { movedA: Math.round(movedA) })
assert(gEndA < 1800, '终点间距有界(不再越落越远)', { gStartA: Math.round(gStartA), gEndA: Math.round(gEndA) })

// ============ 场景 B：非战斗，长时间右移（原冻结现场）→ 必须跟随 ============
console.log('\n=== (B) 非战斗 + 召回：长时间右移后 臻宝 跟随被控角色 ===')
scene.aiRecall = true
scene._recallAlliesToPlayer()
const zStartB = zhenPos().x
const gStartB = gap()
drive(600, { combat: false })
const zEndB = zhenPos().x
const gEndB = gap()
const movedB = zEndB - zStartB
assert(movedB > 2000, '非战斗下 臻宝 仍跟随前进(绕障不冻结)', { movedB: Math.round(movedB) })
assert(gEndB < 2500, '非战斗终点间距有界', { gStartB: Math.round(gStartB), gEndB: Math.round(gEndB) })

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
