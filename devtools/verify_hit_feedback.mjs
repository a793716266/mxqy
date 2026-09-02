/**
 * verify_hit_feedback.mjs
 * =======================
 * 打击感系统回归验证（2026-09-02 打击感升级）：
 *   A. _onHitFeedback：顿帧三档（普攻/暴击/击杀）、方向性震屏、暴击白闪、命中环、连击
 *   B. 伤害数字运动模型：物理抛物线（升后微降）、横向错位、弹性 pop 缩放、两段式淡出、同屏上限
 *   C. 伤害数字渲染：描边（strokeText）、加粗字体、暴击更大字号
 *   D. 渲染层集成：受击挤压变形 + 方向性震屏 + 白闪路径不抛异常（真实 FieldScene.render）
 *   E. 震屏指数衰减：_updateBattleSystem 中衰减生效
 *
 * 运行：node --no-warnings --loader ./devtools/_dungeon_enemies_loader.mjs devtools/verify_hit_feedback.mjs
 */

const canvasCtx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'canvas') return undefined
    if (prop === 'measureText') return () => ({ width: 10 })
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => { const img = { width: 64, height: 64, _onload: null }; setTimeout(() => { if (img.onload) img.onload() }, 0); return img },
  getStorageSync: (k) => _storage[k],
  setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}

import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  return nodeRequire(abs)
}

const { FieldScene } = await import(path.resolve(projectRoot, 'scripts', 'scenes', 'field-scene.js'))

class MockGame {
  constructor() {
    this.ctx = canvasCtx
    this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = {
      _d: {}, _flags: new Set(),
      get: (k) => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: (k) => { delete this.data._d[k] },
      hasFlag: (k) => this.data._flags.has(k), setFlag: (k) => this.data._flags.add(k), delFlag: (k) => this.data._flags.delete(k)
    }
    const _img = { width: 64, height: 64 }
    this.assets = {
      get: () => _img,
      getImage: () => _img,
      has: () => true,
      loadSubpackage: async () => {},
      isLoaded: () => true
    }
    this.audio = { play: () => {}, playBGM: () => {}, stopBGM: () => {}, playSound: () => {}, playHitSynth: () => {}, playSkillHitSFX: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0, this.input.taps.length) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
  }
}

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  [OK] ' + name) }
  else { failed++; console.log('  [FAIL] ' + name + (detail ? '  → ' + detail : '')) }
}

// 记录型 ctx mock：记录 strokeText/fillText/font 调用（伤害数字渲染断言用）
function makeRecordingCtx() {
  const calls = { strokeText: [], fillText: [], fonts: [] }
  const rec = {
    calls,
    save() {}, restore() {}, set globalAlpha(v) {}, get globalAlpha() { return 1 },
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
    translate() {}, scale() {}, rotate() {}, clip() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
    roundRect() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    strokeText(...a) { calls.strokeText.push(a) },
    fillText(...a) { calls.fillText.push(a) },
  }
  Object.defineProperty(rec, 'font', { set(v) { calls.fonts.push(v) }, get() { return '' } })
  for (const k of ['fillStyle', 'strokeStyle', 'lineWidth', 'lineJoin', 'textAlign', 'textBaseline', 'lineCap', 'globalCompositeOperation', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'imageSmoothingEnabled']) {
    Object.defineProperty(rec, k, { set() {}, get() { return null } })
  }
  return rec
}

function makeScene() {
  const game = new MockGame()
  const scene = new FieldScene(game, { area: 'grassland' })
  scene.init()
  return scene
}

function makeMonster(scene, over) {
  return Object.assign({
    id: 1, name: '史莱姆', enemyId: 'slime_cat',
    x: scene.playerX + 100, y: scene.playerY,
    hp: 100, maxHp: 100, def: 0, atk: 10,
    alive: true, isBoss: false, isElite: false
  }, over || {})
}

console.log('═══ 打击感系统回归验证 ═══\n')
const scene = await makeScene()
const dpr = scene.dpr
const bs = scene.battleSystem
assert(!!bs, 'FieldScene 挂载 battleSystem')

// ── A. _onHitFeedback ──
console.log('── A. 命中反馈三档（普攻/暴击/击杀）──')
{
  const m = makeMonster(scene, { hp: 50 })
  bs._hitStop = 0; bs._shake = 0; bs._critFlash = 0; bs.combo = 0; bs.hitRings = []
  scene._onHitFeedback(m, false, 'slash', null, { x: m.x - 60, y: m.y })
  assert(Math.abs(bs._hitStop - 0.06) < 1e-6, '普攻顿帧 0.06s', `实际 ${bs._hitStop}`)
  assert(Math.abs(bs._shake - 3 * dpr) < 1e-6, '普攻震屏 3px×dpr', `实际 ${bs._shake / dpr}`)
  assert(m._hitFlash === 1, '怪物闪白 _hitFlash=1')
  assert(bs.combo === 1 && bs.comboTimer > 0, '连击 +1 且窗口刷新')
  assert(bs.hitRings.length === 1, '命中环生成 ×1')
  assert(!bs._critFlash, '普攻无全屏白闪')

  // 暴击：顿帧 0.09 / 震屏 6 / 白闪 0.7
  bs._hitStop = 0; bs._shake = 0; bs._critFlash = 0; bs.hitRings = []
  const m2 = makeMonster(scene, { id: 2, hp: 50, x: m.x, y: m.y })
  scene._onHitFeedback(m2, true, 'slash', null, { x: m2.x - 60, y: m2.y })
  assert(Math.abs(bs._hitStop - 0.09) < 1e-6, '暴击顿帧 0.09s', `实际 ${bs._hitStop}`)
  assert(Math.abs(bs._shake - 6 * dpr) < 1e-6, '暴击震屏 6px×dpr', `实际 ${bs._shake / dpr}`)
  assert(Math.abs(bs._critFlash - 0.7) < 1e-6, '暴击全屏白闪 0.7', `实际 ${bs._critFlash}`)

  // 击杀（hp<=0）：顿帧 0.13 / 震屏 9 / 白闪 1
  bs._hitStop = 0; bs._shake = 0; bs._critFlash = 0
  const m3 = makeMonster(scene, { id: 3, hp: 0 })
  scene._onHitFeedback(m3, false, 'slash', null, { x: m3.x - 60, y: m3.y })
  assert(Math.abs(bs._hitStop - 0.13) < 1e-6, '击杀顿帧 0.13s', `实际 ${bs._hitStop}`)
  assert(Math.abs(bs._shake - 9 * dpr) < 1e-6, '击杀震屏 9px×dpr', `实际 ${bs._shake / dpr}`)
  assert(Math.abs(bs._critFlash - 1) < 1e-6, '击杀全屏白闪 1.0')
}

console.log('── A2. 方向性震屏 ──')
{
  bs._shake = 0; bs._shakeDirX = 0; bs._shakeDirY = 0
  // 攻击者在怪物左侧 → 方向朝右 (1, 0)
  const m = makeMonster(scene, { id: 10, hp: 50, x: scene.playerX + 200, y: scene.playerY })
  scene._onHitFeedback(m, false, 'slash', null, { x: m.x - 60, y: m.y })
  assert(bs._shakeDirX > 0.99 && Math.abs(bs._shakeDirY) < 0.01,
    '水平受击：震屏方向 = 攻击者→受击者 (+1,0)',
    `实际 (${bs._shakeDirX.toFixed(2)},${bs._shakeDirY.toFixed(2)})`)
  // 斜向：从左上打右下 → 方向归一化正确
  bs._shake = 0; bs._shakeDirX = 0; bs._shakeDirY = 0
  const m2 = makeMonster(scene, { id: 11, hp: 50, x: scene.playerX + 200, y: scene.playerY + 60 })
  scene._onHitFeedback(m2, false, 'slash', null, { x: m2.x - 60, y: m2.y - 60 })
  const len = Math.sqrt(bs._shakeDirX ** 2 + bs._shakeDirY ** 2)
  assert(Math.abs(len - 1) < 0.01 && bs._shakeDirX > 0.6 && bs._shakeDirY > 0.6,
    '斜向受击：方向为单位向量且指向右下',
    `实际 (${bs._shakeDirX.toFixed(2)},${bs._shakeDirY.toFixed(2)}) len=${len.toFixed(3)}`)
  // 无 from：方向保持不变（不产生 NaN）
  bs._shakeDirX = 0.5; bs._shakeDirY = 0.5
  scene._onHitFeedback(m2, false, 'slash', null)
  assert(bs._shakeDirX === 0.5 && bs._shakeDirY === 0.5 && Number.isFinite(bs._shakeDirX),
    '无攻击来源时不改写方向（兼容旧调用点）')
  // 弱击不覆盖强击方向：击杀级震屏(9)残量下普攻(3)不刷新方向
  bs._shake = 0; bs._hitStop = 0; bs._shakeDirX = -1; bs._shakeDirY = 0
  const m3 = makeMonster(scene, { id: 12, hp: 0, x: scene.playerX + 200, y: scene.playerY })
  scene._onHitFeedback(m3, false, 'slash', null, { x: m3.x - 60, y: m3.y })  // 击杀: shake=9, dir=(1,0)
  const m4 = makeMonster(scene, { id: 13, hp: 50, x: scene.playerX + 200, y: scene.playerY })
  bs._shakeDirX = -1; bs._shakeDirY = 0  // 人为放置旧方向
  bs._shake = 9 * dpr
  scene._onHitFeedback(m4, false, 'slash', null, { x: m4.x - 60, y: m4.y })  // 普攻 amp=3 < 9
  assert(bs._shakeDirX === -1, '弱击不覆盖强击的震屏方向')
}

// ── B. 伤害数字运动模型 ──
console.log('── B. 伤害数字运动模型 ──')
{
  bs.damageTexts = []
  // 兼容最小字段（与旧 push 点一致）
  bs.damageTexts.push({ text: '-10', x: 100, y: 200, color: '#ff4757', life: 1.0 })
  scene._updateFieldDamageTexts(0.001)
  const it = bs.damageTexts[0]
  assert(it.vy < 0 && it.gravity > 0, '物理参数懒初始化（初速向上 + 重力）', `vy=${it.vy} g=${it.gravity}`)
  assert(Number.isFinite(it.x) && Number.isFinite(it.y), '坐标保持有限值（无 NaN）')

  // 抛物线：先升后降（vy 由负转正）
  bs.damageTexts = [{ text: '-10', x: 100, y: 200, color: '#f00', life: 1.0, maxLife: 1.0 }]
  const t1 = bs.damageTexts[0]
  const ys = []
  for (let i = 0; i < 60; i++) { scene._updateFieldDamageTexts(1 / 60); ys.push(t1.y) }
  const minY = Math.min(...ys)
  assert(ys[0] > minY && ys[ys.length - 1] > minY + 1,
    '抛物线运动：先上升后回落（非直线上升）',
    `y0=${ys[0].toFixed(1)} minY=${minY.toFixed(1)} yEnd=${ys[ys.length - 1].toFixed(1)}`)

  // 横向错位：同点生成的两个数字 x 不同
  bs.damageTexts = []
  for (let i = 0; i < 8; i++) bs.damageTexts.push({ text: '-1', x: 300, y: 300, color: '#f00', life: 1.0 })
  scene._updateFieldDamageTexts(0.001)
  const xs = new Set(bs.damageTexts.map(t => t.x))
  assert(xs.size > 1, '同点连击数字横向错开（不叠成一团）', `唯一 x 数=${xs.size}`)

  // 弹性 pop：出生 scale≈1.35，pop 段末≈基准 1.0
  bs.damageTexts = [{ text: '-10', x: 100, y: 200, color: '#f00', life: 1.0, maxLife: 1.0 }]
  scene._updateFieldDamageTexts(0.001)
  const s0 = bs.damageTexts[0]._scale
  assert(s0 > 1.3 && s0 < 1.4, '出生缩放 ≈1.35（迸发感）', `实际 ${s0.toFixed(3)}`)
  const t2 = bs.damageTexts[0]
  let elapsed = 0.001
  while (elapsed < 0.2) { scene._updateFieldDamageTexts(1 / 60); elapsed += 1 / 60 }
  assert(Math.abs(t2._scale - 1.0) < 0.06, 'pop 段末回稳到基准 1.0', `实际 ${t2._scale.toFixed(3)}`)

  // 暴击基准更大
  bs.damageTexts = [{ text: '-99!', x: 100, y: 200, color: '#FFD700', life: 1.0, maxLife: 1.0, isCrit: true }]
  scene._updateFieldDamageTexts(0.001)
  const crit = bs.damageTexts[0]
  assert(Math.abs(crit._scale - 1.45 * 1.35) < 0.02, '暴击 pop 起点 = 1.45×1.35', `实际 ${crit._scale.toFixed(3)}`)
  assert(crit.vy < -170 * dpr, '暴击初速更高（190×0.9~1.1 随机，>普攻上限 165）', `vy=${(crit.vy / dpr).toFixed(0)}px/s`)

  // 两段式淡出：前 55% alpha=1，末端 → 0
  // （进度按"更新前的 life"计算 → 用小步长累计推进，跨过 55% 边界后再看淡出）
  bs.damageTexts = [{ text: '-10', x: 100, y: 200, color: '#f00', life: 1.0, maxLife: 1.0 }]
  const t3 = bs.damageTexts[0]
  let fadeElapsed = 0
  let sawOpaque = false
  while (fadeElapsed < 0.5) {
    scene._updateFieldDamageTexts(1 / 60)
    fadeElapsed += 1 / 60
    if (t3._alpha === 1) sawOpaque = true
  }
  assert(sawOpaque, '前 55% 生命周期完全不透明')
  while (fadeElapsed < 0.98) { scene._updateFieldDamageTexts(1 / 60); fadeElapsed += 1 / 60 }
  assert(t3._alpha < 0.2, '末端快速淡出趋近 0', `实际 ${t3._alpha && t3._alpha.toFixed(3)}`)

  // 同屏上限 28（用 _idx 标记身份，不受横向抖动干扰）
  bs.damageTexts = []
  for (let i = 0; i < 40; i++) bs.damageTexts.push({ text: '-1', x: 300, y: 300, color: '#f00', life: 2.0, maxLife: 2.0, _idx: i })
  scene._updateFieldDamageTexts(0.001)
  assert(bs.damageTexts.length <= 28, '同屏上限 28（超出移除最老）', `实际 ${bs.damageTexts.length}`)
  const minIdx = Math.min(...bs.damageTexts.map(t => t._idx))
  assert(minIdx === 12, '移除的是最老数字（保留 _idx 12~39）', `最小 _idx=${minIdx}`)

  // 过期移除仍工作
  bs.damageTexts = [{ text: '-10', x: 100, y: 200, color: '#f00', life: 0.05, maxLife: 1.0 }]
  scene._updateFieldDamageTexts(0.1)
  assert(bs.damageTexts.length === 0, '过期数字正常移除')
}

// ── C. 伤害数字渲染 ──
console.log('── C. 伤害数字渲染（描边/加粗/暴击字号）──')
{
  const ctx = makeRecordingCtx()
  bs.damageTexts = [
    { text: '-10', x: 100, y: 200, color: '#ff4757', life: 1.0, maxLife: 1.0, _scale: 1, _alpha: 1 },
    { text: '-99!', x: 300, y: 200, color: '#FFD700', life: 1.0, maxLife: 1.0, _scale: 1, _alpha: 1, isCrit: true }
  ]
  scene._renderDamageTexts(ctx)
  assert(ctx.calls.strokeText.length === 2 && ctx.calls.fillText.length === 2,
    '每个数字先描边后填充（strokeText+fillText）',
    `stroke=${ctx.calls.strokeText.length} fill=${ctx.calls.fillText.length}`)
  assert(ctx.calls.fonts.every(f => f.includes('bold')), '字体加粗')
  const normalFont = ctx.calls.fonts.find(f => f.includes('48px'))   // 16*3
  const critFont = ctx.calls.fonts.find(f => f.includes('69px'))     // 23*3
  assert(!!normalFont, '普攻数字字号 16×dpr')
  assert(!!critFont, '暴击数字字号 23×dpr（更大）')
}

// ── D. 渲染层集成（真实 FieldScene.render 不抛异常）──
console.log('── D. 渲染层集成（挤压变形/方向性震屏/白闪路径）──')
{
  const m = makeMonster(scene, { id: 99, hp: 50, _hitFlash: 1 })
  scene.mapMonsters = [m]
  bs._shake = 5 * dpr; bs._shakeDirX = 1; bs._shakeDirY = 0
  bs._critFlash = 1
  let err1 = null
  try { scene.render(scene.game.ctx) } catch (e) { err1 = e }
  assert(!err1, '受击挤压 + 方向性震屏 + 白闪渲染不抛异常', err1 && err1.message)

  // squash 参数正确性：_hitFlash=1 → squash=1 → 缩放 (1.13, 0.90)
  // 通过再次渲染（_hitFlash 衰减后低于 0.5）确认走普通路径也不抛异常
  m._hitFlash = 0.3
  bs._shake = 0; bs._critFlash = 0
  let err2 = null
  try { scene.render(scene.game.ctx) } catch (e) { err2 = e }
  assert(!err2, '闪白低于阈值走普通渲染路径不抛异常', err2 && err2.message)

  // 白闪 alpha 上限 0.12（由 mock ctx 无法捕获 fillStyle，改走逻辑断言：_critFlash 衰减）
  // 注意：先耗尽此前击杀测试遗留的 0.13s hitStop（顿帧期间 _updateBattleSystem 提前 return，
  //       震屏/白闪衰减代码在其之后，不会执行——这正是"数字与画面一起凝滞"的设计）。
  bs.active = true
  bs._hitStop = 0.13
  for (let i = 0; i < 20; i++) scene._updateBattleSystem(1 / 60)
  assert(bs._hitStop === 0, '前置：hitStop 已耗尽（衰减可被观测）')
  bs._critFlash = 1
  bs._shake = 9 * dpr
  scene._updateBattleSystem(0.05)
  assert(bs._critFlash < 1 && bs._critFlash > 0, '白闪随时间衰减', `实际 ${bs._critFlash.toFixed(3)}`)
  assert(bs._shake < 9 * dpr && bs._shake > 0, '震屏指数衰减（残量介于 0 与峰值之间）',
    `实际 ${(bs._shake / dpr).toFixed(2)}`)
  // 指数衰减正确性：exp(-0.05*10)=0.6065
  const expect = 9 * dpr * Math.exp(-0.5)
  assert(Math.abs(bs._shake - expect) / expect < 0.05, '衰减符合 exp(-dt×10)', `期望 ${(expect / dpr).toFixed(2)} 实际 ${(bs._shake / dpr).toFixed(2)}`)
  // 衰减到阈值以下清零
  for (let i = 0; i < 120; i++) scene._updateBattleSystem(1 / 60)
  assert(bs._shake === 0, '低于感知阈值后清零（无无限拖尾）')
}

console.log('')
console.log(`=== RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
