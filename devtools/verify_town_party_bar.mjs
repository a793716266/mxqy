/**
 * verify_town_party_bar.mjs
 * 真实运行时验证：城镇队伍状态条（全员 6 槽，含未解锁占位）+ 角色详情面板接入。
 * 直接加载 TownScene / CharacterInfoPanel 真实类（不触发重型构造，用 Object.create 取原型方法）。
 */
import { TownScene } from '../scripts/scenes/town-scene.js'
import { CharacterInfoPanel } from '../scripts/ui/character-info-panel.js'
import { charStateManager } from '../scripts/data/character-state.js'
import { equipmentManager } from '../scripts/managers/equipment-manager.js'
import { HEROES } from '../scripts/data/heroes.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }

// ---- 记录型 2D ctx（提供 canvas-utils.roundRect 所需的路径方法）----
function makeCtx() {
  const ops = { rects: [], texts: [], paths: 0 }
  const ctx = {
    ops,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    save() {}, restore() {},
    fillRect(x, y, w, h) { ops.rects.push({ x, y, w, h, fill: this.fillStyle }) },
    strokeRect() {},
    beginPath() { ops.paths++ }, closePath() {}, fill() {}, stroke() {},
    arc() {}, arcTo() {}, moveTo() {}, lineTo() {}, clip() {},
    drawImage() {},
    fillText(t, x, y) { ops.texts.push({ t, x, y, fill: this.fillStyle }) },
    measureText(t) { return { width: (t ? String(t).length : 0) * 8 } },
    createLinearGradient() { return { addColorStop() {} } },
  }
  return ctx
}

// ---- mock game（物理像素 width=1500, dpr=2）----
let toastCalled = false
const mockCtx = makeCtx()
const mockGame = {
  width: 1500, height: 2668, dpr: 2,
  ctx: mockCtx,
  assets: { get: () => null }, // 走 emoji 默认头像
  audio: { playSFX() {}, playBGM() {} },
  data: { _m: {}, get(k) { return this._m[k] ?? null }, set(k, v) { this._m[k] = v }, delete(k) { delete this._m[k] } },
  showToast() { toastCalled = true },
  input: { taps: [], scrollY: 0 },
}

// ---- 初始化真实角色状态（臻宝+李小宝默认解锁，再解锁艾米/安妮）----
equipmentManager.init(null)
charStateManager.init(null)
for (const id of ['amy', 'annie']) charStateManager.unlockCharacter(id)
const UNLOCKED = ['zhenbao', 'lixiaobao', 'amy', 'annie']
const LOCKED = HEROES.map(h => h.id).filter(id => !UNLOCKED.includes(id))

const scene = Object.create(TownScene.prototype)
scene.game = mockGame
scene.dpr = mockGame.dpr
scene.width = mockGame.width
scene.height = mockGame.height
scene.party = charStateManager.getAllCharacters()
scene.charInfoPanel = new CharacterInfoPanel(mockGame, charStateManager.getCharacter('zhenbao'))
scene._partyBarBounds = []
scene._charInfoBounds = null
scene._debugCoords = { x: 0, y: 0, show: false, tapWorldX: 0, tapWorldY: 0 }

console.log('A. 队伍状态条渲染（全员 6 槽）')
const ctx = makeCtx()
scene._renderPartyBar(ctx)
ok('记录 ' + scene._partyBarBounds.length + ' 个成员热区', scene._partyBarBounds.length === HEROES.length)
ok('热区数量等于 HEROES 全量阵容', scene._partyBarBounds.length === HEROES.length)
ok('已解锁槽位数正确 (' + UNLOCKED.length + ')', scene._partyBarBounds.filter(b => !b.char._locked).length === UNLOCKED.length)
ok('未解锁占位槽位数正确 (' + LOCKED.length + ')', scene._partyBarBounds.filter(b => b.char._locked).length === LOCKED.length)
// 不重叠且横向递增
let monotonic = true
for (let i = 1; i < scene._partyBarBounds.length; i++) {
  const a = scene._partyBarBounds[i - 1], b = scene._partyBarBounds[i]
  if (b.x <= a.x) monotonic = false
  if (b.x < a.x + a.width) monotonic = false
}
ok('热区横向递增且不重叠', monotonic)
// 新设计：队伍条位于安全区下方第二行（避开 iOS 状态栏 / 刘海）
const safeTop = scene._getSafeTop()
ok('热区位在安全区下方（非贴顶）', scene._partyBarBounds.every(c => c.y >= safeTop + 40 * scene.dpr))
// 自适应卡宽：全员一排、宽屏不浪费、窄屏不溢出
ok('卡片高度统一 (52 dpr)', scene._partyBarBounds.every(c => c.height === 52 * scene.dpr))
ok('卡片宽度自适应合理 (30~64 dpr)', scene._partyBarBounds.every(c => c.width >= 30 * scene.dpr && c.width <= 64 * scene.dpr))
// 整体不溢出屏幕右侧
const last = scene._partyBarBounds[scene._partyBarBounds.length - 1]
ok('队伍条整体不溢出屏幕', last.x + last.width <= scene.width - 8 * scene.dpr)

console.log('B. 点击已解锁成员打开详情')
const mHero = scene._partyBarBounds.find(b => b.char.id === 'amy')
const opened = scene._handlePartyBarTap({ x: mHero.x + mHero.width / 2, y: mHero.y + mHero.height / 2 })
ok('_handlePartyBarTap 命中返回 true', opened === true)
ok('详情面板可见', scene.charInfoPanel.visible === true)
ok('详情角色切换到被点成员', scene.charInfoPanel.character && scene.charInfoPanel.character.id === 'amy')

console.log('B2. 点击未解锁占位 → 提示不打开')
scene.charInfoPanel.hide()
toastCalled = false
const lockedHero = scene._partyBarBounds.find(b => b.char._locked)
const r2 = scene._handlePartyBarTap({ x: lockedHero.x + lockedHero.width / 2, y: lockedHero.y + lockedHero.height / 2 })
ok('未解锁占位点击返回 true（消费点击）', r2 === true)
ok('未解锁占位不打开详情', scene.charInfoPanel.visible === false)
ok('未解锁占位触发 toast 提示', toastCalled === true)

console.log('C. 详情面板渲染并返回 bounds')
scene.charInfoPanel.show() // B2 已隐藏，渲染前需重新显示
const b = scene.charInfoPanel.renderDetailPanel()
scene._charInfoBounds = b // 真实运行时 render() 每帧都会同步此值
ok('renderDetailPanel 返回 bounds', !!b && typeof b.x === 'number')
ok('bounds 含关闭按钮', !!(b && b.closeBtn))
ok('bounds 含装备槽', !!(b && b.slots && b.slots.length > 0))

console.log('D. 点击关闭✕关闭面板')
const cb = b.closeBtn
scene._handleCharInfoTap({ x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 })
ok('点击✕后面板隐藏', scene.charInfoPanel.visible === false)

console.log('E. 点击卸下按钮卸下装备并持久化')
const zhenbao = charStateManager.getCharacter('zhenbao')
zhenbao.equipment = zhenbao.equipment || {}
zhenbao.equipment.weapon = { id: 'w_test', name: '测试剑', rarity: 'common' } // 预置一件已装备武器
scene.charInfoPanel.setCharacter(zhenbao)
scene.charInfoPanel.show()
const b2 = scene.charInfoPanel.renderDetailPanel()
scene._charInfoBounds = b2 // 同步（真实 render 每帧更新）
const slot = b2.slots.find(s => s.unequipBtn)
ok('臻宝有可卸下装备槽', !!slot)
if (slot) {
  const beforeEq = zhenbao.equipment.weapon
  scene._handleCharInfoTap({ x: slot.unequipBtn.x + slot.unequipBtn.width / 2, y: slot.unequipBtn.y + slot.unequipBtn.height / 2 })
  ok('卸下前存在 weapon 装备', !!beforeEq)
  ok('卸下后 weapon 移除', !zhenbao.equipment.weapon)
}
ok('装备数据已持久化到 data', !!mockGame.data.get('equipmentData'))

console.log('F. 点击面板外遮罩关闭')
scene.charInfoPanel.show()
const b3 = scene.charInfoPanel.renderDetailPanel()
scene._charInfoBounds = b3
scene._handleCharInfoTap({ x: 5, y: 5 }) // 左上角遮罩
ok('点击遮罩外关闭面板', scene.charInfoPanel.visible === false)

console.log('G. 点击非热区不打开（队伍条外）')
scene.charInfoPanel.hide()
const outside = scene._handlePartyBarTap({ x: 5, y: 5 })
ok('点击队伍条外返回 false', outside === false)
ok('面板仍隐藏', scene.charInfoPanel.visible === false)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
