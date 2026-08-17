/**
 * verify_combat_state.mjs
 * =========================================
 * Golden 测试：锁定 combat-state.js 谓词与「现有散落标志」语义完全一致，
 * 保证后续把 field-battle-system.js / field-scene.js 的判断点迁移到本模块时零行为回归。
 *
 * 验证点：
 *   G1 矩阵一致性：对玩家/AI 双路径、11 个标志字段的全组合，断言
 *      getHeroMoveLock.full / .axisY / isHeroCasting / canHeroBeInterrupted
 *      与「旧散落判断逻辑」逐字节相等。
 *   G2 直观场景：CombatState 派生 + canHeroAct 的典型用例。
 */

let passed = 0, failed = 0
function assert(cond, name, extra = '') {
  if (cond) { passed++ }
  else { failed++; console.log(`  [FAIL] ${name} ${extra}`) }
}

const {
  CombatState, getHeroMoveLock, isHeroCasting, isHeroSuperArmor,
  canHeroBeInterrupted, canHeroAct, getHeroCombatState,
} = await import('../scripts/systems/combat-state.js')

// ---- 旧散落判断逻辑复刻（作为 golden 基准，必须与新谓词逐组合相等）----
function oldFullLock(isMain, hero, bs) {
  if (isMain) return (bs.castLockTimer > 0) || !!(hero._stunned > 0) || !!(hero._hurtLock > 0)
  return !!(hero._castLock > 0)
}
function oldAxisYLock(isMain, hero, bs) {
  if (isMain) return !!(bs.castAxisLockTimer > 0)
  return !!(hero._castAxisLock > 0)
}
function oldCasting(isMain, hero, bs) {
  if (isMain) return !!(bs.playerAnim)
  return !!(hero._aiCastingSkill) || !!(hero._aiAttacking)
}
function oldCanInterrupt(isMain, hero, bs) {
  return oldCasting(isMain, hero, bs) && !hero._castSuperArmor
}

// ---- G1 全组合矩阵 ----
const bools = [false, true]
const playerAnims = [null, { timer: 1 }, { timer: 0 }] // timer:0 视为已结束（非施法）
const aiSkills = [null, { id: 'x' }]
let combos = 0
for (const isMain of bools)
for (const castLockTimer of [0, 1])
for (const castAxisLockTimer of [0, 1])
for (const _stunned of [0, 1])
for (const _hurtLock of [0, 1])
for (const _aiCastingSkill of aiSkills)
for (const _aiAttacking of bools)
for (const _castLock of [0, 1])
for (const _castAxisLock of [0, 1])
for (const _castSuperArmor of bools)
for (const hp of [1, 0])
for (const playerAnim of playerAnims) {
  const hero = { _stunned, _hurtLock, _aiCastingSkill, _aiAttacking, _castLock, _castAxisLock, _castSuperArmor, hp }
  const bs = { castLockTimer, castAxisLockTimer, playerAnim }
  const ctx = { hero, battleSystem: bs, isMain }
  const lock = getHeroMoveLock(ctx)
  const casting = isHeroCasting(ctx)
  const interrupt = canHeroBeInterrupted(ctx)

  const eFull = oldFullLock(isMain, hero, bs)
  const eAxis = oldAxisYLock(isMain, hero, bs)
  const eCast = oldCasting(isMain, hero, bs)
  const eInt = oldCanInterrupt(isMain, hero, bs)

  assert(lock.full === eFull, 'matrix.fullLock', `isMain=${isMain} combo#${combos}`)
  assert(lock.axisY === eAxis, 'matrix.axisYLock', `isMain=${isMain} combo#${combos}`)
  assert(casting === eCast, 'matrix.casting', `isMain=${isMain} combo#${combos}`)
  assert(interrupt === eInt, 'matrix.canInterrupt', `isMain=${isMain} combo#${combos}`)
  combos++
}
console.log(`  [G1] 矩阵覆盖 ${combos} 组合 × 4 谓词 = ${combos * 4} 项断言`)

// ---- G2 直观场景 ----
// 玩家：castLockTimer>0 → 全锁
assert(getHeroMoveLock({ hero: {}, battleSystem: { castLockTimer: 1 }, isMain: true }).full === true, '玩家 castLockTimer 全锁')
// 玩家：仅 castAxisLockTimer>0 → 只锁 Y
{
  const l = getHeroMoveLock({ hero: {}, battleSystem: { castAxisLockTimer: 1 }, isMain: true })
  assert(l.full === false && l.axisY === true, '玩家 castAxisLockTimer 仅锁Y')
}
// 玩家：playerAnim 存在 → 施法中；timer=0 → 非施法
assert(isHeroCasting({ hero: {}, battleSystem: { playerAnim: { timer: 1 } }, isMain: true }) === true, '玩家 playerAnim 施法中')
// 对齐现有散落判断：playerAnim 只要存在即视为施法（游戏中 timer 归零同帧置 null，此非 null 状态不持久）
assert(isHeroCasting({ hero: {}, battleSystem: { playerAnim: { timer: 0 } }, isMain: true }) === true, '玩家 playerAnim 存在即施法(与现有判断一致)')
// 玩家：施法非霸体 → 可被命中打断；霸体 → 免疫
assert(canHeroBeInterrupted({ hero: { _castSuperArmor: false }, battleSystem: { playerAnim: { timer: 1 } }, isMain: true }) === true, '玩家普通施法可被打断')
assert(canHeroBeInterrupted({ hero: { _castSuperArmor: true }, battleSystem: { playerAnim: { timer: 1 } }, isMain: true }) === false, '玩家霸体施法免疫打断')

// AI：_castLock>0 → 全锁；_castAxisLock>0 → 仅锁 Y
assert(getHeroMoveLock({ hero: { _castLock: 1 }, isMain: false }).full === true, 'AI _castLock 全锁')
{
  const l = getHeroMoveLock({ hero: { _castAxisLock: 1 }, isMain: false })
  assert(l.full === false && l.axisY === true, 'AI _castAxisLock 仅锁Y')
}
// AI：_aiCastingSkill 或 _aiAttacking → 施法中
assert(isHeroCasting({ hero: { _aiCastingSkill: { id: 'bs' } }, isMain: false }) === true, 'AI _aiCastingSkill 施法中')
assert(isHeroCasting({ hero: { _aiAttacking: true }, isMain: false }) === true, 'AI _aiAttacking 施法中')
assert(canHeroBeInterrupted({ hero: { _aiCastingSkill: { id: 'bs' }, _castSuperArmor: true }, isMain: false }) === false, 'AI 霸体施法免疫打断')

// CombatState 派生
assert(getHeroCombatState({ hero: { hp: 0 }, battleSystem: {}, isMain: true }) === CombatState.DEAD, 'DEAD')
assert(getHeroCombatState({ hero: { hp: 1, _hurtLock: 0.3 }, battleSystem: { playerAnim: null }, isMain: true }) === CombatState.HURT, 'HURT')
assert(getHeroCombatState({ hero: { hp: 1, _castSuperArmor: false }, battleSystem: { playerAnim: { timer: 1 } }, isMain: true }) === CombatState.CASTING, 'CASTING')
assert(getHeroCombatState({ hero: { hp: 1, _castSuperArmor: true }, battleSystem: { playerAnim: { timer: 1 } }, isMain: true }) === CombatState.CASTING_SUPER, 'CASTING_SUPER')
assert(getHeroCombatState({ hero: { hp: 1 }, battleSystem: { playerAnim: null }, isMain: true }) === CombatState.IDLE, 'IDLE')

// canHeroAct
assert(canHeroAct({ hero: { hp: 1, _hurtLock: 0 }, battleSystem: { castLockTimer: 0 }, isMain: true }) === true, '可行动(空闲)')
assert(canHeroAct({ hero: { hp: 1, _hurtLock: 0.2 }, battleSystem: {}, isMain: true }) === false, '硬直不可行动')
assert(canHeroAct({ hero: { hp: 0 }, battleSystem: {}, isMain: true }) === false, '死亡不可行动')
assert(canHeroAct({ hero: { hp: 1, _castLock: 1 }, isMain: false }) === false, 'AI 全锁不可行动')

// ---- G3 新增谓词覆盖：isHeroSuperArmor + isHeroCasting(skillType) ----
for (const sa of [false, true]) {
  assert(isHeroSuperArmor({ hero: { _castSuperArmor: sa } }) === sa, `isHeroSuperArmor ${sa}`)
}
assert(isHeroSuperArmor({ hero: null }) === false, 'isHeroSuperArmor null→false')
assert(isHeroSuperArmor({ hero: {} }) === false, 'isHeroSuperArmor 空对象→false')

// isHeroCasting 的 skillType 过滤（Phase 2 剑气风暴守卫迁移依赖此分支）
const anims2 = [null, { type: 'blade_storm', timer: 1 }, { type: 'heal', timer: 1 }, { type: 'blade_storm', timer: 0 }]
for (const pa of anims2) {
  const bs2 = { playerAnim: pa }
  const base = !!(bs2.playerAnim)
  assert(isHeroCasting({ battleSystem: bs2, isMain: true }) === base, `isHeroCasting 无skillType pa=${JSON.stringify(pa)}`)
  const wantBlade = !!(pa && pa.type === 'blade_storm')
  assert(isHeroCasting({ battleSystem: bs2, isMain: true, skillType: 'blade_storm' }) === wantBlade, `isHeroCasting blade_storm pa=${JSON.stringify(pa)}`)
}
// skillType 对 AI 路径无影响（AI 不区分类型）
assert(isHeroCasting({ hero: { _aiCastingSkill: { id: 'x' } }, isMain: false, skillType: 'blade_storm' }) === true, 'AI isHeroCasting 忽略 skillType')

console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
