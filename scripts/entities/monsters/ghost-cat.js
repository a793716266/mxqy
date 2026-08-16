/**
 * 幽灵猫 - 怪物配置（单一数据源，第二章）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'ghost_cat',
  name: '幽灵猫',
  level: 5,
  maxHp: 70,
  atk: 22,
  def: 6,
  spd: 18,
  crit: 0.12,
  renderConfig: {
    assetPrefix: 'GHOST_CAT',
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
  exp: 28,
  gold: 18,
  isRanged: true, // 远程：穿墙袭击从远处发动
  aiPattern: 'aggressive', // 激进：高速穿刺
  skills: [
    { name: '幽灵爪', power: 1.6, type: 'attack' },
    { name: '穿墙袭击', power: 2.0, type: 'attack' }
  ],
  drop: [{ id: 'ghost_essence', name: '幽灵精华', chance: 0.3 }]
}
