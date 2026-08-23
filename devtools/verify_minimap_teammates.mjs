// verify_minimap_teammates.mjs
// 真实验证：副本小地图现在能显示「队友位置」(除被控者外的全部参战英雄)。
// 直接复用 FieldScene 真实原型方法 _renderMinimap（Object.create 避免重型构造），
// 用记录型 mock ctx 断言队友绿点被画出、且被控者不重复画成绿点。
import { FieldScene } from '../scripts/scenes/field-scene.js'

let passed = 0, failed = 0
const ok = (cond, msg, got) => {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.log(`  ✗ ${msg}${got !== undefined ? '  (got: ' + JSON.stringify(got) + ')' : ''}`) }
}

// ---- 记录型 2D ctx（按真实 canvas 语义：fill()/stroke() 调用时才确定颜色）----
function makeCtx() {
  const shapes = []
  const ctx = {
    shapes,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    _last: null,
    beginPath() { this._last = { x: 0, y: 0, r: 0, fill: null, stroke: null, _pushed: false } },
    closePath() {},
    fill() { if (this._last) { this._last.fill = this.fillStyle; if (!this._last._pushed) { shapes.push(this._last); this._last._pushed = true } } },
    stroke() { if (this._last) { this._last.stroke = this.strokeStyle; if (!this._last._pushed) { shapes.push(this._last); this._last._pushed = true } } },
    arc(x, y, r) { if (this._last) { this._last.x = x; this._last.y = y; this._last.r = r } },
    strokeRect() {}, fillRect() {},
    save() {}, restore() {},
    roundRect() {}, moveTo() {}, lineTo() {}, arcTo() {},
  }
  return ctx
}

function makeScene() {
  const scene = Object.create(FieldScene.prototype)
  scene.dpr = 2
  scene.width = 1280
  scene.height = 720
  scene.cameraX = 0
  scene.cameraY = 0
  scene.mapWidth = 6000
  scene.mapHeight = 4000
  scene.playerX = 3000
  scene.playerY = 2000
  scene.mapMonsters = [{ x: 1000, y: 1000, alive: true, isBoss: false }]
  scene.mapObjects = [{ x: 500, y: 500, collected: false }]
  return scene
}

console.log('=== A. 多队友副本：小地图应画出队友绿点 ===')
{
  const scene = makeScene()
  // 3 名参战英雄：index0=被控(臻宝)，1=李小宝，2=艾米
  scene._heroWorldPos = [
    { x: 3000, y: 2000 },        // partyIndex 0 被控
    { x: 3200, y: 2100 },        // partyIndex 1 队友
    { x: 2800, y: 1900 },        // partyIndex 2 队友
  ]
  scene.battleSystem = {
    battleHeroes: [
      { partyIndex: 0, hero: {} },
      { partyIndex: 1, hero: {} },
      { partyIndex: 2, hero: {} },
    ],
  }
  const ctx = makeCtx()
  scene._renderMinimap(ctx)

  const green = ctx.shapes.filter(a => a.fill === '#2ed573')
  const orange = ctx.shapes.filter(a => a.fill === '#ff9f43')
  ok(green.length === 2, '画出 2 个队友绿点（3 英雄 - 1 被控）', green.length)
  ok(orange.length === 1, '被控者用 1 个橙色玩家点表示', orange.length)

  const g0 = green[0], g1 = green[1]
  // 校验坐标换算：队友1 (3200,2100) → mapX + 3200/6000*mapSize
  const expectedX1 = (1280 - 80 * 2 - 15 * 2) + (3200 / 6000) * (80 * 2)
  const expectedY1 = (85 * 2) + (2100 / 4000) * (80 * 2)
  ok(Math.abs(g0.x - expectedX1) < 0.01 && Math.abs(g0.y - expectedY1) < 0.01,
     '队友绿点坐标按地图比例换算正确', { got: [g0.x, g0.y], exp: [expectedX1, expectedY1] })
  ok(g0.stroke && g0.stroke.includes('255'), '队友绿点带白色描边（避免与红怪混淆）', g0.stroke)
}

console.log('=== B. 切换被控后：原主角(独立AI单位)仍应显示为队友绿点 ===')
{
  const scene = makeScene()
  // 被控切到艾米(partyIndex 2)，臻宝沦为 battleHeroes[2] 的独立AI单位(partyIndex 0)
  scene._heroWorldPos = [
    { x: 2900, y: 1950 },        // partyIndex 0 臻宝(现为AI)
    { x: 3100, y: 2050 },        // partyIndex 1 李小宝
    { x: 3000, y: 2000 },        // partyIndex 2 艾米(被控)
  ]
  scene.battleSystem = {
    battleHeroes: [
      { partyIndex: 2, hero: {} },  // [0]=被控=艾米
      { partyIndex: 1, hero: {} },
      { partyIndex: 0, hero: {} },  // 臻宝在数组里但 partyIndex 0
    ],
  }
  const ctx = makeCtx()
  scene._renderMinimap(ctx)
  const green = ctx.shapes.filter(a => a.fill === '#2ed573')
  // 应画出 2 个绿点（李小宝 partyIndex1 + 臻宝 partyIndex0），被控艾米不算
  ok(green.length === 2, '切换后画出 2 个队友绿点（含沦为AI的原主角）', green.length)
  // 臻宝位置 (2900,1950) 应出现在绿点中
  const zhenX = (1280 - 160 - 30) + (2900 / 6000) * 160
  const zhenY = 170 + (1950 / 4000) * 160
  const hasZhen = green.some(a => Math.abs(a.x - zhenX) < 0.01 && Math.abs(a.y - zhenY) < 0.01)
  ok(hasZhen, '原主角(独立AI)位置出现在队友绿点中', hasZhen)
}

console.log('=== C. 单人无队友：仅玩家点，不画绿点 ===')
{
  const scene = makeScene()
  scene._heroWorldPos = [{ x: 3000, y: 2000 }]
  scene.battleSystem = { battleHeroes: [{ partyIndex: 0, hero: {} }] }
  const ctx = makeCtx()
  scene._renderMinimap(ctx)
  const green = ctx.shapes.filter(a => a.fill === '#2ed573')
  ok(green.length === 0, '无队友时不画绿点', green.length)
}

console.log(`\n结果：通过 ${passed} / 失败 ${failed}`)
process.exit(failed === 0 ? 0 : 1)
