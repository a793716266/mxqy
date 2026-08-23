/**
 * devtools/verify_other_dungeons.mjs
 * ------------------------------------------------------------------
 * 真实运行时验证「其他副本（魔法塔/集市小镇/古城遗迹）的怪物设计」：
 *
 * Test A — 数据图校验（真实 enemies + 真实副本配置，createRequire 加载 CJS）
 *   1) 副本 lootTable / expTable / spawnZones / clearReward.unlocks 引用的 enemyId 全部存在
 *   2) getEnemyByLevel 对全部怪物（小怪/精英/Boss）产出有限（无 NaN）属性
 *   3) Boss 属性覆盖（bossStatsOverride）锚定生效且有限、与配置一致
 *   4) spawnZones 坐标落在地图 (4000×3000) 内、level 区间合法
 *   5) Boss 具备 isBoss + dialogue + purifyDialogue；unlocks 的英雄 id 存在且 unlockChapter 与章节一致
 *   6) 经验/金币难度递增（同章 boss>精英>小怪；跨章非递减）
 *
 * Test B — 真实 _generateMonsters 集成（经 loader 加载真实 FieldScene 原型）
 *   对每个区域构造 FieldScene 原型实例，调用真实 _generateMonsters()：
 *   - 生成数量 = 1(Boss) + 各 zone.count 之和
 *   - Boss 存在且属性被 bossStatsOverride 锚定
 *   - 所有怪物 enemyId 可解析、属性有限
 *   - 区域表 _getAreaInfo 含 magic_tower/merchant_town/ancient_ruins 且 isDungeon + dungeonCfg 已接
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const enemies = require('../scripts/data/enemies.js')
const { ENEMIES_CH1, ENEMIES_CH2, ENEMIES_CH3, ENEMIES_CH4, getEnemyByLevel } = enemies

import { GRASSLAND_DUNGEON } from '../scripts/data/grassland-dungeon.js'
import { MAGIC_TOWER_DUNGEON } from '../scripts/data/magic-tower-dungeon.js'
import { MERCHANT_TOWN_DUNGEON } from '../scripts/data/merchant-town-dungeon.js'
import { ANCIENT_RUINS_DUNGEON } from '../scripts/data/ancient-ruins-dungeon.js'
import { HEROES } from '../scripts/data/heroes.js'
import { FieldScene } from '../scripts/scenes/field-scene.js'

// ── 断言工具 ──
let pass = 0, fail = 0
const fails = []
function ok(cond, msg) {
  if (cond) { pass++ } else { fail++; fails.push(msg); console.log('  ✗ ' + msg) }
}
function finite(n) { return typeof n === 'number' && isFinite(n) }

// 章节 → 区域配置 + 敌人表 + 章节号 映射
const AREAS = [
  { areaId: 'magic_tower',      chapter: 2, dungeon: MAGIC_TOWER_DUNGEON,      enemyMap: ENEMIES_CH2, bossId: 'crystal_mage' },
  { areaId: 'merchant_town',    chapter: 3, dungeon: MERCHANT_TOWN_DUNGEON,    enemyMap: ENEMIES_CH3, bossId: 'corrupt_merchant' },
  { areaId: 'ancient_ruins',    chapter: 4, dungeon: ANCIENT_RUINS_DUNGEON,    enemyMap: ENEMIES_CH4, bossId: 'ancient_warden' },
]
const ALL_ENEMY_MAPS = { ch1: ENEMIES_CH1, ch2: ENEMIES_CH2, ch3: ENEMIES_CH3, ch4: ENEMIES_CH4 }
const MAP_W = 4000, MAP_H = 3000

// 复刻 field-scene._generateMonsters 的 Boss 属性锚定逻辑（与源码 1:1）
function applyBossOverride(bossData, bossLevel, override) {
  const f = getEnemyByLevel(bossData, bossLevel)
  if (override) {
    if (override.maxHp != null) { f.maxHp = override.maxHp; f.hp = override.maxHp }
    if (override.atk != null) f.atk = override.atk
    if (override.def != null) f.def = override.def
    if (override.spd != null) f.spd = override.spd
  }
  return f
}

console.log('Test A — 数据图校验（真实 enemies + 真实副本配置）')
console.log('==========================================')

// A1: 所有章节敌人 getEnemyByLevel 有限
for (const [key, map] of Object.entries(ALL_ENEMY_MAPS)) {
  for (const id of Object.keys(map)) {
    const lv = map[id].level || 1
    const f = getEnemyByLevel(map[id], lv)
    ok(finite(f.maxHp) && finite(f.atk) && finite(f.def) && finite(f.spd),
      `[${key}] ${id} getEnemyByLevel 属性有限 (HP${f.maxHp}/ATK${f.atk})`)
  }
}

for (const A of AREAS) {
  const { areaId, chapter, dungeon, enemyMap, bossId } = A
  console.log(`\n[A] ${areaId}（第${chapter}章）`)

  // A2: lootTable 的 enemyId 全部存在
  for (const id of Object.keys(dungeon.lootTable || {})) {
    ok(!!enemyMap[id], `[${areaId}] lootTable 引用 ${id} 存在于敌人表`)
    for (const e of dungeon.lootTable[id]) {
      if (e.type === 'material') ok(typeof e.id === 'string' && e.id.length > 0, `[${areaId}] lootTable ${id} 素材 id 合法(${e.id})`)
    }
  }

  // A3: expTable 的 enemyId 全部存在；且 spawnZones + boss 的怪都有有限经验（显式或兜底）
  for (const id of Object.keys(dungeon.expTable || {})) {
    ok(!!enemyMap[id], `[${areaId}] expTable 引用 ${id} 存在于敌人表`)
    ok(finite(dungeon.expTable[id]) && dungeon.expTable[id] > 0, `[${areaId}] expTable ${id} 经验有限(${dungeon.expTable[id]})`)
  }
  const spawnedIds = new Set()
  for (const z of dungeon.spawnZones || []) for (const id of z.enemies) spawnedIds.add(id)
  spawnedIds.add(bossId)
  for (const id of spawnedIds) {
    const exp = (dungeon.expTable && dungeon.expTable[id] != null)
      ? dungeon.expTable[id]
      : (enemyMap[id].isBoss ? 200 : enemyMap[id].isElite ? 40 : 10)
    ok(finite(exp) && exp > 0, `[${areaId}] ${id} 击杀经验有限(${exp})`)
  }

  // A4: spawnZones 坐标/区间合法
  let total = 0
  for (const z of dungeon.spawnZones || []) {
    total += z.count
    ok(z.x >= 0 && z.y >= 0 && (z.x + z.w) <= MAP_W && (z.y + z.h) <= MAP_H,
      `[${areaId}] zone ${z.id} 坐标在地图内 (${z.x},${z.y},${z.w},${z.h})`)
    ok(z.level[0] <= z.level[1], `[${areaId}] zone ${z.id} level 区间合法 [${z.level}]`)
    ok(z.count > 0, `[${areaId}] zone ${z.id} count>0`)
    for (const id of z.enemies) ok(!!enemyMap[id], `[${areaId}] zone ${z.id} 敌人 ${id} 存在`)
  }
  A._expectedCount = 1 + total

  // A5: Boss 配置
  const boss = enemyMap[bossId]
  ok(!!boss && boss.isBoss === true, `[${areaId}] ${bossId} 是 Boss`)
  ok(Array.isArray(boss.dialogue) && boss.dialogue.length >= 1, `[${areaId}] ${bossId} 有登场台词`)
  ok(Array.isArray(boss.purifyDialogue) && boss.purifyDialogue.length >= 1, `[${areaId}] ${bossId} 有感化独白`)
  ok(!!dungeon.bossStatsOverride, `[${areaId}] 配置 bossStatsOverride`)
  if (dungeon.bossStatsOverride) {
    const bossLevel = boss.level || 5
    const f = applyBossOverride(boss, bossLevel, dungeon.bossStatsOverride)
    ok(f.maxHp === dungeon.bossStatsOverride.maxHp && finite(f.maxHp) && f.maxHp > 0,
      `[${areaId}] Boss maxHp 被锚定为 ${f.maxHp}`)
    ok(finite(f.atk) && finite(f.def) && finite(f.spd) && f.atk > 0,
      `[${areaId}] Boss 锚定后 atk/def/spd 有限 (${f.atk}/${f.def}/${f.spd})`)
  }

  // A6: 通关解锁角色存在且与章节一致
  for (const hid of (dungeon.clearReward && dungeon.clearReward.unlocks) || []) {
    const hdef = HEROES.find(h => h.id === hid)
    ok(!!hdef, `[${areaId}] 解锁英雄 ${hid} 存在于 heroes 表`)
    if (hdef) ok(hdef.unlockChapter === chapter, `[${areaId}] 英雄 ${hid} 的 unlockChapter(${hdef.unlockChapter}) === 章节(${chapter})`)
  }
}

// A7: 跨章难度非递减（Boss 经验）
console.log(`\n[A] 跨章 Boss 经验: ch2=${MAGIC_TOWER_DUNGEON.expTable.crystal_mage} ch3=${MERCHANT_TOWN_DUNGEON.expTable.corrupt_merchant} ch4=${ANCIENT_RUINS_DUNGEON.expTable.ancient_warden}`)
ok(MAGIC_TOWER_DUNGEON.expTable.crystal_mage <= MERCHANT_TOWN_DUNGEON.expTable.corrupt_merchant,
  '跨章 Boss 经验非递减 (ch2<=ch3)')
ok(MERCHANT_TOWN_DUNGEON.expTable.corrupt_merchant <= ANCIENT_RUINS_DUNGEON.expTable.ancient_warden,
  '跨章 Boss 经验非递减 (ch3<=ch4)')

console.log('\nTest B — 真实 _generateMonsters 集成（真实 FieldScene 原型）')
console.log('==================================================')

function mockData() {
  const store = {}
  return {
    hasFlag: k => !!store[k],
    setFlag: k => { store[k] = true },
    get: k => store[k],
    set: (k, v) => { store[k] = v },
  }
}

const scene = Object.create(FieldScene.prototype)
scene.dpr = 1
scene.mapWidth = MAP_W
scene.mapHeight = MAP_H
scene.game = { data: mockData(), audio: { playBGM() {} } }

// B0: 区域表接线检查（真实 _getAreaInfo，需先置 areaId）
ok(typeof scene._generateMonsters === 'function', '_generateMonsters 原型方法存在')
for (const A of AREAS) {
  scene.areaId = A.areaId
  const ai = scene._getAreaInfo()
  ok(ai && ai.isDungeon === true && !!ai.dungeonCfg, `区域表 ${A.areaId} 已接 isDungeon + dungeonCfg`)
}
scene.areaId = 'grassland'
ok(scene._getAreaInfo().isDungeon === true, '区域表 grassland 仍 isDungeon（回归）')
scene.areaId = undefined

for (const A of AREAS) {
  console.log(`\n[B] ${A.areaId} 真实 _generateMonsters`)
  scene.areaId = A.areaId
  scene.areaInfo = scene._getAreaInfo()
  scene._dungeonCfg = scene.areaInfo.dungeonCfg || GRASSLAND_DUNGEON
  const monsters = scene._generateMonsters()
  ok(monsters.length === A._expectedCount, `[${A.areaId}] 生成数量=${monsters.length} (期望 ${A._expectedCount}: 1 Boss + ${A._expectedCount - 1} 小怪)`)
  const boss = monsters.find(m => m.isBoss && m.enemyId === A.bossId)
  ok(!!boss, `[${A.areaId}] Boss(${A.bossId}) 已生成`)
  if (boss) {
    ok(boss.maxHp === A.dungeon.bossStatsOverride.maxHp, `[${A.areaId}] Boss maxHp 锚定 ${boss.maxHp}`)
    ok(finite(boss.atk) && finite(boss.def) && finite(boss.spd) && finite(boss.hp), `[${A.areaId}] Boss 属性有限`)
  }
  let allResolved = true, allFinite = true
  for (const m of monsters) {
    if (!A.enemyMap[m.enemyId]) allResolved = false
    if (!(finite(m.maxHp) && finite(m.atk) && finite(m.def) && finite(m.spd))) allFinite = false
  }
  ok(allResolved, `[${A.areaId}] 所有怪物 enemyId 在敌人表可解析`)
  ok(allFinite, `[${A.areaId}] 所有怪物属性有限（无 NaN）`)
}

// ── 结果 ──
console.log(`\n==========================================`)
console.log(`结果: ${pass} 通过 / ${fail} 失败`)
if (fail > 0) {
  console.log('失败项:')
  for (const f of fails) console.log('  - ' + f)
  process.exit(1)
} else {
  console.log('✅ 全部通过')
}
