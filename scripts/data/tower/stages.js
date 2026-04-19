/**
 * tower/stages.js - 闯关关卡配置
 *
 * 关卡结构说明：
 * - id: 关卡编号（从1开始）
 * - name: 关卡名称
 * - desc: 描述
 * - monsterType: 怪物类型（影响掉落和难度）
 * - spawnInterval: 刷怪间隔(ms)，越小越快
 * - maxMonsters: 最大同时存在怪物数
 * - waves: 波次定义（可选，不填则随机刷怪）
 * - boss: BOSS标记（如 'goblin_shaman', 'orc_warlord', 'demon_lord'）
 *
 * 战斗机制：
 * - 每波怪物消灭后出现虫洞，靠近传送进入下一波
 * - 最后一波击败BOSS即胜利
 * - 全员阵亡则失败
 *
 * 怪物类型克制关系：
 * slime(史莱姆) < goblin(哥布林) < orc(兽人) < wolf(恶狼) < undead(亡灵) < demon(恶魔) < dragon(幼龙)
 */

export const TOWER_STAGES = [
  // ========== 第1章：初入试炼 ==========
  {
    id: 1,
    name: '初来乍到',
    desc: '简单的小试炼，熟悉操作',
    monsterType: 'slime',
    spawnInterval: 4000,
    maxMonsters: 5,
    waves: [
      { monsters: [{ type: 'slime', x: 0.65, y: 0.3 }, { type: 'slime', x: 0.7, y: 0.5 }] },
      { monsters: [{ type: 'slime', x: 0.68, y: 0.4 }, { type: 'slime', x: 0.72, y: 0.6 }, { type: 'slime', x: 0.75, y: 0.5 }] },
    ]
  },
  {
    id: 2,
    name: '史莱姆浪潮',
    desc: '大量史莱姆来袭',
    monsterType: 'slime',
    spawnInterval: 3000,
    maxMonsters: 8,
  },
  {
    id: 3,
    name: '哥布林的袭击',
    desc: '哥布林带着同伴出现',
    monsterType: 'goblin',
    spawnInterval: 3500,
    maxMonsters: 8,
    waves: [
      { monsters: [{ type: 'slime', x: 0.65, y: 0.25 }, { type: 'goblin', x: 0.7, y: 0.45 }] },
      { monsters: [{ type: 'goblin', x: 0.68, y: 0.3 }, { type: 'goblin', x: 0.72, y: 0.6 }] },
    ]
  },
  {
    id: 4,
    name: '森林深处',
    desc: '哥布林占据了森林',
    monsterType: 'goblin',
    spawnInterval: 2800,
    maxMonsters: 10,
  },
  {
    id: 5,
    name: '精英·哥布林萨满',
    desc: '击败萨满通过此关',
    monsterType: 'goblin',
    spawnInterval: 3000,
    maxMonsters: 10,
    boss: 'goblin_shaman', // 特殊BOSS标记
  },

  // ========== 第2章：兽人领地 ==========
  {
    id: 6,
    name: '兽人的咆哮',
    desc: '强大的兽人部落',
    monsterType: 'orc',
    spawnInterval: 3000,
    maxMonsters: 10,
  },
  {
    id: 7,
    name: '战狼群',
    desc: '成群的恶狼包围了你',
    monsterType: 'wolf',
    spawnInterval: 2000,
    maxMonsters: 12,
  },
  {
    id: 8,
    name: '双线作战',
    desc: '狼群+兽人联合进攻',
    monsterType: 'orc',
    spawnInterval: 2500,
    maxMonsters: 12,
  },
  {
    id: 9,
    name: '兽人精锐',
    desc: '兽人的精英部队',
    monsterType: 'orc',
    spawnInterval: 2200,
    maxMonsters: 12,
  },
  {
    id: 10,
    name: '精英·兽人战王',
    desc: '击败战王的堡垒',
    monsterType: 'orc',
    spawnInterval: 2500,
    maxMonsters: 14,
    boss: 'orc_warlord',
  },

  // ========== 第3章：亡灵禁地 ==========
  {
    id: 11,
    name: '亡灵的呼吸',
    desc: '阴森的亡灵领域',
    monsterType: 'undead',
    spawnInterval: 2800,
    maxMonsters: 12,
  },
  {
    id: 12,
    name: '骷髅海',
    desc: '无尽的骷髅大军',
    monsterType: 'undead',
    spawnInterval: 1800,
    maxMonsters: 15,
  },
  {
    id: 13,
    name: '幽灵缠身',
    desc: '幽灵比骷髅更难对付',
    monsterType: 'undead',
    spawnInterval: 2200,
    maxMonsters: 12,
  },
  {
    id: 14,
    name: '地狱前线',
    desc: '恶魔大军压境',
    monsterType: 'demon',
    spawnInterval: 2500,
    maxMonsters: 14,
  },
  {
    id: 15,
    name: '精英·恶魔领主',
    desc: '最终决战',
    monsterType: 'demon',
    spawnInterval: 2000,
    maxMonsters: 15,
    boss: 'demon_lord',
  },
]

/**
 * 根据品质从 EQUIPMENT_CH1 筛选对应装备模板
 * 注意：需要上层保证 EQUIPMENT_CH1 已加载
 */
export function getTowerEquipmentTemplates(EQUIPMENT_CH1) {
  const byQuality = { legendary: [], epic: [], rare: [], common: [] }
  for (const eq of Object.values(EQUIPMENT_CH1)) {
    const q = eq.rarity || 'common'
    if (byQuality[q]) byQuality[q].push(eq)
  }
  return byQuality
}
