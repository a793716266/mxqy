/**
 * 诊断脚本：切换控制 + 召回后，非战斗/战斗中 臻宝(主角)是否跟随被控角色(李小宝)。
 * 用真实玩家速度(battleHeroes 被控者的 playerSpeed)长时间驱动，验证间距有界(不再越落越远)。
 *
 * 仅用于人工排查，非回归测试。回归测试见 verify_recall_follow.mjs。
 */
import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => { const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p; return nodeRequire(abs) }
const canvasCtx = new Proxy({}, { get: (t, p) => { if (p==='canvas'||p==='measureText') return undefined; if (p==='createLinearGradient'||p==='createRadialGradient') return ()=>({addColorStop(){}}); return ()=>{} }, set: ()=>true })
const mockCanvas = { width:750, height:1334, getContext:()=>canvasCtx }
const _storage = {}
globalThis.wx = { createCanvas:()=>mockCanvas, createImage:()=>({width:64,height:64,_onload:null,set onload(f){this._onload=f},get onload(){return this._onload}}), getStorageSync:(k)=>_storage[k], setStorageSync:(k,v)=>{_storage[k]=v}, getSystemInfoSync:()=>({windowWidth:750,windowHeight:1334,pixelRatio:3}), onTouchStart:()=>{},onTouchMove:()=>{},onTouchEnd:()=>{},onTouchCancel:()=>{}, requestAnimationFrame:(cb)=>setTimeout(()=>cb(Date.now()),16), canvasToTempFilePath:()=>{}, vibrateShort:()=>{}, showToast:()=>{}, showLoading:()=>{}, hideLoading:()=>{}, setKeepScreenOn:()=>{}, getMenuButtonBoundingClientRect:()=>({top:50,bottom:90,left:280,right:470,width:190,height:40}), onShow:()=>{}, onHide:()=>{}, downloadFile:()=>({onProgressUpdate:()=>{},onHeadersReceived:()=>{}}) }
class MockGame { constructor(){ this.ctx=canvasCtx; this.width=750*3; this.height=1334*3; this.dpr=3; this.data={_d:{},_flags:new Set(),get:k=>this.data._d[k],set:(k,v)=>{this.data._d[k]=v},del:k=>{delete this.data._d[k]},hasFlag:k=>this.data._flags.has(k),setFlag:k=>this.data._flags.add(k),delFlag:k=>this.data._flags.delete(k)}; this.assets={getImage:()=>({width:64,height:64}),loadSubpackage:async()=>{},isLoaded:()=>true}; this.audio={play:()=>{},playSound:()=>{}}; this.input={taps:[],joystick:{active:false,dx:0,dy:0},consumeTaps:()=>this.input.taps.splice(0)}; this.showToast=()=>{}; this.sceneManager={changeScene:()=>{}} } }
const { FieldScene } = await import('../scripts/scenes/field-scene.js')

const game = new MockGame()
const scene = new FieldScene(game, { area:'grassland' })
await scene.init()
const D = scene.dpr
const zhenPos = () => { const b = scene.battleSystem.battleHeroes.find(x => x.hero.name === '臻宝'); return b ? b.getPos() : null }
const liPos = () => { const b = scene.battleSystem.battleHeroes.find(x => x.hero.name === '李小宝'); return b ? b.getPos() : null }

// 起战斗 + 切换 + 召回
scene.battleSystem.active = true
scene._buildBattleHeroes()
scene._switchControl()               // 臻宝 → 李小宝
scene.aiRecall = true
scene._recallAlliesToPlayer()

// 真实玩家速度驱动（被控者 李小宝），并同步其世界坐标（模拟真实每帧输入同步）
const stepPlayer = (frames) => {
  const ci = scene.battleSystem.battleHeroes[0].partyIndex
  for (let i = 0; i < frames; i++) {
    scene.playerX += scene.playerSpeed * (1/60)   // 真实满速右移（playerSpeed 已含 dpr，无需再乘 D）
    if (scene._heroWorldPos && scene._heroWorldPos[ci]) scene._heroWorldPos[ci].x = scene.playerX
    scene._updateFollowers(1/60)
    if (scene.battleSystem.active) scene._updateBattleSystem(1/60)
  }
}
const gap = () => Math.hypot(zhenPos().x - scene.playerX, zhenPos().y - scene.playerY)

// 场景A：非战斗，长时间右移（清空怪物，避免触发自动开战导致控制权回到主角）
scene.battleSystem.active = false
scene.mapMonsters = []
scene.playerX = liPos().x; scene.playerY = liPos().y
if (scene._heroWorldPos[1]) scene._heroWorldPos[1].x = scene.playerX
const startA = gap()
for (let s=0; s<600; s++){
  const ci = scene.battleSystem.battleHeroes[0].partyIndex
  scene.playerX += scene.playerSpeed * (1/60)
  if (scene._heroWorldPos[ci]) scene._heroWorldPos[ci].x = scene.playerX
  scene._updateFollowers(1/60)
}
console.log(`[非战斗 长时右移] 起距=${Math.round(startA)} 终距=${Math.round(gap())} 臻宝终pos=(${Math.round(zhenPos().x)},${Math.round(zhenPos().y)}) 玩家终pos=(${Math.round(scene.playerX)},${Math.round(scene.playerY)})`)

// 场景B：战斗 + 召回，长时间右移（附近无怪，验证跟随）
scene.battleSystem.active = true
scene.mapMonsters = []
scene.battleSystem.battleTarget = null
scene.playerX = liPos().x; scene.playerY = liPos().y
if (scene._heroWorldPos[1]) scene._heroWorldPos[1].x = scene.playerX
const startB = gap()
stepPlayer(600)
console.log(`[战斗/召回/无怪] 起距=${Math.round(startB)} 终距=${Math.round(gap())} 臻宝终pos=(${Math.round(zhenPos().x)},${Math.round(zhenPos().y)})`)

// 场景C：战斗 + 解散（aiRecall=false），附近有怪 → 应去打怪而非跟随
scene.aiRecall = false
scene.mapMonsters = [{ name:'m', alive:true, x: scene.playerX + 70*D, y: scene.playerY, hp:100, maxHp:100, atk:1, def:1, skills:[], skillCDs:{} }]
scene.battleSystem.battleTarget = scene.mapMonsters[0]
scene.playerX = liPos().x; scene.playerY = liPos().y
if (scene._heroWorldPos[1]) scene._heroWorldPos[1].x = scene.playerX
const z0 = zhenPos().x
stepPlayer(60)
const wentToMonster = Math.abs(zhenPos().x - (scene.playerX + 70*D)) < Math.abs(z0 - (scene.playerX + 70*D))
console.log(`[战斗/解散/有怪] 终距=${Math.round(gap())} 臻宝是否靠近怪物打怪=${wentToMonster}`)

process.exit(0)
