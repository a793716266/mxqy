/**
 * 水晶法师 - 怪物配置（单一数据源，第二章 BOSS）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'crystal_mage',
  name: '水晶法师',
  level: 15, // 修改为15级（原7级）
  maxHp: 400,
  atk: 35,
  def: 18,
  spd: 14,
  isRanged: true, // Boss远程：水晶法术从远处发动
  aiPattern: 'aggressive', // 激进：强力魔法轰炸
  crit: 0.18,
  renderConfig: {
    assetPrefix: 'CRYSTAL_MAGE',
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
  exp: 180,
  gold: 100,
  isBoss: true,
  isAnnie: true, // 特殊标记：这是安妮的Boss形态
  equipment: {
    name: '水晶法杖',
    type: 'weapon',
    stats: { atk: 20, crit: 0.08 }
  },
  skills: [
    { name: '水晶碎片', power: 1.6, type: 'magic' },
    { name: '水晶风暴', power: 1.4, type: 'magic', target: 'all' },
    { name: '魔力汲取', power: 2.0, type: 'magic', effect: 'drain' },
    { name: '水晶封印', power: 2.8, type: 'magic' }
  ],
  drop: [{ id: 'crystal_heart', name: '水晶之心', chance: 1.0 }],
  dialogue: [
    '你们也是来抢夺水晶之力的吗？',
    '我绝不会让任何人接近塔顶！',
    '这股力量...超出了我的想象...'
  ],
  purifyDialogue: [
    '水晶之力...原来不只是力量...',
    '我一直在追求强大的魔法，却忘记了魔法的真谛...',
    '请让我加入你们，用魔法守护这片大地！'
  ]
}
