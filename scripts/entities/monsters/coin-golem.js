/**
 * 金币傀儡 - 怪物配置（单一数据源，第三章·集市小镇）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：被贪婪之力铸成的金币傀儡，高防高血。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'coin_golem',
  name: '金币傀儡',
  level: 10,
  maxHp: 230,
  atk: 28,
  def: 22,
  spd: 9,
  crit: 0.06,
  renderConfig: {
    assetPrefix: 'COIN_GOLEM',
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
  exp: 48,
  gold: 60, // 金币相关怪，金币掉落更高
  isRanged: false,
  aiPattern: 'defensive',
  equipment: {
    name: '金币铠甲',
    type: 'armor',
    stats: { def: 14, maxHp: 50 }
  },
  skills: [
    { name: '金币飞射', power: 1.4, type: 'attack' },
    { name: '财富震荡', power: 1.2, type: 'attack', target: 'all', mpCost: 15 }
  ],
  drop: [{ id: 'gold_ingot', name: '金锭', chance: 0.5 }]
}
