/**
 * 未实现技能（stub）验证：
 *  - taunt(挑衅)      → 怪物强制锁定小贝
 *  - guard(守护)      → 队友受击伤害转由小贝承担
 *  - counter(反击)    → 小贝受击反弹伤害给怪物
 *  - gold_up(财运亨通)→ 战斗胜利额外金币
 *  - invisible(暗影突袭)→ 怪物隐身且不可被选中
 *  - AI 实际施放 taunt（不再空转）
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

function makeHero(name, role, skills){
  const wp = { x: scene.playerX + 200*scene.dpr, y: scene.playerY }
  const hero = {
    id: name, name, role: role || 'tank',
    hp: 200, maxHp: 200, mp: 100, maxMp: 100,
    atk: 20, def: 20, matk: 20, crit: 0.05,
    alive: true, _shield: 0, _shieldMax: 0, _shieldTimer: 0,
    _buffs: [], skills: skills || [], _lastHitTime: 0,
  }
  const wrapper = { hero, sprite: { state:'idle', animFrame:0, animTimer:0, facingLeft:false }, getPos: () => wp }
  wrapper._wp = wp
  return wrapper
}

function monsterAt(x,y,atk=10){
  return { id:'m'+Math.random(), name:'测试怪', enemyId:'wild_cat', alive:true, x, y,
    hp:200, maxHp:200, atk, def:5, attackRange:250, attackInterval:400,
    skills:[], skillCDs:{}, inCombat:false, isCastingSkill:false, skillAnimTimer:0, skillCastId:null,
    attackCDTimer:0, hasDealtDamage:false, isAttacking:false, animFrame:0,
    _atkMul:1 }
}

// ---- 测试 A：taunt 挑衅 → 怪物锁定小贝 ----
console.log('\n=== A. taunt 挑衅：怪物强制锁定小贝 ===')
{
  const ctrl = startBattle()
  const zhenbao = ctrl.hero
  zhenbao.hp = zhenbao.maxHp = 200
  const xb = makeHero('小贝', 'tank', [])
  xb._wp.x = scene.playerX + 120*scene.dpr; xb._wp.y = scene.playerY
  scene.battleSystem.battleHeroes.push(xb)
  // 施放挑衅
  scene._applyHeroBuff({ name:'挑衅', effect:'taunt', turns:2 }, xb.hero)
  assert(scene._heroHasBuff(xb.hero, 'taunt'), '小贝获得 taunt buff')
  // 怪物贴近主角（距离主角 50，距离小贝 120，均在攻击范围 250 内）
  const m = monsterAt(scene.playerX + 50*scene.dpr, scene.playerY, 30)
  scene.mapMonsters = [m]
  step(70)
  assert(xb.hero.hp < 200, `小贝被怪物攻击 (hp ${xb.hero.hp})`, `hp=${xb.hero.hp}`)
  assert(zhenbao.hp === 200, `主角未被攻击 (hp ${zhenbao.hp})`, `hp=${zhenbao.hp}`)
}

// ---- 测试 B：guard 守护 → 主角受击转小贝承伤 ----
console.log('\n=== B. guard 守护：主角受击由小贝承伤 ===')
{
  const ctrl = startBattle()
  const zhenbao = ctrl.hero
  zhenbao.hp = zhenbao.maxHp = 200
  const xb = makeHero('小贝', 'tank', [])
  xb._wp.x = scene.playerX + 500*scene.dpr; xb._wp.y = scene.playerY // 远处（不可被直接选为最近目标）
  scene.battleSystem.battleHeroes.push(xb)
  scene._applyHeroBuff({ name:'守护', effect:'guard', turns:2 }, xb.hero)
  assert(scene._heroHasBuff(xb.hero, 'guard'), '小贝获得 guard buff')
  const m = monsterAt(scene.playerX + 50*scene.dpr, scene.playerY, 30)
  scene.mapMonsters = [m]
  step(70)
  assert(zhenbao.hp === 200, `主角未被直接伤害 (hp ${zhenbao.hp})`, `hp=${zhenbao.hp}`)
  assert(xb.hero.hp < 200, `小贝代为承伤 (hp ${xb.hero.hp})`, `hp=${xb.hero.hp}`)
}

// ---- 测试 C：counter 反击 → 小贝受击反弹怪物 ----
console.log('\n=== C. counter 反击：小贝受击反弹怪物 ===')
{
  const ctrl = startBattle()
  const xb = makeHero('小贝', 'tank', [])
  xb._wp.x = scene.playerX + 60*scene.dpr; xb._wp.y = scene.playerY
  scene.battleSystem.battleHeroes.push(xb)
  scene._applyHeroBuff({ name:'反击', effect:'counter', turns:2, value:0.5 }, xb.hero)
  assert(scene._heroHasBuff(xb.hero, 'counter'), '小贝获得 counter buff')
  const m = monsterAt(scene.playerX + 60*scene.dpr, scene.playerY, 30)
  scene.mapMonsters = [m]
  step(70)
  assert(xb.hero.hp < 200, `小贝受击掉血 (hp ${xb.hero.hp})`, `hp=${xb.hero.hp}`)
  assert(m.hp < 200, `怪物被反击掉血 (hp ${m.hp})`, `hp=${m.hp}`)
}

// ---- 测试 D：gold_up 财运 → 胜利额外金币 ----
console.log('\n=== D. gold_up 财运：胜利额外金币 ===')
{
  startBattle()
  const qdd = makeHero('钱多多', 'warrior', [])
  scene.battleSystem.battleHeroes.push(qdd)
  scene._applyHeroBuff({ name:'财运亨通', effect:'gold_up', turns:5, value:0.5 }, qdd.hero)
  assert(scene._heroHasBuff(qdd.hero, 'gold_up'), '钱多多获得 gold_up buff')
  scene.game.data.set('gold', 0)
  scene._endFieldBattle(true)
  const gold = scene.game.data.get('gold')
  assert(gold >= 20, `战斗胜利获得基础金币 (gold=${gold})`, `gold=${gold}`)
  assert(gold > 20, `财运亨通额外金币生效 (gold=${gold}, 期望>20)`, `gold=${gold}`)
}

// ---- 测试 E：invisible 隐身 → 不可被选中 ----
console.log('\n=== E. invisible 暗影突袭：隐身不可被选中 ===')
{
  startBattle()
  const ctrl = scene._getCurrentControlHero()
  const m = monsterAt(scene.playerX + 60*scene.dpr, scene.playerY, 10)
  const invSkill = { name:'暗影突袭', type:'buff', effect:'invisible', duration:5, power:0 }
  m.skills = [invSkill]
  scene.mapMonsters = [m]
  scene._fieldCastMonsterSkill(m, invSkill, ctrl.hero, 1, 0, 60*scene.dpr)
  assert(m._invisible === true, '怪物进入隐身状态')
  const target = scene._findNearestMonsterFromPos(9999, 'xy', m.x, m.y)
  assert(target === null, '隐身怪不可被玩家/队友选中', `target=${target?target.name:'null'}`)
  // 同时存在可见怪：应能选中可见怪
  const m2 = monsterAt(m.x + 40*scene.dpr, m.y, 10)
  scene.mapMonsters = [m, m2]
  const t2 = scene._findNearestMonsterFromPos(9999, 'xy', m.x, m.y)
  assert(t2 === m2, '可见怪仍可被选中', `t2=${t2?t2.name:'null'}`)
}

// ---- 测试 F：AI 实际施放 taunt（不再空转 noop） ----
console.log('\n=== F. AI 施放挑衅（stub 不再空转） ===')
{
  startBattle()
  const xb = makeHero('小贝', 'tank', [
    { id:'taunt', name:'挑衅', type:'buff', mpCost:5, effect:'taunt', turns:2 }
  ])
  scene.battleSystem.battleHeroes.push(xb)
  const m = monsterAt(scene.playerX + 50*scene.dpr, scene.playerY, 10)
  scene.mapMonsters = [m]
  const cast = scene._allyTryCastSkill(xb, m, 1)
  assert(cast === true, 'AI 释放技能成功')
  assert(scene._heroHasBuff(xb.hero, 'taunt'), 'AI 施放后小贝获得 taunt buff（不再是 noop）')
}

console.log(`\n=== 结果: ${passed} 通过 / ${failed} 失败 ===`)
process.exit(failed>0?1:0)
