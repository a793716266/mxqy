/**
 * 遗迹巨像 - 怪物配置（单一数据源，第四章·古城遗迹·精英）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：古城中的远古巨像，超高血肉双厚。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'ruin_colossus',
  name: '遗迹巨像',
  level: 16,
  maxHp: 600,
  atk: 46,
  def: 30,
  spd: 10,
  crit: 0.10,
  renderConfig: {
    assetPrefix: 'RUIN_COLOSSUS',
    spriteType: 'enemy',
    totalWalkFrames: 8,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'opposite',
    shadow: true,
    targetHeight: 80,
    frameDuration: 0.15
  },
  exp: 160,
  gold: 120,
  isElite: true,
  isRanged: false,
  aiPattern: 'defensive',
  equipment: {
    name: '巨像核心',
    type: 'armor',
    stats: { def: 18, maxHp: 80 }
  },
  skills: [
    { name: '巨岩碾压', power: 1.9, type: 'attack' },
    { name: '地震波', power: 1.4, type: 'attack', target: 'all', mpCost: 15 },
    { name: '岩盾', power: 0, type: 'buff', effect: 'defense_up' }
  ],
  drop: [{ id: 'colossus_core', name: '巨像核心', chance: 0.5 }]
}
