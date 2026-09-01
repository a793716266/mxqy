/**
 * 虚无之雾领主 - 怪物配置（终章·决战虚无之雾·BOSS）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：从古城遗迹被释放的远古混沌，没有英雄形态，是纯粹最终 Boss。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）或回退到 ANCIENT_WARDEN 精灵。
 */
module.exports = {
  id: 'void_mist_lord',
  name: '虚无之雾',
  level: 25,
  maxHp: 1800,
  atk: 70,
  def: 38,
  spd: 13,
  crit: 0.18,
  renderConfig: {
    assetPrefix: 'ANCIENT_WARDEN',
    spriteType: 'enemy',
    totalWalkFrames: 8,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'opposite',
    shadow: true,
    targetHeight: 90,
    frameDuration: 0.15,
  },
  exp: 800,
  gold: 500,
  isBoss: true,
  isRanged: false,
  aiPattern: 'defensive', // 防御：护盾 + 守护 + 高伤 AOE
  equipment: {
    name: '雾核壁垒',
    type: 'armor',
    stats: { def: 28, maxHp: 200 },
  },
  skills: [
    { name: '虚无重压', power: 2.0, type: 'attack', effect: 'petrify' },
    { name: '雾核壁垒', power: 0, type: 'buff', effect: 'shield' },
    { name: '终焉轰鸣', power: 1.8, type: 'attack', target: 'all' },
    { name: '湮灭凝视', power: 3.2, type: 'magic' },
  ],
  drop: [{ id: 'void_core', name: '虚无核心', chance: 1.0 }],
  dialogue: [
    '一切都将归于虚无。',
    '你们的挣扎，不过是雾中泡影。',
    '让我终结这出可笑的戏剧。',
  ],
  purifyDialogue: [
    '原来……虚无也会被勇气驱散。',
    '世界重新恢复了色彩。',
    '谢谢你们，真正的英雄。',
  ],
}
