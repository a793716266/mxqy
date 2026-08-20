/**
 * 验证：角色受击泛红【整张精灵】都染红且完整显示（不被离屏裁成一半）。
 * 两个独立根因都在此闭环：
 *   (1) 离屏画布里帧脚底必须锚定在离屏【底部】，否则脚底居中会让帧上半截超出离屏顶部被裁 → 只红半身。
 *   (2) 翻转(facingLeft) 分支的染红 source-atop fillRect 须在还原 transform 后执行，否则被 scale(-1) 平移只盖半边。
 * 用记录型 2D context 追踪仿射变换 + 记录 drawImage/fillRect 全局包围盒。
 * 用法: node devtools/verify_hurt_flash_fullbody.mjs
 */
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
    restore() { const s = stack.pop(); if (s) { t = s.t; api.fillStyle = s.fillStyle; api.globalCompositeOperation = s.gco } },
    translate(x, y) { t = mul(t, { a: 1, b: 0, c: 0, d: 1, e: x, f: y }) },
    scale(x, y) { t = mul(t, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }) },
    clearRect() {},
    drawImage(...args) {
      const n = args.length
      let dx, dy, dw, dh
      if (n === 5 || n === 9) { dx = args[n - 4]; dy = args[n - 3]; dw = args[n - 2]; dh = args[n - 1] }
      else if (n === 3) { dx = args[1]; dy = args[2]; dw = args[0]?.width || 0; dh = args[0]?.height || 0 }
      else return
      events.push({ type: 'drawImage', box: bbox(t, dx, dy, dw, dh) })
    },
    fillRect(x, y, w, h) {
      events.push({ type: 'fillRect', box: bbox(t, x, y, w, h), gco: api.globalCompositeOperation, fillStyle: api.fillStyle })
    },
    _events: events,
    _reset() { events.length = 0 }
  }
  return api
}

const mainCtx = makeRecordingCtx()
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

const redBox = () => {
  const ev = offCtx._events.filter(e => e.type === 'fillRect' && e.gco === 'source-atop' && e.fillStyle === '#ff2424')
  return ev.length ? ev[ev.length - 1].box : null
}
const frameBox = () => {
  const ev = offCtx._events.filter(e => e.type === 'drawImage')
  return ev.length ? ev[ev.length - 1].box : null
}
const eqBox = (b, w, h) => b && Math.round(b[0]) === 0 && Math.round(b[1]) === 0 && Math.round(b[2]) === Math.round(w) && Math.round(b[3]) === Math.round(h)
// 帧包围盒完整落在离屏内（不裁切上半/下半）
const inside = (b, w, h) => b && b[0] >= -0.5 && b[1] >= -0.5 && b[2] <= w + 0.5 && b[3] <= h + 0.5

for (const [label, flip] of [['非 flip', false], ['flip', true]]) {
  sprite.facingLeft = flip
  if (offCtx) offCtx._reset()
  sprite.renderTintedRed(mainCtx, 100, 100, 0.8)
  const cvW = sprite._tintCanvas.width, cvH = sprite._tintCanvas.height
  const rb = redBox()
  const fb = frameBox()
  assert(eqBox(rb, cvW, cvH), `${label}：染红覆盖整张离屏`, `[${rb}] vs [0,0,${cvW},${cvH}]`)
  assert(inside(fb, cvW, cvH), `${label}：帧完整落在离屏内（不裁成半身）`, `[${fb}] vs 离屏[0,0,${cvW},${cvH}]`)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
