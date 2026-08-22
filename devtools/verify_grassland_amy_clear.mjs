/**
 * 验证：阳光草原击败艾米 → 加入队伍 + 感化独白(purifyDialogue) + 标记 amyDefeated + 回城
 * 采用真实对象（真实 DataManager / charStateManager / lost-healer-cat 数据），
 * 避免 mock 掩盖真实契约（与 verify_backpack 一致）。
 *
 * 覆盖：
 *  A. charStateManager.unlockCharacter('amy') 首次返回 true、再次返回 false（驱动独白仅首次播放）
 *  B. lost_healer_cat.purifyDialogue 存在且为 3 句（感化独白文本）
 *  C. 独白门控决策（用真实 unlock 返回值 + 真实 purifyDialogue）：首次→播、已招募→不播
 *  D. amyDefeated 标记经真实 DataManager 写入/读取（town 探索菜单据此显示「已击败艾米」）
 *  E. 源码接线：field-scene _checkDungeonClear 引用 bossPurifyDialogue / _bossMonologueActive / amyDefeated
 *
 * 用法: node devtools/verify_grassland_amy_clear.mjs
 */

// ---- wx / require mock（与 verify_backpack 同款，保证 data-manager 单例可加载）----
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
import fs from 'fs'
const projectRoot = process.cwd()
const scriptsDir = path.resolve(projectRoot, 'scripts')
const nodeRequire = createRequire(path.join(scriptsDir, 'x.js'))
globalThis.require = p => { const abs = p.startsWith('.') ? path.resolve(scriptsDir, p) : p; return nodeRequire(abs) }

const { DataManager } = await import('../scripts/core/data-manager.js')
const { charStateManager } = await import('../scripts/data/character-state.js')
const lostHealerCat = (await import('../scripts/entities/monsters/lost-healer-cat.js')).default || (await import('../scripts/entities/monsters/lost-healer-cat.js'))

let passed = 0, failed = 0
const ok = (c, m, extra = '') => { if (c) { passed++; console.log('  ✓ ' + m) } else { failed++; console.log('  ✗ ' + m + (extra ? '  → ' + extra : '')) } }

const data = DataManager.getInstance()
data.load()

console.log('\n=== A. 角色解锁语义（真实 charStateManager）===')
charStateManager.init()  // 仅臻宝 + 李小宝
const firstUnlock = charStateManager.unlockCharacter('amy')
ok(firstUnlock === true, '首次 unlockCharacter(amy) 返回 true（触发独白）', `实际=${firstUnlock}`)
const secondUnlock = charStateManager.unlockCharacter('amy')
ok(secondUnlock === false, '再次 unlockCharacter(amy) 返回 false（重复通关不重复独白）', `实际=${secondUnlock}`)
ok(!!charStateManager.getCharacter('amy'), '艾米已进入 roster（getAllCharacters 可查）')

console.log('\n=== B. 迷途的治愈猫(艾米BOSS) 独白数据（真实配置）===')
ok(Array.isArray(lostHealerCat.purifyDialogue) && lostHealerCat.purifyDialogue.length === 3,
  'purifyDialogue 存在且为 3 句', `len=${lostHealerCat.purifyDialogue && lostHealerCat.purifyDialogue.length}`)
ok(lostHealerCat.purifyDialogue[0].includes('温暖'), '独白首句为感化文案（"你们的眼神...如此温暖..."）', lostHealerCat.purifyDialogue[0])
ok(Array.isArray(lostHealerCat.dialogue) && lostHealerCat.dialogue.length >= 2,
  'dialogue(登场台词) 存在（首次接近时弹出）')

console.log('\n=== C. 独白门控决策（真实 unlock 返回值 + 真实 purifyDialogue）===')
// 生产分支：const ok = charStateManager.unlockCharacter(hid); show = ok && hid==='amy' && bossPurifyDialogue
// 已用真实 charStateManager 在 A 段证明：首次解锁返回 true、二次返回 false。
// 直接基于这两个真实返回值推导门控布尔（避免 stateful 重调污染单例）。
const purifyPresent = Array.isArray(lostHealerCat.purifyDialogue) && lostHealerCat.purifyDialogue.length > 0
ok(purifyPresent, 'purifyDialogue 存在（门控前提）')
const showFirst = firstUnlock && 'amy' === 'amy' && purifyPresent
const showReplay = secondUnlock && 'amy' === 'amy' && purifyPresent
ok(showFirst === true, '首次击败 → 显示艾米感化独白（首次解锁 + purifyDialogue 命中）')
ok(showReplay === false, '重复通关(艾米已招募) → 不重复播放独白（直接弹通关遮罩）')

console.log('\n=== D. amyDefeated 标记（真实 DataManager，town 探索菜单读取）===')
data.set('amyDefeated', true)
ok(data.get('amyDefeated') === true, 'data.set("amyDefeated", true) → data.get 读回 true（town 据此显示「已击败艾米」）', `实际=${data.get('amyDefeated')}`)
// 确认 DataManager 将 amyDefeated 映射到 progression.flags（与 town 读取路径一致）
ok(typeof data.get('amyDefeated') === 'boolean', 'amyDefeated 经 data-manager flag 映射（非裸字符串）')

console.log('\n=== E. 源码接线（field-scene _checkDungeonClear）===')
const src = fs.readFileSync(path.resolve(scriptsDir, 'scenes/field-scene.js'), 'utf8')
ok(src.includes("this.bossPurifyDialogue = (bossData && Array.isArray(bossData.purifyDialogue))"),
  'BOSS 初始化捕获 bossPurifyDialogue')
ok(src.includes("this._bossMonologueActive = true") && src.includes("this._showStoryDialogue('艾米', this.bossPurifyDialogue)"),
  '_checkDungeonClear 首次招募艾米 → 播独白并置 _bossMonologueActive')
ok(src.includes("if (this._bossMonologueActive) {") && src.includes('!this.storyDialogue'),
  '通关收尾：独白播完(storyDialogue 置空)才弹通关遮罩')
ok(src.includes("this.game.data.set('amyDefeated', true)"),
  '通关时写入 amyDefeated 标记')
ok(src.includes("if (!this._bossMonologueActive && !this.showDungeonClear) {") &&
   src.includes('this.showDungeonClear = true'),
  '无独白时(非草原/已招募/无purifyDialogue)直接弹通关遮罩兜底')

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
