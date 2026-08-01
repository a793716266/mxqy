const { ENEMIES_CH1 } = require('../../data/enemies.js')

module.exports = {
  // === 基础属性（从 enemies.js 迁移）===
  id: 'wild_cat',
  name: '野猫',
  ...ENEMIES_CH1.wild_cat,

  // === 动画配置（野猫复用史莱姆猫资源）===
  animationConfig: {
    idle: { start: 1, end: 7, path: 'images/characters_anim/transparent/slime_cat/idle/', framePad: 1, frameDuration: 150 },
    walk: { start: 1, end: 12, path: 'images/characters_anim/transparent/slime_cat/walk/', framePad: 2, frameDuration: 120 },
    attack: { start: 8, end: 22, path: 'images/characters_anim/transparent/slime_cat/attack/', frameList: [8, 10, 12, 14, 16, 18, 20, 22], framePad: 4, frameDuration: 100 },
    hurt: { start: 1, end: 2, path: 'images/characters_anim/transparent/slime_cat/hurt/', framePad: 1, frameDuration: 80 },
    death: { start: 1, end: 6, path: 'images/characters_anim/transparent/slime_cat/death/', framePad: 2, frameDuration: 120 },
    skill: { start: 50, end: 80, path: 'images/characters_anim/transparent/slime_cat/skill/', frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80], framePad: 4, frameDuration: 100 }
  },

  // === 渲染配置 ===
  renderConfig: {
    assetPrefix: 'SLIME_CAT',  // 野猫复用史莱姆猫资源
    spriteType: 'wild_cat',
    targetHeight: 80,
    flipRule: 'opposite',
    shadow: true
  }
}
