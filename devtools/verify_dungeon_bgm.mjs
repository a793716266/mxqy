/**
 * verify_dungeon_bgm.mjs
 * ------------------------------------------------------------------
 * 「每个 BOSS 有**自己的**专属曲」的端到端验证。
 *
 * 为什么需要这个文件：
 *   PvZ《The King》那首曲子**早就写在 tools/audio/_legacy_generators/ 里了**，
 *   但既没接进 build_bgm.py、也没登记进 SOUNDS、更没部署到分包 —— 玩家一个音都
 *   听不到，而当时所有回归都是全绿的。脚本绿 ≠ 玩家听到了。
 *
 *   ★★ 本文件的灵魂：断言必须回答「玩家听到的是哪一首」，而不是「代码有没有执行」。
 *      曾经只断言"BOSS 靠近会不会切歌"，没断言"切到的是哪一首" ——
 *      结果 field-scene 里硬编码 'bgm_the_king'，6 个 BOSS 全放同一首，回归全绿、
 *      需求没满足，用户当场指出"你把每个 BOSS 的背景音乐都设置成一样了"。
 *
 *   所以每一条都只认**真实数据 + 真实代码路径**：
 *
 *   A. 每 BOSS 专属曲登记 ── BOSS_BGM 映射表里每个敌人 → 互不相同的曲目 id；
 *      每个 id 在 SOUNDS 里注册、在 build_bgm.py 的 TRACKS 里有作曲函数、
 *      在 tools/audio/out/mp3 里真实编译出来（>1KB，0 字节在真机是静默失败）。
 *   B. 触发条件 ── 每个副本的 bossEnemy 在怪物数据里 isBoss === true，
 *      且**登记进了 BOSS_BGM**（漏登记 → 回退默认曲 → 又变成"所有 Boss 同一首"）。
 *   C. 真跑 `FieldScene._updateBossBGM()` —— 副本战斗的真实入口（玩家真走的路径）。
 *      靠近 BOSS 切到「该 BOSS 自己的曲」、脱离/击杀切回副本曲、回差不横跳、
 *      通关不打扰胜利曲。洞穴 BOSS dark_cat_king（isDungeon:false）也走这条，
 *      只要登记了专属曲就必定拿到自己的曲。
 *   C2. 兜底路径 `BattleScene.init()` —— map-scene / 主菜单测试入口会走它。
 *   D. 真跑 AudioManager ── playBGM(专属曲) 之后 setScene('battle') 不会被默认曲顶掉。
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
const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const { BOSS_BGM, DEFAULT_BOSS_BGM, getBossBGM } = await import('../scripts/data/boss-bgm.js')

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

// ============================================================
// 三方一致性的数据源
// ============================================================
// build_bgm.py 的 TRACKS 表里登记过的曲目 id（作曲函数真的存在）
const bgmSrc = fs.readFileSync(path.join(ROOT, 'tools/audio/build_bgm.py'), 'utf8')
const composedIds = new Set(
  [...bgmSrc.matchAll(/\(\s*'(bgm_boss_[a-z]+)'\s*,\s*compose_/g)].map(m => m[1])
)

/** 音频源已编译（>1KB，防 0 字节静默失败）。跑这条之前必须先 build_bgm.py */
function composedOk(id) {
  const p = path.join(ROOT, 'tools/audio/out/mp3', id + '.mp3')
  if (!fs.existsSync(p)) return false
  return fs.statSync(p).size > 1024
}

// field-scene 源码：B 段查"字段有没有人读"，反漂移查半径
const fsSrc = fs.readFileSync(path.join(ROOT, 'scripts/scenes/field-scene.js'), 'utf8')

// ============================================================
section('A. 每个 BOSS 都有专属曲（映射表 + 互不重复 + 三方一致 + 已编译）')
// ============================================================
const bossIds = Object.keys(BOSS_BGM)
const trackIds = Object.values(BOSS_BGM)

check(`BOSS_BGM 映射表登记了 ${bossIds.length} 个 BOSS 的专属曲`,
  bossIds.length >= 5, bossIds.join(', '))

check('6 个 BOSS 的曲目互不相同（不是同一首换皮）',
  new Set(trackIds).size === trackIds.length,
  trackIds.join(', '))

for (const enemyId of bossIds) {
  const id = BOSS_BGM[enemyId]
  check(`[${enemyId}] → ${id} 已在 SOUNDS 中注册`, !!SOUNDS[id], SOUNDS[id] || '(未注册 → 播不出来)')
  check(`[${enemyId}] → ${id} 已在 build_bgm.py 的 TRACKS 登记（真的有作曲函数）`,
    composedIds.has(id), composedIds.has(id) ? '' : '(TRACKS 里没有 → 编译不出)')
  check(`[${enemyId}] → ${id} 已编译成 mp3（out/mp3，>1KB）`,
    composedOk(id), composedOk(id) ? '' : '(没 build → 玩家听不到)')
}

// 专属曲不能和通用曲撞车
const generic = ['bgm_menu', 'bgm_town', 'bgm_explore', 'bgm_battle', 'bgm_boss', 'bgm_victory', 'bgm_tower']
const reused = trackIds.filter(i => generic.includes(i))
check('BOSS 专属曲没有复用通用曲（menu/town/battle/boss…）', reused.length === 0, reused.join(', '))

// 兜底默认曲也得存在
check(`兜底默认曲 ${DEFAULT_BOSS_BGM} 已注册`, !!SOUNDS[DEFAULT_BOSS_BGM], SOUNDS[DEFAULT_BOSS_BGM] || '(未注册)')

// 配了字段 ≠ 有人读。field-scene 必须真的把 dungeonCfg.bgm 交给 playBGM
check('field-scene 真的会读 dungeonCfg.bgm 并播放（字段没白配）',
  /_dungeonCfg\.bgm/.test(fsSrc) && /playBGM\(\s*\(?\s*this\._dungeonCfg/.test(fsSrc),
  'field-scene.js 中未找到 dungeonCfg.bgm → playBGM 的调用')

// ============================================================
section('B. 每个副本的 BOSS 在数据里真的是 BOSS，且登记了专属曲')
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
  // ★ 漏登记 → getBossBGM 回退默认曲 → 又变成"所有 Boss 同一首"。
  //   （治愈猫的专属曲恰好就是默认兜底曲 bgm_boss_healer，所以只判"登记了专属曲"，
  //    不判"≠ 默认"；两 Boss 撞同一首由上面的「曲目互不重复」断言拦。）
  check(`[${area}] BOSS ${bossId} 已登记专属曲`,
    Object.prototype.hasOwnProperty.call(BOSS_BGM, bossId),
    getBossBGM(bossId))
  const file = path.join(ROOT, 'scripts/entities/monsters', bossId.replace(/_/g, '-') + '.js')
  let data = null
  try { data = (await import(file)).default } catch (e) { /* 下面统一断言 */ }
  check(`[${area}] BOSS 怪物 ${bossId} 数据可加载`, !!data, `文件 ${path.basename(file)}`)
  check(`[${area}] BOSS 怪物 ${bossId} 的 isBoss === true`, !!(data && data.isBoss === true),
    data ? `isBoss=${data.isBoss}` : '(无数据)')
}

// ============================================================
section('C. 真跑副本战斗入口 —— FieldScene._updateBossBGM()（玩家真正走的路径）')
// ============================================================
// 跑的是 `FieldScene.prototype._updateBossBGM` 这个**真方法**（用 fake this 驱动状态机），
// 不是抄一份逻辑 —— 改实现这里会跟着变。每个 BOSS 都要切到「它自己那首」，
// 且洞穴 BOSS dark_cat_king（isDungeon:false）也要能拿到自己的曲。
const bossBgmFn = FieldScene.prototype._updateBossBGM
check('FieldScene 上存在 _updateBossBGM（副本 BOSS 曲的切歌入口）',
  typeof bossBgmFn === 'function', typeof bossBgmFn)

// 与实现保持一致的半径（改了实现这里也要跟着改，否则断言会假绿）
const ENGAGE = 420, RELEASE = 640
const implSrc = bossBgmFn.toString()
const mm = implSrc.match(/this\._bossBgmOn\s*\?\s*([\d.]+)\s*:\s*([\d.]+)\s*\)\s*\*\s*this\.dpr/)
check('能从实现中解析出「进入 / 脱离」半径', !!mm, implSrc.slice(0, 100))
const IMPL_RELEASE = mm ? Number(mm[1]) : NaN
const IMPL_ENGAGE = mm ? Number(mm[2]) : NaN
check('测试的半径常量与实现一致（防断言假绿）',
  IMPL_ENGAGE === ENGAGE && IMPL_RELEASE === RELEASE,
  `实现 ${IMPL_ENGAGE}/${IMPL_RELEASE} vs 测试 ${ENGAGE}/${RELEASE}`)

function runField({ bossKey = 'crystal_mage', dungeonBgm = 'bgm_magic_tower', bossAlive = true,
                    dist = 9999, dungeon = true, cleared = false, startOn = false } = {}) {
  const calls = []
  const sc = {
    dpr: 1,
    playerX: 0, playerY: 0,
    areaInfo: { isDungeon: dungeon, name: '测试副本' },
    _dungeonCfg: { bgm: dungeonBgm },
    dungeonCleared: cleared,
    _bossMonologueActive: false,
    showDungeonClear: false,
    _bossBgmOn: startOn,
    mapMonsters: [{ id: bossKey, enemyId: bossKey, name: 'BOSS', isBoss: true, alive: bossAlive, x: dist, y: 0 }],
    game: { audio: { playBGM: (id) => calls.push(id), playSFX() {}, setScene() {} } },
  }
  bossBgmFn.call(sc)
  return { calls, sc }
}

const f1 = runField({ bossKey: 'crystal_mage', dist: 900 })
check(`远离 BOSS（> ${ENGAGE}）：不切歌`, f1.calls.length === 0, `[${f1.calls.join(', ')}]`)

const f2 = runField({ bossKey: 'crystal_mage', dist: 300 })
const expectCrystal = getBossBGM('crystal_mage')
check(`靠近水晶法师：切到它自己的 ${expectCrystal}（不是某首写死的曲）`,
  f2.calls.length === 1 && f2.calls[0] === expectCrystal, `[${f2.calls.join(', ')}]`)
check('切歌后状态位 _bossBgmOn 置起', f2.sc._bossBgmOn === true, String(f2.sc._bossBgmOn))

const f3 = runField({ bossKey: 'crystal_mage', dist: 500, startOn: true })
check(`回差：已在 BOSS 曲中、距离 ${ENGAGE}~${RELEASE} 之间时保持不变（不横跳）`,
  f3.calls.length === 0, `[${f3.calls.join(', ')}]`)

const f4 = runField({ bossKey: 'crystal_mage', dist: 700, startOn: true })
check(`脱离 BOSS（> ${RELEASE}）：切回副本曲`,
  f4.calls.length === 1 && f4.calls[0] === 'bgm_magic_tower', `[${f4.calls.join(', ')}]`)

const f5 = runField({ bossKey: 'crystal_mage', bossAlive: false, startOn: true })
check('BOSS 被击败：切回副本曲',
  f5.calls.length === 1 && f5.calls[0] === 'bgm_magic_tower', `[${f5.calls.join(', ')}]`)

const f6 = runField({ bossKey: 'crystal_mage', dist: 100, startOn: true, cleared: true })
check('副本已通关：不打扰胜利曲（一条 playBGM 都不发）',
  f6.calls.length === 0, `[${f6.calls.join(', ')}]`)

// ★ 每个副本 BOSS 都切到「它自己那首」—— 这是用户"每个 BOSS 有自己的专属音乐"的硬判据
for (const [area, label, cfg] of DUNGEONS) {
  const bossId = bossByArea.get(area)
  if (!bossId) continue
  const r = runField({ bossKey: bossId, dungeonBgm: cfg.bgm, dist: 300, startOn: false })
  check(`[${area}] ${label} BOSS ${bossId} 靠近切到专属曲 ${getBossBGM(bossId)}`,
    r.calls.length === 1 && r.calls[0] === getBossBGM(bossId), `[${r.calls.join(', ')}]`)
  const r2 = runField({ bossKey: bossId, dungeonBgm: cfg.bgm, dist: 700, startOn: true })
  check(`[${area}] ${label} BOSS ${bossId} 脱离切回自己的 ${cfg.bgm}`,
    r2.calls.length === 1 && r2.calls[0] === cfg.bgm, `[${r2.calls.join(', ')}]`)
}

// ★ 洞穴 BOSS dark_cat_king（isDungeon:false）也走这条：登记了专属曲就必定拿到
const fc = runField({ bossKey: 'dark_cat_king', dungeon: false, dungeonBgm: 'bgm_grassland', dist: 300 })
check(`洞穴 BOSS dark_cat_king（非副本）靠近切到专属曲 ${getBossBGM('dark_cat_king')}`,
  fc.calls.length === 1 && fc.calls[0] === getBossBGM('dark_cat_king'), `[${fc.calls.join(', ')}]`)
check('洞穴 BOSS 切歌后 _bossBgmOn 置起',
  fc.sc._bossBgmOn === true, String(fc.sc._bossBgmOn))

// ★ 未登记专属曲的 BOSS（如野外 stray_leader）绝不顶成默认曲 —— 沿用场景曲
const fUnreg = runField({ bossKey: 'stray_leader', dungeon: false, dungeonBgm: 'bgm_grassland', dist: 300 })
check('野外未登记 BOSS（stray_leader）靠近也不切 BOSS 曲（沿用场景曲，避免伪专属）',
  fUnreg.calls.length === 0, `[${fUnreg.calls.join(', ')}]`)

// ============================================================
section('C2. 兜底路径：BattleScene.init()（map-scene / 主菜单测试入口会走它）')
// ============================================================
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
const bossBgm1 = getBossBGM('crystal_mage')
check(`BOSS 战：init() 调了 playBGM('${bossBgm1}')（走映射表，不是写死 the_king）`,
  r1.calls.includes(bossBgm1), `实际调用 = [${r1.calls.join(', ')}]`)
check('BOSS 战：只切一次（不是每帧重复调）',
  r1.calls.filter(c => c === bossBgm1).length === 1, `次数 = ${r1.calls.length}`)

const r2 = runBattleInit([mobEnemy, { ...mobEnemy, id: 'ghost_cat', name: '幽灵猫' }])
check('普通战：不切 BOSS 曲（沿用场景默认 bgm_battle）',
  !r2.calls.includes(bossBgm1), `实际调用 = [${r2.calls.join(', ')}]`)

const r3 = runBattleInit([mobEnemy, bossEnemy, { ...mobEnemy, id: 'stone_golem', name: '石魔像' }])
check('混合战（1 BOSS + 2 小怪）：只要有一个 BOSS 就切它自己的曲',
  r3.calls.includes(bossBgm1), `实际调用 = [${r3.calls.join(', ')}]`)

// ============================================================
section('D. 真跑 AudioManager —— BOSS 曲不会被 setScene 的默认曲顶掉')
// ============================================================
const amBgm = getBossBGM('crystal_mage')
const am = new AudioManager()
am.playBGM(amBgm)
check(`playBGM 后当前曲是 ${amBgm}`, am._bgmId === amBgm, am._bgmId)
check('playBGM 置起了 _explicitBGM', am._explicitBGM === true, String(am._explicitBGM))

am.setScene('battle')
check(`setScene('battle') 之后仍是 ${amBgm}（没被 bgm_battle 顶掉）`,
  am._bgmId === amBgm, `实际 = ${am._bgmId}`)

// 非 BOSS 战：不调 playBGM，setScene 应当正常兜底到 bgm_battle
const am2 = new AudioManager()
am2.setScene('battle')
check('非 BOSS 战：setScene 正常兜底到 bgm_battle',
  am2._bgmId === SCENE_BGM['battle'], `实际 = ${am2._bgmId}`)

// 打的确实是那首文件（不是同名空壳）
const amCtx = audioCreated.find(c => c.src && c.src.includes(path.basename(SOUNDS[amBgm])))
check(`BOSS 曲实例指向真实文件 ${path.basename(SOUNDS[amBgm])}`, !!amCtx,
  audioCreated.map(c => c.src).filter(Boolean).join(' | '))
check('BOSS 曲实例已 loop（副本 BOSS 战可能拖很久）', !!(amCtx && amCtx.loop === true),
  amCtx ? String(amCtx.loop) : '(无实例)')

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
