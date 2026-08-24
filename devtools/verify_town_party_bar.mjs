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
  const ops = { rects: [], texts: [], paths: 0, fills: [], strokes: [] }
  const ctx = {
    ops,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    save() {}, restore() {},
    fillRect(x, y, w, h) { ops.rects.push({ x, y, w, h, fill: this.fillStyle }) },
    strokeRect() {},
    beginPath() { ops.paths++ }, closePath() {},
    fill() { ops.fills.push({ fill: this.fillStyle }) },
    stroke() { ops.strokes.push({ stroke: this.strokeStyle }) },
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
scene._partyExpandBounds = null
scene._expandedHeroId = null
scene.controlledHeroId = (scene.party[0] && scene.party[0].id) || 'zhenbao'
scene._debugCoords = { x: 0, y: 0, show: false, tapWorldX: 0, tapWorldY: 0 }
scene.testLogs = []
scene.isDev = false

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
ok('卡片高度统一 (46 dpr)', scene._partyBarBounds.every(c => c.height === 46 * scene.dpr))
ok('卡片宽度自适应合理 (30~80 dpr)', scene._partyBarBounds.every(c => c.width >= 30 * scene.dpr && c.width <= 80 * scene.dpr))
// 整体不溢出屏幕右侧
const last = scene._partyBarBounds[scene._partyBarBounds.length - 1]
ok('队伍条整体不溢出屏幕', last.x + last.width <= scene.width - 8 * scene.dpr)

console.log('B. 点击已解锁成员 → 切换控制者并展开迷你卡（不直接开完整面板）')
const mHero = scene._partyBarBounds.find(b => b.char.id === 'amy')
const opened = scene._handlePartyBarTap({ x: mHero.x + mHero.width / 2, y: mHero.y + mHero.height / 2 })
ok('_handlePartyBarTap 命中返回 true', opened === true)
ok('点击后展开 amy 迷你卡', scene._expandedHeroId === 'amy')
ok('点击后 amy 成为控制者', scene.controlledHeroId === 'amy')
ok('详情面板仍隐藏（需点「查看详情」按钮才开）', scene.charInfoPanel.visible === false)

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

console.log('H. 探索区域菜单：开发测试按钮仅 dev 可见（生产包应隐藏）')
// 生产模式（mockGame.isDev === false）：不画测试按钮
mockGame.isDev = false
scene.exploreMenu = {
  width: 600, height: 700, dungeons: [
    { id: 'grassland', name: '阳光草原', desc: 'cleared', unlocked: true, color: '#27ae60' },
    { id: 'magic_tower', name: '魔法塔', desc: 'locked', unlocked: false, color: '#3498db' },
  ],
}
const ctxProd = makeCtx()
scene._renderExploreMenu(ctxProd)
const hasDevBtnProd = ctxProd.ops.texts.some(o => o.t.includes('测试') && o.t.includes('解锁'))
ok('生产模式不画"测试：解锁所有副本"按钮', hasDevBtnProd === false)
// 生产模式点击区域不会触发测试逻辑（测试开关不可达 → "决战虚无之雾"卡片完全可点）
const tapBottom = scene._handleExploreMenuTap(100, scene.height - 100)
scene.exploreMenu = { width: 600, height: 700, dungeons: [
    { id: 'grassland', name: '阳光草原', desc: 'cleared', unlocked: true, color: '#27ae60' },
    { id: 'magic_tower', name: '魔法塔', desc: 'locked', unlocked: false, color: '#3498db' },
] }
scene._handleExploreMenuTap(100, scene.height - 100) // 不应触发任何 state 变化（testUnlockAll 不会写入）
ok('生产模式点击底部不写入 testUnlockAll', !mockGame.data.get('testUnlockAll'))
scene.exploreMenu = null
// 开发模式（mockGame.isDev === true）：绘制测试按钮
mockGame.isDev = true
const ctxDev = makeCtx()
scene.exploreMenu = { width: 600, height: 700, dungeons: [
    { id: 'grassland', name: '阳光草原', desc: 'cleared', unlocked: true, color: '#27ae60' },
    { id: 'magic_tower', name: '魔法塔', desc: 'locked', unlocked: false, color: '#3498db' },
] }
scene._renderExploreMenu(ctxDev)
const hasDevBtnDev = ctxDev.ops.texts.some(o => o.t.includes('测试') && o.t.includes('解锁'))
ok('开发模式画"测试：解锁所有副本"按钮', hasDevBtnDev === true)
// 开发模式点击测试按钮区域：amyDefeated 被写入 + exploreMenu 重开
const menuW = 600, menuH = 700
const menuX = (scene.width - menuW) / 2
const menuY = (scene.height - menuH) / 2
const devX = menuX + 40 * scene.dpr // 按钮中心
const devY = menuY + menuH - 50 * scene.dpr + 17 * scene.dpr
scene._handleExploreMenuTap(devX, devY)
ok('开发模式点测试按钮写入 amyDefeated', !!mockGame.data.get('amyDefeated'))
ok('开发模式点测试按钮后 exploreMenu 重开', !!scene.exploreMenu)
scene.exploreMenu = null
mockGame.isDev = false

console.log('I. game.js _sceneHasBlockingModal：任何全屏模态打开都让位背包按钮')
// 直接复用 game.js 的 helper（无需构造 Game，只需 mock 一个 currentScene）
const gameProto = (await import('../scripts/game.js')).Game.prototype
function hasModal(sceneObj) {
  // 反射调用 game 私有方法：在原型上调用并注入 currentScene
  return gameProto._sceneHasBlockingModal.call({ currentScene: sceneObj })
}
// 全部关闭 → 让背包按钮可见
ok('空场景 → 让位（背包可显）', hasModal({ charInfoPanel: { visible: false }, equipmentPanel: { active: false } }) === false)
// 探索菜单打开 → 压住背包
ok('exploreMenu 打开 → 压住背包', hasModal({ exploreMenu: { dungeons: [] }, charInfoPanel: { visible: false }, equipmentPanel: { active: false } }) === true)
// 装备面板打开 → 压住背包
ok('equipmentPanel.active=true → 压住背包', hasModal({ charInfoPanel: { visible: false }, equipmentPanel: { active: true } }) === true)
// 角色详情面板打开 → 压住背包
ok('charInfoPanel.visible=true → 压住背包', hasModal({ charInfoPanel: { visible: true }, equipmentPanel: { active: false } }) === true)
// 副本开场独白 → 压住背包
ok('dungeonIntroDialogue 存在 → 压住背包', hasModal({ dungeonIntroDialogue: { name: '艾米' }, charInfoPanel: { visible: false }, equipmentPanel: { active: false } }) === true)
// 副本通关独白 → 压住背包
ok('dungeonClearedDialogue 存在 → 压住背包', hasModal({ dungeonClearedDialogue: { name: '艾米' }, charInfoPanel: { visible: false }, equipmentPanel: { active: false } }) === true)
// 仅战斗进行中（战斗不是模态）→ 背包仍可显
ok('仅 battleSystem.active（战斗非模态） → 背包仍可显', hasModal({ battleSystem: { active: true }, charInfoPanel: { visible: false }, equipmentPanel: { active: false } }) === false)

console.log('J. 紧凑队伍卡：全员 6 槽 + 高度收敛 + 含 HP/MP/经验状态')
// 渲染前需复位展开态，避免影响
scene._expandedHeroId = null
const ctxJ = makeCtx()
scene._renderPartyBar(ctxJ)
ok('队伍卡渲染出 6 个热区(全量 HEROES)', scene._partyBarBounds.length === 6)
const cardH = scene._partyBarBounds[0].height / scene.dpr
ok('单卡高度收敛 ≤50dpr（旧为 52，现 46）', cardH <= 50)
ok('构造时默认控制者已设置', !!scene.controlledHeroId)
ok('控制者挂到 game 供副本复用', mockGame.controlledHeroId === scene.controlledHeroId)
// 已解锁卡数量应与已解锁英雄一致（测试已解锁 zhenbao/lixiaobao/amy/annie = 4）
const unlockedCount = scene._partyBarBounds.filter(b => b.char && !b.char._locked).length
ok('已解锁卡 = 4（其余 2 为 ? 占位）', unlockedCount === 4)

console.log('K. 点击已解锁卡 → 切换控制者并展开；再点同卡收起')
const amyCard = scene._partyBarBounds.find(b => b.char && b.char.id === 'amy')
ok('存在 amy 卡', !!amyCard)
const tapAmy = { x: amyCard.x + amyCard.width / 2, y: amyCard.y + amyCard.height / 2 }
const hit1 = scene._handlePartyBarTap(tapAmy)
ok('点击 amy 卡命中返回 true', hit1 === true)
ok('点击后展开 amy 迷你卡', scene._expandedHeroId === 'amy')
ok('点击后 amy 成为控制者', scene.controlledHeroId === 'amy')
ok('控制者同步到 game', mockGame.controlledHeroId === 'amy')
const hitSame = scene._handlePartyBarTap(tapAmy)
ok('再点同卡命中返回 true', hitSame === true)
ok('再点同卡收起迷你卡', scene._expandedHeroId === null)
ok('收起后控制者保持为 amy', scene.controlledHeroId === 'amy')
// 点未解锁卡 → 不展开，仅提示
const lockedCard = scene._partyBarBounds.find(b => b.char && b.char._locked)
const hitLocked = scene._handlePartyBarTap({ x: lockedCard.x + lockedCard.width / 2, y: lockedCard.y + lockedCard.height / 2 })
ok('点未解锁卡命中返回 true（提示）', hitLocked === true)
ok('点未解锁卡不展开迷你卡', scene._expandedHeroId === null)

console.log('L. 迷你详情卡：详情按钮开完整面板 / 点卡片外收起')
scene._expandedHeroId = 'amy'
const ctxL = makeCtx()
scene._renderPartyExpandCard(ctxL)
ok('展开卡渲染出 bounds', !!scene._partyExpandBounds)
ok('bounds 含 detailBtn', !!(scene._partyExpandBounds && scene._partyExpandBounds.detailBtn))
const db = scene._partyExpandBounds.detailBtn
scene.charInfoPanel.hide()
const hitDetail = scene._handlePartyExpandTap({ x: db.x + db.width / 2, y: db.y + db.height / 2 })
ok('点详情按钮命中返回 true', hitDetail === true)
ok('点详情按钮打开完整角色面板', scene.charInfoPanel.visible === true)
ok('面板的角色为 amy', scene.charInfoPanel.character && scene.charInfoPanel.character.id === 'amy')
// 复位后：点卡片外 → 收起
scene.charInfoPanel.hide()
scene._expandedHeroId = 'amy'
scene._renderPartyExpandCard(makeCtx())
const bL = scene._partyExpandBounds
const hitOutside = scene._handlePartyExpandTap({ x: 5, y: 5 })
ok('点卡片外命中返回 true（收起）', hitOutside === true)
ok('点卡片外后收起迷你卡', scene._expandedHeroId === null)
ok('bounds 内点击不收起（返回 false）', scene._handlePartyExpandTap({ x: bL.x + bL.width / 2, y: bL.y + bL.height / 2 }) === false)

console.log('M. 详情面板高度自适应：状态/HP/MP/BUFF 必须落在面板内，不再溢出')
{
  const p = new CharacterInfoPanel(mockGame, charStateManager.getCharacter('zhenbao'))
  p.show()
  const ctxM = makeCtx()
  p.ctx = ctxM  // 替换为记录型 ctx 看绘制坐标
  const beforeB = p.renderDetailPanel()
  // 无 BUFF 时状态 + HP + MP 三行文字必然绘制
  // ★ HP/MP 现在改为「❤️ HP 标签 + 数值右浮」双行绘制，原 ❤️ HP: ... 合并串已拆
  const statusText = ctxM.ops.texts.find(o => o.t === '状态')
  const hpLabel = ctxM.ops.texts.find(o => o.t === '❤️ HP')
  const hpValue = ctxM.ops.texts.find(o => o.t && /^\d+ \/ \d+$/.test(o.t))
  ok('详情面板有"状态"标题', !!statusText)
  ok('详情面板有 HP 文字（标签或数值）', !!(hpLabel || hpValue))
  ok('详情面板有 HP 数值（"hp / maxHp" 格式）', !!hpValue)
  if (statusText && hpLabel && hpValue && beforeB) {
    const bottom = hpValue.y + 30 * p.dpr   // 数值 baseline + 30 dpr 涵盖字号与行尾
    const panelBottom = beforeB.y + beforeB.height
    ok('状态/HP/MP 节完整落在面板内 (bottom≤面板底)',
       bottom <= panelBottom + 0.01)
    ok('面板高度已撑开 (>540 dpr 旧固定值)', beforeB.height > 540 * p.dpr)
  }
  // 加 BUFF 再渲染：高度应进一步扩展，BUFF 文字也必须落在面板内
  const charBuf = charStateManager.getCharacter('zhenbao')
  charBuf._buffs = [
    { _active: true, _remaining: 5, _color: 'rgba(255,215,0,0.9)', type: 'atk_up_self' },
    { _active: true, _remaining: 5, _color: 'rgba(80,200,255,0.9)', type: 'def_up_self' },
  ]
  const ctxM2 = makeCtx()
  p.ctx = ctxM2
  const beforeB2 = p.renderDetailPanel()
  const buffText = ctxM2.ops.texts.find(o => o.t && o.t.includes('狂暴攻击'))
  ok('BUFF 激活时绘制「狂暴攻击」条目', !!buffText)
  if (buffText && beforeB2) {
    ok('BUFF 节落在加 BUFF 后的面板内', buffText.y + 30 * p.dpr <= beforeB2.y + beforeB2.height + 0.01)
    ok('加 BUFF 后面板高度 ≥ 无 BUFF 时', beforeB2.height >= beforeB.height)
  } else {
    ok('BUFF 节落在加 BUFF 后的面板内', false)
    ok('加 BUFF 后面板高度 ≥ 无 BUFF 时', false)
  }
  // 清理
  charBuf._buffs = []
  p.ctx = mockCtx
}

console.log('M2. 状态区可视化：HP/MP 迷你条 + 数字右浮，告别「纯文字三行贴底」')
{
  const p = new CharacterInfoPanel(mockGame, charStateManager.getCharacter('zhenbao'))
  p.show()
  const ctxM = makeCtx()
  p.ctx = ctxM
  const bnd = p.renderDetailPanel()
  // HP 行 = ❤️ HP 标签 + "hp / maxHp" 数字（数值随 heroes.js 平衡数据走，用正则匹配避免硬编码）
  const hpLabel = ctxM.ops.texts.find(o => o.t === '❤️ HP')
  const hpValue = ctxM.ops.texts.find(o => /^\d+ \/ \d+$/.test(o.t))
  ok('HP 行有 ❤️ HP 标签', !!hpLabel)
  ok('HP 行有数值文字', !!hpValue)
  // 数字应右浮（align=right）— x 接近面板右边
  if (hpValue && bnd) {
    const panelRight = bnd.x + bnd.width - 20 * p.dpr
    ok('HP 数值右浮（接近面板右边）', Math.abs(hpValue.x - panelRight) < 5 * p.dpr)
  }
  // MP 行 = 💙 MP 标签 + 数值
  const mpLabel = ctxM.ops.texts.find(o => o.t === '💙 MP')
  ok('MP 行有 💙 MP 标签', !!mpLabel)
  // 至少应有 2 个非背景色 fill 构成血条槽+填充（绘制于 HP 行内 y 坐标附近）
  // 注：HP/MP 用 roundRect + fill()，fillStyle 在槽底（黑色）和进度填充（绿色/橙色/红色/蓝/紫）之间切换
  const hpRowFills = ctxM.ops.fills.filter(f =>
    f.fill === 'rgba(0, 0, 0, 0.55)' ||
    /^#(4caf50|ff9800|f44336|6c8eff|9b7bff|ff77aa)$/i.test(f.fill)
  )
  ok('HP/MP 行存在迷你条 fill（槽底 + 进度填充）', hpRowFills.length >= 2)
  // HP 行应包含扣血追赶动画的 fillColor = 'rgba(255,255,255,0.85)' 或满血时不存在
  // 状态/HP/MP 与 BUFF 行间距合理：状态末 ≤ 面板底
  if (hpValue && bnd) {
    const panelBottom = bnd.y + bnd.height
    ok('HP 行落在面板内', hpValue.y + 30 * p.dpr <= panelBottom + 0.01)
  }
}

console.log('N. ★ z-order 叠层防护：详情面板打开时，展开迷你卡必须自动收起，避免盖住「属性」标题')
{
  // 场景 1：详情面板与迷你卡同时"持有"时，渲染端必须自动收起迷你卡
  scene._expandedHeroId = 'amy'
  scene.charInfoPanel.show()
  scene.charInfoPanel.setCharacter(charStateManager.getCharacter('amy'))
  const ctxN1 = makeCtx()
  scene._renderPartyExpandCard(ctxN1)
  ok('详情面板打开时迷你卡不渲染（自动收起）', scene._partyExpandBounds === null)
  ok('详情面板打开时 _expandedHeroId 被清空', scene._expandedHeroId === null)

  // 场景 2：模拟用户点击迷你卡「查看详情」按钮 → 打开详情面板，_expandedHeroId 必须随之清空
  scene.charInfoPanel.hide()
  scene._expandedHeroId = 'amy'
  scene._renderPartyExpandCard(makeCtx())
  const bN2 = scene._partyExpandBounds
  ok('点击查看详情前 bounds 已就绪', !!bN2 && !!bN2.detailBtn)
  const dbN2 = bN2.detailBtn
  const hitN2 = scene._handlePartyExpandTap({ x: dbN2.x + dbN2.width / 2, y: dbN2.y + dbN2.height / 2 })
  ok('点击查看详情按钮命中', hitN2 === true)
  ok('点击查看详情后详情面板打开', scene.charInfoPanel.visible === true)
  ok('点击查看详情后迷你卡同步收起（避免叠层）', scene._expandedHeroId === null)

  // 场景 3：关闭详情面板后，迷你卡渲染应恢复
  scene.charInfoPanel.hide()
  scene._expandedHeroId = 'amy'
  const ctxN3 = makeCtx()
  scene._renderPartyExpandCard(ctxN3)
  ok('详情面板关闭后迷你卡恢复渲染', scene._partyExpandBounds !== null)
}

console.log('N2. ★ 详情面板主背景必须完全不透明（1.0），避免下方迷你卡半透穿透')
{
  const p = new CharacterInfoPanel(mockGame, charStateManager.getCharacter('zhenbao'))
  p.show()
  const ctxN2 = makeCtx()
  p.ctx = ctxN2
  p.renderDetailPanel()
  // 主面板背景 fill：fillStyle === 'rgba(20, 30, 50, 1.0)'（实心深色 1.0 不透明）
  const mainBg = ctxN2.ops.fills.find(f => /^rgba\(20,\s*30,\s*50,\s*1(?:\.0+)?\)$/.test(f.fill))
  ok('主面板背景 fillStyle = rgba(20,30,50,1.0) 完全不透明', !!mainBg)
  // 兜底：再确认不存在 0.95 半透明的 fill（半透会让下方迷你卡穿透显示）
  const halfOpacity = ctxN2.ops.fills.find(f => /^rgba\(20,\s*30,\s*50,\s*0\.95\)$/.test(f.fill))
  ok('主面板背景不再使用 0.95 半透明（旧值会透出迷你卡）', !halfOpacity)
  p.ctx = mockCtx
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
