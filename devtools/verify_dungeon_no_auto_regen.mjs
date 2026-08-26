/**
 * verify_dungeon_no_auto_regen.mjs
 * =========================================
 * 回归测试：副本(areaInfo.isDungeon)内，全员（被控英雄 + AI 队友）不享受被动回血/回蓝，
 * 除非装备带有 hpRegen / mpRegen 属性；非副本保留原有 MP 5/s 基线（HP 无基线）。
 *
 * 设计要点（避免"fake green"）：
 *   - 直接构造 FieldScene.prototype 实例（Object.create），仅挂 battleSystem/areaInfo，
 *     精准测 _regenAllHeroMp / _regenAllHeroHp 两条回血回蓝路径，不依赖整场景 init。
 *   - 覆盖两个方向：副本禁用 + 装备例外；非副本基线保留 + 满值不溢出。
 */

// ★ 安全 mock wx（field-scene 模块加载期可能引用）
globalThis.wx = {
  getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }),
  createImage: () => ({ width: 64, height: 64, set onload(f) { if (f) setTimeout(f, 0) }, set src(v) {} }),
  getStorageSync: () => undefined, setStorageSync: () => {}, onHide: () => {}, onShow: () => {},
}

import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
// ★ CJS 兼容：field-scene 依赖链里 enemies.js 等用 require，ESM 下需用 createRequire 兜底
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) { console.warn('[verify] require failed: ' + p); throw e }
}
const mod = await import(path.resolve(projectRoot, 'scripts', 'scenes', 'field-scene.js'))
const FieldScene = mod.FieldScene
// ★ 显式安装战斗系统方法到 FieldScene.prototype（mixin 仅在构造函数内触发，
//   本测试用 Object.create 不跑构造函数，需手动调用一次；幂等(_battleSystemInstalled 守卫)）。
const fbsMod = await import(path.resolve(projectRoot, 'scripts', 'systems', 'field-battle-system.js'))
if (typeof fbsMod.installFieldBattleSystem === 'function') fbsMod.installFieldBattleSystem(FieldScene)

let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  [OK] ' + name) }
  else { failed++; console.log('  [FAIL] ' + name + (detail ? '  ' + detail : '')) }
}

function makeHero(opts) {
  return Object.assign({
    id: opts.id, name: opts.name,
    hp: 10, maxHp: 200, mp: 10, maxMp: 100,
    mpRegen: 0, hpRegen: 0,
    alive: true, _castInterrupted: false
  }, opts)
}

const dt = 1 / 60

// ============ 用例A：副本内 — 无装备不回血回蓝，有装备回 ============
console.log('\n=== A. 副本(areaInfo.isDungeon)内 ===')
const scene = Object.create(FieldScene.prototype)
const heroNo = makeHero({ id: 'no', name: '无装备' })           // mpRegen=0, hpRegen=0
const heroEq = makeHero({ id: 'eq', name: '装备者', mpRegen: 8, hpRegen: 20 })
scene.battleSystem = { battleHeroes: [
  { hero: heroNo, sprite: null, getPos: () => ({ x: 0, y: 0 }) },
  { hero: heroEq, sprite: null, getPos: () => ({ x: 0, y: 0 }) },
] }
scene.areaInfo = { isDungeon: true }

const mp0No = heroNo.mp, hp0No = heroNo.hp, mp0Eq = heroEq.mp, hp0Eq = heroEq.hp
for (let i = 0; i < 60; i++) { scene._regenAllHeroMp(dt); scene._regenAllHeroHp(dt) }

assert(heroNo.mp === mp0No, '副本·无装备英雄 MP 不自动回复', `mp ${mp0No}->${heroNo.mp}`)
assert(heroNo.hp === hp0No, '副本·无装备英雄 HP 不自动回复', `hp ${hp0No}->${heroNo.hp}`)
assert(heroEq.mp > mp0Eq, '副本·装备 mpRegen 生效（自动回蓝例外）', `mp ${mp0Eq}->${heroEq.mp}`)
assert(heroEq.hp > hp0Eq, '副本·装备 hpRegen 生效（自动回血例外）', `hp ${hp0Eq}->${heroEq.hp}`)

// ============ 用例B：非副本 — MP 保留 5/s 基线，HP 无基线仍不回 ============
console.log('\n=== B. 非副本（保留原行为）===')
scene.areaInfo = { isDungeon: false }
const heroNo2 = makeHero({ id: 'no2', name: '非副本无装备' })
const mp0No2 = heroNo2.mp, hp0No2 = heroNo2.hp
scene.battleSystem = { battleHeroes: [{ hero: heroNo2, sprite: null, getPos: () => ({ x: 0, y: 0 }) }] }
for (let i = 0; i < 60; i++) { scene._regenAllHeroMp(dt); scene._regenAllHeroHp(dt) }

assert(heroNo2.mp > mp0No2, '非副本·无装备英雄仍按 5/s 基线回蓝（不破坏原行为）', `mp ${mp0No2}->${heroNo2.mp}`)
assert(heroNo2.hp === hp0No2, '非副本·无装备英雄 HP 无基线仍不回血', `hp ${hp0No2}->${heroNo2.hp}`)

// ============ 用例C：满值不溢出 ============
console.log('\n=== C. 边界：满值不溢出 ===')
scene.areaInfo = { isDungeon: false }
const heroFull = makeHero({ id: 'full', name: '满蓝', mp: 100, maxMp: 100, mpRegen: 8 })
scene.battleSystem = { battleHeroes: [{ hero: heroFull, sprite: null, getPos: () => ({ x: 0, y: 0 }) }] }
for (let i = 0; i < 60; i++) scene._regenAllHeroMp(dt)
assert(heroFull.mp === 100, '回蓝不超过 maxMp', `mp=${heroFull.mp}`)

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`)
process.exit(failed === 0 ? 0 : 1)
