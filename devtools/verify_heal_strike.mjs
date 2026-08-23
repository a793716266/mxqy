// verify_heal_strike.mjs
// 真实验证「艾米治愈冲击」：
//  ① 霸体 + 必定暴击伤害 + 自疗（直接调用 _doHealStrikeImpact）
//  ② 第05帧才向前突进 + 结算沿途敌人（受控英雄 _playerAttackMonster 延迟 + _maybeStartHealStrikeDash 触发）
//  ③ AI 队友(艾米)同样第05帧才突进（_maybeStartAllyHealStrikeDash）
//  ④ Bug1 回归：怪物带多 debuff 被灼烧致死不再崩溃卡死
// 通过真实安装 field-battle-system + 真实方法调用验证（不是只查源码）。
import { installFieldBattleSystem } from '../scripts/systems/field-battle-system.js'
import { readFileSync } from 'fs'

let passed = 0, failed = 0
const ok = (cond, msg, got) => {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.log(`  ✗ ${msg}${got !== undefined ? '  (got: ' + JSON.stringify(got) + ')' : ''}`) }
}

// ---- 最小战场系统工厂 ----
function makeSys() {
  class DummyFieldScene {}
  installFieldBattleSystem(DummyFieldScene)
  const sys = new DummyFieldScene()
  sys.dpr = 1
  sys.frameDuration = 0.15
  sys.cameraX = 0
  sys.cameraY = 0
  sys.playerX = 0
  sys.playerY = 0
  sys.mapWidth = 6000
  sys.mapHeight = 4000
  sys.battleSystem = {
    damageTexts: [], _lastDamagedMonster: null, battleTarget: null,
    playerAnim: null, playerAttackCD: 0, _bufferedAttack: false, skillButtons: [],
    battleHeroes: [{ partyIndex: 0 }]
  }
  sys._heroWorldPos = [{ x: 0, y: 0 }]
  sys._onHitFeedback = () => {}
  sys._refreshCharCard = () => {}
  sys._interruptCastingForMonster = () => {}
  sys._updateCamera = () => {}
  sys._collisionEngine = { checkStaticCollision: () => false }
  sys._getHeroAtk = (h) => (h.atk || h.matk || 0)
  sys._getHeroAtkSpeedMult = () => 1
  sys._pushDamageText = () => {}
  sys._triggerMpShake = () => {}
  sys.game = { showToast: () => {} }
  return sys
}

const healStrikeSkill = { id: 'heal_strike', type: 'attack_heal', power: 1.2, healPercent: 0.3, dashDistance: 300, mpCost: 12, lungeDist: 300,
  knock: { enabled: true, distance: 120, stunChance: 1.0, stunDuration: 1.2 } }

console.log('=== A. 真实调用 _doHealStrikeImpact（必定暴击伤害 + 自疗）===')
{
  const sys = makeSys()
  const hero = { name: '艾米', maxHp: 1000, hp: 500, matk: 200, def: 10, _buffs: [] }
  const mFront = { name: '前方怪', x: 100, y: 0, def: 20, hp: 1000, maxHp: 1000, alive: true }
  const mBack = { name: '后方怪', x: -100, y: 0, def: 20, hp: 1000, maxHp: 1000, alive: true }
  sys.mapMonsters = [mFront, mBack]
  sys._doHealStrikeImpact(hero, healStrikeSkill, mFront, 0, 0, 1)
  // 伤害 = base×1.5，base = floor(200×1.2 - floor(20×0.5)) = floor(240-10)=230 → dmg=345
  ok(mFront.hp === 655, '前方敌人受必定暴击伤害（1000-345=655）', mFront.hp)
  ok(mBack.hp === 1000, '后方敌人（dir=1 身后）不命中，血量不变', mBack.hp)
  ok(hero.hp === 603, '释放者自疗 = 伤害×30%（500+103=603）', hero.hp)
  const healFloater = (sys.battleSystem.damageTexts || []).find(t => typeof t.text === 'string' && t.text.startsWith('+'))
  ok(!!healFloater, '产生绿色回血飘字（+开头）')
  ok(!!healFloater && healFloater.color === '#5cff7a', '回血飘字为绿色 #5cff7a', healFloater && healFloater.color)
}

console.log('\n=== B. 受控英雄：施法即延迟（不立即突进），第05帧才触发 ===')
{
  const sys = makeSys()
  const mainHero = { id: 'amy', name: '艾米', maxHp: 1000, hp: 500, matk: 200, def: 10, mp: 100, _buffs: [], _castToken: 0, _castSuperArmor: false, _castInterrupted: false }
  const sprite = { state: 'idle', animFrame: 0, animTimer: 0, facingLeft: false, onAnimationComplete: null, _atkSpeedMult: 1 }
  const ctrl = { hero: mainHero, sprite, getPos: () => ({ x: 0, y: 0 }) }
  sys._getCurrentControlHero = () => ctrl
  sys.mainCharacterSprite = sprite
  const monster = { name: '前方怪', x: 100, y: 0, def: 20, hp: 1000, maxHp: 1000, alive: true }
  sys.mapMonsters = [monster]

  // ★ 真实调用施法：应记录 _healStrikeDeferred，且【不】立即设置 lungeDist（证明延迟）
  sys._playerAttackMonster(monster, healStrikeSkill)
  const pa = sys.battleSystem.playerAnim
  ok(!!pa, '施法后 playerAnim 已建立')
  ok(!!pa._healStrikeDeferred, '施法即记录 _healStrikeDeferred（延迟突进参数）')
  ok(pa.lungeDist === undefined, '施法瞬间【不】立即突进（lungeDist 未设置）', pa.lungeDist)
  ok(Math.abs((pa.maxTimer || 0) - 1.2) < 1e-6, '技能动画总时长 = 8帧×0.15 = 1.2s（用于第07帧判定）', pa.maxTimer)

  // ★ 逐帧推进：前4帧(0.6s内)英雄原地、怪物不掉血；第05帧(>=0.6s)才突进+结算
  let playerXBefore = sys.playerX
  let triggeredAt = -1
  for (let i = 0; i < 14; i++) {
    const p = sys.battleSystem.playerAnim
    if (!p) break
    p.timer -= 0.1   // ★ 真实 _updateFieldBattle 每帧递减 pa.timer（测试需模拟）
    sys._maybeStartHealStrikeDash(p, 0.1)
    if (p.lungeDist && !p._lungeDone) sys._applyShieldBashLunge(p, 0.1)
    if (triggeredAt < 0 && p._healStrikeStarted) triggeredAt = i
  }
  ok(triggeredAt >= 5, '突进在第05帧附近触发（帧索引≥5，即 elapsed≥0.6s）', triggeredAt)
  ok(monster.hp === 655, '第05帧起手结算：前方敌人受伤害（1000-345=655）', monster.hp)
  ok(sys.playerX > 50, '英雄向前突进（playerX 由 0 增大，dpr=1 突进≈300）', sys.playerX)
  ok(mainHero.hp === 603, '释放者自疗生效（500+103=603）', mainHero.hp)
  ok(pa._healStrikeStarted === true, '突进只触发一次（_healStrikeStarted 防重复）')
}

console.log('\n=== C. AI 队友(艾米)：同样第05帧才突进 + 结算 ===')
{
  const sys = makeSys()
  const hero2 = { name: '艾米', maxHp: 1000, hp: 500, matk: 200, def: 10, _buffs: [] }
  const m2 = { name: '前方怪', x: 100, y: 0, def: 20, hp: 1000, maxHp: 1000, alive: true }
  sys.mapMonsters = [m2]
  sys._heroWorldPos = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  const bh2 = { hero: hero2, sprite: {}, partyIndex: 1, getPos: () => sys._heroWorldPos[1] }
  hero2._hsDeferred = { skill: healStrikeSkill, monster: m2, dir: 1, startX: 0, startY: 0 }
  hero2._hsElapsed = 0
  hero2._hsStarted = false

  // 前4帧：不应移动、不应结算（第05帧阈值=4×frameDur=0.6s，每调用 dt=0.1 累加）
  for (let i = 0; i < 5; i++) sys._maybeStartAllyHealStrikeDash(bh2, 0.1)
  ok(m2.hp === 1000, '第05帧前：AI 队友不结算（怪物满血）', m2.hp)
  ok(sys._heroWorldPos[1].x === 0, '第05帧前：AI 队友原地（未突进）', sys._heroWorldPos[1].x)

  // 继续推进越过第05帧（再调 3 次 = elapsed 0.6→0.8，第6次调用即触发突进+结算）
  for (let i = 0; i < 3; i++) sys._maybeStartAllyHealStrikeDash(bh2, 0.1)
  ok(m2.hp === 655, '第05帧起手结算：前方敌人受伤害（1000-345=655）', m2.hp)
  ok(sys._heroWorldPos[1].x === 300, 'AI 队友向前突进到位（0 + 300×dir）', sys._heroWorldPos[1].x)
  ok(hero2.hp === 603, 'AI 释放者自疗生效（500+103=603）', hero2.hp)
  ok(hero2._hsDeferred === null, '突进后清理 _hsDeferred（只触发一次）', hero2._hsDeferred)
}

console.log('\n=== D. Bug1 回归：多 debuff 怪物被灼烧致死不再崩溃 ===')
{
  const sys = makeSys()
  // 怪物同时带 灼烧 + 冰冻 两个状态，灼烧打死时应安全 break（旧逻辑会访问 undefined._remaining 抛错卡死）
  const m = {
    name: 'BOSS艾米', isBoss: true, x: 0, y: 0, def: 0, hp: 5, maxHp: 1000, alive: true,
    statusEffects: [
      { type: 'freeze', _remaining: 5, _active: true },
      { type: 'burn', tickDamage: 10, tickInterval: 0.1, _remaining: 5, _tickAccum: 0 }
    ],
    _frozen: false, _rooted: false
  }
  sys.mapMonsters = [m]
  // 安装真实 _updateMonsterStatusEffects 依赖的钩子
  sys._damageMonster = function (mm, dmg) { mm.hp = Math.max(0, mm.hp - dmg); return dmg }
  let threw = false
  try {
    // 模拟若干帧灼烧 tick（dt=0.2 必触发 tickInterval=0.1 的灼烧，5hp 一击致死）
    for (let i = 0; i < 5; i++) sys._updateMonsterStatusEffects(0.2)
  } catch (e) { threw = true; console.log('  异常:', e.message) }
  ok(!threw, '多 debuff 怪物被灼烧致死不抛异常（不再界面卡死）', threw)
  ok(m.alive === false, '灼烧成功致死（alive=false）', m.alive)
  ok(m.statusEffects.length === 0, '致死后状态数组已清空', m.statusEffects.length)
}

console.log('\n=== E. AI 艾米技能选择：健康队伍不再只放加血（应能用治愈冲击进攻）===')
{
  const sys = makeSys()
  sys.battleSystem.active = true
  const amy = {
    id: 'amy', name: '艾米', role: 'healer',
    maxHp: 1000, hp: 1000, maxMp: 100, mp: 100, matk: 200, def: 10,
    _buffs: [{ type: 'def_up', _active: true, _remaining: 10 }],  // ★ 防御增益已生效 → 跳过④
    _aiSkillsCD: {}, _aiSkillLock: 0, _castToken: 0, _castSuperArmor: false, _castInterrupted: false
  }
  amy.skills = [
    { id: 'holy_shield', name: '神圣护盾', type: 'buff', effect: 'def_up', mpCost: 8, cooldown: 3 },
    { id: 'heal_strike', name: '治愈冲击', type: 'attack_heal', power: 1.2, healPercent: 0.3, dashDistance: 300, mpCost: 12, lungeDist: 300 },
    { id: 'heal_light', name: '光明治愈', type: 'heal', mpCost: 10, cooldown: 2 }
  ]
  const ally = { name: '臻宝', hp: 1000, maxHp: 1000 }
  sys.battleSystem.battleHeroes = [{ hero: amy }, { hero: ally }]
  const monster = { name: '前方怪', x: 100, y: 0, def: 20, hp: 1000, maxHp: 1000, alive: true }
  sys.mapMonsters = [monster]
  const sprite = { state: 'idle', animFrame: 0, animTimer: 0, facingLeft: false }
  const bh = { hero: amy, sprite, partyIndex: 1, getPos: () => ({ x: 0, y: 0 }) }

  const cast = sys._allyTryCastSkill(bh, monster, 1)
  ok(cast === true, 'AI 艾米成功释放技能')
  ok(amy._hsDeferred && amy._hsDeferred.skill.id === 'heal_strike',
    '健康队伍(全队满血+防御已开)：艾米选治愈冲击(进攻)，而非只放加血/护盾', amy._hsDeferred && amy._hsDeferred.skill && amy._hsDeferred.skill.id)
}

console.log('\n=== F. 源码断言：AI 远程判定与玩家对齐 + 预判奶阈值降到 55% ===')
{
  const fbs = readFileSync(new URL('../scripts/systems/field-battle-system.js', import.meta.url), 'utf8')
  ok(!/const isRanged = \(hero\.role === 'mage' \|\| hero\.role === 'healer'\)/.test(fbs),
    'AI 普攻不再把 healer 单独判为远程（已与玩家手动路径对齐）')
  ok(/const isRanged = \(hero\.role === 'mage' \|\| hero\.role === 'archer' \|\| hero\.role === 'assassin'\)/.test(fbs),
    'AI 普攻远程判定 = mage/archer/assassin（与玩家一致）')
  ok(/lowestRatio < 0\.55/.test(fbs), 'AI 预判奶阈值已降到 55%（不再 72% 导致只刷治疗）')
  ok(!/lowestRatio < 0\.72/.test(fbs), '旧 72% 阈值已移除')
}

console.log('\n=== G. 治愈冲击：突进撞击把怪物击飞 + 必中眩晕（数据驱动 skill.knock）===')
{
  const sys = makeSys()
  const hero = { name: '艾米', maxHp: 1000, hp: 500, matk: 200, def: 10, _buffs: [] }
  const m = { name: '前方怪', x: 100, y: 0, def: 20, hp: 1000, maxHp: 1000, alive: true, _stunned: 0 }
  sys.mapMonsters = [m]
  // ★ 真实调用起手撞击（dir=1 向右）：前方敌人应被击飞（x 增大）且被眩晕（_stunned>0）
  sys._doHealStrikeImpact(hero, healStrikeSkill, m, 0, 0, 1)
  ok(m.x === 100 + 120, '前方敌人被击飞（x 由 100 推到 220，distance=120）', m.x)
  ok(m._stunned > 0, '前方敌人被眩晕（_stunned>0，默认必中）', m._stunned)
  ok(Math.abs(m._stunned - 1.2) < 1e-6, '眩晕时长 = stunDuration=1.2s', m._stunned)
}

console.log('\n=== H. 源码断言：治愈冲击 _doHealStrikeImpact 已施加击飞+眩晕（不再"不眩晕"）===')
{
  const fbs = readFileSync(new URL('../scripts/systems/field-battle-system.js', import.meta.url), 'utf8')
  ok(/m\._stunned = Math\.max\(m\._stunned \|\| 0, STUN_DUR\)/.test(fbs),
    '_doHealStrikeImpact 内对前方敌人施加眩晕(_stunned = STUN_DUR)')
  ok(/const STUN_CHANCE = \(kcfg\.stunChance != null\)/.test(fbs),
    '眩晕几率取自 skill.knock.stunChance（数据驱动，与盾击一致）')
  ok(/skill\.knock \|\| \{\}/.test(fbs), '_doHealStrikeImpact 读取 skill.knock 配置')
  const hs = readFileSync(new URL('../scripts/data/heroes.js', import.meta.url), 'utf8')
  ok(/heal_strike[\s\S]*?knock: \{ enabled: true, distance: 120, stunChance: 1\.0, stunDuration: 1\.2 \}/.test(hs),
    'heroes.js heal_strike 配置了 knock(击飞120+必中眩晕1.2s)')
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
process.exit(failed > 0 ? 1 : 0)
