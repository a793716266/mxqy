/**
 * 隐身无敌 + 暗影突袭延迟冷却 验证脚本
 * 在真实 FieldScene 里起野外战斗，用真实敌人数据生成暗影鼠，
 * 断言：
 *   (a) 隐身期间 _damageMonster 返回 0、HP 不变、且不弹假伤害数字
 *   (b) 暗影突袭（buff+invisible+duration）释放后进入"延迟冷却"阶段：
 *       _skillDelay = duration、skillCDs 仍为 0、且效果期间不可被再次选中释放
 *   (c) CD 仅在隐身效果结束后才开始递减（效果未结束时 skillCDs 始终为 0）
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
    this.showToast=()=>{}; this.sceneManager={changeScene:()=>{}}; }
}
const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const { ENEMIES_CH1, getEnemyByLevel } = await import('../scripts/data/enemies.js')

let passed=0, failed=0
const assert=(c,n,d)=>{ if(c){passed++;console.log(`  ✓ ${n}`)} else {failed++;console.log(`  ✗ ${n}  ${d||''}`)} }

const game = new MockGame()
const scene = new FieldScene(game, { area:'grassland' })
await scene.init()
scene.battleSystem.active = true
scene.battleSystem.damageTexts = scene.battleSystem.damageTexts || []
scene.battleSystem.projectiles = scene.battleSystem.projectiles || []
scene.battleSystem.warningZones = scene.battleSystem.warningZones || []
scene._buildBattleHeroes()
scene._initBattleUI()

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

// 伪造英雄（仅用于满足 _fieldCastMonsterSkill 的 hero 入参签名）
const fakeHero = { hp: 100, name: 'test_hero', id: 'test_hero' }

// ============================================================
console.log('\n=== (a) 隐身无敌：_damageMonster 拦截 ===')
const m1 = makeMonster('shadow_mouse', 3)
m1._invisible = true
m1.hp = 500
m1.maxHp = 1000
const beforeHp = m1.hp
const dealt = scene._damageMonster(m1, 100)
assert(dealt === 0, '隐身怪物受到伤害时 _damageMonster 返回 0（完全免疫）', `返回=${dealt}`)
assert(m1.hp === beforeHp, '隐身怪物 HP 不变化', `HP ${beforeHp} → ${m1.hp}`)
const hasInvText = (scene.battleSystem.damageTexts||[]).some(t => t.text === '无敌')
assert(hasInvText, '隐身期间飘出"无敌"反馈字样', `damageTexts=${JSON.stringify(scene.battleSystem.damageTexts)}`)
// 反例：非隐身时应正常扣血
const m1b = makeMonster('shadow_mouse', 3)
const d2 = scene._damageMonster(m1b, 100)
assert(d2 > 0 && m1b.hp < m1b.maxHp, '非隐身怪物仍正常受伤（拦截仅作用于隐身）', `返回=${d2}`)

// ============================================================
console.log('\n=== (b) 暗影突袭：释放后进入延迟冷却，且效果期间不可重复释放 ===')
const m2 = makeMonster('shadow_mouse', 3)
const invSkill = m2.skills.find(s => s.effect === 'invisible')
assert(!!invSkill, '暗影鼠存在 invisible 类技能', `skills=${m2.skills.map(s=>s.id).join('/')}`)
const invId = invSkill.id
// 隔离：仅保留暗影突袭，排除暗影咬等其他技能的干扰，让断言最干净
m2.skills = [invSkill]
m2.skillCDs = { [invId]: 0 }
// 释放前：技能就绪（skillCDs=0，无 _skillDelay）
assert((m2.skillCDs[invId]||0) <= 0, '释放前技能 CD 就绪', `CD=${m2.skillCDs[invId]}`)
scene._fieldCastMonsterSkill(m2, invSkill, fakeHero, 0, 0, 0)
assert(m2._invisible === true, '释放后进入隐身状态', `_invisible=${m2._invisible}`)
assert(m2._invisibleTimer > 0, '隐身计时器已设置（=技能 duration）', `_invisibleTimer=${m2._invisibleTimer}`)
assert(m2._skillDelay && m2._skillDelay[invId] === invSkill.duration, '进入延迟冷却阶段：_skillDelay = duration', `_skillDelay=${JSON.stringify(m2._skillDelay)}`)
assert((m2.skillCDs[invId]||0) === 0, '延迟阶段 CD 尚未开始（仍为 0）', `skillCDs=${JSON.stringify(m2.skillCDs)}`)
// 效果期间不可被再次选中释放
const chooseDuringDelay = scene._fieldChooseMonsterSkill(m2, 10, 80)
assert(chooseDuringDelay === null, '效果期间 _fieldChooseMonsterSkill 不再选中该技能（不可重复释放）', `chosen=${chooseDuringDelay && chooseDuringDelay.id}`)
const maxRangeDuringDelay = scene._fieldMaxSkillRange(m2)
assert(maxRangeDuringDelay === 0, '效果期间该技能不计入可释放距离（远程 UI 不提前亮起）', `maxRange=${maxRangeDuringDelay}`)

// ============================================================
console.log('\n=== (c) 延迟冷却：CD 仅效果结束后才开始递减 ===')
const m3 = makeMonster('shadow_mouse', 3)
const invSkill3 = m3.skills.find(s => s.effect === 'invisible')
const invId3 = invSkill3.id
scene.mapMonsters = [m3]
scene._heroWorldPos = scene._heroWorldPos || []
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
scene._heroWorldPos[1] = { x: scene.playerX + 30*scene.dpr, y: scene.playerY }
scene._fieldCastMonsterSkill(m3, invSkill3, fakeHero, 0, 0, 0)

let cdAlwaysZeroDuringEffect = true
let invisibleEndedAt = -1
const dt = 0.1
for (let i = 0; i < 120; i++) {  // 最多 12 秒
  scene._updateMonsterAttack(dt)
  if (m3._invisible) {
    // 隐身仍持续（效果未结束）→ CD 必须仍为 0
    if ((m3.skillCDs[invId3]||0) !== 0) cdAlwaysZeroDuringEffect = false
  } else {
    if (invisibleEndedAt < 0) {
      invisibleEndedAt = i
      // 结束瞬间：_skillDelay 归零、skillCDs 被设为 cooldown(20) 并当帧递减 → 应 >0 且 <20
      const cd = m3.skillCDs[invId3] || 0
      assert(cd > 0 && cd < 20, '效果结束瞬间 CD 已就绪（从 cooldown 起算，非 0）', `CD=${cd}`)
    }
  }
}
assert(cdAlwaysZeroDuringEffect, '隐身持续期间（效果未结束）skillCDs 始终为 0（延迟冷却生效，未提前冷却）')
assert(invisibleEndedAt >= 0, `隐身效果已正常结束（约 ${(invisibleEndedAt*dt).toFixed(1)}s）`, `endedAt=${invisibleEndedAt}`)
assert((m3.skillCDs[invId3]||0) < 20, '效果结束后 CD 开始递减（< cooldown）', `CD=${m3.skillCDs[invId3]}`)
assert((m3.skillCDs[invId3]||0) > 0, '效果结束后 CD 仍在冷却中（> 0）', `CD=${m3.skillCDs[invId3]}`)

console.log(`\n=== 结果: ${passed} 通过 / ${failed} 失败 ===`)
process.exit(failed>0 ? 1 : 0)
