/**
 * 骸骨猫 - 怪物配置（单一数据源，第四章·古城遗迹）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：古城中的不死猫骨，高攻中速近战。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'bone_cat',
  name: '骸骨猫',
  level: 13,
  maxHp: 160,
  atk: 40,
  def: 14,
  spd: 18,
  crit: 0.12,
  renderConfig: {
    assetPrefix: 'BONE_CAT',
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
  exp: 55,
  gold: 35,
  isRanged: false,
  aiPattern: 'aggressive',
  skills: [
    { name: '骨爪撕咬', power: 1.6, type: 'attack' },
    { name: '亡者尖啸', power: 1.3, type: 'magic' }
  ],
  drop: [{ id: 'bone_fragment', name: '骨片', chance: 0.35 }]
}
