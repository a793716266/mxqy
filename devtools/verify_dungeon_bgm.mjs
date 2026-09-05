/**
 * verify_dungeon_bgm.mjs
 * ------------------------------------------------------------------
 * 「每个副本一首专属曲 + BOSS 有专属曲」的端到端验证。
 *
 * 为什么需要这个文件：
 *   PvZ《The King》那首曲子**早就写在 tools/audio/_legacy_generators/ 里了**，
 *   但既没接进 build_bgm.py、也没登记进 SOUNDS、更没部署到分包 —— 玩家一个音都
 *   听不到，而当时所有回归都是全绿的。脚本绿 ≠ 玩家听到了。
 *   所以这里每一条都只认**真实数据 + 真实代码路径**：
 *
 *   A. 副本曲登记 ── 5 个副本各有 bgm 字段；ID 在 SOUNDS 里；mp3 在磁盘上真实存在
 *                    （存在且 >1KB，0 字节 mp3 在真机上是静默失败）；5 首互不重复
 *   B. BOSS 触发条件 ── 每个副本的 bossEnemy 在怪物数据里 isBoss === true。
 *                    少了这一步，BOSS 曲写得再好也永远不会触发
 *   C. 真跑 `FieldScene._updateBossBGM()` —— **副本战斗的真实入口**。
 *                    靠近 BOSS 切 The King / 脱离或击杀后切回副本曲 / 回差不横跳 /
 *                    通关时不打扰胜利曲。跑的是原型上的真方法，不是抄一份逻辑。
 *                    ★ 上一版跑的是 BattleScene，而副本战斗根本不进 BattleScene
 *                      —— "代码路径全绿、玩家永远走不到"，就是这么翻的车
 *   C2. 兜底路径 `BattleScene.init()` —— map-scene / 主菜单测试入口会走它
 *   D. 真跑 AudioManager ── playBGM('bgm_the_king') 之后 setScene('battle')
 *                    不会被默认的 bgm_battle 顶掉（_explicitBGM 机制）
 *
 * 运行：npm run verify-dungeon-bgm
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const failures = []
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name) }
  else {
    fail++
    console.log('  ✗', name, extra != null ? `→ ${extra}` : '')
    failures.push(name + (extra != null ? ` → ${extra}` : ''))
  }
}
function section(t) { console.log('\n── ' + t + ' ──') }

// ============================================================
// 桩件：同时满足 BattleScene（离屏 Canvas）与 AudioManager（InnerAudioContext）
// 必须在 import 业务模块**之前**装好（模块顶层可能就摸 wx）
// ============================================================
function makeCtx2D() {
  const grad = { addColorStop() {} }
  const base = { canvas: { width: 750, height: 1334 } }
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return () => ({ width: 10 })
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
      return () => grad
    },
    set(t, k, v) { t[k] = v; return true },
  })
}
function makeCanvas(w = 750, h = 1334) {
  return { width: w, height: h, getContext: () => makeCtx2D() }
}

const audioCreated = []
function makeAudioCtx() {
  const rec = {
    src: '', volume: 1, loop: false, playbackRate: 1, paused: true,
    destroyed: false, stopped: false, playCount: 0,
    _onEnded: null, _onStop: null, _onError: null,
    play() { this.playCount++; this.paused = false },
    pause() { this.paused = true },
    stop() { this.stopped = true; this.paused = true; if (this._onStop) this._onStop() },
    destroy() { this.destroyed = true },
    seek() {},
    onEnded(cb) { this._onEnded = cb },
    onStop(cb) { this._onStop = cb },
    onError(cb) { this._onError = cb },
    onPlay() {}, onPause() {}, onTimeUpdate() {}, onWaiting() {}, onCanplay() {},
    offEnded() {}, offStop() {}, offError() {},
  }
  audioCreated.push(rec)
  return rec
}

globalThis.wx = {
  createCanvas: () => makeCanvas(),
  createInnerAudioContext: () => makeAudioCtx(),
  setInnerAudioOption() {},
  // 故意不提供 createWebAudioContext：验证挥击/兜底合成能安全降级
}

// ============================================================
// 动态 import（桩件就绪后）
// ============================================================
const { SOUNDS, SCENE_BGM } = await import('../scripts/config/sound-config.js')
const { AudioManager } = await import('../scripts/core/audio-manager.js')
const { BattleScene } = await import('../scripts/scenes/battle-scene.js')

const { GRASSLAND_DUNGEON } = await import('../scripts/data/grassland-dungeon.js')
const { MAGIC_TOWER_DUNGEON } = await import('../scripts/data/magic-tower-dungeon.js')
const { MERCHANT_TOWN_DUNGEON } = await import('../scripts/data/merchant-town-dungeon.js')
const { ANCIENT_RUINS_DUNGEON } = await import('../scripts/data/ancient-ruins-dungeon.js')
const { VOID_MIST_DUNGEON } = await import('../scripts/data/void-mist-dungeon.js')

// 副本名 → 配置。顺序 = 章节顺序
const DUNGEONS = [
  ['grassland', '阳光草原', GRASSLAND_DUNGEON],
  ['magic_tower', '魔法塔', MAGIC_TOWER_DUNGEON],
  ['merchant_town', '集市小镇', MERCHANT_TOWN_DUNGEON],
  ['ancient_ruins', '古城遗迹', ANCIENT_RUINS_DUNGEON],
  ['void_mist', '虚无之境', VOID_MIST_DUNGEON],
]

/** 曲子是否真的在磁盘上（>1KB，防 0 字节静默失败） */
function fileOk(id) {
  const p = SOUNDS[id]
  if (!p) return false
  const abs = path.join(ROOT, p)
  if (!fs.existsSync(abs)) return false
  return fs.statSync(abs).size > 1024
}

// field-scene 源码：A 段查"字段有没有人读"，B 段查 bossEnemy ↔ dungeonCfg 配对
const fsSrc = fs.readFileSync(path.join(ROOT, 'scripts/scenes/field-scene.js'), 'utf8')

// ============================================================
section('A. 每个副本都有专属曲（登记 + 文件真实存在 + 互不重复）')
// ============================================================
const bossBgmId = 'bgm_the_king'
const ids = []
for (const [area, label, cfg] of DUNGEONS) {
  const id = cfg && cfg.bgm
  check(`[${area}] ${label} 配置了 bgm 字段`, !!id, id || '(缺失)')
  if (!id) continue
  check(`[${area}] ${id} 已在 SOUNDS 中登记`, !!SOUNDS[id], SOUNDS[id] || '(未登记 —— 播不出来)')
  check(`[${area}] ${id} 的 mp3 真实存在且非空`, fileOk(id), SOUNDS[id] || '(无路径)')
  ids.push(id)
}

check('5 个副本的曲目互不重复（不是同一首换皮）',
  new Set(ids).size === ids.length,
  ids.join(', '))

// 通用曲（场景兜底）不该被副本拿来顶替
const generic = ['bgm_menu', 'bgm_town', 'bgm_explore', 'bgm_battle', 'bgm_boss', 'bgm_victory', 'bgm_tower']
const reused = ids.filter(i => generic.includes(i))
check('副本曲没有复用通用曲（menu/town/battle/boss…）', reused.length === 0, reused.join(', '))

check(`BOSS 专属曲 ${bossBgmId} 已登记`, !!SOUNDS[bossBgmId], SOUNDS[bossBgmId] || '(未登记)')
check(`BOSS 专属曲 ${bossBgmId} 文件真实存在且非空`, fileOk(bossBgmId), SOUNDS[bossBgmId] || '(无路径)')
check(`BOSS 专属曲与普通战斗曲不同（${bossBgmId} ≠ ${SCENE_BGM['battle']}）`,
  bossBgmId !== SCENE_BGM['battle'], SCENE_BGM['battle'])

// 配了字段 ≠ 有人读。field-scene 必须真的把 dungeonCfg.bgm 交给 playBGM，
// 否则副本曲就是一堆没人播放的文件（这正是当年 The King 的死法）。
check('field-scene 真的会读 dungeonCfg.bgm 并播放（字段没白配）',
  /_dungeonCfg\.bgm/.test(fsSrc) && /playBGM\(\s*\(?\s*this\._dungeonCfg/.test(fsSrc),
  'field-scene.js 中未找到 dungeonCfg.bgm → playBGM 的调用')

// ============================================================
section('B. 每个副本的 BOSS 在数据里真的是 BOSS（否则 BOSS 曲永不触发）')
// ============================================================
// field-scene 的 area 表里，bossEnemy 恒在 dungeonCfg 之前 —— 用非贪婪配对抓出来，
// 这样"以后新增副本忘了配 bossEnemy"会直接在这里被抓到（而不是等玩家反馈）。
// ============================================================
const pairs = [...fsSrc.matchAll(/bossEnemy:\s*'([a-z0-9_]+)'[\s\S]*?dungeonCfg:\s*([A-Z_]+)/g)]
  .map(m => ({ boss: m[1], cfgName: m[2] }))

const CFG_BY_NAME = {
  GRASSLAND_DUNGEON, MAGIC_TOWER_DUNGEON, MERCHANT_TOWN_DUNGEON,
  ANCIENT_RUINS_DUNGEON, VOID_MIST_DUNGEON,
}
const bossByArea = new Map()
for (const p of pairs) {
  const cfg = CFG_BY_NAME[p.cfgName]
  if (!cfg) continue
  const hit = DUNGEONS.find(d => d[2] === cfg)
  if (hit) bossByArea.set(hit[0], p.boss)
}
check('从 field-scene 解析出 5 个副本的 bossEnemy', bossByArea.size === 5,
  [...bossByArea.entries()].map(([k, v]) => `${k}=${v}`).join(', '))

for (const [area, label] of DUNGEONS) {
  const bossId = bossByArea.get(area)
  check(`[${area}] ${label} 有 bossEnemy`, !!bossId, '(缺失)')
  if (!bossId) continue
  // 怪物 id 'crystal_mage' → 文件 scripts/entities/monsters/crystal-mage.js
  const file = path.join(ROOT, 'scripts/entities/monsters', bossId.replace(/_/g, '-') + '.js')
  let data = null
  try {
    data = (await import(file)).default
  } catch (e) { /* 下面统一断言 */ }
  check(`[${area}] BOSS 怪物 ${bossId} 数据可加载`, !!data, `文件 ${path.basename(file)}`)
  check(`[${area}] BOSS 怪物 ${bossId} 的 isBoss === true`, !!(data && data.isBoss === true),
    data ? `isBoss=${data.isBoss}` : '(无数据)')
}

// ============================================================
section('C. 真跑副本战斗入口 —— FieldScene._updateBossBGM()（玩家真正走的路径）')
// ============================================================
// ★ 这一段是上次翻车的地方。上一版把 BOSS 曲接在 battle-scene.init()，
//   回归跑 BattleScene 全绿 —— 但副本战斗**压根不进 BattleScene**：
//   changeScene('battle') 全工程只在 map-scene 与 main-menu 出现，
//   副本是 FieldScene 里的实时 battleSystem，而且进图那一刻就 active=true，
//   全程没有"进入战斗场景"这个事件可挂。玩家永远走不到那条路径，
//   于是"还是一样 BOSS 没有专属音乐"，而回归是绿的。
//
//   → 教训：验证要跑**玩家真正会走进去的入口**，不是跑"代码写得对不对"。
//
//   这里跑的是 `FieldScene.prototype._updateBossBGM` 这个**真方法**
//   （用 fake this 驱动它的状态机），不是抄一份逻辑 —— 改实现这里会跟着变。

const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const bossBgmFn = FieldScene.prototype._updateBossBGM
check('FieldScene 上存在 _updateBossBGM（副本 BOSS 曲的切歌入口）',
  typeof bossBgmFn === 'function', typeof bossBgmFn)

// 与实现保持一致的半径（改了实现这里也要跟着改，否则断言会假绿）
const ENGAGE = 420, RELEASE = 640

// 反漂移：把半径从**实现源码**里抠出来比对。改了实现而测试没跟上就直接失败 ——
// 否则断言会拿着旧阈值继续"全绿"，这正是上一次翻车的形态。
const implSrc = bossBgmFn.toString()
const mm = implSrc.match(/this\._bossBgmOn\s*\?\s*([\d.]+)\s*:\s*([\d.]+)\s*\)\s*\*\s*this\.dpr/)
check('能从实现中解析出「进入 / 脱离」半径', !!mm, implSrc.slice(0, 100))
const IMPL_RELEASE = mm ? Number(mm[1]) : NaN
const IMPL_ENGAGE = mm ? Number(mm[2]) : NaN
check('测试的半径常量与实现一致（防断言假绿）',
  IMPL_ENGAGE === ENGAGE && IMPL_RELEASE === RELEASE,
  `实现 ${IMPL_ENGAGE}/${IMPL_RELEASE} vs 测试 ${ENGAGE}/${RELEASE}`)

function runField({ dungeonBgm = 'bgm_magic_tower', bossAlive = true, dist = 9999,
                    dungeon = true, cleared = false, startOn = false } = {}) {
  const calls = []
  const sc = {
    dpr: 1,                                  // dpr=1 → 距离直接与阈值同单位
    playerX: 0, playerY: 0,
    areaInfo: { isDungeon: dungeon, name: '测试副本' },
    _dungeonCfg: { bgm: dungeonBgm },
    dungeonCleared: cleared,
    _bossMonologueActive: false,
    showDungeonClear: false,
    _bossBgmOn: startOn,
    mapMonsters: [{ id: 'boss', name: 'BOSS', isBoss: true, alive: bossAlive, x: dist, y: 0 }],
    game: { audio: { playBGM: (id) => calls.push(id), playSFX() {}, setScene() {} } },
  }
  bossBgmFn.call(sc)                         // ← 跑原型上的真方法
  return { calls, sc }
}

const f1 = runField({ dist: 900 })
check(`远离 BOSS（> ${ENGAGE}）：不切歌`, f1.calls.length === 0, `[${f1.calls.join(', ')}]`)

const f2 = runField({ dist: 300 })
check(`靠近 BOSS（< ${ENGAGE}）：切到 ${bossBgmId}`,
  f2.calls.length === 1 && f2.calls[0] === bossBgmId, `[${f2.calls.join(', ')}]`)
check('切歌后状态位 _bossBgmOn 置起', f2.sc._bossBgmOn === true, String(f2.sc._bossBgmOn))

const f3 = runField({ dist: 500, startOn: true })   // 420 ~ 640 之间
check(`回差：已在 BOSS 曲中、距离 ${ENGAGE}~${RELEASE} 之间时保持不变（不横跳）`,
  f3.calls.length === 0, `[${f3.calls.join(', ')}]`)

const f4 = runField({ dist: 700, startOn: true })
check(`脱离 BOSS（> ${RELEASE}）：切回副本曲`,
  f4.calls.length === 1 && f4.calls[0] === 'bgm_magic_tower', `[${f4.calls.join(', ')}]`)

const f5 = runField({ bossAlive: false, startOn: true })
check('BOSS 被击败：切回副本曲',
  f5.calls.length === 1 && f5.calls[0] === 'bgm_magic_tower', `[${f5.calls.join(', ')}]`)

const f6 = runField({ dist: 100, startOn: true, cleared: true })
check('副本已通关：不打扰胜利曲（一条 playBGM 都不发）',
  f6.calls.length === 0, `[${f6.calls.join(', ')}]`)

const f7 = runField({ dist: 100, dungeon: false })
check('非副本野外：不切 BOSS 曲', f7.calls.length === 0, `[${f7.calls.join(', ')}]`)

// 每个副本都能切回**它自己那首**，而不是写死某一首
for (const [area, label, cfg] of DUNGEONS) {
  const r = runField({ dungeonBgm: cfg.bgm, dist: 700, startOn: true })
  check(`[${area}] ${label} 脱离 BOSS 后切回自己的 ${cfg.bgm}`,
    r.calls.length === 1 && r.calls[0] === cfg.bgm, `[${r.calls.join(', ')}]`)
}

// ------------------------------------------------------------
section('C2. 兜底路径：BattleScene.init()（map-scene / 主菜单测试入口会走它）')
// ------------------------------------------------------------
function silent(fn) {
  const orig = console.log
  console.log = () => {}
  try { return fn() } finally { console.log = orig }
}

function runBattleInit(enemies) {
  const calls = []
  const game = {
    dpr: 2, width: 750, height: 1334,
    canvas: makeCanvas(),
    audio: { playBGM: (id) => calls.push(id), playSFX() {}, setScene() {} },
    changeScene() {},
  }
  let err = null
  silent(() => {
    try {
      const s = new BattleScene(game, { enemies, party: ['lixiaobao'] })
      s.init()
    } catch (e) { err = e }
  })
  return { calls, err }
}

const bossEnemy = { id: 'crystal_mage', name: '水晶法师', isBoss: true, hp: 999, maxHp: 999, level: 20 }
const mobEnemy = { id: 'magic_sprite', name: '魔法精灵', hp: 60, maxHp: 60, level: 10 }

const r1 = runBattleInit([bossEnemy])
check('BOSS 战：init() 调了 playBGM(\'bgm_the_king\')',
  r1.calls.includes(bossBgmId), `实际调用 = [${r1.calls.join(', ')}]`)
check('BOSS 战：只切一次（不是每帧重复调）',
  r1.calls.filter(c => c === bossBgmId).length === 1, `次数 = ${r1.calls.length}`)

const r2 = runBattleInit([mobEnemy, { ...mobEnemy, id: 'ghost_cat', name: '幽灵猫' }])
check('普通战：不切 BOSS 曲（沿用场景默认 bgm_battle）',
  !r2.calls.includes(bossBgmId), `实际调用 = [${r2.calls.join(', ')}]`)

const r3 = runBattleInit([mobEnemy, bossEnemy, { ...mobEnemy, id: 'stone_golem', name: '石魔像' }])
check('混合战（1 BOSS + 2 小怪）：只要有一个 BOSS 就切',
  r3.calls.includes(bossBgmId), `实际调用 = [${r3.calls.join(', ')}]`)

// ============================================================
section('D. 真跑 AudioManager —— BOSS 曲不会被 setScene 的默认曲顶掉')
// ============================================================
// game.changeScene 的顺序是 init() → audio.setScene(name)：
// init 里调 playBGM 置 _explicitBGM=true，setScene 看到就尊重场景的选择。
// 这条挂了 = BOSS 曲刚响就被 bgm_battle 盖掉，玩家只会听到"闪了一下"。
const am = new AudioManager()
am.playBGM(bossBgmId)
check(`playBGM 后当前曲是 ${bossBgmId}`, am._bgmId === bossBgmId, am._bgmId)
check('playBGM 置起了 _explicitBGM', am._explicitBGM === true, String(am._explicitBGM))

am.setScene('battle')
check('setScene(\'battle\') 之后仍是 BOSS 曲（没被 bgm_battle 顶掉）',
  am._bgmId === bossBgmId, `实际 = ${am._bgmId}`)

// 非 BOSS 战：不调 playBGM，setScene 应当正常兜底到 bgm_battle
const am2 = new AudioManager()
am2.setScene('battle')
check('非 BOSS 战：setScene 正常兜底到 bgm_battle',
  am2._bgmId === SCENE_BGM['battle'], `实际 = ${am2._bgmId}`)

// 打的确实是那首文件（不是同名空壳）
const kingPath = SOUNDS[bossBgmId]
const kingCtx = audioCreated.find(c => c.src && c.src.includes(path.basename(kingPath)))
check(`BOSS 曲实例指向真实文件 ${path.basename(kingPath)}`, !!kingCtx,
  audioCreated.map(c => c.src).filter(Boolean).join(' | '))
check('BOSS 曲实例已 loop（副本 BOSS 战可能拖很久）', !!(kingCtx && kingCtx.loop === true),
  kingCtx ? String(kingCtx.loop) : '(无实例)')

// ============================================================
console.log('\n' + '='.repeat(70))
if (fail) {
  console.log(`结果: ${pass} 通过 / ${fail} 失败`)
  console.log('-'.repeat(70))
  failures.forEach(f => console.log('  ✗ ' + f))
} else {
  console.log(`结果: ${pass} 通过 / 0 失败`)
}
console.log('='.repeat(70))
// BattleScene.init 会挂定时器，跑完直接退出，不等事件循环
process.exit(fail ? 1 : 0)
