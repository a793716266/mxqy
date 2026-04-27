/**
 * tower-combat.js - 战斗核心逻辑
 *
 * 从 tower-battle.js 提取的全部战斗计算与技能系统：
 * - 伤害公式（物理/法术）
 * - 伤害应用（含潜行/幻化免疫）
 * - 生命偷取
 * - 怪物击杀（经验/掉落/金币）
 * - 角色攻击逻辑（普攻+暴击）
 * - 技能施放系统（火球/冰晶/雷电/魔法导弹等）
 * - Buff技能（战吼/狂暴/二档）
 * - Buff/Debuff更新循环（灼烧DoT等）
 * - 有效属性计算（ATK/MATK含buff加成）
 *
 * 设计模式：所有函数接收 battle 上下文 + 相关实体参数。
 */

const { RARITY_CONFIG, BURN_DEBUFF, BUFF_CONFIG, RESPAWN_TABLE, EXP_TABLE } = require('./tower-config.js')
const getRandomEquipment = require('../../data/equipment.js').getRandomEquipment
const Effects = require('./tower-effects.js')

// ========== 伤害计算 ==========

/** 基础伤害公式 */
function calcDamage(atk, def, isMagic = false) {
  if (!isFinite(atk) || !isFinite(def)) {
    atk = isFinite(atk) ? atk : 1
    def = 0
  }
  if (isMagic) {
    return Math.max(1, atk - def * 0.3)
  }
  return Math.max(1, atk - def * 0.5)
}

/** 应用伤害到目标（含特殊状态免疫判定 + 减伤debuff） */
function applyDamage(battle, target, type, dmg) {
  if (!isFinite(dmg)) dmg = 0

  // 已死亡目标不再受伤
  if (target.isDead) return

  // 潜行免疫：暗影鼠潜行期间闪避
  if (target.isStealthed && target.type === 'goblin') {
    Effects.addFloatingText(battle, target.x, target.y - 30, '\uD83D\uDC28 闪避!', '#6366f1', 0.8)
    return
  }

  // 幻化无敌：猫人变身期间免疫
  if (target._transformActive && target.type === 'orc') {
    Effects.addFloatingText(battle, target.x, target.y - 30, '\u2728 无敌!', '#f59e0b', 0.8)
    return
  }

  // ★ 减伤debuff（猫人禁止喧哗等）
  if (target.statusEffects && target.statusEffects.length > 0) {
    for (const eff of target.statusEffects) {
      if (eff.type === 'silence_dmg_reduction' && eff.damageReduction > 0) {
        // 检查是否过期
        if (Date.now() - (eff.startTime || 0) < (eff.duration || 0)) {
          dmg = Math.floor(dmg * (1 - eff.damageReduction))
        }
      }
    }
    // 清理过期的statusEffects
    const now = Date.now()
    target.statusEffects = target.statusEffects.filter(e => {
      if (!e.duration || !e.startTime) return true
      return now - e.startTime < e.duration
    })
  }

  // ★ 区分角色（currentHp）和怪物（hp）
  const isCharacter = 'currentHp' in target

  if (isCharacter) {
    target.currentHp -= dmg
    if (!isFinite(target.currentHp)) target.currentHp = 0
    if (target.currentHp < 0) target.currentHp = 0
  } else {
    target.hp -= dmg
    if (!isFinite(target.hp)) target.hp = target.maxHp || 1
  }

  target.hurtTimer = 200
  target.hurtFlash = 150
  target.shakeX = (Math.random() - 0.5) * 10
  target.shakeY = (Math.random() - 0.5) * 10

  // ★ 统计：区分伤害类型
  if (isCharacter) {
    battle.stats.damageTaken += dmg
  } else {
    battle.stats.damageDealt += dmg
  }

  if (isCharacter) {
    // ★ 角色死亡 → 复活倒计时
    if (target.currentHp <= 0 && !target.isDead) {
      target.isDead = true
      target.currentHp = 0
      const respawnSec = (RESPAWN_TABLE[target.level] || target.level * 2) * (1 - (battle._respawnBoost || 0))
      target.respawnTimer = Math.max(1000, respawnSec * 1000)
      target.hurtTimer = 0; target.hurtFlash = 0
      target.isCasting = false; target.castSkillId = null
      Effects.addFloatingText(battle, target.x, target.y - 40, `\uD83D\uDC80 ${target.name} 阵亡!`, '#ff4444', 2.0)
      Effects.spawnParticles(battle, target.x, target.y, { count: 12, color: '#ff4444' })
    }
  } else {
    // ★ 怪物死亡 → 经验/掉落/金币
    if (target.hp <= 0) {
      killMonster(battle, target)
    }
  }
}

// ========== 生命偷取 ==========

function applyLifesteal(battle, char, dmg) {
  if (!char || char.isDead || !char.lifesteal || char.lifesteal <= 0) return
  if (!isFinite(dmg) || dmg <= 0) return
  // 确保角色有 currentHp 字段
  if (char.currentHp === undefined) char.currentHp = char.maxHp || 100

  const healAmount = Math.floor(dmg * char.lifesteal)
  if (!isFinite(healAmount) || healAmount <= 0) return

  const currentHp = char.currentHp || 0
  const maxHp = char.maxHp || 100
  if (!isFinite(currentHp) || !isFinite(maxHp)) { char.currentHp = maxHp; return }

  char.currentHp = Math.min(maxHp, currentHp + healAmount)

  // 治疗飘字
  battle.effects.push({
    type: 'dmg_number', x: char.x + (Math.random() - 0.5) * 20, y: char.y - 30,
    value: '+' + healAmount, color: '#44ff88', size: 14, duration: 800, vy: -40
  })
}

// ========== 击杀处理 ==========

function killMonster(battle, monster) {
  monster.isDead = true
  monster.deathTimer = 450
  battle.stats.kills++

  // 经验分配（确保 expReward 有效）
  const aliveChars = (battle.party || []).filter(c => !c.isDead)
  const expReward = isFinite(monster.expReward) ? monster.expReward : 10
  const expPerChar = Math.floor(expReward / Math.max(1, aliveChars.length))
  for (const c of aliveChars) {
    if (expPerChar <= 0) continue  // 跳过无效经验
    const bonus = c.expBonus || 0
    const expGain = Math.floor(expPerChar * (1 + bonus))
    c.totalExp = (c.totalExp || 0) + expGain
    checkLevelUp(battle, c, expGain)
  }

  // 金币掉落
  let goldAmt = 0
  const tpl = getMonsterTemplate(monster.type)
  if (tpl && tpl.goldDrop) {
    const [minG, maxG] = tpl.goldDrop
    goldAmt = minG + Math.floor(Math.random() * (maxG - minG + 1))
    const rarityMult = monster.rarity === 'lord' ? 2.5 : monster.rarity === 'elite' ? 1.5 : 1
    goldAmt = Math.round(goldAmt * rarityMult)

    // 卡牌金币加成
    if (battle.goldBonus) goldAmt += battle.goldBonus || 0
    battle.gold += goldAmt
    if (goldAmt > 0) {
      Effects.addFloatingText(battle, monster.x, monster.y - 20, `+${goldAmt}\uD83D\uDCB0`, '#f1c40f', 1.5)
    }
  }

  // 装备掉落
  if (!monster.hasDropped && monster.dropQuality) {
    monster.hasDropped = true
    const item = getRandomEquipment(monster.dropQuality, monster.level || 1)
    if (item) {
      item.x = monster.x + (Math.random() - 0.5) * 40
      item.y = monster.y + (Math.random() - 0.5) * 20
      // ★ 确保掉落物在战斗区域内
      const dropArea = battle._getBattleArea()
      item.x = Math.max(dropArea.left + 10, Math.min(dropArea.right - 10, item.x))
      item.y = Math.max(dropArea.top + 10, Math.min(dropArea.bottom - 10, item.y))
      item.spawnTime = Date.now()
      item.remaining = 8000
      item.collected = false
      item.collectAnim = 0
      item.blink = false
      item.pulseSpeed = item.quality === 'legendary' ? 600 : item.quality === 'epic' ? 800 : 1000
      item.glowIntensity = item.quality === 'legendary' ? 2.0 : item.quality === 'epic' ? 1.5 : item.quality === 'rare' ? 1.0 : 0.5
      battle.droppedItems.push(item)
      battle.stats.dropsCollected++
    }
  }

  // 死亡特效
  const color = monster.rarity === 'lord' ? '#ff2222'
    : monster.rarity === 'elite' ? '#ff8c00'
    : '#ff4444'
  Effects.spawnDeathEffect(battle, monster.x, monster.y, color)
}

// ========== 升级检测 ==========

function checkLevelUp(battle, char, expGain) {
  if (!char) return
  while (true) {
    const nextExp = EXP_TABLE[(char.level || 1) + 1]
    const prevExp = EXP_TABLE[char.level || 1]
    if (!nextExp || (char.totalExp || 0) < nextExp) break

    char.level++
    char.maxHp += 15 + Math.floor(char.level * 2)
    char.atk += 2 + Math.floor(char.level * 0.3)
    char.def += 1 + Math.floor(char.level * 0.2)
    char.currentHp = char.maxHp

    char.levelUpFlash = 800
    Effects.addFloatingText(battle, char.x, char.y - 220, `\u2191\u2191 ${char.name} 升级! Lv${char.level}`, '#ffd700', 2.5)

    // 解锁新技能
    unlockSkillsForLevel(battle, char)
  }
}

function unlockSkillsForLevel(battle, char) {
  if (!char.skills) return
  for (const sk of char.skills) {
    if (sk.unlockLevel && char.level >= sk.unlockLevel && !sk.unlocked) {
      sk.unlocked = true
      Effects.addFloatingText(battle, char.x, char.y - 180, `\u2728 解锁: ${sk.name}!`, '#a78bfa', 2.0)
    }
  }
}

// ========== 有效属性计算 ==========

function getEffectiveAtk(char) {
  let baseAtk = char.atk || 0
  if (!isFinite(baseAtk)) baseAtk = 1
  if (char.buffs && char.buffs.length > 0) {
    for (const b of char.buffs) {
      const mult = b.atkMult || 0
      baseAtk = Math.floor(baseAtk * (1 + mult))
    }
  }
  return isFinite(baseAtk) ? baseAtk : 1
}

function getEffectiveMatk(char) {
  let baseMatk = char.matk || 0
  if (!isFinite(baseMatk)) baseMatk = 0
  if (char.buffs && char.buffs.length > 0) {
    for (const b of char.buffs) {
      const mult = b.matkMult || 0
      baseMatk = Math.floor(baseMatk * (1 + mult))
    }
  }
  return isFinite(baseMatk) ? baseMatk : 0
}

// ========== Buff技能系统 ==========

/** 施放Buff技能（战吼/狂暴/二档） */
function applyBuffSkill(battle, char, skill) {
  const cfg = BUFF_CONFIG[skill.id]
  if (!cfg) { console.warn(`[Tower] \u26A0\uFE0F 未知buff技能: ${skill.id}`); return }

  const targets = skill.id === 'war_cry'
    ? (battle.party || []).filter(c => !c.isDead)
    : [char]

  const buffData = {
    id: skill.id, name: cfg.name, icon: cfg.icon,
    color: cfg.color, auraColor: cfg.auraColor,
    startTime: Date.now(), duration: cfg.duration,
    atkMult: cfg.atkMult || 0, spdMult: cfg.spdMult || 0,
  }

  for (const t of targets) {
    if (!t.buffs) t.buffs = []
    t.buffs = t.buffs.filter(b => b.id !== skill.id)
    t.buffs.push({ ...buffData })

    if (buffData.spdMult > 0) {
      // ★ 角色用 moveSpeed，怪物用 moveSpeed — 统一处理
      const baseSpd = t._baseSpd || t._baseMoveSpeed || t.moveSpeed || t.spd || 180
      if (t._baseMoveSpeed === undefined) t._baseMoveSpeed = baseSpd
      t.moveSpeed = Math.floor(baseSpd * (1 + buffData.spdMult))
      t.spd = t.moveSpeed  // 保持兼容性
    }
  }

  // 视觉特效
  const targetText = skill.id === 'war_cry'
    ? `\uD83D\uDCE3 ${cfg.name}! 全体+${Math.round(cfg.atkMult * 100)}%攻`
    : `\uD83D\uDD25 ${cfg.name}! +${Math.round(cfg.atkMult * 100)}%攻`
  Effects.addFloatingText(battle, char.x, char.y - 50, targetText, cfg.color, 2.0)

  // 冲击波
  battle.effects.push({
    type: 'buff_shockwave', x: char.x, y: char.y,
    color: cfg.auraColor, radius: skill.id === 'war_cry' ? 180 : 90,
    timer: 0, duration: 500, isAoe: skill.id === 'war_cry',
  })

  // 光环
  for (const t of targets) {
    battle.effects.push({
      type: 'buff_aura', charId: t.id || t.name,
      x: t.x, y: t.y, color: cfg.auraColor, buffId: skill.id,
      timer: 0, duration: cfg.duration, life: cfg.duration / 1000, maxLife: cfg.duration / 1000,
    })
  }

  // 屏幕震动
  Effects.applyScreenShake(battle, skill.id === 'berserk' ? 5 : 3, skill.id === 'berserk' ? 4 : 2)
}

// ========== Buff/Debuff 更新循环 ==========

function updateBuffs(battle, dtMs) {
  // 角色Buff衰减
  for (const c of (battle.party || [])) {
    if (!c.buffs || c.buffs.length === 0) continue
    const now = Date.now()
    const expiredIds = []
    let needRestoreSpd = false

    for (const b of c.buffs) {
      const elapsed = now - b.startTime
      if (elapsed >= b.duration) {
        expiredIds.push(b.id)
        if (b.spdMult > 0) needRestoreSpd = true
      }
    }

    if (expiredIds.length > 0) {
      c.buffs = c.buffs.filter(b => !expiredIds.includes(b.id))
      if (needRestoreSpd && (c._baseSpd || c._baseMoveSpeed)) {
        let totalSpdMult = 0
        for (const b of c.buffs) totalSpdMult += b.spdMult
        const baseSpd = c._baseMoveSpeed || c._baseSpd || c.moveSpeed || 180
        c.moveSpeed = Math.floor(baseSpd * (1 + totalSpdMult))
        c.spd = c.moveSpeed  // 保持兼容性
      }
      if (expiredIds.length > 0) {
        const names = expiredIds.map(id => (BUFF_CONFIG[id] || {}).name || id).join(', ')
        Effects.addFloatingText(battle, c.x, c.y - 40, `\u23F1 ${names} 消散`, '#888888', 1.2)
      }
    }

    for (const b of c.buffs) { b.x = c.x; b.y = c.y }
  }

  // 怪物Debuff（灼烧DoT）
  for (const m of (battle.monsters || [])) {
    if (m.isDead || !m.buffs || m.buffs.length === 0) continue
    if (!isFinite(m.x) || !isFinite(m.y) || !isFinite(m.hp)) continue

    const now = Date.now()
    const expiredIds = []

    for (const b of m.buffs) {
      const elapsed = now - (b.startTime || now)

      // 灼烧DoT结算
      if (b.id === BURN_DEBUFF.id && elapsed < BURN_DEBUFF.duration) {
        if (m.isDead || m.hp <= 0) break
        const sinceLastTick = now - (b.lastTickTime || b.startTime)
        if (sinceLastTick >= (b.tickInterval || BURN_DEBUFF.tickInterval)) {
          const dotDmg = b.tickDamage || 0
          applyDamage(battle, m, 'monster', dotDmg)
          const burningCount = (battle.monsters || []).filter(mm =>
            !mm.isDead && (mm.buffs || []).some(bb => bb.id === BURN_DEBUFF.id)
          ).length
          if (burningCount <= 5 || m._showBurnTick) {
            Effects.pushEffectSafe(battle, {
              type: 'dmg_number', x: m.x + (Math.random() - 0.5) * 15, y: m.y - 20,
              value: dotDmg, color: '#ff6600', scale: 0.9, life: 0.8, vy: -50,
            })
          }
          b.lastTickTime = now
          b.totalDotDmg = (b.totalDotDmg || 0) + dotDmg
        }
      }

      if (elapsed >= b.duration) {
        expiredIds.push(b.id)
        if (b.id === BURN_DEBUFF.id && (b.totalDotDmg || 0) > 0) {
          Effects.addFloatingText(battle, m.x, m.y - 30, `\uD83D\uDD25灼烧结束 -${b.totalDotDmg}`, '#ff6600', 1.2)
        }
      }
    }

    if (expiredIds.length > 0) {
      m.buffs = m.buffs.filter(b => !expiredIds.includes(b.id))
    }

    for (const b of m.buffs) { b.x = m.x; b.y = m.y }
  }
}

// ========== 怪物模板 ==========

function getMonsterTemplate(type) {
  const templates = {
    slime:   { name: '史莱姆猫', hp: 360, atk: 12, def: 25, spd: 15, atkInterval: 3200, isRanged: true,
                 atkRange: 220, moveSpeed: 40, goldDrop: [3, 8], skills: [
                   { name: '黏液喷射', power: 1.2, type: 'magic', effect: 'freeze', freezeChance: 0.25, freezeDuration: 2000, mpCost: 8 },
                   { name: '黏液包裹', power: 1.4, type: 'magic', effect: 'freeze', freezeChance: 0.40, freezeDuration: 3000, mpCost: 15 }
               ]},
    goblin:  { name: '暗影鼠', hp: 200, atk: 20, def: 14, spd: 35, atkInterval: 1200, isRanged: false,
                 atkRange: 75, moveSpeed: 85, goldDrop: [5, 12], skills: [
                   { name: '暗影咬', power: 1.4, type: 'attack', hitCount: 3, mpCost: 6 },
                   { name: '暗影突袭', type: 'buff', stealthDuration: 5000, mpCost: 18 }
               ]},
    orc:     { name: '猫人', hp: 500, atk: 22, def: 20, spd: 7, atkInterval: 1800, isRanged: false,
                 atkRange: 72, moveSpeed: 45, goldDrop: [10, 20], skills: [
                   { name: '禁止喧哗', type: 'debuff', dmgReduction: 0.30, range: 300, duration: 5000 },
                   { name: '幻化', type: 'transform', hpThreshold: 0.35 }
               ]},
    wolf:    { name: '闪电猫', hp: 200, atk: 29, def: 8, spd: 54, atkInterval: 500, isRanged: false,
                 atkRange: 78, moveSpeed: 95, goldDrop: [6, 14] },
    undead:  { name: '吵闹猫', hp: 300, atk: 18, def: 22, spd: 9, atkInterval: 1600, isRanged: false,
                 atkRange: 75, moveSpeed: 50, goldDrop: [8, 18] },
    demon:   { name: '坏猫', hp: 560, atk: 28, def: 26, spd: 8, atkInterval: 2000, isRanged: false,
                 atkRange: 76, moveSpeed: 38, goldDrop: [15, 30] },
    dragon:  { name: '斯莱姆猫王', hp: 900, atk: 35, def: 36, spd: 14, atkInterval: 2500, isRanged: false,
                 atkRange: 90, moveSpeed: 28, goldDrop: [50, 100] }
  }
  return templates[type] || templates.slime
}

/**
 * 冰晶投射物沿途碰撞检测
 * 冰晶是穿透型投射物，飞行过程中对路径上的怪物造成伤害
 */
function updateIceShardCollision(battle, p) {
  if (!p || p.hit) return
  const iceRadius = 14
  for (const m of (battle.monsters || [])) {
    if (m.isDead) continue
    // 避免重复命中（用 _iceHitSet 记录）
    if (!p._iceHitSet) p._iceHitSet = new Set()
    if (p._iceHitSet.has(m)) continue
    const dx = m.x - p.x, dy = m.y - p.y
    if (dx * dx + dy * dy < (iceRadius + (m.radius || 16)) ** 2) {
      applyDamage(battle, m, 'char', p.damage || 10)
      p._iceHitSet.add(m)
    }
  }
}

module.exports = {
  calcDamage,
  applyDamage,
  applyLifesteal,
  killMonster,
  checkLevelUp,
  getEffectiveAtk,
  getEffectiveMatk,
  applyBuffSkill,
  updateBuffs,
  getMonsterTemplate,
  updateIceShardCollision,
}
