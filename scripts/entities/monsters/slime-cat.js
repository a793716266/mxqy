/**
 * 史莱姆猫 - 怪物配置
 * 属性 + AI行为 + 动画配置
 */
import { ENEMIES_CH1 } from '../../data/enemies.js'

export default {
  // === 基础属性（从 enemies.js 迁移）===
  id: 'slime_cat',
  name: '史莱姆猫',
  ...ENEMIES_CH1.slime_cat,
  
  // === AI行为配置 ===
  aiConfig: {
    // 巡逻行为
    patrolSpeed: 1.2,
    patrolRadius: 80,  // 巡逻半径（像素）
    
    // 追击行为
    chaseSpeed: 2.5,
    chaseRange: 120,   // 发现玩家的距离
    loseRange: 200,    // 脱离战斗的距离
    
    // 攻击行为
    attackRange: 80,    // 攻击距离（像素）
    attackCD: 1200,     // 攻击冷却（毫秒）
    attackDuration: 500, // 攻击动画时长（毫秒）
    
    // 技能行为
    skillCDs: {
      '黏液喷射': 3000,
      '黏液包裹': 5000,
      '跳跃攻击': 8000
    },
    
    // 特殊行为
    canSplit: true,      // 可以分裂
    splitChance: 0.3,   // 分裂几率
    splitHPThreshold: 0.5 // 分裂HP阈值（50%以下）
  },
  
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
      framePad: 2,
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
      framePad: 2,
      frameDuration: 100
    }
  },
  
  // === 渲染配置（覆盖 enemies.js 中的配置）===
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
    targetHeight: 80,     // 渲染目标高度（像素），修改此值调整精灵大小
    frameDuration: 0.15
  },
  
  // === 掉落配置 ===
  dropConfig: [
    { id: 'gel', name: '黏液', chance: 0.25 }
  ],
  
  // === 经验值配置 ===
  exp: 30,
  gold: 18
}
