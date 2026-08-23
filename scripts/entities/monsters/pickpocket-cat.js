/**
 * 扒手猫 - 怪物配置（单一数据源，第三章·集市小镇）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：黑雾侵蚀的流浪猫扒手，敏捷近战。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'pickpocket_cat',
  name: '扒手猫',
  level: 9,
  maxHp: 130,
  atk: 30,
  def: 12,
  spd: 16,
  crit: 0.12,
  renderConfig: {
    assetPrefix: 'PICKPOCKET_CAT',
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
  exp: 45,
  gold: 30,
  isRanged: false,
  aiPattern: 'aggressive',
  skills: [
    { name: '飞爪', power: 1.6, type: 'attack' },
    { name: '窃影', power: 1.3, type: 'attack' }
  ],
  drop: [{ id: 'stolen_coin', name: '失窃金币', chance: 0.35 }]
}
