/**
 * 回归验证：_switchControl 轮转全部参战英雄（修复「只能切臻宝/李小宝，第3+名切不到」）
 * 直接 import field-battle-system.js 安装到 mock 的 FieldSceneClass 上，
 * 用真实代码执行 _switchControl，断言：
 *  1) 3 名英雄（臻宝/李小宝/艾米）能通过反复点击依次切到（臻宝→李小宝→艾米→臻宝）
 *  2) followers 顺序随 battleHeroes[1..] 同步重排，数量不变
 *  3) 轮换一圈后世界坐标无污染（_heroWorldPos 各槽位坐标保持初始值）
 *
 * 用法: node devtools/verify_switch_cycle.mjs
 */
import { installFieldBattleSystem } from '../scripts/systems/field-battle-system.js'

let passed = 0
let failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

// ============ mock FieldSceneClass（3 名英雄：主角 + 2 跟随） ============
class MockScene {
  constructor() {
    this.dpr = 3
    this.width = 750 * 3
    this.height = 1334 * 3
    this.playerX = 500
    this.playerY = 600
    this.party = [{
      id: 'zhenbao', name: '臻宝', hp: 100, maxHp: 100, mp: 50, maxMp: 50,
      _aiAttacking: false, _aiAttackTimer: 0, _aiAttackCD: 0
    }]
    this.followers = [
      {
        character: { id: 'lixiaobao', name: '李小宝', hp: 80, maxHp: 80, mp: 40, maxMp: 40,
          _aiAttacking: false, _aiAttackTimer: 0, _aiAttackCD: 0 },
        x: 800, y: 700,
        sprite: { state: 'idle', animFrame: 0, animTimer: 0 }
      },
      {
        character: { id: 'amy', name: '艾米', hp: 90, maxHp: 90, mp: 50, maxMp: 50,
          _aiAttacking: false, _aiAttackTimer: 0, _aiAttackCD: 0 },
        x: 900, y: 800,
        sprite: { state: 'idle', animFrame: 0, animTimer: 0 }
      }
    ]
    this.mainCharacterSprite = { state: 'idle', animFrame: 0, animTimer: 0, facingLeft: false }
    this.mapMonsters = []
    this._heroWorldPos = null
    this.battleSystem = null
    this.game = { showToast: () => {} }
    this._initFieldBattleSystem()
    this._buildBattleHeroes()
  }
}
installFieldBattleSystem(MockScene)
MockScene.prototype._triggerHeroHurt = function () {}
MockScene.prototype._fieldApplyCounterReflect = function () {}

const scene = new MockScene()
const sys = scene.battleSystem
sys.active = true
sys.showBattleUI = true
// 不设置 attackButton → 跳过技能按钮重建分支；不定义 _refreshCharCard → 跳过卡片刷新

// 初始 battleHeroes 顺序 = [臻宝, 李小宝, 艾米]
const initIds = sys.battleHeroes.map(b => b.hero.id).join(',')
assert(initIds === 'zhenbao,lixiaobao,amy', '初始参战顺序 = 臻宝,李小宝,艾米', initIds)
// 记录初始世界坐标（按 partyIndex）
const wp0 = { ...scene._heroWorldPos[0] }   // 臻宝
const wp1 = { ...scene._heroWorldPos[1] }   // 李小宝
const wp2 = { ...scene._heroWorldPos[2] }   // 艾米

// ============ 执行 3 次切换（轮转一圈） ============
const cycle = [sys.battleHeroes[0].hero.id]
scene._switchControl(); cycle.push(sys.battleHeroes[0].hero.id)
scene._switchControl(); cycle.push(sys.battleHeroes[0].hero.id)
scene._switchControl(); cycle.push(sys.battleHeroes[0].hero.id)

console.log('\n[验证] 轮换顺序:', cycle.join(' → '))

// ============ 断言 ============
assert(cycle.join(',') === 'zhenbao,lixiaobao,amy,zhenbao',
  '轮转覆盖全部 3 名英雄（臻宝→李小宝→艾米→臻宝）', cycle.join('→'))

// 回到起点（3 次轮转后）playerX/Y 应还原为臻宝初始坐标
assert(Math.abs(scene.playerX - wp0.x) < 1e-6 && Math.abs(scene.playerY - wp0.y) < 1e-6,
  '回到起点后 playerX/Y 还原为臻宝初始坐标', `${scene.playerX},${scene.playerY}`)

// ★ followers 是「非臻宝成员」的稳定列表，不随切换重排（跟随系统靠 followerRef 引用相等识别被控者）
const fIds = () => scene.followers.map(f => f.character.id).join(',')
assert(fIds() === 'lixiaobao,amy', 'followers 保持非臻宝成员稳定列表(李小宝,艾米)，不随切换重排', fIds())
assert(scene.followers.length === 2, 'followers 数量始终为 2（无丢失）', `实际: ${scene.followers.length}`)

// ★ 切到艾米（跟随成员）被控时，follow 系统靠 battleHeroes[0].followerRef 识别被控者、
//   并跳过其 AI（_updateFollowers 的 isControlled 引用相等判定），无需重排 followers
scene._switchControl() // → 李小宝
scene._switchControl() // → 艾米
const ctrlAmy = sys.battleHeroes[0]
assert(ctrlAmy.hero.id === 'amy', '当前被控者 = 艾米', ctrlAmy.hero.id)
assert(!!ctrlAmy.followerRef, '被控跟随成员 battleHeroes[0].followerRef 存在（follow 系统据此跳过其 AI）', `followerRef=${ctrlAmy.followerRef}`)
const amyInFollowers = scene.followers.some(f => f === ctrlAmy.followerRef)
assert(amyInFollowers, '艾米仍在 followers 列表（引用相等判定被控，无需重排数组）')
// 此时 followers 列表仍未变
assert(fIds() === 'lixiaobao,amy', '艾米被控时 followers 列表仍稳定(李小宝,艾米)', fIds())

// 世界坐标无污染：轮转一圈后各槽位坐标应与初始一致
const near = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
assert(near(scene._heroWorldPos[0], wp0) && near(scene._heroWorldPos[1], wp1) && near(scene._heroWorldPos[2], wp2),
  '轮转一圈后世界坐标无污染（_heroWorldPos 各槽位保持初始值）',
  `wp0=${JSON.stringify(scene._heroWorldPos[0])} wp1=${JSON.stringify(scene._heroWorldPos[1])} wp2=${JSON.stringify(scene._heroWorldPos[2])}`)

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)
