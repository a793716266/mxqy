/**
 * 石像守卫 - 怪物配置（单一数据源，第二章）
 * 属性 / 技能 / AI / 动画 / 渲染配置均在此定义；enemies.js 仅做聚合。
 * ★ 4 套动画（idle/walk/attack/skill）已切片为透明 PNG；
 *   hurt/death 复用 idle 帧（buildFrames 未注册 HURT/DEATH 键，
 *   由 _tryFallbackFrame 兜底为 idle）。
 */
module.exports = {
  id: 'stone_golem',
  type: 'stone_golem', // 与 enemyId 对齐，供 _renderCatMonster 识别
  name: '石像守卫',
  level: 5,
  maxHp: 120,
  atk: 20,
  def: 15,
  spd: 8, // 6 → 8 (适当提高移动速度，保持防御型特性)
  crit: 0.05,
  aiPattern: 'defensive', // 防御：岩石护体、坚守阵地
  exp: 30,
  gold: 20,
  skills: [
    { name: '岩石冲击', power: 1.5, type: 'attack', mpCost: 6 },
    { name: '地震', power: 1.2, type: 'attack', target: 'all', mpCost: 15 }
  ],
  drop: [{ id: 'stone_core', name: '石核', chance: 0.25 }],

  // === 动画配置（4 套透明帧：idle/walk/attack/skill 各 8 帧）===
  animationConfig: {
    idle: {
      start: 1, end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/stone_golem/idle/',
      framePad: 2,
      frameDuration: 200 // 沉重守卫，呼吸慢
    },
    walk: {
      start: 1, end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/stone_golem/walk/',
      framePad: 2,
      frameDuration: 150
    },
    attack: {
      start: 1, end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/stone_golem/attack/',
      framePad: 2,
      frameDuration: 120
    },
    skill: {
      start: 1, end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/stone_golem/skill/',
      framePad: 2,
      frameDuration: 130 // 地震+地刺释放节奏
    }
  },

  // === 渲染配置 ===
  renderConfig: {
    assetPrefix: 'STONE_GOLEM',
    spriteType: 'stone_golem',
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
  }
}
