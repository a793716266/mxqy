// verify_heal_strike.mjs
// 真实验证「艾米治愈冲击」= 霸体 + 前方突进(与盾击同机制) + 必定暴击伤害 + 自疗。
// 通过真实安装 field-battle-system 并调用 _doHealStrikeImpact，断言数值正确（不是只查源码）。
import { installFieldBattleSystem } from '../scripts/systems/field-battle-system.js'
import { readFileSync } from 'fs'

let passed = 0, failed = 0
const ok = (cond, msg, got) => {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.log(`  ✗ ${msg}${got !== undefined ? '  (got: ' + JSON.stringify(got) + ')' : ''}`) }
}

// ---- A. 真实调用 _doHealStrikeImpact（必定暴击伤害 + 自疗 + 前方判定）----
// 最小战场系统：安装真实方法，mock 掉仅做副作用的钩子
class DummyFieldScene {}
installFieldBattleSystem(DummyFieldScene)
const sys = new DummyFieldScene()
sys.dpr = 1
sys.cameraX = 0
sys.cameraY = 0
sys.battleSystem = { damageTexts: [], _lastDamagedMonster: null, battleTarget: null }
sys._onHitFeedback = () => {}
sys._refreshCharCard = () => {}
sys._interruptCastingForMonster = () => {}
sys._collisionEngine = { checkStaticCollision: () => false }   // 不撞墙：击退正常生效

const hero = { name: '艾米', maxHp: 1000, hp: 500, matk: 200, def: 10, _buffs: [] }
const mFront = { name: '前方怪', x: 100, y: 0, def: 20, hp: 1000, maxHp: 1000, alive: true }
const mBack = { name: '后方怪', x: -100, y: 0, def: 20, hp: 1000, maxHp: 1000, alive: true }  // 身后：不应被命中
sys.mapMonsters = [mFront, mBack]

const skill = { id: 'heal_strike', type: 'attack_heal', power: 1.2, healPercent: 0.3, dashDistance: 300 }

console.log('=== A. 真实调用 _doHealStrikeImpact（艾米 matk=200, 怪物 def=20）===')
sys._doHealStrikeImpact(hero, skill, mFront, 0, 0, 1)

// 伤害 = base×1.5，base = floor(200×1.2 - floor(20×0.5)) = floor(240-10)=230 → dmg=345
ok(mFront.hp === 655, '前方敌人受必定暴击伤害（1000-345=655）', mFront.hp)
ok(mBack.hp === 1000, '后方敌人（dir=1 身后）不命中，血量不变', mBack.hp)
// 自疗 = floor(345 × 0.3) = 103 → 500+103 = 603
ok(hero.hp === 603, '释放者自疗 = 伤害×30%（500+103=603）', hero.hp)
const healFloater = (sys.battleSystem.damageTexts || []).find(t => typeof t.text === 'string' && t.text.startsWith('+'))
ok(!!healFloater, '产生绿色回血飘字（+开头）')
ok(!!healFloater && healFloater.color === '#5cff7a', '回血飘字为绿色 #5cff7a', healFloater && healFloater.color)

// ---- B. 接入点源码断言（确保「突进/霸体」真正接进实时战斗，而非只改了配置）----
const heroes = readFileSync(new URL('../scripts/data/heroes.js', import.meta.url), 'utf8')
const fb = readFileSync(new URL('../scripts/systems/field-battle-system.js', import.meta.url), 'utf8')
console.log('\n=== B. 配置 + 实时战斗接入点 ===')
// 配置：霸体 + 突进
ok(/id: 'heal_strike'[\s\S]*?superArmor: true/.test(heroes), 'heal_strike 配置 superArmor:true（霸体技能）')
ok(/id: 'heal_strike'[\s\S]*?lungeDist: 300/.test(heroes), 'heal_strike 配置 lungeDist:300（向前突进）')
// 突进条件扩展到 attack_heal
ok(/skill\.lungeDist && \(skill\.id === 'shield_bash' \|\| skill\.type === 'attack_heal'\)/.test(fb),
  '玩家突进(lunge)条件含 attack_heal（与盾击共用机制）')
ok(/pa2\.healStrike = \(skill\.type === 'attack_heal'\)/.test(fb),
  '玩家突进起手标记 healStrike（区分治愈冲击/盾击）')
// 延迟队列排除 attack_heal
ok(/skill\.id === 'shield_bash' \|\| skill\.type === 'attack_heal'\)\)? \{/.test(fb),
  '延迟伤害队列排除 attack_heal（起手撞击一次性结算，与盾击一致）')
// 起手撞击分流
ok(/if \(pa\.healStrike\) \{\s*this\._doHealStrikeImpact/.test(fb),
  '_applyShieldBashLunge 第一帧按 healStrike 分流到 _doHealStrikeImpact')
// AI 分支
ok(/skill\.type === 'attack_heal'\) \{\s*[^}]*this\._doHealStrikeImpact/.test(fb),
  'AI 队友路径：attack_heal → 调用 _doHealStrikeImpact（不进延迟队列）')
// 函数本身含必定暴击 + 自疗
ok(/const dmg = Math\.floor\(base \* 1\.5\)/.test(fb), '_doHealStrikeImpact 必定暴击（base×1.5）')
ok(/const healAmt = Math\.floor\(totalDamage \* healPct\)/.test(fb), '_doHealStrikeImpact 按伤害比例自疗')

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
