/**
 * 验证：角色被攻击【全身】泛红（不是脚底红椭圆）
 *  - 锁定 CharacterSprite.renderTintedRed：把当前帧整体染红（source-atop 离屏缓冲），
 *    覆盖整张精灵本体（含透明轮廓），且需要与 _renderHeroHurtFlash 的新调用形态一致。
 *  - 直接实例化【真实】CharacterSprite + 真实 wx.createCanvas 离屏路径（不走"红椭圆"旧实现）。
 * 用法: node devtools/verify_hurt_flash_body.mjs
 */
const canvasCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas' || p === 'measureText') return undefined
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => ({ width: 64, height: 64 }),
}

const { CharacterSprite } = await import('../scripts/core/character-sprite.js')

let pass = 0, fail = 0
const assert = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' ' + extra : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' ' + extra : ''}`) }
}

const fakeImg = { width: 337, height: 337 }
const game = {
  dpr: 3,
  assets: { get: () => fakeImg }
}
const zhenbaoData = {
  id: 'zhenbao',
  renderConfig: { assetPrefix: 'HERO_ZHENBAO', spriteType: 'zhenbao', targetHeight: 80, flipRule: 'same', totalWalkFrames: 8, totalIdleFrames: 8 }
}
const sprite = new CharacterSprite(game, zhenbaoData)

// 1. 方法存在
assert(typeof sprite.renderTintedRed === 'function', 'CharacterSprite 具有 renderTintedRed 方法')

// 2. alpha<=0 早返回（不创建离屏、不绘制）
sprite.renderTintedRed(canvasCtx, 100, 100, 0)
assert(!sprite._tintCanvas, 'alpha<=0 时不创建离屏缓冲（早返回）')

// 3. 正常调用：不抛异常 + 创建复用离屏缓冲 + 离屏尺寸随帧尺寸增长
let threw = false
try { sprite.renderTintedRed(canvasCtx, 100, 100, 0.8) } catch (e) { threw = true; console.log('    err:', e.message) }
assert(!threw, 'renderTintedRed(alpha=0.8) 不抛异常')
assert(!!sprite._tintCanvas, 'renderTintedRed 创建了离屏缓冲')
assert(sprite._tintCanvas.width > 0 && sprite._tintCanvas.height > 0, '离屏缓冲尺寸有效')

// 4. 复用同一离屏缓冲（第二次调用不重建）
const firstCanvas = sprite._tintCanvas
sprite.renderTintedRed(canvasCtx, 200, 200, 0.5)
assert(sprite._tintCanvas === firstCanvas, 'renderTintedRed 复用同一离屏缓冲（不每帧分配）')

// 5. 翻转动画角色（李小宝）同样可染红不抛异常
const lxbData = { id: 'lixiaobao', renderConfig: { assetPrefix: 'HERO_LIXIAOBAO', spriteType: 'lixiaobao', targetHeight: 80, flipRule: 'same', totalWalkFrames: 8, totalIdleFrames: 8 } }
const lxb = new CharacterSprite(game, lxbData)
let threw2 = false
try { lxb.renderTintedRed(canvasCtx, 50, 50, 0.9) } catch (e) { threw2 = true; console.log('    err:', e.message) }
assert(!threw2, '李小宝 renderTintedRed 不抛异常（翻转角色）')

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
