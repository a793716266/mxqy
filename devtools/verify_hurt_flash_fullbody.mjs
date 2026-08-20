/**
 * 验证：角色受击泛红在【翻转(facingLeft)】状态下也覆盖【整张】精灵，
 * 而非被 scale(-1,1) 平移后只覆盖离屏一半（表现为"身体只红一半"）。
 * 用记录型 2D context 追踪仿射变换，断言染红的 source-atop fillRect
 * 在全局坐标下覆盖整张离屏 [0,0,cvW,cvH]。
 * 用法: node devtools/verify_hurt_flash_fullbody.mjs
 */
// ---- 记录型 2D 上下文：追踪仿射变换 + 记录 fillRect 包围盒 ----
function mul(t1, t2) {
  return {
    a: t1.a * t2.a + t1.c * t2.b,
    b: t1.b * t2.a + t1.d * t2.b,
    c: t1.a * t2.c + t1.c * t2.d,
    d: t1.b * t2.c + t1.d * t2.d,
    e: t1.a * t2.e + t1.c * t2.f + t1.e,
    f: t1.b * t2.e + t1.d * t2.f + t1.f
  }
}
function bbox(t, x, y, w, h) {
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [px, py] of pts) {
    const X = t.a * px + t.c * py + t.e
    const Y = t.b * px + t.d * py + t.f
    if (X < minX) minX = X
    if (X > maxX) maxX = X
    if (Y < minY) minY = Y
    if (Y > maxY) maxY = Y
  }
  return [minX, minY, maxX, maxY]
}
function makeRecordingCtx() {
  let t = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const stack = []
  const events = []
  const api = {
    fillStyle: '#000',
    globalCompositeOperation: 'source-over',
    save() { stack.push({ t, fillStyle: api.fillStyle, gco: api.globalCompositeOperation }) },
    restore() {
      const s = stack.pop()
      if (s) { t = s.t; api.fillStyle = s.fillStyle; api.globalCompositeOperation = s.gco }
    },
    translate(x, y) { t = mul(t, { a: 1, b: 0, c: 0, d: 1, e: x, f: y }) },
    scale(x, y) { t = mul(t, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }) },
    clearRect() {},
    drawImage() {},
    fillRect(x, y, w, h) {
      events.push({ box: bbox(t, x, y, w, h), gco: api.globalCompositeOperation, fillStyle: api.fillStyle })
    },
    _events: events,
    _reset() { events.length = 0 }
  }
  return api
}

// 主画布 ctx（传给 renderTintedRed，不关心其记录）
const mainCtx = makeRecordingCtx()
// 离屏 ctx 由 wx.createCanvas 创建（记录染红 fillRect）
let offCtx
globalThis.wx = {
  createCanvas() {
    offCtx = makeRecordingCtx()
    return { width: 0, height: 0, getContext: () => offCtx }
  },
  createImage: () => ({ width: 64, height: 64 })
}

const { CharacterSprite } = await import('../scripts/core/character-sprite.js')

let pass = 0, fail = 0
const assert = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' ' + extra : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' ' + extra : ''}`) }
}

const fakeImg = { width: 337, height: 337 }
const game = { dpr: 3, assets: { get: () => fakeImg } }
const data = { id: 'zhenbao', renderConfig: { assetPrefix: 'HERO_ZHENBAO', spriteType: 'zhenbao', targetHeight: 80, flipRule: 'same', totalWalkFrames: 8, totalIdleFrames: 8 } }
const sprite = new CharacterSprite(game, data)

function redFillBox() {
  const ev = offCtx._events.filter(e => e.gco === 'source-atop' && e.fillStyle === '#ff2424')
  return ev.length ? ev[ev.length - 1].box : null
}
function eqBox(box, w, h) {
  return box &&
    Math.round(box[0]) === 0 && Math.round(box[1]) === 0 &&
    Math.round(box[2]) === Math.round(w) && Math.round(box[3]) === Math.round(h)
}

// 非 flip（facingLeft=false，'same' 规则不翻转）
sprite.facingLeft = false
sprite.renderTintedRed(mainCtx, 100, 100, 0.8)
let box = redFillBox()
const cvW = sprite._tintCanvas.width, cvH = sprite._tintCanvas.height
assert(eqBox(box, cvW, cvH), '非 flip：染红覆盖整张离屏', `[${box}] vs [0,0,${cvW},${cvH}]`)

// flip（facingLeft=true，'same' 规则翻转）
sprite.facingLeft = true
offCtx._reset()
sprite.renderTintedRed(mainCtx, 100, 100, 0.8)
box = redFillBox()
assert(eqBox(box, cvW, cvH), 'flip：染红覆盖整张离屏（修复前会偏到左半/下半）', `[${box}] vs [0,0,${cvW},${cvH}]`)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
