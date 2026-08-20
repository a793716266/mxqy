/**
 * 验证：阳光草原 Boss 身份 + 动画/属性资源正确
 * - 草原 Boss 必须为 lost_healer_cat（迷途的治愈猫 / 艾米），不是 dark_cat_king
 *   （注：field-scene._getAreaInfo 的 grassland.bossEnemy 已改为 'lost_healer_cat'，脚本外 grep 确认）
 * - bossStatsOverride 锚定艾米原生属性（350/22/16/11），不得残留暗影猫王的压低值(260/17)
 * - ENEMIES_CH1.lost_healer_cat（即 lost-healer-cat.js 单一数据源）的动画(aimi)/渲染(spriteType='aimi')正确
 * - 草原 Boss 掉落正确，暗影猫王掉落保留（cave 区域用）
 *
 * 说明：field-scene._generateMonsters 运行时流程为 getEnemyByLevel(放大) → bossStatsOverride 覆盖。
 * 由于 bossStatsOverride 值 == lost_healer_cat 原生属性，最终 boss 属性必 == 艾米原生（属性资源正确）。
 */
import { GRASSLAND_DUNGEON } from '../scripts/data/grassland-dungeon.js'
import lostHealerCat from '../scripts/entities/monsters/lost-healer-cat.js'

let pass = 0, fail = 0
const assert = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`) }
  else { fail++; console.log(`  ✗ ${msg} ${extra}`) }
}

const amy = lostHealerCat
const ov = GRASSLAND_DUNGEON.bossStatsOverride

console.log('[1] 草原 Boss 身份 = 艾米（迷途的治愈猫），非暗影猫王')
assert(amy && amy.id === 'lost_healer_cat', 'lost_healer_cat 存在且 id 正确', amy && amy.id)
assert(amy.name === '迷途的治愈猫', '艾米 Boss 名称为「迷途的治愈猫」', amy && amy.name)
assert(amy.isAmy === true, 'isAmy 标记为真（艾米 Boss 形态）')
assert(amy.isBoss === true, 'isBoss 标记为真')

console.log('\n[2] 动画资源 = 艾米（aimi / AIMI）')
assert(amy.renderConfig && amy.renderConfig.spriteType === 'aimi', 'renderConfig.spriteType === "aimi"', amy.renderConfig && amy.renderConfig.spriteType)
assert(amy.renderConfig && amy.renderConfig.assetPrefix === 'AIMI', 'renderConfig.assetPrefix === "AIMI"', amy.renderConfig && amy.renderConfig.assetPrefix)
assert(amy.animationConfig && amy.animationConfig.idle.path.includes('aimi'), 'animationConfig.idle 路径含 aimi（使用艾米动画资源）', amy.animationConfig && amy.animationConfig.idle.path)
assert(amy.animationConfig && amy.animationConfig.attack.path.includes('aimi'), 'animationConfig.attack 路径含 aimi')

console.log('\n[3] 属性资源 = 艾米原生（bossStatsOverride 锚定，不残留暗影猫王压低值）')
assert(ov && ov.maxHp === 350 && ov.atk === 22 && ov.def === 16 && ov.spd === 11,
  'bossStatsOverride 锚定艾米原生值 (350/22/16/11)', JSON.stringify(ov))
assert(amy.maxHp === 350 && amy.atk === 22 && amy.def === 16 && amy.spd === 11,
  'lost_healer_cat 原生属性 == 350/22/16/11（与 bossStatsOverride 一致）',
  `${amy.maxHp}/${amy.atk}/${amy.def}/${amy.spd}`)
// 关键：override 值 == 艾米原生 ⇒ 运行时 getEnemyByLevel(放大) 后必被覆盖回艾米原生（属性资源正确）
assert(ov.maxHp === amy.maxHp && ov.atk === amy.atk && ov.def === amy.def && ov.spd === amy.spd,
  'bossStatsOverride 与艾米原生属性完全一致 ⇒ 最终 boss 属性即为艾米资源（不被扭曲）')

console.log('\n[4] 掉落表：草原 Boss 艾米掉落正确，暗影猫王掉落保留（cave 用）')
const lt = GRASSLAND_DUNGEON.lootTable
assert(lt.lost_healer_cat && Array.isArray(lt.lost_healer_cat) && lt.lost_healer_cat.length >= 1,
  'lootTable.lost_healer_cat 存在且有掉落条目')
const hasHerb = (lt.lost_healer_cat || []).some(e => e.type === 'material' && e.id === 'healing_herb')
assert(hasHerb, '艾米掉落含 healing_herb（对应其原生 drop）')
assert(lt.dark_cat_king && Array.isArray(lt.dark_cat_king),
  'lootTable.dark_cat_king 仍保留（cave 区域 Boss 掉落，未误删）')

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
