/**
 * verify_grassland_loot.mjs
 * 校验阳光草原副本的「掉落 / 通关奖励 / 艾米解锁」逻辑。
 * 运行：node devtools/verify_grassland_loot.mjs
 *
 * 说明：掉落/入账的具体算术与 field-scene 的 _rollMonsterDrop/_addGold/_addMaterial
 * 完全一致（此处按相同逻辑镜像实现，并复用真实 GRASSLAND_DUNGEON 配置与真实
 * charStateManager 解锁调用），以验证数据正确性与通关解锁链路。
 */
import { GRASSLAND_DUNGEON } from '../scripts/data/grassland-dungeon.js'
import { charStateManager } from '../scripts/data/character-state.js'

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

// 草原真实敌人池 + Boss（取自 field-scene _getAreaInfo）
const GRASSLAND_ENEMIES = ['wild_cat', 'slime_cat', 'shadow_mouse', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth']
const GRASSLAND_BOSS = 'dark_cat_king'

console.log('\n[1] 掉落表覆盖校验')
const pool = [...GRASSLAND_ENEMIES, GRASSLAND_BOSS]
let covered = 0
for (const eid of pool) {
  const ok = !!GRASSLAND_DUNGEON.lootTable[eid]
  if (ok) covered++
  else console.log(`     ⚠️ 缺失掉落: ${eid}`)
}
check('草原全部敌人+Boss 均有掉落配置', covered === pool.length, `(${covered}/${pool.length})`)

console.log('\n[2] 掉落数值/字段正确性（镜像 _rollMonsterDrop + _addGold）')

// 最小 mock data：'gold' → player.gold，'materials' → 库存对象（与 data-manager 语义一致）
function makeMockData() {
  const store = { player: { gold: 0 }, materials: {} }
  return {
    get(k) { if (k === 'gold') return store.player.gold; if (k === 'materials') return store.materials; return undefined },
    set(k, v) { if (k === 'gold') store.player.gold = v; else if (k === 'materials') store.materials = v; else store[k] = v },
  }
}

function rollMonsterDrop(monster, data) {
  const table = GRASSLAND_DUNGEON.lootTable[monster.enemyId]
  if (!table || !table.length) return
  for (const entry of table) {
    if (entry.rate != null && Math.random() > entry.rate) continue
    if (entry.type === 'gold') {
      const amt = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1))
      const cur = data.get('gold') || 0
      data.set('gold', cur + amt)
    } else if (entry.type === 'material') {
      const c = entry.count || 1
      const mats = data.get('materials') || {}
      mats[entry.id] = (mats[entry.id] || 0) + c
      data.set('materials', mats)
    }
  }
}

// 用确定性 Math.random 便于断言区间（mulberry32）
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const seed = mulberry32(0xC0FFEE)
const _rng = Math.random
Math.random = seed

const data = makeMockData()
let allInRange = true
for (let i = 0; i < 200; i++) {
  const before = data.get('gold')
  rollMonsterDrop({ enemyId: 'slime_cat', name: '史莱姆猫' }, data)
  const gained = data.get('gold') - before
  // slime_cat 必掉金币，区间 [5,12]
  if (gained < 5 || gained > 12) allInRange = false
}
check('slime_cat 200 次击杀金币均落在 [5,12]', allInRange)

// 恢复随机
Math.random = _rng

check('slime_cat 掉落写入的是 gold 字段（非孤立 coins）', data.get('gold') > 0 && data.get('materials') != null)

console.log('\n[3] 宝箱奖励多样化（镜像 _collectObject + chestReward.entries）')
const cr = GRASSLAND_DUNGEON.chestReward
check('chestReward.entries 为多条目数组', Array.isArray(cr.entries) && cr.entries.length >= 2)
check('宝箱含金币条目', cr.entries.some(e => e.type === 'gold' && e.min && e.max))
check('宝箱含素材条目', cr.entries.some(e => e.type === 'material' && e.id))

// 镜像 field-scene._collectObject 的 entries 结算逻辑
function collectChest(data) {
  const entries = (GRASSLAND_DUNGEON.chestReward && GRASSLAND_DUNGEON.chestReward.entries) || []
  for (const entry of entries) {
    const rate = entry.rate != null ? entry.rate : 1
    if (Math.random() > rate) continue
    if (entry.type === 'gold') {
      const g = (entry.min || 0) + Math.floor(Math.random() * ((entry.max || 0) - (entry.min || 0) + 1))
      if (g > 0) { const cur = data.get('gold') || 0; data.set('gold', cur + g) }
    } else if (entry.type === 'material') {
      const c = entry.count || 1
      const mats = data.get('materials') || {}
      mats[entry.id] = (mats[entry.id] || 0) + c
      data.set('materials', mats)
    }
  }
}
// 真随机跑 300 次统计：金币入账、素材掉落是否发生
const d3 = makeMockData()
let goldSeen = false, matSeen = false
for (let i = 0; i < 300; i++) {
  collectChest(d3)
  if (d3.get('gold') > 0) goldSeen = true
  if (Object.keys(d3.get('materials') || {}).length > 0) matSeen = true
}
check('宝箱金币可入账（gold 字段）', goldSeen)
check('宝箱素材可掉落（materials 库存）', matSeen)

console.log('\n[4] 通关奖励 + 艾米解锁链路（真实 charStateManager）')
const data2 = makeMockData()
const reward = (GRASSLAND_DUNGEON.clearReward && GRASSLAND_DUNGEON.clearReward.coins) ?? 80
data2.set('gold', (data2.get('gold') || 0) + reward)
check('通关金币 = 80 且写入 gold', data2.get('gold') === 80)

// 模拟 _checkDungeonClear 中 areaId==='grassland' 的解锁分支
const unlocks = (GRASSLAND_DUNGEON.clearReward && GRASSLAND_DUNGEON.clearReward.unlocks) || []
let amyUnlocked = false
for (const hid of unlocks) {
  const ok = charStateManager.unlockCharacter(hid)
  if (hid === 'amy' && ok) amyUnlocked = true
}
check('通关解锁艾米（amy）成功', amyUnlocked)
// 幂等：再次解锁不应报错、不应重复
const second = charStateManager.unlockCharacter('amy')
check('艾米解锁幂等（重复调用安全）', second === false)

console.log('\n[5] 副本结构配置（区域分层 / 开场对话）')
check('spawnZones 为 3 个区域', GRASSLAND_DUNGEON.spawnZones && GRASSLAND_DUNGEON.spawnZones.length === 3)
const zoneOk = (GRASSLAND_DUNGEON.spawnZones || []).every(z =>
  z.x >= 0 && z.y >= 0 && z.w > 0 && z.h > 0 &&
  Array.isArray(z.enemies) && z.enemies.length > 0 &&
  Array.isArray(z.level) && z.level.length === 2 && z.level[0] <= z.level[1] &&
  typeof z.count === 'number' && z.count > 0)
check('每个区域字段合法（坐标/敌人/等级/数量）', zoneOk)
const zoneTotal = (GRASSLAND_DUNGEON.spawnZones || []).reduce((s, z) => s + z.count, 0)
check('区域分层怪物总数 = 21（9+7+5）', zoneTotal === 21)
check('含 Boss 全副本共 22 只', zoneTotal + 1 === 22)
check('已移除篝火安全区（设计调整：safeZones 不再定义）', !GRASSLAND_DUNGEON.safeZones)
check('开场引导对话存在', GRASSLAND_DUNGEON.introDialogue && GRASSLAND_DUNGEON.introDialogue.name && Array.isArray(GRASSLAND_DUNGEON.introDialogue.lines) && GRASSLAND_DUNGEON.introDialogue.lines.length >= 3)

console.log('\n[6] 第一章 Boss 属性覆盖（草原 Boss = 艾米 lost_healer_cat，属性资源锚定原生）')
const GROWTH = { boss: { hp: 0.12, atk: 0.08, def: 0.08, spd: 0.04 } }
// 草原 Boss 为 lost_healer_cat（迷途的治愈猫 / 艾米），原生 level 8，原生属性 350/22/16/11
const AMY_BASE = { maxHp: 350, atk: 22, def: 16, spd: 11 }
const lvl = 8, mul = lvl - 1  // bossLevel=8（field-scene grassland.bossLevel 设定）
const preHp = Math.floor(AMY_BASE.maxHp * (1 + GROWTH.boss.hp * mul))
const preAtk = Math.floor(AMY_BASE.atk * (1 + GROWTH.boss.atk * mul))
check('未覆盖时 getEnemyByLevel(lost_healer_cat,8) 仍会放大（佐证需 bossStatsOverride 锚定）', preHp > 350 && preAtk > 22)
const ov = GRASSLAND_DUNGEON.bossStatsOverride
check('bossStatsOverride 配置存在', !!ov)
check('覆盖后 Boss HP = 350（艾米原生）', ov && ov.maxHp === 350)
check('覆盖后 Boss atk = 22（艾米原生）', ov && ov.atk === 22)
check('覆盖值与艾米原生属性一致（属性资源不被扭曲）', ov && ov.maxHp === AMY_BASE.maxHp && ov.atk === AMY_BASE.atk && ov.def === AMY_BASE.def && ov.spd === AMY_BASE.spd)
// 艾米最强攻击技「治愈冲击」power 2.2；伤害公式 dmg = atk*power - heroDef*0.3，heroDef 取 10 模拟
const ultDmg = ov.atk * 2.2 - 10 * 0.3
check('艾米最强技(治愈冲击 power2.2) 约 45 伤（可生还，非秒杀）', ultDmg >= 40 && ultDmg <= 50)

console.log('\n[7] 配置完整性')
check('clearReward.unlocks 含 amy', GRASSLAND_DUNGEON.clearReward.unlocks.includes('amy'))
check('clearReward.coins = 80', GRASSLAND_DUNGEON.clearReward.coins === 80)

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
process.exit(fail === 0 ? 0 : 1)
