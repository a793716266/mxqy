/**
 * tower-effects.js - 特效引擎（粒子/飘字/命中特效/屏幕震动）
 *
 * 从 tower-battle.js 提取的全部特效相关逻辑：
 * - 粒子系统（生成、更新、渲染）
 * - 特效对象池（安全推入、上限保护、类型分发更新/渲染）
 * - 飘字系统（浮动文字）
 * - 命中特效（hit/spawn helpers）
 * - 死亡/复活特效
 * - 屏幕震动
 *
 * 设计模式：所有函数接收 battle 上下文对象，
 * 通过 battle.effects / battle.particles / battle.floatingTexts 访问状态。
 */

const { HIT_EFFECTS } = require('./tower-config.js')

// ========== 常量 ==========

const MAX_EFFECTS = 180    // 特效硬上限
const MAX_PARTICLES = 300   // 粒子硬上限

// ========== 粒子生成 ==========

/**
 * 通用粒子生成器
 */
function spawnParticles(battle, x, y, opts = {}) {
  const count = opts.count || 6
  const color = opts.color || '#fff'
  const speedRange = opts.speed || [30, 80]
  const sizeRange = opts.size || [2, 5]
  const decayRange = opts.decay || 1.5
  const angleRandom = opts.angleRandom != null ? opts.angleRandom : 1.5

  for (let i = 0; i < count; i++) {
    let angle, spd
    if (opts.ringOnly) {
      angle = (i / count) * Math.PI * 2
      spd = opts.pushSpeed || 40
    } else {
      angle = Math.random() * Math.PI * 2 + (Math.random() - 0.5) * angleRandom
      const sMin = Array.isArray(speedRange) ? speedRange[0] : speedRange
      const sMax = Array.isArray(speedRange) ? speedRange[1] : speedRange * 1.5
      spd = sMin + Math.random() * (sMax - sMin)
    }

    const szMin = Array.isArray(sizeRange) ? sizeRange[0] : sizeRange
    const szMax = Array.isArray(sizeRange) ? sizeRange[1] : sizeRange * 1.5
    const dMin = Array.isArray(decayRange) ? decayRange[0] : decayRange
    const dMax = Array.isArray(decayRange) ? decayRange[1] : decayRange * 1.5

    battle.particles.push({
      x: x + (Math.random() - 0.5) * (angleRandom * 10),
      y: y + (Math.random() - 0.5) * (angleRandom * 10),
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - (opts.gravity || 20),
      size: szMin + Math.random() * (szMax - szMin),
      color,
      life: 1,
      decay: dMin + Math.random() * (dMax - dMin),
    })
  }
}

// ========== 特效安全推入 ==========

/** 安全推入特效对象（带硬上限保护，防止堆积卡死） */
function pushEffectSafe(battle, effect) {
  if (battle.effects.length >= MAX_EFFECTS) {
    // 丢弃最旧的低优先级特效（dmg_number 或 particle）
    const idx = (battle.effects || []).findIndex(e =>
      e.type === 'dmg_number' || e.type === 'particle'
    )
    if (idx >= 0) {
      battle.effects.splice(idx, 1)
    } else {
      battle.effects.shift()
    }
  }
  battle.effects.push(effect)
}

// ========== 飘字系统 ==========

/** 添加浮动文字 */
function addFloatingText(battle, x, y, text, color, duration = 1.8) {
  battle.floatingTexts.push({ x, y, text, color, life: duration, vy: -40 })
}

/** 更新所有浮动文字 */
function updateFloatingTexts(battle, dt) {
  const dtSec = dt / 1000
  for (const ft of (battle.floatingTexts || [])) {
    ft.y += ft.vy * dtSec
    ft.life -= dtSec
  }
  battle.floatingTexts = (battle.floatingTexts || []).filter(ft => ft.life > 0)
}

/** 渲染所有浮动文字 */
function renderFloatingTexts(battle, ctx) {
  const dpr = battle.dpr
  for (const ft of (battle.floatingTexts || [])) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, ft.life)
    ctx.fillStyle = ft.color
    const fontSize = 14 * dpr * (ft.scale || 0.9)
    ctx.font = `${ft.isText ? '' : 'bold '}${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(String(ft.value || ft.text), ft.x, ft.y)
    ctx.restore()
  }
}

// ========== 命中特效 ==========

/**
 * 通用命中特效（飘字 + 粒子）
 */
function spawnHitEffect(battle, x, y, dmg, color, isCrit = false) {
  // 伤害数字
  pushEffectSafe(battle, {
    type: 'dmg_number',
    x: x + (Math.random() - 0.5) * 24,
    y: y - 22,
    value: dmg,
    color: isCrit ? '#ffff00' : color,
    scale: isCrit ? 1.6 : 1,
    life: 1.2,
    vy: -70
  })

  // 击中粒子
  spawnParticles(battle, x, y, {
    count: isCrit ? 12 : 6,
    color,
    isCrit,
    angleRandom: 2,
  })
}

/**
 * 技能命中特效（飘字 + 粒子 + 命中帧）
 * @param {number} targetCount - 本次技能总命中目标数（用于动态缩放）
 */
function spawnSkillHitEffect(battle, x, y, dmg, color, skillId, targetCount) {
  // 飘字
  pushEffectSafe(battle, {
    type: 'dmg_number', x, y: y - 26,
    value: dmg, color, scale: 1.4, life: 1.4, vy: -80
  })

  // 粒子量动态缩放：多目标AoE时大幅削减
  const isAoe = targetCount && targetCount > 3
  const particleCount = isAoe
    ? Math.max(2, Math.floor(16 / targetCount))
    : 16

  spawnParticles(battle, x, y, {
    count: particleCount,
    color,
    angleRandom: 0.5
  })

  // AoE多目标时跳过击中帧特效（开销大）
  if (!isAoe) {
    let hitFrames = null
    if (skillId === 'fireball') hitFrames = 'fireball_hit'
    else if (skillId === 'ice_shard') hitFrames = 'ice_hit'
    else if (skillId === 'lightning' || skillId === 'meteor') hitFrames = 'lightning_hit'

    if (hitFrames) {
      pushEffectSafe(battle, {
        type: 'skill_effect_frames', x, y,
        skillType: hitFrames, frame: 0, life: 1.0, frameRate: 50
      })
    }
  }
}

// ========== 死亡/复活特效 ==========

function spawnDeathEffect(battle, x, y, color) {
  spawnParticles(battle, x, y, {
    count: 18, color, speed: [30, 80], size: [3, 8], decay: 1 + Math.random()
  })
}

function spawnRespawnEffect(battle, x, y) {
  spawnParticles(battle, x, y, {
    count: 25, color: '#58a6ff', ringOnly: true, radius: 30, pushSpeed: 40, fixedSize: 4
  })
}

// ========== 粒子更新/渲染 ==========

function updateParticles(battle, dt) {
  const dtSec = dt / 1000
  for (const p of (battle.particles || [])) {
    p.x += p.vx * dtSec
    p.y += p.vy * dtSec
    p.vx *= 0.94
    p.vy *= 0.94
    p.life -= p.decay * dtSec
  }
  battle.particles = (battle.particles || []).filter(p => p.life > 0)
  // 硬上限保护
  if (battle.particles.length > MAX_PARTICLES) {
    battle.particles = battle.particles.slice(-200)
  }
}

function renderParticles(battle, ctx) {
  for (const p of (battle.particles || [])) {
    ctx.save()
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// ========== 特效更新调度器 ==========

/**
 * 主特效更新循环 —— 处理所有特效类型的逐帧状态更新
 */
function updateEffects(battle, dt) {
  // 确保 battle.effects 存在且是数组
  if (!Array.isArray(battle.effects)) battle.effects = []
  for (const e of battle.effects) {
    _updateSingleEffect(battle, e, dt)
  }
  battle.effects = battle.effects.filter(e => e && e.life > 0)
}

function _updateSingleEffect(battle, e, dt) {
  try {
    switch (e.type) {
      case 'dmg_number':
        e.y += e.vy * (dt / 1000)
        e.life -= dt / 1000
        break

      case 'particle':
        if (e.vx !== undefined) e.x += e.vx * (dt / 1000)
        if (e.vy !== undefined) e.y += e.vy * (dt / 1000)
        if (!e._lifeSet) { e.life = (e.duration || 500) / 1000; e._lifeSet = true }
        else e.life -= dt / 1000
        break

      case 'skill_effect_frames':
        e.life -= dt / 1000
        e.frameTimer = (e.frameTimer || 0) + dt
        if (e.frameTimer >= (e.frameRate || 60)) {
          e.frameTimer = 0
          const maxFrame = e.frames ? e.frames.length : 10
          e.frame = (e.frame || 0) + 1
          if (e.frame >= maxFrame) e.frame = maxFrame - 1  // ★ 防止越界
        }
        break

      case 'char_hit': {
        e.timer = (e.timer || 0) + dt
        const hitData = HIT_EFFECTS[e.hitType]
        if (hitData && hitData.frames) {
          const totalFrames = hitData.frames.length
          e.frame = Math.min(Math.floor(e.timer / hitData.frameRate), totalFrames - 1)
          e.life = Math.max(0, e.duration - e.timer)
        }
        break
      }

      // 时间衰减类特效（cast_ring, freeze_aura, root_aura, burn_aura）
      case 'cast_ring':
      case 'freeze_aura':
      case 'root_aura':
      case 'burn_aura':
        e.life -= dt / 1000
        if (e.type === 'root_aura' && e.targetChar) { e.x = e.targetChar.x; e.y = e.targetChar.y }
        if (e.type === 'burn_aura' && e.targetMonster && !e.targetMonster.isDead) {
          e.x = e.targetMonster.x; e.y = e.targetMonster.y
        }
        break

      // 扑击蓄力闪光
      case 'pounce_flash':
      case 'bite_flash':
      case 'stealth_flash':
      case 'silence_cast_flash':
        e.timer += dt
        e.life = Math.max(0, (e.duration || 400) - e.timer)
        break

      // 警示圈 / 目标锁定光环 / 光环类
      case 'pounce_warning':
      case 'bite_target_lock':
      case 'silence_aura':
      case 'transform_burst':
        e.timer += dt
        e.life = Math.max(0, (e.duration || 2000) - e.timer)
        break

      // 射线/光束类
      case 'skill_ray':
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
        break

      case 'aoe_lightning':
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
        break

      // 密排帧动画射线（skill_beam）
      case 'skill_beam':
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
        const beamHitData = HIT_EFFECTS[e.hitType]
        if (beamHitData && beamHitData.frames && beamHitData.frames.length) {
          e.animTimer = (e.animTimer || 0) + dt
          if (e.animTimer >= (beamHitData.frameRate || 30)) {
            e.animTimer = 0
            e.animFrame = (e.animFrame || 0) + 1
            if ((e.animFrame || 0) >= beamHitData.frames.length) e.animFrame = 0
          }
        }
        break

      // 冰刃波动剑
      case 'ice_wave_sword':
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
        if (!e._bladeHits) e._bladeHits = {}
        if (!e._bladeBirths) {
          const iceHitD = HIT_EFFECTS.ice
          const frameRate = (iceHitD && iceHitD.frameRate) || 44
          const bladeAnimDur = 11 * frameRate
          e._bladeBirths = []
          for (let b = 0; b < 8; b++) e._bladeBirths[b] = b * bladeAnimDur
        }
        // 碰撞检测委托到战斗模块
        if (battle._iceWaveCollisionHandler) {
          battle._iceWaveCollisionHandler(e)
        }
        break

      // 冲击波扩散
      case 'buff_shockwave':
        e.timer += dt
        e.life = Math.max(0, e.duration - e.timer)
        break

      // Buff光环（跟随角色位置，时间衰减）
      case 'buff_aura': {
        const elapsed = Date.now() - (e._startTime || 0)
        if (!e._startTime) { e._startTime = Date.now() }
        e.life = Math.max(0, e.maxLife - elapsed / 1000)
        e.timer += dt
        // 光环跟随角色
        if (battle.party) {
          const char = (battle.party || []).find(c => c.id === e.charId || c.name === e.charId)
          if (char) { e.x = char.x; e.y = char.y }
        }
        break
      }
    }
  } catch (effectErr) {
    // 单个特效异常：标记死亡跳过
    if (e && e.type) e.life = 0
  }
}

// ========== 屏幕震动 ==========

/** 施加屏幕震动（衰减式） */
function applyScreenShake(battle, intensityX = 3, intensityY = 2) {
  battle.camera.shakeX = intensityX
  battle.camera.shakeY = intensityY
}

/** 更新相机（含震动衰减） */
function updateCamera(battle, dt) {
  const cam = battle.camera
  cam.x += (cam.targetX - cam.x) * 0.08
  cam.y += (cam.targetY - cam.y) * 0.08
  cam.shakeX *= 0.85
  cam.shakeY *= 0.85
  if (Math.abs(cam.shakeX) < 0.1) cam.shakeX = 0
  if (Math.abs(cam.shakeY) < 0.1) cam.shakeY = 0
}

module.exports = {
  spawnParticles,
  pushEffectSafe,
  addFloatingText,
  updateFloatingTexts,
  renderFloatingTexts,
  spawnHitEffect,
  spawnSkillHitEffect,
  spawnDeathEffect,
  spawnRespawnEffect,
  updateParticles,
  renderParticles,
  updateEffects,
  applyScreenShake,
  updateCamera,
}
