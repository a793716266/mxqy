/**
 * 流浪猫首领 - 怪物配置（单一数据源）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'stray_leader',
  name: '流浪猫首领',
  level: 5,
  maxHp: 180,
  atk: 24,
  def: 14,
  spd: 12,
  crit: 0.10,
  aiPattern: 'support', // 辅助：召唤小弟 + 群体控制
  renderConfig: {
    assetPrefix: 'CAT', // 使用猫咪通用资源
    spriteType: 'enemy',
    totalWalkFrames: 8,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
    shadow: true,
    targetHeight: 80,
    frameDuration: 0.15
  },
  exp: 50,
  gold: 35,
  isElite: true,
  equipment: {
    // 精英自带装备
    name: '锋利爪套',
    type: 'weapon',
    stats: { atk: 8, crit: 0.05 }
  },
  skills: [
    { name: '利爪连击', power: 1.5, type: 'attack' },
    { name: '召唤小弟', power: 0, type: 'summon', summonId: 'wild_cat' },
    { name: '怒吼', power: 1.0, type: 'attack', target: 'all', effect: 'stun' },
    { name: '撕裂', power: 2.0, type: 'attack' }
  ],
  drop: [{ id: 'cat_collar', name: '猫项圈', chance: 0.5 }]
}
