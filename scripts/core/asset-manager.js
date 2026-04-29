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
  // 战斗背景（battle分包）
  BG_GRASSLAND: BATTLE_PKG + 'images/backgrounds/bg_grassland.png',
  BG_FOREST: BATTLE_PKG + 'images/backgrounds/bg_forest.png',
  BG_CAVE: BATTLE_PKG + 'images/backgrounds/bg_cave.png',
  BG_TOWN: 'images/map/village.jpeg',
  BG_BOSS: BATTLE_PKG + 'images/backgrounds/bg_boss.png',
  BG_TOWER_BATTLE: BATTLE_PKG + 'images/tower_battle_bg.png',

  // ========== 小镇地图对象资源 ==========
  TOWN_SHOP: 'images/map/town/shop.png',
  TOWN_WEAPON_SHOP: 'images/map/town/weapon_shop.png',
  TOWN_POTION_SHOP: 'images/map/town/potion_shop.png',
  TOWN_QUEST_BOARD: 'images/map/town/quest_board.png',
  TOWN_TREE: 'images/map/town/tree.png',
  TOWN_FOREST: 'images/map/town/forest.png',
  TOWN_MOUNTAIN: 'images/map/town/mountain.png',
  TOWN_ROCK: 'images/map/town/rock.png',
  TOWN_ROAD_H: 'images/map/town/road_h.png',
  TOWN_ROAD_T: 'images/map/town/road_t.png',
  TOWN_ROAD_CROSS: 'images/map/town/road_cross.png',
  TOWN_ROAD_CURVE: 'images/map/town/road_curve.png',
  TOWN_GRASS: 'images/map/town/grass.png',
  TOWN_GRASS2: 'images/map/town/grass2.png',
  TOWN_GRASS3: 'images/map/town/grass3.png',
  TOWN_GRASS_PILE: 'images/map/town/grass_pile.png',
  TOWN_FLOWER1: 'images/map/town/flower1.png',
  TOWN_FLOWER2: 'images/map/town/flower2.png',
  TOWN_FLOWER3: 'images/map/town/flower3.png',

  // 主角
  HERO_ZHENBAO: 'images/characters/hero_zhenbao.png',
  HERO_LIXIAOBAO: 'images/characters/hero_lixiaobao.png',
  
  // 臻宝动画帧 - 统一放在 transparent/zhenbao/ 目录下管理
  // walk: 8帧(01~08), idle: 8帧, slash: 13帧（battle分包）
  HERO_ZHENBAO_WALK_01: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/walk/walk_01.png',
  HERO_ZHENBAO_WALK_02: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/walk/walk_02.png',
  HERO_ZHENBAO_WALK_03: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/walk/walk_03.png',
  HERO_ZHENBAO_WALK_04: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/walk/walk_04.png',
  HERO_ZHENBAO_WALK_05: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/walk/walk_05.png',
  HERO_ZHENBAO_WALK_06: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/walk/walk_06.png',
  HERO_ZHENBAO_WALK_07: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/walk/walk_07.png',
  HERO_ZHENBAO_WALK_08: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/walk/walk_08.png',

  HERO_ZHENBAO_IDLE_01: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_01.png',
  HERO_ZHENBAO_IDLE_02: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_02.png',
  HERO_ZHENBAO_IDLE_03: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_03.png',
  HERO_ZHENBAO_IDLE_04: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_04.png',
  HERO_ZHENBAO_IDLE_05: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_05.png',
  HERO_ZHENBAO_IDLE_06: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_06.png',
  HERO_ZHENBAO_IDLE_07: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_07.png',
  HERO_ZHENBAO_IDLE_08: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_08.png',

  // zhenbao 斩击攻击帧（13帧）
  HERO_ZHENBAO_SLASH_01: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_01.png',
  HERO_ZHENBAO_SLASH_02: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_02.png',
  HERO_ZHENBAO_SLASH_03: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_03.png',
  HERO_ZHENBAO_SLASH_04: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_04.png',
  HERO_ZHENBAO_SLASH_05: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_05.png',
  HERO_ZHENBAO_SLASH_06: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_06.png',
  HERO_ZHENBAO_SLASH_07: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_07.png',
  HERO_ZHENBAO_SLASH_08: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_08.png',
  HERO_ZHENBAO_SLASH_09: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_09.png',
  HERO_ZHENBAO_SLASH_10: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_10.png',
  HERO_ZHENBAO_SLASH_11: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_11.png',
  HERO_ZHENBAO_SLASH_12: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_12.png',
  HERO_ZHENBAO_SLASH_13: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/slash/zhenbao_slash_13.png',

  // zhenbao 普攻帧（8帧，轻攻击）
  HERO_ZHENBAO_ATTACK_01: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/attack/attack_01.png',
  HERO_ZHENBAO_ATTACK_02: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/attack/attack_02.png',
  HERO_ZHENBAO_ATTACK_03: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/attack/attack_03.png',
  HERO_ZHENBAO_ATTACK_04: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/attack/attack_04.png',
  HERO_ZHENBAO_ATTACK_05: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/attack/attack_05.png',
  HERO_ZHENBAO_ATTACK_06: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/attack/attack_06.png',
  HERO_ZHENBAO_ATTACK_07: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/attack/attack_07.png',
  HERO_ZHENBAO_ATTACK_08: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/attack/attack_08.png',

  // zhenbao 盾击技能帧（8帧，shield_bash技能）
  HERO_ZHENBAO_SHIELD_01: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/shield/shield_01.png',
  HERO_ZHENBAO_SHIELD_02: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/shield/shield_02.png',
  HERO_ZHENBAO_SHIELD_03: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/shield/shield_03.png',
  HERO_ZHENBAO_SHIELD_04: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/shield/shield_04.png',
  HERO_ZHENBAO_SHIELD_05: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/shield/shield_05.png',
  HERO_ZHENBAO_SHIELD_06: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/shield/shield_06.png',
  HERO_ZHENBAO_SHIELD_07: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/shield/shield_07.png',
  HERO_ZHENBAO_SHIELD_08: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/shield/shield_08.png',

  // zhenbao BUFF技能帧（8帧，war_cry/buff技能）
  HERO_ZHENBAO_BUFF_01: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/buff/buff_01.png',
  HERO_ZHENBAO_BUFF_02: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/buff/buff_02.png',
  HERO_ZHENBAO_BUFF_03: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/buff/buff_03.png',
  HERO_ZHENBAO_BUFF_04: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/buff/buff_04.png',
  HERO_ZHENBAO_BUFF_05: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/buff/buff_05.png',
  HERO_ZHENBAO_BUFF_06: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/buff/buff_06.png',
  HERO_ZHENBAO_BUFF_07: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/buff/buff_07.png',
  HERO_ZHENBAO_BUFF_08: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/buff/buff_08.png',
  
  // 李小宝: walk(8帧) - 新处理素材
  HERO_LIXIAOBAO_WALK_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/walk/walk_01.png',
  HERO_LIXIAOBAO_WALK_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/walk/walk_02.png',
  HERO_LIXIAOBAO_WALK_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/walk/walk_03.png',
  HERO_LIXIAOBAO_WALK_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/walk/walk_04.png',
  HERO_LIXIAOBAO_WALK_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/walk/walk_05.png',
  HERO_LIXIAOBAO_WALK_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/walk/walk_06.png',
  HERO_LIXIAOBAO_WALK_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/walk/walk_07.png',
  HERO_LIXIAOBAO_WALK_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/walk/walk_08.png',

  // 李小宝: idle(8帧) - 新处理素材
  HERO_LIXIAOBAO_IDLE_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_01.png',
  HERO_LIXIAOBAO_IDLE_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_02.png',
  HERO_LIXIAOBAO_IDLE_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_03.png',
  HERO_LIXIAOBAO_IDLE_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_04.png',
  HERO_LIXIAOBAO_IDLE_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_05.png',
  HERO_LIXIAOBAO_IDLE_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_06.png',
  HERO_LIXIAOBAO_IDLE_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_07.png',
  HERO_LIXIAOBAO_IDLE_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_08.png',

  // 李小宝: cast_attack(5帧) - 法杖攻击（旧素材保留）
  HERO_LIXIAOBAO_CAST_ATK_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_attack/cast_attack_01.png',
  HERO_LIXIAOBAO_CAST_ATK_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_attack/cast_attack_02.png',
  HERO_LIXIAOBAO_CAST_ATK_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_attack/cast_attack_03.png',
  HERO_LIXIAOBAO_CAST_ATK_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_attack/cast_attack_04.png',
  HERO_LIXIAOBAO_CAST_ATK_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_attack/cast_attack_05.png',

  // 李小宝: cast_ice(8帧) - 新处理素材
  HERO_LIXIAOBAO_ICE_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_ice/cast_ice_01.png',
  HERO_LIXIAOBAO_ICE_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_ice/cast_ice_02.png',
  HERO_LIXIAOBAO_ICE_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_ice/cast_ice_03.png',
  HERO_LIXIAOBAO_ICE_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_ice/cast_ice_04.png',
  HERO_LIXIAOBAO_ICE_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_ice/cast_ice_05.png',
  HERO_LIXIAOBAO_ICE_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_ice/cast_ice_06.png',
  HERO_LIXIAOBAO_ICE_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_ice/cast_ice_07.png',
  HERO_LIXIAOBAO_ICE_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_ice/cast_ice_08.png',

  // 李小宝: cast_lightning(8帧) - 新处理素材
  HERO_LIXIAOBAO_LIGHTNING_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_lightning/cast_lightning_01.png',
  HERO_LIXIAOBAO_LIGHTNING_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_lightning/cast_lightning_02.png',
  HERO_LIXIAOBAO_LIGHTNING_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_lightning/cast_lightning_03.png',
  HERO_LIXIAOBAO_LIGHTNING_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_lightning/cast_lightning_04.png',
  HERO_LIXIAOBAO_LIGHTNING_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_lightning/cast_lightning_05.png',
  HERO_LIXIAOBAO_LIGHTNING_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_lightning/cast_lightning_06.png',
  HERO_LIXIAOBAO_LIGHTNING_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_lightning/cast_lightning_07.png',
  HERO_LIXIAOBAO_LIGHTNING_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_lightning/cast_lightning_08.png',

  // 李小宝: hit_fireball(24帧) - 火球命中特效
  LXB_HIT_FIREBALL_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_01.png',
  LXB_HIT_FIREBALL_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_02.png',
  LXB_HIT_FIREBALL_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_03.png',
  LXB_HIT_FIREBALL_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_04.png',
  LXB_HIT_FIREBALL_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_05.png',
  LXB_HIT_FIREBALL_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_06.png',
  LXB_HIT_FIREBALL_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_07.png',
  LXB_HIT_FIREBALL_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_08.png',
  LXB_HIT_FIREBALL_09: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_09.png',
  LXB_HIT_FIREBALL_10: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_10.png',
  LXB_HIT_FIREBALL_11: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_11.png',
  LXB_HIT_FIREBALL_12: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_12.png',
  LXB_HIT_FIREBALL_13: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_13.png',
  LXB_HIT_FIREBALL_14: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_14.png',
  LXB_HIT_FIREBALL_15: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_15.png',
  LXB_HIT_FIREBALL_16: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_16.png',
  LXB_HIT_FIREBALL_17: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_17.png',
  LXB_HIT_FIREBALL_18: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_18.png',
  LXB_HIT_FIREBALL_19: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_19.png',
  LXB_HIT_FIREBALL_20: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_20.png',
  LXB_HIT_FIREBALL_21: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_21.png',
  LXB_HIT_FIREBALL_22: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_22.png',
  LXB_HIT_FIREBALL_23: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_23.png',
  LXB_HIT_FIREBALL_24: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_24.png',

  // 李小宝: hit_ice(11帧) - 冰晶命中特效
  LXB_HIT_ICE_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_01.png',
  LXB_HIT_ICE_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_02.png',
  LXB_HIT_ICE_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_03.png',
  LXB_HIT_ICE_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_04.png',
  LXB_HIT_ICE_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_05.png',
  LXB_HIT_ICE_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_06.png',
  LXB_HIT_ICE_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_07.png',
  LXB_HIT_ICE_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_08.png',
  LXB_HIT_ICE_09: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_09.png',
  LXB_HIT_ICE_10: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_10.png',
  LXB_HIT_ICE_11: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_11.png',

  // 李小宝: hit_lightning(12帧) - 雷电命中特效
  LXB_HIT_LIGHTNING_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_01.png',
  LXB_HIT_LIGHTNING_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_02.png',
  LXB_HIT_LIGHTNING_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_03.png',
  LXB_HIT_LIGHTNING_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_04.png',
  LXB_HIT_LIGHTNING_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_05.png',
  LXB_HIT_LIGHTNING_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_06.png',
  LXB_HIT_LIGHTNING_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_07.png',
  LXB_HIT_LIGHTNING_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_08.png',
  LXB_HIT_LIGHTNING_09: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_09.png',
  LXB_HIT_LIGHTNING_10: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_10.png',
  LXB_HIT_LIGHTNING_11: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_11.png',
  LXB_HIT_LIGHTNING_12: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_12.png',
  
  // 猫咪主角动画（探索地图用，减帧版，统一放在 transparent/cat/ 目录管理）
  // idle: 8帧静止动画
  CAT_IDLE_01: BATTLE_PKG + 'images/characters_anim/transparent/cat/idle/idle_01.png',
  CAT_IDLE_02: BATTLE_PKG + 'images/characters_anim/transparent/cat/idle/idle_02.png',
  CAT_IDLE_03: BATTLE_PKG + 'images/characters_anim/transparent/cat/idle/idle_03.png',
  CAT_IDLE_04: BATTLE_PKG + 'images/characters_anim/transparent/cat/idle/idle_04.png',
  CAT_IDLE_05: BATTLE_PKG + 'images/characters_anim/transparent/cat/idle/idle_05.png',
  CAT_IDLE_06: BATTLE_PKG + 'images/characters_anim/transparent/cat/idle/idle_06.png',
  CAT_IDLE_07: BATTLE_PKG + 'images/characters_anim/transparent/cat/idle/idle_07.png',
  CAT_IDLE_08: BATTLE_PKG + 'images/characters_anim/transparent/cat/idle/idle_08.png',
  
  // walk: 12帧移动动画
  CAT_WALK_01: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_01.png',
  CAT_WALK_02: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_02.png',
  CAT_WALK_03: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_03.png',
  CAT_WALK_04: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_04.png',
  CAT_WALK_05: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_05.png',
  CAT_WALK_06: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_06.png',
  CAT_WALK_07: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_07.png',
  CAT_WALK_08: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_08.png',
  CAT_WALK_09: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_09.png',
  CAT_WALK_10: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_10.png',
  CAT_WALK_11: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_11.png',
  CAT_WALK_12: BATTLE_PKG + 'images/characters_anim/transparent/cat/walk/walk_12.png',
  
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
  
  // 李小宝技能特效 - 火球术施法（11帧）
  EFFECT_FIREBALL_CAST_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_fireball/fireball_cast_01.png',
  EFFECT_FIREBALL_CAST_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_fireball/fireball_cast_02.png',
  EFFECT_FIREBALL_CAST_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_fireball/fireball_cast_03.png',
  EFFECT_FIREBALL_CAST_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_fireball/fireball_cast_04.png',
  EFFECT_FIREBALL_CAST_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_fireball/fireball_cast_05.png',
  EFFECT_FIREBALL_CAST_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_fireball/fireball_cast_06.png',
  EFFECT_FIREBALL_CAST_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_fireball/fireball_cast_07.png',
  EFFECT_FIREBALL_CAST_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_fireball/fireball_cast_08.png',

  // 李小宝技能特效 - 火球术击中（24帧）
  EFFECT_FIREBALL_HIT_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_01.png',
  EFFECT_FIREBALL_HIT_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_02.png',
  EFFECT_FIREBALL_HIT_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_03.png',
  EFFECT_FIREBALL_HIT_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_04.png',
  EFFECT_FIREBALL_HIT_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_05.png',
  EFFECT_FIREBALL_HIT_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_06.png',
  EFFECT_FIREBALL_HIT_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_07.png',
  EFFECT_FIREBALL_HIT_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_08.png',
  EFFECT_FIREBALL_HIT_09: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_09.png',
  EFFECT_FIREBALL_HIT_10: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_10.png',
  EFFECT_FIREBALL_HIT_11: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_11.png',
  EFFECT_FIREBALL_HIT_12: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_12.png',
  EFFECT_FIREBALL_HIT_13: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_13.png',
  EFFECT_FIREBALL_HIT_14: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_14.png',
  EFFECT_FIREBALL_HIT_15: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_15.png',
  EFFECT_FIREBALL_HIT_16: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_16.png',
  EFFECT_FIREBALL_HIT_17: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_17.png',
  EFFECT_FIREBALL_HIT_18: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_18.png',
  EFFECT_FIREBALL_HIT_19: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_19.png',
  EFFECT_FIREBALL_HIT_20: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_20.png',
  EFFECT_FIREBALL_HIT_21: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_21.png',
  EFFECT_FIREBALL_HIT_22: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_22.png',
  EFFECT_FIREBALL_HIT_23: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_23.png',
  EFFECT_FIREBALL_HIT_24: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_fireball/fireball_hit_24.png',

  // 李小宝技能特效 - 冰晶术击中（11帧）
  EFFECT_ICE_SHARD_HIT_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_01.png',
  EFFECT_ICE_SHARD_HIT_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_02.png',
  EFFECT_ICE_SHARD_HIT_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_03.png',
  EFFECT_ICE_SHARD_HIT_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_04.png',
  EFFECT_ICE_SHARD_HIT_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_05.png',
  EFFECT_ICE_SHARD_HIT_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_06.png',
  EFFECT_ICE_SHARD_HIT_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_07.png',
  EFFECT_ICE_SHARD_HIT_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_08.png',
  EFFECT_ICE_SHARD_HIT_09: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_09.png',
  EFFECT_ICE_SHARD_HIT_10: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_10.png',
  EFFECT_ICE_SHARD_HIT_11: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_ice/ice_shard_hit_11.png',

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

  // walk: 12帧（史莱姆猫野外移动动画）
  SLIME_CAT_WALK_01: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_01.png',
  SLIME_CAT_WALK_02: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_02.png',
  SLIME_CAT_WALK_03: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_03.png',
  SLIME_CAT_WALK_04: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_04.png',
  SLIME_CAT_WALK_05: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_05.png',
  SLIME_CAT_WALK_06: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_06.png',
  SLIME_CAT_WALK_07: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_07.png',
  SLIME_CAT_WALK_08: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_08.png',
  SLIME_CAT_WALK_09: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_09.png',
  SLIME_CAT_WALK_10: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_10.png',
  SLIME_CAT_WALK_11: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_11.png',
  SLIME_CAT_WALK_12: BATTLE_PKG + 'images/characters_anim/transparent/slime_cat/walk/walk_12.png',

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

  // walk: 12帧（暗影鼠野外移动动画）
  SHADOW_MOUSE_WALK_01: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_01.png',
  SHADOW_MOUSE_WALK_02: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_02.png',
  SHADOW_MOUSE_WALK_03: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_03.png',
  SHADOW_MOUSE_WALK_04: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_04.png',
  SHADOW_MOUSE_WALK_05: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_05.png',
  SHADOW_MOUSE_WALK_06: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_06.png',
  SHADOW_MOUSE_WALK_07: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_07.png',
  SHADOW_MOUSE_WALK_08: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_08.png',
  SHADOW_MOUSE_WALK_09: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_09.png',
  SHADOW_MOUSE_WALK_10: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_10.png',
  SHADOW_MOUSE_WALK_11: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_11.png',
  SHADOW_MOUSE_WALK_12: BATTLE_PKG + 'images/characters_anim/transparent/shadow_mouse/walk/walk_12.png',

  // 李小宝技能特效 - 雷击术击中（12帧）
  EFFECT_LIGHTNING_HIT_01: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_01.png',
  EFFECT_LIGHTNING_HIT_02: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_02.png',
  EFFECT_LIGHTNING_HIT_03: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_03.png',
  EFFECT_LIGHTNING_HIT_04: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_04.png',
  EFFECT_LIGHTNING_HIT_05: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_05.png',
  EFFECT_LIGHTNING_HIT_06: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_06.png',
  EFFECT_LIGHTNING_HIT_07: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_07.png',
  EFFECT_LIGHTNING_HIT_08: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_08.png',
  EFFECT_LIGHTNING_HIT_09: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_09.png',
  EFFECT_LIGHTNING_HIT_10: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_10.png',
  EFFECT_LIGHTNING_HIT_11: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_11.png',
  EFFECT_LIGHTNING_HIT_12: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/hit_lightning/lightning_hit_12.png'
}
