/**
 * 塔楼守护者 - 怪物配置（单一数据源，第二章精英）
 * 属性 / 技能 / AI / 动画 / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 4 套动画（idle/walk/attack/skill）已切片为透明 PNG；
 *   hurt/death 复用 idle 帧（buildFrames 未注册 HURT/DEATH 键，
 *   由 _tryFallbackFrame 兜底为 idle）。
 */
module.exports = {
  id: 'tower_guardian',
  type: 'tower_guardian', // 与 enemyId 对齐，供 _renderCatMonster 识别
  name: '塔楼守护者',
  level: 6,
  maxHp: 250,
  atk: 30,
  def: 20,
  spd: 10,
  crit: 0.10,
  exp: 70,
  gold: 50,
  isElite: true,
  aiPattern: 'defensive', // 防御：守护 + 嘲讽
  equipment: {
    name: '守护铠甲',
    type: 'armor',
    stats: { def: 12, maxHp: 40 }
  },
  skills: [
    { name: '守护一击', power: 1.8, type: 'attack' },
    { name: '嘲讽怒吼', power: 0.8, type: 'attack', target: 'all' },
    { name: '钢铁防御', power: 0, type: 'buff', effect: 'defense_up' }
  ],
  drop: [{ id: 'guardian_shield', name: '守护者盾牌', chance: 0.5 }],

  // === 动画配置（4 套透明帧：idle/walk/attack/skill 各 8 帧）===
  animationConfig: {
    idle: {
      start: 1, end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/tower_guardian/idle/',
      framePad: 2,
      frameDuration: 220 // 重甲呼吸慢
    },
    walk: {
      start: 1, end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/tower_guardian/walk/',
      framePad: 2,
      frameDuration: 160
    },
    attack: {
      start: 1, end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/tower_guardian/attack/',
      framePad: 2,
      frameDuration: 130
    },
    skill: {
      start: 1, end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/tower_guardian/skill/',
      framePad: 2,
      frameDuration: 150
    }
  },

  // === 渲染配置 ===
  renderConfig: {
    assetPrefix: 'TOWER_GUARDIAN',
    spriteType: 'tower_guardian',
    totalWalkFrames: 8,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
    shadow: true,
    targetHeight: 95, // 塔楼守护者身材高，targetHeight 95
    frameDuration: 0.15
  }
}
