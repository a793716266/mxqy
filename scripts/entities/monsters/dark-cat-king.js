/**
 * 暗影猫王 - 怪物配置（单一数据源，BOSS）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'dark_cat_king',
  name: '暗影猫王',
  level: 10,
  maxHp: 500,
  atk: 32,
  def: 22,
  spd: 13,
  isRanged: true, // Boss远程：暗影法术从远处发动
  aiPattern: 'aggressive', // 激进：高伤暗影法术
  crit: 0.20,
  renderConfig: {
    assetPrefix: 'CAT', // Boss使用猫咪通用资源
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
  exp: 200,
  gold: 120,
  isBoss: true,
  equipment: {
    // 最终Boss装备
    name: '暗影王冠',
    type: 'accessory',
    stats: { atk: 15, def: 10, maxHp: 80, crit: 0.05 }
  },
  skills: [
    { name: '暗影爪击', power: 1.8, type: 'attack' },
    { name: '暗影领域', power: 1.2, type: 'attack', target: 'all' },
    { name: '生命吸取', power: 1.5, type: 'attack', effect: 'drain' },
    { name: '暗影爆发', power: 2.5, type: 'attack' },
    { name: '暗影之怒', power: 3.0, type: 'attack', superArmor: true }
  ],
  drop: [{ id: 'dark_gem', name: '暗影宝石', chance: 1.0 }],
  dialogue: [
    '哼，你竟敢闯入我的领地！',
    '喵星的光芒...让我来熄灭它！',
    '可恶...这股力量...'
  ]
}
