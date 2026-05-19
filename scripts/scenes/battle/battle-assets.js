/**
 * battle-assets.js - 图片资源路径管理
 * 职责：角色/敌人图片key生成、缩放比例、颜色工具、常量定义
 */

import { getAnimParams } from '../../data/animation-config.js'

// ======== 角色缩放配置 ========
const HERO_SCALE_MAP = {
  zhenbao:   1.1,   // 臻宝：稍大（战士体格）
  lixiaobao: 0.95,  // 李小宝：标准（法师体型）
  amy:       0.9,   // 艾米：稍小（敏捷型）
  annie:     0.85,  // 安妮：小（辅助型）
  qianduoduo: 0.9,   // 千朵朵：标准
}

// ======== 角色 Idle 帧数配置 ========
const HERO_IDLE_FRAME_MAP = {
  zhenbao: 8,
  lixiaobao: 8,
  amy: 8,  // 更新为8帧（使用AIMI资源）
  annie: 2,
  qianduoduo: 8,
}

// ======== 渲染常量 ========
export const HERO_SPRITE_SIZE_BASE = 80  // 角色精灵基础尺寸（与小镇/野外场景一致）

// ======== 技能发光颜色映射 ========
const SKILL_GLOW_COLORS = {
  fireball: '#FF6B35',
  ice_shard: '#74B9FF',
  thunder: '#FDCB6E',
  slash: '#FF4757',
  shield_bash: '#A29BFE',
  staff_strike: '#DFE6E9',
  heal: '#2ED573',
  mana_shield: '#5F9FFF',
  war_cry: '#FFA502',
  cat_paw: '#FFB347',
  punch: '#E17055',
}

export function installBattleAssets(BattleSceneClass) {
  const proto = BattleSceneClass.prototype

  proto._getBgKey = function() {
    const bgMap = {
      GRASSLAND: 'BG_GRASSLAND',
      FOREST: 'BG_FOREST',
      CAVE: 'BG_CAVE',
      SNOW: 'BG_SNOW',
      BOSS_ROOM: 'BG_BOSS_ROOM',
    }
    return bgMap[this.bgKey] || this.bgKey || 'BG_GRASSLAND'
  }

  proto._getHeroScale = function(heroId) {
    return HERO_SCALE_MAP[heroId] || 1.0
  }

  proto._getHeroImageKey = function(heroId) {
    if (!heroId) return 'AIMI_IDLE_01'  // 防御：heroId为null/undefined时返回默认值
    const keyMap = {
      zhenbao: 'HERO_ZHENBAO_IDLE_01',
      lixiaobao: 'HERO_LIXIAOBAO_IDLE_01',
      amy: 'AIMI_IDLE_01',  // 使用AIMI资源
      annie: 'HERO_ANNIE_IDLE_01',
      qianduoduo: 'HERO_QIANDUODUO_IDLE_01',
    }
    return keyMap[heroId] || `AIMI_IDLE_01`  // 默认使用AIMI资源
  }

  proto._getHeroIdleImageKey = function(heroId, frameNum) {
    if (heroId === 'zhenbao') {
      // 臻宝 idle 帧：IDLE_01 ~ IDLE_08（从1开始编号，共8帧，补零2位）
      const actualFrame = (frameNum % 8) + 1
      const padded = String(actualFrame).padStart(2, '0')
      return `HERO_ZHENBAO_IDLE_${padded}`
    }
    if (heroId === 'lixiaobao') {
      // 李小宝 idle 帧：IDLE_01 ~ IDLE_08（从1开始编号，共8帧）
      const actualFrame = (frameNum % 8) + 1
      const padded = String(actualFrame).padStart(2, '0')
      return `HERO_LIXIAOBAO_IDLE_${padded}`
    }
    if (heroId === 'amy') {
      // 艾米 idle 帧：IDLE_01 ~ IDLE_08（使用AIMI资源）
      const actualFrame = (frameNum % 8) + 1
      const padded = String(actualFrame).padStart(2, '0')
      return `AIMI_IDLE_${padded}`
    }
    // 其他角色：复用 walk 帧或默认图片
    return this._getHeroImageKey(heroId)
  }

  proto._getHeroWalkImageKey = function(heroId, frameNum) {
    if (!heroId) return 'AIMI_WALK_01'  // 防御：heroId为null/undefined时返回默认值
    if (heroId === 'zhenbao') {
      // 臻宝 walk 帧：WALK_01 ~ WALK_08（从1开始编号）
      const actualFrame = (frameNum % 8) + 1
      const padded = String(actualFrame).padStart(2, '0')
      return `HERO_ZHENBAO_WALK_${padded}`
    }
    if (heroId === 'lixiaobao') {
      const animParams = getAnimParams(heroId, true)
      const totalFrames = animParams.frames || 8
      const actualFrame = (frameNum % totalFrames) + 1
      const padded = String(actualFrame).padStart(2, '0')
      return `HERO_LIXIAOBAO_WALK_${padded}`
    }
    if (heroId === 'amy') {
      // 艾米 walk 帧：WALK_01 ~ WALK_08（使用AIMI资源）
      const actualFrame = (frameNum % 8) + 1
      const padded = String(actualFrame).padStart(2, '0')
      return `AIMI_WALK_${padded}`
    }
    // 其他角色：返回默认walk帧
    const defaultKey = `AIMI_WALK_${String((frameNum % 8) + 1).padStart(2, '0')}`
    if (this.game.assets.get(defaultKey)) return defaultKey
    return this._getHeroImageKey(heroId)
  }

  proto._getHeroSlashImageKey = function(heroId, frameNum) {
    if (heroId === 'zhenbao') {
      // ★ 优先使用 attack/ 目录帧（通用攻击动画）
      const atkFrame = Math.min(frameNum + 1, 8)
      const atkKey = `HERO_ZHENBAO_ATTACK_${String(atkFrame).padStart(2, '0')}`
      if (this.game.assets.get(atkKey)) return atkKey
      // fallback: slash/ 目录帧
      const actualFrame = Math.min(frameNum + 1, 13)
      const padded = String(actualFrame).padStart(2, '0')
      const slashKey = `HERO_ZHENBAO_SLASH_${padded}`
      if (this.game.assets.get(slashKey)) return slashKey
    }
    if (heroId === 'lixiaobao') {
      // ★ cast_attack 已删除，施法动画统一由 cast_universal 精灵表处理
      return this._getHeroWalkImageKey(heroId, frameNum)
    }
    if (heroId === 'amy') {
      // 艾米 attack 帧：ATTACK_01 ~ ATTACK_08（使用AIMI资源）
      const actualFrame = Math.min(frameNum + 1, 8)
      const padded = String(actualFrame).padStart(2, '0')
      const atkKey = `AIMI_ATTACK_${padded}`
      if (this.game.assets.get(atkKey)) return atkKey
    }
    return this._getHeroWalkImageKey(heroId, frameNum)
  }

  proto._getSkillGlowColor = function(skillId) {
    return SKILL_GLOW_COLORS[skillId] || '#ffffff'
  }

  proto._lightenColor = function(hex, percent) {
    const num = parseInt(hex.slice(1), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.min(255, (num >> 16) + amt)
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt)
    const B = Math.min(255, (num & 0x0000FF) + amt)
    return `rgb(${R}, ${G}, ${B})`
  }

  proto._getEnemyFrameKey = function(animState) {
    if (!animState) {
      console.warn('[_getEnemyFrameKey] animState为null，返回默认值')
      return 'AIMI_IDLE_01'  // 防御：animState为null时返回默认值
    }
    
    // 艾米BOSS形态（aimi类型）- 检查 type 或 spriteType
    const enemyType = animState.type || ''
    if (enemyType === 'aimi' || enemyType.includes('aimi')) {
      // ★ 调试：输出艾米动画状态
      if (Math.random() < 0.01) {  // 1%概率输出，避免刷屏
        console.log(`[FrameKey] 艾米动画: state=${animState.state}, frame=${animState.frame}, type=${enemyType}`)
      }
      const frameNum = String(animState.frame || 1).padStart(2, '0')
      const state = animState.state || 'idle'
      if (state === 'walk') return `AIMI_WALK_${frameNum}`
      if (state === 'idle') return `AIMI_IDLE_${frameNum}`
      if (state === 'attack') return `AIMI_ATTACK_${frameNum}`
      if (state === 'skill') return `AIMI_SKILL_${frameNum}`
      if (state === 'buff') return `AIMI_BUFF_${frameNum}`
      if (state === 'support') return `AIMI_SUPPORT_${frameNum}`
      return 'AIMI_IDLE_01'
    }
    if (enemyType === 'wild_cat') {
      const frameNum = String(animState.frame).padStart(2, '0')
      if (animState.state === 'walk') return `CAT_WALK_${frameNum}`
      return `CAT_IDLE_${frameNum}`
    }
    if (animState.type === 'shadow_mouse') {
      const frameNum = String(animState.frame).padStart(2, '0')
      if (animState.state === 'walk') return `SHADOW_MOUSE_WALK_${frameNum}`
      if (animState.state === 'idle') return `SHADOW_MOUSE_IDLE_${frameNum}`
      if (animState.state === 'attack') return `SHADOW_MOUSE_ATTACK_${frameNum}`
      if (animState.state === 'skill') return `SHADOW_MOUSE_SKILL_${frameNum}`
      if (animState.state === 'buff') return `SHADOW_MOUSE_BUFF_${frameNum}`
      return 'SHADOW_MOUSE_IDLE_01'
    }
    // 史莱姆猫
    if (animState.state === 'walk') {
      return `SLIME_CAT_WALK_${String(animState.frame).padStart(2, '0')}`
    } else if (animState.state === 'idle') {
      return `SLIME_CAT_IDLE_${String(animState.frame).padStart(2, '0')}`
    } else if (animState.state === 'attack') {
      return `SLIME_CAT_ATTACK_${String(animState.frame).padStart(2, '0')}`
    } else if (animState.state === 'skill') {
      return `SLIME_CAT_SKILL_${String(animState.frame).padStart(2, '0')}`
    }
    return 'SLIME_CAT_IDLE_01'
  }

  // ======== 角色精灵图片解析（渲染去重：animation.js + renderer.js 共用） ========
  proto._resolveHeroSpriteImage = function(hero, hAnimState) {
    if (!hero || !hero.id) return null
    const heroId = hero.id

    // 无动画状态 → 返回默认图片
    if (!hAnimState) {
      return this.game.assets.get(this._getHeroImageKey(heroId)) || null
    }

    let imgKey = null

    if (hAnimState.state === 'attack') {
      imgKey = this._getHeroSlashImageKey(heroId, hAnimState.frame || 0)
    } else if (hAnimState.state === 'walk') {
      imgKey = this._getHeroWalkImageKey(heroId, hAnimState.frame || 0)
    } else {
      imgKey = this._getHeroIdleImageKey(heroId, hAnimState.frame || 0)
    }

    let img = imgKey ? this.game.assets.get(imgKey) : null
    // fallback 到默认图片
    if (!img) {
      img = this.game.assets.get(this._getHeroImageKey(heroId))
    }
    return img || null
  }

  proto._getHeroIdleFrameCount = function(heroId) {
    return HERO_IDLE_FRAME_MAP[heroId] || 4
  }
}
