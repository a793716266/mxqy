/**
 * asset-manager.js - 资源管理器
 */

export class AssetManager {
  constructor() {
    this.images = {}
    this.loaded = false
  }

  // 加载单张图片
  loadImage(key, path) {
    return new Promise((resolve, reject) => {
      try {
        const img = wx.createImage()
        img.onload = () => {
          this.images[key] = img
          resolve(img)
        }
        img.onerror = (err) => {
          console.error(`[AssetManager] 加载失败: ${path}`, err)
          resolve(null) // 失败也继续
        }
        img.src = path
      } catch (error) {
        console.error(`[AssetManager] 创建图片失败: ${key}`, error)
        resolve(null)
      }
    })
  }

  // 批量加载
  async loadAll(assets) {
    const promises = []
    for (const [key, path] of Object.entries(assets)) {
      promises.push(this.loadImage(key, path))
    }
    await Promise.all(promises)
    this.loaded = true
    console.log(`[AssetManager] 加载完成: ${Object.keys(this.images).length} 张图片`)
  }

  // 获取图片
  get(key) {
    return this.images[key]
  }

  // 检查是否已加载
  isLoaded() {
    return this.loaded
  }
}

// 分包路径前缀
const BATTLE_PKG = 'subpackages/battle/'

// 资源路径定义
export const ASSETS = {
  // 野外探索地图
  FIELD_GRASSLAND: 'images/map/grassland.png',
  FIELD_FOREST: 'images/map/grassland.png', // 暂时使用草地地图
  FIELD_CAVE: 'images/map/grassland.png', // 暂时使用草地地图
  
  // 战斗背景（battle分包）
  BG_GRASSLAND: BATTLE_PKG + 'images/backgrounds/bg_grassland.png',
  BG_FOREST: BATTLE_PKG + 'images/backgrounds/bg_forest.png',
  BG_CAVE: BATTLE_PKG + 'images/backgrounds/bg_cave.png',
  BG_TOWN: 'images/map/village.jpeg',
  BG_BOSS: BATTLE_PKG + 'images/backgrounds/bg_boss.png',
  
  // 主角
  HERO_ZHENBAO: 'images/characters/hero_zhenbao.png',
  HERO_LIXIAOBAO: 'images/characters/hero_lixiaobao.png',
  
  // 臻宝动画帧 - 统一放在 zhenbao/ 目录下管理
  // walk: 10帧, idle: 5帧, slash: 20帧（battle分包）
  HERO_ZHENBAO_WALK_01: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_01.png',
  HERO_ZHENBAO_WALK_02: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_02.png',
  HERO_ZHENBAO_WALK_03: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_03.png',
  HERO_ZHENBAO_WALK_04: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_04.png',
  HERO_ZHENBAO_WALK_05: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_05.png',
  HERO_ZHENBAO_WALK_06: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_06.png',
  HERO_ZHENBAO_WALK_07: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_07.png',
  HERO_ZHENBAO_WALK_08: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_08.png',
  HERO_ZHENBAO_WALK_09: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_09.png',
  HERO_ZHENBAO_WALK_10: BATTLE_PKG + 'images/characters_anim/zhenbao/walk/walk_10.png',

  HERO_ZHENBAO_IDLE_01: BATTLE_PKG + 'images/characters_anim/zhenbao/idle/idle_01.png',
  HERO_ZHENBAO_IDLE_02: BATTLE_PKG + 'images/characters_anim/zhenbao/idle/idle_02.png',
  HERO_ZHENBAO_IDLE_03: BATTLE_PKG + 'images/characters_anim/zhenbao/idle/idle_03.png',
  HERO_ZHENBAO_IDLE_04: BATTLE_PKG + 'images/characters_anim/zhenbao/idle/idle_04.png',
  HERO_ZHENBAO_IDLE_05: BATTLE_PKG + 'images/characters_anim/zhenbao/idle/idle_05.png',

  // zhenbao 斩击攻击帧（13帧）
  HERO_ZHENBAO_SLASH_01: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_01.png',
  HERO_ZHENBAO_SLASH_02: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_02.png',
  HERO_ZHENBAO_SLASH_03: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_03.png',
  HERO_ZHENBAO_SLASH_04: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_04.png',
  HERO_ZHENBAO_SLASH_05: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_05.png',
  HERO_ZHENBAO_SLASH_06: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_06.png',
  HERO_ZHENBAO_SLASH_07: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_07.png',
  HERO_ZHENBAO_SLASH_08: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_08.png',
  HERO_ZHENBAO_SLASH_09: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_09.png',
  HERO_ZHENBAO_SLASH_10: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_10.png',
  HERO_ZHENBAO_SLASH_11: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_11.png',
  HERO_ZHENBAO_SLASH_12: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_12.png',
  HERO_ZHENBAO_SLASH_13: BATTLE_PKG + 'images/characters_anim/zhenbao/slash/zhenbao_slash_13.png',
  
  // lixiaobao: 8帧walk + 2帧idle（battle分包）
  HERO_LIXIAOBAO_WALK_0: BATTLE_PKG + 'images/characters_anim/transparent/walk/lixiaobao_walk_0.png',
  HERO_LIXIAOBAO_WALK_1: BATTLE_PKG + 'images/characters_anim/transparent/walk/lixiaobao_walk_1.png',
  HERO_LIXIAOBAO_WALK_2: BATTLE_PKG + 'images/characters_anim/transparent/walk/lixiaobao_walk_2.png',
  HERO_LIXIAOBAO_WALK_3: BATTLE_PKG + 'images/characters_anim/transparent/walk/lixiaobao_walk_3.png',
  HERO_LIXIAOBAO_WALK_4: BATTLE_PKG + 'images/characters_anim/transparent/walk/lixiaobao_walk_4.png',
  HERO_LIXIAOBAO_WALK_5: BATTLE_PKG + 'images/characters_anim/transparent/walk/lixiaobao_walk_5.png',
  HERO_LIXIAOBAO_WALK_6: BATTLE_PKG + 'images/characters_anim/transparent/walk/lixiaobao_walk_6.png',
  HERO_LIXIAOBAO_WALK_7: BATTLE_PKG + 'images/characters_anim/transparent/walk/lixiaobao_walk_7.png',
  HERO_LIXIAOBAO_IDLE_0: BATTLE_PKG + 'images/characters_anim/transparent/idle/lixiaobao_idle_0.png',
  HERO_LIXIAOBAO_IDLE_1: BATTLE_PKG + 'images/characters_anim/transparent/idle/lixiaobao_idle_1.png',
  
  // 猫咪主角动画（探索地图用，减帧版）
  // idle: 8帧静止动画
  CAT_IDLE_01: BATTLE_PKG + 'images/characters_anim/cat_idle/idle_01.png',
  CAT_IDLE_02: BATTLE_PKG + 'images/characters_anim/cat_idle/idle_02.png',
  CAT_IDLE_03: BATTLE_PKG + 'images/characters_anim/cat_idle/idle_03.png',
  CAT_IDLE_04: BATTLE_PKG + 'images/characters_anim/cat_idle/idle_04.png',
  CAT_IDLE_05: BATTLE_PKG + 'images/characters_anim/cat_idle/idle_05.png',
  CAT_IDLE_06: BATTLE_PKG + 'images/characters_anim/cat_idle/idle_06.png',
  CAT_IDLE_07: BATTLE_PKG + 'images/characters_anim/cat_idle/idle_07.png',
  CAT_IDLE_08: BATTLE_PKG + 'images/characters_anim/cat_idle/idle_08.png',
  
  // walk: 12帧移动动画
  CAT_WALK_01: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_01.png',
  CAT_WALK_02: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_02.png',
  CAT_WALK_03: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_03.png',
  CAT_WALK_04: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_04.png',
  CAT_WALK_05: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_05.png',
  CAT_WALK_06: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_06.png',
  CAT_WALK_07: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_07.png',
  CAT_WALK_08: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_08.png',
  CAT_WALK_09: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_09.png',
  CAT_WALK_10: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_10.png',
  CAT_WALK_11: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_11.png',
  CAT_WALK_12: BATTLE_PKG + 'images/characters_anim/cat_walk/walk_12.png',
  
  // 猫咪队员
  CAT_AMY: 'images/cats/team/cat_amy.png',
  CAT_ANNIE: 'images/cats/team/cat_annie.png',
  CAT_QIANDUODUO: 'images/cats/team/cat_qianduoduo.png',
  CAT_XIAOBEI: 'images/cats/team/cat_xiaobei.png',
  
  // 猫咪图鉴（前10只）
  CAT_01: 'images/cats/collection/cat_01_tabbie.png',
  CAT_02: 'images/cats/collection/cat_02_persian.png',
  CAT_03: 'images/cats/collection/cat_03_siamese.png',
  CAT_04: 'images/cats/collection/cat_04_tuxedo.png',
  CAT_05: 'images/cats/collection/cat_05_calico.png',
  CAT_06: 'images/cats/collection/cat_06_russian.png',
  CAT_07: 'images/cats/collection/cat_07_ginger.png',
  CAT_08: 'images/cats/collection/cat_08_british.png',
  CAT_09: 'images/cats/collection/cat_09_bengal.png',
  CAT_10: 'images/cats/collection/cat_10_ragdoll.png',
  
  // UI图标
  UI_ICON_ATTACK: 'images/ui/icon_attack.png',
  UI_ICON_DEFEND: 'images/ui/icon_defend.png',
  UI_ICON_MAGIC: 'images/ui/icon_magic.png',
  UI_ICON_HEAL: 'images/ui/icon_heal.png',
  UI_ICON_ITEM: 'images/ui/icon_item.png',
  UI_ICON_SETTINGS: 'images/ui/icon_settings.png',
  UI_ICON_MENU: 'images/ui/icon_menu.png',
  UI_ICON_BACK: 'images/ui/icon_back.png',
  UI_ICON_FORWARD: 'images/ui/icon_forward.png',
  UI_ICON_SAVE: 'images/ui/icon_save.png',
  UI_ICON_PAW: 'images/ui/icon_cat_paw.png',
  UI_ICON_STAR: 'images/ui/icon_star.png',
  UI_ICON_GOLD: 'images/ui/icon_coin.png',
  UI_ICON_HP: 'images/ui/icon_hp.png',
  UI_ICON_MP: 'images/ui/icon_mp.png',
  
  // 地图
  MAP_WORLD: 'images/map_world.png',
  
  // 技能特效 - 火球术施法（11帧）
  EFFECT_FIREBALL_CAST_01: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_01.png',
  EFFECT_FIREBALL_CAST_02: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_02.png',
  EFFECT_FIREBALL_CAST_03: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_03.png',
  EFFECT_FIREBALL_CAST_04: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_04.png',
  EFFECT_FIREBALL_CAST_05: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_05.png',
  EFFECT_FIREBALL_CAST_06: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_06.png',
  EFFECT_FIREBALL_CAST_07: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_07.png',
  EFFECT_FIREBALL_CAST_08: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_08.png',
  EFFECT_FIREBALL_CAST_09: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_09.png',
  EFFECT_FIREBALL_CAST_10: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_10.png',
  EFFECT_FIREBALL_CAST_11: BATTLE_PKG + 'images/effects/fireball_cast/fireball_cast_11.png',

  // 技能特效 - 火球术击中（24帧）
  EFFECT_FIREBALL_HIT_01: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_01.png',
  EFFECT_FIREBALL_HIT_02: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_02.png',
  EFFECT_FIREBALL_HIT_03: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_03.png',
  EFFECT_FIREBALL_HIT_04: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_04.png',
  EFFECT_FIREBALL_HIT_05: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_05.png',
  EFFECT_FIREBALL_HIT_06: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_06.png',
  EFFECT_FIREBALL_HIT_07: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_07.png',
  EFFECT_FIREBALL_HIT_08: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_08.png',
  EFFECT_FIREBALL_HIT_09: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_09.png',
  EFFECT_FIREBALL_HIT_10: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_10.png',
  EFFECT_FIREBALL_HIT_11: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_11.png',
  EFFECT_FIREBALL_HIT_12: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_12.png',
  EFFECT_FIREBALL_HIT_13: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_13.png',
  EFFECT_FIREBALL_HIT_14: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_14.png',
  EFFECT_FIREBALL_HIT_15: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_15.png',
  EFFECT_FIREBALL_HIT_16: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_16.png',
  EFFECT_FIREBALL_HIT_17: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_17.png',
  EFFECT_FIREBALL_HIT_18: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_18.png',
  EFFECT_FIREBALL_HIT_19: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_19.png',
  EFFECT_FIREBALL_HIT_20: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_20.png',
  EFFECT_FIREBALL_HIT_21: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_21.png',
  EFFECT_FIREBALL_HIT_22: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_22.png',
  EFFECT_FIREBALL_HIT_23: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_23.png',
  EFFECT_FIREBALL_HIT_24: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_24.png',

  // 技能特效 - 冰晶术施法（8帧）
  EFFECT_ICE_SHARD_CAST_01: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_01.png',
  EFFECT_ICE_SHARD_CAST_02: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_02.png',
  EFFECT_ICE_SHARD_CAST_03: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_03.png',
  EFFECT_ICE_SHARD_CAST_04: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_04.png',
  EFFECT_ICE_SHARD_CAST_05: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_05.png',
  EFFECT_ICE_SHARD_CAST_06: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_06.png',
  EFFECT_ICE_SHARD_CAST_07: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_07.png',
  EFFECT_ICE_SHARD_CAST_08: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_08.png',

  // 技能特效 - 冰晶术击中（11帧）
  EFFECT_ICE_SHARD_HIT_01: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_01.png',
  EFFECT_ICE_SHARD_HIT_02: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_02.png',
  EFFECT_ICE_SHARD_HIT_03: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_03.png',
  EFFECT_ICE_SHARD_HIT_04: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_04.png',
  EFFECT_ICE_SHARD_HIT_05: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_05.png',
  EFFECT_ICE_SHARD_HIT_06: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_06.png',
  EFFECT_ICE_SHARD_HIT_07: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_07.png',
  EFFECT_ICE_SHARD_HIT_08: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_08.png',
  EFFECT_ICE_SHARD_HIT_09: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_09.png',
  EFFECT_ICE_SHARD_HIT_10: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_10.png',
  EFFECT_ICE_SHARD_HIT_11: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_11.png',

  // 史莱姆猫动画（战斗场景敌人）
  // idle: 7帧
  SLIME_CAT_IDLE_1: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_1.png',
  SLIME_CAT_IDLE_2: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_2.png',
  SLIME_CAT_IDLE_3: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_3.png',
  SLIME_CAT_IDLE_4: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_4.png',
  SLIME_CAT_IDLE_5: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_5.png',
  SLIME_CAT_IDLE_6: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_6.png',
  SLIME_CAT_IDLE_7: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_7.png',
  
  // attack: 8帧（减帧版本）
  SLIME_CAT_ATTACK_0008: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0008.png',
  SLIME_CAT_ATTACK_0010: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0010.png',
  SLIME_CAT_ATTACK_0012: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0012.png',
  SLIME_CAT_ATTACK_0014: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0014.png',
  SLIME_CAT_ATTACK_0016: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0016.png',
  SLIME_CAT_ATTACK_0018: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0018.png',
  SLIME_CAT_ATTACK_0020: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0020.png',
  SLIME_CAT_ATTACK_0022: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0022.png',
  
  // skill: 11帧（减帧版本）
  SLIME_CAT_SKILL_0050: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0050.png',
  SLIME_CAT_SKILL_0053: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0053.png',
  SLIME_CAT_SKILL_0056: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0056.png',
  SLIME_CAT_SKILL_0059: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0059.png',
  SLIME_CAT_SKILL_0062: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0062.png',
  SLIME_CAT_SKILL_0065: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0065.png',
  SLIME_CAT_SKILL_0068: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0068.png',
  SLIME_CAT_SKILL_0071: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0071.png',
  SLIME_CAT_SKILL_0074: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0074.png',
  SLIME_CAT_SKILL_0077: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0077.png',
  SLIME_CAT_SKILL_0080: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0080.png',

  // 暗影鼠动画（战斗场景敌人）
  // idle: 6帧
  SHADOW_MOUSE_IDLE_01: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/idle/idle_01.png',
  SHADOW_MOUSE_IDLE_02: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/idle/idle_02.png',
  SHADOW_MOUSE_IDLE_03: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/idle/idle_03.png',
  SHADOW_MOUSE_IDLE_04: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/idle/idle_04.png',
  SHADOW_MOUSE_IDLE_05: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/idle/idle_05.png',
  SHADOW_MOUSE_IDLE_06: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/idle/idle_06.png',

  // attack: 7帧
  SHADOW_MOUSE_ATTACK_01: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/attack/attack_01.png',
  SHADOW_MOUSE_ATTACK_02: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/attack/attack_02.png',
  SHADOW_MOUSE_ATTACK_03: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/attack/attack_03.png',
  SHADOW_MOUSE_ATTACK_04: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/attack/attack_04.png',
  SHADOW_MOUSE_ATTACK_05: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/attack/attack_05.png',
  SHADOW_MOUSE_ATTACK_06: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/attack/attack_06.png',
  SHADOW_MOUSE_ATTACK_07: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/attack/attack_07.png',

  // skill: 12帧
  SHADOW_MOUSE_SKILL_01: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_01.png',
  SHADOW_MOUSE_SKILL_02: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_02.png',
  SHADOW_MOUSE_SKILL_03: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_03.png',
  SHADOW_MOUSE_SKILL_04: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_04.png',
  SHADOW_MOUSE_SKILL_05: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_05.png',
  SHADOW_MOUSE_SKILL_06: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_06.png',
  SHADOW_MOUSE_SKILL_07: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_07.png',
  SHADOW_MOUSE_SKILL_08: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_08.png',
  SHADOW_MOUSE_SKILL_09: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_09.png',
  SHADOW_MOUSE_SKILL_10: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_10.png',
  SHADOW_MOUSE_SKILL_11: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_11.png',
  SHADOW_MOUSE_SKILL_12: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/skill/skill_12.png',

  // ⚡ 雷击术释放特效（15帧）
  EFFECT_LIGHTNING_CAST_01: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_01.png',
  EFFECT_LIGHTNING_CAST_02: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_02.png',
  EFFECT_LIGHTNING_CAST_03: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_03.png',
  EFFECT_LIGHTNING_CAST_04: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_04.png',
  EFFECT_LIGHTNING_CAST_05: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_05.png',
  EFFECT_LIGHTNING_CAST_06: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_06.png',
  EFFECT_LIGHTNING_CAST_07: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_07.png',
  EFFECT_LIGHTNING_CAST_08: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_08.png',
  EFFECT_LIGHTNING_CAST_09: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_09.png',
  EFFECT_LIGHTNING_CAST_10: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_10.png',
  EFFECT_LIGHTNING_CAST_11: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_11.png',
  EFFECT_LIGHTNING_CAST_12: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_12.png',
  EFFECT_LIGHTNING_CAST_13: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_13.png',
  EFFECT_LIGHTNING_CAST_14: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_14.png',
  EFFECT_LIGHTNING_CAST_15: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_15.png',

  // ⚡ 雷击术击中特效（12帧）
  EFFECT_LIGHTNING_HIT_01: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_01.png',
  EFFECT_LIGHTNING_HIT_02: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_02.png',
  EFFECT_LIGHTNING_HIT_03: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_03.png',
  EFFECT_LIGHTNING_HIT_04: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_04.png',
  EFFECT_LIGHTNING_HIT_05: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_05.png',
  EFFECT_LIGHTNING_HIT_06: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_06.png',
  EFFECT_LIGHTNING_HIT_07: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_07.png',
  EFFECT_LIGHTNING_HIT_08: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_08.png',
  EFFECT_LIGHTNING_HIT_09: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_09.png',
  EFFECT_LIGHTNING_HIT_10: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_10.png',
  EFFECT_LIGHTNING_HIT_11: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_11.png',
  EFFECT_LIGHTNING_HIT_12: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_12.png'
}
