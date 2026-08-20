/**
 * 验证臻宝盾击：突进(lunge) + 霸体 + 护盾延时 + 2.5D 层级显示
 * 用法: node devtools/verify_shield_bash.mjs
 */
const canvasCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas' || p === 'measureText') return undefined
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} })
    return () => {}
  },
  set() { return true }
})
const mockCanvas = { width: 750, height: 1334, getContext: () => canvasCtx }
const _storage = {}
globalThis.wx = {
  createCanvas: () => mockCanvas,
  createImage: () => { const img = { width: 64, height: 64 }; setTimeout(() => img.onload && img.onload(), 0); return img },
  getStorageSync: k => _storage[k], setStorageSync: (k, v) => { _storage[k] = v },
  getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1334, pixelRatio: 3, screenWidth: 750, screenHeight: 1334 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
  requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 16),
  canvasToTempFilePath: () => {}, vibrateShort: () => {}, showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  setKeepScreenOn: () => {}, getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 90, left: 280, right: 470, width: 190, height: 40 }),
  onShow: () => {}, onHide: () => {}, downloadFile: () => ({ onProgressUpdate: () => {}, onHeadersReceived: () => {} }),
}
class MockGame {
  constructor() {
    this.ctx = canvasCtx; this.width = 750 * 3; this.height = 1334 * 3; this.dpr = 3
    this.data = { _d: {}, _flags: new Set(), get: k => this.data._d[k], set: (k, v) => { this.data._d[k] = v }, del: k => { delete this.data._d[k] }, hasFlag: k => this.data._flags.has(k), setFlag: k => this.data._flags.add(k), delFlag: k => this.data._flags.delete(k) }
    this.assets = { getImage: () => ({ width: 64, height: 64 }), loadSubpackage: async () => {}, isLoaded: () => true }
    this.audio = { play: () => {}, playSound: () => {} }
    this.input = { taps: [], joystick: { active: false, dx: 0, dy: 0 }, consumeTaps: () => this.input.taps.splice(0) }
    this.showToast = () => {}
    this.sceneManager = { changeScene: () => {} }
  }
}
import { createRequire } from 'module'
import path from 'path'
const projectRoot = process.cwd()
const scenesDir = path.resolve(projectRoot, 'scripts', 'scenes')
const nodeRequire = createRequire(path.join(scenesDir, 'x.js'))
globalThis.require = p => { const abs = p.startsWith('.') ? path.resolve(scenesDir, p) : p; return nodeRequire(abs) }
const { FieldScene } = await import('../scripts/scenes/field-scene.js')
const { isHeroSuperArmor } = await import('../scripts/systems/combat-state.js')

let passed = 0, failed = 0
const assert = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`) } else { failed++; console.log(`  ✗ ${n}  ${d || ''}`) } }
const fakeCtx = new Proxy({}, { get: (t, p) => (p === 'createRadialGradient' || p === 'createLinearGradient') ? () => ({ addColorStop() {} }) : () => {}, set: () => true })

console.log('\n=== 构建 + 初始化场景 ===')
const game = new MockGame()
const scene = new FieldScene(game, { area: 'grassland' })
await scene.init()
const dpr = scene.dpr
const sys = scene.battleSystem
sys.active = true
scene._buildBattleHeroes()
const zhenbao = sys.battleHeroes[0].hero
assert(zhenbao.id === 'zhen宝' || zhenbao.id === 'zhenbao', '被控者默认是臻宝', `id=${zhenbao.id}`)
// 怪物放在臻宝右侧（朝向 +x），确保突进方向 = +1
const monster = { id: 'm_sb', name: '坏猫', alive: true, enemyId: 'wild_cat', x: scene.playerX + 120 * dpr, y: scene.playerY, hp: 200, maxHp: 200, def: 5, atk: 10, level: 1, attackInterval: 9999, attackCDTimer: 9999 }
scene.mapMonsters = [monster]
scene._initBattleUI()
const sbBtn = (sys.skillButtons || []).find(b => b.skill && b.skill.id === 'shield_bash')
assert(!!sbBtn, '存在盾击技能按钮')

// ============ A. 霸体 + 护盾延时 + 突进位移（集成：真实 cast + 驱动 update） ============
console.log('\n=== A. 释放盾击：霸体 / 护盾延时 / 突进 ===')
assert(zhenbao._castSuperArmor !== true, '释放前无霸体标记')
const x0 = scene.playerX
scene.facingLeft = false
scene._playerAttackMonster(monster, sbBtn.skill)
const cfgLunge = sbBtn.skill.lungeDist * dpr
assert(sys.playerAnim && sys.playerAnim.type === 'shield', '盾击进入 shield 动画', `type=${sys.playerAnim && sys.playerAnim.type}`)
assert(sys.playerAnim.lungeDist === cfgLunge, `突进距离写入 playerAnim(${sbBtn.skill.lungeDist}*dpr)`, `lungeDist=${sys.playerAnim && sys.playerAnim.lungeDist}`)
assert(zhenbao._castSuperArmor === true, '释放瞬间即获得霸体(突进全程不被打断)', `=${zhenbao._castSuperArmor}`)
assert(sys.playerAnim.lungeDist === cfgLunge, `突进距离写入 playerAnim(${sbBtn.skill.lungeDist}*dpr)`, `lungeDist=${sys.playerAnim && sys.playerAnim.lungeDist}`)
// 驱动 ~0.6s（> 突进0.18s + 命中延迟0.4s）
for (let f = 0; f < 36; f++) scene.update(1 / 60)
const x1 = scene.playerX
const lungeMoved = x1 - x0
assert(lungeMoved > cfgLunge * 0.75 && lungeMoved < cfgLunge * 1.15, `突进使臻宝向前位移 ≈ ${Math.round(lungeMoved / dpr)}px(逻辑, 配置${sbBtn.skill.lungeDist})`, `Δ=${Math.round(lungeMoved / dpr)}`)
assert(zhenbao._shield > 0, '盾击生成护盾', `shield=${zhenbao._shield}`)
assert(zhenbao._shieldTimer > 3.0 && zhenbao._shieldTimer <= 4.0, `护盾持续 ≈4s(更长于旧2s): ${zhenbao._shieldTimer.toFixed(2)}s`, `=${zhenbao._shieldTimer}`)
assert(!!sys.castLockTimer || zhenbao._castSuperArmor, '突进期间移动被锁/霸体覆盖')

// ============ B. 突进撞障碍：整段取消（不穿墙） ============
console.log('\n=== B. 突进遇障碍取消（直接单元测 _applyShieldBashLunge） ===')
// 复位玩家到已知位置，正前方放一大块障碍物（逻辑坐标，setObstacles 会再 ×dpr，与真实地图数据一致）
scene.playerX = 1000 * dpr
scene.playerY = 1000 * dpr
if (!scene._heroWorldPos) scene._heroWorldPos = []
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
const plx = scene.playerX / dpr   // 玩家逻辑坐标
const ply = scene.playerY / dpr
scene.obstacles = [{ type: 'rect', x: plx + 10, y: ply - 200, width: 300, height: 400, name: '石墙' }]
if (scene._collisionEngine && scene._collisionEngine.setObstacles) scene._collisionEngine.setObstacles(scene.obstacles)
const paObs = { lungeDist: 60 * dpr, dir: 1, lungeDuration: 0.18, lungeElapsed: 0, _lungeDone: false }
const beforeObs = scene.playerX
for (let f = 0; f < 20; f++) scene._applyShieldBashLunge(paObs, 1 / 60)
const afterObs = scene.playerX
const movedObs = afterObs - beforeObs
assert(movedObs < 40 * dpr, `遇障碍突进被取消(仅前移 ${Math.round(movedObs / dpr)}px 即停)`, `Δ=${Math.round(movedObs / dpr)}px, _lungeDone=${paObs._lungeDone}`)
assert(paObs._lungeDone === true, '障碍触发后 _lungeDone 标记（不再推进）')
// 对照：无障碍时应能走完 60px
scene.obstacles = []
if (scene._collisionEngine && scene._collisionEngine.setObstacles) scene._collisionEngine.setObstacles([])
scene.playerX = 1000 * dpr
const paClear = { lungeDist: 60 * dpr, dir: 1, lungeDuration: 0.18, lungeElapsed: 0, _lungeDone: false }
for (let f = 0; f < 20; f++) scene._applyShieldBashLunge(paClear, 1 / 60)
assert((scene.playerX - 1000 * dpr) > 50 * dpr, `无障碍时突进走完 ≈${Math.round((scene.playerX - 1000 * dpr) / dpr)}px`, `Δ=${Math.round((scene.playerX - 1000 * dpr) / dpr)}`)

// ============ C. 突进不越地图边界 ============
console.log('\n=== C. 突进地图边界钳制 ===')
const mw = scene.mapWidth || 4000 * dpr
scene.playerX = mw - 60 * dpr          // 紧贴右边界
const paEdge = { lungeDist: 60 * dpr, dir: 1, lungeDuration: 0.18, lungeElapsed: 0, _lungeDone: false }
for (let f = 0; f < 20; f++) scene._applyShieldBashLunge(paEdge, 1 / 60)
const margin = 50 * dpr
assert(scene.playerX <= mw - margin + 1, `突进后不越右边界(${Math.round(scene.playerX / dpr)} ≤ ${Math.round((mw - margin) / dpr)})`)

// ============ D. 护盾按 2.5D 层级显示（layer=2 实体） ============
console.log('\n=== D. 护盾 2.5D 层级实体 ===')
// 用假 engine 捕获 _renderYSortedEntities 注册的实体
const captured = []
const fakeEngine = {
  setCamera() {}, clear() {},
  addDecoration() {}, addObstacle() {}, addChest() {}, addMonster() {}, addPlayer() {},
  addEntity(e) { captured.push(e) }, render() {}
}
const realEngine = scene._renderer2d5
scene._renderer2d5 = fakeEngine
// 确保持盾英雄与坐标就位
zhenbao._shield = 50; zhenbao._shieldMax = 50; zhenbao._shieldTimer = 4.0
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
scene._renderYSortedEntities(fakeCtx)
scene._renderer2d5 = realEngine
const bubble = captured.find(e => e.type === 'heroShieldBubble')
assert(!!bubble, '护盾以 heroShieldBubble 实体加入 2.5D 渲染层')
assert(bubble && bubble.layer === 2, '护盾实体处于 layer=2（与角色/霸体光环同层，Y 排序）', `layer=${bubble && bubble.layer}`)
assert(bubble && typeof bubble.sortY === 'number', '护盾实体带 sortY（脚底世界Y，前后遮挡正确）', `sortY=${bubble && bubble.sortY}`)
// 护盾清零后不应再生成气泡
captured.length = 0
zhenbao._shield = 0
scene._renderer2d5 = fakeEngine
scene._renderYSortedEntities(fakeCtx)
scene._renderer2d5 = realEngine
assert(!captured.find(e => e.type === 'heroShieldBubble'), '护盾消失后不再渲染气泡实体')

// ============ E. 霸体在动画结束后解除（修复永久霸体 → 永久免疫击飞/眩晕）============
console.log('\n=== E. 盾击霸体在动画结束后解除（修复永久霸体）===')
const monster2 = { id: 'm_sb2', name: '坏猫2', alive: true, enemyId: 'wild_cat', x: scene.playerX + 120 * dpr, y: scene.playerY, hp: 500, maxHp: 500, def: 5, atk: 10, level: 1, attackInterval: 9999, attackCDTimer: 9999 }
scene.mapMonsters = [monster2]
scene.facingLeft = false
scene._playerAttackMonster(monster2, sbBtn.skill)
assert(zhenbao._castSuperArmor === true, '释放瞬间霸体 true', `=${zhenbao._castSuperArmor}`)
assert(isHeroSuperArmor({ hero: zhenbao }) === true, '释放期间 isHeroSuperArmor=true（霸体生效）')
// 驱动 90 帧(1.5s) 超过动画时长(8*0.15=1.2s)，确保动画结束
for (let f = 0; f < 90; f++) scene.update(1 / 60)
assert(zhenbao._castSuperArmor === false, '动画结束后霸体标记解除（不再永久霸体）', `=${zhenbao._castSuperArmor}`)
assert(sys.playerAnim === null, '动画结束后 playerAnim 已置空')
assert(isHeroSuperArmor({ hero: zhenbao }) === false, 'isHeroSuperArmor 复位 false（光明冲锋可施加击飞/眩晕）')

// ============ F. 艾米光明冲锋落地对「非霸体玩家」施加击飞+眩晕 ============
console.log('\n=== F. 光明冲锋落地击飞+眩晕（非霸体时生效）===')
if (!sys.damageTexts) sys.damageTexts = []
const lcHero = sys.battleHeroes[0]
zhenbao._castSuperArmor = false
zhenbao._knockback = null
zhenbao._stunned = 0
const lcMonster = { name: '艾米', x: scene.playerX, y: scene.playerY, atk: 50, _atkMul: 1 }
const lc = { skill: { power: 1, knockbackHeight: 70, stun: 1.0 }, targetX: scene.playerX, targetY: scene.playerY, aoeRadius: 120 * dpr }
scene._lightChargeImpact(lcMonster, lc)
assert(zhenbao._knockback != null, '非霸体时光明冲锋对玩家施加击飞', `kb=${zhenbao._knockback}`)
assert(zhenbao._knockback && zhenbao._knockback.stunAfter > 0, '击飞附带眩晕时长(落地后硬直)', `stun=${zhenbao._knockback && zhenbao._knockback.stunAfter}`)
// 复验：若玩家仍处于霸体（旧 bug 残留），应跳过击飞/眩晕
zhenbao._knockback = null
zhenbao._castSuperArmor = true
scene._lightChargeImpact(lcMonster, lc)
assert(zhenbao._knockback == null, '处于霸体时光明冲锋跳过击飞/眩晕（豁免逻辑正确）')
zhenbao._castSuperArmor = false

// ============ G/H. 盾击先击退到前方落点，伤害在落点(停下位置)结算 ============
console.log('\n=== G/H. 盾击：先把敌人往前撞，在停下的位置造成伤害 ===')
if (sbBtn) sbBtn.cooldown = 0   // 清零冷却以便重新释放
sys.active = true              // 确保战斗系统仍在运行（前序测试可能已结束战斗）
// 把玩家放到地图中部，避免前序测试突进后贴近边界、导致击退被地图边界钳制干扰测量
scene.playerX = 1000 * dpr
scene.playerY = 1000 * dpr
if (!scene._heroWorldPos) scene._heroWorldPos = []
scene._heroWorldPos[0] = { x: scene.playerX, y: scene.playerY }
// 复位臻宝受击硬直/精灵状态（前序测试未驱动 update 清理，避免 _hurtLock 残留拦截本次释放）
zhenbao._hurtLock = 0
if (sys.battleHeroes[0].sprite) { sys.battleHeroes[0].sprite.state = 'idle'; sys.battleHeroes[0].sprite.animFrame = 0; sys.battleHeroes[0].sprite.animTimer = 0 }
sys.damageTexts = []
const KNOCK = (sbBtn.skill.knock.distance || 50) * dpr
const m3 = { id: 'm_sb3', name: '坏猫3', alive: true, enemyId: 'wild_cat', x: scene.playerX + 40 * dpr, y: scene.playerY, hp: 200, maxHp: 200, def: 5, atk: 10, level: 1, attackInterval: 9999, attackCDTimer: 9999 }
scene.mapMonsters = [m3]
sys.battleTarget = m3          // 重新锁定目标
scene.facingLeft = false
scene._updateCamera = function() {}   // 钉住相机：突进起手即结算，避免相机跟随突进移动导致飘字世界坐标还原偏差（专验落点语义）
const m3x0 = m3.x
scene._playerAttackMonster(m3, sbBtn.skill)
// 驱动 40 帧(≈0.67s) 越过突进0.18s + 命中延迟0.4s，确保 _applyShieldBashEffects 击退 + 主伤害结算都完成
for (let f = 0; f < 40; f++) scene.update(1 / 60)
const knocked = m3.x - m3x0
assert(knocked > KNOCK * 0.8 && knocked <= KNOCK * 1.5, `盾击把敌人往前撞 ≈${Math.round(knocked / dpr)}px(配置${sbBtn.skill.knock.distance})`, `Δ=${Math.round(knocked / dpr)}px`)
const hitText = sys.damageTexts.find(t => typeof t.text === 'string' && t.text.startsWith('-'))
if (hitText) {
  const wx = hitText.x + scene.cameraX
  assert(Math.abs(wx - m3.x) < 30 * dpr, `伤害飘字出现在敌人落点(世界x≈${Math.round(wx / dpr)}，落点${Math.round(m3.x / dpr)})`, `wx=${Math.round(wx / dpr)}, 落点=${Math.round(m3.x / dpr)}`)
  assert(Math.abs(wx - m3x0) >= KNOCK * 0.5, `飘字不在原位(与原位差 ${Math.round((wx - m3x0) / dpr)}px≈击退距离)`, `diff=${Math.round((wx - m3x0) / dpr)}`)
} else {
  assert(false, '盾击应产生伤害飘字', '未找到 -数字 飘字')
}

// ============ I. 盾击致死判定：hp=0 必须同步 alive=false ============
// 回归背景：_damageMonster 只减 hp 不置 alive（死亡判定统一由调用方负责），
// 盾击起手路径曾漏判 → 怪物 hp=0 却仍 alive=true（不掉落、不消失、继续攻击）。
console.log('\n=== I. 盾击致死：hp 归零同步置 alive=false ===')
if (sbBtn) sbBtn.cooldown = 0
sys.active = true
const m4 = { id: 'm_sb4', name: '残血猫', alive: true, enemyId: 'wild_cat', x: scene.playerX + 40 * dpr, y: scene.playerY, hp: 10, maxHp: 10, def: 5, atk: 10, level: 1, attackInterval: 9999, attackCDTimer: 9999 }
scene.mapMonsters = [m4]
sys.battleTarget = m4
scene.facingLeft = false
sys.damageTexts = []
zhenbao._hurtLock = 0
if (sys.battleHeroes[0].sprite) { sys.battleHeroes[0].sprite.state = 'idle'; sys.battleHeroes[0].sprite.animFrame = 0; sys.battleHeroes[0].sprite.animTimer = 0 }
scene._playerAttackMonster(m4, sbBtn.skill)
for (let f = 0; f < 40; f++) scene.update(1 / 60)
assert(m4.hp <= 0, `盾击伤害把 hp 扣到 0`, `hp=${m4.hp}`)
assert(m4.alive === false, 'hp=0 同步置 alive=false（被判定死亡）', `alive=${m4.alive}`)
assert(sys.battleTarget !== m4, '击杀后 battleTarget 不再指向已死怪物', `target=${sys.battleTarget && sys.battleTarget.name}`)

console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`)
process.exit(failed === 0 ? 0 : 1)
