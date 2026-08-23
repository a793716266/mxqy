/**
 * 打手头目 - 怪物配置（单一数据源，第三章·集市小镇·精英）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：盗贼团伙的精英打手，皮厚力大。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'thug_leader',
  name: '打手头目',
  level: 12,
  maxHp: 450,
  atk: 38,
  def: 24,
  spd: 12,
  crit: 0.10,
  renderConfig: {
    assetPrefix: 'THUG_LEADER',
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
  exp: 110,
  gold: 80,
  isElite: true, // 精英：高成长 + 自带装备
  isRanged: false,
  aiPattern: 'defensive',
  equipment: {
    name: '头目护腕',
    type: 'armor',
    stats: { def: 14, maxHp: 60 }
  },
  skills: [
    { name: '蛮力重拳', power: 1.8, type: 'attack' },
    { name: '威吓怒吼', power: 0.9, type: 'attack', target: 'all' },
    { name: '铁壁', power: 0, type: 'buff', effect: 'defense_up' }
  ],
  drop: [{ id: 'thief_signet', name: '盗匪印戒', chance: 0.5 }]
}
