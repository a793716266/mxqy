/**
 * asset-manager.js - 资源管理器
 *
 * ★ P8 资源路径约定化重构：
 *   - 静态资源（背景/UI/地图等）：手工枚举（无规律可循）
 *   - 序列帧资源（角色动画/特效）：通过 buildFrames() 约定化自动生成
 *   - 所有 key 名称保持不变，完全向后兼容
 */

export class AssetManager {
  constructor() {
    this.images = {}
    this.loaded = false
  }

  // 加载单张图片
  // ★ 分包资源加载失败时，自动回退到主包同名资源（主包存有副本时），
  //   彻底消除「分包图片未打进包/未挂载 → get 返回 undefined → 野外渲染降级 emoji」的问题。
  //   分包路径仍是首选，主包仅在分包 onerror 时兜底，正常情况零行为变更。
  loadImage(key, path) {
    const fallbacks = []
    if (path.startsWith(BATTLE_PKG)) {
      fallbacks.push(path.slice(BATTLE_PKG.length))
    }
    return this._loadWithFallback(key, [path, ...fallbacks])
  }

  _loadWithFallback(key, paths) {
    return new Promise((resolve) => {
      let idx = 0
      const tryNext = () => {
        if (idx >= paths.length) {
          console.error(`[AssetManager] 资源加载彻底失败（已尝试所有候选路径）: ${key}`)
          resolve(null)
          return
        }
        const p = paths[idx++]
        try {
          const img = wx.createImage()
          img.onload = () => {
            this.images[key] = img
            resolve(img)
          }
          img.onerror = (err) => {
            if (idx < paths.length) {
              // 当前路径失败，尝试下一个候选（如主包副本）
              console.warn(`[AssetManager] 路径加载失败，回退重试: ${p}`)
              tryNext()
            } else {
              console.error(`[AssetManager] 加载失败: ${p}`, err)
              resolve(null) // 失败也继续
            }
          }
          img.src = p
        } catch (error) {
          if (idx < paths.length) {
            tryNext()
          } else {
            console.error(`[AssetManager] 创建图片失败: ${key}`, error)
            resolve(null)
          }
        }
      }
      tryNext()
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

// ================================================================
//  资源路径常量 & 约定化帧生成器
// ================================================================

// 分包路径前缀
const BATTLE_PKG = 'subpackages/battle/'

/**
 * 构建序列帧资源的 { key → path } 映射
 *
 * 约定规则：
 *   文件路径: {baseDir}/{filePrefix}/{filePrefix}_{frameNum}.png
 *   ASSETS key: {PREFIX}_{ACTION}_{frameNum}  （若 action 为空则: {PREFIX}_{frameNum}）
 *
 * @param {string} prefix  - ASSETS key 前缀（大写，如 'HERO_ZHENBAO'）
 * @param {string} baseDir - 文件目录（相对 battle 分包根，如 'images/characters_anim/transparent/zhenbao'）
 * @param {Array<Object>} anims - 动作配置列表
 *   @property {string}  anim.action     - 动作名（会转大写拼接到 key 上），空字符串则省略
 *   @property {number}  anim.frames     - 总帧数（从1开始编号）；与 frameList 二选一
 *   @property {number[]} [anim.frameList] - 自定义帧号列表（用于非连续帧号，如史莱姆猫 attack: [8,10,14,...]）
 *   @property {number}  [anim.pad=2]    - 帧号补零位数
 *   @property {string}  [anim.filePrefix] - 文件名前缀（默认等于 action）
 * @param {Object} [opts]
 * @property {boolean} [opts.battlePkg=true] - 是否添加 BATTLE_PKG 前缀
 * @returns {Object} 可展开到 ASSETS 的 { key: path } 映射
 *
 * @example
 *   // 标准：HERO_ZHENBAO_WALK_01 ~ HERO_ZHENBAO_WALK_08
 *   buildFrames('HERO_ZHENBAO', 'images/characters_anim/transparent/zhenbao', [
 *     { action: 'walk', frames: 8 },
 *   ])
 *   // 无 action：LXB_HIT_FIREBALL_01 ~ _24
 *   buildFrames('LXB_HIT_FIREBALL', '...', [
 *     { action: '', frames: 24, filePrefix: 'fireball_hit' },
 *   ])
 */
function buildFrames(prefix, baseDir, anims, opts = {}) {
  const usePkg = opts.battlePkg !== false
  const result = {}

  for (const anim of anims) {
    const filePrefix = anim.filePrefix || anim.action
    const pad = anim.pad ?? 2

    // 支持非连续帧号列表（如史莱姆猫 attack: [8,10,14,...,22]）
    const frameNumbers = anim.frameList
      ? anim.frameList
      : Array.from({ length: anim.frames }, (_, i) => i + 1)

    for (const rawNum of frameNumbers) {
      const num = String(rawNum).padStart(pad, '0')
      // key: PREFIX_ACTION_NN 或 PREFIX_NN（无 action 时）
      const key = anim.action
        ? `${prefix}_${anim.action.toUpperCase()}_${num}`
        : `${prefix}_${num}`
      // path: baseDir/filePrefix/filePrefix_NN.png
      const path = (usePkg ? BATTLE_PKG : '') + `${baseDir}/${filePrefix}/${filePrefix}_${num}.png`
      result[key] = path
    }
  }

  return result
}

/**
 * 扩展版帧生成器 —— 支持"目录名 ≠ 文件前缀"的场景
 *
 * 与 buildFrames 的区别：
 *   buildFrames:   baseDir → 拼接 filePrefix 子目录 → 文件 = {baseDir}/{filePrefix}/{filePrefix}_NN.png
 *   buildFramesEx: baseDir 直接是文件所在目录           = {baseDir}/{filePrefix}_NN.png（不多拼子目录层）
 *
 * 适用场景：目录名和文件名前缀不一致时（如 hit_fireball/ 下存放 fireball_hit_XX.png）
 *
 * @param {string} prefix  - 同 buildFrames
 * @param {string} baseDir - **文件所在目录**（已包含最终子目录）
 * @param {Array} anims    - 同 buildFrames
 * @param {Object} [opts]  - 同 buildFrames
 */
function buildFramesEx(prefix, baseDir, anims, opts = {}) {
  const usePkg = opts.battlePkg !== false
  const result = {}

  for (const anim of anims) {
    const filePrefix = anim.filePrefix || anim.action
    const pad = anim.pad ?? 2

    const frameNumbers = anim.frameList
      ? anim.frameList
      : Array.from({ length: anim.frames }, (_, i) => i + 1)

    for (const rawNum of frameNumbers) {
      const num = String(rawNum).padStart(pad, '0')
      const key = anim.action
        ? `${prefix}_${anim.action.toUpperCase()}_${num}`
        : `${prefix}_${num}`
      // ★ 区别：直接在 baseDir 下拼接文件名，不额外加子目录层
      const path = (usePkg ? BATTLE_PKG : '') + `${baseDir}/${filePrefix}_${num}.png`
      result[key] = path
    }
  }

  return result
}

// ================================================================
//  ASSETS — 静态资源（手工枚举）+ 序列帧（约定化生成）
// ================================================================
export const ASSETS = {

  // ==================== 战斗背景（静态） ====================
  BG_GRASSLAND: BATTLE_PKG + 'images/backgrounds/bg_grassland.png',
  BG_FOREST: BATTLE_PKG + 'images/backgrounds/bg_forest.png',
  BG_CAVE: BATTLE_PKG + 'images/backgrounds/bg_cave.png',
  BG_TOWN: 'images/map/village.jpeg',
  BG_BOSS: BATTLE_PKG + 'images/backgrounds/bg_boss.png',
  BG_TOWER_BATTLE: BATTLE_PKG + 'images/tower_battle_bg.png',

  // ==================== 小镇地图对象（静态） ====================
  TOWN_BACKGROUNDGRASS: BATTLE_PKG + 'images/map/town/backgroundgrass.png',
  TOWN_SHOP: BATTLE_PKG + 'images/map/town/shop.png',
  TOWN_WEAPON_SHOP: BATTLE_PKG + 'images/map/town/weapon_shop.png',
  TOWN_POTION_SHOP: BATTLE_PKG + 'images/map/town/potion_shop.png',
  TOWN_QUEST_BOARD: BATTLE_PKG + 'images/map/town/quest_board.png',
  TOWN_TREE: BATTLE_PKG + 'images/map/town/tree.png',
  TOWN_FOREST: BATTLE_PKG + 'images/map/town/forest.png',
  TOWN_MOUNTAIN: BATTLE_PKG + 'images/map/town/mountain.png',
  TOWN_ROCK: BATTLE_PKG + 'images/map/town/rock.png',
  TOWN_ROAD: BATTLE_PKG + 'images/map/town/road.png',
  TOWN_ROAD_H: BATTLE_PKG + 'images/map/town/road_h.png',
  TOWN_ROAD_T: BATTLE_PKG + 'images/map/town/road_t.png',
  TOWN_ROAD_CROSS: BATTLE_PKG + 'images/map/town/road_cross.png',
  TOWN_ROAD_CURVE: BATTLE_PKG + 'images/map/town/road_curve.png',
  TOWN_GRASS: BATTLE_PKG + 'images/map/town/grass.png',
  TOWN_GRASS2: BATTLE_PKG + 'images/map/town/grass2.png',
  TOWN_GRASS3: BATTLE_PKG + 'images/map/town/grass3.png',
  TOWN_GRASS_PILE: BATTLE_PKG + 'images/map/town/grass_pile.png',
  TOWN_FLOWER1: BATTLE_PKG + 'images/map/town/flower1.png',
  TOWN_FLOWER2: BATTLE_PKG + 'images/map/town/flower2.png',
  TOWN_FLOWER3: BATTLE_PKG + 'images/map/town/flower3.png',

  // ==================== 小镇新建筑（buildings系列） ====================
  TOWN_BUILDINGS_001_85X84: BATTLE_PKG + 'images/map/town/buildings_001_85x84.png',
  TOWN_BUILDINGS_002_86X85: BATTLE_PKG + 'images/map/town/buildings_002_86x85.png',
  TOWN_BUILDINGS_003_84X84: BATTLE_PKG + 'images/map/town/buildings_003_84x84.png',
  TOWN_BUILDINGS_004_80X82: BATTLE_PKG + 'images/map/town/buildings_004_80x82.png',
  TOWN_BUILDINGS_005_80X83: BATTLE_PKG + 'images/map/town/buildings_005_80x83.png',
  TOWN_BUILDINGS_006_80X81: BATTLE_PKG + 'images/map/town/buildings_006_80x81.png',
  TOWN_BUILDINGS_007_80X82: BATTLE_PKG + 'images/map/town/buildings_007_80x82.png',
  TOWN_BUILDINGS_008_85X69: BATTLE_PKG + 'images/map/town/buildings_008_85x69.png',
  TOWN_BUILDINGS_009_75X74: BATTLE_PKG + 'images/map/town/buildings_009_75x74.png',
  TOWN_BUILDINGS_010_93X140: BATTLE_PKG + 'images/map/town/buildings_010_93x140.png',
  TOWN_BUILDINGS_011_72X68: BATTLE_PKG + 'images/map/town/buildings_011_72x68.png',
  TOWN_BUILDINGS_012_85X57: BATTLE_PKG + 'images/map/town/buildings_012_85x57.png',
  TOWN_BUILDINGS_013_63X60: BATTLE_PKG + 'images/map/town/buildings_013_63x60.png',
  TOWN_BUILDINGS_014_131X43: BATTLE_PKG + 'images/map/town/buildings_014_131x43.png',
  TOWN_BUILDINGS_015_51X117: BATTLE_PKG + 'images/map/town/buildings_015_51x117.png',
  TOWN_BUILDINGS_016_64X56: BATTLE_PKG + 'images/map/town/buildings_016_64x56.png',
  TOWN_BUILDINGS_017_67X56: BATTLE_PKG + 'images/map/town/buildings_017_67x56.png',
  TOWN_BUILDINGS_019_65X55: BATTLE_PKG + 'images/map/town/buildings_019_65x55.png',
  TOWN_BUILDINGS_020_71X55: BATTLE_PKG + 'images/map/town/buildings_020_71x55.png',
  TOWN_BUILDINGS_021_99X43: BATTLE_PKG + 'images/map/town/buildings_021_99x43.png',
  TOWN_BUILDINGS_022_46X63: BATTLE_PKG + 'images/map/town/buildings_022_46x63.png',
  TOWN_BUILDINGS_023_57X56: BATTLE_PKG + 'images/map/town/buildings_023_57x56.png',
  TOWN_BUILDINGS_024_54X57: BATTLE_PKG + 'images/map/town/buildings_024_54x57.png',
  TOWN_BUILDINGS_025_62X43: BATTLE_PKG + 'images/map/town/buildings_025_62x43.png',
  TOWN_BUILDINGS_026_60X48: BATTLE_PKG + 'images/map/town/buildings_026_60x48.png',
  TOWN_BUILDINGS_027_64X34: BATTLE_PKG + 'images/map/town/buildings_027_64x34.png',
  TOWN_BUILDINGS_028_47X51: BATTLE_PKG + 'images/map/town/buildings_028_47x51.png',
  TOWN_BUILDINGS_029_69X54: BATTLE_PKG + 'images/map/town/buildings_029_69x54.png',
  TOWN_BUILDINGS_030_57X43: BATTLE_PKG + 'images/map/town/buildings_030_57x43.png',
  TOWN_BUILDINGS_031_61X39: BATTLE_PKG + 'images/map/town/buildings_031_61x39.png',
  TOWN_BUILDINGS_032_30X50: BATTLE_PKG + 'images/map/town/buildings_032_30x50.png',

  // ==================== 小镇地图物件（maps系列） ====================
  TOWN_MAPS_002_142X278: BATTLE_PKG + 'images/map/town/maps_002_142x278.png',
  TOWN_MAPS_003_158X278: BATTLE_PKG + 'images/map/town/maps_003_158x278.png',
  TOWN_MAPS_004_138X133: BATTLE_PKG + 'images/map/town/maps_004_138x133.png',
  TOWN_MAPS_005_87X103: BATTLE_PKG + 'images/map/town/maps_005_87x103.png',

  // ==================== 小镇树木（trees系列） ====================
  TOWN_TREES_001_46X41: BATTLE_PKG + 'images/map/town/trees_001_46x41.png',
  TOWN_TREES_002_51X38: BATTLE_PKG + 'images/map/town/trees_002_51x38.png',
  TOWN_TREES_003_48X43: BATTLE_PKG + 'images/map/town/trees_003_48x43.png',
  TOWN_TREES_004_45X38: BATTLE_PKG + 'images/map/town/trees_004_45x38.png',
  TOWN_TREES_005_42X34: BATTLE_PKG + 'images/map/town/trees_005_42x34.png',
  TOWN_TREES_006_40X31: BATTLE_PKG + 'images/map/town/trees_006_40x31.png',
  TOWN_TREES_007_47X33: BATTLE_PKG + 'images/map/town/trees_007_47x33.png',
  TOWN_TREES_008_45X37: BATTLE_PKG + 'images/map/town/trees_008_45x37.png',
  TOWN_TREES_009_41X42: BATTLE_PKG + 'images/map/town/trees_009_41x42.png',
  TOWN_TREES_010_47X32: BATTLE_PKG + 'images/map/town/trees_010_47x32.png',
  TOWN_TREES_011_49X32: BATTLE_PKG + 'images/map/town/trees_011_49x32.png',
  TOWN_TREES_012_43X36: BATTLE_PKG + 'images/map/town/trees_012_43x36.png',
  TOWN_TREES_013_40X38: BATTLE_PKG + 'images/map/town/trees_013_40x38.png',
  TOWN_TREES_014_41X40: BATTLE_PKG + 'images/map/town/trees_014_41x40.png',
  TOWN_TREES_015_38X35: BATTLE_PKG + 'images/map/town/trees_015_38x35.png',
  TOWN_TREES_016_39X36: BATTLE_PKG + 'images/map/town/trees_016_39x36.png',
  TOWN_TREES_017_32X32: BATTLE_PKG + 'images/map/town/trees_017_32x32.png',

  // ==================== 主角默认立绘（静态，单帧） ====================
  HERO_ZHENBAO: BATTLE_PKG + 'images/characters_anim/transparent/zhenbao/idle/idle_01.png',
  HERO_LIXIAOBAO: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/idle/idle_01.png',
  AIMI: BATTLE_PKG + 'images/characters_anim/transparent/aimi/idle/idle_01.png',

  // ==================== 艾米通用施法精灵表 ====================
  // ★ 使用 sprite sheet 模式：单张图片包含所有cast帧，渲染时按 frameIdx 裁剪
  LIXIAOBAO_CAST_SPRITESHEET: BATTLE_PKG + 'images/characters_anim/transparent/lixiaobao/cast_universal.png',

  // ==================== 猫咪队员（静态） ====================
  CAT_AMY: 'images/cats/team/cat_amy.png',
  CAT_ANNIE: 'images/cats/team/cat_annie.png',
  CAT_QIANDUODUO: 'images/cats/team/cat_qianduoduo.png',
  CAT_XIAOBEI: 'images/cats/team/cat_xiaobei.png',

  // ==================== 猫咪图鉴（静态） ====================
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

  // ==================== UI 图标（静态） ====================
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

  // ==================== 地图（静态） ====================
  MAP_WORLD: 'images/map_world.png',

  // ================================================================
  //  序列帧资源（约定化自动生成 ↓）
  // ================================================================

  // --- 臻宝动画帧 ---
  ...buildFrames('HERO_ZHENBAO', 'images/characters_anim/transparent/zhenbao', [
    { action: 'walk',   frames: 8 },
    { action: 'idle',   frames: 8 },
    { action: 'attack', frames: 8 },
    { action: 'shield', frames: 8 },
    { action: 'buff',   frames: 8 },
    // ★ 受击帧：hurt_01 普通受击 / hurt_02 被击飞（仅臻宝已生成）
    { action: 'hurt',   frames: 2 },
  ]),

  // --- 李小宝动画帧 ---
  // ★ 所有施法/攻击动画已统一为 cast_universal.png 精灵表（LIXIAOBAO_CAST_SPRITESHEET），不使用单独的 attack 帧目录
  ...buildFrames('HERO_LIXIAOBAO', 'images/characters_anim/transparent/lixiaobao', [
    { action: 'walk',         frames: 8 },
    { action: 'idle',         frames: 8 },
    // ★ 野外实时战斗受击帧：hurt_01 普通受击 / hurt_02 被击飞（2026-08-17 AI 生成）
    { action: 'hurt',         frames: 2 },
  ]),

  // --- 李小宝命中特效（key 前缀不含 action，目录名≠文件前缀）---
  ...buildFramesEx('LXB_HIT_FIREBALL', 'images/characters_anim/transparent/lixiaobao/hit_fireball', [
    { action: '', frames: 24, filePrefix: 'fireball_hit' },
  ]),
  ...buildFramesEx('LXB_HIT_ICE', 'images/characters_anim/transparent/lixiaobao/hit_ice', [
    { action: '', frames: 11, filePrefix: 'ice_shard_hit' },
  ]),
  ...buildFramesEx('LXB_HIT_LIGHTNING', 'images/characters_anim/transparent/lixiaobao/hit_lightning', [
    { action: '', frames: 12, filePrefix: 'lightning_hit' },
  ]),

  // --- 猫咪主角野外动画 ---
  ...buildFrames('CAT', 'images/characters_anim/transparent/cat', [
    { action: 'idle', frames: 8 },
    { action: 'walk', frames: 12 },
  ]),

  // --- 李小宝技能施法特效：已统一为 cast_universal.png 精灵表（LIXIAOBAO_CAST_SPRITESHEET）---

  // --- 李小宝技能命中特效 ---
  // ★ 注意：这些特效的目录名 ≠ 文件前缀（如 hit_fireball/ 下是 fireball_hit_XX.png）
  //   baseDir 写到文件所在目录（含子目录），filePrefix 是实际文件前缀，
  //   用空字符串作为目录部分避免 buildFrames 多拼一层
  ...buildFramesEx('EFFECT_FIREBALL_HIT', 'images/characters_anim/transparent/lixiaobao/hit_fireball', [
    { action: '', frames: 24, filePrefix: 'fireball_hit' },
  ]),
  ...buildFramesEx('EFFECT_ICE_SHARD_HIT', 'images/characters_anim/transparent/lixiaobao/hit_ice', [
    { action: '', frames: 11, filePrefix: 'ice_shard_hit' },
  ]),
  ...buildFramesEx('EFFECT_LIGHTNING_HIT', 'images/characters_anim/transparent/lixiaobao/hit_lightning', [
    { action: '', frames: 12, filePrefix: 'lightning_hit' },
  ]),

  // --- 史莱姆猫动画（注意：idle 帧号不带零，attack/skill 用非连续4位帧号）---
  ...buildFrames('SLIME_CAT', 'images/characters_anim/transparent/slime_cat', [
    { action: 'idle',   frames: 7,  pad: 1 },           // idle_1 ~ idle_7
    { action: 'attack', frameList: [8, 10, 12, 14, 16, 18, 20, 22], pad: 4, filePrefix: 'attack' },
    { action: 'skill',  frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80], pad: 4, filePrefix: 'skill' },
    { action: 'walk',   frames: 12 },
  ]),

  // --- 暗影鼠动画 ---
  ...buildFrames('SHADOW_MOUSE', 'images/characters_anim/transparent/shadow_mouse', [
    { action: 'idle',   frames: 6 },
    { action: 'attack', frames: 7 },
    { action: 'skill',  frames: 8 },
    { action: 'walk',   frames: 8 },
  ]),

  // --- 暗影鼠·补帧顺滑版（walk 8→15 帧，其余复用原始）--- [battle 分包资源]
  ...buildFrames('SHADOW_MOUSE_SMOOTH', 'images/characters_anim/transparent/shadow_mouse', [
    { action: 'idle',   frames: 6 },
    { action: 'attack', frames: 7 },
    { action: 'skill',  frames: 8 },
  ]),
  ...buildFramesEx('SHADOW_MOUSE_SMOOTH', 'images/characters_anim/transparent/shadow_mouse/walk_tween', [
    { action: 'walk',   frames: 15, pad: 2, filePrefix: 'frame' },
  ]),

  // --- 史莱姆猫·换肤变体（同模异色，色相旋转派生）--- [battle 分包资源]
  // 赤焰(20°) / 碧波(180°) / 魅紫(300°)，路径指向 slime_cat_skins/hue_xx/
  ...buildFrames('FLAME_SLIME', 'images/characters_anim/transparent/slime_cat_skins/hue_20', [
    { action: 'idle',   frames: 7,  pad: 1 },
    { action: 'attack', frameList: [8, 10, 12, 14, 16, 18, 20, 22], pad: 4, filePrefix: 'attack' },
    { action: 'skill',  frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80], pad: 4, filePrefix: 'skill' },
    { action: 'walk',   frames: 12 },
  ]),
  ...buildFrames('AQUA_SLIME', 'images/characters_anim/transparent/slime_cat_skins/hue_180', [
    { action: 'idle',   frames: 7,  pad: 1 },
    { action: 'attack', frameList: [8, 10, 12, 14, 16, 18, 20, 22], pad: 4, filePrefix: 'attack' },
    { action: 'skill',  frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80], pad: 4, filePrefix: 'skill' },
    { action: 'walk',   frames: 12 },
  ]),
  ...buildFrames('VIOLET_SLIME', 'images/characters_anim/transparent/slime_cat_skins/hue_300', [
    { action: 'idle',   frames: 7,  pad: 1 },
    { action: 'attack', frameList: [8, 10, 12, 14, 16, 18, 20, 22], pad: 4, filePrefix: 'attack' },
    { action: 'skill',  frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80], pad: 4, filePrefix: 'skill' },
    { action: 'walk',   frames: 12 },
  ]),

  // --- 艾米动画帧（位于 battle 分包，避免占主包体积）---
  ...buildFrames('AIMI', 'images/characters_anim/transparent/aimi', [
    { action: 'walk',    frames: 8 },
    { action: 'idle',    frames: 8 },
    { action: 'attack',  frames: 8 },
    { action: 'buff',    frames: 8 },
    { action: 'skill',   frames: 8 },
    { action: 'support', frames: 8 },
  ]),

  // --- 石像守卫动画（AoE3 风格 8 帧透明 PNG，4×2 网格切片自 _source_backup/石像守卫）---
  ...buildFrames('STONE_GOLEM', 'images/characters_anim/transparent/stone_golem', [
    { action: 'idle',   frames: 8 },
    { action: 'walk',   frames: 8 },
    { action: 'attack', frames: 8 },
    { action: 'skill',  frames: 8 },
  ]),

  // --- 打手头目动画（4×2 网格切片自 _source_backup/打手头目）---
  ...buildFrames('THUG_LEADER', 'images/characters_anim/transparent/thug_leader', [
    { action: 'idle',   frames: 8 },
    { action: 'walk',   frames: 8 },
    { action: 'attack', frames: 8 },
    { action: 'skill',  frames: 8 },
  ]),

  // --- 塔楼守护者动画（4×2 网格切片自 _source_backup/塔楼守护者，v7.3 含 removeBottomIsolated 删 AI 源图标签）---
  ...buildFrames('TOWER_GUARDIAN', 'images/characters_anim/transparent/tower_guardian', [
    { action: 'idle',   frames: 8 },
    { action: 'walk',   frames: 8 },
    { action: 'attack', frames: 8 },
    { action: 'skill',  frames: 8 },
  ]),
}
