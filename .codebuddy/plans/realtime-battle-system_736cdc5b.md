---
name: realtime-battle-system
overview: 将现有回合制点击战斗系统重构为实时自由攻击模式：角色和敌人自动持续战斗，普攻受攻速限制，技能受CD限制（基于spd自动计算），保留加速/暂停按钮，治疗AI智能优先治疗低血量队友。
design:
  architecture:
    framework: html
  fontSystem:
    fontFamily: Roboto Condensed
    heading:
      size: 20px
      weight: 700
    subheading:
      size: 14px
      weight: 600
    body:
      size: 12px
      weight: 400
  colorSystem:
    primary:
      - "#FF9F43"
      - "#FF6B6B"
      - "#4ECDC4"
    background:
      - "#0D1117"
      - "#161B22"
      - "#21262D"
    text:
      - "#FFFFFF"
      - "#8B949E"
    functional:
      - "#2ED573"
      - "#FF4757"
      - "#FFA502"
      - "#5F9FFF"
todos:
  - id: init-autobattle-state
    content: 重构构造函数和init方法：添加自动战斗状态变量（heroAttackTimers、enemyAttackTimers、并发控制、speed/pause）、重写init流程从select_hero改为auto_battle
    status: completed
  - id: autobattle-engine
    content: 实现_updateAutoBattle(dt)引擎和_aiChooseSkill(hero) AI决策：遍历存活角色更新攻速计时器和CD、AI选技能、调用_executeSkill、并发槽位控制
    status: completed
    dependencies:
      - init-autobattle-state
  - id: enemy-autobattle
    content: 实现_updateEnemyAutoAttack(dt)：敌人实时攻击逻辑（基于spd攻速+技能CD+AI选技能），替换原有enemy_turn队列机制
    status: completed
    dependencies:
      - init-autobattle-state
  - id: update-render-input
    content: 改造update()输入分发和渲染层：update中集成auto_battle循环+speed缩放dt；_handleTap简化为仅处理加速/暂停+结束按钮；新增_renderAutoBattleUI()状态面板；修改_renderTurnInfo()为战斗时长；调整_renderHeroCards()为纯信息展示
    status: completed
    dependencies:
      - init-autobattle-state
      - autobattle-engine
      - enemy-autobattle
  - id: integrate-test-polish
    content: 集成调试和细节打磨：确保胜利/失败/感化流程不受影响、CD显示准确性测试、暂停/加速响应验证、MP自然恢复（可选）、日志输出优化
    status: completed
    dependencies:
      - autobattle-engine
      - enemy-autobattle
      - update-render-input
---

## Product Overview

将战斗系统从**回合制点击操作**改造为**实时自由攻击模式（ARPG）**。己方角色和敌人自动持续战斗，无需玩家手动点击选择目标或技能。玩家仅通过加速/暂停按钮控制战斗节奏。

## Core Features

- **实时自动战斗**：所有存活角色和敌人按攻速/CD自动释放技能，完全不需要点击操作
- **普通攻击速度限制**：每个角色/敌人的普攻有独立攻击间隔，基于spd属性计算
- **技能冷却时间**：非普攻技能有CD，CD也受spd属性影响
- **智能AI决策**：治疗角色(艾米)在队友HP<50%时优先治疗，否则普攻；其他角色优先使用CD就绪的最高级技能
- **加速/暂停按钮**：提供1x/2x速度切换和暂停功能
- **UI适配**：移除旧的选择UI（角色卡片选择、技能面板选择、目标选择），替换为实时状态面板（显示角色状态+CD进度）

## Tech Stack

- 纯微信小游戏原生Canvas渲染（无框架）
- JavaScript ES6 Module

## Tech Architecture

### 核心改动策略：最小侵入式重构

保留现有所有动画系统、伤害计算、状态效果、渲染系统不变，仅在 `battle-scene.js` 的**驱动层**做修改：

```
旧架构（回合制）:
  intro → select_hero → select_skill → select_target → animating → enemy_turn → 循环
  (玩家点击驱动一切)

新架构（实时制）:
  intro → auto_battle (持续运行) → victory/defeat
  (计时器驱动一切, update(dt) 每帧检测)
```

### 数值公式设计

基于现有 `spd` 属性（范围6-18），公式如下：

- **攻击间隔** = `2.0 - spd * 0.08` 秒（spd=10时1.2秒/次, spd=15时0.8秒/次, spd=6时1.52秒/次）
- **技能CD基础值** = 按 skill.power 分档: power<=1.0 → 5s, power<=1.5 → 8s, power<=2.0 → 12s, power>2.0 → 15s
- **最终CD** = `baseCd * (1.5 - spd * 0.03)` （spd越高CD越短，但不会低于基础值的50%）

### AI技能优先级规则

1. 治疗型角色(role=healer): 队友HP<50%且治疗CD就绪→使用治疗；否则→普攻
2. 其他角色:

- CD就绪的非普攻技能中，选power最高的（MP足够时）
- 无可用技能或MP不足时→普攻
- 全体攻击技能(target=all)优先于单体（当敌方数量>=2时）

### 并发控制

为避免多个角色同时攻击导致视觉混乱，引入"全局攻击槽位"(maxConcurrentAttacks=2)：

- 同时最多2个单位在执行攻击动画
- 攻击动画中的角色不触发新攻击
- 敌人和己方共享槽位

## Implementation Details

### 核心数据结构变化

构造函数新增：

```javascript
// 自动战斗状态
this.battlePhase = 'intro'  // 'intro' | 'auto_battle' | 'victory' | 'defeat' | 'purify'
this.battleSpeed = 1        // 1x 或 2x
this.isPaused = false       // 暂停状态

// 角色攻击计时器 { heroId: { attackTimer, skillCDs: { skillId: remainingCd } } }
this.heroAttackTimers = {}
// 敌人攻击计时器 { enemyIndex: { attackTimer, skillCDs: {...} } }
this.enemyAttackTimers = {}

// 全局并发控制
this.activeAttackCount = 0    // 当前正在播放攻击动画的数量
const MAX_CONCURRENT_ATTACKS = 2
```

### update(dt) 变化

- 移除回合制phase判断(select_hero/select_skill/select_target/enemy_turn)
- 新增 `_updateAutoBattle(dt)` 调用（仅在auto_battle阶段且未暂停时执行）
- dt乘以 battleSpeed 实现加速效果

### _handleTap() 变化

- 仅保留：victory/defeat/purify阶段的按钮处理 + 加速/暂停按钮检测
- 移除：select_hero/skill/target的处理分支

### 渲染变化

- 移除：_renderSkillPanel()（选择阶段UI）、_renderHeroCards()中的交互提示
- 新增：_renderAutoBattleUI() -- 显示每个角色的CD冷却圈/条 + 加速暂停按钮
- 保留：_renderHeroCards()（改为纯信息展示）、_renderTurnInfo()（改为显示战斗时间）

### 可复用的部分（完全不改动）

- `_executeSkill()` / `_executeMeleeAttack()` / `_executeRangedAttack()` - 技能执行逻辑
- `_updateAttackAnimation()` / `_startAttackAnimation()` - 攻击跳跃动画
- `_enemyAction()` / `_startEnemyAttackAnimation()` / `_updateEnemyAttackAnimation()` - 敌人攻击
- `_applyMagicDamage()` / `_applyHealDamage()` - 伤害/治疗计算
- `_applyStatusEffect()` / 状态效果系统
- `_renderEnemySprites()` / `_drawEnemySprite()` - 敌人绘制
- `_renderBattleLog()` - 战斗日志
- 胜利/失败/感化流程

### 文件影响范围

| 文件 | 改动量 | 说明 |
| --- | --- | --- |
| `scripts/scenes/battle-scene.js` | **大改** | 核心重构，约涉及30%代码 |
| `scripts/data/heroes.js` | 微调 | 可选：给部分技能加cooldownBase字段（也可纯公式） |
| `scripts/data/enemies.js` | 不变 | 敌人复用相同公式 |


## 设计风格：ARPG实时战斗仪表盘风格

采用深色科技风战斗界面，强调信息密度和实时反馈感。整体以暗色调为主，配合亮色状态指示器（冷却完成=绿色高亮、冷却中=灰色遮罩、施法中=橙色发光）。移除所有需要点击选择的卡片和按钮区域，替换为紧凑的状态监控面板。

### 页面规划

#### 战斗主画面（唯一核心页面）

分为4个主要区块：

**区块1：顶部信息栏**

- 左侧：战斗时长计时器（替代原回合数）
- 中央：当前战斗阶段标签（"战斗中"/"已暂停"）
- 右侧：加速/暂停控制按钮组（||暂停 | 1x | 2x）
- 半透明暗色背景条，底部金色细线分隔

**区块2：中央战斗区域（保持不变）**

- 己方角色精灵（左侧）+ 敌人精灵（右侧）
- HP血条、名称、等级、状态图标
- 攻击动画、伤害数字、特效
- 这块完全复用现有渲染逻辑，不做修改

**区块3：底部角色状态面板（替代原技能选择面板）**

- 横向排列所有存活角色的紧凑状态条
- 每个角色显示：头像(小) + 名字 + HP/MP条 + 当前行动指示
- 技能CD图标行：每个技能一个小圆形图标，外圈表示CD剩余比例
- CD完成时图标明亮发光 + 脉冲动画
- CD中时图标半透明 + 倒计时数字
- 正在施放的角色图标高亮边框

**区块4：战斗日志区**

- 保持现有日志滚动展示，位置微调上移
- 缩减高度给状态面板让出空间

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 深度探索 battle-scene.js 中所有与 phase 状态机相关的方法调用链，确保重构时不遗漏依赖点
- Expected outcome: 精确列出所有引用 this.phase 进行条件判断的位置，以及 _handleTap/_handleHeroSelect/_handleSkillSelect/_handleTargetSelect 等方法的完整调用关系