/**
 * 验证：真实 DataManager 的 flag 方法（setFlag / hasFlag / delFlag / addFlag）
 *  - 直接实例化【真实】DataManager（不走 devtools mock），确保真实对象方法齐备。
 *  - 背景：field-scene.js:234 调用 this.game.data.setFlag(...) 触发
 *    "TypeError: _this.game.data.setFlag is not a function"，根因是真实 DataManager
 *    只有 addFlag/hasFlag，缺 setFlag/delFlag；而 30+ 个 devtools mock 都补了 setFlag，
 *    导致测试全绿、真机才爆。本探针用真实对象锁死这个契约。
 * 用法: node devtools/verify_data_manager_flags.mjs
 */
import { DataManager } from '../scripts/core/data-manager.js'

let pass = 0, fail = 0
const assert = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' ' + extra : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' ' + extra : ''}`) }
}

const dm = new DataManager()

// 1. 真实对象方法齐备（直接抓住原始 bug：setFlag/delFlag 必须存在）
assert(typeof dm.setFlag === 'function', '真实 DataManager 具有 setFlag 方法')
assert(typeof dm.delFlag === 'function', '真实 DataManager 具有 delFlag 方法')
assert(typeof dm.hasFlag === 'function', '真实 DataManager 具有 hasFlag 方法')
assert(typeof dm.addFlag === 'function', '真实 DataManager 具有 addFlag 方法')

// 2. setFlag → hasFlag 一致性（写入 progression.flags）
assert(dm.hasFlag('introShown_grassland') === false, '初始 introShown_grassland 未置位')
dm.setFlag('introShown_grassland')
assert(dm.hasFlag('introShown_grassland') === true, 'setFlag 后 hasFlag 为真')
assert(dm.data.progression.flags['introShown_grassland'] === true, 'setFlag 写入 progression.flags[key]=true（持久路径）')

// 3. delFlag 清除
dm.delFlag('introShown_grassland')
assert(dm.hasFlag('introShown_grassland') === false, 'delFlag 后 hasFlag 为假')
assert(!('introShown_grassland' in dm.data.progression.flags), 'delFlag 从 progression.flags 移除 key')

// 4. setFlag 与 addFlag 等价（都是 setFlag 的别名/实作）
dm.addFlag('amyDefeated')
assert(dm.hasFlag('amyDefeated') === true, 'addFlag 置位生效')
dm.setFlag('amyDefeated', false)
assert(dm.hasFlag('amyDefeated') === false, 'setFlag(key,false) 可覆盖为 falsy')
assert(dm.data.progression.flags['amyDefeated'] === false, 'setFlag value 透传写入 progression.flags')

// 5. 自定义 value 透传
dm.setFlag('partyUnlocked', 'anne')
assert(dm.data.progression.flags['partyUnlocked'] === 'anne', 'setFlag 自定义值透传到 progression.flags')

// 6. field-scene.js:234 的真实调用形态不抛异常
let threw = false
try { dm.setFlag('introShown_grassland') } catch (e) { threw = true }
assert(!threw, 'field-scene 调用形态 this.game.data.setFlag(...) 不抛 TypeError')

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
