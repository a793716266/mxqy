/**
 * 暗影鼠 - 怪物配置（单一数据源）
 * 属性 / 技能 / AI / 动画 / 渲染配置均在此定义；enemies.js 仅做聚合。
 * ★ skills 以战斗实际使用的版本为准（暗影咬=跳跃+生命偷取 / 暗影突袭=隐身 buff），
 *   不再另写一套未被战斗读取的技能定义。
 */
module.exports = {
  // === 基础属性（原 enemies.js ENEMIES_CH1.shadow_mouse）===
  id: 'shadow_mouse',
  name: '暗影鼠',
  level: 3,
  maxHp: 80,
  atk: 16,
  def: 10,
  spd: 17,
  crit: 0.12,
  aiPattern: 'aggressive', // 激进：高速突袭
  exp: 25,
  gold: 12,
  isElite: true, // 升级为精英怪
  equipment: {
    // 精英自带装备
    name: '暗影匕首',
    type: 'weapon',
    stats: { atk: 4, crit: 0.04 }
  },
  skills: [
    {
      name: '暗影咬',
      power: 1.4,
      type: 'jump_attack',
      range: 500, // 跳跃距离500像素
      cooldown: 15, // CD 15秒
      effect: 'drain', // 生命偷取效果
      drainPercent: 1.0, // 偷取100%伤害
      target: 'single', // 单体目标
      warnDuration: 1.0, // 预警时间1秒
      damageRadius: 50 // 很小的范围（实际上是单体）
    },
    { name: '暗影突袭', type: 'buff', effect: 'invisible', duration: 5, cooldown: 20, power: 0 } // 隐身5秒
  ],
  drop: [{ id: 'cheese', name: '奶酪', chance: 0.45 }],

  // === 动画配置 ===
  animationConfig: {
    idle: {
      start: 1,
      end: 6,
      path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/idle/',
      framePad: 2,
      frameDuration: 150
    },
    walk: {
      start: 1,
      end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/walk/',
      framePad: 2,
      frameDuration: 100
    },
    attack: {
      start: 1,
      end: 7,
      path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/attack/',
      framePad: 2,
      frameDuration: 80
    },
    hurt: {
      start: 1,
      end: 2,
      path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/hurt/',
      framePad: 2,
      frameDuration: 80
    },
    death: {
      start: 1,
      end: 6,
      path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/death/',
      framePad: 2,
      frameDuration: 120
    },
    skill: {
      start: 1,
      end: 8,
      path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/skill/',
      framePad: 2,
      frameDuration: 100
    }
  },

  // === 渲染配置 ===
  renderConfig: {
    assetPrefix: 'SHADOW_MOUSE',
    spriteType: 'shadow_mouse',
    totalWalkFrames: 8,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'same', // ★ 暗影鼠素材原样朝右，面向左时需翻转
    assetFacing: 'right', // 与 flipRule:'same' 语义一致
    shadow: true,
    targetHeight: 80,
    frameDuration: 0.15
  }
}
