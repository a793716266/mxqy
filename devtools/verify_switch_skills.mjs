/**
 * 验证：切换控制后技能按钮是否更新为新被控英雄的技能
 * 用法: node scripts/tools/verify_switch_skills.mjs
 */
const canvasCtx = new Proxy({}, { get(t,p){ if(p==='canvas'||p==='measureText')return undefined; if(p==='createLinearGradient'||p==='createRadialGradient')return ()=>({addColorStop(){}}); return ()=>{} }, set(){return true} })
const mockCanvas = { width:750, height:1334, getContext:()=>canvasCtx }
const _storage = {}
globalThis.wx = { createCanvas:()=>mockCanvas, createImage:()=>{const i={width:64,height:64};setTimeout(()=>{if(i.onload)i.onload()},0);return i}, getStorageSync:k=>_storage[k], setStorageSync:(k,v)=>{_storage[k]=v}, getSystemInfoSync:()=>({windowWidth:750,windowHeight:1334,pixelRatio:3,screenWidth:750,screenHeight:1334}), onTouchStart:()=>{},onTouchMove:()=>{},onTouchEnd:()=>{},onTouchCancel:()=>{}, requestAnimationFrame:cb=>setTimeout(()=>cb(Date.now()),16), canvasToTempFilePath:()=>{}, vibrateShort:()=>{}, showToast:()=>{}, showLoading:()=>{}, hideLoading:()=>{}, setKeepScreenOn:()=>{}, getMenuButtonBoundingClientRect:()=>({top:50,bottom:90,left:280,right:470,width:190,height:40}), onShow:()=>{}, onHide:()=>{} }
class MockGame { constructor(){ this.ctx=canvasCtx; this.width=750*3; this.height=1334*3; this.dpr=3; this.data={_d:{},_flags:new Set(),get:k=>this.data._d[k],set:(k,v)=>{this.data._d[k]=v},del:k=>{delete this.data._d[k]},hasFlag:k=>this.data._flags.has(k),setFlag:k=>this.data._flags.add(k),delFlag:k=>this.data._flags.delete(k)}; this.assets={getImage:()=>({width:64,height:64}),loadSubpackage:async()=>{},isLoaded:()=>true}; this.audio={play:()=>{},playSound:()=>{}}; this.input={taps:[],joystick:{active:false,dx:0,dy:0},consumeTaps:()=>this.input.taps.splice(0,this.input.taps.length)}; this.showToast=()=>{}; this.sceneManager={changeScene:()=>{}} } }
import { createRequire } from 'module'; import path from 'path'; const __dirname = process.cwd(); const projectRoot = process.cwd(); const scenesDir = path.resolve(projectRoot,'scripts','scenes'); const nodeRequire = createRequire(path.join(scenesDir,'x.js')); globalThis.require = p => nodeRequire(p.startsWith('.')?path.resolve(scenesDir,p):p)
const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const game = new MockGame(); const scene = new FieldScene(game,{area:'grassland'}); await scene.init()
scene.battleSystem.active = true; scene.dpr = 3

let passed=0, failed=0
const assert=(c,n,d)=>{ if(c){passed++;console.log(`  ✓ ${n}`)}else{failed++;console.log(`  ✗ ${n}  ${d||''}`)} }

// 两个技能完全不同的英雄
const heroA = { name:'英雄A', role:'warrior', hp:100,maxHp:100,mp:100,maxMp:100,atk:20,def:10,matk:0,crit:0.05, _buffs:[],_aiSkillsCD:{},_aiSkillLock:0, sprite:null,
  skills:[{id:'a1',name:'A斩击',type:'attack',mpCost:0,range:100,power:1.2},{id:'a2',name:'A狂暴',type:'buff',mpCost:15,cooldown:3,effect:'atk_up_self',value:0.5,turns:3}] }
const heroB = { name:'英雄B', role:'mage', hp:100,maxHp:100,mp:100,maxMp:100,atk:10,def:10,matk:20,crit:0.05, _buffs:[],_aiSkillsCD:{},_aiSkillLock:0, sprite:null,
  skills:[{id:'b1',name:'B火球',type:'magic',mpCost:7,cooldown:5,aoe:{aoeType:'lineX',enabled:true},power:1.4,range:200},{id:'b2',name:'B护盾',type:'buff',mpCost:10,cooldown:3,effect:'def_up_self',value:0.3,duration:3}] }
scene.battleSystem.battleHeroes = [ {hero:heroA,sprite:null,partyIndex:0,getPos:()=>({x:0,y:0})}, {hero:heroB,sprite:null,partyIndex:1,getPos:()=>({x:0,y:0})} ]
scene.battleSystem.currentControlIndex = 0
scene.mapMonsters = [{id:'m',name:'怪',alive:true,x:60,y:0,hp:100,def:5,atk:10}]
scene._heroWorldPos = [{x:0,y:0},{x:200*3,y:0}]
scene._initBattleUI()
const before = (scene.battleSystem.skillButtons||[]).map(b=>b.text).join(',')
console.log(`  切换前技能按钮: [${before}]`)
assert(before.includes('A狂暴') && !before.includes('B火球'), '切换前按钮=英雄A技能', before)

scene._switchControl()
const after = (scene.battleSystem.skillButtons||[]).map(b=>b.text).join(',')
console.log(`  切换后技能按钮: [${after}]`)
assert(after.includes('B火球') && after.includes('B护盾'), '切换后按钮=英雄B技能', after)
assert(!after.includes('A狂暴'), '切换后不再显示英雄A技能', after)
const ctrl = scene._getCurrentControlHero()
assert(ctrl && ctrl.hero.name === '英雄B', '当前被控者=英雄B', ctrl&&ctrl.hero.name)

console.log(`\n=== 切换按钮验证: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed===0?0:1)
