/**
 * 验证：近战普攻命中判定【仅命中玩家朝向半球】，背后不可攻击。
 *  - 根因：原普攻先 _faceProbe 找"最近怪"并据此【自动翻转朝向 dir】，
 *    导致身后有怪时点普攻会把 dir 翻到背后，把背后的怪也打到（"背后能攻击"）。
 *  - 修复：① handler 改用玩家真实 facing（this.facingLeft）决定 dir，不再自动翻向最近怪；
 *         ② _findNearestMonsterFromPos 新增 faceX 参数，前向约束相对【玩家中心】，
 *            (monster.x - faceX)*dir < 0 即"背后"一律不可命中。
 *  - 本脚本用【真实】installFieldBattleSystem 装出的 _findNearestMonsterFromPos，
 *    以玩家中心 faceX=ctrlPos.x 验证朝向半球判定（队友AI不传 faceX，行为保持旧兼容）。
 * 用法: node devtools/verify_melee_facing.mjs
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

class Dummy {}
installFieldBattleSystem(Dummy)
const sys = new Dummy()
sys.dpr = 3
sys.battleSystem = { battleTarget: null }   // 无锁定目标，走最近距离选择

const PX = 500, PY = 500                      // 玩家中心（逻辑像素）
const meleeRange = 80 * sys.dpr               // 240
const yTol = 40 * sys.dpr                     // 120
const mon = (id, x, y) => ({ id, x, y, alive: true })

// faceX = 玩家中心（与 handler 传入的 ctrlPos.x 一致）
const call = (monsters, dir, faceX = PX) => {
  sys.mapMonsters = monsters
  return sys._findNearestMonsterFromPos(meleeRange, 'x', PX + dir * (28 * sys.dpr), PY, yTol, dir, faceX)
}

console.log('\n[A] 朝右(dir=+1)：身前怪(右侧)应被选中')
{
  const t = call([mon('front', 600, 500)], +1)
  assert(t && t.id === 'front', '身前(右)怪被选为目标', `target=${t && t.id}`)
}

console.log('\n[B] 朝右(dir=+1)：仅身后怪(左侧)应在朝向半球外 -> 不选中')
{
  const t = call([mon('back', 400, 500)], +1)
  assert(t == null, '身后(左)怪不可命中（返回 null）', `target=${t && t.id}`)
}

console.log('\n[C] 朝右(dir=+1)：身前+身后同时存在 -> 只选身前')
{
  const t = call([mon('back', 400, 500), mon('front', 600, 500)], +1)
  assert(t && t.id === 'front', '背后怪被排除，仅选身前怪', `target=${t && t.id}`)
}

console.log('\n[D] 朝左(dir=-1)：身前=左侧(400) 应选中，右侧(600) 背后不可选中')
{
  const front = call([mon('left', 400, 500)], -1)
  assert(front && front.id === 'left', '朝左时左侧(身前)怪选中', `target=${front && front.id}`)
  const back = call([mon('right', 600, 500)], -1)
  assert(back == null, '朝左时右侧(背后)怪不可命中', `target=${back && back.id}`)
}

console.log('\n[E] 贴脸前 10px(x=510) 应可命中（faceX 相对玩家中心，避免剑尖偏移漏判）')
{
  const t = call([mon('adj', 510, 500)], +1)
  assert(t && t.id === 'adj', '贴脸前 10px 怪仍被命中', `target=${t && t.id}`)
}

console.log('\n[F] 正中线(x=500 与玩家同列)：投影=0，不算背后 -> 命中')
{
  const t = call([mon('mid', 500, 500)], +1)
  assert(t && t.id === 'mid', '正中线怪命中（非背后）', `target=${t && t.id}`)
}

console.log('\n[G] 身前但 Y 偏差超容差 -> 不打到（yTol 仍生效）')
{
  const t = call([mon('yfar', 600, 500 + yTol + 50)], +1)
  assert(t == null, 'Y 轴偏差过大不命中', `target=${t && t.id}`)
}

console.log('\n[H] 兼容旧调用（不传 faceX）：队友AI axis=xy 不受影响；axis=x 无 faceX 时按 originX 判定')
{
  // 队友AI走 'xy' 轴，前向约束不触发（useAxis!=='x'），前后都能选
  sys.mapMonsters = [mon('back', 400, 500), mon('front', 600, 500)]
  const t = sys._findNearestMonsterFromPos(meleeRange, 'xy', PX, PY, undefined)
  assert(t != null, "axis='xy' 时不限制朝向（队友AI/技能选敌兼容）", `target=${t && t.id}`)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
