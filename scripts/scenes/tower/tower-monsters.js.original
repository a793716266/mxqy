/**
 * tower-monsters.js - 怪物AI系统
 *
 * 从 tower-battle.js 提取的怪物相关逻辑：
 * - 怪物模板与创建（_getMonsterTemplate / _createMonster）
 * - 怪物主更新循环（AI目标选择/移动/攻击/技能触发）
 * - 怪物技能实现：
 *   - 史莱姆猫：跳跃扑击（黏液扑击AOE+禁锢）
 *   - 暗影鼠：暗影咬（3段近战）+ 暗影突袭（潜行BUFF）
 *   - 猫人：禁止喧哗（减伤光环）+ 幻化变身（残血爆发）
 * - 远程/近程攻击逻辑
 * - 怪物动画帧更新
 * - 怪物渲染（含潜行/幻化/入场动画）
 * - 潜行/幻化状态更新
 *
 * 设计模式：所有函数接收 battle 上下文。
 */

const { MONSTER_SPRITES } = require('./tower-config.js')
const { applyDamage, applyLifesteal, getMonsterTemplate, calcDamage } = require('./tower-combat.js')
const { addFloatingText, pushEffectSafe, spawnParticles, applyScreenShake } = require('./tower-effects.js')
const { separateEntities } = require('./tower-collision.js')

// ========== 怪物创建 ==========

/** 创建怪物实例 */
function createMonster(battle, type, opts = {}) {
  const {
    x = null, y = null, rarity = 'normal',
  } = opts

  const tmpl = getMonsterTemplate(type)
  const area = battle._getBattleArea()

  // ★ 基于战斗区域（非画布）计算分散目标位置 — 右侧区域
  const areaW = area.right - area.left
  const areaH = area.bottom - area.top
  const spreadCX = area.left + areaW * (0.60 + Math.random() * 0.35)
  const spreadCY = area.top + areaH * (0.25 + Math.random() * 0.50)
  
  // ★ 默认出生位置在战斗区域右侧（用相对比例）
  const defaultX = area.right - areaW * 0.06 - Math.random() * areaW * 0.10
  const defaultY = area.top + areaH * (0.30 + Math.random() * 0.40)

  // 等级计算
  const waveNum = battle.waveIndex + 1
  const monsterLevelFn = battle.stageConfig.monsterLevelFn || ((n) => n * 2 + 1)
  const monsterLevel = monsterLevelFn(waveNum)

  const hpScaleFn = battle.stageConfig.hpScaleFn || ((lv) => 1 + (lv - 1) * 0.08)
  const atkScaleFn = battle.stageConfig.atkScaleFn || ((lv) => 1 + (lv - 1) * 0.05)
  const defScaleFn = battle.stageConfig.defScaleFn || ((lv) => 1 + (lv - 1) * 0.04)
  const spdScaleFn = battle.stageConfig.spdScaleFn || ((lv) => 1 + (lv - 1) * 0.05)
  const atkIntFn = battle.stageConfig.atkIntervalFn || ((lv) => 1 - Math.min(0.38, (lv - 1) * 0.02))
  const moveSpdFn = battle.stageConfig.moveSpdFn || ((lv) => 1 + (lv - 1) * 0.03)
  const expMultFn = battle.stageConfig.expMultFn || ((lv) => 1 + (lv - 1) * 0.1)
  const expScaleFn = battle.stageConfig.expScaleFn || ((lv) => 1 + (lv - 1) * 0.1)

  const lvScaleHp = hpScaleFn(monsterLevel)
  const lvScaleAtk = atkScaleFn(monsterLevel)
  const lvScaleDef = defScaleFn(monsterLevel)
  const lvScaleSpd = spdScaleFn(monsterLevel)
  const lvScaleAtkInterval = atkIntFn(monsterLevel)
  const lvScaleMoveSpeed = moveSpdFn(monsterLevel)
  const lvScaleExp = expScaleFn(monsterLevel)

  // 稀有度配置
  const rcfg = battle._RARITY_CONFIG?.[rarity] || battle._RARITY_CONFIG?.normal || { scale: 1.0 }
  const totalHpScale = lvScaleHp * rcfg.scale
  const totalAtkScale = lvScaleAtk * rcfg.scale
  const totalDefScale = lvScaleDef * rcfg.scale

  const finalName = rcfg.namePrefix ? `${rcfg.namePrefix}${tmpl.name}` : tmpl.name

  const m = {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type, name: finalName, displayName: finalName,
    rarity, level: monsterLevel,
    hp: Math.round(tmpl.hp * totalHpScale),
    maxHp: Math.round(tmpl.hp * totalHpScale),
    atk: Math.round(tmpl.atk * totalAtkScale),
    def: Math.round(tmpl.def * totalDefScale),
    spd: Math.round(tmpl.spd * lvScaleSpd),
    atkInterval: Math.max(400, Math.round(tmpl.atkInterval * lvScaleAtkInterval)),
    atkTimer: Math.random() * 1000,
    x: (x != null) ? x : defaultX, y: (y != null) ? y : defaultY,
    targetX: 0, targetY: 0,
    moveSpeed: Math.round((tmpl.moveSpeed + (rarity === 'lord' ? -8 : rarity === 'elite' ? -3 : 0)) * lvScaleMoveSpeed),
    atkRange: tmpl.atkRange + (rarity === 'lord' ? 15 : rarity === 'elite' ? 6 : 0),
    isRanged: tmpl.isRanged || false,
    skills: tmpl.skills || null,
    scale: rarity === 'lord' ? 1.35 : rarity === 'elite' ? 1.15 : 1.0,
    hurtTimer: 0, hurtFlash: 0,
    isDead: false, deathTimer: 0,
    isAttacking: false, attackAnimTimer: 0,
    statusEffects: [], frozenTimer: 0,
    dropQuality: rollDropQuality(battle, rarity),
    dropItem: null, hasDropped: false,
    animState: 'idle', animFrame: 0, animTimer: 0,
    facingRight: false,

    // 技能系统属性
    skillCD: 0, isCastingSkill: false, skillTimer: 0,
    skillStartX: 0, skillStartY: 0, skillTargetX: 0, skillTargetY: 0,
    _currentTarget: null,
    expReward: Math.round((tmpl.expReward || Math.floor(tmpl.hp / 3)) * lvScaleExp * (rcfg.expMult || 1)),

    // 传送入场动画
    spawnAnim: 0, spawnTimer: 0,
    spawnDuration: 500 + Math.random() * 300,
    isSpawning: true,
    spreadTargetX: spreadCX, spreadTargetY: spreadCY,

    // 动画时间戳初始化
    _animStartTime: Date.now(),

    // 暗影鼠潜行属性
    isStealthed: false, stealthTimer: 0, stealthUntil: 0,
    _stealthSkillActive: false, _stealthSkillTimer: 0,
    _biteSkillActive: false, _biteSkillTimer: 0, _biteHitsDone: [], _biteLockedTarget: null,

    // 猫人属性
    isTransformed: false, transformHpThreshold: 0.35, hasTransformedThisLife: false,
    _silenceAuraActive: false, _silenceAuraTimer: 0,
    _silenceSkillActive: false, _silenceSkillTimer: 0,
    _transformActive: false, _transformTimer: 0,
    _baseAtk: Math.round(tmpl.atk * totalAtkScale),
    _baseDef: Math.round(tmpl.def * totalDefScale),
    _baseMoveSpeed: Math.round((tmpl.moveSpeed + (rarity === 'lord' ? -8 : rarity === 'elite' ? -3 : 0)) * lvScaleMoveSpeed),
    _baseAtkInterval: Math.max(400, Math.round(tmpl.atkInterval * lvScaleAtkInterval)),
  }

  m.targetX = m.x; m.targetY = m.y

  // ★ 确保怪物初始位置在战斗区域内
  battle._clampToBattleArea(m)
  m.targetX = m.x; m.targetY = m.y // clamp 后同步目标点

  // 确保分散目标在活动区域内
  const st = { x: m.spreadTargetX, y: m.spreadTargetY }
  battle._clampToBattleArea(st)
  m.spreadTargetX = st.x; m.spreadTargetY = st.y

  battle.monsters.push(m)
  return m
}

function rollDropQuality(battle, rarity) {
  const boost = battle._dropRareBoost || 0
  const drops = battle.stageConfig.drops || {}
  const rarityBonusCfg = drops.rarityBonus || { elite: 0.2, lord: 0.4 }
  const qualityWeights = drops.qualityWeights || { common: 0.60, rare: 0.25, epic: 0.12, legendary: 0.03 }

  const rarityBonus = rarity === 'lord' ? (rarityBonusCfg.lord || 0.4)
    : rarity === 'elite' ? (rarityBonusCfg.elite || 0.2) : 0
  const r = Math.random() * (1 - rarityBonus) + rarityBonus

  let cumulative = 0
  for (const [q, p] of Object.entries(qualityWeights)) {
    cumulative += (q === 'legendary' || q === 'epic') ? p * (1 + boost * 0.5) : p
    if (r <= cumulative) return q
  }
  return 'common'
}

// ========== 怪物主更新循环 ==========

function updateMonsters(battle, dt) {
  for (const m of battle.monsters) {
    try {
    if (m.isDead) {
      m.deathTimer -= dt
      continue
    }

    if (m.frozenTimer > 0) { m.frozenTimer -= dt; continue }

    // ★ 潜行过期检测：超时后恢复可见
    if (m.isStealthed && m.stealthUntil && Date.now() > m.stealthUntil) {
      m.isStealthed = false
      m.stealthUntil = 0
      if (m._preStealthMoveSpeed) {
        m.moveSpeed = m._preStealthMoveSpeed
        m._preStealthMoveSpeed = null
      }
    }

    // ★ 处理传送入场动画 — spawn 完成前跳过 AI
    if (m.isSpawning) {
      m.spawnAnim = (m.spawnAnim || 0) + dt
      m.spawnTimer = (m.spawnTimer || 0) + dt
      const dur = m.spawnDuration || 800
      if (m.spawnTimer >= dur) {
        m.isSpawning = false
        m.spawnAnim = 0
        m.spawnTimer = 0
      }
      updateMonsterAnim(m, dt)
      battle._clampToBattleArea(m)
      continue  // 入场期间不执行移动/攻击/AI
    }

    updateMonsterAnim(m, dt)

    // 选择智能目标
    const target = findSmartTarget(battle, m)
    if (!target) continue

    const dx = target.x - m.x, dy = target.y - m.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // 更新朝向
    if (Math.abs(dx) > 3) m.facingRight = dx > 0

    // 技能CD倒计时
    if (m.skillCD > 0) m.skillCD = Math.max(0, m.skillCD - dt)

    // 正在施放技能 → 只更新技能状态
    if (m.isCastingSkill) {
      try {
        dispatchMonsterSkillUpdate(battle, m, target, dt)
      } catch (err) {
        console.error(`[Tower] 技能异常(${m.type}):`, err.message || err)
        resetMonsterSkillState(m)
      }
      // 超时保护
      if (m.attackAnimTimer > 8000) resetMonsterSkillState(m)
      battle._clampToBattleArea(m)
      continue
    }

    // 技能触发检测
    if (!m.isCastingSkill && !m.isAttacking && m.skillCD <= 0) {
      const spr = MONSTER_SPRITES[m.type]

      // 史莱姆猫跳跃扑击
      if (spr && spr.pounceSkill && dist <= spr.pounceSkill.range + 50) {
        slimeCatPounceAttack(battle, m, target, dt); continue
      }

      // 暗影鼠技能
      if (spr && m.type === 'goblin') {
        const biteRange = (spr.biteSkill && spr.biteSkill.range) || 140
        if (spr.biteSkill && dist <= biteRange) {
          shadowBite(battle, m, target, dt); continue
        }
        if (spr.stealthSkill && dist > biteRange + 30) {
          shadowRush(battle, m, target, dt); continue
        }
      }

      // 猫人禁止喧哗
      if (spr && m.type === 'orc' && spr.silenceSkill && dist <= (spr.silenceSkill.range || 300)) {
        catmanSilence(battle, m, target, dt); continue
      }
    }

    // 猫人幻化检测
    if (m.type === 'orc' && !m.isCastingSkill && !m.hasTransformedThisLife && !m.isTransformed) {
      const tSpr = MONSTER_SPRITES[m.type]
      const tCfg = (tSpr && tSpr.transformSkill) || null
      if (tCfg && (m.hp || 0) / (m.maxHp || 1) <= (m.transformHpThreshold || 0.35)) {
        catmanTransform(battle, m); continue
      }
    }

    // 移动+攻击逻辑
    executeMovementAndAttack(battle, m, target, dt, dist, dx, dy)

    battle._clampToBattleArea(m)
    } catch(monErr) {
      if (!m._errLogged || Date.now() - m._errLogged > 3000) {
        console.error(`[Monster] ${m.type} 异常:`, monErr.message || monErr)
        m._errLogged = Date.now()
      }
    }
  }

  // 怪物间碰撞分离
  separateEntities(battle.monsters, null, 55, 200, dt, {
    clampToBattleArea: battle._clampToBattleArea.bind(battle),
    clampTargetToArea: battle._clampTargetToArea.bind(battle),
  })
  separateEntities(battle.monsters, battle.party, 45, 180, dt, {
    clampToBattleArea: battle._clampToBattleArea.bind(battle),
    clampTargetToArea: battle._clampTargetToArea.bind(battle),
  })
}

function executeMovementAndAttack(battle, m, target, dt, dist, dx, dy) {
  if (m.isRanged) {
    // 远程怪物：保持距离
    const minRange = m.atkRange * 0.6
    const maxRange = m.atkRange * 1.1
    if (dist < minRange) {
      m.x -= (dx / dist) * m.moveSpeed * (dt / 1000) * 0.6
      m.y -= (dy / dist) * m.moveSpeed * (dt / 1000) * 0.6
      battle._clampToBattleArea(m)
      if (m.animState !== 'walk') { m.animState = 'walk'; m.animFrame = 0 }
    } else if (dist > maxRange) {
      m.x += (dx / dist) * m.moveSpeed * (dt / 1000)
      m.y += (dy / dist) * m.moveSpeed * (dt / 1000)
      battle._clampToBattleArea(m)
      if (m.animState !== 'walk') { m.animState = 'walk'; m.animFrame = 0 }
    } else {
      if (m.animState !== 'attack') { m.animState = 'attack'; m.animFrame = 0 }
      m.atkTimer -= dt
      if (m.atkTimer <= 0 && !m.isAttacking) {
        monsterRangedAttack(battle, m, target, false)
      }
    }
  } else {
    // 近战怪物：贴身攻击
    const _spr = MONSTER_SPRITES[m.type]
    const _biteRange = (_spr && _spr.biteSkill && _spr.biteSkill.range) || 140
    const _skipForSkill = (m.type === 'goblin' && _spr && _spr.biteSkill &&
                            m.skillCD <= 0 && dist <= _biteRange)

    if (dist > m.atkRange) {
      m.x += (dx / dist) * m.moveSpeed * (dt / 1000)
      m.y += (dy / dist) * m.moveSpeed * (dt / 1000)
      battle._clampToBattleArea(m)
      if (m.animState !== 'walk') { m.animState = 'walk'; m.animFrame = 0 }
    } else if (!_skipForSkill) {
      if (m.animState !== 'attack') { m.animState = 'attack'; m.animFrame = 0 }
      m.atkTimer -= dt
      if (m.atkTimer <= 0 && !m.isAttacking) {
        monsterMeleeAttack(battle, m, target, false)
      }
    } else {
      if (m.animState !== 'idle') { m.animState = 'idle'; m.animFrame = 0 }
    }
  }
}

// ========== 怪物攻击 ==========

function monsterRangedAttack(battle, monster, target, isCrystal) {
  const skillsFiltered = monster.skills && monster.skills.length > 0
    ? monster.skills.filter(s => !s.mpCost || Math.random() > 0.25)
    : []
  const skill = skillsFiltered.length > 0
    ? skillsFiltered[Math.floor(Math.random() * skillsFiltered.length)]
    : null

  let baseDmg = Math.max(1, monster.atk)
  if (!isCrystal) baseDmg = Math.max(1, monster.atk - (target.def || 0) * 0.3)
  if (skill) baseDmg = Math.floor(baseDmg * (skill.power || 1.2))
  const finalDmg = Math.floor(baseDmg * (0.85 + Math.random() * 0.3))

  // 施法特效提示
  if (skill) {
    const effectColor = skill.effect === 'freeze' ? '#66ccff' : '#ff66aa'
    addFloatingText(battle, monster.x, monster.y - 35, `✨ ${skill.name}!`, effectColor, 1.8)
    battle.effects.push({ type: 'cast_ring', x: monster.x, y: monster.y - 15, radius: 5, maxRadius: 30 + (skill.power || 1) * 12, color: effectColor, life: 0.6, maxLife: 0.6 })
  }

  const projColor = skill ? (skill.effect === 'freeze' ? '#55ddff' : '#ff55aa') : '#44aaff'

  // 生成投射物
  battle.projectiles.push({
    x: monster.x, y: monster.y - 10,
    targetX: target.x, targetY: target.y, target,
    targetType: isCrystal ? 'homeCrystal' : 'char',
    dmg: finalDmg,
    speed: 200 + Math.random() * 80, color: projColor,
    size: skill ? 8 : 5,
    isSkill: !!skill, trail: [],
    skillName: skill?.name || null,
    skillEffect: skill?.effect || null,
    freezeChance: skill?.freezeChance || 0,
    freezeDuration: skill?.freezeDuration || 0,
    onHit: (proj) => {
      if (isCrystal || proj.targetType === 'homeCrystal') {
        // homeCrystalTakeDamage(target, proj.dmg) — 由外部处理或跳过
      } else {
        applyDamage(battle, target, 'monster', proj.dmg)
        // ★ 不应对 target 施加吸血，怪物攻击不会触发角色吸血
        pushEffectSafe(battle, { type: 'hit', x: target.x, y: target.y - 20 }) // 简化命中特效
      }
      if (proj.skillEffect === 'freeze' && proj.freezeChance > 0 && Math.random() < proj.freezeChance) {
        addFloatingText(battle, target.x, target.y - 30, '\u2744 冰冻!', '#66ccff', 1.5)
        if (!target.statusEffects) target.statusEffects = []
        target.statusEffects.push({ type: 'freeze', duration: proj.freezeDuration })
        target.frozenTimer = proj.freezeDuration
        battle.effects.push({ type: 'freeze_aura', x: target.x, y: target.y, life: proj.freezeDuration / 1000, maxLife: proj.freezeDuration / 1000 })
      }
    }
  })

  monster.atkTimer = monster.atkInterval
  // ★ 远程攻击动画状态（之前遗漏，导致远程怪物无攻击动画）
  monster.isAttacking = true
  monster.attackAnimTimer = 400
  monster.animState = 'attack'
  monster.animFrame = 0
}

function monsterMeleeAttack(battle, monster, target, isCrystal) {
  let baseDmg = Math.max(1, monster.atk - (target.def || 0) * 0.5)
  const finalDmg = Math.floor(baseDmg * (0.85 + Math.random() * 0.3))

  applyDamage(battle, target, 'monster', finalDmg)
  // ★ 注意：不应对 target 施加吸血，怪物攻击不会触发角色吸血
  pushEffectSafe(battle, { type: 'hit', x: target.x, y: target.y - 20 })

  monster.atkTimer = monster.atkInterval
  monster.isAttacking = true
  monster.attackAnimTimer = 350
  monster.animState = 'attack'
  monster.animFrame = 0
}

// ========== 怪物技能：史莱姆猫跳跃扑击 ==========

function slimeCatPounceAttack(battle, monster, target, dt) {
  const spr = MONSTER_SPRITES[monster.type]
  if (!spr || !spr.pounceSkill) return
  const cfg = spr.pounceSkill

  if (!monster.isCastingSkill) {
    // 初始化
    monster.isCastingSkill = true
    monster.animState = 'skill'; monster.animFrame = 0; monster.animTimer = 0
    monster.skillTimer = 0; monster.isAttacking = true; monster.attackAnimTimer = 2000
    monster._pounceDamageDone = false
    monster.skillStartX = monster.x; monster.skillStartY = monster.y
    monster.skillTargetX = target.x; monster.skillTargetY = target.y

    addFloatingText(battle, monster.x, monster.y - 40, `⚡ ${cfg.name}!`, '#7ec850', 2.5)

    // 警示圈
    battle.effects.push({ type: 'pounce_warning', x: target.x, y: target.y, radius: cfg.aoeRadius || 100, timer: 0, duration: 2000, life: 2000 })
    // 蓄力闪光
    battle.effects.push({ type: 'pounce_flash', x: monster.x, y: monster.y, timer: 0, duration: 1200, life: 1200, radius: 5, maxRadius: 140 })
    return
  }

  // 时间驱动三阶段
  const T_WARN_END = 1200, T_DASH_END = 1650, T_DMG_TIME = 1520, T_TOTAL = 2000
  monster.skillTimer += dt
  const t = monster.skillTimer

  if (t < T_WARN_END) {
    monster.animFrame = Math.min(2, Math.floor((t / T_WARN_END) * 12) % 3)
  } else if (t < T_DASH_END) {
    const dashT = (t - T_WARN_END) / (T_DASH_END - T_WARN_END)
    const overshoot = 30
    const endX = monster.skillTargetX + (monster.skillTargetX > monster.skillStartX ? overshoot : -overshoot)
    const endY = monster.skillTargetY + (monster.skillTargetY > monster.skillStartY ? overshoot : -overshoot)
    monster.x = monster.skillStartX + (endX - monster.skillStartX) * dashT
    monster.y = monster.skillStartY + (endY - monster.skillStartY) * dashT
    battle._clampToBattleArea(monster)  // ★ 扑击期间也要钳制，防止飞出边界
    monster.targetX = monster.x; monster.targetY = monster.y
    monster.animFrame = 3 + Math.min(5, Math.floor(dashT * 7))

    if (t >= T_DMG_TIME && !monster._pounceDamageDone) {
      monster._pounceDamageDone = true
      const skillDmg = Math.floor(monster.atk * cfg.power * (0.85 + Math.random() * 0.3))
      const aoeR = cfg.aoeRadius || 100
      const dmgCenterX = monster.skillTargetX, dmgCenterY = monster.skillTargetY

      for (const c of battle.party) {
        if (c.isDead) continue
        const cdx = c.x - dmgCenterX, cdy = c.y - dmgCenterY
        const cDist = Math.sqrt(cdx*cdx + cdy*cdy)
        if (cDist <= aoeR) {
          const distRatio = Math.max(0.3, 1 - cDist / aoeR)
          const finalDmg = Math.max(1, Math.floor(skillDmg * distRatio))
          const reducedDmg = Math.max(1, finalDmg - (c.def || 0) * 0.3)
          applyDamage(battle, c, 'char', reducedDmg)
          addFloatingText(battle, c.x, c.y - 20, `-${reducedDmg} [${cfg.name}]`, '#7ec850')
          if (Math.random() < cfg.rootChance) {
            applyRootEffect(battle, c, cfg.rootDuration)
            addFloatingText(battle, c.x, c.y - 70, '\u26D3 禁锢!', '#ffaa00', 1.8)
          }
        }
      }
      battle.effects.push({ type: 'buff_shockwave', x: dmgCenterX, y: dmgCenterY, color: '#7ec850', radius: aoeR * 0.8, timer: 0, duration: 500, isAoe: true, life: 500 })
    }
  } else {
    const recoverT = (t - T_DASH_END) / (T_TOTAL - T_DASH_END)
    monster.animFrame = 9 + Math.min(1, Math.floor(recoverT * 3))
  }

  // 技能结束恢复
  if (t >= T_TOTAL) {
    monster.isCastingSkill = false; monster.animState = 'idle'; monster.animFrame = 0
    monster.animTimer = 0; monster.isAttacking = false; monster.attackAnimTimer = 0
    monster._pounceDamageDone = false; monster.skillCD = cfg.cooldown; monster.atkTimer = monster.atkInterval
    battle._clampToBattleArea(monster)
  }
}

// ========== 怪物技能：暗影咬（3段攻击）==========

function shadowBite(battle, monster, target, dt) {
  const spr = MONSTER_SPRITES[monster.type]
  if (!spr || !spr.biteSkill) return
  const cfg = spr.biteSkill

  // 锁定目标
  if (!monster.isCastingSkill && !monster._biteSkillActive && target && !target.isDead) {
    monster._biteLockedTarget = target
  }
  const lockedTarget = monster._biteLockedTarget
  // 优先使用锁定目标，如果锁定目标无效则使用当前目标
  let effectiveTarget = null
  if (lockedTarget && !lockedTarget.isDead && (lockedTarget.currentHp || 0) > 0) {
    effectiveTarget = lockedTarget
  } else if (target && !target.isDead && (target.currentHp || 0) > 0) {
    effectiveTarget = target
  }

  if (!effectiveTarget) {
    resetMonsterSkillState(monster); monster.skillCD = cfg.cooldown || 15000; monster._biteLockedTarget = null; return
  }

  if (!monster.isCastingSkill && !monster._biteSkillActive) {
    monster.isCastingSkill = true; monster._biteSkillActive = true
    monster.animState = 'skill'; monster.animFrame = 0; monster.animTimer = 0
    monster._biteSkillTimer = 0; monster.isAttacking = true
    const totalDuration = (3 * (cfg.chargeFrameRate || 330)) + (9 * (cfg.attackFrameRate || 110))
    monster.attackAnimTimer = totalDuration; monster._biteHitsDone = []
    monster.skillStartX = monster.x; monster.skillStartY = monster.y
    monster.skillTargetX = effectiveTarget.x; monster.skillTargetY = effectiveTarget.y

    addFloatingText(battle, monster.x, monster.y - 40, '\uD83D\uDD7A ' + cfg.name + '!', '#a855f7', 2.0)
    battle.effects.push({ type: 'bite_flash', x: monster.x, y: monster.y, timer: 0, duration: cfg.preBiteTime || 1000, life: cfg.preBiteTime || 1000, radius: 5, maxRadius: 120, color: '#a855f7' })
    battle.effects.push({ type: 'bite_target_lock', x: target.x, y: target.y, timer: 0, duration: totalDuration, life: totalDuration, color: '#a855f7' })
    return
  }

  // 时间驱动两段式帧率
  monster._biteSkillTimer += dt
  const t = monster._biteSkillTimer
  const chargeRate = cfg.chargeFrameRate || 330, attackRate = cfg.attackFrameRate || 110
  const chargeTime = 3 * chargeRate, totalDuration = chargeTime + 9 * attackRate

  let frameIndex
  if (t < chargeTime) frameIndex = Math.min(2, Math.floor(t / chargeRate))
  else frameIndex = Math.min(11, 3 + Math.floor((t - chargeTime) / attackRate))
  monster.animFrame = frameIndex

  // 3段伤害判定
  const hitFrames = [4, 7, 10]
  for (const hitF of hitFrames) {
    if (frameIndex === hitF && !monster._biteHitsDone.includes(hitF)) {
      monster._biteHitsDone.push(hitF)
      const tgt = effectiveTarget
      if (tgt && !tgt.isDead && tgt.currentHp > 0) {
        const tdx = tgt.x - monster.x, tdy = tgt.y - monster.y
        const hitDist = Math.sqrt(tdx*tdx + tdy*tdy)
        if (hitDist <= (monster.atkRange || 80) + 40) {
          const biteDmg = Math.floor(monster.atk * cfg.power * (0.85 + Math.random() * 0.3))
          const reducedDmg = Math.max(1, biteDmg - (tgt.def || 0) * 0.25)
          applyDamage(battle, tgt, 'char', reducedDmg)
          addFloatingText(battle, tgt.x, tgt.y - 20, `-${reducedDmg}`, '#a855f7', 1.2)
        }
      }
      battle.effects.push({ type: 'buff_shockwave', x: monster.x, y: monster.y - 15, color: '#a855f7', radius: 35, timer: 0, duration: 250, life: 250 })
    }
  }

  // 超时结束
  if (t >= totalDuration || frameIndex >= 11 || t > 5000) {
    resetMonsterSkillState(monster); monster._biteSkillTimer = 0
    monster._biteHitsDone = []; monster._biteLockedTarget = null
    monster.skillCD = cfg.cooldown; monster.atkTimer = monster.atkInterval
  }
}

// ========== 怪物技能：暗影突袭（潜行）==========

function shadowRush(battle, monster, target, dt) {
  const spr = MONSTER_SPRITES[monster.type]
  if (!spr || !spr.stealthSkill) return
  const cfg = spr.stealthSkill

  if (!monster.isCastingSkill && !monster._stealthSkillActive) {
    monster.isCastingSkill = true; monster._stealthSkillActive = true
    monster.animState = 'skill'; monster.animFrame = 0; monster.animTimer = 0
    monster._stealthSkillTimer = 0; monster.isAttacking = true; monster.attackAnimTimer = 800
    monster.skillStartX = monster.x; monster.skillStartY = monster.y
    monster.skillTargetX = target.x; monster.skillTargetY = target.y

    addFloatingText(battle, monster.x, monster.y - 40, '\uD83E\uDD2A ' + cfg.name + '!', '#6366f1', 2.0)
    battle.effects.push({ type: 'stealth_flash', x: monster.x, y: monster.y, timer: 0, duration: 600, life: 600, color: '#6366f1' })
    return
  }

  monster._stealthSkillTimer += dt
  const t = monster._stealthSkillTimer

  if (t < 800) {
    monster.animFrame = Math.min(5, Math.floor(t / 120))
  } else if (t < 900) {
    monster.animFrame = Math.min(11, 6 + Math.floor((t - 800) / 150))
    if (!monster.isStealthed) {
      monster.isStealthed = true; monster.stealthUntil = Date.now() + cfg.stealthDuration
      monster.stealthTimer = cfg.stealthDuration
      monster._preStealthMoveSpeed = monster.moveSpeed
      monster.moveSpeed = Math.round(monster.moveSpeed * cfg.speedBoost)
      addFloatingText(battle, monster.x, monster.y - 50, `\uD83D\uDC68 潜行 ${cfg.stealthDuration / 1000}s!`, '#6366f1', 1.8)
      for (let i = 0; i < 8; i++) {
        const angle = (Date.now() / 200 + i * Math.PI / 2) % (Math.PI * 2)
        battle.particles.push({ x: monster.x, y: monster.y, vx: Math.cos(angle)*40, vy: Math.sin(angle)*20, size: 4+Math.random()*4, color: 'rgba(99,102,241,0.6)', life:1, decay: 2.0 })
      }
    }
  } else {
    monster.isCastingSkill = false; monster._stealthSkillActive = false
    monster._stealthSkillTimer = 0; monster.animState = 'walk'; monster.animFrame = 0
    monster.isAttacking = false; monster.attackAnimTimer = 0
    monster.skillCD = cfg.cooldown
  }
}

// ========== 怪物技能：猫人禁止喧哗 ==========

function catmanSilence(battle, monster, target, dt) {
  const spr = MONSTER_SPRITES[monster.type]
  if (!spr || !spr.silenceSkill) return
  const cfg = spr.silenceSkill

  if (!monster.isCastingSkill && !monster._silenceSkillActive) {
    monster.isCastingSkill = true; monster._silenceSkillActive = true
    monster.animState = 'skill'; monster.animFrame = 0; monster.animTimer = 0
    monster._silenceSkillTimer = 0; monster.isAttacking = true; monster.attackAnimTimer = cfg.castTime || 800
    addFloatingText(battle, monster.x, monster.y - 40, `\uD83E\u{1F918} ${cfg.name}!`, '#60a5fa', 2.0)
    battle.effects.push({ type: 'silence_cast_flash', x: monster.x, y: monster.y, timer: 0, duration: 800, life: 800, color: '#60a5fa' })
    return
  }

  monster._silenceSkillTimer += dt
  const t = monster._silenceSkillTimer
  if (t < (cfg.castTime || 800)) {
    monster.animFrame = Math.min(5, Math.floor(t / 160))
  } else {
    // 施放完成 → 光环生效（对范围内角色施加减伤debuff）
    if (!monster._silenceAuraActive) {
      monster._silenceAuraActive = true; monster._silenceAuraTimer = cfg.duration || 5000
      addFloatingText(battle, monster.x, monster.y - 50, `\uD83E\uDD18 减伤30%!`, '#60a5fa', 1.8)
      // ★ 对范围内角色施加减伤debuff
      const auraRange = cfg.range || 300
      const duration = cfg.duration || 5000
      for (const c of (battle.party || [])) {
        if (c.isDead) continue
        const dx = c.x - monster.x, dy = c.y - monster.y
        const dist = Math.sqrt(dx*dx + dy*dy)
        if (dist <= auraRange) {
          if (!c.statusEffects) c.statusEffects = []
          // 先移除旧的，避免重复叠加
          c.statusEffects = c.statusEffects.filter(e => e.type !== 'silence_dmg_reduction')
          c.statusEffects.push({ type: 'silence_dmg_reduction', damageReduction: cfg.dmgReduction || 0.30, duration, startTime: Date.now() })
          addFloatingText(battle, c.x, c.y - 40, '🔇 减伤!', '#60a5fa', 1.2)
        }
      }
    }
    // 持续检测：角色进入范围时也施加debuff
    const auraRange = cfg.range || 300
    const duration = cfg.duration || 5000
    const remainingDuration = (cfg.castTime || 800) + duration - monster._silenceSkillTimer
    for (const c of (battle.party || [])) {
      if (c.isDead) continue
      const dx = c.x - monster.x, dy = c.y - monster.y
      const dist = Math.sqrt(dx*dx + dy*dy)
      if (dist <= auraRange) {
        if (!c.statusEffects) c.statusEffects = []
        const existing = c.statusEffects.find(e => e.type === 'silence_dmg_reduction')
        if (!existing) {
          c.statusEffects.push({ type: 'silence_dmg_reduction', damageReduction: cfg.dmgReduction || 0.30, duration: Math.max(1000, remainingDuration), startTime: Date.now() })
        }
      }
    }
    battle.effects.push({ type: 'silence_aura', x: monster.x, y: monster.y, timer: 0, duration: cfg.duration || 5000, life: cfg.duration || 5000, range: cfg.range || 300 })
  }

  if (t >= (cfg.castTime || 800) + (cfg.duration || 5000)) {
    monster.isCastingSkill = false; monster._silenceSkillActive = false
    monster._silenceAuraActive = false; monster._silenceSkillTimer = 0
    monster.animState = 'idle'; monster.animFrame = 0
    monster.isAttacking = false; monster.attackAnimTimer = 0
    monster.skillCD = cfg.cooldown; monster.atkTimer = monster.atkInterval
  }
}

// ========== 怪物技能：猫人幻化 ==========

function catmanTransform(battle, monster, dt) {
  const spr = MONSTER_SPRITES[monster.type]
  if (!spr || !spr.transformSkill) return
  const cfg = spr.transformSkill

  if (!monster._transformActive) {
    monster._transformActive = true; monster._transformTimer = 0
    monster.isCastingSkill = true; monster.isAttacking = true; monster.attackAnimTimer = cfg.castTime || 1200
    monster.animState = 'skill'; monster.animFrame = 0; monster.animTimer = 0
    monster.hasTransformedThisLife = true

    addFloatingText(battle, monster.x, monster.y - 40, `✨ 幻化! ✨`, '#f59e0b', 2.5)
    battle.effects.push({ type: 'transform_burst', x: monster.x, y: monster.y, timer: 0, duration: 1200, life: 1200 })
    return
  }

  monster._transformTimer += dt
  const t = monster._transformTimer
  const dur = cfg.castTime || 1200

  if (t < dur) {
    monster.animFrame = Math.min(5, Math.floor(t / 240))
  } else {
    // 变身完成！应用永久加成
    if (!monster.isTransformed) {
      monster.isTransformed = true
      monster.atk = Math.round(monster._baseAtk * (1 + (cfg.atkBoost || 0)))
      monster.def = Math.round(monster._baseDef * (1 + (cfg.defBoost || 0)))
      monster.moveSpeed = Math.round(monster._baseMoveSpeed * (1 + (cfg.spdBoost || 0)))
      monster._baseAtkInterval = Math.max(400, Math.round(monster._baseAtkInterval / (1 + (cfg.atkSpeedBoost || 0))))

      addFloatingText(battle, monster.x, monster.y - 50, `\uD83D\uDD25 🔥${monster.atk} DEF${monster.def} SPD${monster.moveSpeed}`, '#f59e0b', 2.2)
    }
    monster._transformActive = false; monster.isCastingSkill = false
    monster.animState = 'idle'; monster.animFrame = 0
    monster.isAttacking = false; monster.attackAnimTimer = 0; monster._transformTimer = 0
  }
}

// ========== 辅助函数 ==========

function dispatchMonsterSkillUpdate(battle, m, target, dt) {
  const spr = MONSTER_SPRITES[m.type]
  if (spr && spr.pounceSkill) { slimeCatPounceAttack(battle, m, target, dt) }
  else if (m._biteSkillActive) { shadowBite(battle, m, target, dt) }
  else if (m._stealthSkillActive) { shadowRush(battle, m, target, dt) }
  else if (m._silenceSkillActive) { catmanSilence(battle, m, target, dt) }
  else if (m._transformActive) { catmanTransform(battle, m, dt) }
}

function resetMonsterSkillState(m) {
  m.isCastingSkill = false; m._biteSkillActive = false
  m._stealthSkillActive = false; m._silenceSkillActive = false
  m._silenceAuraActive = false; m._transformActive = false
  m.isAttacking = false; m.animState = 'idle'; m.animFrame = 0
  m.attackAnimTimer = 0; m.skillTimer = 0
  m._biteSkillTimer = 0; m._biteHitsDone = []
  m._biteLockedTarget = null; m._stealthSkillTimer = 0
  m._silenceSkillTimer = 0; m._transformTimer = 0
}

function applyRootEffect(battle, char, duration) {
  if (!char) return
  char.rootedUntil = Date.now() + duration
  addFloatingText(battle, char.x, char.y - 70, '\u26D3 禁锢!', '#ffaa00', 1.8)
  battle.effects.push({ type: 'root_aura', targetChar: char, x: char.x, y: char.y, timer: 0, duration, life: duration / 1000 })
}

function findSmartTarget(battle, m) {
  // 简化版：返回最近存活角色
  let best = null, bestDist = Infinity
  for (const c of battle.party) {
    if (c.isDead) continue
    const dx = c.x - m.x, dy = c.y - m.y
    const d = dx*dx + dy*dy
    if (d < bestDist) { bestDist = d; best = c }
  }
  return best
}

function updateMonsterAnim(m, dt) {
  const spr = MONSTER_SPRITES[m.type] || MONSTER_SPRITES.slime
  const frames = spr[m.animState] || spr.idle
  if (!frames || frames.length === 0) return
  const rate = spr.frameRate[m.animState] || spr.frameRate.idle || 250
  m.animTimer += dt
  if (m.animTimer >= rate) { m.animTimer = 0; m.animFrame = (m.animFrame + 1) % frames.length }
}

module.exports = {
  createMonster,
  updateMonsters,
  slimeCatPounceAttack,
  shadowBite,
  shadowRush,
  catmanSilence,
  catmanTransform,
}
