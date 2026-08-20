// 验证：普攻「输入缓冲」重击(_bufferedAttackPending)现在会重新校验距离，
//   - 锁定怪物但角色已远离 → 缓冲重击被拦截，不造成伤害，并解除 battleTarget 锁定
//   - 锁定怪物且仍在近战范围内 → 正常发起攻击(进入 pendingDamages)
import { pathToFileURL } from 'url'
import path from 'path'

const ROOT = process.cwd()
const mod = await import(pathToFileURL(path.join(ROOT, 'scripts', 'systems', 'field-battle-system.js')).href)
const { installFieldBattleSystem } = mod

class DummyScene {
  constructor() {
    this.dpr = 1
    this.cameraX = 0; this.cameraY = 0
    this.game = {}
    this.mapMonsters = []
    this.battleSystem = {
      active: true, _hitStop: 0, playerAttackCD: 0, playerAnim: null,
      skillButtons: [], pendingDamages: [], battleTarget: null,
      _bufferedAttackPending: null, damageTexts: [], battleHeroes: [],
      _shake: 0, hitRings: [], _chargeGlow: null
    }
  }
}
installFieldBattleSystem(DummyScene)

// ★ mixin 会覆盖 prototype 上的同名方法，故所有 stub 必须设在「实例」上（实例方法优先）
function makeInst(hero) {
  const inst = new DummyScene()
  inst._hero = hero
  inst._getCurrentControlHero = () => ({ hero: inst._hero, sprite: { state: 'idle' }, getPos: () => inst._hero.getPos() })
  inst._endFieldBattle = () => {}
  inst._updateFieldDamageTexts = () => {}
  inst._updateAllyAI = () => {}
  inst._updateMonsterStatusEffects = () => {}
  inst._updateHeroBuffs = () => {}
  inst._updateMpShake = () => {}
  inst._updateBuffShockwaves = () => {}
  inst._updateHeroSkillProcesses = () => {}
  inst._updateHeroProjectiles = () => {}
  inst._updatePendingProjectiles = () => {}
  inst._updateMonsterJumps = () => {}
  inst._updateMonsterAttack = () => {}
  inst._updateBladeStorm = () => {}
  inst._getHeroAtk = () => 50
  inst._getHeroAtkSpeedMult = () => 1
  // 给一个存活参战英雄，避免 _updateBattleSystem 走「全灭」提前 return
  inst.battleSystem.battleHeroes = [{ hero }]
  return inst
}

function makeHero(x, y) { return { name: '臻宝', crit: 0.05, def: 0, maxHp: 100, hp: 100, getPos: () => ({ x, y }) } }
function makeMonster(x, y, hp = 50) {
  return { id: 'm', name: '史莱姆猫', enemyId: 'slime_cat', hp, maxHp: 50, alive: true, x, y, statusEffects: [], skillCDs: {} }
}

function tickBuffer(monster, heroX, heroY) {
  const hero = makeHero(heroX, heroY)
  const inst = makeInst(hero)
  inst.mapMonsters = [monster]
  inst.battleSystem.battleTarget = monster
  inst.battleSystem._bufferedAttackPending = monster
  const before = monster.hp
  inst._updateBattleSystem(0.016)
  return {
    dmg: before - monster.hp,
    queued: inst.battleSystem.pendingDamages.length,
    target: inst.battleSystem.battleTarget
  }
}

// 场景1：锁定怪物后角色已远离(同Y, dx=900 >> 80) → 应拦截
const far = makeMonster(100, 500)
const r1 = tickBuffer(far, 1000, 500)
const okFar = r1.dmg === 0 && r1.queued === 0 && r1.target === null

// 场景2：锁定怪物且仍在近战范围(dx=40<=80, dy=0<=40) → 应正常发起攻击
const near = makeMonster(140, 500)
const r2 = tickBuffer(near, 100, 500)
const okNear = r2.queued >= 1 && r2.target === near && r2.dmg === 0 // 命中帧未到, 本tick尚未结算伤害

console.log(`远距缓冲重击: 伤害=${r1.dmg}, 入队=${r1.queued}, 锁定=${r1.target === null ? '已解除' : '仍锁定'} -> ${okFar ? 'OK(被拦截)' : 'FAIL(仍造成伤害!)'}`)
console.log(`近距缓冲重击: 伤害=${r2.dmg}, 入队=${r2.queued}, 锁定=${r2.target === near ? '怪物' : 'null'} -> ${okNear ? 'OK(正常发起)' : 'FAIL'}`)

const ok = okFar && okNear
console.log(ok
  ? '\n✅ 修复生效：锁定怪物后远距离疯狂按普攻不再无视距离造成伤害；近战范围内仍正常连击'
  : '\n❌ 缓冲重击距离校验仍有问题')
process.exit(ok ? 0 : 1)
