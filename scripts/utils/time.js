/**
 * time.js - 帧时间差计算（单一真相源）
 *
 * 所有场景(野外/城镇/爬塔/图鉴)的 update(dt) 都吃 game.js 的 deltaTime，
 * 因此 deltaTime 的正确性是一处全局杠杆。
 */

/**
 * 单帧最大时间差（秒）。对应最低 ~20fps。
 * 微信小游戏切后台 / 长时间卡顿时 requestAnimationFrame 会暂停，
 * 恢复后 (now - lastTime) 可能高达数秒。若直接用巨大 dt 推进战斗逻辑，
 * 会导致锁计时/位移/伤害帧一次性全结算（角色瞬移、漏伤、动画跳变）。
 * 截断到本上限使异常长间隔等效于「暂停」，避免灾难性跳变；
 * 正常帧率(60fps≈16.7ms / 120fps≈8.3ms)下 dt 远小于上限，完全不受影响。
 */
export const MAX_DELTA_TIME = 0.05

/**
 * 计算两帧之间的时间差（秒），并截断到安全上限。
 * @param {number} now      当前时间戳(ms)，通常 Date.now()
 * @param {number} lastTime 上一帧时间戳(ms)
 * @param {number} [maxDt]  单帧上限(秒)，默认 MAX_DELTA_TIME
 * @returns {number} 安全的时间差（秒），范围 [0, maxDt]
 */
export function computeDeltaTime(now, lastTime, maxDt = MAX_DELTA_TIME) {
  let dt = (now - lastTime) / 1000
  if (dt > maxDt) dt = maxDt
  if (dt < 0) dt = 0 // 时钟回拨防御（系统时间被调小）
  return dt
}
