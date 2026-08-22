/**
 * 验证背包系统：BackpackPanel（装备/消耗品/队伍装备/金币）+ Game 全场景接入
 * 用法: node devtools/verify_backpack.mjs
 *
 * 采用真实对象（真实 DataManager / equipmentManager / charStateManager），
 * 避免掩盖真实对象契约（历史教训：mock 自实现 setFlag 掩盖 DataManager 缺方法）。
 */
const canvasCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas') return undefined
    if (p === 'measureText') return (s) => ({ width: String(s).length * 10 })
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => { const img = { width: 64, height: 64 }; setTimeout(() => img.onload && img.onload(), 0); return img },
  getStorageSync: k => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 16),
  onWindowResize: () => {},
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}
import path from 'path'
import { createRequire } from 'module'
const projectRoot = process.cwd()
const scriptsDir = path.resolve(projectRoot, 'scripts')
const nodeRequire = createRequire(path.join(scriptsDir, 'x.js'))
globalThis.require = p => { const abs = p.startsWith('.') ? path.resolve(scriptsDir, p) : p; return nodeRequire(abs) }

// 先加载真实单例（构造顺序与 game.js 一致：DataManager → 面板）
const { DataManager } = await import('../scripts/core/data-manager.js')
const { equipmentManager } = await import('../scripts/managers/equipment-manager.js')
const { charStateManager } = await import('../scripts/data/character-state.js')
const { EQUIPMENT_CH1, RARITY_CONFIG } = await import('../scripts/data/equipment.js')
const { getMaterialDef, MATERIALS } = await import('../scripts/data/materials.js')
const { BackpackPanel } = await import('../scripts/ui/backpack-panel.js')

let passed = 0, failed = 0
const assert = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`) } else { failed++; console.log(`  ✗ ${n}  ${d || ''}`) } }

console.log('\n=== 构建 + 数据准备（真实单例） ===')
const data = DataManager.getInstance()
data.load()
data.set('gold', 12345)
data.set('materials', { healing_herb: 3, slime_gel: 12, __unknown_mat: 1 })

// 模拟 game 对象（真实 data / audio stub）
const fakeGame = {
  ctx: canvasCtx, width: 750 * 3, height: 1334 * 3, dpr: 3,
  data,
  audio: { playSFX: () => {} },
}
const panel = new BackpackPanel(fakeGame)
const dpr = panel.dpr

// ============ A. 基础：开关 + 金币读取 ============
console.log('\n=== A. 面板基础 ===')
assert(panel.visible === false, '初始不可见')
panel.show()
assert(panel.visible === true, 'show() 后可见')
assert(panel.getGold() === 12345, `金币读取 data.gold(${panel.getGold()})`, `=${panel.getGold()}`)
panel.update(0.1)
panel.render(canvasCtx)   // 渲染冒烟（不崩溃即通过）
assert(true, 'render() 冒烟（装备页，空背包）')
panel.hide()
assert(panel.visible === false, 'hide() 后不可见')

// ============ B. 装备页：真实 equipmentManager 数据 ============
console.log('\n=== B. 装备页 ===')
equipmentManager.unequippedItems = []
equipmentManager.addItem('rusty_sword')
equipmentManager.addItem('sunlight_blade')
equipmentManager.addItem('leather_armor')
assert(panel._getEquipList().length === 3, `背包装备列表 = 3（实际 ${panel._getEquipList().length}）`)
panel.show()
// 点第一格 → 详情
const p = panel._panelRect()
const cell0 = { x: p.x + (18 + 35) * dpr, y: p.y + (136 + 35) * dpr }
panel.handleTap(cell0.x, cell0.y)
assert(panel.selectedItem && panel.selectedItem.kind === 'equip', '点击装备格打开详情')
assert(panel.selectedItem && panel.selectedItem.data.id === 'rusty_sword', `详情显示第1件装备（${panel.selectedItem && panel.selectedItem.data.id}）`)
// 详情关闭：点弹窗外
const d0 = panel._detailRect()
panel.handleTap(10, 10)
assert(panel.selectedItem === null, '点击弹窗外关闭详情')
// 渲染冒烟（有装备）
panel.update(0.5)
panel.render(canvasCtx)
assert(true, 'render() 冒烟（装备页，3件装备）')

// ============ C. 消耗品页：素材 + 未知id兜底 ============
console.log('\n=== C. 消耗品页 ===')
const itemTab = panel._tabRects().find(t => t.id === 'item')
panel.handleTap(itemTab.x + 5, itemTab.y + 5)
assert(panel.tab === 'item', '点击页签切换到消耗品')
const mats = panel._getMaterialList()
assert(mats.length === 3, `素材列表 = 3（实际 ${mats.length}）`)
assert(mats.find(m => m.id === 'healing_herb').def.name === '治愈草药', 'healing_herb 名称映射正确')
assert(mats.find(m => m.id === '__unknown_mat').def.name === '__unknown_mat', '未知素材 id 兜底不崩')
assert(mats.find(m => m.id === 'slime_gel').count === 12, '素材数量读取正确')
// 点素材格 → 详情
panel.page = 0
const matCell0 = { x: p.x + (18 + 35) * dpr, y: p.y + (136 + 35) * dpr }
panel.handleTap(matCell0.x, matCell0.y)
assert(panel.selectedItem && panel.selectedItem.kind === 'material', '点击素材格打开详情')
panel.render(canvasCtx)
assert(true, 'render() 冒烟（消耗品详情弹窗）')
panel.handleTap(10, 10)   // 关详情
// 素材定义表完整性：8 个已掉落素材全部有定义
const droppedIds = ['healing_herb', 'slime_gel', 'shadow_dust', 'flame_core', 'aqua_drop', 'violet_petal', 'stray_fang', 'shadow_heart']
assert(droppedIds.every(id => MATERIALS[id] && MATERIALS[id].name), '全部 8 个已掉落素材均有名称定义')

// ============ D. 分页：>16 件装备 ============
console.log('\n=== D. 分页 ===')
equipmentManager.unequippedItems = []
for (const id of ['rusty_sword', 'wooden_staff', 'leather_armor', 'cloth_robe', 'simple_ring', 'lucky_charm',
                  'sharp_blade', 'magic_wand', 'chain_mail', 'magic_robe', 'swift_boots', 'mana_crystal',
                  'flame_sword', 'guardian_armor', 'hero_medal', 'sunlight_blade', 'sunlight_armor']) {
  equipmentManager.addItem(id)
}
const equipTab = panel._tabRects().find(t => t.id === 'equip')
panel.handleTap(equipTab.x + 5, equipTab.y + 5)
assert(panel.tab === 'equip', '切回装备页')
assert(panel._maxPage() === 1, `17 件装备分 2 页（maxPage=${panel._maxPage()}）`)
const pg = panel._pageBtnRects()
assert(!!pg.prev && !!pg.next, '超过 16 件时渲染分页按钮')
assert(panel.page === 0, '当前第 1 页')
panel.handleTap(pg.next.x + 5, pg.next.y + 5)
assert(panel.page === 1, '点击 ▶ 翻到第 2 页')
// 第 2 页第 1 格 = 第 17 件（sunlight_armor）
panel.handleTap(cell0.x, cell0.y)
assert(panel.selectedItem && panel.selectedItem.data.id === 'sunlight_armor', `第2页首格是第17件装备（${panel.selectedItem && panel.selectedItem.data.id}）`)
panel.handleTap(10, 10)
panel.handleTap(pg.prev.x + 5, pg.prev.y + 5)
assert(panel.page === 0, '点击 ◀ 翻回第 1 页')
panel.render(canvasCtx)
assert(true, 'render() 冒烟（分页）')

// ============ E. 队伍装备页：真实 charStateManager ============
console.log('\n=== E. 队伍装备页 ===')
charStateManager.init()   // 真实初始化：臻宝 + 李小宝
const heroes = panel._getHeroes()
assert(heroes.length >= 2, `角色列表 ≥2（实际 ${heroes.length}）`)
const wearTab = panel._tabRects().find(t => t.id === 'wear')
panel.handleTap(wearTab.x + 5, wearTab.y + 5)
assert(panel.tab === 'wear', '切换到队伍装备页')
assert(panel.wearHeroId === heroes[0].id, `默认选中第一个角色（${panel.wearHeroId}）`)
// 给臻宝穿装备（走真实 equipmentManager.equip）
const zhenbao = charStateManager.getCharacter('zhenbao')
equipmentManager.equip(zhenbao, EQUIPMENT_CH1.sunlight_blade)
assert(zhenbao.equipment.weapon && zhenbao.equipment.weapon.id === 'sunlight_blade', '臻宝佩戴阳光之刃')
// 点武器槽 → 详情（含佩戴者）
const slotX = p.x + (170 / 2 + 10) * dpr   // 第一个槽位中心（三槽位起点 x = panelX + 17）
const slotY = p.y + (136 + 106 + 50) * dpr
panel.handleTap(slotX, slotY)
assert(panel.selectedItem && panel.selectedItem.data.id === 'sunlight_blade', '点击武器槽打开装备详情')
assert(panel.selectedItem && panel.selectedItem.wearer === zhenbao.name, `详情标注佩戴者（${panel.selectedItem && panel.selectedItem.wearer}）`)
panel.handleTap(10, 10)
// 切换到第二个角色
const hero2 = heroes[1]
const btnSize = 52
const totalW = heroes.length * btnSize + (heroes.length - 1) * 10
const h2x = p.x + p.w / 2 - totalW / 2 * dpr + (btnSize + 10) * dpr + 26 * dpr
const h2y = p.y + 136 * dpr + 26 * dpr
panel.handleTap(h2x, h2y)
assert(panel.wearHeroId === hero2.id, `点击切换查看角色（${panel.wearHeroId}）`)
panel.render(canvasCtx)
assert(true, 'render() 冒烟（队伍装备页）')

// ============ F. 关闭路径 ============
console.log('\n=== F. 关闭路径 ===')
// 底部关闭按钮
const closeBtn = panel._closeBtnRect()
panel.handleTap(closeBtn.x + 5, closeBtn.y + 5)
assert(panel.visible === false, '底部关闭按钮生效')
// 遮罩关闭
panel.show()
panel.tab = 'equip'
panel.handleTap(5, 5)
assert(panel.visible === false, '点击面板外遮罩关闭')
// ✕ 关闭
panel.show()
const xc = p.x + p.w - 26 * dpr
const yc = p.y + 26 * dpr
panel.handleTap(xc, yc)
assert(panel.visible === false, '点击 ✕ 关闭')

// ============ G. Game 接线（源码断言） ============
console.log('\n=== G. Game 全场景接线 ===')
const fs = nodeRequire('fs')
const gameSrc = fs.readFileSync(path.resolve(projectRoot, 'scripts', 'game.js'), 'utf8')
assert(gameSrc.includes("import { BackpackPanel } from './ui/backpack-panel.js'"), 'game.js 导入 BackpackPanel')
assert(gameSrc.includes('this.backpack = new BackpackPanel(this)'), 'Game 构造器实例化背包面板')
assert(gameSrc.includes('this._handleBackpackInput()'), '主循环分发背包输入')
assert(gameSrc.includes('!this.backpack.visible'), '背包打开期间暂停场景 update')
assert(gameSrc.includes('this.backpack.render(ctx)'), '背包面板最顶层渲染')
assert(gameSrc.includes('_renderBackpackButton'), '全局入口按钮渲染')
// 入口按钮位置：不与主菜单设置按钮(width-70~width-20)重叠
// 入口按钮位置：屏幕右侧中段偏下，按屏幕高度比例自适应
assert(gameSrc.includes('this.width - 60 * this.dpr'), '入口按钮位于屏幕右侧')
assert(gameSrc.includes('this.height * 0.55'), '入口按钮 y 在屏幕 55% 中段偏下（自适应不同分辨率）')

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
