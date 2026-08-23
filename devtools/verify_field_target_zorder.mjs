/**
 * 验证 field-scene _renderTargetPanel 在详情面板打开时被跳过
 * ===================================================
 * 根因：field-scene 渲染顺序里 _renderTargetPanel（行 4538）位于
 *       charInfoPanel.renderDetailPanel()（行 4481）之后，导致 DNF
 *       怪物目标面板（史莱姆猫 Lv.1 HP 118/130 卡）覆盖到详情面板
 *       中部「属性」区域。修复：charInfoPanel.visible=true 时早 return。
 *
 * 用法：node --loader ./devtools/_dungeon_enemies_loader.mjs devtools/verify_field_target_zorder.mjs
 */

// ===== wx mock =====
const canvasCtx = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'canvas' || prop === 'measureText') return undefined
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} })
    if (prop === 'measureText') return (t) => ({ width: (t ? String(t).length : 0) * 8 })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => { const img = { width: 64, height: 64 }; setTimeout(() => { if (img.onload) img.onload() }, 0); return img },
  getStorageSync: (k) => _storage[k],
  setStorageSync: (k, v) => { _storage[k] = v },
  removeStorageSync: (k) => { delete _storage[k] },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334, platform: 'devtools' }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {},
  showLoading: () => {}, hideLoading: () => {}, setKeepScreenOn: () => {},
  getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {},
  downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}

class MockGame {
  constructor() {
    this.ctx = canvasCtx
    this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = { _d: {}, _flags: new Set(), get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: (k) => { delete this.data._d[k] }, hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k) }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true, get: () => null }
    this.audio = { play: () => {}, playSound: () => {}, playSFX: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0, this.input.taps.length) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
  }
}

import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) { throw e }
}

const mod = await import('../scripts/scenes/field-scene.js')
const FieldScene = mod.FieldScene

let pass = 0, fail = 0
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`) }
}

const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
scene._buildBattleHeroes()
scene.battleSystem.active = true
scene.battleSystem.showBattleUI = true

// 注入一个活怪作为目标
const m = { id: 'slime1', enemyId: 'slime_cat', name: '史莱姆猫', level: 1, hp: 118, maxHp: 130, atk: 8, alive: true, x: 100, y: 100, isBoss: false }
scene.mapMonsters = [m]
scene.battleSystem.battleTarget = m
scene.battleSystem._lastDamagedMonster = m

// 记录 _renderTargetPanel 副作用的简单 ctx
function makeCtx() {
  return {
    ops: { fills: [], strokes: [], texts: [] },
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    save() {}, restore() {},
    fillRect() {}, strokeRect() {},
    beginPath() {}, closePath() {}, fill() {}, stroke() {},
    arc() {}, arcTo() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, clip() {},
    drawImage() {},
    fillText(t) { this.ops.texts.push({ t, fill: this.fillStyle }) },
    measureText(t) { return { width: (t ? String(t).length : 0) * 8 } },
    createLinearGradient() { return { addColorStop() {} } },
    roundRect() {}, fillRoundRect() {}
  }
}

console.log('A. 详情面板未打开时，目标怪物面板照常渲染（不破坏现有战斗 UX）')
{
  scene.charInfoPanel = null
  const ctx = makeCtx()
  scene._renderTargetPanel(ctx)
  const hasNameText = ctx.ops.texts.some(o => o.t === '史莱姆猫')
  ok('目标怪物面板渲染了怪物名（史莱姆猫）', hasNameText)
}

console.log('B. 详情面板打开时，目标怪物面板必须跳过（z-order 根治）')
{
  // 构造一个 minimal charInfoPanel mock（不依赖真实 CharacterInfoPanel 类也能触发修复分支）
  scene.charInfoPanel = { visible: true, renderDetailPanel: () => null, hide() { this.visible = false }, show() { this.visible = true } }
  const ctx = makeCtx()
  scene._renderTargetPanel(ctx)
  const hasNameText = ctx.ops.texts.some(o => o.t === '史莱姆猫')
  ok('详情面板 visible=true 时目标怪物面板不渲染（无"史莱姆猫"文字）', !hasNameText)
  ok('无任何 fillText 调用（说明 _renderTargetPanel 提前 return）', ctx.ops.texts.length === 0)
}

console.log('C. 详情面板关闭后，目标怪物面板恢复渲染（不影响正常战斗）')
{
  scene.charInfoPanel.visible = false
  const ctx = makeCtx()
  scene._renderTargetPanel(ctx)
  const hasNameText = ctx.ops.texts.some(o => o.t === '史莱姆猫')
  ok('详情面板关闭后目标怪物面板恢复渲染', hasNameText)
}

console.log('D. 详情面板对象为 null 时（城镇场景），不抛异常且正常渲染')
{
  scene.charInfoPanel = null
  let threw = false
  try {
    const ctx = makeCtx()
    scene._renderTargetPanel(ctx)
  } catch (e) { threw = true; console.error(e.message) }
  ok('charInfoPanel=null 时不抛异常', !threw)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
