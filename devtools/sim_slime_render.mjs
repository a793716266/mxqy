// 决定性模拟：复刻 field-scene 的 animFrame 推进 + 拼 key 逻辑，
// 用真实 ASSETS 注册表核对史莱姆猫在全部状态下是否会算出缺失的 key。
import { createRequire } from 'module'
import path from 'path'
const require = createRequire(import.meta.url)
const ROOT = path.resolve('.')
const { ASSETS } = await import('file://' + path.join(ROOT, 'scripts/core/asset-manager.js'))

// 真实 config
const slime = require(path.join(ROOT, 'scripts/entities/monsters/slime-cat.js'))
const anim = slime.animationConfig

// 复刻 _buildFrameKey (field-scene 5329) + prefixMap
const prefixMap = { slime_cat: 'SLIME_CAT' }
function buildKey(enemyId, animType, frameIdx, framePad) {
  const prefix = prefixMap[enemyId] || 'SLIME_CAT'
  return `${prefix}_${animType.toUpperCase()}_${String(frameIdx).padStart(framePad, '0')}`
}

// 复刻 _renderCatMonster 的 animType 决策 + frameIdx 计算 (5062-5106)
function renderKey(m) {
  let animType, animConf
  if (m.isCastingSkill && anim.skill) {
    animType = 'skill'; animConf = anim.skill
    const probe = animConf.frameList ? animConf.frameList[0] : animConf.start
    if (!ASSETS[buildKey(m.enemyId, 'skill', probe, animConf.framePad)]) {
      animType = anim.attack ? 'attack' : 'idle'
      animConf = anim[animType]
    }
  } else if (m.isAttacking && anim.attack) {
    animType = 'attack'; animConf = anim.attack
  } else {
    animType = m.isMoving ? 'walk' : 'idle'
    animConf = anim[animType]
    if (!animConf) return { missing: true, key: `(无${animType}配置)` }
  }
  let frameIdx
  if (animConf.frameList) {
    const i = m.animFrame % animConf.frameList.length
    frameIdx = animConf.frameList[i]
  } else {
    const total = animConf.end - animConf.start + 1
    frameIdx = (m.animFrame % total) + animConf.start
  }
  const key = buildKey(m.enemyId, animType, frameIdx, animConf.framePad)
  return { key, animType, frameIdx, exists: !!ASSETS[key] }
}

// 复刻 _updateMonsters 的 animFrame 推进 (1242-1375, 仅 slime_cat 相关分支)
function step(m, dt) {
  // shadow bite: slime_cat 不进此分支
  if (m.isCastingSkill && m.skillAnimTimer > 0) {
    const sk = anim.skill
    if (sk.frameList) {
      const total = sk.frameList.length
      const progress = 1 - (m.skillAnimTimer / (total * (sk.frameDuration || 100)))
      m.animFrame = Math.min(Math.floor(progress * total), total - 1)
    } else {
      const total = sk.end - sk.start + 1
      const progress = 1 - (m.skillAnimTimer / (total * (sk.frameDuration || 100)))
      m.animFrame = Math.min(Math.floor(progress * total), total - 1)
    }
  } else if (m.isAttacking && m.attackAnimTimer > 0) {
    m.attackAnimTimer -= dt * 1000
    const ac = anim.attack
    if (ac.frameList) {
      const total = ac.frameList.length
      const prog = 1 - (m.attackAnimTimer / 500)
      m.animFrame = Math.min(Math.floor(prog * total), total - 1)
    } else {
      const total = ac.end - ac.start + 1
      const prog = 1 - (m.attackAnimTimer / 500)
      m.animFrame = Math.min(Math.floor(prog * total), total - 1)
    }
    if (m.attackAnimTimer <= 0) { m.isAttacking = false; m.attackAnimTimer = 0; m.animFrame = 0 }
  } else {
    m.animTimer += dt
    let walkFrames = 12, idleFrames = 7
    const fd = m.isMoving ? 0.08 : 0.15
    if (m.animTimer >= fd) {
      m.animTimer = 0
      m.animFrame = m.isMoving ? (m.animFrame + 1) % walkFrames : (m.animFrame + 1) % idleFrames
    }
  }
}

// === 模拟：覆盖 idle / walk / attack / skill 各种状态与切换 ===
const dt = 1 / 60
let checks = 0, miss = 0
const missKeys = new Set()
const base = { enemyId: 'slime_cat' }

function run(label, init, frames, mutate) {
  const m = { animTimer: 0, animFrame: 0, isMoving: false, isCastingSkill: false, skillAnimTimer: 0, isAttacking: false, attackAnimTimer: 0, ...init }
  for (let f = 0; f < frames; f++) {
    if (mutate) mutate(m, f)
    step(m, dt)
    const r = renderKey(m)
    checks++
    if (!r.exists) { miss++; missKeys.add(`${label}:${r.key}`); if (missKeys.size <= 30) {} }
  }
}

// idle
run('idle', {}, 200)
// walk
run('walk', { isMoving: true }, 200)
// attack 全程
run('attack', { isAttacking: true, attackAnimTimer: 500 }, 60, (m) => { if (m.attackAnimTimer <= 0 && m.isAttacking) m.isAttacking = false })
// skill 全程
run('skill', { isCastingSkill: true, skillAnimTimer: 11 * 100 }, 120, (m) => { m.skillAnimTimer -= dt * 1000; if (m.skillAnimTimer <= 0) { m.isCastingSkill = false; m.skillAnimTimer = 0 } })
// 切换序列：idle->walk->attack->skill->idle
run('seq', {}, 800, (m, f) => {
  if (f < 150) { m.isMoving = false }
  else if (f < 300) { m.isMoving = true }
  else if (f < 380) { m.isMoving = false; m.isAttacking = true; m.attackAnimTimer = 500 }
  else if (f < 500) { m.isAttacking = false; m.isCastingSkill = true; m.skillAnimTimer = 11 * 100 }
  else { m.isCastingSkill = false; m.isMoving = (f % 40 < 20) }
})

console.log(`总校验帧: ${checks}`)
console.log(`缺失 key 帧数: ${miss}`)
if (missKeys.size) {
  console.log('--- 缺失 key 样本 ---')
  console.log([...missKeys].slice(0, 30).join('\n'))
} else {
  console.log('>> 逻辑层: 史莱姆猫在全部状态/切换下算出的 key 100% 命中注册表。emoji 只可能来自运行期资源未加载(分包/主包未打进包)。')
}
