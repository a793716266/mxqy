/**
 * 英雄技能修复验证：
 *  - drain(吸命) 吸血回血
 *  - heal_strike(治愈冲击) attack_heal 回血
 *  - curse(诅咒) 施加降攻 debuff (atk_down / _atkMul)
 *  - dark_nova(暗星爆发) target:'all' 命中全体怪物
 */
import { createRequire } from 'module'
import path from 'path'
const __dirname = process.cwd()
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => nodeRequire(p.startsWith('.') ? path.resolve(scenesDir, p) : p)

const canvasCtx = new Proxy({}, { get: (t,p)=> (p==='canvas'||p==='measureText')?undefined:(p==='createLinearGradient'||p==='createRadialGradient')?()=>({addColorStop(){}}):()=>{}, set:()=>true })
const mockCanvas = { width:750, height:1334, getContext:()=>canvasCtx }
const _storage = {}
globalThis.wx = { createCanvas:()=>mockCanvas, createImage:()=>({width:64,height:64,set onload(f){this._o=f},get onload(){return this._o}}), getStorageSync:k=>_storage[k], setStorageSync:(k,v)=>{_storage[k]=v}, getSystemInfoSync:()=>({windowWidth:750,windowHeight:1334,pixelRatio:3}), onTouchStart:()=>{},onTouchMove:()=>{},onTouchEnd:()=>{},onTouchCancel:()=>{}, requestAnimationFrame:cb=>setTimeout(()=>cb(Date.now()),16), canvasToTempFilePath:()=>{},vibrateShort:()=>{},showToast:()=>{},showLoading:()=>{},hideLoading:()=>{},setKeepScreenOn:()=>{},getMenuButtonBoundingClientRect:()=>({top:50,bottom:90,left:280,right:470,width:190,height:40}),onShow:()=>{},onHide:()=>{},downloadFile:()=>({onProgressUpdate:()=>{},onHeadersReceived:()=>{}}) }
class MockGame { constructor(){ this.ctx=canvasCtx; this.width=750*3; this.height=1334*3; this.dpr=3; this.data={_d:{},_flags:new Set(),get:k=>this.data._d[k],set:(k,v)=>{this.data._d[k]=v},del:k=>{delete this.data._d[k]},hasFlag:k=>this.data._flags.has(k),setFlag:k=>this.data._flags.add(k),delFlag:k=>this.data._flags.delete(k)}; this.assets={getImage:()=>({width:64,height:64}),loadSubpackage:async()=>{},isLoaded:()=>true}; this.audio={play:()=>{},playSound:()=>{}}; this.input={taps:[],joystick:{active:false,dx:0,dy:0},consumeTaps:()=>this.input.taps.splice(0)}; this.showToast=()=>{}; this.sceneManager={changeScene:()=>{}} } }
const { FieldScene } = await import('../scripts/scenes/field-scene.js')

let passed=0, failed=0
const assert=(c,n,d)=>{ if(c){passed++;console.log(`  ✓ ${n}`)} else {failed++;console.log(`  ✗ ${n}  ${d||''}`)} }

const game = new MockGame()
const scene = new FieldScene(game, { area:'grassland' })
await scene.init()

function step(frames){ for(let i=0;i<frames;i++) scene.update(1/60) }

// 通用：起一场战斗，返回 control hero
function startBattle(){
  scene.battleSystem.active = true
  scene.battleSystem.showBattleUI = true
  scene._buildBattleHeroes()
  scene._initBattleUI()
  const ctrl = scene._getCurrentControlHero()
  ctrl.hero.mp = ctrl.hero.maxMp || 999
  ctrl.hero.hp = ctrl.hero.maxHp || 100
  return ctrl
}
function monsterAt(x,y,atk=0){
  return { id:'m'+Math.random(), name:'测试怪', enemyId:'wild_cat', alive:true, x, y,
    hp:200, maxHp:200, atk, def:5, attackRange:80, attackInterval:99999,
    skills:[], skillCDs:{}, inCombat:false, isCastingSkill:false, skillAnimTimer:0, skillCastId:null }
}

// ---- 测试 A：drain 吸血 ----
console.log('\n=== A. drain 吸命 吸血回血 ===')
{
  const ctrl = startBattle()
  const m = monsterAt(scene.playerX+60*scene.dpr, scene.playerY)
  scene.mapMonsters = [m]
  const skill = { id:'drain', name:'吸命', type:'magic', power:1.0, mpCost:12, effect:'drain', drainPercent:1.0 }
  const hpBefore = ctrl.hero.hp
  ctrl.hero.hp = Math.floor(ctrl.hero.maxHp*0.6) // 先打残
  scene._playerAttackMonster(m, skill)
  step(45) // ~0.75s 让延迟伤害结算
  assert(ctrl.hero.hp > Math.floor(ctrl.hero.maxHp*0.6), `施法者回血 (hp ${ctrl.hero.hp} > 残血)`, `hp=${ctrl.hero.hp}`)
  assert(m.hp < 200, '怪物受到伤害', `mhp=${m.hp}`)
}

// ---- 测试 B：heal_strike 治愈冲击 回血 ----
console.log('\n=== B. heal_strike 治愈冲击 回血 ===')
{
  const ctrl = startBattle()
  const m = monsterAt(scene.playerX+60*scene.dpr, scene.playerY)
  scene.mapMonsters = [m]
  const skill = { id:'heal_strike', name:'治愈冲击', type:'attack_heal', power:1.2, mpCost:12, healPercent:0.3, dashDistance:300 }
  ctrl.hero.hp = Math.floor(ctrl.hero.maxHp*0.5)
  const before = ctrl.hero.hp
  scene._playerAttackMonster(m, skill)
  step(45)
  assert(ctrl.hero.hp > before, `施法者回血 (hp ${ctrl.hero.hp} > ${before})`, `hp=${ctrl.hero.hp}`)
  assert(m.hp < 200, '怪物受到伤害', `mhp=${m.hp}`)
}

// ---- 测试 C：curse 诅咒 降攻 ----
console.log('\n=== C. curse 诅咒 降攻 (atk_down) ===')
{
  const ctrl = startBattle()
  const m = monsterAt(scene.playerX+60*scene.dpr, scene.playerY)
  scene.mapMonsters = [m]
  const skill = { id:'curse', name:'诅咒', type:'debuff', mpCost:10, effect:'atk_down', turns:3, value:0.3 }
  scene._playerAttackMonster(m, skill)
  step(45)
  assert(m._atkMul !== undefined && m._atkMul < 1, `怪物攻击倍率降低 (_atkMul=${m._atkMul})`, `atkMul=${m._atkMul}`)
  const hasDebuff = (m.statusEffects||[]).some(e=>e.type==='atk_down')
  assert(hasDebuff, '怪物挂上 atk_down 状态')
}

// ---- 测试 D：dark_nova 暗星爆发 全体 ----
console.log('\n=== D. dark_nova 暗星爆发 全体命中 ===')
{
  const ctrl = startBattle()
  const m1 = monsterAt(scene.playerX+60*scene.dpr, scene.playerY)
  const m2 = monsterAt(scene.playerX+120*scene.dpr, scene.playerY+40*scene.dpr)
  const m3 = monsterAt(scene.playerX+80*scene.dpr, scene.playerY-50*scene.dpr)
  scene.mapMonsters = [m1,m2,m3]
  const skill = { id:'dark_nova', name:'暗星爆发', type:'magic', power:1.8, mpCost:18, target:'all' }
  scene._playerAttackMonster(m1, skill) // 锁定 m1，但应打全体
  step(45)
  const hit = [m1,m2,m3].filter(mm=>mm.hp<200).length
  assert(hit === 3, `3 只怪物全部受伤 (命中 ${hit}/3)`, `hp=${m1.hp},${m2.hp},${m3.hp}`)
}

console.log(`\n=== 结果: ${passed} 通过 / ${failed} 失败 ===`)
process.exit(failed>0?1:0)
