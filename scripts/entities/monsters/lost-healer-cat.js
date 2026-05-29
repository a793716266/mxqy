/**
 * 迷途的治愈猫（艾米BOSS）- 怪物配置
 * 属性 + AI行为 + 动画配置
 */
import { ENEMIES_CH1 } from '../../data/enemies.js'

export default {
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
