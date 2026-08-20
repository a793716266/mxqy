/**
 * 怪物 AI 验证脚本：在真实 FieldScene 里起野外战斗，
 * 用真实敌人数据生成暗影鼠（及对照 wild_cat），驱动 update 循环，
 * 断言怪物会释放技能，并捕获任何运行时错误。
 */
import { createRequire } from 'module'
import path from 'path'
const __dirname = process.cwd()
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  return nodeRequire(abs)
}

// ---- wx mock ----
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
    this.showToast=()=>{}; this.sceneManager={changeScene:()=>{}}; this.changeScene=()=>{}; }
}
const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const { ENEMIES_CH1, getEnemyByLevel } = await import('../scripts/data/enemies.js')

let passed=0, failed=0
const assert=(c,n,d)=>{ if(c){passed++;console.log(`  ✓ ${n}`)} else {failed++;console.log(`  ✗ ${n}  ${d||''}`)} }

const game = new MockGame()
const scene = new FieldScene(game, { area:'grassland' })
await scene.init()

// 捕获技能释放日志
let castLog = []
const origLog = console.log
console.log = (...a)=>{ const s=a.join(' '); if(s.includes('施放技能')) castLog.push(s); origLog('[cap]',s) }

function makeMonster(enemyId, lv){
  const ed = ENEMIES_CH1[enemyId]
  const finalData = getEnemyByLevel(ed, ed?.level || lv)
  const skills = scene._normalizeMonsterSkills(finalData.skills, enemyId)
  const cds = scene._initSkillCDs(skills)
  return {
    id:`m_${enemyId}`, enemyId, name: finalData.name, alive:true,
    x: scene.playerX + 60*scene.dpr, y: scene.playerY,
    hp: finalData.maxHp, maxHp: finalData.maxHp, atk: finalData.atk, def: finalData.def,
    crit: finalData.crit||0, aiPattern: finalData.aiPattern,
    attackRange: finalData.attackRange||80, attackInterval: finalData.attackInterval||2000,
    moveSpeed: finalData.spd||30, skills, skillCDs: cds,
    inCombat:true, skillUseCount:0, strafeDir:1, strafeTimer:0, strafeAngle:0,
    isCastingSkill:false, skillAnimTimer:0, skillCastId:null, attackCDTimer:0,
  }
}

function runMonster(enemyId, label){
  console.log(`\n=== ${label} (${enemyId}) ===`)
  scene.battleSystem.active = true
  scene.battleSystem.showBattleUI = true
  scene._buildBattleHeroes()
  scene._initBattleUI()
  // ★ 每个怪物独立测试：重置参战英雄状态（满血、清除眩晕/击飞），
  //   否则上一轮死亡的英雄会带入本轮，导致 nearestHero 为空、怪物无法索敌施法。
  for (const bh of scene.battleSystem.battleHeroes) {
    const h = bh.hero
    if (!h) continue
    h.hp = (h.maxHp != null) ? h.maxHp : (h.hp || 100)
    h.alive = true
    h._stunned = 0
    h._knockback = null
    h._kbOffsetX = 0
    h._kbOffsetY = 0
  }
  const m = makeMonster(enemyId, 3)
  scene.mapMonsters = [m]
  castLog = []
  // 把英雄摆在玩家位置（怪物会锁定最近英雄）
  scene._heroWorldPos = scene._heroWorldPos || []
  scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
  scene._heroWorldPos[1] = { x: scene.playerX + 30*scene.dpr, y: scene.playerY }
  // 保持怪物贴近玩家
  let err=null
  try {
    for (let f=0; f<600; f++){ // 10 秒
      m.x = scene.playerX + 40*scene.dpr; m.y = scene.playerY
      scene.playerX = scene.playerX; // 稳定
      scene.update(1/60)
    }
  } catch(e){ err = e }
  assert(!err, '无运行时错误', err && err.stack)
  const castCount = castLog.length
  assert(castCount > 0, `${label} 在 10 秒内释放了技能`, `实际释放次数=${castCount}, 技能列表=${m.skills.map(s=>s.id).join('/')}`)
  console.log(`  [info] ${label} 释放日志:`)
  castLog.slice(0,6).forEach(l=>console.log('    '+l))
  return castCount
}

runMonster('shadow_mouse', '暗影鼠')
runMonster('wild_cat', '野猫(对照)')
runMonster('stray_leader', '流浪猫首领(对照)')

console.log(`\n=== 结果: ${passed} 通过 / ${failed} 失败 ===`)
process.exit(failed>0 ? 1 : 0)
