# 🐛 BUG 修复计划

## 📅 更新日志

### 2026-04-05

**提交记录：**
- 提交ID：085c0a5
- 提交信息：fix: 修复不同副本怪物状态互相覆盖的问题
- 提交时间：2026-04-05 11:56

**问题：击败艾米后，去魔法塔副本发现没有Boss**

**问题现象：**
1. 在阳光草原击败艾米Boss
2. 离开阳光草原，进入魔法塔副本
3. 发现魔法塔地图上没有水晶法师Boss
4. 只有普通怪物，Boss消失了

**根本原因：**

所有副本使用同一个key `fieldMonsters` 保存怪物状态，导致不同副本的怪物数据互相覆盖。

**问题流程分析：**

```
1. 进入阳光草原
   └─ 生成怪物（包括艾米Boss）
   
2. 击败艾米Boss
   └─ Boss标记为dead
   
3. 离开阳光草原
   └─ 保存怪物状态到 fieldMonsters
   └─ 数据：阳光草原的怪物列表（包括死亡的艾米）
   
4. 进入魔法塔
   └─ 读取 fieldMonsters
   └─ 获得数据：阳光草原的怪物列表
   └─ 问题：没有魔法塔的水晶法师！
   
5. 结果
   └─ 魔法塔地图上没有Boss
   └─ 因为读取的是阳光草原的数据
```

**错误代码：**

```javascript
// ❌ 错误：所有副本共用一个key
const savedMonsters = this.game.data.get('fieldMonsters')
this.game.data.set('fieldMonsters', this.mapMonsters)
```

**修复方案：**

为每个副本使用独立的保存key，格式为 `fieldMonsters_${areaId}`：

```javascript
// ✅ 正确：每个副本独立保存
const savedMonsters = this.game.data.get(`fieldMonsters_${this.areaId}`)
this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
```

**保存key示例：**

| 副本 | areaId | 保存key |
|------|--------|---------|
| 阳光草原 | grassland | fieldMonsters_grassland |
| 魔法塔 | magic_tower | fieldMonsters_magic_tower |
| 迷雾森林 | forest | fieldMonsters_forest |
| 暗影洞穴 | cave | fieldMonsters_cave |

**修改位置：**

1. **构造函数** - 读取怪物状态
   ```javascript
   const savedMonsters = this.game.data.get(`fieldMonsters_${this.areaId}`)
   ```

2. **_checkBattleResult()** - 战斗后保存
   ```javascript
   this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
   ```

3. **destroy()** - 离开时保存
   ```javascript
   this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
   ```

4. **_respawnMonsters()** - 补充怪物后保存
   ```javascript
   this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
   ```

**修复效果：**

- ✅ 每个副本的怪物状态独立保存
- ✅ 不会互相覆盖
- ✅ 击败艾米后，魔法塔的Boss正常存在
- ✅ 可以在多个副本间自由切换，不会丢失Boss

**设计改进：**

之前的存储设计：
```
fieldMonsters → 阳光草原的怪物数据
             → 魔法塔的怪物数据（覆盖！）
             → 迷雾森林的怪物数据（覆盖！）
```

修复后的存储设计：
```
fieldMonsters_grassland → 阳光草原的怪物数据
fieldMonsters_magic_tower → 魔法塔的怪物数据
fieldMonsters_forest → 迷雾森林的怪物数据
fieldMonsters_cave → 暗影洞穴的怪物数据
```

**文件修改：**
- `scripts/scenes/field-scene.js` - 4处保存/读取逻辑

---

**提交记录：**
- 提交ID：1b69c08
- 提交信息：fix: 修复水晶法师等级和解锁安妮功能
- 提交时间：2026-04-05 11:52

**问题1：水晶法师等级太低**

- **问题：** 水晶法师等级只有7级，应该更符合第二章Boss的难度
- **原因：** 初始配置时等级设置过低
- **修复：** 将 `crystal_mage` 的 `level` 从 7 改为 15

**问题2：击败水晶法师后没有解锁安妮**

- **问题：** 击败艾米后能解锁艾米，但击败水晶法师后没有解锁安妮
- **原因：** 缺少安妮Boss的特殊标记和感化逻辑

**修复方案：**

1. **敌人数据配置（enemies.js）**
   ```javascript
   crystal_mage: {
     // ... 其他属性
     isAnnie: true,  // 特殊标记：这是安妮的Boss形态
     purifyDialogue: [
       '水晶之力...原来不只是力量...',
       '我一直在追求强大的魔法，却忘记了魔法的真谛...',
       '请让我加入你们，用魔法守护这片大地！'
     ]
   }
   ```

2. **战斗逻辑（battle-scene.js）**
   
   **Boss击败触发感化：**
   ```javascript
   const annieEnemy = this.enemies.find(e => e.isAnnie)
   if (annieEnemy) {
     this.game.data.set('annieDefeated', true)
     this.phase = 'purify'
     this.purifyStep = 0
     this.purifyTimer = 0
     // ... 触发感化剧情
   }
   ```
   
   **感化完成解锁角色：**
   ```javascript
   if (this.enemy.isAnnie) {
     const unlocked = charStateManager.unlockCharacter('annie')
     if (unlocked) {
       console.log('[Battle] 安妮成功加入队伍！')
       this._addLog(`✨ 安妮加入了队伍！`)
     }
   }
   ```

3. **感化剧情渲染**
   - 支持动态显示不同角色的名称和头像
   - 根据 `isAmy` 和 `isAnnie` 标记切换显示内容

**对比：艾米 vs 安妮**

| Boss | 标记 | 角色ID | 等级 | 章节 |
|------|------|--------|------|------|
| 迷途的治愈猫 | isAmy | amy | 8 | 第一章 |
| 水晶法师 | isAnnie | annie | 15 | 第二章 |

**感化流程对比：**
1. Boss血量归零 → 触发感化剧情
2. 感化对话（3段） → 显示角色头像和对话
3. 点击"继续冒险" → 解锁角色加入队伍
4. 返回野外场景 → 新角色自动跟随

**测试验证：**
- ✅ 水晶法师等级显示为15级
- ✅ 击败水晶法师后进入感化剧情
- ✅ 感化对话正常显示安妮的台词
- ✅ 安妮成功解锁并加入队伍
- ✅ 返回野外后安妮自动跟随

**文件修改：**
- `scripts/data/enemies.js` - 水晶法师配置
- `scripts/scenes/battle-scene.js` - 感化和解锁逻辑

---

**提交记录：**
- 提交ID：2abfd1b
- 提交信息：fix: 修复魔法塔敌人数据错误和Boss生成问题
- 提交时间：2026-04-05 11:48

**问题描述：**
1. 魔法塔遇怪报错：`[Field] 敌人数据不存在: shadow_mouse`
2. 魔法塔地图中没有生成Boss（水晶法师）

**根本原因：**
- 代码硬编码使用 `ENEMIES_CH1` 获取敌人数据
- 魔法塔危机是第二章副本，应该使用 `ENEMIES_CH2` 的敌人数据
- Boss生成、普通怪物生成、怪物补充都使用了错误的数据源

**错误代码示例：**
```javascript
// ❌ 错误：硬编码使用ENEMIES_CH1
const bossData = ENEMIES_CH1[bossId]
const enemyData = ENEMIES_CH1[enemyId]
```

**修复方案：**
使用 `this.areaInfo.enemyData` 动态获取对应章节的敌人数据：

```javascript
// ✅ 正确：使用areaInfo.enemyData
const bossData = (this.areaInfo.enemyData || ENEMIES_CH1)[bossId]
const enemyData = (this.areaInfo.enemyData || ENEMIES_CH1)[enemyId]
```

**修复位置：**
1. `_generateMonsters()` - Boss生成（第241行）
2. `_generateMonsters()` - 普通怪物生成（第311行）
3. `_respawnMonsters()` - 怪物补充（第668行）

**数据配置验证：**
- 阳光草原：`enemyData: ENEMIES_CH1` ✅
- 魔法塔危机：`enemyData: ENEMIES_CH2` ✅
- 迷雾森林：`enemyData: ENEMIES_CH1` ✅
- 暗影洞穴：`enemyData: ENEMIES_CH1` ✅

**敌人数据对比：**
```
ENEMIES_CH1（第一章）：
- wild_cat, slime_cat, shadow_mouse
- stray_leader（精英）
- lost_healer_cat, dark_cat_king（Boss）

ENEMIES_CH2（第二章）：
- magic_sprite, stone_golem, ghost_cat
- tower_guardian（精英）
- crystal_mage（Boss）
```

**测试验证：**
- ✅ 魔法塔遇怪正常（魔法精灵、石像守卫、幽灵猫）
- ✅ 魔法塔Boss正常生成（水晶法师）
- ✅ 阳光草原等其他副本不受影响

**文件修改：**
- `scripts/scenes/field-scene.js` - 三处敌人数据获取逻辑

---

**提交记录：**
- 提交ID：12f1ca4
- 提交信息：fix: 修复测试解锁副本和新角色跟随问题
- 提交时间：2026-04-05 11:45

**问题1：测试解锁所有副本功能没有实现**

- **问题：** 测试按钮点击后，只设置了amyDefeated标志，但其他副本仍然是锁定状态
- **原因：** 副本解锁逻辑是硬编码的，没有测试模式标志
- **解决：** 添加testUnlockAll测试模式标志，所有副本在测试模式下自动解锁

**实现细节：**
1. **测试模式标志**
   ```javascript
   const testMode = this.game.data.get('testUnlockAll') || false
   ```

2. **副本解锁逻辑**
   - 阳光草原：始终解锁
   - 魔法塔危机：testMode || (amyDefeated && partyLevel > 3)
   - 商人秘密：testMode（测试模式下解锁）
   - 古城守护者：testMode（测试模式下解锁）
   - 虚无之雾：testMode（测试模式下解锁）

3. **测试按钮功能**
   ```javascript
   this.game.data.set('amyDefeated', true)
   this.game.data.set('testUnlockAll', true)  // 设置测试模式
   ```

**问题2：新加入的角色没有跟随**

- **问题：** 击败艾米后，艾米加入队伍，但在野外探索时不跟随主角
- **原因：** `_initFollowers()`只在构造函数中调用一次，不会动态更新
- **解决：** 添加`_checkNewFollowers()`方法，在战斗结果检查时自动检测新角色

**实现细节：**
1. **新方法：_checkNewFollowers()**
   ```javascript
   _checkNewFollowers() {
     const allChars = charStateManager.getAllCharacters()
     const currentFollowerIds = this.followers.map(f => f.character.id)
     
     // 找出新加入的角色
     for (let i = 1; i < allChars.length; i++) {
       const char = allChars[i]
       if (!currentFollowerIds.includes(char.id)) {
         // 添加到followers列表
         this.followers.push({
           character: char,
           x: this.playerX - (this.followers.length + 1) * this.followerDistance,
           y: this.playerY,
           // ... 动画状态
         })
       }
     }
   }
   ```

2. **调用时机**
   - 在`_checkBattleResult()`中调用
   - 每次战斗结束后都会检查是否有新角色加入

3. **动态更新**
   - 自动检测队伍变化
   - 新角色立即开始跟随
   - 保持主角和队友的正确位置关系

**测试验证：**
- ✅ 点击测试按钮，所有副本解锁
- ✅ 击败艾米后，艾米加入队伍并开始跟随
- ✅ 新角色跟随位置正确，动画正常

**文件修改：**
- `scripts/scenes/town-scene.js` - 测试解锁功能
- `scripts/scenes/field-scene.js` - 新角色跟随逻辑

---

**提交记录：**
- 提交ID：3dfccd2
- 提交信息：feat: 添加明显的返回城镇按钮
- 提交时间：2026-04-05 11:40

**问题修复：**
- **问题：** 副本探索场景没有返回城镇的选项，用户不知道如何退出
- **解决：** 添加明显的返回城镇按钮

**按钮优化：**
1. **位置调整**
   - 从右上角移至左上角
   - 符合移动端UI习惯（返回按钮通常在左上角）

2. **尺寸增大**
   - 旧尺寸：40x40（太小，难以点击）
   - 新尺寸：90x40（增大点击区域，更容易操作）

3. **视觉设计**
   - 白色背景 + 蓝色边框
   - 圆角矩形设计
   - 显示"🏠 城镇"图标+文字
   - 清晰易懂，一目了然

**用户体验改进：**
- ✅ 按钮明显，用户容易发现
- ✅ 点击区域大，操作友好
- ✅ 文字提示清晰，不需要猜测
- ✅ 位置符合移动端习惯

**文件修改：**
- `scripts/scenes/field-scene.js` - 添加返回城镇按钮UI和交互逻辑

---

**提交记录：**
- 提交ID：3c863a1
- 提交信息：refactor: 战斗场景角色卡片改为横向布局
- 提交时间：2026-04-05 11:35

**重大重构：**
- **问题：** 纵向排列不适合多敌人战斗场景，空间利用率低
- **解决：** 改为横向排列，更适合游戏战斗UI

**新布局设计：**

1. **角色卡片横向排列**
   - 位置：战斗日志上方
   - 横向居中显示
   - 卡片尺寸：120x70（缩小以容纳更多）
   - 卡片间距：10px

2. **翻页按钮优化**
   - ⬅️ 上一页：左侧（卡片左边）
   - ➡️ 下一页：右侧（卡片右边）
   - 📄 页码：卡片下方居中

3. **布局对比**
   ```
   旧布局（纵向）：
   [角色1]
   [角色2]
   [角色3]
   ↑ 屏幕空间不足

   新布局（横向）：
   [角色1] [角色2] [角色3]
   ↑ 横向空间更宽，更合理
   ```

4. **技术实现**
   - `_initHeroAreas()` - 横向排列计算
   - `_renderPageButtons()` - 左右翻页按钮
   - `_checkPageButtons()` - 统一处理翻页按钮点击

**优势：**
- ✅ 横向空间更宽，可容纳3-4个角色
- ✅ 为多敌人战斗预留空间（敌人也可横向排列）
- ✅ 战斗日志和技能面板位置不变
- ✅ 视觉层次更清晰
- ✅ 更符合传统RPG战斗界面

**文件修改：**
- `scripts/scenes/battle-scene.js` - 重构角色卡片布局

---

**提交记录：**
- 提交ID：a5f00d1
- 提交信息：feat: 战斗场景角色卡片分页系统
- 提交时间：2026-04-05 11:25

**重大优化：**
- **问题：** 临时方案只能显示3个角色，无法应对6个甚至更多角色的情况
- **解决：** 实现完整的分页系统，支持任意数量角色

**分页系统设计：**

1. **核心属性**
   ```javascript
   this.heroPage = 0           // 当前页码（从0开始）
   this.heroPerPage = 3        // 每页显示3个角色
   this.totalHeroPages = Math.ceil(party.length / heroPerPage)
   ```

2. **翻页按钮**
   - 上一页：左上角圆形按钮（◀）
   - 下一页：左下角圆形按钮（▶）
   - 页码指示器：左侧中间显示"1/2"

3. **交互支持**
   - 选择角色时可翻页（select_hero阶段）
   - 选择治疗目标时可翻页（select_target阶段）
   - 点击按钮优先级高于角色卡片

4. **动态布局**
   - 根据当前页的角色动态计算布局
   - 保持居中显示，视觉效果良好

**适配场景：**
- 1-3个角色：单页显示
- 4-6个角色：2页显示
- 7-9个角色：3页显示
- 更多角色：自动分页，无上限

**技术实现：**
- `_initHeroAreas()` - 根据当前页计算角色卡片位置
- `_prevHeroPage()` / `_nextHeroPage()` - 翻页方法
- `_renderPageButtons()` - 渲染翻页按钮和页码
- `_isInCircle()` - 圆形按钮点击检测

**文件修改：**
- `scripts/scenes/battle-scene.js` - 添加完整分页系统

---

**提交记录：**
- 提交ID：ed5c0b1
- 提交信息：feat: 优化战斗场景角色卡片布局
- 提交时间：2026-04-05 11:18

**UI优化：**
- **问题：** 战斗场景中，队伍角色超过2个时，后面的角色卡片超出屏幕无法看到
- **原因：** 角色卡片位置固定，间距过大，卡片尺寸过大

**优化方案：**
1. **动态计算布局**
   - 根据队伍人数自动计算起始位置
   - 可用空间 = 屏幕高度 - 日志区域 - 顶部留白
   - 起始位置 = (可用空间 - 总高度) / 2

2. **缩小卡片尺寸**
   - 卡片：180x85 → **150x70** 像素
   - 头像：55 → **45** 像素
   - 间距：95 → **75** 像素

3. **调整内部元素**
   - 名字：14号字体，y+18
   - 职业：10号字体，y+31
   - HP条：12号字体，y+40
   - MP条：12号字体，y+55

**效果：**
- 1个角色：居中显示
- 2个角色：舒适间距
- 3个角色：紧凑排列，全部可见
- 更多角色：自动适配

**文件修改：**
- `scripts/scenes/battle-scene.js` - 优化角色卡片布局算法

---

**提交记录：**
- 提交ID：2724c03
- 提交信息：fix: 修复穿戴装备时HP/MP未回满的问题
- 提交时间：2026-04-05 11:08

**BUG修复：**
- **问题：** 穿戴增加HP/MP的装备后，当前HP/MP没有回满
- **原因：** 使用 `Math.min(character.hp, character.maxHp)` 导致HP保持原值
- **修复：** 穿戴装备时自动回满HP/MP
  ```javascript
  // 修改前：HP不会回满
  character.hp = Math.min(character.hp, character.maxHp)
  
  // 修改后：HP回满
  character.hp = character.maxHp
  ```

**装备属性验证：**
- 臻宝装备传说三件套后：
  - HP: 120 → **370** (基础120 + 武器50 + 圣甲120 + 吊坠80)
  - MP: 30 → **90** (基础30 + 吊坠60)
  - 攻击: 18 → **53** (基础18 + 武器35)
  - 防御: 12 → **45** (基础12 + 武器8 + 圣甲25)
  - 暴击: 0% → **22%** (武器12% + 吊坠10%)
  - 速度: 10 → **21** (基础10 + 圣甲3 + 吊坠8)

**文件修改：**
- `scripts/managers/equipment-manager.js` - 修复HP/MP回满逻辑

---

**提交记录：**
- 提交ID：787ac1d
- 提交信息：fix: 修复臻宝默认装备穿戴流程报错问题
- 提交时间：2026-04-05 11:05

**BUG修复：**
- **问题：** 穿戴默认装备时报错 `[EquipmentManager] 背包中没有装备: sunlight_blade`
- **原因：** `equip()` 方法会从背包移除装备，但直接穿戴时装备不在背包
- **修复：** 优化装备流程，先添加到背包，再穿戴
  ```javascript
  // 修改前：直接穿戴（报错）
  equipmentManager.equip(state, equip)
  
  // 修改后：先添加到背包，再穿戴
  equipmentManager.addItem(equip.id)
  equipmentManager.equip(state, equip)
  ```

**文件修改：**
- `scripts/data/character-state.js` - 优化臻宝默认装备穿戴逻辑

---

**提交记录：**
- 提交ID：557372c
- 提交信息：fix: 修复城镇场景测试日志系统缺失问题
- 提交时间：2026-04-05 11:02

**BUG修复：**
- **问题：** 点击"解锁所有副本"测试按钮报错 `TypeError: this._addLog is not a function`
- **原因：** town-scene.js 中调用了 `_addLog()` 方法但未定义
- **修复：**
  - 添加 `_addLog()` 方法（显示3秒，最多5条）
  - 在 render 中调用 `_renderTestLogs()`
  - 在 update 中添加日志时间衰减逻辑

**文件修改：**
- `scripts/scenes/town-scene.js` - 完善测试日志系统

---

**提交记录：**
- 提交ID：（待提交）
- 提交信息：test: 给臻宝添加默认最佳装备方便测试
- 提交时间：2026-04-05 10:56

**测试功能：**
- ⚠️ **临时功能，上线前需删除**
- 给臻宝默认装备传说级别装备：
  - 武器：阳光之刃（攻击+35，防御+8，暴击+12%，生命+50）
  - 防具：阳光圣甲（防御+25，生命+120，速度+3）
  - 饰品：阳光吊坠（生命+80，魔力+60，速度+8，暴击+10%）
- 仅在无存档新建角色时触发
- **删除位置：** `scripts/data/character-state.js` 第222-237行（标记为"测试用"）

**文件修改：**
- `scripts/data/character-state.js` - init()方法中添加臻宝默认装备逻辑

---

**提交记录：**
- 提交ID：（待提交）
- 提交信息：feat: 实现装备系统
- 提交时间：2026-04-05 01:35

**功能更新：**
- **装备系统核心：**
  - 三大装备类型：武器、防具、饰品
  - 四级稀有度：普通(白)、稀有(蓝)、史诗(紫)、传说(橙)
  - 装备属性：攻击、防御、生命、魔力、速度、暴击率
  - 装备槽位管理：每个角色3个槽位
  - 背包系统：存储未装备的物品

- **装备数据：**
  - 第一章装备：18种装备（6武器+6防具+6饰品）
  - Boss专属装备：阳光之刃、阳光圣甲、阳光吊坠
  - 装备价格与出售价格

- **装备掉落：**
  - Boss必掉装备（掉落表控制）
  - 精英怪40%概率掉落
  - 普通怪15%概率掉落
  - 艾米Boss掉落传说装备

- **装备UI：**
  - 装备管理面板（城镇-铁匠NPC）
  - 装备槽显示与选择
  - 背包装备列表（支持滚动）
  - 装备详情展示
  - 穿戴/卸下操作

- **属性系统扩展：**
  - 角色增加暴击率属性
  - 装备属性加成实时计算
  - 升级后自动重算装备属性

**文件新增：**
- `scripts/data/equipment.js` - 装备数据定义
- `scripts/managers/equipment-manager.js` - 装备管理器
- `scripts/ui/equipment-panel.js` - 装备UI面板

**文件修改：**
- `scripts/data/character-state.js` - 添加装备槽、暴击率
- `scripts/scenes/field-scene.js` - 初始化装备管理器、处理掉落
- `scripts/scenes/battle-scene.js` - 战斗胜利生成装备掉落
- `scripts/scenes/town-scene.js` - 添加铁匠NPC、集成装备面板

---

**提交记录：**
- 提交ID：（待提交）
- 提交信息：feat: 阳光草原添加艾米Boss与感化剧情
- 提交时间：2026-04-05 01:15

### 2026-04-04

**提交记录：**
- 提交ID：a704854
- 提交信息：feat: 重构村庄场景为可移动探索地图
- 提交时间：2026-04-04 20:15

**功能更新：**
- 完全重写town-scene，改为可移动探索的大地图场景
- 使用village.jpeg作为背景图，保持原始尺寸（1664x928）
- 添加NPC系统：村长（初始引导）、商店老板（商店功能）、冒险者公会（探索野外）、存档点
- 移除直接菜单按钮，改为和NPC互动触发功能
- 保留队友跟随系统
- 添加互动提示系统（靠近NPC显示提示）
- 相机跟随玩家移动，摇杆控制移动

---

**提交记录：**
- 提交ID：faeca44
- 提交信息：feat: 修改城镇场景背景为village并显示臻宝角色
- 提交时间：2026-04-04 20:12

**功能更新：**
- 将城镇背景图改为village.jpeg
- 在town场景中显示臻宝idle动画
- 调整背景遮罩透明度，提升视觉效果

---

**提交记录：**
- 提交ID：5d018f9
- 提交信息：fix: 修复战斗经验重复增加导致快速升级的BUG
- 提交时间：2026-04-04 19:50

**功能更新：**
- 修复战斗结束时经验重复增加的严重BUG
- 添加清除存档工具函数（clear-save.js）
- 在game.js中暴露wx.clearSaveData和wx.showSaveData接口

---

**提交记录：**
- 提交ID：5f78f7a
- 提交信息：fix: 修复李小宝动画背景透明化与移动停止放大问题
- 提交时间：2026-04-04 19:21

**功能更新：**
- 实现队友跟随系统（替代角色切换）
- 历史路径跟随算法，确保队友保持在主角后方
- 优化队友跟随间隔和速度
- 修复队友动画频繁重置问题
- 调整经验值平衡，使升级速度更合理

---

**提交记录：**
- 提交ID：0f50801
- 提交信息：feat: 战斗系统优化与遇怪机制改进
- 提交时间：2026-04-04 17:15

**功能更新：**
- 新增角色等级和经验系统
- 角色升级时属性自动成长
- 右上角显示角色信息卡片（等级、经验、HP）
- 点击卡片查看详细属性面板
- 战斗胜利后获得经验值并可升级

---

### 2026-04-02

---

## 🔥 待修复 BUG

暂无待修复 BUG

---

## ✅ 已修复 BUG

### BUG-007: 装备面板在小屏幕上显示不全 ✅
**优先级：** 🔴 高
**状态：** ✅ 已修复
**发现时间：** 2026-04-05 01:46
**修复时间：** 2026-04-05 01:47

**问题描述：**
- 装备面板在小屏幕设备上无法完整显示
- 面板尺寸硬编码为 600x450，超出屏幕范围

**问题原因：**
1. 面板尺寸硬编码，没有考虑不同屏幕尺寸
2. 背包区域固定宽度，小屏幕溢出
3. 物品大小固定，列数固定

**修复方案：**

**1. 面板尺寸自适应：**
```javascript
// 根据屏幕大小自适应
this.panelWidth = Math.min(600 * this.dpr, this.width * 0.95)
this.panelHeight = Math.min(500 * this.dpr, this.height * 0.85)
```

**2. 背包区域动态计算：**
```javascript
// 根据面板尺寸计算背包区域
const invWidth = this.panelWidth - margin * 2 - 140 * this.dpr
const invHeight = Math.min(280 * this.dpr, this.panelHeight - 200 * this.dpr)
```

**3. 物品大小自适应：**
```javascript
// 根据宽度调整物品大小和列数
const itemSize = Math.min(65 * this.dpr, invWidth / 6)
const cols = Math.floor(invWidth / (itemSize + spacing))
```

**效果：**
- ✅ 小屏幕设备（如iPhone SE）可以完整显示
- ✅ 大屏幕设备保持原有美观布局
- ✅ 背包自动调整列数和物品大小
- ✅ 所有UI元素都在可视范围内

---

### BUG-006: 碰撞检测重复触发战斗 ✅
**优先级：** 🔴 高
**状态：** ✅ 已修复
**发现时间：** 2026-04-05 01:37
**修复时间：** 2026-04-05 01:38

**问题描述：**
- 遭遇怪物时，`_triggerBattle` 被重复调用多次
- 日志输出重复："[Field] 遭遇怪物: 野猫" 出现很多次

**问题原因：**
- 场景切换（`changeScene`）有淡入淡出动画，是异步的
- 在场景切换完成前，`update` 方法还在继续运行
- 每帧的碰撞检测都会再次触发战斗
- 导致多次调用 `_triggerBattle`

**修复方案：**
1. 添加 `isEnteringBattle` 标志位
2. 在 `_checkMonsterCollision` 开始时检查标志位
3. 在 `_triggerBattle` 开始时设置标志位为 `true`
4. 防止在场景切换过程中重复触发

**代码修改：**
```javascript
// field-scene.js
constructor() {
  this.isEnteringBattle = false // 新增标志位
}

_checkMonsterCollision() {
  if (this.isEnteringBattle) return // 检查标志位
  // ... 碰撞检测逻辑
}

_triggerBattle(monster) {
  if (this.isEnteringBattle) return // 双重检查
  this.isEnteringBattle = true // 设置标志位
  // ... 战斗逻辑
}
```

---

### BUG-005: DataManager缺少delete方法 ✅
**优先级：** 🔴 高
**状态：** ✅ 已修复
**发现时间：** 2026-04-05 01:35
**修复时间：** 2026-04-05 01:36

**问题描述：**
- 击败怪物后报错：`this.game.data.delete is not a function`
- 在 `_checkBattleResult` 中调用 `this.game.data.delete` 失败

**问题原因：**
- `DataManager` 类只实现了 `get` 和 `set` 方法
- 缺少 `delete` 方法用于删除临时数据

**修复方案：**
- 在 `DataManager` 中添加 `delete(key)` 方法
- 同时添加 `clear()` 方法用于清除所有存档

**代码修改：**
```javascript
// data-manager.js
delete(key) {
  delete this.data[key]
}

clear() {
  this.data = this._defaultData()
  try {
    wx.removeStorageSync(this.saveKey)
    console.log('[存档] 清除成功')
    return true
  } catch (e) {
    console.error('[存档] 清除失败:', e)
    return false
  }
}
```

---

### BUG-004: 战斗失败后Boss消失问题 ✅
**优先级：** 🟡 中
**状态：** ✅ 已修复
**发现时间：** 2026-04-05 01:10
**修复时间：** 2026-04-05 01:12

**问题描述：**
- 挑战Boss失败后，Boss消失了
- 无法再次挑战Boss

**问题原因：**
- 在`_triggerBattle`中立即标记怪物`alive = false`
- 无论战斗结果如何，怪物都会被标记为死亡

**修复方案：**
1. 触发战斗时不标记怪物死亡
2. 添加`battleVictory`标记记录战斗结果
3. 战斗胜利或感化成功时设置`battleVictory = true`
4. 返回field场景时检查战斗结果，只标记胜利的怪物死亡
5. 战败时怪物保持存活状态，可再次挑战

---

### BUG-003: 李小宝移动停止时"放大"问题 ✅
**优先级：** 🔴 高  
**状态：** ✅ 已修复  
**发现时间：** 2026-04-04 19:00  
**修复时间：** 2026-04-04 19:21  
**影响范围：** 角色动画切换

**问题描述：**
- 李小宝移动松开后角色会出现"放大"现象
- 移动和静止状态切换时视觉不连贯
- 问题反复出现，多次调整仍未解决

**问题原因：**
1. **动画帧状态错位**：
   - 移动时 `animFrame` 在 0-7 循环（8帧walk动画）
   - 松开摇杆时 `isMoving` 立即变为 false，但 `animFrame` 可能还是 7
   - 代码尝试获取 `HERO_LIXIAOBAO_IDLE_7`（不存在），fallback 到静态立绘
   - 静态立绘尺寸不同，导致视觉上"放大"

2. **idle帧有半透明背景残留**：
   - idle帧有22.82%的半透明像素（背景残留）
   - walk帧只有0.39%的半透明像素（正常边缘抗锯齿）
   - 视觉上idle帧看起来更大

**修复方案：**
1. ✅ 检测移动状态切换，重置动画帧：
   - 保存上一帧的 `isMoving` 状态
   - 当从移动切换到idle时，立即重置 `animFrame = 0`
   - 避免使用无效的idle_7等帧

2. ✅ 去除idle帧的半透明背景：
   - 使用激进的透明化算法（alpha < 50 和 alpha < 200）
   - 两轮处理，减少80万+半透明像素
   - 最终idle帧半透明像素降至0.54%（与walk帧0.39%接近）

3. ✅ 重新组织动画文件结构：
   - 创建 `walk/` 和 `idle/` 子目录
   - 更新 `asset-manager.js` 资源路径
   - 删除旧的根目录动画文件

**修复文件：**
- `scripts/scenes/field-scene.js` - 添加动画帧重置逻辑
- `images/characters_anim/transparent/idle/lixiaobao_idle_*.png` - 去除半透明背景
- `scripts/core/asset-manager.js` - 更新资源路径

**验证结果：**
- ✅ 移动停止时不会"放大"
- ✅ walk和idle切换流畅
- ✅ 动画帧状态正确
- ✅ 与臻宝的处理方式一致

---

### BUG-002: 李小宝动画背景透明化问题 ✅
**优先级：** 🟡 中  
**状态：** ✅ 已修复  
**发现时间：** 2026-04-04 18:00  
**修复时间：** 2026-04-04 19:00  
**影响范围：** 角色动画显示

**问题描述：**
- 李小宝的walk和idle动画帧有白色/浅灰色背景
- 背景未完全透明，影响游戏视觉效果

**问题原因：**
- walk帧背景：纯白色 RGB(255, 255, 255)
- idle帧背景：浅灰色 RGB(253-254, 253-254, 250-251)
- 之前的透明化算法不够完善

**修复方案：**
1. ✅ walk帧背景透明化：
   - 使用激进算法去除 RGB ≥ 240 的像素
   - 处理约60-63万背景像素/帧

2. ✅ idle帧背景透明化：
   - 使用容差30的算法去除浅灰色背景
   - 处理约60万背景像素/帧

**修复文件：**
- `images/characters_anim/transparent/walk/lixiaobao_walk_*.png` - walk帧背景透明化
- `images/characters_anim/transparent/idle/lixiaobao_idle_*.png` - idle帧背景透明化

**验证结果：**
- ✅ 李小宝移动和静止时背景都完全透明
- ✅ 角色边缘平滑自然

---

### BUG-001: 臻宝移动动画白色背景问题 ✅
**优先级：** 🔴 高  
**状态：** ✅ 已修复（二次优化）  
**发现时间：** 2026-04-02 23:42  
**修复时间：** 2026-04-02 23:53  
**影响范围：** 角色动画显示  

**问题描述：**
- 臻宝（zhenbao）的移动动画帧存在白色/浅灰色背景
- 影响游戏视觉效果，角色移动时显示白色方块

**问题原因：**
- 从视频提取的帧图片包含白色和浅灰色背景
- 图片模式为 RGB（无透明通道）
- 第一次处理阈值过高（240），未处理浅灰色背景

**修复方案：**
✅ 第一次处理：阈值 240，透明化 29.2%
✅ 第二次处理：阈值 180，增加灰度色判断
✅ 透明像素提升至 63.8%
✅ 所有角落像素完全透明

**修复结果：**
- ✅ 图片模式：RGB → RGBA
- ✅ 透明像素：63.8%（约 470 万像素）
- ✅ 角落像素：全部透明
- ✅ 文件位置：`images/characters_anim/transparent/zhenbao_walk_*.png`

**技术细节：**
- 阈值：RGB >= 180
- 灰度判断：RGB 差值 < 30
- 处理帧数：8 帧
- 备份位置：`transparent_gray_bg/`

**测试验证：**
- 待用户在游戏中测试确认

---

### BUG-002: 臻宝待机动画背景透明问题 ✅
**优先级：** 🔴 高  
**状态：** ✅ 已修复  
**发现时间：** 2026-04-02 23:54  
**修复时间：** 2026-04-02 23:55  
**影响范围：** 角色待机动画显示  

**问题描述：**
- 臻宝（zhenbao）的待机动画帧存在背景
- 与移动动画相同的问题

**问题原因：**
- 待机动画图片包含浅色背景
- 需要透明化处理

**修复方案：**
✅ 使用与移动动画相同的处理方案
✅ 阈值：180，灰度判断：RGB 差值 < 30
✅ 处理所有 2 帧待机动画

**修复结果：**
- ✅ 图片模式：RGBA
- ✅ 透明像素：idle_0 64.3%，idle_1 64.1%
- ✅ 所有角落像素完全透明
- ✅ 文件位置：`images/characters_anim/transparent/zhenbao_idle_*.png`

**测试验证：**
- 待用户在游戏中测试确认

**相关文件：**
- `images/characters_anim/transparent/zhenbao_walk_0.png` ~ `walk_7.png`

---

### BUG-003: 静态立绘背景透明问题 ✅
**优先级：** 🔴 高  
**状态：** ✅ 已修复  
**发现时间：** 2026-04-03 00:03  
**修复时间：** 2026-04-03 00:05  
**影响范围：** 角色动画切换显示  

**问题描述：**
- 松开移动后出现一帧有背景的图
- 影响动画切换的视觉体验

**问题原因：**
- 动画帧加载失败时fallback到静态立绘
- 静态立绘未处理透明背景
- 位置：`images/characters/hero_zhenbao.png`、`hero_lixiaobao.png`

**修复方案：**
✅ 使用相同的透明背景处理方案
✅ 阈值：120，灰度差：< 50
✅ 处理两个静态立绘文件

**修复结果：**
- ✅ hero_zhenbao.png：66.1% 透明
- ✅ hero_lixiaobao.png：52.6% 透明
- ✅ 所有角落像素完全透明

**技术细节：**
- 代码位置：`field-scene.js` 第318-320行
- Fallback逻辑：`HERO_${heroId.toUpperCase()}`
- 影响场景：动画帧加载失败时

**测试验证：**
- 待用户在游戏中测试确认

---

### BUG-004: 战斗结束后无法退出的问题 ✅
**优先级：** 🔴 高  
**状态：** ✅ 已修复  
**发现时间：** 2026-04-04  
**修复时间：** 2026-04-04  
**影响范围：** 战斗系统

**问题描述：**
- 击败怪物后点击"退出"按钮无法返回地图
- 影响游戏正常流程

**问题原因：**
- 场景名称错误：调用 `changeScene('map')` 但实际场景注册为 'field'
- 场景切换逻辑不匹配

**修复方案：**
✅ 修改场景名称为正确的 'field'
✅ 更新场景切换逻辑

**修复结果：**
- ✅ 战斗结束后可以正常返回地图
- ✅ 场景切换流程正常

**相关文件：**
- `scripts/scenes/battle-scene.js`

**测试验证：**
- ✅ 已修复，待用户确认

---

## 🚧 待处理功能

### 碰撞检测系统（暂停）
**状态：** ⏸️ 暂停  
**优先级：** 🟡 中  
**说明：** 地图碰撞检测系统已完成代码实现，但需要手动标记障碍物坐标，操作较为繁琐。

**已完成部分：**
- ✅ 碰撞检测逻辑（支持矩形和圆形）
- ✅ 角色信息面板UI组件
- ✅ 坐标显示功能（右上角黄色文字）
- ✅ 碰撞区域可视化调试工具
- ✅ 完整的使用文档

**待完成部分：**
- ⏸️ 标记地图上的障碍物坐标
- 💡 可能的解决方案：
  1. 使用AI图像识别自动标记障碍物
  2. 开发可视化编辑工具
  3. 等待更便捷的标记方式

**相关文件：**
- `scripts/data/map_collisions.js` - 碰撞配置
- `docs/COLLISION_GUIDE.md` - 使用指南
- `scripts/scenes/field-scene.js` - 碰撞检测逻辑

---

## 🎮 游戏功能优化记录

### OPT-001: 战斗系统优化 ✅
**优先级：** 🟡 中  
**状态：** ✅ 已完成  
**完成时间：** 2026-04-04  
**影响范围：** 战斗界面、游戏体验

**优化内容：**

1. **角色攻击动画** ✅
   - 添加跳跃攻击效果（跳跃→攻击→返回）
   - 实现流畅的缓动动画
   - 攻击动画状态机管理

2. **怪物攻击动画** ✅
   - 怪物跳跃攻击效果
   - 攻击目标随机选择
   - 伤害数值计算

3. **战斗界面优化** ✅
   - 调整战斗日志位置（从右侧移至底部）
   - 优化战斗日志布局（水平排列，显示最近3条）
   - 避免遮挡怪物显示

**技术细节：**
- 动画缓动函数：easeOutQuad、easeInQuad
- 动画阶段：jump → hit → return
- 状态属性：attackingHero、attackAnim、heroBasePositions

**相关文件：**
- `scripts/scenes/battle-scene.js`

---

### OPT-002: 遇怪机制改进 ✅
**优先级：** 🟡 中  
**状态：** ✅ 已完成  
**完成时间：** 2026-04-04  
**影响范围：** 地图探索、游戏体验

**优化内容：**

1. **固定怪物点位** ✅
   - 地图固定生成20组怪物
   - 怪物类型随机（普通、精英、BOSS）
   - 怪物位置合理分布

2. **碰撞触发机制** ✅
   - 玩家与怪物碰撞检测
   - 碰撞半径：玩家30px，怪物35px
   - 碰撞后进入战斗场景

3. **怪物状态持久化** ✅
   - 战斗后怪物消失
   - 怪物状态保存至 game.data
   - 地图怪物少于10个时自动补充

4. **视觉效果** ✅
   - 怪物浮动动画效果
   - 接近警告提示（⚠️）
   - 怪物图标区分：👹 BOSS、👿 精英、🐱 普通

**技术细节：**
- 碰撞检测：圆形碰撞（半径30-35px）
- 状态存储：game.data.set/get
- 怪物生成：随机位置验证

**相关文件：**
- `scripts/scenes/field-scene.js`

---

### OPT-003: 角色等级系统 ✅
**优先级：** 🟡 中  
**状态：** ✅ 已完成  
**完成时间：** 2026-04-04  
**影响范围：** 角色成长、战斗奖励、UI显示

**功能内容：**

1. **等级和经验系统** ✅
   - 角色初始等级为1，可通过获得经验升级
   - 经验值需求表（等级1-10+）
   - 最高等级：99级

2. **属性成长系统** ✅
   - 不同职业有不同的成长率
   - 战士：生命+12%，攻击+8%，防御+10%
   - 法师：魔法+15%，攻击+12%
   - 治愈者：平衡成长
   - 坦克：生命+15%，防御+12%

3. **角色信息UI** ✅
   - 右上角显示迷你信息卡片
   - 显示：头像、名称、等级、经验条、HP条
   - 点击卡片打开详细面板
   - 详细面板显示所有属性

4. **战斗奖励** ✅
   - 击败怪物获得经验值
   - 升级时恢复满状态
   - 战斗日志显示升级信息

**技术细节：**
- 角色状态管理：`CharacterState` 类
- 状态持久化：保存到 `game.data`
- UI组件：`CharacterInfoPanel`
- 经验获取：`charStateManager.gainExp()`

**相关文件：**
- `scripts/data/character-state.js` - 角色状态管理
- `scripts/ui/character-info-panel.js` - UI组件
- `scripts/scenes/field-scene.js` - UI集成
- `scripts/scenes/battle-scene.js` - 经验奖励

---

### BUG-005: 战斗场景角色信息不匹配 ✅
**优先级：** 🔴 高  
**状态：** ✅ 已修复  
**发现时间：** 2026-04-04  
**修复时间：** 2026-04-04  
**影响范围：** 战斗系统、角色数据同步

**问题描述：**
- 战斗场景显示的角色属性（HP、MP、攻击等）与野外场景不一致
- 战斗中角色没有等级显示
- 战斗后的HP/MP状态未正确同步

**问题原因：**
- 野外场景的 `_initParty()` 使用原始HEROES数据
- 未使用角色状态管理中的成长后属性
- 战斗后HP/MP同步逻辑错误

**修复方案：**
✅ 修改 `_initParty()` 使用角色状态管理数据
✅ 战斗卡片显示角色等级
✅ 战斗后正确同步HP/MP到角色状态
✅ 升级时自动更新属性到战斗数据

**修复结果：**
- ✅ 战斗场景显示正确的成长后属性
- ✅ 战斗中显示角色等级
- ✅ 战斗后HP/MP状态正确保存
- ✅ 升级时属性立即生效

**技术细节：**
- 使用 `charStateManager.getAllCharacters()` 获取角色状态
- 同步 `charState.hp/mp` 与 `partyMember.hp/mp`
- 战斗卡片显示：`角色名 Lv.X`

**相关文件：**
- `scripts/scenes/field-scene.js` - _initParty方法
- `scripts/scenes/battle-scene.js` - 战斗数据同步

---

### BUG-006: 战斗经验重复增加导致快速升级 ✅
**优先级：** 🔴 高  
**状态：** ✅ 已修复  
**发现时间：** 2026-04-04 19:40  
**修复时间：** 2026-04-04 19:50  
**影响范围：** 战斗系统、角色成长

**问题描述：**
- 打死一只怪物后角色直接升到4-5级
- 正常应该打死10只左右的怪物才能升1级
- 调试日志显示经验被重复增加多次

**问题原因：**
1. **`_checkBattleEnd()` 每帧被调用**：
   - 该方法在 `update()` 中每帧执行
   - 当敌人HP ≤ 0时，会执行经验增加逻辑
   - 没有状态检查，导致每帧都重复执行

2. **缺少状态检查**：
   - 即使已经进入胜利状态，每帧仍然执行
   - 没有检查 `this.phase === 'victory'`

**修复方案：**
✅ 在 `_checkBattleEnd()` 开头添加状态检查：
```javascript
_checkBattleEnd() {
  // 关键修复：防止重复处理
  if (this.phase === 'victory' || this.phase === 'defeat') {
    return
  }
  // ... 原有逻辑
}
```

**修复结果：**
- ✅ 打死一只怪物只增加一次经验
- ✅ 升级速度恢复正常（打死10只左右升1级）
- ✅ 战斗流程正常

**技术细节：**
- 根本原因：缺少状态检查导致每帧重复执行
- 关键代码：`if (this.phase === 'victory' || this.phase === 'defeat') return`
- 影响范围：所有战斗结束时的经验获取

**相关文件：**
- `scripts/scenes/battle-scene.js` - _checkBattleEnd方法
- `scripts/utils/clear-save.js` - 清除存档工具
- `game.js` - 暴露清除存档接口

---

### OPT-004: 村庄场景重构 ✅
**优先级：** 🔴 高  
**状态：** ✅ 已完成  
**完成时间：** 2026-04-04  
**影响范围：** 村庄场景、游戏体验

**功能内容：**

1. **可移动探索地图** ✅
   - 将村庄场景从菜单界面改为可移动的大地图场景
   - 使用village.jpeg作为背景图，保持原始尺寸（1664x928）
   - 相机跟随玩家移动，支持摇杆控制

2. **NPC互动系统** ✅
   - 村长：提供初始引导对话
   - 商店老板：商店功能（开发中）
   - 冒险者公会：进入野外探索
   - 存档点：游戏存档

3. **互动提示** ✅
   - 靠近NPC时显示互动提示
   - 点击屏幕与NPC对话
   - 对话框显示NPC名称和对话内容

4. **队友跟随** ✅
   - 保留队友跟随系统
   - 队友跟随主角在村庄移动

**技术细节：**
- 地图尺寸：1664 x 928（village.jpeg原始尺寸）
- NPC互动半径：50-60像素
- 相机系统：跟随玩家，边界限制
- 摇杆控制：与field-scene一致

**相关文件：**
- `scripts/scenes/town-scene.js` - 完全重写
- `scripts/core/asset-manager.js` - 背景图路径更新

---

## 📝 修复流程规范

1. **记录 BUG**：在此文档中详细描述问题
2. **定位原因**：分析问题根源
3. **制定方案**：确定修复方法
4. **实施修复**：修改代码/资源
5. **测试验证**：用户确认修复效果
6. **更新文档**：标记为"已修复"并记录详情

---

## 🎨 UI 优化计划

详见项目根目录的 BUG_FIXING_PLAN.md（如有）
