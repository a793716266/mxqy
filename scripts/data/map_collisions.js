/**
 * 地图碰撞配置
 * 用于标记地图上的障碍物区域
 * 
 * 坐标说明：
 * - 使用逻辑像素坐标（非物理像素）
 * - 原点在左上角
 * - X轴向右增加，Y轴向下增加
 */

// 动态导入小镇碰撞数据（避免循环依赖）
let _townCollisions = null

async function _getTownCollisions() {
  if (_townCollisions === null) {
    const { generateTownCollisions } = await import('./town-map-data.js')
    _townCollisions = generateTownCollisions()
  }
  return _townCollisions
}

export const MAP_COLLISIONS = {
  grassland: {
    name: '阳光草原',
    obstacles: [
      // 示例障碍物（需要玩家实际标记）
      // { type: 'rect', x: 500, y: 300, width: 100, height: 80, name: '大树1' },
      // { type: 'circle', x: 800, y: 600, radius: 50, name: '水池' },
    ]
  },
  
  town: {
    name: '喵星村',
    // 碰撞数据由 town-map-data.js 动态生成
    // 通过 getMapCollisions('town') 获取时自动加载
    _dynamic: true,
    obstacles: []
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
export async function getMapCollisions(mapId) {
  const mapData = MAP_COLLISIONS[mapId]
  if (!mapData) return []
  
  // 小镇使用动态生成的碰撞数据
  if (mapData._dynamic && mapId === 'town') {
    return await _getTownCollisions()
  }
  
  return mapData.obstacles || []
}

/**
 * 同步版本（用于field-scene等已存在的同步调用场景）
 * 小镇数据在首次调用时缓存
 */
export function getMapCollisionsSync(mapId) {
  const mapData = MAP_COLLISIONS[mapId]
  if (!mapData) return []
  
  if (mapData._dynamic && mapId === 'town' && _townCollisions !== null) {
    return _townCollisions
  }
  
  return mapData.obstacles || []
}
