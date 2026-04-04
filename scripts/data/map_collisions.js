/**
 * 地图碰撞配置
 * 用于标记地图上的障碍物区域
 * 
 * 坐标说明：
 * - 使用逻辑像素坐标（非物理像素）
 * - 原点在左上角
 * - X轴向右增加，Y轴向下增加
 * 
 * 如何标记障碍物：
 * 1. 在游戏中看到坐标显示（右上角黄色文字）
 * 2. 走到障碍物旁边，记录坐标
 * 3. 在下方数组中添加障碍物信息
 * 
 * 示例：
 * { type: 'rect', x: 500, y: 300, width: 100, height: 80, name: '大树' }
 * { type: 'circle', x: 800, y: 600, radius: 50, name: '水池' }
 */

export const MAP_COLLISIONS = {
  grassland: {
    name: '阳光草原',
    obstacles: [
      // 示例障碍物（需要玩家实际标记）
      // { type: 'rect', x: 500, y: 300, width: 100, height: 80, name: '大树1' },
      // { type: 'circle', x: 800, y: 600, radius: 50, name: '水池' },
    ]
  },
  
  // 其他地图的碰撞配置
  forest: {
    name: '迷雾森林',
    obstacles: []
  },
  
  cave: {
    name: '暗影洞穴',
    obstacles: []
  }
}

/**
 * 获取指定地图的碰撞数据
 */
export function getMapCollisions(mapId) {
  return MAP_COLLISIONS[mapId]?.obstacles || []
}
