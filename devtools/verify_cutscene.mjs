/**
 * verify_cutscene.mjs — 引擎内过场系统 headless 回归测试
 *
 * 在 node 里 mock wx / game / ctx，跑通 CutsceneScene 的：
 *   - 剧本加载、init
 *   - update / render（即便角色资源为 null 也不崩）
 *   - 点击推进 → 全部 beat 走完 → onDone 触发
 *   - 跳过按钮 → 直接结束
 *   - auto 模式（不点击）→ 结束
 *   - 缺失剧本 → 直接结束不卡死
 *
 * 运行：node --no-warnings --loader ./devtools/_dungeon_enemies_loader.mjs devtools/verify_cutscene.mjs
 */
const noop = () => {}

function makeCtx() {
  const grad = { addColorStop: noop }
  const target = {}
  return new Proxy(target, {
    get(t, p) {
      if (p === 'measureText') return (s) => ({ width: (s ? String(s).length : 0) * 10 })
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => grad
      if (p === 'canvas') return { width: 1080, height: 1920 }
      if (p in t) return t[p]
      return noop
    },
    set(t, p, v) { t[p] = v; return true },
  })
}

const ctx = makeCtx()

const game = {
  ctx,
  width: 1080,
  height: 1920,
  dpr: 3,
  assets: { get: () => null },          // 资源缺失：验证 CharacterSprite 静默跳过
  audio: { playBGM: noop, playSFX: noop, beginSceneChange: noop, setScene: noop },
  input: { taps: [], consumeTap: () => null },
  data: { set: noop, get: () => null, hasSave: () => false, load: noop, save: noop, clear: noop },
  changeScene: noop,
}

let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) { pass++ }
  else { fail++; console.error('  ✗', msg) }
}

const { CutsceneScene } = await import('../scripts/core/cutscene-scene.js')
const { CUTSCENES } = await import('../scripts/data/cutscenes.js')

assert(CUTSCENES.ch1_intro && CUTSCENES.ch1_intro.beats.length > 0, 'ch1_intro 剧本存在且非空')

// ① 点击推进播放到结束
try {
  let onDone = 0
  const scene = new CutsceneScene(game, { scenarioId: 'ch1_intro', onDone: () => { onDone++ } })
  scene.init()
  const dt = 1 / 30
  let frames = 0
  let tapCd = 0
  while (!scene.finished && frames < 6000) {
    scene.update(dt)
    scene.render(ctx)
    tapCd += dt
    if (tapCd >= 0.18) { tapCd = 0; scene.handleTap({ x: scene.width / 2, y: scene.height / 2 }) }
    frames++
  }
  assert(scene.finished, '点击推进后过场应结束')
  assert(onDone === 1, `onDone 应触发一次 (实际 ${onDone})`)
  assert(frames < 6000, `应在合理帧数内结束 (frames=${frames})`)
} catch (e) { assert(false, '点击推进过程异常: ' + (e && e.stack || e)) }

// ② 跳过按钮
try {
  let onDone = 0
  const scene = new CutsceneScene(game, { scenarioId: 'ch1_intro', onDone: () => { onDone++ } })
  scene.init()
  scene.handleTap({ x: scene.skipBtn.x + 5, y: scene.skipBtn.y + 5 })
  scene.update(1 / 30)
  assert(scene.finished && onDone === 1, '跳过应直接结束并触发 onDone')
} catch (e) { assert(false, '跳过过程异常: ' + (e && e.stack || e)) }

// ③ auto 模式（不点击）
try {
  let onDone = 0
  const scene = new CutsceneScene(game, { scenarioId: 'ch1_intro', onDone: () => { onDone++ } })
  scene.init()
  let f = 0
  while (!scene.finished && f < 6000) { scene.update(1 / 30); scene.render(ctx); f++ }
  assert(scene.finished, 'auto 模式也应结束')
  assert(onDone === 1, `auto onDone 触发 (实际 ${onDone})`)
} catch (e) { assert(false, 'auto 过程异常: ' + (e && e.stack || e)) }

// ④ 缺失剧本 → 直接结束
try {
  const scene = new CutsceneScene(game, { scenarioId: 'nope' })
  scene.init()
  assert(scene.finished, '缺失剧本应直接结束不卡死')
} catch (e) { assert(false, '缺失剧本异常: ' + (e && e.stack || e)) }

console.log(`\n[verify-cutscene] PASS=${pass} FAIL=${fail}`)
process.exit(fail > 0 ? 1 : 0)
