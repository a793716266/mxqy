/**
 * 野猫 - 怪物配置（单一数据源）
 * 属性 / 技能 / AI / 动画 / 渲染配置均在此定义；enemies.js 仅做聚合。
 */
module.exports = {
  // === 基础属性（原 enemies.js ENEMIES_CH1.wild_cat）===
  id: 'wild_cat',
  name: '野猫',
  assetPrefix: 'SLIME_CAT', // ★ 复用史莱姆猫素材
  level: 1,
  maxHp: 50,
  atk: 12,
  def: 5,
  spd: 9,
  crit: 0.05,
  aiPattern: 'aggressive', // 激进：猛扑不退
  exp: 15,
  gold: 8,
  skills: [
    { name: '抓挠', power: 1.2, type: 'attack' },
    { name: '狂抓', power: 1.5, type: 'attack' }
  ],
  drop: [{ id: 'fish', name: '小鱼干', chance: 0.3 }],

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
    assetPrefix: 'SLIME_CAT', // 野猫复用史莱姆猫资源
    spriteType: 'wild_cat',
    targetHeight: 80,
    flipRule: 'opposite',
    shadow: true
  }
}
