// 验证：李小宝雷击术(_thunderStrike)落雷致怪物血量归零后，
// 必须正确置 monster.alive=false（不再"血空了却判定为假存活"）。
//
// 直接用真实的 field-battle-system mixin，仅 mock 其依赖的最小子集。
import { pathToFileURL } from 'url'
import path from 'path'
import fs from 'fs'

const ROOT = process.cwd()
const modPath = path.join(ROOT, 'scripts', 'systems', 'field-battle-system.js')
const mod = await import(pathToFileURL(modPath).href)
const { installFieldBattleSystem } = mod

// ---- 最小场景类，套用真实战斗 mixin ----
class DummyScene {
  constructor() {
    this.dpr = 1
    this.cameraX = 0
    this.cameraY = 0
    this.game = {}
    this.battleSystem = { active: true, damageTexts: [], battleTarget: null }
    this.mapMonsters = []
  }
  // 真实 _damageMonster 已随 mixin 安装；仅需 override 伤害计算/飘字（避免依赖人物数值体系）
  _calcSkillDamageToMonster(/* m, skill, hero, isCrit */) {
    return this._nextDamage
  }
}
installFieldBattleSystem(DummyScene)

const inst = new DummyScene()
// ★ 安装在实例上：实例方法优先于 prototype，不会被 mixin 的后写版本覆盖
inst._calcSkillDamageToMonster = function (/* m, skill, hero, isCrit */) {
  return this._nextDamage
}

function makeMonster(hp) {
  return {
    id: 'm1', name: '史莱姆猫', enemyId: 'slime_cat',
    hp, maxHp: 50, alive: true, x: 0, y: 0,
    statusEffects: [], skillCDs: {}
  }
}

function runThunder(dmg) {
  const m = makeMonster(10) // 当前血 10
  inst.mapMonsters = [m]
  inst.battleSystem.battleTarget = m
  inst._nextDamage = dmg
  const p = {
    skill: { aoe: { electrify: {} } },
    hero: { crit: 0, name: '李小宝' },
    x: 0, y: 0, radius: 999, _fx: null
  }
  inst._thunderStrike(p)
  return m
}

// 1) 致命落雷：伤害远超血量 → 必须死亡(alive=false)
const lethal = runThunder(9999)
const okLethal = lethal.hp === 0 && lethal.alive === false

// 2) 非致命落雷：伤害不足 → 仍存活(alive=true, hp 正确扣减)
const survive = runThunder(5)
const okSurvive = survive.hp === 5 && survive.alive === true

console.log(`致命落雷: hp=${lethal.hp}, alive=${lethal.alive} -> ${okLethal ? 'OK(已正确判定死亡)' : 'FAIL(仍假存活!)'}`)
console.log(`非致命落雷: hp=${survive.hp}, alive=${survive.alive} -> ${okSurvive ? 'OK(正确保留存活)' : 'FAIL'}`)

const ok = okLethal && okSurvive
console.log(ok
  ? '\n✅ 修复生效：雷击术血量归零时怪物被正确判定死亡，不再卡"假存活"'
  : '\n❌ 雷击术死亡判定仍有问题')
process.exit(ok ? 0 : 1)
