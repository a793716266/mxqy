/**
 * 石像守卫 - 怪物配置（单一数据源，第二章）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'stone_golem',
  name: '石像守卫',
  level: 5,
  maxHp: 120,
  atk: 20,
  def: 15,
  spd: 8, // 6 → 8 (适当提高移动速度，保持防御型特性)
  crit: 0.05,
  aiPattern: 'defensive', // 防御：岩石护体、坚守阵地
  renderConfig: {
    assetPrefix: 'STONE_GOLEM',
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
  exp: 30,
  gold: 20,
  skills: [
    { name: '岩石冲击', power: 1.5, type: 'attack', mpCost: 6 },
    { name: '地震', power: 1.2, type: 'attack', target: 'all', mpCost: 15 }
  ],
  drop: [{ id: 'stone_core', name: '石核', chance: 0.25 }]
}
