/**
 * scene-base.js - 场景基类（统一所有场景的公共接口和构造逻辑）
 *
 * 所有场景（FieldScene、TownScene、BattleScene、MapScene 等）都必须继承此类。
 * 消除了每个场景中重复的 6 行属性赋值 + 接口契约约束。
 *
 * 使用方式：
 *   import { SceneBase } from '../core/scene-base.js'
 *   export class MyScene extends SceneBase {
 *     constructor(game, data) {
 *       super(game)
 *       // ... 场景特有初始化
 *     }
 *     init() { // ... }
 *     update(dt) { // ... }
 *     render(ctx) { // ... }
 *     handleTap(tap) { return false }  // 可选
 *   }
 */
export class SceneBase {
  /**
   * @param {object} game - Game 实例，提供 ctx/width/height/dpr/data/assets/audio/input 等
   */
  constructor(game) {
    /** @type {object} Game 引用 */
    this.game = game

    /** @type {CanvasRenderingContext2D} Canvas 2D 上下文 */
    this.ctx = game.ctx

    /** @type {number} 画布宽度（已乘 dpr） */
    this.width = game.width

    /** @type {number} 画布高度（已乘 dpr） */
    this.height = game.height

    /** @type {number} 设备像素比 */
    this.dpr = game.dpr

    /** @type {number} 场景运行时间（秒），由 Game 主循环累加 */
    this.time = 0
  }

  /**
   * 场景初始化（进入场景时调用一次）
   * 子类必须实现或确保不需要初始化逻辑
   */
  init() {}

  /**
   * 每帧更新
   * @param {number} dt - 距上一帧的时间差（秒）
   */
  update(dt) {}

  /**
   * 每帧渲染
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {}

  /**
   * 处理点击事件
   * @param {{x: number, y: number}} tap - 点击坐标（已乘 dpr）
   * @returns {boolean} 是否消费了此事件
   */
  handleTap(tap) { return false }

  /**
   * 场景销毁（离开场景时调用）
   * 用于清理事件监听、定时器等资源
   */
  destroy() {}
}
