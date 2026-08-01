/**
 * 暗影鼠 - 补帧顺滑版配置
 * 基于现有 shadow_mouse 动画做线性补帧（见 scripts/tools/derive_monster_assets.py tween），
 * walk 由 8 帧补到 15 帧（frame_01~frame_15，pad 2），移动动画更顺滑。
 * 其余动画仍复用原始资源。
 */
const { ENEMIES_CH1 } = require('../../data/enemies.js')

module.exports = {
  id: 'shadow_mouse_smooth',
  name: '暗影鼠·顺滑',
  ...ENEMIES_CH1.shadow_mouse,

  animationConfig: {
    idle:   { start: 1, end: 6, path: 'images/characters_anim/transparent/shadow_mouse/idle/',   framePad: 2, frameDuration: 150 },
    walk:   { start: 1, end: 15, path: 'images/characters_anim/transparent/shadow_mouse/walk_tween/', framePad: 2, frameDuration: 60 },
    attack: { start: 1, end: 7, path: 'images/characters_anim/transparent/shadow_mouse/attack/', framePad: 2, frameDuration: 80 },
    hurt:   { start: 1, end: 2, path: 'images/characters_anim/transparent/shadow_mouse/hurt/',   framePad: 2, frameDuration: 80 },
    death:  { start: 1, end: 6, path: 'images/characters_anim/transparent/shadow_mouse/death/',  framePad: 2, frameDuration: 120 },
    skill:  { start: 1, end: 8, path: 'images/characters_anim/transparent/shadow_mouse/skill/',  framePad: 2, frameDuration: 100 }
  },

  renderConfig: {
    assetPrefix: 'SHADOW_MOUSE_SMOOTH',
    spriteType: 'shadow_mouse_smooth',
    totalWalkFrames: 15,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'opposite',
    assetFacing: 'right',
    shadow: true,
    targetHeight: 80,
    frameDuration: 0.15
  }
}
