/**
 * 史莱姆猫 - 换肤/调色变体配置
 * 基于现有 slime_cat 动画资源派生（见 scripts/tools/derive_monster_assets.py recolor）
 * 三个同模异色变体：赤焰(20°)、碧波(180°)、魅紫(300°)
 * 复用 slime_cat 的 AI / 技能 / 属性结构，仅替换资源路径与显示名。
 */
const { ENEMIES_CH1 } = require('../../data/enemies.js')

const SKIN_BASE = 'images/characters_anim/transparent/slime_cat_skins'

function buildSkin(id, name, hueTag, tint, assetPrefix) {
  return {
    id,
    name,
    tint, // 渲染时的色调提示（供 battle-scene 着色参考）
    ...ENEMIES_CH1.slime_cat,

    animationConfig: {
      idle:   { start: 1,  end: 7,  path: `${SKIN_BASE}/${hueTag}/idle/`,   framePad: 1, frameDuration: 150 },
      walk:   { start: 1,  end: 12, path: `${SKIN_BASE}/${hueTag}/walk/`,   framePad: 2, frameDuration: 120 },
      attack: { start: 8,  end: 22, path: `${SKIN_BASE}/${hueTag}/attack/`, frameList: [8, 10, 12, 14, 16, 18, 20, 22], framePad: 4, frameDuration: 100 },
      hurt:   { start: 1,  end: 2,  path: `${SKIN_BASE}/${hueTag}/hurt/`,   framePad: 1, frameDuration: 80 },
      death:  { start: 1,  end: 6,  path: `${SKIN_BASE}/${hueTag}/death/`,  framePad: 2, frameDuration: 120 },
      skill:  { start: 50, end: 80, path: `${SKIN_BASE}/${hueTag}/skill/`,  frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80], framePad: 4, frameDuration: 100 }
    },

    renderConfig: {
      assetPrefix: assetPrefix,      // 各自独立注册前缀（FLAME_SLIME/AQUA_SLIME/VIOLET_SLIME）
      spriteType: id,
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
}

module.exports = {
  flame_slime:  buildSkin('flame_slime',  '赤焰史莱姆猫', 'hue_20',  '#ff7a4d', 'FLAME_SLIME'),
  aqua_slime:   buildSkin('aqua_slime',   '碧波史莱姆猫', 'hue_180', '#4dc8ff', 'AQUA_SLIME'),
  violet_slime: buildSkin('violet_slime', '魅紫史莱姆猫', 'hue_300', '#c47dff', 'VIOLET_SLIME')
}
