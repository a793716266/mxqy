import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => { const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p; return nodeRequire(abs) }
const canvasCtx = new Proxy({}, { get(t,p){ if(p==='canvas'||p==='measureText')return undefined; if(p==='createLinearGradient'||p==='createRadialGradient')return ()=>({addColorStop(){}}); return ()=>{} }, set(){return true} })
const mockCanvas = { width:750, height:1334, getContext:()=>canvasCtx }
const _storage = {}
globalThis.wx = { createCanvas:()=>mockCanvas, createImage:()=>{const i={width:64,height:64};setTimeout(()=>{if(i.onload)i.onload()},0);return i}, getStorageSync:(k)=>_storage[k], setStorageSync:(k,v)=>{_storage[k]=v}, getSystemInfoSync:()=>({windowWidth:750,windowHeight:1334,pixelRatio:3}), onTouchStart:()=>{},onTouchMove:()=>{},onTouchEnd:()=>{},onTouchCancel:()=>{}, requestAnimationFrame:(cb)=>setTimeout(()=>cb(Date.now()),16), canvasToTempFilePath:()=>{},vibrateShort:()=>{},showToast:()=>{},showLoading:()=>{},hideLoading:()=>{},setKeepScreenOn:()=>{},getMenuButtonBoundingClientRect:()=>({top:50,bottom:90,left:280,right:470,width:190,height:40}),onShow:()=>{},onHide:()=>{},downloadFile:()=>({onProgressUpdate:()=>{},onHeadersReceived:()=>{}}) }
class MockGame { constructor(){ this.ctx=canvasCtx; this.width=750*3; this.height=1334*3; this.dpr=3; this.data={_d:{},_flags:new Set(),get:(k)=>this.data._d[k],set:(k,v)=>{this.data._d[k]=v},del:(k)=>{delete this.data._d[k]},hasFlag:(k)=>this.data._flags.has(k),setFlag:(k)=>this.data._flags.add(k),delFlag:(k)=>this.data._flags.delete(k)}; this.assets={get:()=>({width:64,height:64}),getImage:()=>({width:64,height:64}),loadSubpackage:async()=>{},isLoaded:()=>true}; this.audio={play:()=>{},playSound:()=>{}}; this.input={taps:[],touches:{},consumeTaps:()=>this.input.taps.splice(0,this.input.taps.length)}; this.showToast=()=>{}; this.sceneManager={changeScene:()=>{}}; this.effects={playHitEffect:()=>{}} } }

const { FieldScene } = await import('../scenes/field-scene.js')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
const sys = scene.battleSystem
sys.active = true
scene._buildBattleHeroes()
scene._initBattleUI()

// 记录每个 hero 是否有 getExpProgress
console.log('=== 初始 hero 检查 ===')
sys.battleHeroes.forEach((bh, i) => {
  console.log(`bh[${i}].hero=${bh.hero.name}, getExpProgress=${typeof bh.hero.getExpProgress}, id=${bh.hero.id}`)
})

// 多次切换，检查 hero 对象是否变化
console.log('\n=== 多次切换 hero 对象检查 ===')
const origHero0 = sys.battleHeroes[0].hero
const origHero1 = sys.battleHeroes[1].hero
for (let i = 0; i < 6; i++) {
  scene._switchControl()
  const h = sys.battleHeroes[0].hero
  console.log(`切换${i+1}次后: 被控=${h.name}, getExpProgress=${typeof h.getExpProgress}, 引用不变=${h === origHero0 || h === origHero1}`)
  if (typeof h.getExpProgress !== 'function') {
    console.log(`  ✗ 崩溃点! ${h.name} 无 getExpProgress`)
    console.log(`  对象keys: ${Object.keys(h).slice(0, 15).join(',')}`)
  }
}
// 模拟 renderMiniCard 崩溃场景（检查实际传给渲染面板的对象）
console.log('\n=== 模拟 render 崩溃检查（面板实际对象） ===')
let crash = false
try {
  sys.battleHeroes.forEach(bh => {
    // _refreshCharCard 会转成 CharacterState 实例传给面板
    scene._refreshCharCard(bh.hero)
    const panelChar = scene.charInfoPanel.character
    if (typeof panelChar.getExpProgress !== 'function') {
      console.log(`✗ 面板对象 ${panelChar.name} 无 getExpProgress`)
      crash = true
    } else {
      console.log(`✓ 面板对象 ${panelChar.name} 正常（getExpProgress=function）`)
    }
  })
} catch (e) {
  console.log('✗ 异常:', e.message)
  crash = true
}
// 防御性：renderMiniCard 在普通对象上也不崩（防御已加）
const plainChar = { id: 'zhenbao', name: '臻宝', level: 1, exp: 0, maxExp: 100, hp: 100, maxHp: 100 }
scene.charInfoPanel.setCharacter(plainChar)
let miniCrash = false
try {
  scene.charInfoPanel.renderMiniCard(canvasCtx, 20, 80)
  console.log('✓ renderMiniCard 在普通对象上不崩溃（防御生效）')
} catch (e) {
  miniCrash = true
  console.log(`✗ renderMiniCard 在普通对象上崩溃: ${e.message}`)
}
console.log(crash || miniCrash ? '存在崩溃风险!' : '无崩溃风险')
process.exit(crash || miniCrash ? 1 : 0)
