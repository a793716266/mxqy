/**
 * 史莱姆猫 - 怪物配置（单一数据源）
 * 属性 / 技能 / AI / 动画 / 渲染配置均在此定义；enemies.js 仅做聚合。
 * ★ skills 以战斗实际使用的版本为准（与 field-battle-system 的 jump_attack /
 *   attack 等 type 完全匹配），不再另写一套未被战斗读取的技能定义。
 */
module.exports = {
  // === 基础属性（原 enemies.js ENEMIES_CH1.slime_cat）===
  id: 'slime_cat',
  type: 'slime_cat', // 添加类型标记，用于动画识别
  name: '史莱姆猫',
  level: 3,
  maxHp: 110,
  atk: 12,
  def: 14,
  spd: 10,
  crit: 0.08,
  aiPattern: 'defensive', // 防御：黏液护体、不主动冲锋
  exp: 30,
  gold: 18,
  isElite: true, // 升级为精英怪
  equipment: {
    // 精英自带装备加成
    name: '黏液护甲',
    type: 'armor',
    stats: { def: 6, maxHp: 20 }
  },
  skills: [
    { name: '黏液喷射', power: 1.2, type: 'attack', effect: 'slime_spray' },
    { name: '黏液包裹', power: 1.4, type: 'attack', effect: 'slime_wrap', restrictChance: 0.35 },
    {
      name: '跳跃攻击',
      power: 1.5,
      type: 'jump_attack',
      effect: 'jump_attack',
      range: 300, // ★ 跳跃距离（像素）
      cooldown: 3, // ★ 冷却时间改为3秒（方便测试）
      warnDuration: 1.5, // 预警时间（秒）
      damageRadius: 100 // ★ 伤害范围（像素）
    }
  ],
  drop: [{ id: 'gel', name: '黏液', chance: 0.25 }],

  // === 动画配置 ===
  animationConfig: {
    idle: {
      start: 1,
      end: 7,
      path: 'images/characters_anim/transparent/slime_cat/idle/',
      framePad: 1,
      frameDuration: 150
    },
    walk: {
      start: 1,
      end: 12,
      path: 'images/characters_anim/transparent/slime_cat/walk/',
      framePad: 2,
      frameDuration: 120
    },
    attack: {
      start: 8,
      end: 22,
      path: 'images/characters_anim/transparent/slime_cat/attack/',
      frameList: [8, 10, 12, 14, 16, 18, 20, 22],
      framePad: 4, // ★ 实际文件名 attack_0008.png ~ attack_0022.png 为4位补零
      frameDuration: 100
    },
    hurt: {
      start: 1,
      end: 2,
      path: 'images/characters_anim/transparent/slime_cat/hurt/',
      framePad: 1,
      frameDuration: 80
    },
    death: {
      start: 1,
      end: 6,
      path: 'images/characters_anim/transparent/slime_cat/death/',
      framePad: 2,
      frameDuration: 120
    },
    skill: {
      start: 50,
      end: 80,
      path: 'images/characters_anim/transparent/slime_cat/skill/',
      frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80],
      framePad: 4, // ★ 实际文件名 skill_0050.png ~ skill_0080.png 为4位补零
      frameDuration: 100
    }
  },

  // === 渲染配置 ===
  renderConfig: {
    assetPrefix: 'SLIME_CAT',
    spriteType: 'slime_cat',
    totalWalkFrames: 12,
    totalIdleFrames: 6,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 1,
    flipRule: 'opposite',
    shadow: true,
    targetHeight: 80,
    frameDuration: 0.15
  }
}
