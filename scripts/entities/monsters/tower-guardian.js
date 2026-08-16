/**
 * 塔楼守护者 - 怪物配置（单一数据源，第二章精英）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'tower_guardian',
  name: '塔楼守护者',
  level: 6,
  maxHp: 250,
  atk: 30,
  def: 20,
  spd: 10,
  crit: 0.10,
  renderConfig: {
    assetPrefix: 'TOWER_GUARDIAN',
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
  exp: 70,
  gold: 50,
  isElite: true,
  aiPattern: 'defensive', // 防御：守护 + 嘲讽
  equipment: {
    name: '守护铠甲',
    type: 'armor',
    stats: { def: 12, maxHp: 40 }
  },
  skills: [
    { name: '守护一击', power: 1.8, type: 'attack' },
    { name: '嘲讽怒吼', power: 0.8, type: 'attack', target: 'all' },
    { name: '钢铁防御', power: 0, type: 'buff', effect: 'defense_up' }
  ],
  drop: [{ id: 'guardian_shield', name: '守护者盾牌', chance: 0.5 }]
}
