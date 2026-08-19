// 验证史莱姆猫 jump_attack 动画分相修复：
//   复刻 _updateMonsters 中 _isJumpAttack 块的帧推进 + _jumpLandingTimer 清理，
//   模拟 预警→飞跃→落地 三阶段，确认 animFrame 正常推进且 isCastingSkill 最终复位（不再卡死）。
import * as path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const slime = (await import(path.join(ROOT, 'scripts/entities/monsters/slime-cat.js'))).default
const slimeSkill = slime.animationConfig.skill
const _sfTotal = (slimeSkill.frameList || []).length

// 复刻 field-scene _updateMonsters 的 _isJumpAttack 分相逻辑
function step(monster, dt) {
  const _isJumpAttack = monster.isCastingSkill && monster._castingSkill &&
    monster._castingSkill.type === 'jump_attack'
  if (_isJumpAttack) {
    const sk = slimeSkill
    const _skillFrames = sk.frameList ||
      (sk.end != null ? Array.from({ length: sk.end - sk.start + 1 }, (_, i) => sk.start + i) : [])
    const _sfTotal = _skillFrames.length
    let idx = 0
    if (_sfTotal > 0) {
      if (monster._jumpLandingTimer != null && monster._jumpLandingTimer > 0) {
        idx = _sfTotal - 1
      } else if (monster._jumpState) {
        const p = Math.min(1, monster._jumpState.progress)
        if (p >= 1) idx = _sfTotal - 1
        else idx = Math.min(_sfTotal - 1, 4 + Math.floor(p * 3))
      } else if (monster._jumpWarn) {
        const dur = monster._jumpWarnDur || 1
        const t = monster._jumpWarnTimer != null ? monster._jumpWarnTimer : 0
        const prog = 1 - Math.max(0, Math.min(dur, t)) / dur
        idx = Math.min(_sfTotal - 1, Math.floor(prog * 4))
      } else idx = 0
    }
    monster.animFrame = idx
    if (monster._jumpLandingTimer != null && monster._jumpLandingTimer > 0) {
      monster._jumpLandingTimer -= dt
      if (monster._jumpLandingTimer <= 0) {
        monster._jumpLandingTimer = 0
        monster.isCastingSkill = false
        monster.skillAnimTimer = 0
      }
    }
  }
  return monster.animFrame
}

// 将 frameList 索引映射回实际帧号，便于阅读
const toFrame = (idx) => (idx >= 0 && idx < _sfTotal ? slimeSkill.frameList[idx] : `OOB(${idx})`)

function runPhase(label, initMonster, drive, frames, dt) {
  const m = initMonster
  const seq = []
  for (let i = 0; i < frames; i++) {
    drive(m, dt, i)
    const af = step(m, dt)
    seq.push(af)
  }
  const unique = [...new Set(seq)]
  console.log(`[${label}] frames=${frames} animFrame序列=${seq.map(toFrame).join(',')}`)
  console.log(`         唯一帧数=${unique.length}/${_sfTotal}  isCastingSkill=${m.isCastingSkill}`)
  return { seq, unique, m }
}

console.log(`史莱姆猫 skill 帧表(${_sfTotal}帧): ${slimeSkill.frameList.join(',')}\n`)

// 阶段1：预警（_jumpWarn 倒计时，field-battle-system 每帧递减）
const warnDur = 1.5
const m1 = {
  isCastingSkill: true, _castingSkill: { type: 'jump_attack' },
  _jumpWarn: true, _jumpWarnTimer: warnDur, _jumpWarnDur: warnDur,
  _jumpState: null, _jumpLandingTimer: 0, animFrame: 0
}
const p1 = runPhase('预警', m1, (m, dt) => { m._jumpWarnTimer -= dt }, 16, 0.1)

// 阶段2：飞跃（_jumpState.progress 0→1）
const m2 = {
  isCastingSkill: true, _castingSkill: { type: 'jump_attack' },
  _jumpWarn: false, _jumpWarnTimer: 0, _jumpWarnDur: warnDur,
  _jumpState: { progress: 0 }, _jumpLandingTimer: 0, animFrame: 0
}
const p2 = runPhase('飞跃', m2, (m, dt) => { if (m._jumpState) m._jumpState.progress += 0.1 }, 11, 0.05)

// 阶段3：落地收尾（_jumpLandingTimer=0.15 递减）
const m3 = {
  isCastingSkill: true, _castingSkill: { type: 'jump_attack' },
  _jumpWarn: false, _jumpWarnTimer: 0, _jumpWarnDur: warnDur,
  _jumpState: null, _jumpLandingTimer: 0.15, animFrame: 0
}
const p3 = runPhase('落地收尾', m3, () => {}, 4, 0.05)

// 判定
const ok =
  p1.unique.length >= 3 && p2.unique.length >= 3 && p3.m.isCastingSkill === false
// 真正的"卡死"判定：预警+飞跃整段 animFrame 是否恒定不动
const allFrames = [...p1.seq, ...p2.seq]
const distinct = new Set(allFrames).size
const stuck = distinct <= 1
console.log(`\n结论: 预警阶段帧推进=${p1.unique.length >= 3 ? 'OK' : 'FAIL'}, ` +
  `飞跃阶段帧推进=${p2.unique.length >= 3 ? 'OK' : 'FAIL'}, ` +
  `落地后isCastingSkill复位=${p3.m.isCastingSkill === false ? 'OK' : 'FAIL'}`)
console.log(stuck ? '❌ 跳攻全程帧恒定 → 卡死' : `✅ 史莱姆猫跳跃攻击正常播放并复位（全程出现 ${distinct} 个不同帧）`)
process.exit(ok && !stuck ? 0 : 1)
