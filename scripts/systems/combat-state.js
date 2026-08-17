/**
 * combat-state.js — 战斗状态机抽象（Phase 1：纯读取基底，零行为变更）
 * ============================================================================
 * 目的：把散落在 field-battle-system.js / field-scene.js 约 15 个判断点里、
 * 由 9 个标志字段（_castSuperArmor / _hurtLock / _castLock / _castAxisLock /
 * _aiAttacking / _aiCastingSkill / castLockTimer / castAxisLockTimer /
 * playerAnim）拼出来的「此刻能否移动 / 能否行动 / 能否被打断」逻辑，
 * 收敛到唯一真相源。
 *
 * 本阶段（Phase 1）只做「纯读取」——所有谓词严格对齐现有字段语义，
 * 不改变任何游戏行为。后续把散落判断点逐个改读本模块（行为不变），
 * 再在 Phase 3 把内部 9 字段替换为 CombatState 枚举本身。
 *
 * 历史不对称（先如实收敛，不在此修正）：
 *   - 玩家移动锁在 battleSystem 上：castLockTimer / castAxisLockTimer
 *   - AI 移动锁在 hero 上：_castLock / _castAxisLock
 *   - 玩家施法信号在 battleSystem.playerAnim；AI 施法信号在 hero._aiCastingSkill / _aiAttacking
 * 调用方需传入 isMain 标明是「被玩家控制的英雄」还是「AI 队友」。
 */

export const CombatState = {
  IDLE: 'IDLE',
  CASTING: 'CASTING',
  CASTING_SUPER: 'CASTING_SUPER',
  HURT: 'HURT',
  DEAD: 'DEAD',
}

/**
 * 统一读取「移动锁」。
 * @returns {{full: boolean, axisY: boolean}}
 *   full  —— 完全锁死（任何轴都不能动）
 *   axisY —— 仅锁 Y 轴（可小幅 X 走位，对应伤害技能/普攻施法）
 */
export function getHeroMoveLock({ hero, battleSystem = null, isMain = false } = {}) {
  if (isMain) {
    const bs = battleSystem || {}
    return {
      full: (bs.castLockTimer > 0) || !!(hero._stunned > 0) || !!(hero._hurtLock > 0),
      axisY: !!(bs.castAxisLockTimer > 0),
    }
  }
  return {
    full: !!(hero._castLock > 0),
    axisY: !!(hero._castAxisLock > 0),
  }
}

/**
 * 该英雄此刻是否处于「施法/攻击动画」中（不含已结束的残影）。
 * 注意：玩家路径严格对齐现有散落判断（!!battleSystem.playerAnim），
 * 以保证迁移零回归。游戏中 playerAnim 在 timer 归零的同帧被置 null，
 * 故真实状态等价；timer>0 的更精细语义留待 Phase 3 接管状态机后再引入。
 */
export function isHeroCasting({ hero, battleSystem = null, isMain = false, skillType = null } = {}) {
  if (isMain) {
    const pa = battleSystem && battleSystem.playerAnim
    // ★ skillType：可选，限定「只关心某类型施法」（如 blade_storm）。不传则任意施法都算。
    return !!(pa && (!skillType || pa.type === skillType))
  }
  // AI 路径不区分技能类型（_aiCastingSkill 已含具体技能对象，调用方可自行判断）
  return !!(hero._aiCastingSkill) || !!(hero._aiAttacking)
}

/** 该英雄此刻是否处于霸体（superArmor）状态。霸体期间免疫受击硬直 / 施法被打断。 */
export function isHeroSuperArmor({ hero } = {}) {
  return !!(hero && hero._castSuperArmor)
}

/** 该英雄此刻的施法能否被「命中打断」（作废待结算效果 + 切受击）。霸体免疫。 */
export function canHeroBeInterrupted({ hero, battleSystem = null, isMain = false } = {}) {
  return isHeroCasting({ hero, battleSystem, isMain }) && !hero._castSuperArmor
}

/** 该英雄此刻是否能主动行动（放技能/普攻）。死亡 / 硬直 / 全锁时不可。 */
export function canHeroAct({ hero, battleSystem = null, isMain = false } = {}) {
  const lock = getHeroMoveLock({ hero, battleSystem, isMain })
  if (lock.full) return false
  if (hero.hp !== undefined && hero.hp <= 0) return false
  if (hero._hurtLock > 0) return false
  return true
}

/** 派生当前战斗状态（诊断 / 后续 Phase 3 的枚举真相源）。 */
export function getHeroCombatState({ hero, battleSystem = null, isMain = false } = {}) {
  if (hero.hp !== undefined && hero.hp <= 0) return CombatState.DEAD
  if (isHeroCasting({ hero, battleSystem, isMain })) {
    return hero._castSuperArmor ? CombatState.CASTING_SUPER : CombatState.CASTING
  }
  if (hero._hurtLock > 0 && !hero._castSuperArmor) return CombatState.HURT
  return CombatState.IDLE
}
