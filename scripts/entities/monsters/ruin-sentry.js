/**
 * 遗迹哨兵 - 怪物配置（单一数据源，第四章·古城遗迹）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：古城中沉睡的石卫，高防低速。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'ruin_sentry',
  name: '遗迹哨兵',
  level: 12,
  maxHp: 240,
  atk: 34,
  def: 28,
  spd: 8,
  crit: 0.05,
  renderConfig: {
    assetPrefix: 'RUIN_SENTRY',
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
  exp: 60,
  gold: 40,
  isRanged: false,
  aiPattern: 'defensive',
  equipment: {
    name: '石卫护甲',
    type: 'armor',
    stats: { def: 16, maxHp: 40 }
  },
  skills: [
    { name: '长戟突刺', power: 1.5, type: 'attack' },
    { name: '哨戒', power: 0, type: 'buff', effect: 'defense_up' }
  ],
  drop: [{ id: 'stone_shard', name: '碎石片', chance: 0.4 }]
}
