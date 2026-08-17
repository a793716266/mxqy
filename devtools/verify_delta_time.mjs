// verify_delta_time.mjs
// 锁定 computeDeltaTime 的 clamp 语义：正常小 dt 不截断、异常大 dt 截断到上限、
// 自定义上限生效、时钟回拨返回 0。
//
// 运行：node devtools/verify_delta_time.mjs
import { computeDeltaTime, MAX_DELTA_TIME } from '../scripts/utils/time.js'

let passed = 0
let failed = 0
function assert(cond, msg) {
  if (cond) { passed++ } else { failed++; console.error('  ✗ FAIL: ' + msg) }
}

// 真实时间差基准：60fps ≈ 16.7ms，120fps ≈ 8.3ms，都远小于上限
// 1) 正常小 dt 不被截断
assert(Math.abs(computeDeltaTime(1016.7, 1000) - 0.0167) < 1e-9, '16.7ms 帧差不变(60fps)')
assert(Math.abs(computeDeltaTime(1008.3, 1000) - 0.0083) < 1e-9, '8.3ms 帧差不变(120fps)')

// 2) 边界：恰好等于上限不截断
assert(Math.abs(computeDeltaTime(1000 + MAX_DELTA_TIME * 1000, 1000) - MAX_DELTA_TIME) < 1e-9,
  `恰好 ${MAX_DELTA_TIME}s 不截断`)

// 3) 异常大 dt 被截断到上限（切后台/卡顿恢复）
assert(Math.abs(computeDeltaTime(2000, 1000) - MAX_DELTA_TIME) < 1e-9,
  '1000ms 间隔截断到 MAX_DELTA_TIME(切后台 1s)')
assert(Math.abs(computeDeltaTime(1000 + 60 * 1000, 1000) - MAX_DELTA_TIME) < 1e-9,
  '60s 间隔截断到 MAX_DELTA_TIME(切后台 1 分钟)')

// 4) 自定义上限生效
assert(Math.abs(computeDeltaTime(2000, 1000, 0.1) - 0.1) < 1e-9, '自定义上限 0.1s 生效')
assert(Math.abs(computeDeltaTime(2000, 1000, 0.033) - 0.033) < 1e-9, '自定义上限 0.033s 生效')

// 5) 时钟回拨防御（lastTime > now）
assert(computeDeltaTime(900, 1000) === 0, '时钟回拨返回 0')
assert(computeDeltaTime(1000, 1000) === 0, 'now===lastTime 返回 0')

// 6) 常量合理性
assert(MAX_DELTA_TIME === 0.05, 'MAX_DELTA_TIME 为 0.05')

console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
