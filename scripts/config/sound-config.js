/**
 * sound-config.js - 音效资源配置
 *
 * 使用方式：
 *   import { SOUND_CONFIG, SOUNDS, playBGM, playSFX } from './sound-config.js'
 *   playBGM('bgm_town')
 *   playSFX('ui_click')
 */

// ============================================================
// 音效文件路径配置（音效ID → 文件路径）
// ============================================================
export const SOUNDS = {
  // ==================== 背景音乐 ====================
  bgm_title:    null,                         // 标题画面（待制作）
  bgm_town:      'subpackages/sound/game_bgm/town_village.mp3',       // 小镇/主城
  bgm_explore:   'subpackages/sound/game_bgm/fantasy_explore.mp3',    // 野外/探索
  bgm_tower:     'subpackages/sound/game_bgm/brainiac_maniac_bar.mp3',// 塔防战斗
  bgm_battle:    'subpackages/sound/game_bgm/fantasy_battle.mp3',     // 普通战斗
  bgm_boss:      'subpackages/sound/game_bgm/fantasy_boss.mp3',        // BOSS战
  bgm_victory:   'subpackages/sound/game_bgm/fantasy_victory.mp3',    // 胜利
  bgm_menu:      'subpackages/sound/game_bgm/fantasy_menu.mp3',       // 菜单界面

  // ==================== UI 交互音效 ====================
  ui_click:      'subpackages/sound/game_sfx/ui/ui_click.mp3',       // 按钮点击
  ui_confirm:    'subpackages/sound/game_sfx/ui/ui_confirm.mp3',     // 确认
  ui_cancel:     'subpackages/sound/game_sfx/ui/ui_cancel.mp3',      // 取消/返回
  ui_popup:      'subpackages/sound/game_sfx/ui/ui_popup.mp3',       // 弹窗打开
  ui_error:      null,                                               // 操作错误（待制作）
  ui_success:    null,                                               // 操作成功（待制作）
  ui_countdown:  null,                                               // 倒计时（待制作）

  // ==================== 战斗技能音效 ====================
  // 主动释放
  cast_ice_shard:   null,    // 冰晶术蓄力（待制作）
  cast_fireball:    null,    // 火球术蓄力（待制作）
  cast_lightning:   null,    // 雷电术蓄力（待制作）
  cast_meteor:      null,    // 陨石术蓄力（待制作）
  battle_skill:     'subpackages/sound/game_sfx/battle/battle_skill.mp3', // 战斗技能释放

  // 命中反馈
  hit_ice_shard:    null,    // 冰晶术命中（待制作）
  hit_fireball:     null,    // 火球术命中（待制作）
  hit_lightning:    null,    // 雷电术命中（待制作）
  hit_meteor:       null,    // 陨石术命中（待制作）
  battle_explosion: 'subpackages/sound/game_sfx/battle/battle_explosion.mp3', // 爆炸

  // ==================== 普攻音效 ====================
  attack_melee:    null,    // 近战普攻（待制作）
  attack_range:    null,    // 远程普攻（待制作）
  battle_attack:   'subpackages/sound/game_sfx/battle/battle_attack.mp3',  // 战斗攻击
  battle_hit:      'subpackages/sound/game_sfx/battle/battle_hit.mp3',    // 命中反馈
  battle_sword:    'subpackages/sound/game_sfx/battle/battle_sword_slash.mp3', // 剑击

  // ==================== 怪物音效 ====================
  monster_death:   null,    // 怪物死亡（待制作）
  monster_hit:     null,    // 怪物受击（待制作）
  monster_spawn:   null,    // 怪物生成（待制作）
  boss_death:      null,    // BOSS死亡（待制作）

  // ==================== 奖励/成就 ====================
  reward_coin:      'subpackages/sound/game_sfx/reward/reward_coin.mp3',      // 获得金币
  reward_levelup:   'subpackages/sound/game_sfx/reward/reward_levelup.mp3',   // 升级
  reward_achievement: 'subpackages/sound/game_sfx/reward/reward_achievement.mp3', // 成就获得
  reward_get_item:  null,    // 获得物品（待制作）

  // ==================== 战场环境 ====================
  wave_start:    null,    // 波次开始（待制作）
  wave_complete: null,    // 波次完成（待制作）
  game_victory:  'subpackages/sound/game_bgm/fantasy_victory.mp3', // 胜利（复用BGM）
  game_defeat:   null,    // 失败（待制作）

  // ==================== 伤害飘字（可选）====================
  dmg_crit:  null,    // 暴击飘字（待制作）
  dmg_heal:  null,    // 治疗飘字（待制作）

  // ==================== 角色（可选）====================
  char_jump: null,    // 跳跃（待制作）
  char_land: null,    // 落地（待制作）
}

// ============================================================
// 音量配置
// ============================================================
export const SOUND_CONFIG = {
  bgm: {
    volume: 0.6,      // BGM 音量 0.0 ~ 1.0
    loop: true,       // 默认循环播放
  },
  sfx: {
    volume: 0.8,      // 音效音量
    maxInstances: 4,   // 最多同时播放几个同类音效（防止重叠太吵）
  },
  // 是否静音（上线时可一键关闭）
  muted: false,
}

// ============================================================
// 辅助函数：判断音效文件是否存在
// ============================================================
export function hasSound(soundId) {
  return SOUNDS[soundId] !== undefined && SOUNDS[soundId] !== null
}

// ============================================================
// 辅助函数：根据ID获取文件路径
// ============================================================
export function getSoundPath(soundId) {
  return SOUNDS[soundId] || null
}
