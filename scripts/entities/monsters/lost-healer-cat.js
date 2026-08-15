/**
 * 迷途的治愈猫（艾米BOSS）- 怪物配置
 * 属性 + AI行为 + 动画配置
 */
const { ENEMIES_CH1 } = require('../../data/enemies.js')

module.exports = {
  // === 基础属性（从 enemies.js 迁移）===
  id: 'lost_healer_cat',
  name: '迷途的治愈猫',
  ...ENEMIES_CH1.lost_healer_cat,
  
  // === AI行为配置 ===
  aiConfig: {
    // 巡逻行为
    patrolSpeed: 1.0,
    patrolRadius: 60,
    
    // 追击行为
    chaseSpeed: 2.0,
    chaseRange: 180,     // BOSS发现距离远
    loseRange: 300,      // BOSS脱离距离也远
    
    // 攻击行为
    attackRange: 100,     // 近战+技能
    attackCD: 2000,       // 攻击CD
    attackDuration: 800,   // 攻击动画时长
    
    // 技能行为
    skillCDs: {
      '治愈之爪': 3000,
      '光明冲锋': 8000,   // 8秒CD
      '圣盾之光': 10000,  // 10秒CD
      '召唤暗影鼠': 20000  // 20秒CD
    },
    
    // 特殊行为
    canHeal: true,        // 可以自愈
    healThreshold: 0.3,  // 30%HP以下可能自愈
    canSummon: true,       // 可以召唤
    summonCD: 20000,       // 召唤CD
    summonCount: 2,        // 每次召唤2只
    
    // BOSS阶段
    phase2Threshold: 0.5,  // 50%HP进入第二阶段
    phase3Threshold: 0.2   // 20%HP进入第三阶段
  },
  
  // === 技能定义（参考 heroes.js 的格式）===
  skills: [
    {
      id: 'heal_claw',
      name: '治愈之爪',
      type: 'heal_self',
      power: 0,
      cooldown: 10,  // 秒（提高CD时间）
      desc: '用治愈之爪攻击玩家，并恢复自身20%生命值',
      range: 100,
      healPercent: 0.2  // 恢复自身最大生命值的20%
    },
    {
      id: 'light_charge',
      name: '光明冲锋',
      type: 'charge',
      power: 1.8,
      cooldown: 15,  // 秒（提高CD时间）
      desc: '向玩家冲锋，造成180%攻击力的伤害',
      range: 120,      // 降低攻击范围到合理值
      dashDistance: 120  // 冲锋距离
    },
    {
      id: 'holy_shield',
      name: '圣盾之光',
      type: 'buff',
      power: 0,
      cooldown: 20,  // 秒（提高CD时间）
      desc: '提升自身30%防御力，持续10秒',
      range: 90,       // 自身增益技：仅近战距离内释放（不再全屏）
      effect: 'def_up',
      value: 0.3,
      duration: 10
    },
    {
      id: 'summon_shadow',
      name: '召唤暗影鼠',
      type: 'summon',
      power: 0,
      cooldown: 30,  // 秒（提高CD时间）
      desc: '召唤2只暗影鼠协助战斗',
      range: 90,       // 召唤技：仅近战距离内释放（不再全屏）
      summonId: 'shadow_mouse',
      summonCount: 2
    }
  ],
  
  // === 动画配置（使用艾米资源）===
  animationConfig: {
    idle: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/aimi/idle/',
      framePad: 2,
      frameDuration: 150
    },
    walk: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/aimi/walk/',
      framePad: 2,
      frameDuration: 120
    },
    attack: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/aimi/attack/',
      framePad: 2,
      frameDuration: 100
    },
    hurt: {
      start: 1,
      end: 2,
      path: 'images/characters_anim/transparent/aimi/hurt/',
      framePad: 2,
      frameDuration: 80
    },
    death: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/aimi/death/',
      framePad: 2,
      frameDuration: 150
    },
    skill: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/aimi/skill/',
      framePad: 2,
      frameDuration: 100
    },
    buff: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/aimi/buff/',
      framePad: 2,
      frameDuration: 100
    },
    support: {
      start: 1,
      end: 8,
      path: 'images/characters_anim/transparent/aimi/support/',
      framePad: 2,
      frameDuration: 100
    },
    cast: {
      start: 1,
      end: 4,
      path: 'images/characters_anim/transparent/aimi/cast/',
      framePad: 2,
      frameDuration: 120
    }
  },
  
  // === 渲染配置 ===
  renderConfig: {
    assetPrefix: 'AIMI',
    spriteType: 'aimi',
    totalWalkFrames: 8,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'same',  // 与英雄一致
    shadow: true,
    targetHeight: 80,     // 渲染目标高度（像素），修改此值调整精灵大小
    frameDuration: 0.15
  },
  
  // === 掉落配置 ===
  dropConfig: [
    { id: 'healing_herb', name: '治愈草药', chance: 1.0 }
  ],
  
  // === 经验值配置 ===
  exp: 150,
  gold: 80,
  
  // === 对话配置 ===
  dialogue: [
    '你们...为什么要闯入这里？',
    '我只是想守护这片草原的和平...',
    '真正的力量...是治愈与守护吗...'
  ],
  purifyDialogue: [
    '你们的眼神...如此温暖...',
    '我一直在寻找这样的羁绊...',
    '请让我加入你们，一起守护这片大地！'
  ]
}
