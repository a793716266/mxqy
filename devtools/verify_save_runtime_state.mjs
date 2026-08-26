/**
 * verify_save_runtime_state.mjs
 * 验证集中式持久化修复：角色/装备的运行时状态在存档前被快照回 this.data，
 * 重启后能恢复（解决 town 场景从不回写导致进度丢失）。
 */
import { DataManager } from '../scripts/core/data-manager.js'
import { charStateManager } from '../scripts/data/character-state.js'
import { equipmentManager } from '../scripts/managers/equipment-manager.js'

// ---- mock wx storage ----
const store = new Map()
globalThis.wx = {
  setStorageSync: (k, v) => store.set(k, v),
  getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
  removeStorageSync: (k) => store.delete(k),
}

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

// 模拟"微信单例在新一次启动时模块重新加载"：重置管理器单例状态
function resetManagers() {
  charStateManager._initialized = false
  charStateManager.characters = new Map()
  equipmentManager._initialized = false
  equipmentManager.unequippedItems = []
}

// ============================================================
console.log('【第 1 步】新玩家首次启动：load 空档 → 进城镇初始化管理器')
// ============================================================
const data1 = new DataManager()
data1.load() // 空档 → 默认数据
const savedChar1 = data1.get('characterStates')
const savedEquip1 = data1.get('equipmentData')

resetManagers()
charStateManager.init(savedChar1)
equipmentManager.init(savedEquip1)
check('初始有 2 个角色(臻宝+李小宝)', charStateManager.getAllCharacters().length >= 2)

// ============================================================
console.log('【第 2 步】玩家在城镇/野外升级 + 获得装备（模拟运行时改动）')
// ============================================================
const zhenbao = charStateManager.getCharacter('zhenbao')
const beforeLevel = zhenbao.level
zhenbao.gainExp(500) // 应升级
const afterLevel = zhenbao.level
check('臻宝获得经验后等级提升', afterLevel > beforeLevel)

// 模拟获得一件装备（如掉落/任务）
equipmentManager.addItem('sunlight_blade')
check('装备进入背包', equipmentManager.getInventory().some(i => i.id === 'sunlight_blade'))

// ============================================================
console.log('【第 3 步】触发集中式存档（changeScene 自动存前会做的事）')
// ============================================================
// ★ 复刻 game.js 修复后的 _syncRuntimeState + save 契约
if (charStateManager._initialized) data1.set('characterStates', charStateManager.serialize())
if (equipmentManager._initialized) data1.set('equipmentData', equipmentManager.serialize())
const saved = data1.save()
check('save() 返回成功', saved === true)

// 校验存档里确实带上了运行时状态（这是之前 town 不回写时会丢失的部分）
const raw = JSON.parse(store.get('meow_star_save'))
check('存档含 characters 数组', Array.isArray(raw.characters) && raw.characters.length >= 2)
const zhenbaoSaved = raw.characters.find(c => c.id === 'zhenbao')
check('存档中臻宝等级=升级后等级', zhenbaoSaved && zhenbaoSaved.level === afterLevel)
check('存档含装备背包', raw.equipment && Array.isArray(raw.equipment.unequippedItems) && raw.equipment.unequippedItems.includes('sunlight_blade'))

// ============================================================
console.log('【第 4 步】玩家关闭小程序并重开（模拟模块重新加载）')
// ============================================================
resetManagers()
const data2 = new DataManager()
const loaded = data2.load()
check('load() 读档成功', loaded === true)
check('hasSave() = true', data2.hasSave() === true)

const savedChar2 = data2.get('characterStates')
const savedEquip2 = data2.get('equipmentData')

resetManagers()
charStateManager.init(savedChar2)
equipmentManager.init(savedEquip2)

const zhenbao2 = charStateManager.getCharacter('zhenbao')
check('【关键】重启后臻宝等级保留(未被重置为1)', zhenbao2 && zhenbao2.level === afterLevel)
check('【关键】重启后装备背包保留', equipmentManager.getInventory().some(i => i.id === 'sunlight_blade'))
check('重启后仍有 2 个角色', charStateManager.getAllCharacters().length >= 2)

// ============================================================
console.log('【第 5 步】对照：若不调用 _syncRuntimeState（旧逻辑），进度会丢')
// ============================================================
const data3 = new DataManager()
data3.load()
resetManagers()
charStateManager.init(data3.get('characterStates'))
equipmentManager.init(data3.get('equipmentData'))
const z3 = charStateManager.getCharacter('zhenbao')
z3.gainExp(999) // 再升一级
// ★ 旧逻辑：直接 save，不回写 characterStates
const savedOld = data3.save()
check('旧逻辑 save 本身不报错', savedOld === true)
// 重启后发现等级没变（因为没回写）
resetManagers()
const data4 = new DataManager()
data4.load()
resetManagers()
charStateManager.init(data4.get('characterStates'))
const z4 = charStateManager.getCharacter('zhenbao')
check('【反例验证】旧逻辑下重启等级回退(证明修复必要)', z4.level === beforeLevel || z4.level < z3.level + 0) // 等级应等于重启前未回写的值

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
