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
  // ══════════════════════════════════════
  // 一、树木障碍物（约110棵）
  // ══════════════════════════════════════

  // --- 左上角树群 ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 200, y: 160,   w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左上1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 380, y: 260,   w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左上2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 150, y: 400,   w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左上3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 450, y: 520,   w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左上4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 280, y: 700,   w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左上5', collisionPadding: 12 },

  // --- 右上角树群（Boss附近留空） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3550,y: 100,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右上1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3750,y: 280,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右上2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3450,y: 460,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右上3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3360,y: 650,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: 'Boss西1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3680,y: 500,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: 'Boss东1', collisionPadding: 12 },

  // --- 左侧边界树（密集） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 60,  y: 800,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 90,  y: 1020, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 50,  y: 1240, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 100, y: 1480, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 70,  y: 1720, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界5', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 85,  y: 1960, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界6', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 55,  y: 2200, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界7', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 95,  y: 2440, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界8', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 65,  y: 2680, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左界9', collisionPadding: 12 },

  // --- 右侧边界树（密集） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3840,y: 840,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3850,y: 1080, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3820,y: 1320, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3860,y: 1560, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3800,y: 1800, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界5', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3840,y: 2040, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界6', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3810,y: 2280, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界7', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3850,y: 2520, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界8', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3820,y: 2760, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右界9', collisionPadding: 12 },

  // --- 底部边界树（密集） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 350, y: 2780, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 750, y: 2820, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1200,y: 2790, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1650,y: 2840, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2100,y: 2790, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界5', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2550,y: 2830, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界6', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3000,y: 2790, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界7', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3450,y: 2840, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界8', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3700,y: 2780, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '底界9', collisionPadding: 12 },

  // --- 顶部边界树（密集） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 600, y: 50,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '顶界1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1050,y: 70,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '顶界2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1550,y: 48,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '顶界3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2050,y: 68,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '顶界4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2550,y: 46,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '顶界5', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3050,y: 66,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '顶界6', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3200,y: 44,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '顶界7', collisionPadding: 12 },

  // --- 左中部散落（出生点左侧） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 520, y: 900,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左中1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 360, y: 1160, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左中2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 580, y: 1420, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左中3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 400, y: 1700, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左中4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 550, y: 1960, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左中5', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 380, y: 2240, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左中6', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 520, y: 2520, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '左中7', collisionPadding: 12 },

  // --- 右中部散落（出生点右侧） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3440,y: 900,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右中1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3600,y: 1180, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右中2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3420,y: 1460, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右中3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3580,y: 1740, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右中4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3450,y: 2020, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右中5', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3620,y: 2300, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右中6', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3480,y: 2560, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '右中7', collisionPadding: 12 },

  // --- 上中部散落（出生点北侧） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 900, y: 520,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '上中1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1350,y: 450,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '上中2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1850,y: 520,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '上中3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2350,y: 460,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '上中4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2850,y: 530,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '上中5', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3100,y: 420,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '上中6', collisionPadding: 12 },

  // --- 下中部散落（出生点南侧） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 920, y: 1980, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '下中1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1400,y: 2080, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '下中2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1900,y: 2020, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '下中3', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2450,y: 2100, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '下中4', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2950,y: 2050, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '下中5', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3100,y: 2220, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '下中6', collisionPadding: 12 },

  // --- 中央四角散落（远离出生点） ---
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1200,y: 900,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '央左上1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1450,y: 1050, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '央左上2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2550,y: 920,  w: 100, h: 170, assetKey: 'TOWN_TREE', name: '央右上1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2750,y: 1080, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '央右上2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1250,y: 1950, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '央左下1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1520,y: 2100, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '央左下2', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2500,y: 1920, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '央右下1', collisionPadding: 12 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2700,y: 2080, w: 100, h: 170, assetKey: 'TOWN_TREE', name: '央右下2', collisionPadding: 12 },

  // ══════════════════════════════════════
  // 二、石块障碍物（30块）
  // ══════════════════════════════════════
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 720, y: 680,  w: 44, h: 37, assetKey: 'TOWN_ROCK', name: '石1', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1150,y: 920,  w: 42, h: 36, assetKey: 'TOWN_ROCK', name: '石2', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1620,y: 720,  w: 40, h: 35, assetKey: 'TOWN_ROCK', name: '石3', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2180,y: 880,  w: 43, h: 36, assetKey: 'TOWN_ROCK', name: '石4', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2680,y: 960,  w: 44, h: 37, assetKey: 'TOWN_ROCK', name: '石5', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 720, y: 1360, w: 42, h: 36, assetKey: 'TOWN_ROCK', name: '石6', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1200,y: 1640, w: 40, h: 35, assetKey: 'TOWN_ROCK', name: '石7', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1720,y: 1940, w: 43, h: 36, assetKey: 'TOWN_ROCK', name: '石8', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2280,y: 1560, w: 44, h: 37, assetKey: 'TOWN_ROCK', name: '石9', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2750,y: 1840, w: 42, h: 36, assetKey: 'TOWN_ROCK', name: '石10', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1050,y: 2280, w: 40, h: 35, assetKey: 'TOWN_ROCK', name: '石11', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2640,y: 2480, w: 43, h: 36, assetKey: 'TOWN_ROCK', name: '石12', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 850, y: 2480, w: 44, h: 37, assetKey: 'TOWN_ROCK', name: '石13', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1900,y: 2440, w: 42, h: 36, assetKey: 'TOWN_ROCK', name: '石14', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3100,y: 1380, w: 40, h: 35, assetKey: 'TOWN_ROCK', name: '石15', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3200,y: 1720, w: 43, h: 36, assetKey: 'TOWN_ROCK', name: '石16', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1400,y: 1240, w: 44, h: 37, assetKey: 'TOWN_ROCK', name: '石17', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2480,y: 1280, w: 42, h: 36, assetKey: 'TOWN_ROCK', name: '石18', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1820,y: 1280, w: 40, h: 35, assetKey: 'TOWN_ROCK', name: '石19', collisionPadding: 5 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2100,y: 2240, w: 43, h: 36, assetKey: 'TOWN_ROCK', name: '石20', collisionPadding: 5 },

  // ══════════════════════════════════════
  // 三、森林/灌木丛障碍物（15片）
  // ══════════════════════════════════════
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 600, y: 260,  w: 160, h: 190, name: '灌左上', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3050,y: 130, w: 240, h: 190, assetKey: 'TOWN_FOREST', name: '灌右上', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 180, y: 1540,w: 150, h: 190, name: '灌左侧', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3300,y: 1580,w: 155, h: 190, name: '灌右侧', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 650, y: 2320,w: 145, h: 190, name: '灌左下', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 3050,y: 2450,w: 150, h: 190, name: '灌右下', collisionPadding: 10 },
  // 额外灌木丛（填补空旷区域）
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1050,y: 700,  w: 140, h: 190, name: '灌左上内', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2750,y: 780,  w: 145, h: 190, name: '灌右上内', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1080,y: 2380, w: 140, h: 190, name: '灌左下内', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2820,y: 2300, w: 145, h: 190, name: '灌右下内', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1750,y: 800,  w: 130, h: 190, name: '灌上中', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1780,y: 2120, w: 130, h: 190, name: '灌下中', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1250,y: 1460, w: 240, h: 190,  assetKey: 'TOWN_FOREST', name: '灌左中', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 2580,y: 1480, w: 240, h: 190,  assetKey: 'TOWN_FOREST', name: '灌右中', collisionPadding: 10 },
  { type: GLAND_OBJ_TYPE.OBSTACLE, x: 1880,y: 1440, w: 240, h: 190,  assetKey: 'TOWN_FOREST', name: '灌中央', collisionPadding: 10 },

  // ══════════════════════════════════════
  // 四、装饰层 —— 大幅增加密度
  // ══════════════════════════════════════

  // 草堆（40个）
  { type: GLAND_OBJ_TYPE.DECORATION, x: 320, y: 620,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 880, y: 520,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1480,y: 620,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2080,y: 540,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆4' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2680,y: 680,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆5' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 480, y: 1060, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆6' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1120,y: 1260, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆7' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2480,y: 1260, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆8' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3180,y: 1140, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆9' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 720, y: 1740, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆10' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320,y: 1920, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆11' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2120,y: 1840, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆12' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2720,y: 2060, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆13' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3320,y: 1940, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆14' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 450, y: 2420, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆15' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1400,y: 2600, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆16' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2300,y: 2440, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆17' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3200,y: 2620, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆18' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 920, y: 820,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆19' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2250,y: 780,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆20' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1580,y: 1040, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆21' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1980,y: 2160, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆22' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1120,y: 1740, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆23' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2850,y: 1660, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆24' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1680,y: 2680, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆25' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2650,y: 2780, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆26' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 620, y: 1860, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆27' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2950,y: 2440, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆28' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1850,y: 560,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆29' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2420,y: 600,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆30' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320,y: 820,  w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆31' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2050,y: 1440, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆32' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1480,y: 1760, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆33' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2480,y: 2040, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆34' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 780, y: 1140, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆35' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2150,y: 1140, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆36' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3520,y: 2200, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆37' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 550, y: 2700, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆38' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1950,y: 2800, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆39' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2750,y: 2840, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆40' },

  // 单片草（80个——阳光草原核心装饰）
  { type: GLAND_OBJ_TYPE.DECORATION, x: 260, y: 340,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 780, y: 280,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1340,y: 240,  w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1900,y: 280,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c4' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2520,y: 240,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c5' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3180,y: 320,  w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c6' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 260, y: 920,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c7' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 820, y: 860,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c8' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1400,y: 940,  w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c9' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2020,y: 900,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c10' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2620,y: 880,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c11' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3250,y: 940,  w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c12' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 260, y: 1400, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c13' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 820, y: 1500, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c14' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1420,y: 1460, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c15' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2060,y: 1500, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c16' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2660,y: 1460, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c17' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3280,y: 1500, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c18' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 260, y: 1900, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c19' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 920, y: 2060, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c20' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1520,y: 2360, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c21' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2140,y: 2220, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c22' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2740,y: 2380, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c23' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3340,y: 2300, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c24' },
  // 第二层填充
  { type: GLAND_OBJ_TYPE.DECORATION, x: 480, y: 560,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c25' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1120,y: 640,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c26' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1720,y: 560,  w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c27' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2320,y: 640,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c28' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2920,y: 560,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c29' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3480,y: 640,  w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c30' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 480, y: 1160, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c31' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1180,y: 1080, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c32' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1780,y: 1160, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c33' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2380,y: 1080, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c34' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2980,y: 1160, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c35' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3480,y: 1080, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c36' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 520, y: 1660, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c37' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1220,y: 1740, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c38' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1820,y: 1660, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c39' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2420,y: 1740, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c40' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3020,y: 1660, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c41' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3480,y: 1740, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c42' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 580, y: 2180, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c43' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1280,y: 2260, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c44' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1880,y: 2180, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c45' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2480,y: 2260, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c46' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3080,y: 2180, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c47' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3480,y: 2260, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c48' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 620, y: 2660, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c49' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1820,y: 2740, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c50' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2680,y: 2660, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c51' },
  // 第三层补充（角落和边缘）
  { type: GLAND_OBJ_TYPE.DECORATION, x: 400, y: 460,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c52' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2900,y: 360,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c53' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 360, y: 1260, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c54' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3080,y: 1340, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c55' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 380, y: 2060, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c56' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3100,y: 1980, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c57' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 400, y: 2540, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c58' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2100,y: 2620, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c59' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3180,y: 2580, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c60' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1520,y: 380,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c61' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2280,y: 380,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c62' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1620,y: 2540, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c63' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2380,y: 2580, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c64' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1380,y: 1380, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c65' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2580,y: 1380, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c66' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1380,y: 1620, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c67' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2580,y: 1620, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c68' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1920,y: 980,  w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c69' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2080,y: 1940, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c70' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1020,y: 1940, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c71' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2920,y: 1940, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c72' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1020,y: 980,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c73' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2920,y: 980,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c74' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1980,y: 2580, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c75' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1780,y: 380,  w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c76' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2720,y: 380,  w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c77' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1220,y: 2740, w: 35, h: 32, assetKey: 'TOWN_GRASS3', name: 'c78' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2420,y: 2780, w: 35, h: 32, assetKey: 'TOWN_GRASS', name: 'c79' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3580,y: 2740, w: 35, h: 32, assetKey: 'TOWN_GRASS2', name: 'c80' },

  // 花朵（50个）
  { type: GLAND_OBJ_TYPE.DECORATION, x: 420, y: 480,  w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f1' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 780, y: 580,  w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f2' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1050,y: 520,  w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f3' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1580,y: 480,  w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f4' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2150,y: 560,  w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f5' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2650,y: 500,  w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f6' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3180,y: 540,  w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f7' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 420, y: 1000, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f8' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 980, y: 1120, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f9' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1580,y: 1080, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f10' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2180,y: 1120, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f11' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2780,y: 1040, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f12' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3380,y: 1100, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f13' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 500, y: 1640, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f14' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1020,y: 1800, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f15' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1620,y: 1720, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f16' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2220,y: 1760, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f17' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2820,y: 1680, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f18' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3380,y: 1780, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f19' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 500, y: 2200, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f20' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1080,y: 2420, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f21' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1720,y: 2280, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f22' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2320,y: 2420, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f23' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2920,y: 2240, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f24' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3520,y: 2420, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f25' },
  // 补充花朵
  { type: GLAND_OBJ_TYPE.DECORATION, x: 620, y: 720,  w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f26' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1880,y: 660,  w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f27' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2480,y: 720,  w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f28' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3280,y: 680,  w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f29' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 680, y: 1300, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f30' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1880,y: 1340, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f31' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2520,y: 1320, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f32' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3280,y: 1360, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f33' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 680, y: 1900, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f34' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1880,y: 1940, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f35' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2520,y: 1920, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f36' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3280,y: 1960, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f37' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 720, y: 2480, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f38' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1480,y: 2480, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f39' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2680,y: 2520, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f40' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 3580,y: 2540, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f41' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320,y: 680,  w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f42' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2180,y: 680,  w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f43' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320,y: 1320, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f44' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2180,y: 1960, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f45' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1320,y: 1960, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f46' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1480,y: 1320, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f47' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 1920,y: 2540, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', name: 'f48' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 820, y: 2560, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', name: 'f49' },
  { type: GLAND_OBJ_TYPE.DECORATION, x: 2280,y: 2680, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', name: 'f50' },
]

/**
 * 从地图对象生成碰撞数据（供移动系统和怪物生成使用）
 */
export function generateGrasslandCollisions() {
  const collisions = []
  for (const obj of GRASSLAND_MAP_OBJECTS) {
    if (obj.type !== GLAND_OBJ_TYPE.OBSTACLE) continue
    const pad = obj.collisionPadding || 0

    // ── 层次感碰撞逻辑 ──
    // 高大物体（树/灌木）的视觉高度 >> 实际碰撞区。
    // 碰撞只覆盖物体底部占地范围，让角色不能走进树身。
    // 渲染时靠 Y 轴排序产生伪3D层次感（前遮后）。
    let collW = obj.w - pad * 2
    let collH = obj.h - pad * 2
    let collX = obj.x + pad
    let collY = obj.y + pad

    if (obj.assetKey === 'TOWN_TREE') {
      // 树：碰撞只覆盖树干部位（底部30%高度×55%宽度）
      // 树冠不参与碰撞，层次感靠Y排序渲染实现
      collH = Math.max(28, obj.h * 0.30)
      collW = Math.max(30, obj.w * 0.55)
      collX = obj.x + (obj.w - collW) / 2   // 水平居中
      collY = obj.y + obj.h - collH          // 锚定在树根部
    } else if (obj.assetKey === 'TOWN_FOREST') {
      // 灌木：碰撞 = 底部 40%
      collH = Math.max(30, obj.h * 0.40)
      collW = Math.max(35, obj.w * 0.58)
      collX = obj.x + (obj.w - collW) / 2
      collY = obj.y + obj.h - collH
    } else if (obj.assetKey === 'TOWN_ROCK') {
      // 石块：碰撞 = 底部 65%（石头大部分不可通过）
      collH = Math.max(18, obj.h * 0.65)
      collW = Math.max(20, obj.w * 0.70)
      collX = obj.x + (obj.w - collW) / 2
      collY = obj.y + obj.h - collH
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
