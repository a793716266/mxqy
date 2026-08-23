/**
 * verify_dungeon_exp.mjs - 真实运行时验证副本击杀经验系统
 *
 * 直接加载 field-scene 真实的 _awardKillExp / _getMonsterExp 方法（经 enemies stub loader
 * 绕过 CJS require 障碍），配合真实 charStateManager 单例，断言：
 *   A. 击杀小怪 → 全体已解锁角色经验 +expTable 值
 *   B. 经验飘字生成（✨+N）
 *   C. 临近升级击杀 → 触发升级（level+1、exp 重算），并生成「升级!」飘字 + 播放奖励音效 + 即时持久化
 *   D. _getMonsterExp 兜底：boss→200 / normal→10（expTable 无对应项时）
 *
 * 运行：node --loader ./devtools/_enemies_stub_loader.mjs devtools/verify_dungeon_exp.mjs
 */
import assert from 'node:assert/strict'

let pass = 0, fail = 0
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

// ---- 加载真实实现 ----
import { FieldScene } from '../scripts/scenes/field-scene.js'
import { charStateManager } from '../scripts/data/character-state.js'

// ---- 重置 charStateManager 单例（隔离测试）----
charStateManager._initialized = false
charStateManager.characters = new Map()
charStateManager.init(null) // 默认创建 zhenbao + lixiaobao（Lv1, exp 0）
const zhenbao = charStateManager.getCharacter('zhenbao')
const lixiaobao = charStateManager.getCharacter('lixiaobao')
ok('A0 角色状态已初始化（臻宝+李小宝）', zhenbao && lixiaobao && zhenbao.level === 1 && zhenbao.exp === 0)

// ---- 构造最小 scene（复用 FieldScene 原型真实方法）----
const audioCalls = []
const audioMock = { playSFX: (id) => audioCalls.push(id) }
const dataMock = { _m: new Map(), set(k, v) { this._m.set(k, v) }, get(k) { return this._m.get(k) } }
const scene = Object.create(FieldScene.prototype)
scene.dpr = 2
scene.playerX = 1000
scene.playerY = 1000
scene.audio = audioMock
scene.game = { data: dataMock, audio: audioMock }
scene._dropFloaters = []

// ============ A. 击杀小怪 → 全员经验增长 ============
const expBefore = { z: zhenbao.exp, l: lixiaobao.exp }
scene._awardKillExp({ enemyId: 'wild_cat', name: '野猫', x: 500, y: 500 })
ok('A1 臻宝经验 +10（wild_cat=10）', zhenbao.exp === expBefore.z + 10, `实际 ${zhenbao.exp}`)
ok('A2 李小宝经验 +10（全员共享）', lixiaobao.exp === expBefore.l + 10, `实际 ${lixiaobao.exp}`)
ok('A3 未触发升级（exp=10 < maxExp=100）', zhenbao.level === 1)
const fExp = scene._dropFloaters.find(f => f.text.startsWith('✨+'))
ok('A4 生成经验飘字 ✨+10', fExp && fExp.text === '✨+10', `floaters=${JSON.stringify(scene._dropFloaters.map(f=>f.text))}`)
ok('A5 未升级时不播升级音效', audioCalls.length === 0)

// ============ B/C. 临近升级击杀 → 升级 + 反馈 ============
// 把臻宝经验推到 95，再击杀 wild_cat(+10) → 105 >= 100 → 升 2 级，余 5
zhenbao.exp = 95
audioCalls.length = 0
scene._dropFloaters = []
scene._awardKillExp({ enemyId: 'slime_cat', name: '史莱姆猫', x: 600, y: 600 })
ok('C1 臻宝升级到 Lv.2', zhenbao.level === 2, `实际 Lv.${zhenbao.level}`)
ok('C2 臻宝升级后经验重算（95+10-100=5）', zhenbao.exp === 5, `实际 ${zhenbao.exp}`)
ok('C3 李小宝未升级（exp 仅 10+10=20）', lixiaobao.level === 1 && lixiaobao.exp === 20)
const fUp = scene._dropFloaters.find(f => f.text === '升级!')
ok('C4 生成「升级!」飘字', !!fUp)
ok('C5 播放升级音效 reward_levelup', audioCalls.includes('reward_levelup'), `calls=${JSON.stringify(audioCalls)}`)
ok('C6 升级即时持久化 characterStates', dataMock._m.has('characterStates'), `keys=${[...dataMock._m.keys()]}`)

// ============ D. _getMonsterExp 兜底 ============
ok('D1 Boss 兜底 200（expTable 无此项）', scene._getMonsterExp({ enemyId: 'unknown_boss', isBoss: true }) === 200)
ok('D2 普通怪兜底 10（expTable 无此项）', scene._getMonsterExp({ enemyId: 'unknown_mob' }) === 10)
ok('D3 expTable 命中优先（lost_healer_cat=200）', scene._getMonsterExp({ enemyId: 'lost_healer_cat' }) === 200)
ok('D4 expTable 命中（wild_cat=10）', scene._getMonsterExp({ enemyId: 'wild_cat' }) === 10)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
