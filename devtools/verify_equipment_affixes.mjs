/**
 * 验证装备词条全链路 + 城镇强化系统
 * 用法: node devtools/verify_equipment_affixes.mjs
 *
 * 覆盖（用户报告"装备词条属性并没有生效到副本，比如回蓝"的三层根因）：
 *   A. equipmentManager._applyStats/_removeStats 全词条（含 matk/lifesteal/cdr）+ 强化乘区对称可逆
 *   B. 强化 API：canEnhance/enhanceCost/enhance/serialize roundtrip/clamp
 *   C. CharacterState.matk 补齐与成长（法师有法强、战士为 0）
 *   D. field-scene._initParty 词条透传（静态断言 6 字段）
 *   E. 战斗消费端（真实 mixin 安装到假类）：副本回蓝/回血、_heroCdrMult、_applyLifesteal
 *   F. 挂点静态守卫：CDR 乘区 6 处调用、强化 UI 接线
 */
const _storage = {}
globalThis.wx = {
  getStorageSync: k => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => new Proxy({}, { get: (t, p) => p === 'canvas' ? undefined : () => ({}), set: () => true }) }),
  createImage: () => { const img = { width: 64, height: 64 }; setTimeout(() => img.onload && img.onload(), 0); return img },
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 16),
  onShow: () => {}, onHide: () => {}, showToast: () => {}, vibrateShort: () => {},
}

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')   // 不依赖 process.cwd()
const src = p => fs.readFileSync(path.resolve(projectRoot, p), 'utf8')

const { EquipmentManager, equipmentManager, ENHANCE_MAX_LEVEL, ENHANCE_STEP } = await import('../scripts/managers/equipment-manager.js')
const { CharacterState } = await import('../scripts/data/character-state.js')
const { HEROES } = await import('../scripts/data/heroes.js')
const { EQUIPMENT_CH1 } = await import('../scripts/data/equipment.js')
const { installFieldBattleSystem } = await import('../scripts/systems/field-battle-system.js')

let passed = 0, failed = 0
const assert = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`) } else { failed++; console.log(`  ✗ ${n}  ${d || ''}`) } }
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// ============================================================
console.log('\n=== A. _applyStats/_removeStats 全词条 + 强化乘区（对称可逆） ===')
const em = equipmentManager
em.enhanceLevels = {}
const EQ_ID = 'affix_test_1'
em.enhanceLevels[EQ_ID] = 3   // mult = 1.3

const fakeEq = {
  id: EQ_ID, name: '测试全能装', type: 'weapon', rarity: 'epic', price: 200,
  stats: { atk: 10, matk: 5, def: 4, maxHp: 100, maxMp: 20, spd: 2, crit: 0.05, mpRegen: 2, hpRegen: 1.5, lifesteal: 0.08, cdr: 0.10 },
}
const mkChar = () => ({
  id: 't', name: '测试', equipment: {}, level: 1,
  atk: 100, def: 50, maxHp: 1000, maxMp: 200, spd: 10,
  matk: 30, crit: 0.05, mpRegen: 0, hpRegen: 0, lifesteal: 0, cdr: 0,
  hp: 1000, mp: 200, buffs: [],
})
const snap = c => JSON.stringify({ atk: c.atk, matk: c.matk, def: c.def, maxHp: c.maxHp, maxMp: c.maxMp, spd: c.spd, crit: c.crit, mpRegen: c.mpRegen, hpRegen: c.hpRegen, lifesteal: c.lifesteal, cdr: c.cdr })
const BASE = snap(mkChar())

const c1 = mkChar()
em._applyStats(c1, fakeEq)
assert(c1.atk === 100 + Math.round(10 * 1.3), `atk +${Math.round(10 * 1.3)}（整数词条四舍五入）`, `=${c1.atk}`)
assert(c1.matk === 30 + Math.round(5 * 1.3), `matk +${Math.round(5 * 1.3)}（此前词条从未被应用）`, `=${c1.matk}`)
assert(c1.def === 50 + Math.round(4 * 1.3), `def +${Math.round(4 * 1.3)}`, `=${c1.def}`)
assert(c1.maxHp === 1000 + 130 && c1.maxMp === 200 + 26, 'maxHp +130 / maxMp +26')
assert(c1.spd === 10 + Math.round(2 * 1.3), `spd +${Math.round(2 * 1.3)}`, `=${c1.spd}`)
assert(approx(c1.crit, 0.05 + 0.065), `crit +0.065（百分比词条保浮点）`, `=${c1.crit}`)
assert(approx(c1.mpRegen, 2.6) && approx(c1.hpRegen, 1.95), `mpRegen +2.6 / hpRegen +1.95`)
assert(approx(c1.lifesteal, 0.104) && approx(c1.cdr, 0.13), `lifesteal +0.104 / cdr +0.13（此前词条从未被应用）`)

em._removeStats(c1, fakeEq)
assert(approx(c1.atk, 100) && approx(c1.matk, 30) && approx(c1.def, 50), 'remove 后整数词条归位')
assert(approx(c1.maxHp, 1000) && approx(c1.maxMp, 200) && approx(c1.spd, 10), 'remove 后 maxHp/maxMp/spd 归位')
assert(approx(c1.crit, 0.05) && approx(c1.mpRegen, 0) && approx(c1.hpRegen, 0), 'remove 后 crit/mpRegen/hpRegen 归位')
assert(approx(c1.lifesteal, 0) && approx(c1.cdr, 0), 'remove 后 lifesteal/cdr 归位')
assert(snap(c1) === BASE, 'apply→remove 严格对称可逆（全词条快照一致）')

// ============================================================
console.log('\n=== B. 强化 API ===')
em.enhanceLevels = {}
const rusty = EQUIPMENT_CH1['rusty_sword']
assert(em.canEnhance(rusty) === true, 'canEnhance：未强化装备可强化')
assert(em.enhanceCost(rusty) === Math.ceil(rusty.price * 0.4 * 1), `lv0 费用 = ceil(price×0.4) = ${em.enhanceCost(rusty)}`)

const c2 = mkChar()
const r0 = em.enhance(c2, rusty)   // 背包中（未穿戴）：只升级不动属性
assert(r0.ok === true && r0.level === 1 && r0.cost === Math.ceil(rusty.price * 0.4 * 1), `enhance 背包装备：升级成功（费用 ${r0.cost}）`)
assert(em.getEnhanceLevel(rusty.id) === 1, 'getEnhanceLevel=1')
assert(snap(c2) === BASE, '未穿戴时 enhance 不改角色属性')

em.enhanceLevels[EQ_ID] = 3
const c3 = mkChar()
c3.equipment.weapon = fakeEq
em._applyStats(c3, fakeEq)                    // lv3 属性在身（atk 113）
const r1 = em.enhance(c3, fakeEq)             // 穿戴中强化：remove(旧乘数)→升级→apply(新乘数)
assert(r1.ok && em.getEnhanceLevel(EQ_ID) === 4, '穿戴中强化 lv3→lv4')
assert(c3.atk === 100 + Math.round(10 * 1.4), `强化后 atk 重算 = 100+${Math.round(10 * 1.4)}`, `=${c3.atk}`)
assert(approx(c3.matk, 30 + 7) && approx(c3.cdr, 0.14), '强化后 matk/cdr 按新乘数生效')
assert(r1.cost === Math.ceil(200 * 0.4 * 4), `lv3→lv4 费用 = ceil(200×0.4×4) = ${r1.cost}`)

em.enhanceLevels[EQ_ID] = ENHANCE_MAX_LEVEL
assert(em.canEnhance(fakeEq) === false, '+10 满级 canEnhance=false')
const rMax = em.enhance(c3, fakeEq)
assert(rMax.ok === false && /最高/.test(rMax.reason || ''), '满级强化被拒绝')

const em2 = new EquipmentManager()
em.enhanceLevels = { [rusty.id]: 4, x_over: 99, y_neg: -3 }
const saved = em.serialize()
assert(saved.enhanceLevels[rusty.id] === 4, 'serialize 保留强化等级')
em2.init(saved)
assert(em2.getEnhanceLevel(rusty.id) === 4, 'init roundtrip：等级还原')
assert(em2.getEnhanceLevel('x_over') === ENHANCE_MAX_LEVEL && em2.getEnhanceLevel('y_neg') === 0, 'init clamp：99→10 / -3→丢弃')

// ============================================================
console.log('\n=== C. CharacterState.matk 补齐与成长 ===')
const lbData = HEROES.find(h => h.id === 'lixiaobao')
const lb = new CharacterState(lbData)
assert(lb.baseMatk === lbData.matk && lb.matk === lbData.matk, `法师 lv1 matk = ${lbData.matk}（此前字段不存在）`, `=${lb.matk}`)
lb.setTestLevel(5)
const growth = { mage: 0.12 }
assert(lb.matk === Math.floor(lbData.matk * (1 + 0.12 * 4)), `setTestLevel(5) matk 随 atk 成长率 = ${Math.floor(lbData.matk * 1.48)}`, `=${lb.matk}`)
const wData = HEROES.find(h => h.role === 'warrior')
const wb = new CharacterState(wData)
assert((wb.matk || 0) === 0, '战士 matk = 0')

// ============================================================
console.log('\n=== D. _initParty 词条透传 ===')
const fieldSrc = src('scripts/scenes/field-scene.js')
for (const k of ['matk', 'crit', 'mpRegen', 'hpRegen', 'lifesteal', 'cdr']) {
  assert(fieldSrc.includes(`${k}: charState.${k} || 0`), `_initParty 透传 ${k}`)
}

// ============================================================
console.log('\n=== E. 战斗消费端（真实 mixin → 假类） ===')
class FakeFieldScene {}
installFieldBattleSystem(FakeFieldScene)
const ffs = new FakeFieldScene()

// E1 副本回蓝：装备 mpRegen 生效 / 无 mpRegen 不回（用户报告的主 bug）
ffs.areaInfo = { isDungeon: true }
const hMp = { maxMp: 100, mp: 10, mpRegen: 2, hp: 100, maxHp: 100, alive: true }
const hMp0 = { maxMp: 100, mp: 10, hp: 100, maxHp: 100, alive: true }
ffs.battleSystem = { battleHeroes: [{ hero: hMp }, { hero: hMp0 }] }
ffs._regenAllHeroMp(1)
assert(approx(hMp.mp, 11), `副本内 mpRegen=2 → 1s 回 1 点（10→${hMp.mp}）`, `=${hMp.mp}`)
assert(hMp0.mp === 10, '副本内无 mpRegen → 不回蓝（设计约束）')

// E2 野外回蓝：无 mpRegen 走基线 5
const ffs2 = new FakeFieldScene()
ffs2.areaInfo = {}
const hMp2 = { maxMp: 100, mp: 10, hp: 100, maxHp: 100, alive: true }
ffs2.battleSystem = { battleHeroes: [{ hero: hMp2 }] }
ffs2._regenAllHeroMp(1)
assert(approx(hMp2.mp, 12.5), `野外无 mpRegen → 基线 5（10→${hMp2.mp}）`)

// E3 回血：仅装备 hpRegen
const hHp = { maxHp: 1000, hp: 500, hpRegen: 1.5, alive: true }
ffs.battleSystem = { battleHeroes: [{ hero: hHp }] }
ffs._regenAllHeroHp(1)
assert(approx(hHp.hp, 500.75), `hpRegen=1.5 → 1s 回 0.75（500→${hHp.hp}）`)

// E4 CDR 乘区
assert(approx(ffs._heroCdrMult({ cdr: 0.3 }), 0.7), '_heroCdrMult(0.3)=0.7')
assert(ffs._heroCdrMult({ cdr: 2 }) === 0.2, '_heroCdrMult(2)=0.2（下限）')
assert(ffs._heroCdrMult({}) === 1 && ffs._heroCdrMult(null) === 1, '无 cdr → 乘数 1')

// E5 吸血
ffs.battleSystem = { damageTexts: [] }
ffs.cameraX = 0; ffs.cameraY = 0; ffs.dpr = 1
const hLs = { lifesteal: 0.1, hp: 500, maxHp: 1000, alive: true, getPos: () => ({ x: 10, y: 10 }) }
ffs._applyLifesteal(hLs, 100)
assert(hLs.hp === 510, `吸血 10% 伤害 100 → 回 10（500→${hLs.hp}）`)
assert(ffs.battleSystem.damageTexts.length === 1 && ffs.battleSystem.damageTexts[0].text === '+10', '绿色 +10 飘字入队')
const hLs0 = { lifesteal: 0, hp: 500, maxHp: 1000, alive: true }
ffs._applyLifesteal(hLs0, 100)
assert(hLs0.hp === 500, '无吸血词条 → 不回血不飘字')

// ============================================================
console.log('\n=== F. 挂点静态守卫 ===')
const battleSrc = src('scripts/systems/field-battle-system.js')
const cdrCalls = (battleSrc.match(/\* this\._heroCdrMult\(/g) || []).length
assert(cdrCalls === 6, `CDR 乘区调用 6 处（玩家 4 + AI 2），实际 ${cdrCalls}`)
assert(battleSrc.includes('proto._heroCdrMult') && battleSrc.includes('proto._applyLifesteal'), 'helpers 已安装')
assert(battleSrc.includes("(pd.hero && pd.hero.lifesteal)"), 'pendingDamages 结算合并技能吸血+装备吸血')

// 强化入口已从装备面板移除、改由城镇强化器面板承担
const eqPanelSrc = src('scripts/ui/equipment-panel.js')
assert(!eqPanelSrc.includes('_enhanceItem'), 'EquipmentPanel 已移除强化逻辑（改由机器面板）')
const enhSrc = src('scripts/ui/enhance-panel.js')
const enhManagerSrc = src('scripts/managers/equipment-manager.js')
for (const kw of ['_enhanceItem', 'ENHANCE_MATERIAL_COST', "data.set('materials'", 'ENHANCE_MATERIAL_ID']) {
  assert(enhSrc.includes(kw), `EnhancePanel 强化接线（金币+火焰核心）：${kw}`)
}
assert(enhManagerSrc.includes('ENHANCE_MATERIAL_ID') && enhManagerSrc.includes("'flame_core'") && enhManagerSrc.includes('ENHANCE_MATERIAL_COST'), 'equipment-manager 导出材料常量（flame_core）')

// 动态：EnhancePanel 实际扣减金币 + 火焰核心
import { EnhancePanel } from '../scripts/ui/enhance-panel.js'
const matStore = { gold: 1000, materials: { flame_core: 10 } }
const fakeGame2 = {
  controlledHeroId: 'x',
  data: {
    get: k => (k === 'materials' ? matStore.materials : matStore[k]),
    set: (k, v) => { matStore[k] = v },
  },
}
em.enhanceLevels = {}
const panel = new EnhancePanel(fakeGame2)
panel.character = null
const dynItem = { id: 'test_enh_a', name: '动态测试装', type: 'weapon', rarity: 'common', price: 200, stats: {} }
panel.selectedInventoryItem = dynItem
const goldCost = em.enhanceCost(dynItem)
const beforeGold = matStore.gold, beforeMat = matStore.materials.flame_core
panel._enhanceItem()
assert(matStore.gold === beforeGold - goldCost, `强化扣金币（${beforeGold}→${matStore.gold}）`)
assert(matStore.materials.flame_core === beforeMat - 3, `强化扣火焰核心 ×3（${beforeMat}→${matStore.materials.flame_core}）`)
assert(em.getEnhanceLevel('test_enh_a') === 1, '强化等级 +1')

// 材料不足时拒绝
matStore.materials.flame_core = 0
panel.selectedInventoryItem = { id: 'test_enh_b', name: '动态测试装2', type: 'weapon', rarity: 'common', price: 200, stats: {} }
em.enhanceLevels = {}
panel._enhanceItem()
assert(em.getEnhanceLevel('test_enh_b') === 0, '火焰核心不足 → 强化被拒绝')

// ============================================================
console.log(`\n${'='.repeat(46)}\n结果: ${passed} 通过 / ${failed} 失败\n`)
process.exit(failed > 0 ? 1 : 0)
