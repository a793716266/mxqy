/**
 * BOSS 专属背景音乐映射表（单一事实源）
 *
 * ★ 需求：每个 BOSS 有**自己的**专属音乐，不能所有 BOSS 共用一首。
 *
 * ★ 为什么映射表要独立成文件、而不是散在各处：
 *   1) field-scene（副本实时战斗，玩家真正走的那条路）与 battle-scene
 *      （回合制战斗，兜底路径）都要读它，两处必须一致；
 *   2) 以后新增 BOSS 只改这里 + build_bgm.py 加一首曲子，不用翻场景代码；
 *   3) 回归脚本 devtools/verify_dungeon_bgm.mjs 直接 require 它做交叉校验
 *      —— 断言「每个 BOSS 的曲子互不相同」「映射表里的曲目都在 SOUNDS 里注册了」，
 *      防止出现"代码看着对、玩家听到的是同一首"。
 *
 * ⚠️ 曾经犯过的错（2026-09-05）：field-scene 里硬编码 'bgm_the_king'，
 *    结果 5 个副本 BOSS + 洞穴 BOSS 全部放同一首。回归脚本当时只断言
 *    "BOSS 靠近会不会切歌"，没断言"切到的是哪一首"，所以全绿但需求没满足。
 *    → 断言必须回答"玩家听到的是什么"，不是"代码有没有执行"。
 */

// BOSS 敌人 id -> 专属 BGM 曲目 id
//   曲目 id 必须与 scripts/config/sound-config.js 的 SOUNDS 表、
//   以及 tools/audio/build_bgm.py 的 TRACKS 表三方一致。
const BOSS_BGM = {
  // 第一章·草原副本：迷途的治愈猫（艾米 Boss 形态）
  //   → PvZ 僵尸博士 "Brainiac Maniac" 那种感觉（用户点名喜欢）：
  //     120BPM、永不停歇的 16 分音符电钢 ostinato、底鼓 1/1.75/3.5 拍、
  //     军鼓打 2、4 反拍。疯狂科学家的欢脱，不是交响史诗。
  lost_healer_cat: 'bgm_boss_healer',

  // 第二章·魔法塔：水晶法师（安妮 Boss 形态）
  //   → 水晶/机械钟表：钟琴 + 钢片琴 + 竖琴，无鼓组，靠铃鼓与沙锤走"滴答"律动
  crystal_mage: 'bgm_boss_crystal',

  // 第三章·商人镇：黑金奸商（钱多多 Boss 形态）
  //   → 3/4 拍的市集圆舞曲：鲁特琴 + 木笛 + 手鼓，油腻的下行半音贝斯
  corrupt_merchant: 'bgm_boss_merchant',

  // 第四章·远古遗迹：远古守望者（小贝 Boss 形态）
  //   → 祭祀：低音铜管 + 定音鼓 + 人声 'oo'，缓慢、不可逆的压迫
  ancient_warden: 'bgm_boss_warden',

  // 终章·虚空迷雾：虚空之主
  //   → 无鼓组，只有 pad + 弦乐震音 + 半音上行低音；最后一段才放太鼓
  void_mist_lord: 'bgm_boss_void',

  // 洞穴：暗影猫王
  //   → 八音盒摇篮曲被三全音污染：甜美的旋律 + 邪恶的和声
  dark_cat_king: 'bgm_boss_darkcat',
}

// 兜底：出现没登记过的 BOSS 时至少要有 BOSS 味道，并打日志便于发现漏登记
const DEFAULT_BOSS_BGM = 'bgm_boss_healer'

/**
 * 取某个 BOSS 的专属 BGM 曲目 id。
 * @param {string} enemyId 怪物 id（monster.enemyId / area.bossEnemy）
 * @returns {string} 曲目 id
 */
function getBossBGM(enemyId) {
  if (enemyId && Object.prototype.hasOwnProperty.call(BOSS_BGM, enemyId)) {
    return BOSS_BGM[enemyId]
  }
  if (enemyId) {
    console.warn('[boss-bgm] BOSS 未登记专属 BGM，回退到默认：', enemyId)
  }
  return DEFAULT_BOSS_BGM
}

module.exports = { BOSS_BGM, DEFAULT_BOSS_BGM, getBossBGM }
