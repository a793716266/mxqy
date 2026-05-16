/**
 * canvas-utils.js - Canvas 2D 绘制工具函数库（统一提取，消除各场景重复代码）
 *
 * 所有场景共用的一套 UI 基础绘制原语：
 * - 圆角矩形路径
 * - 像素风格按钮
 * - 颜色变暗/变亮
 * - 进度条
 * - 点是否在矩形内
 *
 * 用法：import { roundRect, drawButton, ... } from '../ui/canvas-utils.js'
 */

// ═══════════════════════════════════════════
//  圆角矩形路径（只画 path，不 fill/stroke）
// ═══════════════════════════════════════════

/**
 * 绘制圆角矩形路径（不执行 fill/stroke，由调用方控制样式）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 左上角 X
 * @param {number} y 左上角 Y
 * @param {number} w 宽度
 * @param {number} h 高度
 * @param {number} r 圆角半径
 */
export function roundRect(ctx, x, y, w, h, r) {
  // 防止圆角超过边长一半导致变形
  r = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// ═══════════════════════════════════════════
//  像素风格按钮
// ═══════════════════════════════════════════

/**
 * 绘制像素风格按钮（含背景、边框、文字、阴影）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 按钮中心X
 * @param {number} y 按钮中心Y
 * @param {number} w 按钮宽度
 * @param {number} h 按钮高度
 * @param {string} text 按钮文字
 * @param {string} [color='#4a90d9'] 主题色
 * @param {number} dpr 设备像素比
 */
export function drawButton(ctx, x, y, w, h, text, color = '#4a90d9', dpr = 1) {
  const btnX = x - w / 2
  const btnY = y - h / 2
  const radius = 8 * dpr

  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  roundRect(ctx, btnX + 3 * dpr, btnY + 3 * dpr, w, h, radius)
  ctx.fill()

  // 背景
  ctx.fillStyle = color
  roundRect(ctx, btnX, btnY, w, h, radius)
  ctx.fill()

  // 边框
  ctx.strokeStyle = darkenColor(color, -30)
  ctx.lineWidth = 2 * dpr
  roundRect(ctx, btnX, btnY, w, h, radius)
  ctx.stroke()

  // 文字
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${16 * dpr}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

/**
 * 绘制小尺寸按钮（用于菜单选项等紧凑场景）
 */
export function drawSmallButton(ctx, x, y, w, h, text, color = '#4a90d9', dpr = 1) {
  const btnX = x - w / 2
  const btnY = y - h / 2
  const radius = 6 * dpr

  ctx.save()
  // 阴影
  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowOffsetX = 2 * dpr
  ctx.shadowOffsetY = 2 * dpr
  ctx.shadowBlur = 4 * dpr

  ctx.fillStyle = color
  roundRect(ctx, btnX, btnY, w, h, radius)
  ctx.fill()
  ctx.restore()

  // 边框
  ctx.strokeStyle = darkenColor(color, -20)
  ctx.lineWidth = 1.5 * dpr
  roundRect(ctx, btnX, btnY, w, h, radius)
  ctx.stroke()

  // 文字
  ctx.fillStyle = '#ffffff'
  ctx.font = `${14 * dpr}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

// ═══════════════════════════════════════════
//  颜色工具
// ═══════════════════════════════════════════

/**
 * 将 hex 颜色变暗或变亮
 * @param {string} hex 十六进制颜色（如 '#ff5500' 或 'rgb(r,g,b)'）
 * @param {number} amount 变暗(-255~0) / 变亮(0~255)，默认 -20
 * @returns {string} rgb() 格式颜色字符串
 */
export function darkenColor(hex, amount = -20) {
  let r, g, b
  if (hex.startsWith('#')) {
    const v = parseInt(hex.slice(1), 16)
    r = (v >> 16) & 0xff
    g = (v >> 8) & 0xff
    b = v & 0xff
  } else if (hex.startsWith('rgb')) {
    const m = hex.match(/\d+/g)
    if (!m || m.length < 3) return hex
    r = parseInt(m[0])
    g = parseInt(m[1])
    b = parseInt(m[2])
  } else {
    return hex
  }
  r = Math.max(0, Math.min(255, r + amount))
  g = Math.max(0, Math.min(255, g + amount))
  b = Math.max(0, Math.min(255, b + amount))
  return `rgb(${r},${g},${b})`
}

// ═══════════════════════════════════════════
//  进度条
// ═══════════════════════════════════════════

/**
 * 绘制进度条（HP/MP/经验值等通用进度条）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 左上角 X
 * @param {number} y 左上角 Y
 * @param {number} w 宽度
 * @param {number} h 高度
 * @param {number} ratio 当前进度比例 (0~1)
 * @param {string} [color='#4caf50'] 填充颜色
 * @param {string} [text=''] 显示文字（可选）
 * @param {number} dpr 设备像素比
 */
export function drawBar(ctx, x, y, w, h, ratio, color = '#4caf50', text = '', dpr = 1) {
  const radius = Math.min(h / 2, 4 * dpr)

  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  // 填充
  if (ratio > 0) {
    const fillW = Math.max(h, w * Math.min(1, ratio))
    ctx.fillStyle = color
    roundRect(ctx, x, y, fillW, h, radius)
    ctx.fill()
  }

  // 边框
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 1 * dpr
  roundRect(ctx, x, y, w, h, radius)
  ctx.stroke()

  // 文字
  if (text) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.max(10, h * 0.5)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + w / 2, y + h / 2)
  }
}

// ═══════════════════════════════════════════
//  几何判断
// ═══════════════════════════════════════════

/**
 * 判断点是否在矩形内
 * @param {number} px 点 X
 * @param {number} py 点 Y
 * @param {number} rx 矩形左上角 X
 * @param {number} ry 矩形左上角 Y
 * @param {number} rw 矩形宽度
 * @param {number} rh 矩形高度
 * @returns {boolean}
 */
export function isInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh
}

// ═══════════════════════════════════════════
//  文本工具
// ═══════════════════════════════════════════

/**
 * 绘制带描边的文字（增强可读性）
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text 文本内容
 * @param {number} x 中心 X
 * @param {number} y 中心 Y
 * @param {object} opts 配置项
 * @param {string} [opts.font] 字体
 * @param {string} [opts.color='#ffffff'] 填充色
 * @param {string} [opts.strokeColor='#000000'] 描边色
 * @param {number} [opts.strokeWidth=2] 描边宽度
 * @param {string} [opts.align='center'] 对齐方式
 */
export function drawTextWithStroke(ctx, text, x, y, opts = {}) {
  const {
    font = '14px sans-serif',
    color = '#ffffff',
    strokeColor = '#000000',
    strokeWidth = 2,
    align = 'center'
  } = opts

  ctx.font = font
  ctx.textAlign = align
  ctx.textBaseline = 'middle'

  // 描边层
  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    ctx.lineJoin = 'round'
    ctx.strokeText(text, x, y)
  }

  // 填充层
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}
