/**
 * animation-config.js - 角色动画帧率配置表（数据驱动，消除 if-else）
 *
 * 所有角色的 walk/idle 动画参数集中定义。
 * 新增角色只需在此添加一行配置，无需修改 field-movement 等逻辑代码。
 *
 * @typedef {Object} AnimParams
 * @property {number} dur - 每帧持续时间（秒），dur * frames ≈ 1秒循环
 * @property {number} frames - 总帧数
 */

/** @type {Record<string, { walk: AnimParams, idle: AnimParams }>} */
export const ANIM_CONFIG = {
  zhenbao: {
    walk:  { dur: 0.100, frames: 8 },   // 臻宝 8帧 walk, 100ms/帧 ≈ 0.8秒循环
    idle:  { dur: 0.200, frames: 5 },   // 臻宝 5帧 idle (减帧版), 200ms/帧 = 1秒循环
  },
  lixiaobao: {
    walk:  { dur: 0.100, frames: 8 },   // 李小宝 8帧 walk, 100ms/帧 ≈ 0.8秒循环
    idle:  { dur: 0.125, frames: 8 },   // 李小宝 8帧 idle, 125ms/帧 = 1秒循环
  },
  slime_cat: {
    walk:  { dur: 0.083, frames: 12 },  // 史莱姆猫 12帧 walk, 83ms/帧 ≈ 1秒循环
    idle:  { dur: 0.143, frames: 7 },   // 史莱姆猫 7帧 idle, 143ms/帧 ≈ 1秒循环
  },
  shadow_mouse: {
    walk:  { dur: 0.125, frames: 8 },   // 暗影鼠 8帧 walk, 125ms/帧 ≈ 1秒循环
    idle:  { dur: 0.167, frames: 6 },   // 暗影鼠 6帧 idle
  },

  // 通用猫咪类（匹配 heroId.toLowerCase().includes('cat') || heroId === 'mao'）
  __cat_default: {
    walk:  { dur: 0.083, frames: 12 },
    idle:  { dur: 0.125, frames: 8 },
  },

  // 默认兜底（其他未配置的角色）
  __default: {
    walk:  { dur: 0.125, frames: 8 },
    idle:  { dur: 0.500, frames: 2 },
  },
}

/**
 * 获取指定角色的动画参数
 * @param {string} heroId 角色 ID
 * @param {boolean} isMoving 是否移动中（true=walk, false=idle）
 * @returns {{ dur: number, frames: number }}
 */
export function getAnimParams(heroId, isMoving) {
  const action = isMoving ? 'walk' : 'idle'

  // 1. 精确匹配角色 ID
  if (ANIM_CONFIG[heroId]) {
    return ANIM_CONFIG[heroId][action]
  }

  // 2. 猫咪类通用匹配
  const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao'
  if (isCat) {
    return ANIM_CONFIG.__cat_default[action]
  }

  // 3. 兜底默认值
  return ANIM_CONFIG.__default[action]
}
