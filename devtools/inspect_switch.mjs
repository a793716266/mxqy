/**
 * 诊断脚本：切换控制 + 召回/解散 后，followers 与 battleHeroes 的实际状态。
 * 仅打印，不断言，用来确认 issue #2 的根因。
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

const game = new MockGame()
const scene = new FieldScene(game, { area:'grassland' })
await scene.init()

const dump = (tag) => {
  console.log(`\n===== ${tag} =====`)
  console.log('party[0]=', scene.party && scene.party[0] && scene.party[0].name)
  console.log('followers(%d):', scene.followers.length, scene.followers.map(f => (f.hero||f.character||f).name).join(', '))
  const bh = scene.battleSystem.battleHeroes
  console.log('battleHeroes(%d):', bh.length, bh.map(b => `${b.hero.name}[idx${b.partyIndex}${b.followerRef?'(hasFollowerRef)':'(noFollowerRef)'}]`).join(', '))
  bh.forEach(b => {
    const p = b.getPos()
    console.log(`   - ${b.hero.name}: pos=(${Math.round(p.x)},${Math.round(p.y)}) hp=${b.hero.hp}`)
  })
}

// 起一场战斗
const mon = { name:'dummy', alive:true, x: scene.playerX + 60*scene.dpr, y: scene.playerY, hp:100, maxHp:100, atk:10, def:5, skills:[], skillCDs:{} }
scene.battleSystem.active = true
scene.battleSystem.battleTarget = mon
scene._buildBattleHeroes()
scene._initBattleUI()
dump('初始 (controlled=party[0])')

// 切换控制
scene._switchControl()
dump('切换控制后')

// 召回
scene.aiRecall = true
scene._recallAlliesToPlayer()
dump('点击召回后')

// 解散
scene.aiRecall = false
dump('点击解散后(仅切换aiRecall标志)')
process.exit(0)
