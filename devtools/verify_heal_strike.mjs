// verify_heal_strike.mjs
// 真实验证「艾米治愈冲击」：
//  ① 霸体 + 必定暴击伤害 + 自疗（直接调用 _doHealStrikeImpact）
//  ② 第07帧才向前突进 + 结算沿途敌人（受控英雄 _playerAttackMonster 延迟 + _maybeStartHealStrikeDash 触发）
//  ③ AI 队友(艾米)同样第07帧才突进（_maybeStartAllyHealStrikeDash）
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

const healStrikeSkill = { id: 'heal_strike', type: 'attack_heal', power: 1.2, healPercent: 0.3, dashDistance: 300, mpCost: 12, lungeDist: 300 }

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

console.log('\n=== B. 受控英雄：施法即延迟（不立即突进），第07帧才触发 ===')
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

  // ★ 逐帧推进：前6帧(0.9s内)英雄原地、怪物不掉血；第07帧(>=0.9s)才突进+结算
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
  ok(triggeredAt >= 6, '突进在第07帧附近触发（帧索引≥6，即 elapsed≥0.9s）', triggeredAt)
  ok(monster.hp === 655, '第07帧起手结算：前方敌人受伤害（1000-345=655）', monster.hp)
  ok(sys.playerX > 50, '英雄向前突进（playerX 由 0 增大，dpr=1 突进≈300）', sys.playerX)
  ok(mainHero.hp === 603, '释放者自疗生效（500+103=603）', mainHero.hp)
  ok(pa._healStrikeStarted === true, '突进只触发一次（_healStrikeStarted 防重复）')
}

console.log('\n=== C. AI 队友(艾米)：同样第07帧才突进 + 结算 ===')
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

  // 前6帧：不应移动、不应结算
  for (let i = 0; i < 8; i++) sys._maybeStartAllyHealStrikeDash(bh2, 0.1)
  ok(m2.hp === 1000, '第07帧前：AI 队友不结算（怪物满血）', m2.hp)
  ok(sys._heroWorldPos[1].x === 0, '第07帧前：AI 队友原地（未突进）', sys._heroWorldPos[1].x)

  // 继续推进越过第07帧
  for (let i = 0; i < 3; i++) sys._maybeStartAllyHealStrikeDash(bh2, 0.1)
  ok(m2.hp === 655, '第07帧起手结算：前方敌人受伤害（1000-345=655）', m2.hp)
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

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
