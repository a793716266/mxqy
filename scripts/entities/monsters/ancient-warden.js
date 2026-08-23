/**
 * 远古守望者 - 怪物配置（单一数据源，第四章·古城遗迹·BOSS）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：古城的远古守护者，被虚无之雾扭曲，是小贝的 Boss 形态（isXiaobei）。
 * 击败后播放感化独白（purifyDialogue），通关解锁小贝（xiaobei）。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'ancient_warden',
  name: '远古守望者',
  level: 18, // 第四章 Boss：由 ancient-ruins-dungeon bossStatsOverride 锚定原生属性，避免 getEnemyByLevel 双膨胀
  maxHp: 1100,
  atk: 52,
  def: 30,
  spd: 12,
  crit: 0.15,
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
    targetHeight: 80,
    frameDuration: 0.15
  },
  exp: 500,
  gold: 300,
  isBoss: true,
  isXiaobei: true, // 特殊标记：小贝的 Boss 形态
  isRanged: false,
  aiPattern: 'defensive', // 防御：护盾 + 守护
  equipment: {
    name: '守望者壁垒',
    type: 'armor',
    stats: { def: 20, maxHp: 120 }
  },
  skills: [
    { name: '泰山压顶', power: 1.8, type: 'attack', effect: 'petrify' },
    { name: '守护壁垒', power: 0, type: 'buff', effect: 'shield' },
    { name: '远古轰鸣', power: 1.6, type: 'attack', target: 'all' },
    { name: '终焉守望', power: 2.8, type: 'magic' }
  ],
  drop: [{ id: 'warden_core', name: '守望核心', chance: 1.0 }],
  dialogue: [
    '这片遗迹，不容任何活物玷污。',
    '古老的封印，由我守护到最后一刻。',
    '……你们，唤醒了沉睡的守望者。'
  ],
  purifyDialogue: [
    '原来封印早已完成，我守护的只是执念……',
    '真正的守护，是守护身边的人，而非冰冷的石墙。',
    '让我加入你们，成为一堵真正的墙！'
  ]
}
