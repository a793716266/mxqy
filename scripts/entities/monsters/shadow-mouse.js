/**
 * 暗影鼠 - 怪物配置
 * 属性 + AI行为 + 动画配置
 */
const { ENEMIES_CH1 } = require('../../data/enemies.js')

module.exports = {
  // === 基础属性（从 enemies.js 迁移）===
  id: 'shadow_mouse',
  name: '暗影鼠',
  ...ENEMIES_CH1.shadow_mouse,
  
  // === AI行为配置 ===
  aiConfig: {
    // 巡逻行为
    patrolSpeed: 1.8,  // 高速移动
    patrolRadius: 100,
    
    // 追击行为
    chaseSpeed: 3.5,     // 很快
    chaseRange: 150,       // 发现距离较远
    loseRange: 250,        // 脱离距离也远
    
    // 攻击行为
    attackRange: 60,       // 近战
    attackCD: 800,         // 攻击CD短
    attackDuration: 400,    // 攻击动画快
    
    // 技能行为
    skillCDs: {
      '暗影咬': 15000,    // 15秒CD
      '暗影突袭': 20000    // 20秒CD（隐身）
    },
    
    // 特殊行为
    canInvisible: true,     // 可以隐身
    invisibleDuration: 5,   // 隐身持续时间
    invisibleCD: 20000      // 隐身CD
  },
  
  // === 技能定义（参考 heroes.js 的格式）===
  skills: [
    {
      id: 'shadow_bite',
      name: '暗影咬',
      type: 'jump_attack',
      power: 1.5,
      cooldown: 25,  // 秒（提高CD时间）
      desc: '跳跃到玩家位置，造成150%攻击力的暴击伤害',
      range: 90,       // 降低攻击范围到合理值
      dashDistance: 90  // 跳跃距离
    },
    {
      id: 'shadow_raid',
      name: '暗影突袭',
      type: 'buff',
      power: 0,
      cooldown: 30,  // 秒（提高CD时间）
      desc: '隐身5秒，提升30%攻击力，持续10秒',
      range: 9999,    // 全场释放，不受距离限制
      effect: 'atk_up',
      value: 0.3,
      duration: 10
    }
  ],
  
  // === 动画配置 ===
  animationConfig: {
    idle: {
      start: 1,
      end: 6,
      path: 'images/characters_anim/transparent/shadow_mouse/idle/',
      framePad: 2,
      frameDuration: 150
    },
    walk: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/shadow_mouse/walk/',
      framePad: 2,
      frameDuration: 100
    },
    attack: {
      start: 1,
      end: 7,
      path: 'images/characters_anim/transparent/shadow_mouse/attack/',
      framePad: 2,
      frameDuration: 80
    },
    hurt: {
      start: 1,
      end: 2,
      path: 'images/characters_anim/transparent/shadow_mouse/hurt/',
      framePad: 2,
      frameDuration: 80
    },
    death: {
      start: 1,
      end: 6,
      path: 'images/characters_anim/transparent/shadow_mouse/death/',
      framePad: 2,
      frameDuration: 120
    },
    skill: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/shadow_mouse/skill/',
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
    flipRule: 'same', // ★ 暗影鼠素材原样朝右（与史莱姆猫相反），面向左时需翻转
    assetFacing: 'right', // 与 flipRule:'same' 语义一致：素材朝右
    shadow: true,
    targetHeight: 80,     // 渲染目标高度（像素），修改此值调整精灵大小
    frameDuration: 0.15
  },
  
  // === 掉落配置 ===
  dropConfig: [
    { id: 'cheese', name: '奶酪', chance: 0.45 }
  ],
  
  // === 经验值配置 ===
  exp: 25,
  gold: 12
}
