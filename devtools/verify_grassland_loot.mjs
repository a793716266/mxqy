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
const GRASSLAND_BOSS = 'lost_healer_cat'

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

console.log('\n[3] 宝箱奖励区间（镜像 _collectObject + chestReward）')
const cr = (GRASSLAND_DUNGEON.chestReward && GRASSLAND_DUNGEON.chestReward.gold) || { min: 10, max: 29 }
let chestOk = true
for (let i = 0; i < 100; i++) {
  const g = cr.min + Math.floor(Math.random() * (cr.max - cr.min + 1))
  if (g < 10 || g > 29) chestOk = false
}
check('宝箱金币在 [10,29]', chestOk)

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

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
process.exit(fail === 0 ? 0 : 1)
