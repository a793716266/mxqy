/**
 * 验证：怪物远程抛射物命中英雄时【能触发受击泛红 + 正常扣血】。
 *  - 根因：老 _spawnMonsterProjectile 生成的弹道缺 atk 字段，
 *    _fieldUpdateProjectiles 用 p.atk(undefined) 算伤害得到 NaN，
 *    使 (NaN > 0) 为 false：既不扣血也不设置 _hurtFlash（远程不泛红）。
 *  - 修复：老 _spawnMonsterProjectile 补 atk/owner 字段，与 _fieldSpawnMonsterProjectile 一致。
 *  - 本脚本用【真实】installFieldBattleSystem 装出的 _fieldUpdateProjectiles + _applyHeroDamage，
 *    对"无 atk 弹道"(复现 bug) 与"含 atk 弹道"(修复后) 各做一次命中结算，断言泛红/扣血行为。
 * 用法: node devtools/verify_hurt_flash_ranged.mjs
 */
globalThis.wx = {
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }),
  createImage: () => ({ width: 64, height: 64 }),
}

const { installFieldBattleSystem } = await import('../scripts/systems/field-battle-system.js')

let pass = 0, fail = 0
const assert = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' ' + extra : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' ' + extra : ''}`) }
}

// 1. 安装战斗系统到最小 Dummy 类（只定义函数，不执行战斗逻辑）
class Dummy {}
installFieldBattleSystem(Dummy)
const sys = new Dummy()

// 2. 提供战斗系统运行所需的依赖 stub（真实逻辑只认这些接口）
const hero = { name: 'testHero', hp: 100, maxHp: 100, x: 500, y: 500, alive: true }
sys.dpr = 3
sys.cameraX = 0
sys.cameraY = 0
sys.party = [hero]
sys.battleSystem = { projectiles: [], damageTexts: [] }
sys._getCurrentControlHero = () => ({ hero: sys.party[0] })
sys._fieldHeroPos = (h) => ({ x: h.x, y: h.y })
sys._getHeroDef = () => 0
sys._fieldResolveGuard = (h) => h
sys._interruptCastingForHero = () => {}
sys._triggerHeroHurt = () => {}
sys._fieldApplyCounterReflect = () => {}

console.log('\n[A] 复现根因：无 atk 的怪物弹道（修复前）')
{
  const h = { name: 'h', hp: 100, maxHp: 100, x: 500, y: 500, alive: true }
  sys.party = [h]
  sys.battleSystem.projectiles = [{
    x: 500, y: 500, vx: 0, vy: 0, power: 1, life: 2,
    owner: 'monster', targetHero: h   // ★ 故意不携带 atk
  }]
  sys._fieldUpdateProjectiles(0.016)
  assert(h._hurtFlash == null || h._hurtFlash <= 0, '无 atk 弹道命中后 _hurtFlash 未设置（即不泛红）', `hurtFlash=${h._hurtFlash}`)
  assert(Number.isNaN(h.hp), '无 atk 弹道命中后 HP 被 NaN 污染（伤害计算崩溃，比"不扣血"更糟）', `hp=${h.hp}`)
}

console.log('\n[B] 修复后：携带 atk 的怪物弹道（_spawnMonsterProjectile 现已补 atk）')
{
  const h = { name: 'h', hp: 100, maxHp: 100, x: 500, y: 500, alive: true }
  sys.party = [h]
  sys.battleSystem.projectiles = [{
    x: 500, y: 500, vx: 0, vy: 0, power: 1, atk: 20, def: 0,
    owner: 'monster', targetHero: h, life: 2
  }]
  sys._fieldUpdateProjectiles(0.016)
  assert(h._hurtFlash === 1, '含 atk 弹道命中后 _hurtFlash === 1（远程命中触发泛红）', `hurtFlash=${h._hurtFlash}`)
  assert(h.hp === 80, '含 atk 弹道命中后 HP 正常下降（100 - 20）', `hp=${h.hp}`)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
