/**
 * render-layer-config.js - 统一渲染层级配置
 *
 * 所有场景共用同一套层级定义。
 * 数字越小越先绘制（在底层），数字越大越后绘制（在上层）。
 *
 * ┌─────────────────────────────────────────┐
 * │  LAYER_UI (7)       UI、碰撞调试        │ ← 最上层
 * │  LAYER_PLAYER (6)   主角                │
 * │  LAYER_NPC (5)      队友/NPC            │
 * │  LAYER_MONSTER (4)  怪物                │
 * │  LAYER_INTERACT (3) 宝箱/交互对象       │
 * │  LAYER_OBSTACLE (2) 障碍物/树木/建筑    │ ← 参与Y轴排序
 * │  LAYER_DECORATION(1)草/花装饰物          │ ← 始终最底层
 * │  LAYER_GROUND (0)   草地/地图背景        │ ← 最底层
 * └─────────────────────────────────────────┘
 *
 * 调整规则：
 *   - LAYER_DECORATION ~ LAYER_OBSTACLE 之间可以参与 Y 轴排序产生伪3D层次感
 *   - LAYER_DECORATION 固定在最底层，不参与排序（草花不能遮挡角色）
 *   - LAYER_PLAYER 及以上固定顺序，不参与排序
 */

// ========== 层级常量 ==========
export const RENDER_LAYER = {
  GROUND:      0,   // 草地/地图背景
  DECORATION:  1,   // 装饰物（草、花）—— 始终在最底层，不参与Y排序
  OBSTACLE:    2,   // 障碍物/树木/灌木/建筑 —— 参与Y轴排序
  INTERACT:    3,   // 可交互对象（宝箱）—— 参与Y轴排序
  MONSTER:     4,   // 怪物 —— 参与Y轴排序
  NPC:         5,   // 队友/NPC —— 参与Y轴排序
  PLAYER:      6,   // 主角 —— 最后绘制（永远在最前）
  UI:          7,   // UI元素、摇杆、碰撞调试框
}

// ========== 各实体类型的默认层级映射 ==========
// key: 实体类型字符串, value: RENDER_LAYER 常量
export const ENTITY_RENDER_LAYER = {
  // 地图对象类型 → 层级
  ground:           RENDER_LAYER.GROUND,
  decoration:       RENDER_LAYER.DECORATION,   // 草/花
  obstacle:         RENDER_LAYER.OBSTACLE,     // 树/石/灌木/建筑

  // 游戏实体类型 → 层级
  chest:            RENDER_LAYER.INTERACT,     // 宝箱
  monster:          RENDER_LAYER.MONSTER,      // 怪物
  follower:         RENDER_LAYER.NPC,          // 队友
  npc:              RENDER_LAYER.NPC,          // NPC
  player:           RENDER_LAYER.PLAYER,       // 主角
}

// ========== 是否参与Y轴排序 ==========
export const SORTABLE_LAYERS = new Set([
  RENDER_LAYER.OBSTACLE,
  RENDER_LAYER.INTERACT,
  RENDER_LAYER.MONSTER,
  RENDER_LAYER.NPC,
])
// DECORATION 和 PLAYER 不参与排序，固定位置

// ========== 辅助函数 ==========

/**
 * 查询某实体类型的渲染层级
 * @param {string} entityType - 实体类型（如 'decoration', 'obstacle', 'player' 等）
 * @returns {number} RENDER_LAYER 常量
 */
export function getRenderLayer(entityType) {
  return ENTITY_RENDER_LAYER[entityType] ?? RENDER_LAYER.OBSTACLE
}

/**
 * 判断某层级是否参与Y轴排序
 * @param {number} layer - RENDER_LAYER 常量
 * @returns {boolean}
 */
export function isSortableLayer(layer) {
  return SORTABLE_LAYERS.has(layer)
}
