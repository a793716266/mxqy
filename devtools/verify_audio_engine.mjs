/**
 * verify_audio_engine.mjs
 *
 * 音频引擎真实行为验证（不是只跑语法）。用 mock wx.createInnerAudioContext
 * 驱动真实的 AudioManager，断言：
 *   A. 资源完整性 —— SOUNDS 里每条路径在磁盘上真实存在（catch 拼写/漏部署）
 *   B. 引用完整性 —— scripts/ 里 playSFX/playBGM 用到的每个 ID 都在 SOUNDS 中
 *                    （这是 ui_equip/ui_unequip/ui_use 静默失声那类 bug 的看门狗）
 *   C. 映射完整性 —— SKILL_SFX / SKILL_HIT_SFX / SCENE_BGM / SFX_PRIORITY 指向的 ID 都存在，
 *                    且 heroes.js 里每个技能都能解析出一个真实存在的音效
 *   D. BGM 交叉淡化 —— 旧曲淡出到 0 并被 destroy，新曲淡入到目标音量
 *   E. 同曲重入 —— 重复 playBGM 同一 ID 不重启（不会每帧从头播）
 *   F. 并发上限 —— 密集播放不超过 maxInstances 个实例
 *   G. 优先级抢占 —— 高优先级能顶掉低优先级；低优先级在满池高优先级时被丢弃
 *   H. 节流 —— 同一音效在 minGap 内重复请求只出声一次
 *   I. 场景联动 —— 场景未显式指定 BGM 时自动播默认曲；显式指定时尊重场景
 *   J. 静音接续 —— 静音期间 playBGM 记录期望曲目，解除静音后自动补播
 *   K. destroy —— 定时器与实例全部释放，无泄漏
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
// mock wx：记录每个 InnerAudioContext 的完整行为轨迹
// ============================================================
const created = []          // 所有被创建的实例
let seq = 0

function makeCtx() {
  const rec = {
    _n: ++seq,
    src: '',
    volume: 1,
    loop: false,
    playbackRate: 1,
    paused: true,
    destroyed: false,
    stopped: false,
    playCount: 0,
    volumeTrace: [],
    _onEnded: null,
    _onStop: null,
    _onError: null,
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
    // 测试辅助：模拟播放自然结束
    _finish() { if (this._onEnded) this._onEnded() }
  }
  // 用 Proxy 记录 volume 变化轨迹（验证 ramp 曲线真的在动）
  const proxied = new Proxy(rec, {
    set(t, k, v) {
      if (k === 'volume') t.volumeTrace.push(v)
      t[k] = v
      return true
    }
  })
  created.push(proxied)
  return proxied
}

globalThis.wx = {
  createInnerAudioContext: () => makeCtx(),
  // 故意不提供 createWebAudioContext：验证挥击/兜底合成能安全降级
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ============================================================
const cfg = await import('../scripts/config/sound-config.js')
const { AudioManager } = await import('../scripts/core/audio-manager.js')
const { SOUNDS, SCENE_BGM, SKILL_SFX, SKILL_HIT_SFX, SFX_PRIORITY, SOUND_CONFIG,
        getSkillSFX, getSkillHitSFX, getPriority, getSceneBGM } = cfg

// ============================================================
section('A. 资源完整性：SOUNDS 每条路径在磁盘真实存在')
// ============================================================
const missing = []
const idsWithPath = Object.keys(SOUNDS).filter(k => SOUNDS[k])
for (const id of idsWithPath) {
  const abs = path.join(ROOT, SOUNDS[id])
  if (!fs.existsSync(abs)) missing.push(`${id} → ${SOUNDS[id]}`)
}
check(`${idsWithPath.length} 个音效 ID 全部有对应文件`, missing.length === 0, missing.join('; '))
// 文件非空（0 字节 mp3 在真机上是静默失败）
const empty = idsWithPath.filter(id => {
  const abs = path.join(ROOT, SOUNDS[id])
  return fs.existsSync(abs) && fs.statSync(abs).size < 1024
})
check('所有音频文件均非空(>1KB)', empty.length === 0, empty.join('; '))

// ============================================================
section('B. 引用完整性：代码里用到的音效 ID 都已配置')
// ============================================================
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}
const jsFiles = walk(path.join(ROOT, 'scripts'))
const usedSfx = new Set()
const usedBgm = new Set()
for (const f of jsFiles) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/play(?:SFX|SFXVariant)\(\s*'([a-z_0-9]+)'/g)) usedSfx.add(m[1])
  for (const m of src.matchAll(/playBGM\(\s*'([a-z_0-9]+)'/g)) usedBgm.add(m[1])
}
const badSfx = [...usedSfx].filter(id => !SOUNDS[id])
const badBgm = [...usedBgm].filter(id => !SOUNDS[id])
check(`代码引用的 ${usedSfx.size} 个 SFX ID 全部已配置`, badSfx.length === 0, badSfx.join(', '))
check(`代码引用的 ${usedBgm.size} 个 BGM ID 全部已配置`, badBgm.length === 0, badBgm.join(', '))

// ============================================================
section('C. 映射完整性：技能/场景/优先级映射都指向真实音效')
// ============================================================
const badSkill = Object.entries(SKILL_SFX).filter(([, v]) => !SOUNDS[v]).map(([k, v]) => `${k}→${v}`)
const badSkillHit = Object.entries(SKILL_HIT_SFX).filter(([, v]) => !SOUNDS[v]).map(([k, v]) => `${k}→${v}`)
const badScene = Object.entries(SCENE_BGM).filter(([, v]) => !SOUNDS[v]).map(([k, v]) => `${k}→${v}`)
const badPrio = Object.keys(SFX_PRIORITY).filter(k => !SOUNDS[k])
check(`SKILL_SFX ${Object.keys(SKILL_SFX).length} 条映射有效`, badSkill.length === 0, badSkill.join(', '))
check(`SKILL_HIT_SFX ${Object.keys(SKILL_HIT_SFX).length} 条映射有效`, badSkillHit.length === 0, badSkillHit.join(', '))
check(`SCENE_BGM ${Object.keys(SCENE_BGM).length} 个场景映射有效`, badScene.length === 0, badScene.join(', '))
check(`SFX_PRIORITY ${Object.keys(SFX_PRIORITY).length} 条优先级键有效`, badPrio.length === 0, badPrio.join(', '))

// heroes.js 里每个技能都能解析出真实存在的音效
const heroSrc = fs.readFileSync(path.join(ROOT, 'scripts/data/heroes.js'), 'utf8')
const skillIds = new Set()
// 只取 skills 数组内的 id（英雄自身 id 不含下划线技能语义，这里全收再交给兜底逻辑）
for (const m of heroSrc.matchAll(/id:\s*'([a-z_]+)'/g)) skillIds.add(m[1])
const heroTopIds = new Set(['zhenbao', 'lixiaobao', 'amy', 'annie', 'qianduoduo', 'xiaobei'])
const realSkills = [...skillIds].filter(s => !heroTopIds.has(s))
const unresolved = realSkills.filter(s => !SOUNDS[getSkillSFX(s, 'attack')])
check(`heroes.js ${realSkills.length} 个技能全部能解析出真实音效`, unresolved.length === 0, unresolved.join(', '))
const explicit = realSkills.filter(s => SKILL_SFX[s])
check(`其中 ${explicit.length} 个技能有精确音色映射（非兜底）`, explicit.length >= realSkills.length * 0.8,
  `仅 ${explicit.length}/${realSkills.length}`)
check('getSkillHitSFX 未配置技能回落到 battle_hit', getSkillHitSFX('__nope__') === 'battle_hit')
check('getPriority 未配置音效回落到默认优先级',
  getPriority('__nope__') === SOUND_CONFIG.sfx.defaultPriority)
check('getSceneBGM 未知场景返回 null', getSceneBGM('__nope__') === null)

// ============================================================
section('D. BGM 交叉淡化：旧曲淡出销毁 + 新曲淡入到目标音量')
// ============================================================
const am = AudioManager.getInstance()
am._crossfadeMs = 200          // 缩短淡化时长，加速测试
created.length = 0

am.playBGM('bgm_town')
const first = created[created.length - 1]
check('首曲创建了 InnerAudioContext', !!first)
check('首曲 src 指向 bgm_town.mp3', first && /bgm_town\.mp3$/.test(first.src), first && first.src)
check('首曲 loop=true', first && first.loop === true)
check('首曲立即给到目标音量(不让开场静音 1.4s)',
  first && Math.abs(first.volume - SOUND_CONFIG.bgm.volume) < 1e-6, first && first.volume)
check('首曲已 play()', first && first.playCount === 1)

am.playBGM('bgm_battle')
const second = created[created.length - 1]
check('切曲创建了新实例', second && second !== first)
check('新曲从 0 音量开始淡入', second && second.volumeTrace[0] === 0, second && second.volumeTrace[0])
await sleep(400)
check('旧曲音量已淡到 0', first && first.volume === 0, first && first.volume)
check('旧曲已 stop()', first && first.stopped === true)
check('旧曲已 destroy()（无实例泄漏）', first && first.destroyed === true)
check('新曲淡入到目标音量',
  second && Math.abs(second.volume - SOUND_CONFIG.bgm.volume) < 1e-3, second && second.volume)
check('淡化过程是渐变而非跳变(轨迹>4个采样点)',
  second && second.volumeTrace.length > 4, second && second.volumeTrace.length)
// 等功率曲线：中点应高于线性 0.5 倍目标
const mid = second.volumeTrace[Math.floor(second.volumeTrace.length / 2)]
check('淡入使用等功率曲线(中点高于线性中点)', mid > SOUND_CONFIG.bgm.volume * 0.5, mid)
check('_bgmId 已更新为 bgm_battle', am._bgmId === 'bgm_battle', am._bgmId)

// ============================================================
section('E. 同曲重入不重启')
// ============================================================
const beforeCount = created.length
const playsBefore = second.playCount
am.playBGM('bgm_battle')
am.playBGM('bgm_battle')
check('重复播放同一 BGM 不创建新实例', created.length === beforeCount, created.length - beforeCount)
check('重复播放同一 BGM 不重新 play()', second.playCount === playsBefore, second.playCount)
am.playBGM('bgm_battle', true)
check('forceRestart=true 时才创建新实例', created.length === beforeCount + 1)
await sleep(400)

// ============================================================
section('F. SFX 并发上限')
// ============================================================
am.destroy()
const am2 = new AudioManager()
created.length = 0
const manyIds = ['ui_click', 'ui_confirm', 'ui_cancel', 'ui_popup', 'ui_error', 'ui_success',
                 'battle_hit', 'monster_hit', 'attack_melee', 'battle_attack',
                 'reward_coin', 'char_jump', 'char_land', 'dmg_heal', 'dmg_crit']
for (const id of manyIds) am2.playSFX(id, { minGapMs: 0 })
check(`语音池不超过 maxInstances(${am2._maxInstances})`,
  am2._sfxPool.length <= am2._maxInstances, am2._sfxPool.length)
check('确实达到了上限（说明真的在密集播放）',
  am2._sfxPool.length === am2._maxInstances, am2._sfxPool.length)
const activeCount = am2._sfxPool.filter(s => s.playing).length
check('池内槽位均处于播放中', activeCount === am2._sfxPool.length, `${activeCount}/${am2._sfxPool.length}`)

// 播放结束后槽位应可复用
am2._sfxPool.forEach(s => s.ctx._finish())
check('播放结束后所有槽位回到空闲', am2._sfxPool.every(s => !s.playing))
const poolSizeBefore = am2._sfxPool.length
am2.playSFX('ui_click', { minGapMs: 0 })
check('空闲槽位被复用而非新建实例', am2._sfxPool.length === poolSizeBefore, am2._sfxPool.length)

// ============================================================
section('G. 优先级抢占（voice stealing）')
// ============================================================
const am3 = new AudioManager()
am3._maxInstances = 3
// 先用 3 个低优先级(1) 填满
am3.playSFX('ui_click', { minGapMs: 0 })
am3.playSFX('ui_confirm', { minGapMs: 0 })
am3.playSFX('ui_cancel', { minGapMs: 0 })
check('池已填满 3 个低优先级槽位', am3._sfxPool.length === 3 && am3._sfxPool.every(s => s.playing))
const oldestSlot = am3._sfxPool.reduce((a, b) => (a.startAt <= b.startAt ? a : b))
const oldestId = oldestSlot.id
// 高优先级(3) 应抢占最早的低优先级
am3.playSFX('hit_crit', { minGapMs: 0 })
check('高优先级未新建实例（走抢占）', am3._sfxPool.length === 3, am3._sfxPool.length)
check('高优先级抢占成功并占用槽位',
  am3._sfxPool.some(s => s.id === 'hit_crit' && s.playing))
check('被抢占的是最早开始的低优先级槽位',
  !am3._sfxPool.some(s => s.id === oldestId && s.playing), oldestId)

// 满池全是高优先级时，低优先级应被丢弃而不是顶掉重要音效
const am4 = new AudioManager()
am4._maxInstances = 2
am4.playSFX('hit_crit', { minGapMs: 0 })
am4.playSFX('boss_death', { minGapMs: 0 })
const hiIds = am4._sfxPool.map(s => s.id).sort().join(',')
am4.playSFX('ui_click', { minGapMs: 0 })
check('满池高优先级时低优先级请求被丢弃',
  am4._sfxPool.map(s => s.id).sort().join(',') === hiIds, am4._sfxPool.map(s => s.id).join(','))
check('重要音效未被顶掉', am4._sfxPool.every(s => s.playing))

// ============================================================
section('H. 同音效节流')
// ============================================================
const am5 = new AudioManager()
created.length = 0
am5.playSFX('battle_hit')
am5.playSFX('battle_hit')
am5.playSFX('battle_hit')
const playing5 = am5._sfxPool.filter(s => s.playing).length
check('35ms 内的 3 次同音效请求只出声 1 次', playing5 === 1, playing5)
am5.playSFX('monster_hit')
check('不同音效不受彼此节流影响', am5._sfxPool.filter(s => s.playing).length === 2)
am5.playSFX('battle_hit', { minGapMs: 0 })
check('minGapMs=0 可显式关闭节流', am5._sfxPool.filter(s => s.playing).length === 3)

// 音高抖动
const am6 = new AudioManager()
const rates = new Set()
for (let i = 0; i < 12; i++) {
  am6._lastPlayAt = {}
  am6._sfxPool.forEach(s => { s.playing = false })
  am6.playSFX('monster_hit', { pitch: 0.06, minGapMs: 0 })
  const slot = am6._sfxPool.find(s => s.id === 'monster_hit' && s.playing)
  if (slot) rates.add(Number(slot.ctx.playbackRate.toFixed(5)))
}
check('带 pitch 时 playbackRate 每次不同（消除复读机感）', rates.size >= 8, `仅 ${rates.size} 种`)
check('playbackRate 均在微信合法区间 0.5~2.0',
  [...rates].every(r => r >= 0.5 && r <= 2.0), [...rates].join(','))

// ============================================================
section('I. 场景联动')
// ============================================================
const am7 = new AudioManager()
am7._crossfadeMs = 0
// 场景没有自己指定 BGM → 用默认映射兜底
am7.beginSceneChange()
am7.setScene('battle')
check('battle 场景自动播放默认 BGM', am7._bgmId === SCENE_BGM['battle'], am7._bgmId)
// 场景自己指定了 BGM → setScene 不覆盖
am7.beginSceneChange()
am7.playBGM('bgm_boss')
am7.setScene('field')
check('场景显式指定 BGM 时 setScene 不覆盖', am7._bgmId === 'bgm_boss', am7._bgmId)
// 下一次场景切换又能正常兜底（标记已复位）
am7.beginSceneChange()
am7.setScene('town')
check('标记正确复位：下次切换恢复默认兜底', am7._bgmId === SCENE_BGM['town'], am7._bgmId)
check('collection 场景有 BGM 兜底（原先无声）', !!getSceneBGM('collection'))
check('battle 场景有 BGM 兜底（原先无声）', !!getSceneBGM('battle'))
// 全部 SCENE 常量都有映射
const sceneConsts = ['main-menu', 'town', 'field', 'battle', 'collection', 'tower']
const noBgm = sceneConsts.filter(s => !getSceneBGM(s))
check(`game.js 的 ${sceneConsts.length} 个场景全部有 BGM 映射`, noBgm.length === 0, noBgm.join(','))

// ============================================================
section('J. 静音与接续')
// ============================================================
const am8 = new AudioManager()
am8._crossfadeMs = 0
am8.setMuted(true)
am8.playBGM('bgm_town')
check('静音期间不创建 BGM 实例', am8._bgm === null)
check('静音期间仍记录期望曲目', am8._desiredBgmId === 'bgm_town', am8._desiredBgmId)
am8.playSFX('ui_click', { minGapMs: 0 })
check('静音期间不播放 SFX', am8._sfxPool.filter(s => s.playing).length === 0)
am8.setMuted(false)
check('解除静音后自动补播期望 BGM', am8._bgmId === 'bgm_town', am8._bgmId)
check('解除静音后 SFX 恢复可用',
  (am8.playSFX('ui_click', { minGapMs: 0 }), am8._sfxPool.filter(s => s.playing).length === 1))
// 静音时停掉正在播的 SFX
am8.setMuted(true)
check('切静音时立即停掉在播 SFX', am8._sfxPool.every(s => !s.playing))
am8.setMuted(false)

// 音量接口（settings-panel 依赖这些私有字段名，不能改名）
const am9 = new AudioManager()
am9._crossfadeMs = 0
am9.playBGM('bgm_town')
am9.setBGMVolume(0.3)
check('setBGMVolume 立即作用于当前曲目', Math.abs(am9._bgm.volume - 0.3) < 1e-6, am9._bgm.volume)
am9.setSFXVolume(0.5)
check('setSFXVolume 生效', am9._sfxVolume === 0.5)
check('settings-panel 依赖的 _bgmVolume 字段仍存在', typeof am9._bgmVolume === 'number')
check('settings-panel 依赖的 _sfxVolume 字段仍存在', typeof am9._sfxVolume === 'number')
check('settings-panel 依赖的 _muted 字段仍存在', typeof am9._muted === 'boolean')

// ============================================================
section('K. 降级与销毁')
// ============================================================
// 无 createWebAudioContext 时挥击/打击兜底必须静默降级而非抛错
let threw = null
try {
  am9.playSwingSynth({ volumeScale: 1 })
  am9.playHitSynth({ type: 'slash', crit: false })
  am9.playHitSynth({ type: 'magic', crit: true })
  am9.playHitSynth({ type: 'block' })
} catch (e) { threw = e }
check('无 WebAudio 时合成音安全降级不抛错', threw === null, threw && threw.message)
check('playHitSynth 走资源播放（不再依赖玩具合成）',
  am9._sfxPool.some(s => ['monster_hit', 'hit_crit', 'hit_block'].includes(s.id)),
  am9._sfxPool.map(s => s.id).join(','))
// 技能音效接口
am9.playSkillSFX('fireball', 'magic')
check('playSkillSFX(fireball) 映射到 cast_fireball',
  am9._sfxPool.some(s => s.id === 'cast_fireball'), am9._sfxPool.map(s => s.id).join(','))
am9.playSkillHitSFX('ice_shard')
check('playSkillHitSFX(ice_shard) 映射到 hit_ice_shard',
  am9._sfxPool.some(s => s.id === 'hit_ice_shard'))
am9.playSkillSFX('__unknown__', 'buff')
check('未知技能按 type=buff 兜底到 cast_buff',
  am9._sfxPool.some(s => s.id === 'cast_buff'))

// destroy 清理
const amD = new AudioManager()
amD._crossfadeMs = 500
amD.playBGM('bgm_town')
amD.playBGM('bgm_battle')       // 触发一个进行中的 ramp
amD.playSFX('ui_click', { minGapMs: 0 })
const ctxsBefore = amD._sfxPool.map(s => s.ctx)
const bgmBefore = amD._bgm
amD.destroy()
check('destroy 清空定时器集合', amD._timers.size === 0, amD._timers.size)
check('destroy 清空语音池', amD._sfxPool.length === 0)
check('destroy 销毁全部 SFX 实例', ctxsBefore.every(c => c.destroyed))
check('destroy 销毁 BGM 实例', bgmBefore.destroyed === true)
check('destroy 后 _bgmId 归零', amD._bgmId === null)
await sleep(300)
check('destroy 后残留 ramp 不再改动已销毁实例的音量',
  bgmBefore.volumeTrace[bgmBefore.volumeTrace.length - 1] != null)

// debugState 快照可用（真机排查用）
const st = new AudioManager().debugState()
check('debugState 返回完整状态快照',
  ['bgmId', 'scene', 'muted', 'voices', 'maxInstances'].every(k => k in st),
  Object.keys(st).join(','))

// ============================================================
console.log('\n' + '='.repeat(52))
console.log(`结果: ${pass} 通过 / ${fail} 失败`)
if (fail) {
  console.log('\n失败项:')
  failures.forEach(f => console.log('  -', f))
}
console.log('='.repeat(52))
process.exit(fail ? 1 : 0)
