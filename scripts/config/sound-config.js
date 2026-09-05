/**
 * sound-config.js - 音效资源配置（喵星奇缘）
 *
 * 所有音效均为「管弦乐 + 民谣」风格的程序化合成成品（非采样库），
 * 由 tools/audio/ 下的合成管线生成，部署到 subpackages/sound/。
 *
 * 使用方式：
 *   import { SOUNDS, SOUND_CONFIG, SCENE_BGM, getSoundPath, getSceneBGM, playBGM, playSFX } from './sound-config.js'
 *   playBGM(getSceneBGM('town'))      // 进入城镇时
 *   playSFX('ui_click')               // 按钮点击
 */

const BGM_DIR = 'subpackages/sound/game_bgm/'
const SFX_DIR = 'subpackages/sound/game_sfx/'

// ============================================================
// 音效文件路径配置（音效ID → 文件路径）。null = 暂无资源（不会播放）。
// ============================================================
export const SOUNDS = {
  // ==================== 背景音乐 ====================
  bgm_title:      BGM_DIR + 'bgm_menu.mp3',        // 标题画面（复用 menu）
  bgm_menu:       BGM_DIR + 'bgm_menu.mp3',        // 菜单界面（D 多利亚，宁静神秘）
  bgm_town:       BGM_DIR + 'bgm_town.mp3',        // 小镇/主城（G 大调民谣）
  bgm_explore:    BGM_DIR + 'bgm_explore.mp3',     // 野外/探索（D 大调）
  bgm_grassland:  BGM_DIR + 'bgm_grassland.mp3',    // 草原副本（C 大调五声，明亮欢快）
  bgm_tower:      BGM_DIR + 'bgm_boss.mp3',        // 塔防小游戏（复用旧 boss 曲，激烈）
  bgm_battle:     BGM_DIR + 'bgm_battle.mp3',       // 普通战斗（E 小调）
  bgm_boss:       BGM_DIR + 'bgm_boss.mp3',        // 旧 BOSS 曲（C 小调，教堂式压迫）
  bgm_victory:    BGM_DIR + 'bgm_victory.mp3',      // 胜利（C 大调，三段落凯旋）

  // ==================== 副本专属 BGM（每个副本一首，不再互相复用） ====================
  bgm_magic_tower:   BGM_DIR + 'bgm_magic_tower.mp3',   // 魔法塔（A 小调，水晶闪烁）
  bgm_merchant_town: BGM_DIR + 'bgm_merchant_town.mp3', // 商人镇（D 多利亚，异域集市）
  bgm_ancient_ruins: BGM_DIR + 'bgm_ancient_ruins.mp3', // 远古遗迹（E 弗里几亚，庄严古老）
  bgm_void_mist:     BGM_DIR + 'bgm_void_mist.mp3',     // 虚空迷雾（D 小调，阴森压抑）
  // ==================== BOSS 专属 BGM：每个 BOSS 一首，互不复用 ====================
  //   曲目 id 与 scripts/data/boss-bgm.js 的映射表一一对应（三方一致的唯一事实源）。
  //   field-scene._updateBossBGM() 按 BOSS 距离切歌，battle-scene.init() 是兜底路径。
  bgm_boss_healer:   BGM_DIR + 'bgm_boss_healer.mp3',   // ①迷途的治愈猫（PvZ 僵尸博士风格，120BPM 永动 16 分）
  bgm_boss_crystal:  BGM_DIR + 'bgm_boss_crystal.mp3',  // ②水晶法师（钟琴 + 机械钟表，无鼓组）
  bgm_boss_merchant: BGM_DIR + 'bgm_boss_merchant.mp3', // ③黑金奸商（3/4 市集圆舞曲，D 弗里几亚属）
  bgm_boss_warden:   BGM_DIR + 'bgm_boss_warden.mp3',   // ④远古守望者（铜管众赞歌 + 定音鼓，96BPM）
  bgm_boss_void:     BGM_DIR + 'bgm_boss_void.mp3',     // ⑤虚空之主（半音上行低音，前 8 小节无鼓）
  bgm_boss_darkcat:  BGM_DIR + 'bgm_boss_darkcat.mp3',  // ⑥暗影猫王（八音盒摇篮曲 + 三全音）

  // ==================== UI 交互音效 ====================
  ui_click:      SFX_DIR + 'ui/ui_click.mp3',       // 按钮点击（木质短促）
  ui_confirm:    SFX_DIR + 'ui/ui_confirm.mp3',     // 确认（上行纯五度）
  ui_cancel:     SFX_DIR + 'ui/ui_cancel.mp3',      // 取消/返回（下行纯四度）
  ui_popup:      SFX_DIR + 'ui/ui_popup.mp3',      // 弹窗打开（轻柔 whoosh + 铃）
  ui_error:      SFX_DIR + 'ui/ui_error.mp3',       // 操作错误（小二度不协和）
  ui_success:    SFX_DIR + 'ui/ui_success.mp3',     // 操作成功（明亮上行三音）
  dmg_crit:      SFX_DIR + 'ui/dmg_crit.mp3',       // 暴击飘字（极短高频 ping）
  dmg_heal:      SFX_DIR + 'ui/dmg_heal.mp3',       // 治疗飘字（柔和上行双音）

  // 背包/装备操作（复用 UI 音色，语义对齐：装上=确认、卸下=取消、使用=成功）
  ui_equip:      SFX_DIR + 'ui/ui_confirm.mp3',     // 装备穿上
  ui_unequip:    SFX_DIR + 'ui/ui_cancel.mp3',      // 装备卸下
  ui_use:        SFX_DIR + 'ui/ui_success.mp3',     // 使用消耗品

  // ==================== 战斗技能（主动释放）====================
  cast_fireball:    SFX_DIR + 'battle/cast_fireball.mp3',    // 火球术（蓄力上涌 + 爆燃）
  cast_ice_shard:   SFX_DIR + 'battle/cast_ice_shard.mp3',   // 冰晶术（非谐铃 + 碎裂）
  cast_lightning:   SFX_DIR + 'battle/cast_lightning.mp3',    // 雷电术（极快撕裂放电）
  cast_meteor:      SFX_DIR + 'battle/cast_meteor.mp3',       // 陨石术（长蓄力 + 轰鸣坠落 + 爆炸）
  cast_heal:        SFX_DIR + 'battle/cast_heal.mp3',         // 治疗（艾米治愈冲击：上行琶音 + 铃 + 铺底）
  cast_blade_storm: SFX_DIR + 'battle/cast_blade_storm.mp3',  // 剑气风暴（旋转风声 + 多段刃鸣 + 收束重击）
  cast_buff:        SFX_DIR + 'battle/cast_buff.mp3',         // 增益（艾米 BUFF：五声上行琶音 + 和声）
  battle_skill:     SFX_DIR + 'battle/battle_skill.mp3',       // 通用技能释放

  // ==================== 技能命中反馈 ====================
  hit_fireball:   SFX_DIR + 'battle/hit_fireball.mp3',   // 火球命中（爆炸）
  hit_ice_shard:  SFX_DIR + 'battle/hit_ice_shard.mp3',  // 冰晶命中（碎裂 + 铃）
  hit_lightning:  SFX_DIR + 'battle/hit_lightning.mp3',  // 雷电命中（撕裂）
  hit_meteor:     SFX_DIR + 'battle/hit_meteor.mp3',     // 陨石命中（大爆炸）

  // ==================== 普攻 / 打击 ====================
  attack_melee:    SFX_DIR + 'battle/attack_melee.mp3',    // 近战普攻（挥击 + 命中）
  attack_range:    SFX_DIR + 'battle/attack_range.mp3',    // 远程普攻（弓弦 + 箭矢破空）
  battle_attack:   SFX_DIR + 'battle/battle_attack.mp3',   // 通用攻击
  battle_hit:      SFX_DIR + 'battle/battle_hit.mp3',      // 通用命中反馈（短脆）
  battle_sword:    SFX_DIR + 'battle/battle_sword_slash.mp3', // 剑击（锐利挥击 + 刃鸣 + 命中）
  hit_crit:        SFX_DIR + 'battle/hit_crit.mp3',        // 暴击（重低频 + 金属爆响 + 宽声像）
  hit_block:       SFX_DIR + 'battle/hit_block.mp3',       // 格挡（金属对撞 + 刮擦，无肉感）
  battle_explosion:SFX_DIR + 'battle/battle_explosion.mp3',// 爆炸

  // ==================== 怪物 ====================
  monster_hit:   SFX_DIR + 'monster/monster_hit.mp3',   // 怪物受击（肉感低通）
  monster_death: SFX_DIR + 'monster/monster_death.mp3',  // 怪物死亡
  monster_spawn: SFX_DIR + 'monster/monster_spawn.mp3',  // 怪物生成（低频上扫 + 不祥）
  boss_death:    SFX_DIR + 'monster/boss_death.mp3',     // BOSS 死亡（长尾下行）

  // ==================== 奖励 / 成就 ====================
  reward_coin:         SFX_DIR + 'reward/reward_coin.mp3',         // 金币
  reward_levelup:      SFX_DIR + 'reward/reward_levelup.mp3',      // 升级
  reward_achievement:  SFX_DIR + 'reward/reward_achievement.mp3',  // 成就（短号角 + 铃）
  reward_get_item:     SFX_DIR + 'reward/reward_get_item.mp3',     // 获得物品

  // ==================== 战场 / 流程 ====================
  wave_start:    SFX_DIR + 'system/wave_start.mp3',    // 波次开始（号角 + 战鼓）
  wave_complete: SFX_DIR + 'system/wave_complete.mp3', // 波次完成（上行三音 + 铃）
  game_victory:  BGM_DIR + 'bgm_victory.mp3',          // 胜利（复用 victory BGM 段落）
  game_defeat:   SFX_DIR + 'system/game_defeat.mp3',   // 失败（下行低沉 + 消逝）
  char_jump:     SFX_DIR + 'system/char_jump.mp3',     // 跳跃（短促上扫）
  char_land:     SFX_DIR + 'system/char_land.mp3',     // 落地（轻冲击 + 脚步）

  // ==================== 倒计时（暂无资源，留接口）====================
  // ui_countdown: null,
}

// ============================================================
// 场景 → BGM 自动映射（进入场景时由 AudioManager.setScene 调用）
// ============================================================
export const SCENE_BGM = {
  'main-menu': 'bgm_menu',
  'town':      'bgm_town',
  'map':       'bgm_explore',
  'field':     'bgm_grassland',   // 草原风格副本
  'battle':    'bgm_battle',
  'collection': 'bgm_town',
  'tower':     'bgm_tower',
}

// ============================================================
// 技能 ID → 释放音效（heroes.js 里的 skill.id）
//   物理近战 → attack_melee / battle_sword（重击类更厚）
//   元素法术 → 对应元素 cast_*
//   治疗/增益 → cast_heal / cast_buff
// ============================================================
export const SKILL_SFX = {
  // —— 物理近战 ——
  slash:          'attack_melee',
  staff_strike:   'attack_melee',
  cat_paw:        'attack_melee',
  shadow_touch:   'attack_melee',
  punch:          'attack_melee',
  smash:          'battle_sword',
  shield_bash:    'battle_sword',
  shield_bash_xb: 'battle_sword',
  counter:        'battle_sword',
  // —— 物理远程 ——
  coin_throw:     'attack_range',
  // —— 大招 ——
  blade_storm:    'cast_blade_storm',
  dark_nova:      'cast_meteor',
  // —— 元素法术 ——
  fireball:       'cast_fireball',
  ice_shard:      'cast_ice_shard',
  thunder:        'cast_lightning',
  shadow_ball:    'cast_fireball',    // 暗影球：低沉爆燃质感最贴近
  curse:          'cast_ice_shard',   // 诅咒：非谐铃声的不祥感
  drain:          'cast_heal',        // 吸命：柔和能量抽取
  // —— 治疗 ——
  heal_light:     'cast_heal',
  heal_strike:    'cast_heal',
  // —— 增益 / 防御 ——
  war_cry:        'cast_buff',
  berserk:        'cast_buff',
  holy_shield:    'cast_buff',
  gold_shield:    'cast_buff',
  fortune:        'cast_buff',
  taunt:          'cast_buff',
  iron_wall:      'cast_buff',
  guard:          'cast_buff',
  mana_shield:    'cast_buff',
}

// 技能 ID → 命中音效（投射物/AoE 落地时播放；未列出则回落到通用命中）
export const SKILL_HIT_SFX = {
  fireball:    'hit_fireball',
  shadow_ball: 'hit_fireball',
  ice_shard:   'hit_ice_shard',
  curse:       'hit_ice_shard',
  thunder:     'hit_lightning',
  dark_nova:   'hit_meteor',
  blade_storm: 'hit_crit',
}

// ============================================================
// 音效优先级（用于语音抢占 / 并发上限）
//  优先级高者可在达到最大并发时抢占低优先级实例。
//  1=普通(UI/飘字)  2=打击/命中/爆炸  3=重要(胜利/失败/成就/波次)
// ============================================================
export const SFX_PRIORITY = {
  ui_click: 1, ui_confirm: 1, ui_cancel: 1, ui_popup: 1, ui_error: 1, ui_success: 1,
  ui_equip: 1, ui_unequip: 1, ui_use: 1,
  dmg_crit: 1, dmg_heal: 1,
  attack_melee: 2, attack_range: 2, battle_attack: 2, battle_hit: 2,
  battle_sword: 2, hit_crit: 3, hit_block: 2,
  cast_fireball: 2, cast_ice_shard: 2, cast_lightning: 2, cast_meteor: 2,
  cast_heal: 2, cast_blade_storm: 2, cast_buff: 2, battle_skill: 2,
  hit_fireball: 2, hit_ice_shard: 2, hit_lightning: 2, hit_meteor: 2,
  battle_explosion: 3,
  monster_hit: 2, monster_death: 2, monster_spawn: 2, boss_death: 3,
  reward_coin: 2, reward_levelup: 2, reward_achievement: 3, reward_get_item: 2,
  wave_start: 3, wave_complete: 2, game_victory: 3, game_defeat: 3,
  char_jump: 1, char_land: 1,
}

// ============================================================
// 音量 / 全局配置
// ============================================================
export const SOUND_CONFIG = {
  bgm: {
    volume: 0.6,        // BGM 音量 0.0 ~ 1.0
    loop: true,         // 默认循环
    crossfade: 1.4,     // 切换 BGM 时的淡入淡出时长（秒）
  },
  sfx: {
    volume: 0.85,       // 音效音量
    maxInstances: 8,    // 同时播放的 SFX 实例上限（超过则按优先级抢占）
    defaultPriority: 2,
  },
  muted: false,         // 是否静音（设置面板可一键关闭）
}

// ============================================================
// 辅助函数
// ============================================================
export function hasSound(soundId) {
  return SOUNDS[soundId] !== undefined && SOUNDS[soundId] !== null
}

export function getSoundPath(soundId) {
  return SOUNDS[soundId] || null
}

export function getSceneBGM(sceneName) {
  return SCENE_BGM[sceneName] || null
}

export function getPriority(soundId) {
  return SFX_PRIORITY[soundId] !== undefined ? SFX_PRIORITY[soundId] : SOUND_CONFIG.sfx.defaultPriority
}

/** 技能 ID → 释放音效 ID（找不到时按技能类型兜底） */
export function getSkillSFX(skillId, skillType) {
  if (skillId && SKILL_SFX[skillId]) return SKILL_SFX[skillId]
  switch (skillType) {
    case 'heal':        return 'cast_heal'
    case 'attack_heal': return 'cast_heal'
    case 'buff':        return 'cast_buff'
    case 'debuff':      return 'cast_buff'
    case 'magic':       return 'battle_skill'
    case 'attack':      return 'attack_melee'
    default:            return 'battle_skill'
  }
}

/** 技能 ID → 命中音效 ID（未配置则回落到通用命中） */
export function getSkillHitSFX(skillId) {
  return (skillId && SKILL_HIT_SFX[skillId]) || 'battle_hit'
}
