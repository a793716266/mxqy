/**
 * verify_field_controlled_hero.mjs
 * 真实运行时验证：城镇设置的主操控角色（controlledHeroId）能在进副本后成为被控者。
 *   1) field-scene._initParty 按 controlledHeroId 把预设角色排到 party[0]（被控者 = battleHeroes[0]）
 *   2) town._setControlled 持久化 controlledHeroId 到 game.data
 *   3) town 进副本 changeScene('field', { area, controlledHeroId }) 携带预设
 */
import { FieldScene } from '../scripts/scenes/field-scene.js'
import { TownScene } from '../scripts/scenes/town-scene.js'
import { charStateManager } from '../scripts/data/character-state.js'
import { equipmentManager } from '../scripts/managers/equipment-manager.js'
import { HEROES } from '../scripts/data/heroes.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }

// ---- mock game ----
const mockGame = {
  width: 1500, height: 2668, dpr: 2,
  ctx: { fillRect(){}, fillText(){}, save(){}, restore(){}, beginPath(){}, closePath(){}, fill(){}, stroke(){}, arc(){}, arcTo(){}, moveTo(){}, lineTo(){}, clip(){}, drawImage(){}, measureText(){return {width:0}}, createLinearGradient(){return {addColorStop(){}}}, roundRect(){} },
  assets: { get: () => null },
  audio: { playSFX() {}, stopBGM() {}, playBGM() {} },
  data: { _m: {}, get(k) { return this._m[k] ?? null }, set(k, v) { this._m[k] = v }, delete(k) { delete this._m[k] } },
  showToast() {},
}

// ---- 初始化真实角色状态（臻宝+李小宝默认解锁，再解锁艾米/安妮）→ 全员 4 人 ----
equipmentManager.init(null)
charStateManager.init(null)
for (const id of ['amy', 'annie']) charStateManager.unlockCharacter(id)
const allIds = charStateManager.getAllCharacters().map(c => c.id)
console.log('已解锁角色:', allIds.join(', '))

// =====================================================================
console.log('\nA. field-scene._initParty 按 controlledHeroId 排到 party[0]')
// A1: game.controlledHeroId 路径（town 已挂到 game，进副本未传 data）
{
  const g = { ...mockGame, controlledHeroId: 'amy' }
  const scene = Object.create(FieldScene.prototype)
  scene.game = g
  scene._ctrlHeroId = null
  const party = FieldScene.prototype._initParty.call(scene)
  ok('party[0].id === game.controlledHeroId (amy)', party[0] && party[0].id === 'amy')
  ok('party 仍含全部已解锁角色（无缺漏/重复）',
     party.length === allIds.length && allIds.every(id => party.some(p => p.id === id)))
  ok('amy 在 party 中仅出现一次（无重复单位）', party.filter(p => p.id === 'amy').length === 1)
}
// A2: data._ctrlHeroId 路径（进副本传 data.controlledHeroId，game 未挂）
{
  const g = { ...mockGame, controlledHeroId: null }
  const scene = Object.create(FieldScene.prototype)
  scene.game = g
  scene._ctrlHeroId = 'annie'
  const party = FieldScene.prototype._initParty.call(scene)
  ok('party[0].id === _ctrlHeroId (annie)', party[0] && party[0].id === 'annie')
  ok('其余角色顺序保持（annie 之前的首位被推后）',
     party[1] && allIds.includes(party[1].id) && party.length === allIds.length)
}
// A3: 无预设 → 保持默认首位（zhenbao），不报错
{
  const g = { ...mockGame, controlledHeroId: null }
  const scene = Object.create(FieldScene.prototype)
  scene.game = g
  scene._ctrlHeroId = null
  const party = FieldScene.prototype._initParty.call(scene)
  ok('无预设时 party[0] 为默认首位', party[0] && party[0].id === allIds[0])
}

// =====================================================================
console.log('\nB. town._setControlled 持久化 controlledHeroId')
{
  const g = { ...mockGame, controlledHeroId: null }
  const scene = Object.create(TownScene.prototype)
  scene.game = g
  scene.dpr = 2; scene.width = 1500; scene.height = 2668
  scene.party = charStateManager.getAllCharacters()
  scene.controlledHeroId = 'zhenbao'
  scene._setControlled('amy')
  ok('scene.controlledHeroId 已更新为 amy', scene.controlledHeroId === 'amy')
  ok('game.controlledHeroId 同步更新', g.controlledHeroId === 'amy')
  ok('持久化写入 game.data(controlledHeroId)', g.data.get('controlledHeroId') === 'amy')
}

// =====================================================================
console.log('\nC. town 进副本 changeScene 携带 controlledHeroId')
{
  let lastChange = null
  const g = { ...mockGame, controlledHeroId: 'amy', changeScene: (name, data) => { lastChange = { name, data } } }
  const scene = Object.create(TownScene.prototype)
  scene.game = g
  scene.dpr = 2; scene.width = 1500; scene.height = 2668
  scene.party = charStateManager.getAllCharacters()
  scene.controlledHeroId = 'amy'
  // 构造一个与 _handleExploreMenuTap 坐标公式一致的 exploreMenu
  const menuW = 1000, menuH = 1000
  const menuX = (scene.width - menuW) / 2
  const menuY = (scene.height - menuH) / 2
  scene.exploreMenu = {
    width: menuW, height: menuH,
    dungeons: [
      { name: '阳光草原', area: 'grassland', unlocked: true },
      { name: '塔', area: 'tower', unlocked: true },
    ],
  }
  const btnW = menuW - 40 * 2
  const btnH = 60 * 2
  const startY = menuY + 76 * 2
  const btnX = menuX + 20 * 2
  const btnY = startY + 0 * (btnH + 10 * 2)
  // 点击第一张副本按钮中心（_handleExploreMenuTap 约定传数字坐标 x, y）
  scene._handleExploreMenuTap(btnX + btnW / 2, btnY + btnH / 2)
  ok('changeScene 被调用且目标为 field', lastChange && lastChange.name === 'field')
  ok('changeScene data 携带 controlledHeroId === amy', lastChange && lastChange.data && lastChange.data.controlledHeroId === 'amy')
  ok('changeScene data 携带 area === grassland', lastChange && lastChange.data && lastChange.data.area === 'grassland')
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
