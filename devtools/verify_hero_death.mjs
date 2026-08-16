/**
 * 验证：AI 角色被怪物打死消失 + 全部阵亡回城镇
 * =========================================
 * 1. 怪物攻击把李小宝（AI）打死 → alive=false，渲染跳过
 * 2. 主角也死 → 全灭 → _endFieldBattle(false) → changeScene('town')
 */
import { createRequire } from 'module'
import path from 'path'
const __dirname = process.cwd()
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => { const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p; return nodeRequire(abs) }
const canvasCtx = new Proxy({}, { get(t,p){ if(p==='canvas'||p==='measureText')return undefined; if(p==='createLinearGradient'||p==='createRadialGradient')return ()=>({addColorStop(){}}); return ()=>{} }, set(){return true} })
const mockCanvas = { width:750, height:1334, getContext:()=>canvasCtx }
const _storage = {}
globalThis.wx = { createCanvas:()=>mockCanvas, createImage:()=>{const i={width:64,height:64};setTimeout(()=>{if(i.onload)i.onload()},0);return i}, getStorageSync:(k)=>_storage[k], setStorageSync:(k,v)=>{_storage[k]=v}, getSystemInfoSync:()=>({windowWidth:750,windowHeight:1334,pixelRatio:3}), onTouchStart:()=>{},onTouchMove:()=>{},onTouchEnd:()=>{},onTouchCancel:()=>{}, requestAnimationFrame:(cb)=>setTimeout(()=>cb(Date.now()),16), canvasToTempFilePath:()=>{},vibrateShort:()=>{},showToast:()=>{},showLoading:()=>{},hideLoading:()=>{},setKeepScreenOn:()=>{},getMenuButtonBoundingClientRect:()=>({top:50,bottom:90,left:280,right:470,width:190,height:40}),onShow:()=>{},onHide:()=>{},downloadFile:()=>({onProgressUpdate:()=>{},onHeadersReceived:()=>{}}) }
class MockGame {
  constructor() {
    this.ctx = canvasCtx
    this.width = 750*3
    this.height = 1334*3
    this.dpr = 3
    this.data = { _d:{}, _flags:new Set(), get:(k)=>this.data._d[k], set:(k,v)=>{this.data._d[k]=v}, delete:(k)=>{delete this.data._d[k]}, hasFlag:(k)=>this.data._flags.has(k), setFlag:(k)=>this.data._flags.add(k), delFlag:(k)=>this.data._flags.delete(k) }
    this.assets = { get:()=>({width:64,height:64}), getImage:()=>({width:64,height:64}), loadSubpackage:async()=>{}, isLoaded:()=>true }
    this.audio = { play:()=>{}, playSound:()=>{} }
    this.input = { taps:[], touches:{}, consumeTaps:()=>this.input.taps.splice(0,this.input.taps.length) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => { this._changedScene = 'town' } }
    this.changeScene = (n) => { this._changedScene = n }
  }
}
const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
const sys = scene.battleSystem
sys.active = true
scene._buildBattleHeroes()
scene._initBattleUI()

let passed=0, failed=0
const assert=(c,n,d)=>{ if(c){passed++;console.log(`  ✓ ${n}`)} else {failed++;console.log(`  ✗ ${n}  ${d||''}`)} }

// ==================== 测试1：怪物打死李小宝（AI） ====================
console.log('\n=== 测试1: 怪物攻击把李小宝打死 → alive=false ===')
const lxb = sys.battleHeroes[1].hero
lxb.hp = 10
lxb.maxHp = 100
lxb.alive = true
lxb.def = 0
// 怪物（高攻）锁定李小宝（最近）
scene.mapMonsters = [{ id:'m1', name:'坏猫', enemyId:'wild_cat', alive:true, x: scene.playerX + 10, y: scene.playerY, hp:999, maxHp:999, def:0, atk:100, level:1, attackCDTimer:0, attackInterval:100, skillCDs:{}, _frozen:false }]
// 把李小宝放得比主角更近怪物
scene._heroWorldPos[0] = { x: scene.playerX + 500, y: scene.playerY }   // 主角远
scene._heroWorldPos[1] = { x: scene.playerX + 10, y: scene.playerY }   // 李小宝近
// 驱动若干帧让怪物攻击
let lxbDied = false
for (let f = 0; f < 120; f++) {
  scene.update(1/60)
  if (lxb.hp <= 0) { lxbDied = true; break }
}
console.log(`  李小宝 hp=${lxb.hp} alive=${lxb.alive}`)
assert(lxbDied, '怪物把李小宝打死（hp=0）')
assert(lxb.alive === false, '李小宝 alive 置为 false（死亡消失）')
// 渲染跳过验证：drawBar 不应为死亡角色绘制
const drawCalls = []
const dctx = new Proxy({}, { get(t,p){ if(p==='canvas'||p==='measureText')return undefined; if(p==='createLinearGradient'||p==='createRadialGradient')return ()=>({addColorStop(){}}); return (...a)=>{ if(p==='fillText')drawCalls.push(a[0]) } }, set(){return true} })
scene._renderWorldHealthBars(dctx)
const hasLxbName = drawCalls.some(t => typeof t === 'string' && t.includes('李小宝'))
assert(!hasLxbName, '死亡李小宝不显示血条/名字', `drawText: ${drawCalls.filter(t=>typeof t==='string').join(',')}`)

// ==================== 测试2：全部阵亡 → 先回城镇，再复活 ====================
console.log('\n=== 测试2: 全部阵亡 → 保持死亡回城，到城镇再复活 ===')
// 主角也打死
const zhenbao = sys.battleHeroes[0].hero
zhenbao.hp = 0
zhenbao.alive = false
// 再驱动帧，触发全灭检测
for (let f = 0; f < 60; f++) scene.update(1/60)
console.log(`  active=${sys.active}, _changedScene=${game._changedScene}`)
// ★ 关键断言：触发全灭后（changeScene 调用前），角色不应被复活
assert(zhenbao.hp === 0, '全灭后角色保持死亡（未先复活）', `hp=${zhenbao.hp}`)
// 等待 changeScene 延迟（800ms）
await new Promise(r => setTimeout(r, 900))
console.log(`  延迟后 _changedScene=${game._changedScene}`)
assert(game._changedScene === 'town', '全部阵亡后回到城镇', `实际: ${game._changedScene}`)
// ★ 到城镇后应复活（needReviveOnTown 标记 + town 处理）
assert(game.data.get('needReviveOnTown') === true, '设置 needReviveOnTown 标记（由城镇处理复活）')

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
