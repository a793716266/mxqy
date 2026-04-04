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

// 资源路径定义
export const ASSETS = {
  // 野外探索地图
  FIELD_GRASSLAND: 'images/map/grassland.png',
  FIELD_FOREST: 'images/map/grassland.png', // 暂时使用草地地图
  FIELD_CAVE: 'images/map/grassland.png', // 暂时使用草地地图
  
  // 战斗背景
  BG_GRASSLAND: 'images/backgrounds/bg_grassland.png',
  BG_FOREST: 'images/backgrounds/bg_forest.png',
  BG_CAVE: 'images/backgrounds/bg_cave.png',
  BG_TOWN: 'images/backgrounds/bg_town.png',
  BG_BOSS: 'images/backgrounds/bg_boss.png',
  
  // 主角
  HERO_ZHENBAO: 'images/characters/hero_zhenbao.png',
  HERO_LIXIAOBAO: 'images/characters/hero_lixiaobao.png',
  
  // 主角走路动画帧 - 透明背景版本
  // zhenbao: 8帧动画（新版本）
  HERO_ZHENBAO_WALK_0: 'images/characters_anim/transparent/zhenbao_walk_0.png',
  HERO_ZHENBAO_WALK_1: 'images/characters_anim/transparent/zhenbao_walk_1.png',
  HERO_ZHENBAO_WALK_2: 'images/characters_anim/transparent/zhenbao_walk_2.png',
  HERO_ZHENBAO_WALK_3: 'images/characters_anim/transparent/zhenbao_walk_3.png',
  HERO_ZHENBAO_WALK_4: 'images/characters_anim/transparent/zhenbao_walk_4.png',
  HERO_ZHENBAO_WALK_5: 'images/characters_anim/transparent/zhenbao_walk_5.png',
  HERO_ZHENBAO_WALK_6: 'images/characters_anim/transparent/zhenbao_walk_6.png',
  HERO_ZHENBAO_WALK_7: 'images/characters_anim/transparent/zhenbao_walk_7.png',
  HERO_ZHENBAO_IDLE_0: 'images/characters_anim/transparent/zhenbao_idle_0.png',
  HERO_ZHENBAO_IDLE_1: 'images/characters_anim/transparent/zhenbao_idle_1.png',
  
  // lixiaobao: 4帧动画
  HERO_LIXIAOBAO_WALK_0: 'images/characters_anim/transparent/lixiaobao_walk_0.png',
  HERO_LIXIAOBAO_WALK_1: 'images/characters_anim/transparent/lixiaobao_walk_1.png',
  HERO_LIXIAOBAO_WALK_2: 'images/characters_anim/transparent/lixiaobao_walk_2.png',
  HERO_LIXIAOBAO_WALK_3: 'images/characters_anim/transparent/lixiaobao_walk_3.png',
  HERO_LIXIAOBAO_IDLE_0: 'images/characters_anim/transparent/lixiaobao_idle_0.png',
  HERO_LIXIAOBAO_IDLE_1: 'images/characters_anim/transparent/lixiaobao_idle_1.png',
  
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
  MAP_WORLD: 'images/map_world.png'
}
