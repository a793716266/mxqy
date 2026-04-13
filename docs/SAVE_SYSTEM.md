# 存档系统文档

> 本文档描述「喵星奇缘」微信小游戏存档系统的设计与维护指南。
> 适用对象：未来接手或继续开发本项目的工程师。
> 最后更新：2026-04-13（v1 重构）

---

## 一、整体架构

存档系统位于 `scripts/core/data-manager.js`，由 `DataManager` 类管理。

```
微信本地存储（wx.setStorageSync / wx.getStorageSync）
        ↓ save()
        ↑ load()
DataManager.data（内存对象）
```

- **save()** 每次触发：关卡切换（field → battle → town）、购买装备、引导结束、获得战利品等
- **load()** 游戏启动时执行一次（game.js init）
- 不存在"实时存档"：战斗中状态存在内存，不落盘

---

## 二、数据结构

### 2.1 当前版本（v1）

```javascript
{
  version: 1,        // ★ 必须有此字段，迁移逻辑依赖它判断新旧格式

  player: {          // 玩家基础属性
    name: '臻宝',
    level: 1,
    exp: 0,
    gold: 100,
    playTime: 0      // save() 每次自动 +1
  },

  progression: {     // 剧情进度
    currentChapter: 1,
    currentNode: 'town_start',   // 当前剧情节点标识
    party: [0],       // 出战阵容（角色配置索引）
    flags: {          // 剧情/事件标记（true/false）
      // amyDefeated: true,   ← 通过 addFlag('amyDefeated') 设置
      // annieDefeated: false
    }
  },

  characters: [],    // 角色状态快照（HP 等运行时数据，独立于静态配置）
  equipment: [],      // 装备数据（序列化后的数组）
  inventory: [],     // 道具背包
  catsDiscovered: [],// 猫咪图鉴（已发现的猫咪 ID 列表）

  meta: {            // 系统元信息
    introShown: false,    // 引导是否已完成
    testUnlockAll: false   // 测试模式开关
  },

  battle: {          // 战斗上下文（关卡级，非实时）
    currentMonsterId: null,  // 当前遭遇的怪物 ID（进战斗前记录，战斗胜利后清除）
    victory: false,          // 本次关卡是否胜利
    droppedEquipment: null   // 战斗掉落装备（胜利后暂存，领取后清除）
  },

  areas: {}          // 各区域野外状态
                     // 结构：areas[areaId] = { monsters: [...] }
                     // field-scene 存取的 fieldMonsters_${areaId} 实际映射到这里
}
```

### 2.2 旧版格式（v0，已自动迁移）

```
旧版 = 上述所有字段平铺在根级别，无 version 字段，无嵌套结构
```

字段对照表（旧 key → 新路径）：

| 旧字段（代码中仍可用） | 新路径 |
|---|---|
| `gold` | `player.gold` |
| `party` | `progression.party` |
| `currentChapter` | `progression.currentChapter` |
| `currentNode` | `progression.currentNode` |
| `characterStates` | `characters` |
| `equipmentData` | `equipment` |
| `introShown` | `meta.introShown` |
| `testUnlockAll` | `meta.testUnlockAll` |
| `amyDefeated` | `progression.flags.amyDefeated` |
| `annieDefeated` | `progression.flags.annieDefeated` |
| `currentBattleMonsterId` | `battle.currentMonsterId` |
| `battleVictory` | `battle.victory` |
| `droppedEquipment` | `battle.droppedEquipment` |
| `fieldMonsters_${areaId}` | `areas[${areaId}].monsters` |
| `unlockedCats` / `cats` | `catsDiscovered` |

---

## 三、API 速查

### 读取

```javascript
// ★ 推荐：新路径（dot-notation）
const gold = this.game.data.get('player.gold')

// 兼容：旧字段仍然有效
const gold = this.game.data.get('gold')    // 内部映射到 player.gold

// 剧情标记
if (this.game.data.hasFlag('amyDefeated')) { ... }

// 野外怪物状态
const monsters = this.game.data.get(`fieldMonsters_${areaId}`)  // 兼容旧 key
```

### 写入

```javascript
// ★ 推荐：新路径
this.game.data.set('player.gold', this.game.data.get('player.gold') + 100)

// 兼容：旧字段仍然有效（内部自动映射）
this.game.data.set('gold', 200)

// 剧情标记快捷方法
this.game.data.addFlag('amyDefeated', true)   // 内部存到 progression.flags.amyDefeated
this.game.data.addFlag('testUnlockAll')       // 默认值为 true

// 野外怪物状态（两个路径同时写，兼容旧代码）
this.game.data.set(`fieldMonsters_${areaId}`, monsters)

// 删除字段
this.game.data.delete('droppedEquipment')
```

### 存档/读档

```javascript
this.game.data.save()           // 持久化到本地
this.game.data.load()           // 从本地加载（自动迁移旧版）
this.game.data.hasSave()        // 检查是否有存档
this.game.data.clear()          // 清除存档（重置为默认值）
```

---

## 四、版本迁移机制

### 触发条件

`load()` 时检查 `raw.version`：
- `version === undefined`（旧存档）→ 执行 `_migrate(old, 0)` → `v1`
- `version >= 1` → 执行 `_mergeDefaults()` 补全新加字段

### 迁移流程（v0 → v1）

1. 用 `this._defaultData()` 生成干净的 v1 默认结构
2. 遍历旧存档的根级别字段，逐一映射到对应的新路径
3. `fieldMonsters_${areaId}` 归入 `areas[areaId].monsters`
4. 设置 `version = 1`
5. 返回新结构，存入 `this.data`

### 未来版本升级

在 `_migrate()` 中追加新的 `else if (old.version === 1)` 分支，
从 v1 迁移到 v2，以此类推。

`version` 字段是**事实标准**，每次 save 时必须保留。

---

## 五、关键设计决策

### 5.1 旧代码零改动

业务代码里所有的 `data.get('gold')` / `data.set('gold', v)` 保持原样。
`_resolve()` 里的 legacyMap 在 get/set 时自动把旧 key 映射到新路径。

### 5.2 fieldMonsters 的特殊处理

野外怪物使用了 `fieldMonsters_${areaId}` 这种动态 key：
- `set('fieldMonsters_area1', value)` 同时写入 `data.fieldMonsters_area1`（旧路径兼容）和 `data.areas.area1.monsters`（新结构）
- `get('fieldMonsters_area1')` 优先读新路径，找不到才读旧路径

这样：
- 旧存档（有旧路径字段）→ get 能读到，migrate 把旧路径迁移到新路径
- 新存档 → get 优先走新路径，set 双向同步

### 5.3 字段集中管理

`this._defaultData()` 是**唯一的数据结构真相来源**。
所有新加字段必须在这里声明，否则 `load()` 时的 `_mergeDefaults()` 会把它过滤掉（补全默认值）。

### 5.4 云同步预留

若未来接入微信云开发/服务端存储，只需要：
1. 把 `save()` / `load()` 里的 `wx.setStorageSync` / `wx.getStorageSync` 替换为对应的云端 API
2. 加 `remoteVersion` 字段做冲突合并策略

业务代码中的 `data.get/set` 调用不需要任何改动。

---

## 六、调试技巧

### 查看当前存档内容（游戏中）

```javascript
// 在任意场景的 onLoad 里加一行（调试完记得删）
console.log('[存档]', JSON.stringify(this.game.data.data, null, 2))
```

### 清除存档重头来

方法一（游戏内）：`this.game.data.clear()`
方法二（控制台）：`game.data.clear()`（由 clear-save.js 提供）
方法三（手动）：微信开发者工具 → Storage → 删 `meow_star_save`

### 迁移是否生效

游戏启动后读档，控制台出现：
```
[存档] 读档成功，版本: 1
[存档迁移] v0 → v1，开始转换数据结构...   ← 仅旧存档出现
[存档迁移] v0→v1 完成，覆盖字段数: 12
```

---

## 七、已知限制

- **playTime 精度不足**：`save()` 每次 +1，但一次会话内多次 save 不会更新（帧率下可能有误差）。若有需求可改用时间戳。
- **多端不同步**：目前只有本地存储，多设备登录会各玩各的。
- **存档上限**：微信单个 key 上限 10MB，目前数据量远未达到。
- **battle.droppedEquipment 暂存**：`battleVictory=true` 后暂存掉落，领取后立即 `delete('droppedEquipment')`。若玩家不领取直接退出，掉落丢失（设计如此，可加自动发放）。

---

## 八、相关文件索引

| 文件 | 职责 |
|---|---|
| `scripts/core/data-manager.js` | 存档读写、迁移、API |
| `scripts/scenes/main-menu.js` | 游戏启动 → `load()` → 读存档决定入口 |
| `scripts/scenes/town-scene.js` | 购买装备、引导标记、boss 击杀 → `save()` |
| `scripts/scenes/battle-scene.js` | 战斗胜利、掉落、boss 击杀标记 → `save()` |
| `scripts/scenes/field-scene.js` | 野外怪物状态、关卡进入/退出 → `save()` |
| `scripts/scenes/collection-scene.js` | 猫咪图鉴解锁 |
| `scripts/ui/equipment-panel.js` | 装备穿戴/卸下 → `save()` |
| `scripts/utils/clear-save.js` | 调试用存档清除工具 |

---

## Changelog

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-04-13 | v1 | 首次重构：平铺结构 → 嵌套结构，加 version 字段和自动迁移 |
