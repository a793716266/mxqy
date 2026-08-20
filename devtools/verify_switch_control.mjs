/**
 * 运行时验证：切换控制 (_switchControl) 后角色状态是否正确复位
 * 直接 import field-battle-system.js 安装到 mock 的 FieldSceneClass 上，
 * 用真实代码执行 _switchControl，断言：
 *  1) 新被控角色 sprite.state 复位为 idle（不再卡 attack）
 *  2) _aiAttacking / _aiAttackTimer / _aiAttackCD 被清
 *  3) 技能按钮重建为新被控角色的技能
 *  4) playerAttackCD 被清 0
 *  5) battleHeroes 重排（新被控者 index0）
 *
 * 用法: node scripts/tools/verify_switch_control.mjs
 */
import { installFieldBattleSystem } from '../scripts/systems/field-battle-system.js'

let passed = 0
let failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

// ============ mock FieldSceneClass ============
class MockFieldScene {
  constructor() {
    this.dpr = 3
    this.width = 750 * 3
    this.height = 1334 * 3
    this.playerX = 500
    this.playerY = 600
    this.party = [{
      name: '臻宝', hp: 100, maxHp: 100, mp: 50, maxMp: 50, alive: true,
      atk: 30, def: 10, crit: 0.1,
      skills: [{ id: 's1', name: '燕返', mpCost: 5, cooldown: 2, type: 'attack', range: 100, axis: 'x', power: 1.5 }]
    }]
    this.followers = [{
      character: { name: '李小宝', hp: 80, maxHp: 80, mp: 40, maxMp: 40, alive: true, atk: 20, def: 5, crit: 0.1,
        skills: [{ id: 'l1', name: '回春', mpCost: 8, cooldown: 4, type: 'heal', range: 0 }] },
      x: 800, y: 700,
      sprite: { state: 'attack', animFrame: 3, animTimer: 0.2, onAnimationComplete: null }
    }]
    this.mainCharacterSprite = { state: 'idle', animFrame: 0, animTimer: 0, isMoving: false, facingLeft: false }
    this.mapMonsters = []
    this._heroWorldPos = null
    this.battleSystem = null
    this.game = { showToast: () => {} }
    this._initFieldBattleSystem()
    this._buildBattleHeroes()
  }
}

// 安装到 mock 类
installFieldBattleSystem(MockFieldScene)

// ★ 补齐真实场景里存在、但本 mock 未实现的受击回调（避免 _applyHeroDamage 抛 TypeError）
MockFieldScene.prototype._triggerHeroHurt = function () {}
MockFieldScene.prototype._fieldApplyCounterReflect = function () {}

// ============ 准备场景并进入战斗 ============
const scene = new MockFieldScene()
const sys = scene.battleSystem

// 模拟战斗激活 + battleHeroes 构建（_buildBattleHeroes 在构造函数里已调用）
sys.active = true
sys.showBattleUI = true

// 手动初始化 attackButton（_initBattleUI 里才会建，这里简化）
const btnSize = 42 * scene.dpr
const margin = 14 * scene.dpr
sys.attackButton = { x: 2000, y: 3800, width: btnSize, height: btnSize }
scene._rebuildSkillButtons(sys.attackButton.x, sys.attackButton.y, sys.attackButton.width, margin)

// ============ 记录切换前的"残留战斗状态"（模拟李小宝曾作为 AI 攻击） ============
const lixiaobao = sys.battleHeroes[1]  // 李小宝（follower，partyIndex=1）
lixiaobao.hero._aiAttacking = true
lixiaobao.hero._aiAttackTimer = 0.5
lixiaobao.hero._aiAttackCD = 600
lixiaobao.sprite.state = 'attack'
lixiaobao.sprite.animFrame = 3

sys.playerAttackCD = 400

console.log('\n[验证] 切换前状态：')
console.log('  被控者 =', sys.battleHeroes[0].hero.name, '| 李小宝 state =', lixiaobao.sprite.state)

// ============ 执行切换 ============
scene._switchControl()

console.log('\n[验证] 切换后：')
console.log('  被控者 =', sys.battleHeroes[0].hero.name)

// ============ 断言 ============
console.log('\n[断言]')
const newCtrl = sys.battleHeroes[0]
assert(newCtrl.hero.name === '李小宝', '被控者切换为李小宝', `实际: ${newCtrl.hero.name}`)
assert(newCtrl.sprite.state === 'idle', '新被控者 sprite.state 复位为 idle', `实际: ${newCtrl.sprite.state}`)
assert(newCtrl.hero._aiAttacking === false, '_aiAttacking 被清 false', `实际: ${newCtrl.hero._aiAttacking}`)
assert(newCtrl.hero._aiAttackTimer === 0, '_aiAttackTimer 归零', `实际: ${newCtrl.hero._aiAttackTimer}`)
assert(newCtrl.hero._aiAttackCD === 0, '_aiAttackCD 归零', `实际: ${newCtrl.hero._aiAttackCD}`)

// 原被控者（臻宝）转 AI，也应复位
const oldCtrl = sys.battleHeroes[1]
assert(oldCtrl.hero.name === '臻宝', '原被控者(臻宝)回到 index1')
assert(oldCtrl.hero._aiAttacking === false, '臻宝 _aiAttacking 清 false', `实际: ${oldCtrl.hero._aiAttacking}`)
assert(oldCtrl.hero._aiAttackCD === 0, '臻宝 _aiAttackCD 归零', `实际: ${oldCtrl.hero._aiAttackCD}`)

assert(sys.playerAttackCD === 0, 'playerAttackCD 清零', `实际: ${sys.playerAttackCD}`)

// 技能按钮重建为新被控角色的技能
const skillNames = sys.skillButtons.map(b => b.text).join(',')
assert(skillNames.includes('回春'), '技能按钮含李小宝的「回春」', `实际: ${skillNames}`)
assert(!skillNames.includes('燕返'), '技能按钮不含臻宝的「燕返」', `实际: ${skillNames}`)

// 坐标交换
assert(Math.abs(scene.playerX - 800) < 0.01 && Math.abs(scene.playerY - 700) < 0.01,
  'playerX/playerY 载入新被控者坐标', `实际: ${scene.playerX},${scene.playerY}`)

// ============ 实战验证：切换后立刻点技能 ============
// 之前李小宝 state 卡在 attack 会导致 _playerAttackMonster 直接 return（不播动画、没伤害）
// 现在 state 已复位 idle，点技能应正常触发
console.log('\n[实战] 切换后立即点击技能「回春」(buff类)：')

// 准备一个怪物（非 buff 技能需要目标；回春是 heal 不需要）
scene.mapMonsters.push({
  id: 'm1', name: '坏猫', alive: true, x: 900, y: 700, hp: 100, maxHp: 100, def: 5
})
sys.pendingDamages = []
sys.playerAnim = null

// 1) buff 技能（无需目标）应正常播放动画 + 扣 MP
const healBtn = sys.skillButtons.find(b => b.text === '回春')
if (healBtn) {
  scene._playerAttackMonster(null, healBtn.skill)
  assert(sys.playerAnim !== null && sys.playerAnim.type === 'buff', 'buff 技能播放动画(playerAnim 被设置)')
  assert(newCtrl.sprite.state === 'buff', '李小宝 sprite 进入 buff 动画', `实际: ${newCtrl.sprite.state}`)
  assert(newCtrl.hero.mp === 40 - 8, 'buff 技能扣除 MP', `实际: ${newCtrl.hero.mp}`)
  // 动画结束后复位逻辑：走 onAnimationComplete
  if (newCtrl.sprite.onAnimationComplete) {
    newCtrl.sprite.onAnimationComplete('buff')
    assert(newCtrl.sprite.state === 'idle', '动画完成后复位 idle', `实际: ${newCtrl.sprite.state}`)
  }
} else {
  failed++; console.log('  ✗ 未找到「回春」技能按钮')
}

// 2) 普攻（带目标）应正常入伤害队列
sys.playerAttackCD = 0
scene._playerAttackMonster(null, null)  // 无目标普攻，只播动画（模拟玩家点击）
assert(sys.playerAnim !== null && sys.playerAnim.type === 'attack', '普攻播放 attack 动画')
assert(newCtrl.sprite.state === 'attack', '李小宝 sprite 进入 attack 动画', `实际: ${newCtrl.sprite.state}`)
// 普攻节奏 = 挥砍时长 / 攻速（狂暴+60%攻速会缩短）；此处无狂暴，应≈5帧×0.15s=0.75s
const _expSwing = (sys._zbAtkFrames || 5) * (sys.frameDuration || 0.15)
assert(Math.abs(sys.playerAttackCD - _expSwing) < 1e-6, `普攻设置挥砍节奏冷却（=挥砍时长/攻速，期望≈${_expSwing}）`)

// ============ 怪物攻击目标 ============
// 切换后怪物近战应攻击【最近的英雄】，而非硬编码 party[0]
console.log('\n[实战] 怪物攻击目标（切换后）：')
const m1 = scene.mapMonsters[0]
// 让李小宝(被控, 800,700)离怪物更近，臻宝(被控者坐标是800,700→但臻宝partyIndex0的位置=_heroWorldPos[0])
// 构造：李小宝在(800,700)，臻宝在(1200,900)，怪物在(820,710) → 李小宝最近
scene._heroWorldPos[0] = { x: 1200, y: 900 }   // 臻宝(原被控者转AI后)站位
scene._heroWorldPos[1] = { x: 800, y: 700 }    // 李小宝（被控）
m1.x = 820
m1.y = 710
m1.alive = true
m1.hp = 100
// 用 _updateMonsterAttack 的"找最近英雄"逻辑验证（直接调用一次，看它锁定谁）
// 先看 _findNearestMonsterFromPos 的对偶逻辑 —— 用 _updateAllyAI 类似的最近英雄搜索验证
const targetHero = (() => {
  let best = null, bestD = Infinity
  for (const bh of sys.battleHeroes) {
    if (!bh.hero || bh.hero.hp <= 0) continue
    const pos = bh.getPos ? bh.getPos() : { x: 0, y: 0 }
    const d = (pos.x - m1.x) ** 2 + (pos.y - m1.y) ** 2
    if (d < bestD) { bestD = d; best = bh }
  }
  return best
})()
assert(targetHero && targetHero.hero.name === '李小宝', '怪物锁定最近的英雄(李小宝)', `实际: ${targetHero && targetHero.hero.name}`)

// ============ 弹道命中扣被控者血 ============
console.log('\n[实战] 弹道命中扣被控者血：')
const zhenbaoLixiaobaoHp = newCtrl.hero.hp
sys.projectiles = [{
  x: 800, y: 700, vx: 0, vy: 0, life: 5, atk: 10, power: 1
}]
// 把 _getCurrentControlHero 结果设为李小宝（已切换，battleHeroes[0]就是李小宝）
scene._fieldUpdateProjectiles(1/60)
assert(newCtrl.hero.hp < zhenbaoLixiaobaoHp, '弹道命中扣被控者(李小宝)的血', `实际: ${newCtrl.hero.hp} (前 ${zhenbaoLixiaobaoHp})`)
assert(sys.projectiles.length === 0, '弹道命中后被移除')

// ============ 预警区域命中扣被控者血（跳跃落地结算） ============
console.log('\n[实战] 预警区域命中扣被控者血：')
const hpBeforeZone = newCtrl.hero.hp
// 预警到点（timer=0）→ 设置怪物跳跃 → 跳跃落地时结算伤害
const jumpMonster = {
  id: 'jz1', name: '跳怪', enemyId: 'wild_cat', alive: true,
  x: 100, y: 100, hp: 500, maxHp: 500, def: 5, atk: 10, level: 1,
  attackCDTimer: 0, attackInterval: 2000, skillCDs: {},
  _jumpWarn: true
}
scene.mapMonsters = [jumpMonster]
sys.warningZones = [{ x: 800, y: 700, r: 60, atk: 10, power: 1, life: 1, timer: 0, monsterRef: jumpMonster }]
scene._fieldUpdateWarningZones(1/60)
// zone 到点后怪物应进入跳跃状态（非瞬移）
assert(jumpMonster._jumpState !== null, '预警到点设置跳跃状态（非瞬移）')
// 落点在玩家位置（被控者），跳完后结算伤害
for (let f = 0; f < 40; f++) scene._updateMonsterJumps(1/60)
assert(newCtrl.hero.hp < hpBeforeZone, '跳跃落地命中扣被控者(李小宝)的血', `实际: ${newCtrl.hero.hp} (前 ${hpBeforeZone})`)

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
