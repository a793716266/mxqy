/**
 * 尘怨灵 - 怪物配置（单一数据源，第四章·古城遗迹）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：古城中的怨灵尘雾，高速远程骚扰。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'dust_wraith',
  name: '尘怨灵',
  level: 14,
  maxHp: 140,
  atk: 38,
  def: 10,
  spd: 22, // 速度极高
  crit: 0.12,
  renderConfig: {
    assetPrefix: 'DUST_WRAITH',
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
  exp: 56,
  gold: 34,
  isRanged: true, // 远程：怨灵弹
  aiPattern: 'aggressive',
  skills: [
    { name: '怨灵弹', power: 1.6, type: 'magic' },
    { name: '尘暴', power: 1.3, type: 'magic', target: 'all' }
  ],
  drop: [{ id: 'wraith_ash', name: '怨灵灰', chance: 0.4 }]
}
