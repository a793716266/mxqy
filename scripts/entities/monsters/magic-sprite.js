/**
 * 魔法精灵 - 怪物配置（单一数据源，第二章）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'magic_sprite',
  name: '魔法精灵',
  level: 4,
  maxHp: 85,
  atk: 18,
  def: 8,
  spd: 14,
  crit: 0.08,
  renderConfig: {
    assetPrefix: 'MAGIC_SPRITE',
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
  exp: 25,
  gold: 15,
  isRanged: true, // 远程：保持距离施法
  aiPattern: 'aggressive', // 激进：魔法轰炸
  skills: [
    { name: '魔法弹', power: 1.4, type: 'magic' },
    { name: '魔力风暴', power: 1.8, type: 'magic' }
  ],
  drop: [{ id: 'magic_dust', name: '魔法粉尘', chance: 0.3 }]
}
