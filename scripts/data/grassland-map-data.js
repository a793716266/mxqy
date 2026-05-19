/**
 * grassland-map-data.js - 阳光草原地图数据定义
 *
 * 程序化构建阳光草原地图，替代原来的 grassland.png
 * 地图尺寸: 4000 x 3000 逻辑像素（原2000x1500扩大一倍）
 */

// ========== 地图配置 ==========
export const GRASSLAND_MAP_CONFIG = {
  width: 4000,
  height: 3000,

  // 背景色（明亮的草地）
  bgColor: '#5daE4a',
  bgDarkColor: '#4d9e3c',

  // 小径颜色（草地上的踩踏痕迹）
  pathColor: '#70b85e',
  pathDarkColor: '#60a84e',
}

// ========== 地图对象类型枚举 ==========
export const GLAND_OBJ_TYPE = {
  OBSTACLE: 'obstacle',      // 有碰撞，不可通过
  DECORATION: 'decoration',  // 无碰撞，纯视觉
}

// ========== 阳光草原地图对象列表 ==========
// 坐标说明：逻辑像素，渲染时 × dpr
//
// ⚠️ 关键区域（避开放障碍物）：
//   出生点中心: (2000, 1500) 半径250
//   Boss位置: (3400, 240) 半径180（右上角远处）
//   边缘留白: 150px

export const GRASSLAND_MAP_OBJECTS = [
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 200, y: 160, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 380, y: 260, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 150, y: 400, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 450, y: 520, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 280, y: 700, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3550, y: 100, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3750, y: 280, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3450, y: 460, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3360, y: 650, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3680, y: 500, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 60, y: 800, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 90, y: 1020, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 50, y: 1240, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 100, y: 1480, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 70, y: 1720, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 85, y: 1960, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 55, y: 2200, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 95, y: 2440, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 65, y: 2680, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3840, y: 840, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3850, y: 1080, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3820, y: 1320, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3860, y: 1560, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3800, y: 1800, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3840, y: 2040, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3810, y: 2280, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3850, y: 2520, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3820, y: 2760, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 350, y: 2780, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 750, y: 2820, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1200, y: 2790, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1650, y: 2840, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2100, y: 2790, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2550, y: 2830, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3000, y: 2790, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3450, y: 2840, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3700, y: 2780, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 600, y: 50, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1050, y: 70, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1550, y: 48, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2050, y: 68, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2550, y: 46, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3050, y: 66, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3200, y: 44, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 520, y: 900, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 360, y: 1160, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 580, y: 1420, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 400, y: 1700, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 550, y: 1960, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 380, y: 2240, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 520, y: 2520, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3440, y: 900, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3600, y: 1180, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3420, y: 1460, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3580, y: 1740, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3450, y: 2020, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3620, y: 2300, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3480, y: 2560, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 900, y: 520, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1350, y: 450, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1850, y: 520, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2350, y: 460, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2850, y: 530, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3100, y: 420, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 920, y: 1980, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1400, y: 2080, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1900, y: 2020, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2450, y: 2100, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2950, y: 2050, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3100, y: 2220, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1200, y: 900, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1450, y: 1050, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2550, y: 920, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2750, y: 1080, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1250, y: 1950, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1520, y: 2100, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2500, y: 1920, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2700, y: 2080, width: 100, height: 170, w: 100, h: 170, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 720, y: 680, width: 44, height: 37, w: 44, h: 37, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1150, y: 920, width: 42, height: 36, w: 42, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1620, y: 720, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2180, y: 880, width: 43, height: 36, w: 43, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2680, y: 960, width: 44, height: 37, w: 44, h: 37, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 720, y: 1360, width: 42, height: 36, w: 42, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1200, y: 1640, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1720, y: 1940, width: 43, height: 36, w: 43, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2280, y: 1560, width: 44, height: 37, w: 44, h: 37, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2750, y: 1840, width: 42, height: 36, w: 42, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1050, y: 2280, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2640, y: 2480, width: 43, height: 36, w: 43, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 850, y: 2480, width: 44, height: 37, w: 44, h: 37, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1900, y: 2440, width: 42, height: 36, w: 42, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3100, y: 1380, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3200, y: 1720, width: 43, height: 36, w: 43, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1400, y: 1240, width: 44, height: 37, w: 44, h: 37, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2480, y: 1280, width: 42, height: 36, w: 42, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1820, y: 1280, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2100, y: 2240, width: 43, height: 36, w: 43, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3050, y: 130, width: 240, height: 190, w: 240, h: 190, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1250, y: 1460, width: 240, height: 190, w: 240, h: 190, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2580, y: 1480, width: 240, height: 190, w: 240, h: 190, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1880, y: 1440, width: 240, height: 190, w: 240, h: 190, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 320, y: 620, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 880, y: 520, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1480, y: 620, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2080, y: 540, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 7 },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2680, y: 680, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 480, y: 1060, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1120, y: 1260, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2480, y: 1260, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3180, y: 1140, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 720, y: 1740, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320, y: 1920, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2120, y: 1840, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2720, y: 2060, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3320, y: 1940, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 450, y: 2420, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1400, y: 2600, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2300, y: 2440, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3200, y: 2620, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 920, y: 820, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2250, y: 780, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1580, y: 1040, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1980, y: 2160, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1120, y: 1740, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2850, y: 1660, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1680, y: 2680, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2650, y: 2780, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 620, y: 1860, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2950, y: 2440, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1803, y: 519, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 9 },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2420, y: 600, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320, y: 820, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2050, y: 1440, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1480, y: 1760, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2480, y: 2040, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 780, y: 1140, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2150, y: 1140, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3520, y: 2200, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 550, y: 2700, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1950, y: 2800, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2750, y: 2840, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 260, y: 340, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 780, y: 280, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1340, y: 240, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1900, y: 280, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2520, y: 240, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3180, y: 320, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 260, y: 920, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 820, y: 860, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1400, y: 940, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2020, y: 900, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2620, y: 880, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3250, y: 940, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 260, y: 1400, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 820, y: 1500, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1420, y: 1460, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2060, y: 1500, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2660, y: 1460, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3280, y: 1500, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 260, y: 1900, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 920, y: 2060, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1520, y: 2360, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2140, y: 2220, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2740, y: 2380, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3340, y: 2300, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 480, y: 560, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1120, y: 640, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1720, y: 560, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2320, y: 640, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2920, y: 560, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3480, y: 640, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 480, y: 1160, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1180, y: 1080, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1780, y: 1160, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2380, y: 1080, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2980, y: 1160, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3480, y: 1080, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 520, y: 1660, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1220, y: 1740, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1820, y: 1660, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2420, y: 1740, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3020, y: 1660, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3480, y: 1740, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 580, y: 2180, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1280, y: 2260, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1880, y: 2180, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2480, y: 2260, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3080, y: 2180, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3480, y: 2260, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 620, y: 2660, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1820, y: 2740, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2680, y: 2660, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 400, y: 460, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2900, y: 360, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 360, y: 1260, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3080, y: 1340, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 380, y: 2060, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3100, y: 1980, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 400, y: 2540, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2100, y: 2620, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3180, y: 2580, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1520, y: 380, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2280, y: 380, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1620, y: 2540, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2380, y: 2580, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1380, y: 1380, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2580, y: 1380, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1380, y: 1620, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2580, y: 1620, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1920, y: 980, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2080, y: 1940, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1020, y: 1940, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2920, y: 1940, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1020, y: 980, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2920, y: 980, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1980, y: 2580, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1780, y: 380, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2720, y: 380, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1220, y: 2740, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2420, y: 2780, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3580, y: 2740, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 420, y: 480, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 780, y: 580, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1050, y: 520, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1580, y: 480, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2150, y: 560, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2650, y: 500, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3180, y: 540, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 420, y: 1000, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 980, y: 1120, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1580, y: 1080, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2180, y: 1120, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2780, y: 1040, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3380, y: 1100, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 500, y: 1640, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1020, y: 1800, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1620, y: 1720, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2220, y: 1760, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2820, y: 1680, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3380, y: 1780, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 500, y: 2200, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1080, y: 2420, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1720, y: 2280, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2320, y: 2420, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2920, y: 2240, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3520, y: 2420, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 620, y: 720, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1880, y: 660, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2480, y: 720, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3280, y: 680, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 680, y: 1300, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1880, y: 1340, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2520, y: 1320, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3280, y: 1360, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 680, y: 1900, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1880, y: 1940, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2520, y: 1920, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3280, y: 1960, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 720, y: 2480, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1480, y: 2480, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2680, y: 2520, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3580, y: 2540, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320, y: 680, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2180, y: 680, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320, y: 1320, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2180, y: 1960, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320, y: 1960, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1480, y: 1320, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1920, y: 2540, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 820, y: 2560, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2280, y: 2680, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1' },
]

/**
 * 从地图对象生成碰撞数据（供移动系统和怪物生成使用）
 */
export function generateGrasslandCollisions() {
  const collisions = []
  for (const obj of GRASSLAND_MAP_OBJECTS) {
    if (obj.type !== GLAND_OBJ_TYPE.OBSTACLE) continue
    const pad = obj.collisionPadding || 0

    // 兼容两种尺寸格式：w/h (原grassland格式) 和 width/height (编辑器导出格式)
    const objW = obj.w || obj.width || 64
    const objH = obj.h || obj.height || 64

    // ── 层次感碰撞逻辑 ──
    // 高大物体（树/灌木）的视觉高度 >> 实际碰撞区。
    // 碰撞只覆盖物体底部占地范围，让角色不能走进树身。
    // 渲染时靠 Y 轴排序产生伪3D层次感（前遮后）。
    let collW = objW - pad * 2
    let collH = objH - pad * 2
    let collX = obj.x + pad
    let collY = obj.y + pad

    if (obj.assetKey === 'TOWN_TREE') {
      // 树：碰撞覆盖树干部位（从70%高度开始到底部，即下部30%×50%宽度）
      // 这样碰撞框和视觉树干对齐，不会悬空到树冠区域
      collH = Math.max(20, objH * 0.30)
      collW = Math.max(28, objW * 0.50)
      collX = obj.x + (objW - collW) / 2   // 水平居中
      collY = obj.y + objH * 0.70           // 从70%处开始（树干部位）
    } else if (obj.assetKey === 'TOWN_FOREST') {
      // 森林/灌木：碰撞 = 下部35%（65%高度处开始）
      collH = Math.max(28, objH * 0.35)
      collW = Math.max(32, objW * 0.50)
      collX = obj.x + (objW - collW) / 2
      collY = obj.y + objH * 0.65
    } else if (obj.assetKey === 'TOWN_ROCK') {
      // 石块：碰撞 = 下部60%（整体偏下但对齐石头主体）
      collH = Math.max(18, objH * 0.60)
      collW = Math.max(20, objW * 0.65)
      collX = obj.x + (objW - collW) / 2
      collY = obj.y + objH * 0.40
    }
    // 草堆/花/草：保持全高全宽（贴地小物件）

    collisions.push({
      type: 'rect',
      x: collX,
      y: collY,
      width: collW,
      height: collH,
      name: obj.name || 'obstacle',
    })
  }
  return collisions
}

/**
 * 检查一个点是否与任何障碍物重叠
 */
export function isPointInObstacle(px, py, radius = 60, collisions) {
  if (!collisions) {
    collisions = generateGrasslandCollisions()
  }
  for (const obs of collisions) {
    if (obs.type === 'rect') {
      const closestX = Math.max(obs.x, Math.min(px, obs.x + obs.width))
      const closestY = Math.max(obs.y, Math.min(py, obs.y + obs.height))
      const distX = px - closestX
      const distY = py - closestY
      if (distX * distX + distY * distY < radius * radius) {
        return true
      }
    }
  }
  return false
}
