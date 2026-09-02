/**
 * deploy_audio.js —— 把 tools/audio/out/mp3 下的生成音频部署到游戏分包
 *
 * 约定：
 *   BGM  -> subpackages/sound/game_bgm/<name>.mp3
 *   SFX  -> subpackages/sound/game_sfx/<cat>/<name>.mp3  (cat: ui/battle/monster/reward/system)
 *
 * 同时删除旧的"玩具级"音频文件，避免分包里出现两版、以及体积浪费。
 *
 * 用法：node tools/audio/deploy_audio.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')              // meow-star-native/
const OUT_MP3 = path.join(ROOT, 'tools', 'audio', 'out', 'mp3')
const PKG_BGM = path.join(ROOT, 'subpackages', 'sound', 'game_bgm')
const PKG_SFX = path.join(ROOT, 'subpackages', 'sound', 'game_sfx')

const BGM = ['bgm_menu', 'bgm_town', 'bgm_explore', 'bgm_grassland',
             'bgm_battle', 'bgm_boss', 'bgm_victory']

const SFX = {
  ui:      ['ui_click', 'ui_confirm', 'ui_cancel', 'ui_popup', 'ui_error', 'ui_success',
            'dmg_crit', 'dmg_heal'],
  battle:  ['attack_melee', 'attack_range', 'battle_attack', 'battle_hit', 'battle_sword_slash',
            'hit_crit', 'hit_block', 'cast_fireball', 'cast_ice_shard', 'cast_lightning',
            'cast_meteor', 'cast_heal', 'cast_blade_storm', 'cast_buff', 'battle_skill',
            'hit_fireball', 'hit_ice_shard', 'hit_lightning', 'hit_meteor', 'battle_explosion'],
  monster: ['monster_hit', 'monster_death', 'monster_spawn', 'boss_death'],
  reward:  ['reward_coin', 'reward_levelup', 'reward_achievement', 'reward_get_item'],
  system:  ['wave_start', 'wave_complete', 'game_defeat', 'char_jump', 'char_land'],
}

// 需要清退的旧玩具级文件（与上面新文件重名或已无意义）
const OLD_BGM_TO_REMOVE = [
  'fantasy_menu.mp3', 'town_village.mp3', 'fantasy_explore.mp3', 'grassland.mp3',
  'fantasy_battle.mp3', 'fantasy_boss.mp3', 'fantasy_victory.mp3',
  'brainiac_maniac.mp3', 'brainiac_maniac_bar.mp3',
]

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }) }
function cp(src, dst) {
  fs.copyFileSync(src, dst)
  const sz = fs.statSync(dst).size
  return sz
}

let copied = 0, missing = [], bytes = 0

ensureDir(PKG_BGM)
for (const name of BGM) {
  const src = path.join(OUT_MP3, name + '.mp3')
  if (!fs.existsSync(src)) { missing.push(src); continue }
  bytes += cp(src, path.join(PKG_BGM, name + '.mp3'))
  copied++
}

for (const [cat, names] of Object.entries(SFX)) {
  const dir = path.join(PKG_SFX, cat)
  ensureDir(dir)
  for (const name of names) {
    const src = path.join(OUT_MP3, 'sfx', name + '.mp3')
    if (!fs.existsSync(src)) { missing.push(src); continue }
    bytes += cp(src, path.join(dir, name + '.mp3'))
    copied++
  }
}

// 清退旧 BGM 文件
let removed = 0
for (const f of OLD_BGM_TO_REMOVE) {
  const p = path.join(PKG_BGM, f)
  if (fs.existsSync(p)) { fs.unlinkSync(p); removed++ }
}

console.log(`部署完成：复制 ${copied} 个文件，删除旧文件 ${removed} 个，合计 ${(bytes/1024/1024).toFixed(2)} MB`)
if (missing.length) {
  console.warn('⚠️ 以下源文件缺失（跳过）：')
  missing.forEach(m => console.warn('  ' + m))
}
