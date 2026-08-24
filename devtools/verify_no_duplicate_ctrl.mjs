/**
 * verify_no_duplicate_ctrl.mjs
 * 真实运行时验证：非臻宝角色作为城镇预设主操控角色进副本时，不会被复制。
 *
 * 复现链路（bug 根因）：
 *   _initFollowers 正确跳过被控者（party[0]），但 _checkNewFollowers 旧实现
 *   `for (let i = 1; ...)` 硬编码跳过 allChars[0]（恒为臻宝）→ 当被控者是 amy 时，
 *   amy 不在 followers（已被 _initFollowers 跳过），却被 _checkNewFollowers 当「新角色」
 *   重新加入 → 复制体。且 mainCharacter 被强制切回 allChars[0]（臻宝）。
 *
 * 验证：
 *   A. 构造期（_initParty + _initFollowers）：被控者 amy → followers 无 amy、party[0]=amy
 *   B. _checkNewFollowers（进副本 init 时调用）：followers 仍无 amy、无任何重复 id、party[0] 保持 amy
 *   C. mainCharacter 保持 party[0]（不被切回臻宝）
 *   D. 对比：臻宝被控时同样无复制（回归原行为）
 *
 * 运行：node --loader ./devtools/_dungeon_enemies_loader.mjs devtools/verify_no_duplicate_ctrl.mjs
 */
import { FieldScene } from '../scripts/scenes/field-scene.js'
import { installFieldBattleSystem } from '../scripts/systems/field-battle-system.js'
import { CharacterSprite } from '../scripts/core/character-sprite.js'
import { charStateManager } from '../scripts/data/character-state.js'
import { equipmentManager } from '../scripts/managers/equipment-manager.js'
import { HEROES } from '../scripts/data/heroes.js'

// ★ 安装实时战斗 mixin（_buildBattleHeroes 等挂在 FieldScene 原型上）
installFieldBattleSystem(FieldScene)

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name, extra) } }

// ---- mock game（与 verify_field_controlled_hero 同款）----
const mockGame = {
  width: 1500, height: 2668, dpr: 2,
  ctx: { fillRect(){}, fillText(){}, save(){}, restore(){}, beginPath(){}, closePath(){}, fill(){}, stroke(){}, arc(){}, arcTo(){}, moveTo(){}, lineTo(){}, clip(){}, drawImage(){}, measureText(){return {width:0}}, createLinearGradient(){return {addColorStop(){}}}, roundRect(){} },
  assets: { get: () => null },
  audio: { playSFX() {}, stopBGM() {}, playBGM() {} },
  data: { _m: {}, get(k) { return this._m[k] ?? null }, set(k, v) { this._m[k] = v }, delete(k) { delete this._m[k] } },
  showToast() {},
}

// ---- 初始化真实角色状态：臻宝+李小宝默认，解锁艾米/安妮/钱多多 → 全员 ----
equipmentManager.init(null)
charStateManager.init(null)
for (const id of ['amy', 'annie', 'qianduoduo']) charStateManager.unlockCharacter(id)
const allIds = charStateManager.getAllCharacters().map(c => c.id)
const allNames = charStateManager.getAllCharacters().map(c => c.name)
console.log('已解锁角色:', allIds.join(', '))

// ---- 构造「构造期」scene：模拟进副本后的 party/followers 初始化 ----
function buildScene(ctrlId) {
  const g = { ...mockGame, controlledHeroId: ctrlId }
  const scene = Object.create(FieldScene.prototype)
  scene.game = g
  scene.dpr = 2
  scene.width = 1500
  scene.height = 2668
  scene.playerX = 1000
  scene.playerY = 1000
  scene.facingLeft = false
  scene.followerDistance = 35 * 2
  scene._ctrlHeroId = ctrlId
  // 构造期链路（与 field-scene 构造一致）
  scene.party = FieldScene.prototype._initParty.call(scene)
  scene.mainCharacter = scene.party[0]
  const heroData = HEROES.find(h => h.id === scene.mainCharacter.id)
  if (heroData) {
    const spriteData = { ...heroData, ...scene.mainCharacter }
    scene.mainCharacterSprite = new CharacterSprite(g, spriteData)
  } else {
    scene.mainCharacterSprite = null
  }
  scene.followers = []
  FieldScene.prototype._initFollowers.call(scene)
  return scene
}

function ids(list) { return list.map(f => f.character ? f.character.id : (f.id || null)) }

function hasDup(list) {
  const seen = new Set()
  for (const id of ids(list)) {
    if (id == null) continue
    if (seen.has(id)) return id
    seen.add(id)
  }
  return null
}

// =====================================================================
console.log('\nA. 被控者=amy（非臻宝）：构造期 party/followers 正确')
{
  const scene = buildScene('amy')
  ok('party[0].id === amy（被控者）', scene.party[0].id === 'amy', `实际=${scene.party[0] && scene.party[0].id}`)
  ok('followers 不含 amy（无复制体）', !ids(scene.followers).includes('amy'), `followers=${ids(scene.followers).join(',')}`)
  ok('followers 含臻宝（臻宝作为普通队友跟随）', ids(scene.followers).includes('zhenbao'), `followers=${ids(scene.followers).join(',')}`)
  ok('followers 无重复 id', !hasDup(scene.followers), `dup=${hasDup(scene.followers)}`)
  ok('party 全员无重复', !hasDup(scene.party), `dup=${hasDup(scene.party)}`)
}

// =====================================================================
console.log('\nB. _checkNewFollowers（进副本 init 时调用）：不把被控者当新角色重复加入')
{
  const scene = buildScene('amy')
  // 模拟 battleSystem（_checkNewFollowers 里会 _buildBattleHeroes）
  scene.battleSystem = { active: true, showBattleUI: true, battleHeroes: [], currentControlIndex: 0, attackButton: null }
  FieldScene.prototype._checkNewFollowers.call(scene)
  ok('_checkNewFollowers 后 followers 仍不含 amy（复制体被修复）', !ids(scene.followers).includes('amy'), `followers=${ids(scene.followers).join(',')}`)
  ok('followers 无重复 id', !hasDup(scene.followers), `dup=${hasDup(scene.followers)}`)
  ok('party[0] 保持 amy（未被切回臻宝）', scene.party[0].id === 'amy', `实际=${scene.party[0] && scene.party[0].id}`)
  ok('mainCharacter 保持 amy（不被强制切回 allChars[0]）', scene.mainCharacter.id === 'amy', `实际=${scene.mainCharacter && scene.mainCharacter.id}`)
}

// =====================================================================
console.log('\nC. 被控者=臻宝（默认）：回归原行为，仍无复制')
{
  const scene = buildScene('zhenbao')
  scene.battleSystem = { active: true, showBattleUI: true, battleHeroes: [], currentControlIndex: 0, attackButton: null }
  FieldScene.prototype._checkNewFollowers.call(scene)
  ok('party[0].id === zhenbao', scene.party[0].id === 'zhenbao')
  ok('followers 不含 zhenbao', !ids(scene.followers).includes('zhenbao'), `followers=${ids(scene.followers).join(',')}`)
  ok('followers 无重复 id', !hasDup(scene.followers), `dup=${hasDup(scene.followers)}`)
  ok('followers 数量 = 全员-1（被控者排除）', scene.followers.length === allIds.length - 1, `followers=${scene.followers.length} 全员=${allIds.length}`)
}

// =====================================================================
console.log('\nD. 被控者=安妮/钱多多（其他角色）同样无复制')
{
  for (const cid of ['annie', 'qianduoduo']) {
    const scene = buildScene(cid)
    scene.battleSystem = { active: true, showBattleUI: true, battleHeroes: [], currentControlIndex: 0, attackButton: null }
    FieldScene.prototype._checkNewFollowers.call(scene)
    ok(`${cid} 主战：followers 不含自身`, !ids(scene.followers).includes(cid), `followers=${ids(scene.followers).join(',')}`)
    ok(`${cid} 主战：followers 无重复`, !hasDup(scene.followers), `dup=${hasDup(scene.followers)}`)
    ok(`${cid} 主战：party[0] 保持 ${cid}`, scene.party[0].id === cid, `实际=${scene.party[0] && scene.party[0].id}`)
    ok(`${cid} 主战：mainCharacter=${cid}`, scene.mainCharacter.id === cid, `实际=${scene.mainCharacter && scene.mainCharacter.id}`)
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
