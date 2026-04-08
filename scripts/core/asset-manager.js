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
  
  // 主角走路动画帧 - 透明背景版本（battle分包）
  // zhenbao: 10帧walk动画 + 5帧idle动画（减帧版本）
  HERO_ZHENBAO_WALK_01: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_01.png',
  HERO_ZHENBAO_WALK_02: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_02.png',
  HERO_ZHENBAO_WALK_03: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_03.png',
  HERO_ZHENBAO_WALK_04: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_04.png',
  HERO_ZHENBAO_WALK_05: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_05.png',
  HERO_ZHENBAO_WALK_06: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_06.png',
  HERO_ZHENBAO_WALK_07: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_07.png',
  HERO_ZHENBAO_WALK_08: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_08.png',
  HERO_ZHENBAO_WALK_09: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_09.png',
  HERO_ZHENBAO_WALK_10: BATTLE_PKG + 'images/characters_anim/zhenbao_walk/walk_10.png',
  
  HERO_ZHENBAO_IDLE_01: BATTLE_PKG + 'images/characters_anim/zhenbao_idle/idle_01.png',
  HERO_ZHENBAO_IDLE_02: BATTLE_PKG + 'images/characters_anim/zhenbao_idle/idle_02.png',
  HERO_ZHENBAO_IDLE_03: BATTLE_PKG + 'images/characters_anim/zhenbao_idle/idle_03.png',
  HERO_ZHENBAO_IDLE_04: BATTLE_PKG + 'images/characters_anim/zhenbao_idle/idle_04.png',
  HERO_ZHENBAO_IDLE_05: BATTLE_PKG + 'images/characters_anim/zhenbao_idle/idle_05.png',
  
  // lixiaobao: 8帧动画（battle分包）
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
  UI_ICON_PAW: 'images/ui/icon_cat_paw.png', // 修正文件名
  UI_ICON_STAR: 'images/ui/icon_star.png',
  UI_ICON_GOLD: 'images/ui/icon_coin.png', // 修正文件名
  UI_ICON_HP: 'images/ui/icon_hp.png',
  UI_ICON_MP: 'images/ui/icon_mp.png',
  
  // 地图
  MAP_WORLD: 'images/map_world.png',
  
  // 技能特效 - 火球术施法（李小宝）
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
  
  // 技能特效 - 火球术击中（李小宝）
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
  EFFECT_FIREBALL_HIT_25: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_25.png',
  EFFECT_FIREBALL_HIT_26: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_26.png',
  EFFECT_FIREBALL_HIT_27: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_27.png',
  EFFECT_FIREBALL_HIT_28: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_28.png',
  EFFECT_FIREBALL_HIT_29: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_29.png',
  EFFECT_FIREBALL_HIT_30: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_30.png',
  EFFECT_FIREBALL_HIT_31: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_31.png',
  EFFECT_FIREBALL_HIT_32: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_32.png',
  EFFECT_FIREBALL_HIT_33: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_33.png',
  EFFECT_FIREBALL_HIT_34: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_34.png',
  EFFECT_FIREBALL_HIT_35: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_35.png',
  EFFECT_FIREBALL_HIT_36: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_36.png',
  EFFECT_FIREBALL_HIT_37: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_37.png',
  EFFECT_FIREBALL_HIT_38: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_38.png',
  EFFECT_FIREBALL_HIT_39: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_39.png',
  EFFECT_FIREBALL_HIT_40: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_40.png',
  EFFECT_FIREBALL_HIT_41: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_41.png',
  EFFECT_FIREBALL_HIT_42: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_42.png',
  EFFECT_FIREBALL_HIT_43: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_43.png',
  EFFECT_FIREBALL_HIT_44: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_44.png',
  EFFECT_FIREBALL_HIT_45: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_45.png',
  EFFECT_FIREBALL_HIT_46: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_46.png',
  EFFECT_FIREBALL_HIT_47: BATTLE_PKG + 'images/effects/fireball_hit/fireball_hit_47.png',
  
  // 技能特效 - 冰晶术施法
  EFFECT_ICE_SHARD_CAST_01: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_01.png',
  EFFECT_ICE_SHARD_CAST_02: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_02.png',
  EFFECT_ICE_SHARD_CAST_03: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_03.png',
  EFFECT_ICE_SHARD_CAST_04: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_04.png',
  EFFECT_ICE_SHARD_CAST_05: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_05.png',
  EFFECT_ICE_SHARD_CAST_06: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_06.png',
  EFFECT_ICE_SHARD_CAST_07: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_07.png',
  EFFECT_ICE_SHARD_CAST_08: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_08.png',
  EFFECT_ICE_SHARD_CAST_09: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_09.png',
  EFFECT_ICE_SHARD_CAST_10: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_10.png',
  EFFECT_ICE_SHARD_CAST_11: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_11.png',
  EFFECT_ICE_SHARD_CAST_12: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_12.png',
  EFFECT_ICE_SHARD_CAST_13: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_13.png',
  EFFECT_ICE_SHARD_CAST_14: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_14.png',
  EFFECT_ICE_SHARD_CAST_15: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_15.png',
  EFFECT_ICE_SHARD_CAST_16: BATTLE_PKG + 'images/effects/ice_shard_cast/ice_shard_cast_16.png',
  
  // 技能特效 - 冰晶术击中
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
  EFFECT_ICE_SHARD_HIT_12: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_12.png',
  EFFECT_ICE_SHARD_HIT_13: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_13.png',
  EFFECT_ICE_SHARD_HIT_14: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_14.png',
  EFFECT_ICE_SHARD_HIT_15: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_15.png',
  EFFECT_ICE_SHARD_HIT_16: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_16.png',
  EFFECT_ICE_SHARD_HIT_17: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_17.png',
  EFFECT_ICE_SHARD_HIT_18: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_18.png',
  EFFECT_ICE_SHARD_HIT_19: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_19.png',
  EFFECT_ICE_SHARD_HIT_20: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_20.png',
  EFFECT_ICE_SHARD_HIT_21: BATTLE_PKG + 'images/effects/ice_shard_hit/ice_shard_hit_21.png',

  // 史莱姆猫动画（战斗场景敌人）
  // idle: 7帧
  SLIME_CAT_IDLE_1: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_1.png',
  SLIME_CAT_IDLE_2: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_2.png',
  SLIME_CAT_IDLE_3: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_3.png',
  SLIME_CAT_IDLE_4: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_4.png',
  SLIME_CAT_IDLE_5: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_5.png',
  SLIME_CAT_IDLE_6: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_6.png',
  SLIME_CAT_IDLE_7: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/idle/idle_7.png',
  
  // attack: 16帧
  SLIME_CAT_ATTACK_8: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0008.png',
  SLIME_CAT_ATTACK_9: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0009.png',
  SLIME_CAT_ATTACK_10: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0010.png',
  SLIME_CAT_ATTACK_11: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0011.png',
  SLIME_CAT_ATTACK_12: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0012.png',
  SLIME_CAT_ATTACK_13: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0013.png',
  SLIME_CAT_ATTACK_14: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0014.png',
  SLIME_CAT_ATTACK_15: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0015.png',
  SLIME_CAT_ATTACK_16: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0016.png',
  SLIME_CAT_ATTACK_17: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0017.png',
  SLIME_CAT_ATTACK_18: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0018.png',
  SLIME_CAT_ATTACK_19: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0019.png',
  SLIME_CAT_ATTACK_20: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0020.png',
  SLIME_CAT_ATTACK_21: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0021.png',
  SLIME_CAT_ATTACK_22: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0022.png',
  SLIME_CAT_ATTACK_23: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/attack/attack_0023.png',
  
  // skill: 31帧
  SLIME_CAT_SKILL_50: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0050.png',
  SLIME_CAT_SKILL_51: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0051.png',
  SLIME_CAT_SKILL_52: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0052.png',
  SLIME_CAT_SKILL_53: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0053.png',
  SLIME_CAT_SKILL_54: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0054.png',
  SLIME_CAT_SKILL_55: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0055.png',
  SLIME_CAT_SKILL_56: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0056.png',
  SLIME_CAT_SKILL_57: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0057.png',
  SLIME_CAT_SKILL_58: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0058.png',
  SLIME_CAT_SKILL_59: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0059.png',
  SLIME_CAT_SKILL_60: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0060.png',
  SLIME_CAT_SKILL_61: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0061.png',
  SLIME_CAT_SKILL_62: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0062.png',
  SLIME_CAT_SKILL_63: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0063.png',
  SLIME_CAT_SKILL_64: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0064.png',
  SLIME_CAT_SKILL_65: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0065.png',
  SLIME_CAT_SKILL_66: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0066.png',
  SLIME_CAT_SKILL_67: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0067.png',
  SLIME_CAT_SKILL_68: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0068.png',
  SLIME_CAT_SKILL_69: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0069.png',
  SLIME_CAT_SKILL_70: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0070.png',
  SLIME_CAT_SKILL_71: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0071.png',
  SLIME_CAT_SKILL_72: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0072.png',
  SLIME_CAT_SKILL_73: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0073.png',
  SLIME_CAT_SKILL_74: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0074.png',
  SLIME_CAT_SKILL_75: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0075.png',
  SLIME_CAT_SKILL_76: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0076.png',
  SLIME_CAT_SKILL_77: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0077.png',
  SLIME_CAT_SKILL_78: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0078.png',
  SLIME_CAT_SKILL_79: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0079.png',
  SLIME_CAT_SKILL_80: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/skill/skill_0080.png',

  // ⚡ 雷击术释放特效（30帧 - 新版本）
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
  EFFECT_LIGHTNING_CAST_16: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_16.png',
  EFFECT_LIGHTNING_CAST_17: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_17.png',
  EFFECT_LIGHTNING_CAST_18: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_18.png',
  EFFECT_LIGHTNING_CAST_19: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_19.png',
  EFFECT_LIGHTNING_CAST_20: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_20.png',
  EFFECT_LIGHTNING_CAST_21: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_21.png',
  EFFECT_LIGHTNING_CAST_22: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_22.png',
  EFFECT_LIGHTNING_CAST_23: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_23.png',
  EFFECT_LIGHTNING_CAST_24: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_24.png',
  EFFECT_LIGHTNING_CAST_25: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_25.png',
  EFFECT_LIGHTNING_CAST_26: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_26.png',
  EFFECT_LIGHTNING_CAST_27: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_27.png',
  EFFECT_LIGHTNING_CAST_28: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_28.png',
  EFFECT_LIGHTNING_CAST_29: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_29.png',
  EFFECT_LIGHTNING_CAST_30: BATTLE_PKG + 'images/effects/lightning_cast/lightning_cast_30.png',

  // ⚡ 雷击术击中特效（23帧 - 新版本）
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
  EFFECT_LIGHTNING_HIT_12: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_12.png',
  EFFECT_LIGHTNING_HIT_13: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_13.png',
  EFFECT_LIGHTNING_HIT_14: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_14.png',
  EFFECT_LIGHTNING_HIT_15: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_15.png',
  EFFECT_LIGHTNING_HIT_16: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_16.png',
  EFFECT_LIGHTNING_HIT_17: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_17.png',
  EFFECT_LIGHTNING_HIT_18: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_18.png',
  EFFECT_LIGHTNING_HIT_19: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_19.png',
  EFFECT_LIGHTNING_HIT_20: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_20.png',
  EFFECT_LIGHTNING_HIT_21: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_21.png',
  EFFECT_LIGHTNING_HIT_22: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_22.png',
  EFFECT_LIGHTNING_HIT_23: BATTLE_PKG + 'images/effects/lightning_hit/lightning_hit_23.png'
}
