#!/usr/bin/env node
/**
 * verify_deployed.js —— 交付一致性闸门：生成产物必须与游戏分包逐字节相同。
 *
 * ★ 为什么必须有这道闸门（2026-09-03 踩的坑）：
 *   改完 build_sfx.py 重建完 12 个音效，忘了跑 deploy_audio.js。
 *   于是"工具链里是新的、游戏里还是旧的" —— 玩家听到的完全没变，
 *   而我这边所有回归脚本都绿着（它们量的是 tools/audio/out，不是分包）。
 *   **回归脚本全绿 ≠ 玩家听到的东西变了**，中间还隔着一次部署。
 *
 *   判据必须落到"玩家实际加载的那一份"上：subpackages/sound/ 下的文件
 *   与 tools/audio/out/mp3/ 逐个比 md5。任何一处不一致或缺文件 → 失败。
 *
 * 用法：node tools/audio/verify_deployed.js
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..', '..')
const OUT_MP3 = path.join(ROOT, 'tools', 'audio', 'out', 'mp3')
const PKG = path.join(ROOT, 'subpackages', 'sound')

// 分包内的实际布局（与 deploy_audio.js 保持一致）
const BGM = ['bgm_menu', 'bgm_town', 'bgm_explore', 'bgm_grassland',
             'bgm_battle', 'bgm_boss', 'bgm_victory']
const SFX = {
  ui: ['ui_click', 'ui_confirm', 'ui_cancel', 'ui_popup', 'ui_error', 'ui_success',
       'dmg_crit', 'dmg_heal'],
  battle: ['attack_melee', 'attack_range', 'battle_attack', 'battle_hit',
           'battle_sword_slash', 'hit_crit', 'hit_block', 'cast_fireball',
           'cast_ice_shard', 'cast_lightning', 'cast_meteor', 'cast_heal',
           'cast_blade_storm', 'cast_buff', 'battle_skill', 'hit_fireball',
           'hit_ice_shard', 'hit_lightning', 'hit_meteor', 'battle_explosion'],
  monster: ['monster_hit', 'monster_death', 'monster_spawn', 'boss_death'],
  reward: ['reward_coin', 'reward_levelup', 'reward_achievement', 'reward_get_item'],
  system: ['wave_start', 'wave_complete', 'game_defeat', 'char_jump', 'char_land'],
}

function md5(p) {
  try {
    return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex')
  } catch (e) {
    return null
  }
}

let npass = 0
const fails = []
const seen = new Set()

function check(name, src, dst) {
  seen.add(path.resolve(dst))
  const a = md5(src)
  const b = md5(dst)
  if (a === null) { fails.push(`${name}: 生成产物缺失 ${src}`); return }
  if (b === null) { fails.push(`${name}: 分包缺失 —— 重建后忘了跑 npm run deploy-audio`) ; return }
  if (a !== b) { fails.push(`${name}: 内容不一致 —— 重建后忘了跑 npm run deploy-audio`); return }
  npass++
}

console.log('交付一致性检查：tools/audio/out/mp3  ↔  subpackages/sound/')
console.log('-'.repeat(72))

for (const n of BGM) {
  check(`BGM ${n}`, path.join(OUT_MP3, `${n}.mp3`), path.join(PKG, 'game_bgm', `${n}.mp3`))
}
for (const [cat, names] of Object.entries(SFX)) {
  for (const n of names) {
    check(`SFX ${cat}/${n}`, path.join(OUT_MP3, 'sfx', `${n}.mp3`),
          path.join(PKG, 'game_sfx', cat, `${n}.mp3`))
  }
}

// 反向：分包里不该有多出来的 mp3（旧玩具级文件残留会白占体积）
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.mp3')) out.push(path.resolve(p))
  }
  return out
}
const extra = walk(PKG).filter(p => !seen.has(p))
for (const p of extra) fails.push(`分包残留多余文件：${path.relative(ROOT, p)}`)

const total = npass + fails.length
console.log(`一致 ${npass} / 共 ${total}`)
if (extra.length) console.log(`分包内 mp3 总数 ${walk(PKG).length}，其中多余 ${extra.length}`)

if (fails.length) {
  console.log('\n失败项：')
  for (const f of fails) console.log('  ✗ ' + f)
  console.log('\n修复：npm run encode-audio')
  process.exit(1)
}
console.log('✓ 生成产物与游戏分包完全一致')
