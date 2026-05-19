/**
 * town-map-data.js - 小镇地图数据定义
 * 
 * 用像素素材程序化构建小镇地图，替代原来的 village.jpeg
 * 地图尺寸: 2000 x 1200 逻辑像素（比原village.jpeg稍大，更宽敞）
 */

// ========== 地图配置 ==========
export const TOWN_MAP_CONFIG = {
  // 地图尺寸（逻辑像素）
  width: 2000,
  height: 1200,
  
  // 背景色（草地绿）
  bgColor: '#4a8c3f',
  // 深色草地纹理
  bgDarkColor: '#3e7a34',
  
  // 土路颜色（像素风：踩踏痕迹，偏黄绿色）
  roadColor: '#6b9e5e',
  roadDarkColor: '#5a8a4d',
}

// ========== 程序化道路区域数据 ==========
// 每个区域是一个矩形，使用对应素材填充
// 类型说明：
//   straight_h - 水平直路（road_h）
//   straight_v - 垂直直路（road_h旋转90°）
//   cross     - 十字路口（road_cross）
//   t_north   - T字路口朝北（road_t，上方开口）
//   t_south   - T字路口朝南
//   t_east    - T字路口朝东
//   t_west    - T字路口朝西
//   curve     - 弯道（road_curve）
//
// 所有尺寸为逻辑像素，渲染时 × dpr

export const TOWN_ROAD_ZONES = [
  // ══════════════════════════════════════
  //  一、主干道（东西横贯）
  // ══════════════════════════════════════

  // 西段：地图左边缘 → 中央十字路口
  { type: 'straight_h', x: 0,    y: 508, width: 885,  h: 140 },

  // 东段：中央十字路口 → 地图右边缘
  { type: 'straight_h', x: 1095, y: 508, width: 905,  h: 140 },

  // ══════════════════════════════════════
  //  二、中央纵向路（十字路口向南）
  // ══════════════════════════════════════

  // 北半段：十字路口 → 中间
  { type: 'straight_v', x: 915, y: 555, width: 140, height: 200 },

  // 南半段：中间 → 存档点附近
  { type: 'straight_v', x: 915, y: 765, width: 140, height: 220 },

  // ══════════════════════════════════════
  //  三、分支路（从主干道出发到各建筑）
  // ══════════════════════════════════════

  // --- 西北分支：主干道 → 冒险者公会 ---
  { type: 'straight_v', x: 310, y: 300, width: 115, height: 230 },

  // --- 东北分支：主干道 → 商店 ---
  { type: 'straight_v', x: 1570, y: 240, width: 120, height: 290 },

  // --- 东侧分支：主干道 → 武器库 ---
  { type: 'straight_v', x: 1615, y: 555, width: 115, height: 185 },

  // --- 西南分支：主干道 → 村长位置 ---
  { type: 'straight_v', x: 690, y: 555, width: 115, height: 185 },

  // --- 南西分支：中央南路 → 药品店 ---
  { type: 'straight_h', x: 155, y: 880, width: 785, height: 120 },

  // ══════════════════════════════════════
  //  四、特殊路口素材（覆盖在路段之上）
  // ══════════════════════════════════════

  // 中央十字路口（主干道 × 中央南路）
  { type: 'cross',  x: 885, y: 530, width: 200, height: 190 },

  // 武器库T字口（东侧纵向 × 主干道）
  { type: 't_north', x: 1595, y: 535, width: 155, height: 175 },
]


// ========== 地图对象类型枚举 ==========
export const MAP_OBJ_TYPE = {
  // 建筑物（有碰撞 + 可交互提示）
  BUILDING: 'building',
  // 障碍物（有碰撞，不可通过）
  OBSTACLE: 'obstacle',
  // 装饰物（无碰撞，纯视觉）
  DECORATION: 'decoration',
  // 道路（无碰撞，视觉引导）
  ROAD: 'road',
  // NPC位置标记（无碰撞，用于定位）
  NPC_SPOT: 'npc_spot',
}

// ========== 完整地图对象列表 ==========
// 每个对象包含：type, x, y, width, height, assetKey, name, collisionPadding
export const TOWN_MAP_OBJECTS = [
  { type: MAP_OBJ_TYPE.OBSTACLE, x: -20, y: 300, width: 180, height: 220, w: 180, h: 220, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 100, y: 480, width: 140, height: 180, w: 140, h: 180, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 480, y: 173, width: 170, height: 200, w: 170, h: 200, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 621, y: 284, width: 150, height: 170, w: 150, h: 170, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1850, y: 36, width: 180, height: 240, w: 180, h: 240, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1750, y: 500, width: 160, height: 200, w: 160, h: 200, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1844, y: 195, width: 190, height: 220, w: 190, h: 220, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 300, y: 1050, width: 200, height: 170, w: 200, h: 170, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1500, y: 1020, width: 220, height: 200, w: 220, h: 200, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 850, y: 1080, width: 200, height: 150, w: 200, h: 150, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 50, y: 1020, width: 170, height: 200, w: 170, h: 200, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 358, y: 161, width: 160, height: 140, w: 160, h: 140, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1250, y: 150, width: 170, height: 130, w: 170, h: 130, assetKey: 'TOWN_FOREST', collisionPadding: 10 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 920, y: 295, width: 350, height: 240, w: 350, h: 240, assetKey: 'TOWN_SHOP', collisionPadding: 46, npcId: 'shop_keeper' },
  { type: MAP_OBJ_TYPE.BUILDING, x: 445, y: 363, width: 170, height: 150, w: 170, h: 150, assetKey: 'TOWN_WEAPON_SHOP', collisionPadding: 8, npcId: 'blacksmith' },
  { type: MAP_OBJ_TYPE.BUILDING, x: 1076, y: 664, width: 165, height: 145, w: 165, h: 145, assetKey: 'TOWN_POTION_SHOP', collisionPadding: 8, npcId: 'potion_seller' },
  { type: MAP_OBJ_TYPE.BUILDING, x: 441, y: 659, width: 175, height: 130, w: 175, h: 130, assetKey: 'TOWN_QUEST_BOARD', collisionPadding: 8, npcId: 'quest_giver' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 204, y: 222, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 272, y: 251, width: 55, height: 80, w: 55, h: 80, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 655, y: 66, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 700, y: 60, width: 55, height: 80, w: 55, h: 80, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 820, y: 45, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 950, y: 70, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1080, y: 55, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1150, y: 85, width: 55, height: 72, w: 55, h: 72, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1280, y: 60, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1380, y: 65, width: 55, height: 82, w: 55, h: 82, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1500, y: 75, width: 55, height: 76, w: 55, h: 76, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1680, y: 55, width: 55, height: 80, w: 55, h: 80, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 20, y: 236, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 45, y: 320, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 50, y: 600, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 35, y: 760, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 80, y: 920, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1874, y: 471, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1331, y: 609, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1939, y: 471, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1880, y: 600, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1880, y: 780, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1930, y: 950, width: 55, height: 80, w: 55, h: 80, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 609, y: 180, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 505, y: 178, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 902, y: 404, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 780, y: 350, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1208, y: 193, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1320, y: 320, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1450, y: 230, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1350, y: 360, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 359, y: 672, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 580, y: 850, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 770, y: 946, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 780, y: 800, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1142, y: 849, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1250, y: 820, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1420, y: 760, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1282, y: 421, width: 55, height: 78, w: 55, h: 78, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1600, y: 800, width: 55, height: 75, w: 55, h: 75, assetKey: 'TOWN_TREE', collisionPadding: 12 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 850, y: 380, width: 45, height: 38, w: 45, h: 38, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 854, y: 240, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 303, y: 792, width: 42, height: 36, w: 42, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1480, y: 700, width: 44, height: 37, w: 44, h: 37, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 900, y: 920, width: 43, height: 36, w: 43, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1180, y: 960, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 289, y: 552, width: 42, height: 36, w: 42, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 720, y: 180, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1400, y: 200, width: 44, height: 37, w: 44, h: 37, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1460, y: 664, width: 43, height: 36, w: 43, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 330, y: 550, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 942, y: 219, width: 42, height: 36, w: 42, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 999, y: 264, width: 44, height: 37, w: 44, h: 37, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1452, y: 706, width: 43, height: 36, w: 43, h: 36, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 500, y: 950, width: 40, height: 35, w: 40, h: 35, assetKey: 'TOWN_ROCK', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 200, y: 350, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1272, y: 387, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 697, y: 903, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 957, y: 963, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 184, y: 190, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 880, y: 180, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1150, y: 160, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1730, y: 140, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 330, y: 620, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1068, y: 938, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1380, y: 650, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 550, y: 1000, width: 50, height: 45, w: 50, h: 45, assetKey: 'TOWN_GRASS_PILE', collisionPadding: 8, layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 474, y: 250, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 350, y: 450, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 480, y: 780, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1520, y: 880, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 380, y: 920, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1103, y: 869, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 150, y: 250, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 717, y: 818, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 432, y: 891, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 750, y: 260, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1000, y: 200, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1195, y: 295, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1480, y: 220, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1492, y: 173, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 195, y: 540, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 340, y: 750, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 280, y: 715, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1001, y: 978, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1048, y: 848, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1305, y: 796, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1460, y: 585, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1780, y: 630, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 330, y: 940, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 420, y: 900, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 340, y: 1030, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 414, y: 941, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1150, y: 980, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1430, y: 1000, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1760, y: 960, width: 35, height: 32, w: 35, h: 32, assetKey: 'TOWN_GRASS2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 260, y: 420, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 305, y: 450, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 235, y: 475, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 290, y: 505, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1440, y: 340, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1571, y: 373, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1527, y: 334, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1546, y: 375, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1717, y: 388, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 257, y: 872, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 490, y: 883, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 530, y: 815, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 354, y: 881, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1315, y: 840, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1365, y: 875, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1265, y: 973, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1355, y: 925, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 123, y: 9, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 177, y: -1, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 70, y: 13, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 674, y: 297, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 620, y: 135, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 820, y: 115, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 985, y: 145, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1218, y: 40, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1489, y: 346, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1691, y: 389, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 299, y: 422, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 350, y: 332, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 790, y: 305, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 950, y: 280, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1159, y: 228, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 320, y: 650, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 399, y: 802, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 841, y: 929, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1108, y: 955, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1003, y: 948, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1371, y: 738, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1390, y: 695, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1560, y: 735, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 235, y: 955, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 245, y: 1010, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 535, y: 965, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 760, y: 1045, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1090, y: 1060, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1290, y: 975, width: 28, height: 28, w: 28, h: 28, assetKey: 'TOWN_FLOWER2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1490, y: 1005, width: 26, height: 26, w: 26, h: 26, assetKey: 'TOWN_FLOWER3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1740, y: 985, width: 27, height: 27, w: 27, h: 27, assetKey: 'TOWN_FLOWER1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.BUILDING, x: 284, y: 59, width: 79, height: 78, w: 79, h: 78, assetKey: 'TOWN_BUILDINGS_009_75X74', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 352, y: 355, width: 97, height: 144, w: 97, h: 144, assetKey: 'TOWN_BUILDINGS_010_93X140', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: -4, y: 33, width: 79, height: 78, w: 79, h: 78, assetKey: 'TOWN_BUILDINGS_009_75X74', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 356, y: 61, width: 79, height: 78, w: 79, h: 78, assetKey: 'TOWN_BUILDINGS_009_75X74', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 67, y: 47, width: 79, height: 78, w: 79, h: 78, assetKey: 'TOWN_BUILDINGS_009_75X74', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 211, y: 55, width: 79, height: 78, w: 79, h: 78, assetKey: 'TOWN_BUILDINGS_009_75X74', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 139, y: 53, width: 79, height: 78, w: 79, h: 78, assetKey: 'TOWN_BUILDINGS_009_75X74', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 425, y: 59, width: 76, height: 72, w: 76, h: 72, assetKey: 'TOWN_BUILDINGS_011_72X68', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 101, y: 263, width: 61, height: 60, w: 61, h: 60, assetKey: 'TOWN_BUILDINGS_023_57X56', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 1176, y: 505, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.DECORATION, x: -7, y: 100, width: 58, height: 61, w: 58, h: 61, assetKey: 'TOWN_BUILDINGS_024_54X57', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.DECORATION, x: 36, y: 100, width: 58, height: 61, w: 58, h: 61, assetKey: 'TOWN_BUILDINGS_024_54X57', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.DECORATION, x: 79, y: 102, width: 58, height: 61, w: 58, h: 61, assetKey: 'TOWN_BUILDINGS_024_54X57', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: -8, y: 121, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 52, y: 121, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 104, y: 123, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 164, y: 124, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 214, y: 126, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 273, y: 128, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 333, y: 129, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 391, y: 129, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 452, y: 126, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 1116, y: 506, width: 66, height: 47, w: 66, h: 47, assetKey: 'TOWN_BUILDINGS_025_62X43', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.DECORATION, x: 942, y: 501, width: 34, height: 54, w: 34, h: 54, assetKey: 'TOWN_BUILDINGS_032_30X50', collisionPadding: 5 },
  { type: MAP_OBJ_TYPE.BUILDING, x: 927, y: 475, width: 51, height: 55, w: 51, h: 55, assetKey: 'TOWN_BUILDINGS_028_47X51', collisionPadding: 5 },
]

// ========== NPC初始位置配置 ==========
// 与地图对象关联，NPC站在对应建筑附近
export const TOWN_NPC_POSITIONS = {
  village_chief: { x: 750, y: 700 },         // 村长 - 中央广场西侧（主干道旁）
  shop_keeper: { x: 1630, y: 350 },          // 商店老板 - 商店前方
  blacksmith: { x: 1680, y: 700 },           // 铁匠 - 武器库前方
  quest_giver: { x: 370, y: 350 },           // 冒险者公会 - 告示栏下方
  potion_seller: { x: 235, y: 950 },         // 药剂师 - 药品店前方
  save_point: { x: 985, y: 950 },            // 存档点 - 中央南端广场
}

// ========== 出生点 ==========
export const TOWN_SPAWN_POINT = {
  x: 985,  // 中央路口
  y: 700,
}

// ========== 从地图对象生成碰撞数据 ==========
export function generateTownCollisions() {
  const collisions = []
  
  for (const obj of TOWN_MAP_OBJECTS) {
    // 只有建筑物和障碍物才有碰撞
    if (obj.type !== MAP_OBJ_TYPE.BUILDING && obj.type !== MAP_OBJ_TYPE.OBSTACLE) continue
    
    const pad = obj.collisionPadding || 0

    // 兼容两种尺寸格式：w/h 和 width/height
    const objW = obj.width || obj.w || 64
    const objH = obj.height || obj.h || 64

    // ── 层次感碰撞逻辑（与 grassland 一致）──
    // 高大物体（树/森林）的视觉高度 >> 实际碰撞区。
    // 碰撞只覆盖物体底部占地范围。
    // 渲染时靠 Y 轴排序产生伪3D层次感（前遮后）。
    let collW = objW - pad * 2
    let collH = objH - pad * 2
    let collX = obj.x + pad
    let collY = obj.y + pad

    if (obj.assetKey === 'TOWN_TREE') {
      // 树：碰撞只覆盖树干部位（底部18%高度×42%宽度）
      collH = Math.max(14, objH * 0.18)
      collW = Math.max(23, objW * 0.42)
      collX = obj.x + (objW - collW) / 2   // 水平居中
      collY = obj.y + objH - collH          // 锚定在树根部
    } else if (obj.assetKey === 'TOWN_FOREST') {
      // 森林/灌木：碰撞 = 最底部树根区（20%高度×45%宽度）
      // 视觉上森林很高大，实际可通行区域应更大
      collH = Math.max(22, objH * 0.20)
      collW = Math.max(28, objW * 0.45)
      collX = obj.x + (objW - collW) / 2
      collY = obj.y + objH - collH
    } else if (obj.assetKey === 'TOWN_ROCK') {
      // 石块：碰撞 = 底部 55%
      collH = Math.max(15, objH * 0.55)
      collW = Math.max(18, objW * 0.60)
      collX = obj.x + (objW - collW) / 2
      collY = obj.y + objH - collH
    }
    // 建筑物保持全高全宽（玩家不能走进建筑）

    collisions.push({
      type: 'rect',
      x: collX,
      y: collY,
      width: collW,
      height: collH,
      name: obj.name,
    })
  }
  
  return collisions
}
