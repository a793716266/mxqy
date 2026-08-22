// verify_amy_skill_anim.mjs
// 锁定艾米三个技能 → 正确动画态映射（用户明确需求）：
//   增益(holy_shield, buff)   → aimi/buff   (AIMI_BUFF)
//   团队回血(heal_light, heal) → aimi/support (AIMI_SUPPORT)
//   伤害技能(heal_strike, attack_heal) → aimi/skill (AIMI_SKILL)
import { HEROES } from '../scripts/data/heroes.js'
import { readFileSync } from 'fs'

let passed = 0, failed = 0
const ok = (cond, msg, got) => {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.log(`  ✗ ${msg}${got !== undefined ? '  (got: ' + got + ')' : ''}`) }
}

const amy = HEROES.find(h => h.id === 'amy')
console.log('=== A. 艾米技能数据定义（真实 heroes.js）===')
ok(!!amy, '艾米存在于 HEROES')
const byId = id => (amy && amy.skills || []).find(s => s.id === id)
ok(byId('holy_shield') && byId('holy_shield').type === 'buff', 'holy_shield(type:buff) → 增益动画(buff)', byId('holy_shield') && byId('holy_shield').type)
ok(byId('heal_light') && byId('heal_light').type === 'heal', 'heal_light(type:heal) → 团队回血动画(support)', byId('heal_light') && byId('heal_light').type)
ok(byId('heal_strike') && byId('heal_strike').type === 'attack_heal', 'heal_strike(type:attack_heal) → 伤害技能动画(skill)', byId('heal_strike') && byId('heal_strike').type)

console.log('\n=== B. 施法动画路由（battle-combat.js 源码断言）===')
const combat = readFileSync(new URL('../scripts/scenes/battle/battle-combat.js', import.meta.url), 'utf8')
// 队长施法选择：buff → 'buff'
ok(/skill\.type\s*===\s*'buff'\)\s*animType\s*=\s*'buff'/.test(combat),
  '_captainCastSkill: buff 技能 → animType="buff" (→ AIMI_BUFF)')
// 队长施法选择：heal/heal_self → 'support'
ok(/skill\.type\s*===\s*'heal'\s*\|\|\s*skill\.type\s*===\s*'heal_self'\)\s*animType\s*=\s*'support'/.test(combat),
  '_captainCastSkill: heal/heal_self → animType="support" (→ AIMI_SUPPORT)')
// 物理技能：attack_heal → 'skill'（本次修复核心）
ok(/skill\.type\s*===\s*'attack_heal'\)\s*\?\s*'skill'\s*:\s*'attack'/.test(combat),
  '_captainPhysicalSkill: attack_heal → state="skill" (→ AIMI_SKILL)，其余物理技能仍 "attack"')

console.log('\n=== C. 资源 key 注册（asset-manager 源码断言 AIMI 三套帧）===')
const assets = readFileSync(new URL('../scripts/core/asset-manager.js', import.meta.url), 'utf8')
// buildFrames 运行时拼出 AIMI_BUFF_01~08 / AIMI_SKILL_01~08 / AIMI_SUPPORT_01~08，源码里没有这些字面量，
// 因此断言 buildFrames('AIMI', ...) 调用块内含 action: 'buff'/'skill'/'support'。
const aimiBlock = (assets.match(/buildFrames\('AIMI'[\s\S]*?\]\)/) || [''])[0]
ok(/action:\s*'buff'/.test(aimiBlock),
  'AIMI buildFrames 含 action:"buff" → 运行时拼出 AIMI_BUFF_01~08（增益用 aimi/buff）')
ok(/action:\s*'skill'/.test(aimiBlock),
  'AIMI buildFrames 含 action:"skill" → 运行时拼出 AIMI_SKILL_01~08（伤害技能用 aimi/skill）')
ok(/action:\s*'support'/.test(aimiBlock),
  'AIMI buildFrames 含 action:"support" → 运行时拼出 AIMI_SUPPORT_01~08（团队回血用 aimi/support）')

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
