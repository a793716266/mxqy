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
let _grasslandCollisions = null

async function _getTownCollisions() {
  if (_townCollisions === null) {
    const { generateTownCollisions } = await import('./town-map-data.js')
    _townCollisions = generateTownCollisions()
  }
  return _townCollisions
}

async function _getGrasslandCollisions() {
  if (_grasslandCollisions === null) {
    const { generateGrasslandCollisions } = await import('./grassland-map-data.js')
    _grasslandCollisions = generateGrasslandCollisions()
  }
  return _grasslandCollisions
}

export const MAP_COLLISIONS = {
  grassland: {
    name: '阳光草原',
    // 碰撞数据由 grassland-map-data.js 动态生成
    _dynamic: true,
    obstacles: []
  },
  
  town: {
    name: '喵星村',
    // 碰撞数据由 town-map-data.js 动态生成
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
  
  // 阳光草原使用动态生成的碰撞数据
  if (mapData._dynamic && mapId === 'grassland') {
    return await _getGrasslandCollisions()
  }
  
  return mapData.obstacles || []
}

/**
 * 同步版本（用于field-scene等已存在的同步调用场景）
 * 小镇/草地数据在首次调用时缓存
 */
export function getMapCollisionsSync(mapId) {
  const mapData = MAP_COLLISIONS[mapId]
  if (!mapData) return []
  
  if (mapData._dynamic && mapId === 'town' && _townCollisions !== null) {
    return _townCollisions
  }
  
  if (mapData._dynamic && mapId === 'grassland' && _grasslandCollisions !== null) {
    return _grasslandCollisions
  }
  
  return mapData.obstacles || []
}
