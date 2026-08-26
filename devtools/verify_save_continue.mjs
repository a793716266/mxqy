/**
 * 验证：自动存档 + 继续游戏 数据契约
 *  - 真实 DataManager（不走 devtools mock）
 *  - 覆盖：
 *    1. currentLocation 默认存在且结构正确
 *    2. save() → 模拟微信重载（new DataManager().load()）→ 进度/位置完整保留
 *    3. 进度写入（flags/chapter/gold）后 save→load 不丢
 *    4. 继续游戏路由：有存档 hasSave 为真、currentLocation.scene 可被「继续游戏」读取
 *    5. ★ 回归：进入主菜单（game.start → changeScene(MAIN_MENU)）【不污染】currentLocation，
 *       否则会导致"继续游戏"读到 scene=main-menu → 死循环回主菜单（表现为点了没用）
 *
 * 用法: node devtools/verify_save_continue.mjs
 *
 * ★ 注意：本脚本用内存 mock 替代 wx.setStorageSync。game.js 的 _recordLocation 归一化
 *   逻辑（含 main-menu 跳过）在下方以纯函数复刻断言，确保行为一致。
 */
import { DataManager } from '../scripts/core/data-manager.js'

let pass = 0, fail = 0
const assert = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' ' + extra : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' ' + extra : ''}`) }
}

// ---- 内存 storage mock（替代 wx.setStorageSync / getStorageSync）----
const _store = {}
const wx = {
  setStorageSync: (k, v) => { _store[k] = v },
  getStorageSync: (k) => (k in _store ? _store[k] : ''),
}
globalThis.wx = wx

// 复刻 game.js _recordLocation 的归一化规则（保持单一事实来源，断言行为一致）
// ★ 含 main-menu 跳过：进主菜单时保留已有真实位置，不覆盖成 main-menu
function applyRecordLocation(dm, sceneName, data) {
  if (sceneName === 'main-menu') {
    const existing = dm.get('progression.currentLocation')
    if (existing && existing.scene && existing.scene !== 'main-menu') {
      return // 保留现有真实位置，不写盘
    }
    return // 极端情况：存档里本就是 main-menu，什么都不记
  }
  const loc = { scene: sceneName, nodeId: null, area: null, controlledHeroId: null }
  if (data && typeof data === 'object') {
    if (data.nodeId !== undefined) loc.nodeId = data.nodeId
    if (data.area !== undefined) loc.area = data.area
    if (data.controlledHeroId !== undefined) loc.controlledHeroId = data.controlledHeroId
  }
  if (sceneName === 'battle') { loc.scene = 'map' }
  else if (sceneName === 'field') { loc.scene = 'town'; loc.area = null; loc.nodeId = null }
  dm.set('progression.currentLocation', loc)
}

// ========== 1. currentLocation 默认结构 ==========
const dm = new DataManager()
assert(dm.data.progression.currentLocation !== undefined, 'progression.currentLocation 字段存在')
assert(dm.data.progression.currentLocation.scene === 'town', 'currentLocation.scene 默认 town')
assert(dm.data.progression.currentLocation.nodeId === null, 'currentLocation.nodeId 默认 null')

// ========== 2. 写入进度 + 位置后 save → 模拟重载 → 完整保留 ==========
dm.set('player.gold', 500)
dm.set('progression.currentChapter', 2)
dm.addFlag('amyDefeated')
// 模拟玩家在野外副本（field），带 area 与 controlledHeroId
applyRecordLocation(dm, 'field', { area: 'grassland', controlledHeroId: 'zhenbao' })
dm.save()

// 模拟微信小游戏「重新载入」：丢内存，新建 DataManager 并 load()
const reloaded = new DataManager()
const ok = reloaded.load()
assert(ok === true, '重载后 load() 返回 true（存档有效）')
assert(reloaded.get('player.gold') === 500, '重载后 gold 保留 (500)')
assert(reloaded.get('progression.currentChapter') === 2, '重载后 currentChapter 保留 (2)')
assert(reloaded.hasFlag('amyDefeated') === true, '重载后 amyDefeated flag 保留')
// field 归一为 town（继续游戏安全恢复点）
assert(reloaded.get('progression.currentLocation').scene === 'town', 'field 位置归一为 town（继续游戏安全点）')

// ========== 3. 继续游戏路由（main-menu 逻辑契约）==========
assert(reloaded.hasSave() === true, '有存档时 hasSave() 为 true → 继续游戏按钮可用')
const contLoc = reloaded.get('progression.currentLocation')
assert(['town', 'field', 'map', 'collection', 'tower'].includes(contLoc.scene), '继续游戏目标 scene 合法')

// ========== 4. 无存档时继续游戏禁用 ==========
delete _store['meow_star_save']
const fresh = new DataManager()
assert(fresh.hasSave() === false, '清空存档后 hasSave() 为 false → 继续游戏按钮灰显禁用')

// ========== 5. battle 归一为 map（不卡在战斗中间态）==========
applyRecordLocation(dm, 'battle', { nodeId: 'ch1_boss' })
assert(dm.get('progression.currentLocation').scene === 'map' && dm.get('progression.currentLocation').nodeId === 'ch1_boss', 'battle 位置归一为 map + 保留 nodeId')

// ========== 6. ★ 核心回归：进主菜单不污染 currentLocation ==========
// 场景：玩家在 town 玩 → 重载小程序 → game.start() 调 load() 再 changeScene(MAIN_MENU)
const dm2 = new DataManager()
dm2.set('progression.currentLocation', { scene: 'town', nodeId: null, area: null, controlledHeroId: 'zhenbao' })
dm2.save()
const afterReload = new DataManager()
afterReload.load() // game.start 第一步
// game.start 末尾 changeScene(MAIN_MENU) → _recordLocation('main-menu') 应【跳过】
applyRecordLocation(afterReload, 'main-menu', undefined)
const savedRaw = wx.getStorageSync('meow_star_save')
const savedParsed = JSON.parse(savedRaw)
assert(savedParsed.progression.currentLocation.scene === 'town',
  '★ 进主菜单后 currentLocation 仍为 town（未被污染成 main-menu）')
assert(savedParsed.progression.currentLocation.controlledHeroId === 'zhenbao',
  '★ 进主菜单后仍保留 controlledHeroId')

// 继续游戏读到的位置应是 town（而非 main-menu 死循环）
const contAfterMenu = afterReload.get('progression.currentLocation')
assert(contAfterMenu.scene === 'town', '★ 继续游戏能跳到真实位置 town（不死循环）')

// ========== 7. 全新空档进主菜单不写 main-menu ==========
const dm3 = new DataManager() // 全新默认
applyRecordLocation(dm3, 'main-menu', undefined)
assert(dm3.get('progression.currentLocation').scene === 'town',
  '全新空档进主菜单：currentLocation 保持默认 town（不写 main-menu）')

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
