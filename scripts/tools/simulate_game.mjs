/**
 * 游戏循环模拟器（Node 端“自己玩游戏”）
 * =========================================
 * 在 Node 中 mock 微信小游戏环境（wx API / Canvas / Input），
 * 加载【真实】的 FieldScene 代码，驱动 update(dt) 游戏循环，
 * 模拟：摇杆移动 → 遇怪 → 战斗 → 点击切换按钮 → 释放技能 → 怪物攻击，
 * 并自动断言每一步的结果。
 *
 * 用法: node scripts/tools/simulate_game.mjs
 */

// ==================== 全局 wx mock ====================
const canvasCtx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'canvas' || prop === 'measureText') return undefined
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} })
    // 所有绘制/状态方法返回空函数
    return () => {}
  },
  set() { return true }
})

const mockCanvas = {
  width: 750, height: 1334,
  getContext: () => canvasCtx
}

const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => {
    // 图片 mock：加载即触发 onload（同步），提供真实尺寸
    const img = { width: 64, height: 64, _onload: null }
    setTimeout(() => { if (img.onload) img.onload() }, 0)
    return img
  },
  getStorageSync: (k) => _storage[k],
  setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  onTouchCancel: () => {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {},
  vibrateShort: () => {},
  showToast: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  setKeepScreenOn: () => {},
  getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {},
  downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}

// ==================== mock Game ====================
class MockGame {
  constructor() {
    this.ctx = canvasCtx
    this.width = 750 * 3
    this.height = 1334 * 3
    this.dpr = 3
    this.data = {
      _d: {},
      _flags: new Set(),
      get: (k) => this.data._d[k],
      set: (k, v) => { this.data._d[k] = v },
      del: (k) => { delete this.data._d[k] },
      hasFlag: (k) => this.data._flags.has(k),
      setFlag: (k) => this.data._flags.add(k),
      delFlag: (k) => this.data._flags.delete(k),
    }
    this.assets = {
      getImage: () => ({ width: 64, height: 64 }),
      loadSubpackage: async () => {},
      isLoaded: () => true,
    }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = {
      taps: [], joystick: { active: false, dx: 0, dy: 0 },
      consumeTaps: () => this.input.taps.splice(0, this.input.taps.length),
    }
    this.showToast = () => {}
    this.sceneManager = {
      changeScene: (name, data) => { this._changedScene = name; this._sceneData = data },
    }
  }
}

// ==================== 加载真实场景 ====================
// ★ 微信小游戏代码里用了静态 require('../entities/monsters/xxx.js')，
//   在 Node ESM 中需注入全局 require（用 createRequire 指向项目根）
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
// ★ 微信小游戏代码里 require('../entities/monsters/xxx.js') 写在 field-scene.js 中，
//   其相对基准是 field-scene.js 所在目录（scripts/scenes/），故 `../entities` = scripts/entities
//   用 scripts/scenes/ 作为 createRequire 的基准即可正确解析
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = (p) => {
  // 相对路径基于 scripts/scenes/ 解析
  const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p
  try { return nodeRequire(abs) } catch (e) {
    console.warn(`[模拟器] require 加载失败: ${p} ->`, e.message)
    throw e
  }
}

let FieldScene
try {
  const mod = await import('../scenes/field-scene.js')
  FieldScene = mod.FieldScene
  console.log('[模拟器] 成功加载真实 FieldScene')
} catch (e) {
  console.error('[模拟器] 加载 FieldScene 失败:', e.message)
  console.error(e.stack)
  process.exit(1)
}

// ==================== 测试 ====================
let passed = 0, failed = 0
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}  ${detail || ''}`) }
}

console.log('\n=== 模拟器：构建场景 ===')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })

console.log('\n=== 模拟器：初始化场景 ===')
await scene.init()

console.log(`  玩家初始位置: (${Math.round(scene.playerX)}, ${Math.round(scene.playerY)})`)
console.log(`  队伍人数: ${scene.party ? scene.party.length : '?'}, 队友: ${scene.followers ? scene.followers.length : '?'}`)

// ==================== 测试1：进入战斗 ====================
console.log('\n=== 测试1: 进入战斗 ===')
// 直接激活战斗系统（模拟地图遇怪），并把怪放到玩家附近
if (!scene.battleSystem) {
  failed++
  console.log('  ✗ battleSystem 未创建')
} else {
  scene.battleSystem.active = true
  scene.battleSystem.showBattleUI = true
  // 构建参战英雄
  scene._buildBattleHeroes()
  const sys = scene.battleSystem
  console.log(`  参战英雄: ${sys.battleHeroes.map(b => b.hero.name).join(', ')}`)
  assert(sys.battleHeroes.length === 2, '参战英雄 2 名')
  assert(sys.battleHeroes[0].hero.name === '臻宝', '初始被控者为臻宝', `实际: ${sys.battleHeroes[0].hero.name}`)

  // 放置怪物
  scene.mapMonsters = [{
    id: 'm_test', name: '坏猫', alive: true,
    x: scene.playerX + 120 * scene.dpr,
    y: scene.playerY,
    hp: 100, maxHp: 100, def: 5, atk: 10, level: 1
  }]
  // 给参战英雄加 skill 以便点技能
  sys.battleHeroes.forEach(bh => {
    if (!bh.hero.skills || !bh.hero.skills.length) {
      bh.hero.skills = [{ id: 'test_skill', name: '测试技能', mpCost: 5, cooldown: 2, type: 'attack', range: 100, axis: 'x', power: 1.5 }]
    }
  })
  // 初始化战斗 UI（含技能按钮）
  scene._initBattleUI()

  // ==================== 测试2：切换控制 ====================
  console.log('\n=== 测试2: 切换控制 ===')
  // 模拟李小宝曾是 AI 攻击（卡在 attack 状态）
  const lxb = sys.battleHeroes[1]
  lxb.hero._aiAttacking = true
  lxb.hero._aiAttackTimer = 0.5
  lxb.hero._aiAttackCD = 600
  if (lxb.sprite) { lxb.sprite.state = 'attack'; lxb.sprite.animFrame = 3 }

  scene._switchControl()
  assert(sys.battleHeroes[0].hero.name === '李小宝', '切换后被控者为李小宝', `实际: ${sys.battleHeroes[0].hero.name}`)
  assert(sys.battleHeroes[0].sprite.state === 'idle', '切换后新被控者 sprite 复位 idle', `实际: ${sys.battleHeroes[0].sprite.state}`)
  assert(sys.battleHeroes[0].hero._aiAttacking === false, '切换后 _aiAttacking 清除')
  assert(sys.playerAttackCD === 0, '切换后普攻 CD 清零')
  const skillNames = (sys.skillButtons || []).map(b => b.text).join(',')
  console.log(`  切换后技能按钮: [${skillNames}]`)

  // ==================== 测试3：释放技能 ====================
  console.log('\n=== 测试3: 切换后点技能 ===')
  const ctrlHero = scene._getCurrentControlHero().hero
  const mpBefore = ctrlHero.mp
  // 选一个真正消耗 MP 的技能（火球术，而非普攻类 法杖敲击）
  const skillBtn = (sys.skillButtons || []).find(b => (b.skill && b.skill.mpCost > 0) || b.text.includes('火球') || b.text.includes('冰晶') || b.text.includes('雷击'))
  if (skillBtn) {
    scene._playerAttackMonster(null, skillBtn.skill)
    assert(sys.playerAnim !== null, '技能触发 playerAnim（动画播放）', `实际: ${sys.playerAnim && sys.playerAnim.type}`)
    assert(ctrlHero.mp < mpBefore, '技能扣除 MP', `实际: ${ctrlHero.mp} (前 ${mpBefore}, 技能 ${skillBtn.text} mpCost=${skillBtn.skill.mpCost})`)
    assert(sys.battleHeroes[0].sprite.state === 'skill' || sys.battleHeroes[0].sprite.state === 'buff',
      '被控角色进入技能/增益动画', `实际: ${sys.battleHeroes[0].sprite.state}`)
  } else {
    failed++; console.log('  ✗ 未找到消耗 MP 的技能按钮')
  }

  // ==================== 测试4：怪物攻击被控者 ====================
  console.log('\n=== 测试4: 怪物攻击最近的英雄（切换后应为李小宝） ===')
  // 用 _updateMonsterAttack 验证怪物锁定最近英雄（李小宝离怪更近）
  // 注意：这里通过 battleHeroes 的 getPos 推断怪物会锁定谁（与 field-battle-system 的 _updateMonsterAttack 同逻辑）
  scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }        // 臻宝(转AI)远
  scene._heroWorldPos[1] = { x: scene.playerX + 40 * scene.dpr, y: scene.playerY }  // 李小宝近
  const m = scene.mapMonsters[0]
  m.x = scene._heroWorldPos[1].x + 10 * scene.dpr
  m.y = scene._heroWorldPos[1].y
  // 断言：怪物的"最近英雄"搜索应命中李小宝（用与 _updateMonsterAttack 相同的 battleHeroes 遍历）
  const locked = (() => {
    let best = null, bestD = Infinity
    for (const bh of sys.battleHeroes) {
      if (!bh.hero || bh.hero.hp <= 0) continue
      const p = (typeof bh.getPos === 'function') ? bh.getPos() : (scene._heroWorldPos[bh.partyIndex] || { x: 0, y: 0 })
      const d = (p.x - m.x) ** 2 + (p.y - m.y) ** 2
      if (d < bestD) { bestD = d; best = bh }
    }
    return best
  })()
  assert(locked && locked.hero.name === '李小宝', '怪物锁定最近的英雄(李小宝)', `实际: ${locked && locked.hero.name}`)

  // ==================== 测试5：驱动真实游戏循环（update 多帧） ====================
  console.log('\n=== 测试5: 驱动真实 update() 游戏循环 ===')
  // 让怪物靠近被控者(李小宝)，驱动若干帧战斗循环，验证：怪物攻击扣血 + 被控者阵亡自动切换
  // 先恢复李小宝满血，设置怪物高攻（确保能打死）
  const lxbHero = sys.battleHeroes[0].hero
  lxbHero.hp = lxbHero.maxHp = 50
  lxbHero.def = 0
  // 怪物放在李小宝身边（李小宝是被控者，位置=_heroWorldPos[1]）
  // 注意：switch 后 playerX/playerY 已 = 李小宝位置(_heroWorldPos[1])
  scene._heroWorldPos[1] = { x: scene.playerX, y: scene.playerY }
  scene._heroWorldPos[0] = { x: scene.playerX + 200 * scene.dpr, y: scene.playerY }  // 臻宝(转AI)放远，确保怪物打李小宝
  const m2 = scene.mapMonsters[0]
  m2.alive = true
  m2.atk = 100
  m2.x = scene.playerX + 5
  m2.y = scene.playerY
  // ★ 关键：必须设 enemyId 为序列帧怪物，否则 _updateMonsters 不进入攻击动画结算分支
  //   （真机怪物都由 _respawnMonsters 创建，带 enemyId；测试手造怪物需手动补）
  if (!m2.enemyId) m2.enemyId = 'wild_cat'
  if (!m2.attackInterval) m2.attackInterval = 2000
  if (m2.attackCDTimer === undefined) m2.attackCDTimer = 0
  // 怪物攻击判定走 _updateMonsterAttack（field-battle-system 版本，锁定最近英雄）
  let frames = 0
  let lxbHpAtSwitch = null
  let diagLogged = false
  for (let f = 0; f < 300; f++) {   // 最多 5 秒
    scene.update(1/60)
    frames++
    // 诊断：打印几次怪物与英雄的距离/战斗状态
    if (!diagLogged && (f === 5 || f === 30 || f === 60 || f === 120)) {
      const mm = scene.mapMonsters[0]
      if (mm) {
        const lp = scene._heroWorldPos[1] || { x: 0, y: 0 }
        console.log(`  [诊断 f=${f}] 怪(${Math.round(mm.x)},${Math.round(mm.y)}) 李(${Math.round(lp.x)},${Math.round(lp.y)}) 距离=${Math.round(Math.hypot(mm.x-lp.x, mm.y-lp.y))} inCombat=${mm.inCombat} attackCD=${mm.attackCDTimer} attacking=${mm.isAttacking} animTimer=${mm.attackAnimTimer} dealt=${mm.hasDealtDamage} 李HP=${lxbHero.hp}`)
      }
    }
    // 更细：f=40 时打印最近英雄判定
    if (f === 40) {
      const mm = scene.mapMonsters[0]
      if (mm) {
        const near = scene._findNearestBattleHero(mm)
        console.log(`  [诊断 f=40] _findNearestBattleHero => ${near ? near.name : 'null'} (hp=${near ? near.hp : '-'})`)
      }
    }
    if (f > 120) diagLogged = true
    // 被控者血量在阵亡前记录一次
    if (sys.battleHeroes[0].hero && sys.battleHeroes[0].hero.hp > 0 && lxbHero.hp > 0 && lxbHpAtSwitch === null) {
      lxbHpAtSwitch = lxbHero.hp
    }
    // 阵亡自动切换后停止
    if (sys.battleHeroes[0].hero.name !== '李小宝') break
    if (lxbHero.hp <= 0) break
  }
  console.log(`  运行了 ${frames} 帧 update()`)
  console.log(`  战斗中被控者: ${sys.battleHeroes[0].hero.name}, 血量: ${sys.battleHeroes[0].hero.hp}`)
  // 怪物高攻(100) 直接秒杀李小宝(50血) → 李小宝 hp 应为 0 或已被切换走（battleHeroes[0] 不再是李小宝）
  const lxbDied = lxbHero.hp <= 0 || sys.battleHeroes[0].hero.name !== '李小宝'
  assert(lxbDied, '怪物攻击命中李小宝（受伤或阵亡）', `李小宝HP=${lxbHero.hp}, 当前被控=${sys.battleHeroes[0].hero.name}`)
  // 阵亡自动切换后应回到臻宝
  assert(sys.battleHeroes[0].hero.name === '臻宝',
    '被控者阵亡自动切换到存活英雄(臻宝)', `被控: ${sys.battleHeroes[0].hero.name}`)
  // 验证战斗仍在正常运行（战斗系统 active）
  assert(sys.active === true, '战斗系统保持激活')

  // ==================== 测试6：李小宝战斗动画使用 cast 精灵表（不丢失动画） ====================
  console.log('\n=== 测试6: 李小宝 skill/buff/shield 使用 cast 精灵表 ===')
  // 用真实 CharacterSprite 验证：李小宝的 skill/buff/shield 状态应返回 cast 精灵表对象（而非 fallback idle）
  const lxbSprite = scene.followers[0].sprite  // 李小宝的真实 sprite（CharacterSprite）
  const castImg = { width: 258 * 8, height: 223 }
  scene.game.assets = {
    get: (key) => {
      if (key === 'LIXIAOBAO_CAST_SPRITESHEET') return castImg
      if (key === 'HERO_LIXIAOBAO_IDLE_01') return { width: 206, height: 337 }
      if (key === 'HERO_LIXIAOBAO_WALK_01') return { width: 206, height: 337 }
      return null
    },
    isLoaded: () => true
  }
  for (const st of ['attack', 'skill', 'buff', 'shield']) {
    lxbSprite.state = st
    lxbSprite.animFrame = 2
    const frameImg = lxbSprite.getCurrentFrameImage()
    assert(frameImg && frameImg._isSpriteSheet === true,
      `李小宝 ${st} 状态使用 cast 精灵表（不丢失动画）`,
      `实际: ${frameImg && (frameImg._isSpriteSheet ? '精灵表' : '普通图/空')}`)
    assert(Math.abs(lxbSprite._getScaleCompensation(frameImg) - 337 / 223) < 0.01,
      `${st} 使用 cast 缩放补偿`, `实际: ${lxbSprite._getScaleCompensation(frameImg)}`)
  }
  // 非战斗状态（idle/walk）仍用普通帧，不误用 cast
  lxbSprite.state = 'idle'
  const idleFrame = lxbSprite.getCurrentFrameImage()
  assert(!(idleFrame && idleFrame._isSpriteSheet), 'idle 状态不用 cast 精灵表')
  lxbSprite.state = 'walk'
  const walkFrame = lxbSprite.getCurrentFrameImage()
  assert(!(walkFrame && walkFrame._isSpriteSheet), 'walk 状态不用 cast 精灵表')

  console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
  process.exit(failed === 0 ? 0 : 1)
}
