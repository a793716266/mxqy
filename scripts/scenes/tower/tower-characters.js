/**
 * tower-characters.js - 角色管理系统
 *
 * 从 tower-battle.js 提取的角色相关逻辑：
 * - 角色主更新循环（死亡/复活/攻击CD/技能CD/MP回复/HP回复/AI自动施法）
 * - 法师AI风筝逻辑（状态机：idle/approach/repel/hold，含卡住检测）
 * - 角色移动（禁锢检测/目标平滑插值）
 * - 角色动画帧更新
 * - 智能目标查找
 * - 技能施放（castSkill）
 * - 辅助函数（复活、目标查找等）
 *
 * 渲染逻辑见 tower-ui.js（renderOneCharacter）
 *
 * 设计模式：所有函数接收 battle 上下文。
 */

const { HERO_SPRITES, RESPAWN_TABLE } = require('./tower-config.js')
const { applyDamage, getEffectiveAtk } = require('./tower-combat.js')
const Effects = require('./tower-effects.js')

// ========== 角色主更新循环 ==========

function updateCharacters(battle, dt) {
  // 技能菜单超时关闭
  if (battle.skillMenu.visible) {
    const elapsed = Date.now() - battle.skillMenu.openTimer
    if (elapsed > battle.skillMenu.maxDuration) battle.skillMenu.visible = false
  }

  for (let i = 0; i < battle.party.length; i++) {
    const c = battle.party[i]
    try {
    // 死亡倒计时
    if (c.isDead) {
      c.respawnTimer -= dt
      if (c.respawnTimer <= 0) respawnChar(battle, c, i)
      continue
    }

    // 攻击计时
    c.attackTimer -= dt

    // 技能CD递减
    for (const sid in c.skillCDs) { if (c.skillCDs[sid] > 0) c.skillCDs[sid] -= dt }

    // MP/HP 回复
    const safeDt = Math.min(dt, 100)
    if ((c.mpRegen || 0) > 0 && (c.currentMp || 0) < (c.maxMp || 30)) {
      const mpGain = (c.mpRegen || 0) * safeDt / 1000
      if (isFinite(mpGain)) { c.currentMp = Math.min(c.maxMp, (c.currentMp || 0) + mpGain) }
    }
    if ((c.hpRegen || 0) > 0 && (c.currentHp || 0) < (c.maxHp || 100) && !c.isDead) {
      const hpGain = (c.hpRegen || 0) * safeDt / 1000
      if (isFinite(hpGain)) { c.currentHp = Math.min(c.maxHp, (c.currentHp || 0) + hpGain) }
    }

    // ★ Buff技能系统
    // 确保角色有 _baseMoveSpeed 字段（buff系统依赖）
    if (c._baseMoveSpeed === undefined) c._baseMoveSpeed = c.moveSpeed || 180
    if (c._baseSpd === undefined) c._baseSpd = c.spd || c.moveSpeed || 180
    c.autoSkillTimer = (c.autoSkillTimer || 0) - dt
    if (c.autoSkillTimer <= 0 && !c.isDead && c.autoAttackEnabled) {
      c.autoSkillTimer = c.autoSkillInterval || 5000
      tryAutoCastSkill(battle, c)
    }

    // 状态效果衰减
    c.hurtFlash = Math.max(0, c.hurtFlash - dt)
    c.hurtTimer = Math.max(0, c.hurtTimer - dt)
    c.levelUpFlash = Math.max(0, c.levelUpFlash - dt)

    // 攻击动画计时
    if (c.attackAnimTimer > 0) {
      c.attackAnimTimer -= dt
      if (c.attackAnimTimer <= 0) { c.animState = 'idle'; c.animFrame = 0; c.castSkillId = null; c.isCasting = false }
    }

    // 动画帧更新
    updateCharAnim(c, dt)

    // 禁锢检测（必须在移动逻辑之前）
    const isRooted = c.rootedUntil && Date.now() < c.rootedUntil

    // 移动逻辑
    const isMoving = Math.abs(c.x - c.targetX) > 5 || Math.abs(c.y - c.targetY) > 5

    // ★ 实际平滑移动（向 targetX/targetY 插值）
    // 注意：法师(mage)由kitingAI直接控制x/y，跳过插值避免双重移动
    if (!isRooted && !c.isCasting && c.role !== 'mage') {
      const dx = c.targetX - c.x, dy = c.targetY - c.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 1) {
        // ★ 基础速度180px/s，远距离时加速（最少每帧走3%的距离），接近目标时减速
        const baseSpeed = (c.moveSpeed || 180) * (dt / 1000)
        const minStep = dist > 200 ? dist * 0.04 : dist * 0.12
        const step = Math.min(baseSpeed * 3, Math.max(minStep, baseSpeed))
        c.x += (dx / dist) * step
        c.y += (dy / dist) * step
      }
      // ★ 始终限制在战斗区域内
      battle._clampToBattleArea(c)
    }

    // ★ 法师由 kitingAI 控制，跳过插值移动（kitingAI 内部已做 clamp）

    if (isRooted) {
      if (Math.abs(c.x - c.targetX) > 3 || Math.abs(c.y - c.targetY) > 3) { c.targetX = c.x; c.targetY = c.y }
      if (c.animState !== 'idle') { c.animState = 'idle'; c.animFrame = 0 }
    }

    // AI自动寻敌
    // ★ 近战角色：距离目标较远时也允许更新目标（避免停顿）
    const targetDist = Math.sqrt((c.targetX - c.x)**2 + (c.targetY - c.y)**2)
    const meleeCanRepath = c.role !== 'mage' && targetDist < 15  // 接近当前目标时允许重新寻路
    // ★ 手动移动保护：仅对近战角色生效（法师不应该被手动移动打断AI）
    const manualMoveProtection = c.role !== 'mage' && c._manualMoveTime && (Date.now() - c._manualMoveTime < 1500)
    const canRunAI = c.autoAttackEnabled && !c.isCasting &&
      (c.role === 'mage' ? true : (!isMoving || meleeCanRepath)) &&
      !battle.battleTactics.holdPosition &&
      !manualMoveProtection

    if (canRunAI) {
      const nearestEnemy = findNearestEnemy(battle, c)
      if (nearestEnemy) {
        if (c.role === 'mage') {
          runMageKitingAI(battle, c, nearestEnemy, dt, isMoving)
        } else {
          runMeleeAI(battle, c, nearestEnemy, dt, isMoving)
        }
      }
    } // end canRunAI
    } catch(charErr) {
      // 单角色异常不影响其他角色（每3秒最多报1次）
      if (!c._errLogged || Date.now() - c._errLogged > 3000) {
        console.error(`[Char] ${c.name||c.heroType||i} 更新异常:`, charErr.message || charErr)
        c._errLogged = Date.now()
      }
    }
  } // end party loop
}

// ========== 法师AI风筝 ==========

function runMageKitingAI(battle, c, enemy, dt, isMoving) {
  const eDx = enemy.obj.x - c.x, eDy = enemy.obj.y - c.y
  const eDist = Math.sqrt(eDx*eDx + eDy*eDy)

  // 安全距离参数
  const safeDist = c.atkRange * 0.78, idealDist = c.atkRange * 0.88
  const approachDist = c.atkRange * 0.98
  const deadZoneMin = c.atkRange * 0.82, deadZoneMax = c.atkRange * 0.94

  const eDirX = eDx / Math.max(eDist, 1), eDirY = eDy / Math.max(eDist, 1)

  // 状态机初始化
  if (c._mageState === undefined) c._mageState = 'idle'
  if (c._mageStateTime === undefined) c._mageStateTime = 0
  if (c._prevMageX === undefined) c._prevMageX = c.x
  if (c._prevMageY === undefined) c._prevMageY = c.y
  if (c._stuckFrames === undefined) c._stuckFrames = 0
  if (c._facingCooldown === undefined) c._facingCooldown = 0
  c._mageStateTime += dt

  // 卡住检测
  const dxSinceLastFrame = c.x - c._prevMageX, dySinceLastFrame = c.y - c._prevMageY
  const moveMagnitude = Math.sqrt(dxSinceLastFrame*dxSinceLastFrame + dySinceLastFrame*dySinceLastFrame)
  c._prevMageX = c.x; c._prevMageY = c.y
  if (moveMagnitude < 0.3 && c._mageState === 'repel') c._stuckFrames++
  else c._stuckFrames = 0
  const STUCK_THRESHOLD = 12, STATE_COOLDOWN = 250

  let nextState = c._mageState
  if (c._stuckFrames >= STUCK_THRESHOLD && c._mageState === 'repel') nextState = 'hold'
  else if (eDist < safeDist) nextState = 'repel'
  else if (eDist > approachDist) nextState = 'approach'
  else if (eDist >= deadZoneMin && eDist <= deadZoneMax) nextState = 'idle'
  else nextState = c._mageState

  if (nextState !== c._mageState && c._mageStateTime >= STATE_COOLDOWN) {
    c._mageState = nextState; c._mageStateTime = 0
    if (nextState !== 'repel') c._stuckFrames = 0
  }

  if (c._mageState === 'repel') {
    const repelStrength = Math.min((safeDist - eDist) * 1.8 + 60, 300)
    const dampFactor = Math.min(1, (safeDist - eDist) / safeDist)
    c.x -= eDirX * repelStrength * dampFactor * (dt / 1000)
    c.y -= eDirY * repelStrength * dampFactor * (dt / 1000)
    battle._clampToBattleArea(c)
    c.targetX = c.x - eDirX * idealDist * 0.3
    c.targetY = c.y - eDirY * idealDist * 0.3
    // ★ 法师移动时设行走动画
    if (c.animState !== 'walk') { c.animState = 'walk'; c.animFrame = 0 }
  } else if (c._mageState === 'approach') {
    const targetPosX = enemy.obj.x - eDirX * idealDist
    const targetPosY = enemy.obj.y - eDirY * idealDist
    const lerpRatio = 0.03 * (dt / 16.67)
    c.targetX = c.x + (targetPosX - c.x) * Math.min(lerpRatio, 0.15)
    c.targetY = c.y + (targetPosY - c.y) * Math.min(lerpRatio, 0.15)
    // ★ 法师移动时设行走动画
    if (c.animState !== 'walk') { c.animState = 'walk'; c.animFrame = 0 }
  } else {
    c.targetX = c.x; c.targetY = c.y
    // ★ 停止时若非攻击/施法则恢复 idle
    if (c.animState === 'walk') { c.animState = 'idle'; c.animFrame = 0 }
  }

  ;[c.targetX, c.targetY] = battle._clampTargetToArea(c.targetX, c.targetY)

  // ★ 法师远程自动攻击：在攻击范围内且攻击CD就绪时发起攻击
  // ★ 注意：战斗区域宽度约 375px，法师攻击范围 320px → 几乎总是够得到
  if (eDist <= c.atkRange && c.attackTimer <= 0 && !c.isCasting && !c.isAttacking) {
    console.log(`[Mage] 攻击触发! dist=${Math.round(eDist)}, range=${c.atkRange}, timer=${c.attackTimer}`)
    const Combat = require('./tower-combat.js')
    const effectiveMatk = Combat.getEffectiveMatk(c)
    const baseDmg = Combat.calcDamage(effectiveMatk, enemy.obj.def || 0, true) // 法师=魔法伤害
    // 暴击判定
    let isCrit = false
    const critChance = c.critChance || 0
    let finalDmg = Math.floor(baseDmg * (0.85 + Math.random() * 0.3))
    if (critChance > 0 && Math.random() < critChance) {
      finalDmg = Math.floor(finalDmg * 1.5)
      isCrit = true
    }
    // ★ 法师发射投射物
    battle.projectiles.push({
      x: c.x, y: c.y - 15,
      targetX: enemy.obj.x, targetY: enemy.obj.y,
      target: enemy.obj, dmg: finalDmg,
      speed: 280 + Math.random() * 60, color: c.role === 'mage' ? '#a855f7' : '#4488ff',
      size: c.role === 'mage' ? 8 : 5, trail: [],
      onHit: (proj) => {
        Combat.applyDamage(battle, proj.target, 'char', proj.dmg)
        if (c.lifesteal && c.lifesteal > 0) Combat.applyLifesteal(battle, c, proj.dmg)
      }
    })
    Effects.addFloatingText(battle, c.x, c.y - 25, isCrit ? `🔥${finalDmg}💥` : `🔥${finalDmg}`, isCrit ? '#ffff00' : '#a855f7', 1.2)
    c.attackTimer = c.atkInterval || 900
    c.isAttacking = true
    c.attackAnimTimer = 500
    // ★ 法师施法动画统一为 cast_universal（由 battle-animation 通过精灵表绘制）
    c.animState = 'cast_universal'
    c.animFrame = 0
    c._animStartTime = Date.now()
  }

  // 朝向控制（冷却+威胁加权）
  if (!c._facingLocked) {
    c._facingCooldown = Math.max(0, c._facingCooldown - dt)
    const FACING_COOLDOWN = 300
    const aliveMonsters = (battle.monsters || []).filter(m => !m.isDead)
    let leftThreat = 0, rightThreat = 0
    for (const m of aliveMonsters) {
      const mdx = m.x - c.x, mdy = m.y - c.y
      const mdist = Math.sqrt(mdx*mdx + mdy*mdy)
      if (mdist > (c.atkRange || 480) * 1.3) continue
      const threat = 1 / Math.max(mdist, 30)
      if (mdx < 0) { leftThreat += threat } else { rightThreat += threat }
    }
    const wantRight = rightThreat > leftThreat
    if (c._facingCooldown <= 0) {
      const ratio = Math.max(leftThreat, rightThreat) / Math.max(Math.min(leftThreat, rightThreat), 0.001)
      if (ratio > 1.3 || Math.abs(leftThreat - rightThreat) < 0.001) {
        c.facingRight = wantRight
        c._facingCooldown = FACING_COOLDOWN
      }
    }
  }
}

function runMeleeAI(battle, c, enemy, dt, isMoving) {
  const dx = enemy.obj.x - c.x, dy = enemy.obj.y - c.y
  const dist = Math.sqrt(dx*dx + dy*dy)
  const distSq = dx*dx + dy*dy  // ★ 平方距离用于比较（避免重复sqrt）
  
  // ★ 关键修复：比较平方距离 vs 平方阈值
  const attackThresholdSq = (c.atkRange * 0.9) * (c.atkRange * 0.9)
  const attackRangeSq = (c.atkRange * 0.9) * (c.atkRange * 0.9)

  if (distSq > attackThresholdSq) {
    // ★ 目标在攻击范围外 → 向目标移动
    const stepDist = c.moveSpeed * (dt / 1000)
    c.targetX = c.x + (dx / dist) * stepDist
    c.targetY = c.y + (dy / dist) * stepDist
    ;[c.targetX, c.targetY] = battle._clampTargetToArea(c.targetX, c.targetY)
    if (c.animState !== 'walk') { c.animState = 'walk'; c.animFrame = 0 }
  } else {
    // ★ 在攻击范围内 → 停止移动，准备攻击
    c.targetX = c.x; c.targetY = c.y
    c.x = c.x; c.y = c.y  // 确保完全停止
    // 自动攻击
    if (c.attackTimer <= 0 && !c.isCasting && !c.isAttacking) {
      charAutoAttack(battle, c, enemy.obj)
    }
    if (c.animState !== 'attack' && c.attackTimer > 0) { c.animState = 'idle'; c.animFrame = 0 }
  }
}

/** 近战/远程角色自动普通攻击 */
function charAutoAttack(battle, c, target) {
  if (!target || target.isDead) return
  const Combat = require('./tower-combat.js')
  
  // ★ 使用统一的伤害公式
  const effectiveAtk = Combat.getEffectiveAtk(c)
  const isMagic = c.role === 'mage'
  let baseDmg = Combat.calcDamage(effectiveAtk, target.def || 0, isMagic)
  
  // ★ 暴击判定
  let isCrit = false
  const critChance = c.critChance || 0
  if (critChance > 0 && Math.random() < critChance) {
    baseDmg = Math.floor(baseDmg * 1.5)
    isCrit = true
  }
  
  const finalDmg = Math.floor(baseDmg * (0.85 + Math.random() * 0.3))
  
  Combat.applyDamage(battle, target, 'char', finalDmg)
  Effects.addFloatingText(battle, c.x, c.y - 25, isCrit ? `-${finalDmg}💥` : `-${finalDmg}`, isCrit ? '#ffff00' : '#ff6b6b', 1.2)
  // ★ 修复：type 改为 'char_hit'（renderSpatialEffect 渲染此类型），并带上 hitType
  Effects.pushEffectSafe(battle, { type: 'char_hit', hitType: c.role, x: target.x, y: target.y - 18, size: 90 })
  
  // ★ 角色对怪物造成伤害时触发吸血
  if (c.lifesteal && c.lifesteal > 0) {
    Combat.applyLifesteal(battle, c, finalDmg)
  }
  
  c.attackTimer = c.atkInterval || 700
  c.isAttacking = true
  c.attackAnimTimer = 320
  c.animState = 'attack'
  c.animFrame = 0
}

function tryAutoCastSkill(battle, c) {
  if (!c.skills || c.isDead || c.isCasting || !c.autoAttackEnabled) return
  const readySkills = c.skills.filter(s =>
    s.unlocked && (!s.unlockLevel || c.level >= s.unlockLevel) &&
    (c.skillCDs[s.id] || 0) <= 0 && (c.currentMp || 0) >= (s.mpCost || 0)
  )
  if (readySkills.length === 0) return

  const skill = readySkills[Math.floor(Math.random() * readySkills.length)]
  if ((c.currentMp || 0) < (skill.mpCost || 0)) return
  c.currentMp -= skill.mpCost
  console.log(`[Tower] 🎮 AI自动释放: ${c.name} -> ${skill.name}`)
  // ★ 调用统一 castSkill（已移至 tower-combat.js）
  const Combat = require('./tower-combat.js')
  Combat.castSkill(battle, c, c.skills.indexOf(skill))
}

// ========== 角色渲染 ==========
// ========== 辅助函数 ==========

function respawnChar(battle, c, charIndex) {
  c.isDead=false; c.currentHp=c.maxHp; c.respawnTimer=0
  c.hurtTimer=0; c.hurtFlash=0; c.levelUpFlash=0
  c.animState='idle'; c.animFrame=0; c.attackAnimTimer=0
  c.isAttacking=false; c.isCasting=false; c.castSkillId=null
  // ★ 使用战斗区域而非画布尺寸计算复活位置，防止出界
  const area = battle._getBattleArea()
  const areaW = area.right - area.left
  const areaH = area.bottom - area.top
  c.x = area.left + areaW * (0.08 + charIndex * 0.12)
  c.y = area.top + areaH * 0.68
  // 确保在战斗区域内
  battle._clampToBattleArea(c)
  c.targetX=c.x; c.targetY=c.y
  const Effects = require('./tower-effects.js')
  Effects.spawnRespawnEffect(battle,c.x,c.y)
}

function updateCharAnim(c, dt) {
  const spr=HERO_SPRITES[c.heroType||'zhenbao']||HERO_SPRITES.zhenbao
  const frames=spr[c.animState]||spr.idle
  if(!frames||frames.length===0) return
  const rate=spr.frameRate[c.animState]||spr.frameRate.idle||250
  c.animTimer+=dt
  if(c.animTimer>=rate){c.animTimer=0; c.animFrame=(c.animFrame+1)%frames.length}
  // ★ 切换动画状态时重置时间戳（保持与 getCharFrameImage 一致）
  if(c._prevAnimState!==c.animState){c._prevAnimState=c.animState; c._animStartTime=Date.now()}
}

function findNearestEnemy(battle, c) {
  let best=null, bestDist=Infinity
  for(const m of (battle.monsters||[])){
    if(m.isDead)continue
    const d=(m.x-c.x)**2+(m.y-c.y)**2
    if(d<bestDist){bestDist=d;best=m}
  }
  return best?{obj:best,dist:bestDist}:null
}

function getCharFrameKey(c) {
  const spr=HERO_SPRITES[c.heroType||'cat']||HERO_SPRITES.cat
  const frames=spr[c.animState]||spr.idle
  if(!frames||!frames.length) return null
  return frames[Math.min(c.animFrame,frames.length-1)]
}

/** 圆角矩形辅助 */
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y)
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r)
  ctx.quadraticCurveTo(x+w,y+h,x,y+h-r); ctx.lineTo(x+r,y+h)
  ctx.quadraticCurveTo(x,y+h,x,y+r); ctx.closePath()
}



module.exports = {
  updateCharacters,
}
