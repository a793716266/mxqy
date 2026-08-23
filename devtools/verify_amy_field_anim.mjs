// verify_amy_field_anim.mjs
// 真实验证「野外实时战斗」中艾米技能的动画帧映射（之前只改了回合制 battle-combat.js，
// 导致实时战斗里艾米放技能仍显示普攻帧 —— 即用户反馈"动画问题没解决"的真因）。
import { CharacterSprite } from '../scripts/core/character-sprite.js'
import { readFileSync } from 'fs'

let passed = 0, failed = 0
const ok = (cond, msg, got) => {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.log(`  ✗ ${msg}${got !== undefined ? '  (got: ' + got + ')' : ''}`) }
}

// ---- A. 真实实例化艾米精灵，验证 state → 资源 key ----
const game = { dpr: 1 }
const amySprite = new CharacterSprite(game, {}, { assetPrefix: 'AIMI', spriteType: 'aimi' })
console.log('=== A. 艾米 CharacterSprite 实时帧映射（AIMI_*）===')
const cases = [
  ['buff', 'AIMI_BUFF_01'],      // 增益 holy_shield → aimi/buff
  ['support', 'AIMI_SUPPORT_01'], // 团队回血 heal_light → aimi/support
  ['skill', 'AIMI_SKILL_01'],    // 治愈冲击 heal_strike → aimi/skill
  ['attack', 'AIMI_ATTACK_01'],  // 普攻
]
for (const [state, expect] of cases) {
  amySprite.state = state
  amySprite.animFrame = 0
  const key = amySprite.getCurrentFrameKey()
  ok(key === expect, `state='${state}' → ${expect}`, key)
}

// ---- B. 实时战斗施法路由（field-battle-system.js 源码断言）----
const fb = readFileSync(new URL('../scripts/systems/field-battle-system.js', import.meta.url), 'utf8')
console.log('\n=== B. 实时战斗施法路由（field-battle-system.js）===')
// 玩家路径：heal → support（不是 buff）
ok(/skill\.type === 'heal'\)\s*\{\s*\n\s*\/\/[^\n]*\n\s*animState = 'support'/.test(fb),
  '玩家路径：heal → animState="support"（→ AIMI_SUPPORT）')
ok(/skill\.type === 'buff'\)\s*\{\s*\n\s*animState = 'buff'/.test(fb),
  '玩家路径：buff → animState="buff"（→ AIMI_BUFF）')
// AI 路径：heal → support、attack_heal → skill
ok(/skill\.type === 'heal'\) animState = 'support'/.test(fb),
  'AI 路径：heal → animState="support"（→ AIMI_SUPPORT）')
ok(/skill\.type === 'attack_heal'\) animState = 'skill'/.test(fb),
  'AI 路径：attack_heal → animState="skill"（→ AIMI_SKILL，治愈冲击）')
ok(/skill\.type === 'buff'\) animState = 'buff'/.test(fb),
  'AI 路径：buff → animState="buff"（→ AIMI_BUFF）')

// ---- C. character-sprite.js 含 aimi actionMap ----
const cs = readFileSync(new URL('../scripts/core/character-sprite.js', import.meta.url), 'utf8')
console.log('\n=== C. character-sprite.js aimi actionMap ===')
ok(/spriteType === 'aimi'\)\s*\{[\s\S]*?support: 'SUPPORT'/.test(cs),
  "character-sprite: aimi 分支映射 support→AIMI_SUPPORT")
ok(/spriteType === 'aimi'\)\s*\{[\s\S]*?skill: 'SKILL'/.test(cs),
  "character-sprite: aimi 分支映射 skill→AIMI_SKILL")
ok(/spriteType === 'aimi'\)\s*\{[\s\S]*?buff: 'BUFF'/.test(cs),
  "character-sprite: aimi 分支映射 buff→AIMI_BUFF")

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
