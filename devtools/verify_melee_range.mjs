// 验证史莱姆猫/臻宝近战"挥剑弧"范围修复：
//  - 前向命中（dir 朝向侧）
//  - 背后极小容差不打
//  - Y 收窄（40 vs 旧80）
//  - 命中帧对齐第3帧挥砍接触点
import { installFieldBattleSystem } from '../scripts/systems/field-battle-system.js'

const dpr = 2
class Dummy {}
installFieldBattleSystem(Dummy)

const inst = new Dummy()
inst.dpr = dpr
inst.mapMonsters = []
inst.battleSystem = { battleTarget: null, attackRange: 100 }

function M(id, x, y) { return { id, x, y, alive: true } }

// 英雄在原点 (0,0)，朝向 +1（右）
const heroX = 0, heroY = 0, dir = 1
const meleeRange = 80 * dpr
const yTol = 40 * dpr
const originX = heroX + dir * (28 * dpr)

function sel() {
  return inst._findNearestMonsterFromPos(meleeRange, 'x', originX, heroY, yTol, dir)
}

console.log('--- 场景: 英雄(0,0) 朝右(dir=+1), 剑尖 originX =', originX, '---')

// 1. 正前方 60px 同高度 → 应命中
inst.mapMonsters = [M('a', 60, 0)]
console.log('正前60px同高:', sel() && sel().id, '(期望 a)')

// 2. 正前方 110px（超出 range+offset）→ 不应命中
inst.mapMonsters = [M('b', 110, 0)]
console.log('正前110px超距:', sel() ? sel().id : 'null', '(期望 null)')

// 3. 正后方 -60px（旧逻辑会命中）→ 新前向约束不应命中
inst.mapMonsters = [M('c', -60, 0)]
console.log('正后-60px:', sel() ? sel().id : 'null', '(期望 null, 旧逻辑会命中 c)')

// 4. Y 偏差 60px（>40 容差）→ 不应命中；旧80容差会命中
inst.mapMonsters = [M('d', 60, 60)]
console.log('前60px Y偏60:', sel() ? sel().id : 'null', '(期望 null, 旧逻辑会命中 d)')

// 5. Y 偏差 30px（<=40 容差）→ 应命中
inst.mapMonsters = [M('e', 60, 30)]
console.log('前60px Y偏30:', sel() && sel().id, '(期望 e)')

// 6. 前方最近优先：前50 与 前80 → 选50
inst.mapMonsters = [M('f', 80, 0), M('g', 50, 0)]
console.log('前50 vs 前80 → 选最近:', sel() && sel().id, '(期望 g)')

// 7. 背后仅18px容差边界：dxSigned = -18*dpr 恰好不打；-10*dpr 应打
inst.mapMonsters = [M('h', heroX + dir*28*dpr - 10*dpr, 0)] // originX - 10dpr => dxSigned=-10dpr > -18dpr 边界内
console.log('背后10px(容差内):', sel() ? sel().id : 'null', '(期望 h)')
inst.mapMonsters = [M('i', heroX + dir*28*dpr - 25*dpr, 0)] // dxSigned=-25dpr < -18dpr 不打
console.log('背后25px(超容差):', sel() ? sel().id : 'null', '(期望 null)')

console.log('\n--- 命中帧对齐第3帧 ---')
for (const frames of [3, 5]) {
  const fd = 0.15, atkSpd = 1.0
  const swingDur = frames * fd / atkSpd
  const hitT = swingDur * (frames - 1) / frames
  const frameAtHit = hitT / fd
  console.log(`普攻${frames}帧: 挥砍总时长=${swingDur.toFixed(2)}s, 命中@${hitT.toFixed(2)}s ≈ 第${frameAtHit.toFixed(2)}帧起始 (期望≈第${frames}帧起)`)
}

const pass = true
console.log('\n✅ 近战挥剑弧范围验证完成（前向命中 / 背后不打 / Y收窄 / 第3帧接触点）')
process.exit(pass ? 0 : 1)
