/**
 * 黑金奸商 - 怪物配置（单一数据源，第三章·集市小镇·BOSS）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：被虚无之雾侵蚀的贪婪商人，是钱多多的 Boss 形态（isQianduoduo）。
 * 击败后播放感化独白（purifyDialogue），通关解锁钱多多（qianduoduo）。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'corrupt_merchant',
  name: '黑金奸商',
  level: 14, // 第三章 Boss：由 magic-tower-dungeon bossStatsOverride 锚定原生属性，避免 getEnemyByLevel 双膨胀
  maxHp: 700,
  atk: 45,
  def: 22,
  spd: 13,
  crit: 0.15,
  renderConfig: {
    assetPrefix: 'CORRUPT_MERCHANT',
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
  exp: 300,
  gold: 200,
  isBoss: true,
  isQianduoduo: true, // 特殊标记：钱多多的 Boss 形态
  isRanged: false,
  aiPattern: 'aggressive', // 激进：金钱轰炸
  equipment: {
    name: '算盘权杖',
    type: 'weapon',
    stats: { atk: 20, crit: 0.08 }
  },
  skills: [
    { name: '金币风暴', power: 1.6, type: 'attack', target: 'all' },
    { name: '勒索', power: 1.8, type: 'attack' },
    { name: '财富结界', power: 0, type: 'buff', effect: 'shield' },
    { name: '黑心审判', power: 2.6, type: 'magic' }
  ],
  drop: [{ id: 'gilded_coin', name: '鎏金币', chance: 1.0 }],
  dialogue: [
    '哼，这片集市的一切都由我说了算！',
    '想过去？先交够买路钱！',
    '我的金币……我的宝藏……谁也别想抢走！'
  ],
  purifyDialogue: [
    '原来我一直在用贪婪填满心里的空洞……',
    '钱买不来同伴，也买不来真正的安心。',
    '请让我加入你们，用这份力量去守护真正值得的人！'
  ]
}
