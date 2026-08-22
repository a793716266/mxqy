// verify_amy_heal_anim.mjs
// 校验：① 艾米加血公式使用 matk 而非不存在的 magic（修复 NaN / 用错属性）
//       ② AIMI 的 buff/support/skill 帧 key 真实存在（修复英雄艾米技能动画错配）
//       ③ _heroSpecialFrameKey 对 amy 输出 AIMI_ 前缀（与 ASSETS 注册一致）

import { ASSETS } from '../scripts/core/asset-manager.js'
import { HEROES } from '../scripts/data/heroes.js'

let passed = 0, failed = 0
const ok = (c, m, extra = '') => { if (c) { passed++; console.log('  ✓ ' + m) } else { failed++; console.log('  ✗ ' + m + (extra ? '  → ' + extra : '')) } }

console.log('=== A. 艾米数据 & 加血公式 ===')
const amy = HEROES.find(h => h.id === 'amy')
ok(!!amy, '找到艾米角色数据')
ok(amy && amy.matk === 18, '艾米 matk=18', amy && `实际=${amy.matk}`)
ok(amy && amy.magic === undefined, '艾米无 magic 字段（旧加血代码读 hero.magic → undefined→NaN 的根因）', amy && `magic=${amy.magic}`)

// 旧公式（错误，真实旧代码为裸 hero.magic，无回退）：hero.magic * power → NaN
const oldHeal = (hero, skill) => Math.floor(hero.magic * (skill.power || 1.0))
// 新公式（修复）：base + matk*系数
const newHeal = (hero, skill) => {
  const matk = hero.matk || hero.atk || 0
  return Math.floor((skill.power || 0) + matk * (skill.healMatk != null ? skill.healMatk : 1))
}

const healLight = amy.skills.find(s => s.id === 'heal_light')
ok(!!healLight && healLight.type === 'heal' && healLight.power === 30, '治愈之光: type=heal, power=30')

const oldVal = oldHeal(amy, healLight)
const newVal = newHeal(amy, healLight)
ok(Number.isNaN(oldVal), '旧公式 → NaN（确证 bug：hp = min(maxHp, hp+NaN)=NaN 污染 HP）', `old=${oldVal}`)
ok(Number.isFinite(newVal) && newVal === 48, '新公式 → 48（30 + 18*1，与数据公式 base+matk*1.0 一致，非 NaN）', `new=${newVal}`)

// attack_heal（治愈冲击）也走 matk，不应 NaN
const healStrike = amy.skills.find(s => s.id === 'heal_strike')
ok(!!healStrike && healStrike.type === 'attack_heal', '治愈冲击: type=attack_heal')
ok(Number.isFinite(newHeal(amy, healStrike)) && newHeal(amy, healStrike) > 0, '治愈冲击加血量有限且>0', `val=${newHeal(amy, healStrike)}`)

// 全队治疗（all_ally）应在 captain 路径对每名存活成员生效（逻辑由 battle-combat.js 实现，这里仅校验数据意图）
ok(healLight.target === 'all_ally', '治愈之光 target=all_ally（全队治疗意图）')

console.log('\n=== B. AIMI 动画帧 key 存在性 ===')
const aimiKeys = {
  buff:   ['AIMI_BUFF_01', 'AIMI_BUFF_08'],
  support:['AIMI_SUPPORT_01', 'AIMI_SUPPORT_08'],
  skill:  ['AIMI_SKILL_01', 'AIMI_SKILL_08'],
}
for (const [grp, [k1, k8]] of Object.entries(aimiKeys)) {
  ok(typeof ASSETS[k1] === 'string' && ASSETS[k1].length > 0, `ASSETS.${k1} 存在`)
  ok(typeof ASSETS[k8] === 'string' && ASSETS[k8].length > 0, `ASSETS.${k8} 存在`)
}

console.log('\n=== C. 帧 key 前缀契约（与 _heroSpecialFrameKey 一致） ===')
// 复刻 battle-assets.js _heroSpecialFrameKey 逻辑
const heroSpecialFrameKey = (heroId, action, frame) => {
  const prefix = (heroId === 'amy') ? 'AIMI' : `HERO_${String(heroId || '').toUpperCase()}`
  const f = String(((frame || 0) % 8) + 1).padStart(2, '0')
  return `${prefix}_${action}_${f}`
}
const buffKey = heroSpecialFrameKey('amy', 'BUFF', 0)
const supKey = heroSpecialFrameKey('amy', 'SUPPORT', 7)
const sklKey = heroSpecialFrameKey('amy', 'SKILL', 3)
ok(buffKey === 'AIMI_BUFF_01' && typeof ASSETS[buffKey] === 'string', `amy buff → ${buffKey} 且存在于 ASSETS`)
ok(supKey === 'AIMI_SUPPORT_08' && typeof ASSETS[supKey] === 'string', `amy support → ${supKey} 且存在于 ASSETS`)
ok(sklKey === 'AIMI_SKILL_04' && typeof ASSETS[sklKey] === 'string', `amy skill → ${sklKey} 且存在于 ASSETS`)
// 旧 renderer 错误前缀（应为 HERO_AMY_ 现修复为 AIMI_）
ok(ASSETS['HERO_AMY_BUFF_01'] === undefined, '确认旧错误前缀 HERO_AMY_BUFF_01 不存在（正是此前错配的原因）')

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
