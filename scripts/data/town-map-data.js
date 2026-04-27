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
  // ==================== 背景装饰层（最底层） ====================
  
  // 左侧森林区域
  { type: MAP_OBJ_TYPE.OBSTACLE, x: -20, y: 300, width: 180, height: 220, assetKey: 'TOWN_FOREST', name: '左森林', collisionPadding: 10, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 100, y: 480, width: 140, height: 180, assetKey: 'TOWN_FOREST', name: '左森林2', collisionPadding: 10, layer: 'main' },
  // 新增：左上角森林
  { type: MAP_OBJ_TYPE.OBSTACLE, x: -30, y: 30, width: 170, height: 200, assetKey: 'TOWN_FOREST', name: '左上森林1', collisionPadding: 10, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 120, y: -20, width: 150, height: 170, assetKey: 'TOWN_FOREST', name: '左上森林2', collisionPadding: 10, layer: 'main' },
  
  // 右侧森林区域
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1850, y: 250, width: 180, height: 240, assetKey: 'TOWN_FOREST', name: '右森林', collisionPadding: 10, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1750, y: 500, width: 160, height: 200, assetKey: 'TOWN_FOREST', name: '右森林2', collisionPadding: 10, layer: 'main' },
  // 新增：右上角森林
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1830, y: -10, width: 190, height: 220, assetKey: 'TOWN_FOREST', name: '右上森林1', collisionPadding: 10, layer: 'main' },
  
  // 底部森林带
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 300, y: 1050, width: 200, height: 170, assetKey: 'TOWN_FOREST', name: '底森林1', collisionPadding: 10, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1500, y: 1020, width: 220, height: 200, assetKey: 'TOWN_FOREST', name: '底森林2', collisionPadding: 10, layer: 'main' },
  // 新增：底部中间森林 + 底部左侧森林
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 850, y: 1080, width: 200, height: 150, assetKey: 'TOWN_FOREST', name: '底中森林', collisionPadding: 10, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 50, y: 1020, width: 170, height: 200, assetKey: 'TOWN_FOREST', name: '底左森林', collisionPadding: 10, layer: 'main' },

  // 新增：中部空白区森林点缀（主干道北侧大片区）
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 420, y: 180, width: 160, height: 140, assetKey: 'TOWN_FOREST', name: '中北森林1', collisionPadding: 10, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1250, y: 150, width: 170, height: 130, assetKey: 'TOWN_FOREST', name: '中北森林2', collisionPadding: 10, layer: 'main' },

  // ==================== 建筑物层 ====================
  
  // 商店 - 右上角区域
  { type: MAP_OBJ_TYPE.BUILDING, x: 1550, y: 180, width: 160, height: 140, assetKey: 'TOWN_SHOP', 
    name: '商店', collisionPadding: 8, npcId: 'shop_keeper', layer: 'main' },
    
  // 武器库 - 右侧中部
  { type: MAP_OBJ_TYPE.BUILDING, x: 1600, y: 520, width: 170, height: 150, assetKey: 'TOWN_WEAPON_SHOP', 
    name: '武器库', collisionPadding: 8, npcId: 'blacksmith', layer: 'main' },
    
  // 药品店 - 左下区域
  { type: MAP_OBJ_TYPE.BUILDING, x: 150, y: 780, width: 165, height: 145, assetKey: 'TOWN_POTION_SHOP', 
    name: '药品店', collisionPadding: 8, npcId: 'potion_seller', layer: 'main' },
    
  // 任务告示栏 - 左上区域
  { type: MAP_OBJ_TYPE.BUILDING, x: 280, y: 180, width: 175, height: 130, assetKey: 'TOWN_QUEST_BOARD', 
    name: '冒险者公会', collisionPadding: 8, npcId: 'quest_giver', layer: 'main' },

  // ==================== 树木障碍物（围绕边界和路径） ====================
  
  // 顶部边界树木（加密）
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 280, y: 70, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '树1', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 420, y: 50, width: 55, height: 80, assetKey: 'TOWN_TREE', name: '树2', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 550, y: 80, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '树3', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 700, y: 60, width: 55, height: 80, assetKey: 'TOWN_TREE', name: '树4', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 820, y: 45, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '树5', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 950, y: 70, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '树6', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1080, y: 55, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '树7', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1150, y: 85, width: 55, height: 72, assetKey: 'TOWN_TREE', name: '树8', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1280, y: 60, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '树9', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1380, y: 65, width: 55, height: 82, assetKey: 'TOWN_TREE', name: '树10', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1500, y: 75, width: 55, height: 76, assetKey: 'TOWN_TREE', name: '树11', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1680, y: 55, width: 55, height: 80, assetKey: 'TOWN_TREE', name: '树12', collisionPadding: 12, layer: 'main' },

  // 左侧树木
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 30, y: 180, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '左树1', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 45, y: 320, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '左树2', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 50, y: 600, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '左树3', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 35, y: 760, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '左树4', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 80, y: 920, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '左树5', collisionPadding: 12, layer: 'main' },

  // 右侧树木
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1900, y: 120, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '右树1', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1920, y: 280, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '右树2', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1920, y: 420, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '右树3', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1880, y: 600, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '右树4', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1880, y: 780, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '右树5', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1930, y: 950, width: 55, height: 80, assetKey: 'TOWN_TREE', name: '右树6', collisionPadding: 12, layer: 'main' },

  // 中间散落树木（填充主干道北侧空白区）
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 380, y: 260, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '中树1', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 520, y: 380, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '中树2', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 650, y: 250, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '中树3', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 780, y: 350, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '中树4', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1180, y: 240, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '中树5', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1320, y: 320, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '中树6', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1450, y: 230, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '中树7', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1350, y: 360, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '中树8', collisionPadding: 12, layer: 'main' },

  // 主干道南侧散落树木
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 400, y: 700, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '南树1', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 580, y: 850, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '南树2', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 600, y: 720, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '南树3', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 780, y: 800, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '南树4', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1100, y: 740, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '南树5', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1250, y: 820, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '南树6', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1420, y: 760, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '南树7', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1280, y: 900, width: 55, height: 78, assetKey: 'TOWN_TREE', name: '南树8', collisionPadding: 12, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1600, y: 800, width: 55, height: 75, assetKey: 'TOWN_TREE', name: '南树9', collisionPadding: 12, layer: 'main' },

  // ==================== 石块障碍物 ====================
  // 原有石块
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 850, y: 380, width: 45, height: 38, assetKey: 'TOWN_ROCK', name: '石块1', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1100, y: 420, width: 40, height: 35, assetKey: 'TOWN_ROCK', name: '石块2', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 450, y: 680, width: 42, height: 36, assetKey: 'TOWN_ROCK', name: '石块3', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1480, y: 700, width: 44, height: 37, assetKey: 'TOWN_ROCK', name: '石块4', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 900, y: 920, width: 43, height: 36, assetKey: 'TOWN_ROCK', name: '石块5', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1180, y: 960, width: 40, height: 35, assetKey: 'TOWN_ROCK', name: '石块6', collisionPadding: 5, layer: 'main' },
  // 新增石块（散布各空旷区）
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 260, y: 260, width: 42, height: 36, assetKey: 'TOWN_ROCK', name: '石块7', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 720, y: 180, width: 40, height: 35, assetKey: 'TOWN_ROCK', name: '石块8', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1400, y: 200, width: 44, height: 37, assetKey: 'TOWN_ROCK', name: '石块9', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1680, y: 350, width: 43, height: 36, assetKey: 'TOWN_ROCK', name: '石块10', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 330, y: 550, width: 40, height: 35, assetKey: 'TOWN_ROCK', name: '石块11', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 820, y: 640, width: 42, height: 36, assetKey: 'TOWN_ROCK', name: '石块12', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1150, y: 630, width: 44, height: 37, assetKey: 'TOWN_ROCK', name: '石块13', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 1520, y: 900, width: 43, height: 36, assetKey: 'TOWN_ROCK', name: '石块14', collisionPadding: 5, layer: 'main' },
  { type: MAP_OBJ_TYPE.OBSTACLE, x: 500, y: 950, width: 40, height: 35, assetKey: 'TOWN_ROCK', name: '石块15', collisionPadding: 5, layer: 'main' },

  // ==================== 装饰层（无碰撞，前景） ====================
  //
  // ⚠️ 禁区（所有装饰物不得落入以下矩形内部）：
  // 建筑物：公会[280~455,180~310] 商店[1550~1710,180~320] 武器库[1600~1770,520~670] 药品店[150~315,780~925]
  // 森林：左森林[-20~160,300~520] 左森林2[100~240,480~660] 左上1[-30~140,30~230] 左上2[120~270,-20~150]
  //       右森林[1850~2030,250~490] 右森林2[1750~1910,500~700] 右上1[1830~2020,-10~210]
  //       底1[300~500,1050~1220] 底2[1500~1720,1020~1220] 底中[850~1050,1080~1230] 底左[50~220,1020~1220]
  //       中北1[420~580,180~320] 中北2[1250~1420,150~280]

  // ── 草堆 ──
  { type: MAP_OBJ_TYPE.DECORATION, x: 200, y: 350,   width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1480, y: 320, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 700, y: 720, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1250, y: 880, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆4', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 290, y: 135, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆5', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 880, y: 180, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆6', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1150, y: 160, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆7', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1730, y: 140, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆8', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 330, y: 620, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆9', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1050, y: 800, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆10', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1380, y: 650, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆11', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 550, y: 1000, width: 50, height: 45, assetKey: 'TOWN_GRASS_PILE', name: '草堆12', layer: 'fg' },

  // ── 单片草 ──
  { type: MAP_OBJ_TYPE.DECORATION, x: 295, y: 165, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 350, y: 450, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 480, y: 780, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1520, y: 880, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草4', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 380, y: 920, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草5', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1080, y: 720, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草6', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 150, y: 250, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草7', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 465, y: 190, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草8', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 595, y: 340, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草9', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 750, y: 260, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草10', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1000, y: 200, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草11', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1195, y: 295, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草12', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1480, y: 220, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草13', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1780, y: 200, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草14', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 195, y: 540, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草15', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 340, y: 750, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草16', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 495, y: 620, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草17', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 850, y: 680, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草18', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1020, y: 600, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草19', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1200, y: 650, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草20', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1460, y: 585, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草21', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1780, y: 630, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草22', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 330, y: 940, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草23', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 420, y: 900, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草24', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 340, y: 1030, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草25', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 540, y: 1000, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草26', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1150, y: 980, width: 35, height: 32, assetKey: 'TOWN_GRASS3', name: '草27', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1430, y: 1000, width: 35, height: 32, assetKey: 'TOWN_GRASS', name: '草28', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1760, y: 960, width: 35, height: 32, assetKey: 'TOWN_GRASS2', name: '草29', layer: 'fg' },

  // ── 花朵（全部坐标已校验，不与任何建筑/障碍物重叠）──
  // ★ 公会周边（仅y>310区域）
  { type: MAP_OBJ_TYPE.DECORATION, x: 260, y: 420, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '公会花1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 305, y: 450, width: 26, height: 26, assetKey: 'TOWN_FLOWER2', name: '公会花2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 235, y: 475, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '公会花3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 290, y: 505, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '公会花4', layer: 'fg' },
  // ★ 商店周边（左侧x<1550 + 下方y>320）
  { type: MAP_OBJ_TYPE.DECORATION, x: 1440, y: 340, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '商店花1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1480, y: 370, width: 26, height: 26, assetKey: 'TOWN_FLOWER2', name: '商店花2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1410, y: 395, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '商店花3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1470, y: 430, width: 28, height: 28, assetKey: 'TOWN_FLOWER2', name: '商店花4', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1560, y: 360, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '商店花5', layer: 'fg' },
  // ★ 中央区域花丛
  { type: MAP_OBJ_TYPE.DECORATION, x: 560, y: 760, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '中花1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 605, y: 795, width: 26, height: 26, assetKey: 'TOWN_FLOWER2', name: '中花2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 530, y: 815, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '中花3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 585, y: 845, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '中花4', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1315, y: 840, width: 28, height: 28, assetKey: 'TOWN_FLOWER3', name: '中花5', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1365, y: 875, width: 27, height: 27, assetKey: 'TOWN_FLOWER1', name: '中花6', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1290, y: 895, width: 28, height: 28, assetKey: 'TOWN_FLOWER2', name: '中花7', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1355, y: 925, width: 26, height: 26, assetKey: 'TOWN_FLOWER3', name: '中花8', layer: 'fg' },
  // ★ 北侧空地
  { type: MAP_OBJ_TYPE.DECORATION, x: 200, y: 125, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '北花1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 245, y: 155, width: 26, height: 26, assetKey: 'TOWN_FLOWER2', name: '北花2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 320, y: 230, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '北花3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 460, y: 105, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '北花4', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 620, y: 135, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '北花5', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 820, y: 115, width: 26, height: 26, assetKey: 'TOWN_FLOWER2', name: '北花6', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 985, y: 145, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '北花7', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1180, y: 110, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '北花8', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1435, y: 305, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '北花9', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1780, y: 230, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '北花10', layer: 'fg' },
  // ★ 主干道北侧空白区（避开公会+中北森林1）
  { type: MAP_OBJ_TYPE.DECORATION, x: 465, y: 340, width: 28, height: 28, assetKey: 'TOWN_FLOWER2', name: '道北花1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 600, y: 345, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '道北花2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 790, y: 305, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '道北花3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 950, y: 280, width: 26, height: 26, assetKey: 'TOWN_FLOWER2', name: '道北花4', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1095, y: 300, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '道北花5', layer: 'fg' },
  // ★ 主干道南侧空白区（避开药品店+武器库）
  { type: MAP_OBJ_TYPE.DECORATION, x: 320, y: 650, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '道南花1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 485, y: 685, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '道南花2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 730, y: 645, width: 26, height: 26, assetKey: 'TOWN_FLOWER2', name: '道南花3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 885, y: 705, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '道南花4', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1065, y: 675, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '道南花5', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1225, y: 725, width: 26, height: 26, assetKey: 'TOWN_FLOWER2', name: '道南花6', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1390, y: 695, width: 27, height: 27, assetKey: 'TOWN_FLOWER3', name: '道南花7', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1560, y: 735, width: 28, height: 28, assetKey: 'TOWN_FLOWER1', name: '道南花8', layer: 'fg' },
  // ★ 底部区域（各森林缝隙）
  { type: MAP_OBJ_TYPE.DECORATION, x: 235, y: 955, width: 28, height: 28, assetKey: 'TOWN_FLOWER3', name: '底花1', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 245, y: 1010, width: 27, height: 27, assetKey: 'TOWN_FLOWER1', name: '底花2', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 535, y: 965, width: 28, height: 28, assetKey: 'TOWN_FLOWER2', name: '底花3', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 760, y: 1045, width: 26, height: 26, assetKey: 'TOWN_FLOWER3', name: '底花4', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1090, y: 1060, width: 27, height: 27, assetKey: 'TOWN_FLOWER1', name: '底花5', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1290, y: 975, width: 28, height: 28, assetKey: 'TOWN_FLOWER2', name: '底花6', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1490, y: 1005, width: 26, height: 26, assetKey: 'TOWN_FLOWER3', name: '底花7', layer: 'fg' },
  { type: MAP_OBJ_TYPE.DECORATION, x: 1740, y: 985, width: 27, height: 27, assetKey: 'TOWN_FLOWER1', name: '底花8', layer: 'fg' },
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
    
    const padding = obj.collisionPadding || 0
    
    collisions.push({
      type: 'rect',
      x: obj.x + padding,
      y: obj.y + padding,
      width: obj.width - padding * 2,
      height: obj.height - padding * 2,
      name: obj.name,
    })
  }
  
  return collisions
}
