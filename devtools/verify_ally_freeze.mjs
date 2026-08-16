/**
 * 回归测试：AI 攻击单位时，若目标单位跳跃攻击后远离，队友应重新寻路而非傻在原地（Issue #3）
 *
 * 直接驱动 _getAllyCombatTarget：构造一个已锁定站位点的队友，让目标怪物大幅位移，
 * 断言返回的输出位被重新规划到怪物新位置附近（而非停留在旧站位点）。
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

// 怪物 M1：初始位置 (1000, 1000)
const M1 = { name: '跳跳怪', alive: true, id: 'm1', x: 1000, y: 1000, hp: 100, maxHp: 100, atk: 10, def: 5, skills: [], skillCDs: {} }
scene.mapMonsters = [M1]

// 队友：已锁定 M1，站位点记录为 M1 旧位置
const follower = {
  name: '队友A', x: 1000, y: 1150,
  _aiTargetId: 'm1',
  _lockedStand: { x: 1000, y: 1000, _targetId: 'm1' },
}

// ---------- 场景 A：目标大幅跳跃远离（>200*dpr） ----------
console.log('\n=== (3-A) 目标跳跃攻击远离后，队友重新选最近目标并重新规划站位 ===')
M1.x = 1000 + 350 * D  // 位移 350*dpr > 200*dpr
M1.y = 1000
follower._aiTargetId = 'm1'
follower._lockedStand = { x: 1000, y: 1000, _targetId: 'm1' }
const standA = scene._getAllyCombatTarget(follower, 1)
assert(standA !== null, '仍返回有效站位(未冻结)', standA)
const nearNew = Math.hypot(standA.x - M1.x, standA.y - M1.y)
const nearOld = Math.hypot(standA.x - 1000, standA.y - 1000)
assert(nearNew < nearOld, '输出位重新规划到怪物新位置附近(而非旧站位点)', { nearNew: Math.round(nearNew), nearOld: Math.round(nearOld) })
assert(follower._aiTargetId === 'm1', '目标仍为最近怪物(已重新锁定)', follower._aiTargetId)
assert(follower._lockedStand && follower._lockedStand._targetId === 'm1', '站位点已更新到新目标', follower._lockedStand)

// ---------- 场景 B：目标中幅位移（90~200*dpr）放弃旧站位、重规划 ----------
console.log('\n=== (3-B) 目标中幅位移(>90*dpr)放弃旧站位点并重新规划 ===')
M1.x = 1000 + 130 * D  // 位移 130*dpr，介于 90~200 之间
M1.y = 1000
follower._aiTargetId = 'm1'
follower._lockedStand = { x: 1000, y: 1000, _targetId: 'm1' }
const standB = scene._getAllyCombatTarget(follower, 1)
const nearOldB = Math.hypot(standB.x - 1000, standB.y - 1000)  // 与「旧站位点」的距离
assert(nearOldB > 50 * D, '中幅位移后输出位已离开旧站位点(重新规划，未冻结在原地)', { nearOldB: Math.round(nearOldB) })
const nearNewB = Math.hypot(standB.x - M1.x, standB.y - M1.y)
assert(nearNewB < 200 * D, '中幅位移后输出位落在怪物新位置附近', { nearNewB: Math.round(nearNewB) })

// ---------- 场景 C：对照组——目标基本没动，应保留旧站位(不抖动) ----------
console.log('\n=== (3-C) 目标未位移，保持原锁定站位(无抖动) ===')
M1.x = 1000 + 130 * D
M1.y = 1000
follower._aiTargetId = 'm1'
follower._lockedStand = { x: M1.x, y: M1.y, _targetId: 'm1' }  // 已对齐新位置
const standC = scene._getAllyCombatTarget(follower, 1)
assert(standC && Math.abs(standC.x - follower._lockedStand.x) < 1, '目标稳定时沿用已锁定站位', standC && standC.x)

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)