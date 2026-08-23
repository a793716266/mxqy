/**
 * 诅咒石像 - 怪物配置（单一数据源，第四章·古城遗迹）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：古城中的诅咒法师石像，远程魔法输出。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'cursed_idol',
  name: '诅咒石像',
  level: 13,
  maxHp: 150,
  atk: 44,
  def: 12,
  spd: 12,
  crit: 0.10,
  renderConfig: {
    assetPrefix: 'CURSED_IDOL',
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
  exp: 58,
  gold: 38,
  isRanged: true, // 远程：诅咒射线从远处发动
  aiPattern: 'aggressive',
  skills: [
    { name: '诅咒射线', power: 1.7, type: 'magic' },
    { name: '石化凝视', power: 1.4, type: 'magic', effect: 'petrify' }
  ],
  drop: [{ id: 'idol_shard', name: '石像碎片', chance: 0.4 }]
}
