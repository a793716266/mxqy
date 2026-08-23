/**
 * 市集老鼠 - 怪物配置（单一数据源，第三章·集市小镇）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：被虚无之雾侵蚀的集市鼠群，速度极快、偷窃成性。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'market_rat',
  name: '市集老鼠',
  level: 8,
  maxHp: 110,
  atk: 26,
  def: 10,
  spd: 20, // 速度极高，典型"高速低防"的骚扰型怪
  crit: 0.10,
  renderConfig: {
    assetPrefix: 'MARKET_RAT',
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
  exp: 40,
  gold: 25,
  isRanged: false,
  aiPattern: 'aggressive', // 激进：贴脸速攻
  skills: [
    { name: '啃咬', power: 1.5, type: 'attack' },
    { name: '顺手牵羊', power: 1.2, type: 'attack', effect: 'steal' }
  ],
  drop: [{ id: 'rat_whisker', name: '鼠须', chance: 0.3 }]
}
