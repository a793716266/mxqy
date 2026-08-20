/**
 * map-nodes.js - 地图节点配置（从 enemies.js 提取）
 *
 * 定义游戏地图的所有节点（城镇、道路、Boss点）及其连接关系。
 * 原本混在 enemies.js 中，属于组织错误——地图节点不是敌人数据。
 */

export const MAP_NODES = {
  // 第一章
  'ch1_town': {
    id: 'ch1_town',
    name: '喵星小镇',
    type: 'town',
    bg: 'images/backgrounds/bg_town.png',
    x: 100, y: 400,
    connections: ['ch1_road1'],
    npc: [
      { name: '猫村长', dialogue: '臻宝，草原上有危险的野猫出没，请帮忙处理！' },
      { name: '商人猫', type: 'shop' }
    ]
  },
  'ch1_road1': {
    id: 'ch1_road1',
    name: '小镇外围',
    type: 'road',
    bg: 'images/backgrounds/bg_grassland.png',
    x: 250, y: 350,
    connections: ['ch1_town', 'ch1_road2'],
    encounters: [
      { enemy: 'wild_cat', chance: 0.3 },
      { enemy: 'shadow_mouse', chance: 0.2 }
    ]
  },
  'ch1_road2': {
    id: 'ch1_road2',
    name: '草原深处',
    type: 'road',
    bg: 'images/backgrounds/bg_grassland.png',
    x: 400, y: 300,
    connections: ['ch1_road1', 'ch1_road3'],
    encounters: [
      { enemy: 'wild_cat', chance: 0.3 },
      { enemy: 'slime_cat', chance: 0.3 }
    ]
  },
  'ch1_road3': {
    id: 'ch1_road3',
    name: '森林入口',
    type: 'road',
    bg: 'images/backgrounds/bg_forest.png',
    x: 550, y: 280,
    connections: ['ch1_road2', 'ch1_boss'],
    encounters: [
      { enemy: 'slime_cat', chance: 0.3 },
      { enemy: 'shadow_mouse', chance: 0.3 }
    ]
  },
  'ch1_boss': {
    id: 'ch1_boss',
    name: '暗影巢穴',
    type: 'boss',
    bg: 'images/backgrounds/bg_boss.png',
    x: 650, y: 250,
    connections: ['ch1_road3'],
    boss: 'lost_healer_cat',
    defeated: false
  }
}
