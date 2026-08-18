/**
 * 怪物中断判定回归测试
 * =====================
 * 验证「所有非霸体(non-superArmor)怪物动作都可在受击时被打断、且打断后效果不结算」：
 *   1. 跳跃攻击(jump_attack)：预警期间受击 → isCastingSkill 清除 + 预警区移除 → 落雷不再结算
 *   2. 跳跃攻击(superArmor)：预警期间受击 → 不被打断（霸体）
 *   3. 光明冲锋(light_charge)：蓄力期间受击 → _lightCharge 清空 + 红色警示区移除 → AOE 不结算
 *   4. 普攻(命中帧前)：受击 → isAttacking 清除（挥击取消）
 *   5. 普攻(命中帧后)：受击 → 已提交命中不回退（isAttacking 保留）
 *
 * 用法: node devtools/verify_monster_interrupt.mjs
 */
import { installFieldBattleSystem } from '../scripts/systems/field-battle-system.js'

class FakeScene {}
installFieldBattleSystem(FakeScene)
const proto = FakeScene.prototype

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

function makeScene() {
  const scene = Object.create(proto)
  scene.dpr = 2
  scene.cameraX = 0; scene.cameraY = 0
  scene.playerX = 100; scene.playerY = 100
  scene.playerHistory = [{ x: 100, y: 100 }, { x: 100, y: 100 }]
  scene.battleSystem = {
    warningZones: [], _lastDamagedMonster: null, battleTarget: null,
    damageTexts: [], active: true, skillProcesses: []
  }
  scene.mapMonsters = []
  return scene
}

function makeMonster(skills) {
  return {
    enemyId: 'test', name: '测试怪', x: 300, y: 100, hp: 500, maxHp: 500,
    atk: 20, def: 5, alive: true,
    isCastingSkill: false, skillCastId: null, _castingSkill: null, skillAnimTimer: 0,
    _jumpWarn: false, _jumpPrepZone: null, _jumpState: null, _lightCharge: null,
    isAttacking: false, attackAnimTimer: 0, hasDealtDamage: false,
    _hurtLock: 0, _stunned: 0, _frozen: false, _rooted: false,
    skills: skills || [], skillCDs: {}
  }
}

const attackRange = 80 * 2
const dx = 100 - 300, dy = 0, dist = 200

console.log('=== 1. 跳跃攻击预警期间受击 → 被打断，落雷不结算 ===')
{
  const scene = makeScene()
  const hero = { name: '臻宝', hp: 200, maxHp: 200, _shield: 0, alive: true }
  const jumpSkill = { id: 'jump1', name: '跳跃攻击', type: 'jump_attack', warnDuration: 1.0, aoeRadius: 110, power: 1, damageRadius: 110 }
  const m = makeMonster([jumpSkill])
  scene.mapMonsters = [m]
  scene._fieldCastMonsterSkill(m, jumpSkill, hero, dx, dy, dist)
  assert(m.isCastingSkill === true, '施放后进入施法状态(可被中断)')
  assert(scene.battleSystem.warningZones.length === 1, '预警区已生成')
  hero.hp = 200
  scene._damageMonster(m, 10)            // 受击 → 触发中断
  assert(m.isCastingSkill === false, '受击后施法状态被清除')
  assert(scene.battleSystem.warningZones.length === 0, '预警区被移除(落雷不再落下)')
  // 推进若干帧：不应产生空中跳跃，英雄不应受伤
  for (let i = 0; i < 20; i++) { scene._fieldUpdateWarningZones(0.1); scene._updateMonsterJumps(0.1) }
  assert(m._jumpState === null, '未产生空中跳跃')
  assert(hero.hp === 200, '英雄未受到落雷伤害', `hp=${hero.hp}`)
}

console.log('=== 2. 跳跃攻击(superArmor) 预警期间受击 → 不被打断 ===')
{
  const scene = makeScene()
  const hero = { name: '臻宝', hp: 200, maxHp: 200, _shield: 0, alive: true }
  const jumpSA = { id: 'jumpSA', name: '跳跃攻击SA', type: 'jump_attack', warnDuration: 1.0, aoeRadius: 110, power: 1, superArmor: true }
  const m = makeMonster([jumpSA])
  scene.mapMonsters = [m]
  scene._fieldCastMonsterSkill(m, jumpSA, hero, dx, dy, dist)
  assert(m.isCastingSkill === true, '霸体跳跃进入施法状态')
  scene._damageMonster(m, 10)
  assert(m.isCastingSkill === true, '霸体：仍未被打断')
  assert(scene.battleSystem.warningZones.length === 1, '霸体：预警区保留')
}

console.log('=== 3. 光明冲锋：蓄力→红圈出现后受击 → 被打断，AOE 不结算 ===')
{
  const scene = makeScene()
  const hero = { name: '臻宝', hp: 200, maxHp: 200, _shield: 0, alive: true }
  const lcSkill = { id: 'lc1', name: '光明冲锋', type: 'light_charge', chargeTime: 2.0, warnDuration: 1.0, aoeRadius: 95, power: 1.5, cooldown: 15 }
  const m = makeMonster([lcSkill])
  scene.mapMonsters = [m]
  scene._startLightCharge(m, lcSkill, dx, dy, dist)
  assert(m._lightCharge !== null, '蓄力状态机已启动')
  // 红圈在蓄力完成后(dash 阶段)才生成：驱动状态机直到红圈出现
  let guard = 0
  while (!scene.battleSystem.warningZones.some(z => z.type === 'light_charge') && guard < 200) {
    scene._updateLightCharge(m, 0.05); guard++
  }
  assert(scene.battleSystem.warningZones.some(z => z.type === 'light_charge'), '红色警示区已生成(蓄力完成进入冲刺)')
  hero.hp = 200
  scene._damageMonster(m, 10)   // 冲刺阶段受击 → 触发中断
  assert(m._lightCharge === null, '受击后冲锋状态机被清除')
  assert(!scene.battleSystem.warningZones.some(z => z.type === 'light_charge'), '红色警示区被移除(AOE不结算)')
  assert(hero.hp === 200, '英雄未受冲锋伤害', `hp=${hero.hp}`)
}

console.log('=== 4. 普攻(命中帧前) 受击 → 挥击取消 ===')
{
  const scene = makeScene()
  const m = makeMonster([])
  m.isAttacking = true; m.hasDealtDamage = false; m.attackAnimTimer = 500
  scene.mapMonsters = [m]
  scene._damageMonster(m, 10)
  assert(m.isAttacking === false, '命中前普攻被打断')
  assert(m.attackAnimTimer === 0, '攻击计时清零')
}

console.log('=== 5. 普攻(命中帧后) 受击 → 已提交命中不回退 ===')
{
  const scene = makeScene()
  const m = makeMonster([])
  m.isAttacking = true; m.hasDealtDamage = true   // 已打到
  scene.mapMonsters = [m]
  scene._damageMonster(m, 10)
  assert(m.isAttacking === true, '命中后普攻不被回退')
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
