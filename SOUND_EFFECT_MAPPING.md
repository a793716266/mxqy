# 喵星奇缘 - 音效资源映射表

> 本文档记录游戏音效与代码的对应关系。音效文件路径从项目根目录填写。

---

## 一、文件目录结构

```
subpackages/sound/
├── game_bgm/                    ← 背景音乐
│   ├── brainiac_maniac_bar.mp3  ← 塔防/激烈战斗
│   ├── fantasy_battle.mp3       ← 普通战斗
│   ├── fantasy_boss.mp3         ← BOSS战
│   ├── fantasy_explore.mp3      ← 野外/探索
│   ├── fantasy_menu.mp3         ← 菜单界面
│   ├── fantasy_victory.mp3      ← 胜利
│   └── town_village.mp3         ← 小镇/主城
│
└── game_sfx/                    ← 音效
    ├── battle/                  ← 战斗
    │   ├── battle_attack.mp3    ← 战斗普攻
    │   ├── battle_explosion.mp3 ← 爆炸
    │   ├── battle_hit.mp3       ← 战斗命中
    │   ├── battle_skill.mp3     ← 战斗技能
    │   └── battle_sword_slash.mp3 ← 剑击
    ├── reward/                  ← 奖励/成就
    │   ├── reward_achievement.mp3 ← 成就获得
    │   ├── reward_coin.mp3      ← 金币获得
    │   └── reward_levelup.mp3   ← 升级
    └── ui/                      ← UI交互
        ├── ui_cancel.mp3        ← 取消
        ├── ui_click.mp3         ← 点击
        ├── ui_confirm.mp3       ← 确认
        └── ui_popup.mp3         ← 弹窗
```

---

## 二、背景音乐（BMG）

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `bgm_title` | 标题画面 | 游戏启动/标题画面 | | | 待定 |
| `bgm_town` | 小镇/主城 | 主城/小镇场景 | `subpackages/sound/game_bgm/town_village.mp3` | | 轻松休闲钢琴风 |
| `bgm_explore` | 野外/探索 | 野外地图 | `subpackages/sound/game_bgm/fantasy_explore.mp3` | | 奇幻探索风 |
| `bgm_tower` | 塔防战斗 | 塔防战斗场景 | `subpackages/sound/game_bgm/brainiac_maniac_bar.mp3` | | 激烈紧迫感 |
| `bgm_battle` | 普通战斗 | 副本/普通战斗 | `subpackages/sound/game_bgm/fantasy_battle.mp3` | | 战斗感 |
| `bgm_boss` | BOSS战 | BOSS战斗 | `subpackages/sound/game_bgm/fantasy_boss.mp3` | | 压迫感 |
| `bgm_victory` | 胜利 | 游戏胜利 | `subpackages/sound/game_bgm/fantasy_victory.mp3` | | 成就感 |
| `bgm_menu` | 菜单界面 | 设置/背包等 | `subpackages/sound/game_bgm/fantasy_menu.mp3` | | 轻柔 |

---

## 三、战斗技能音效（主动释放）

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `cast_ice_shard` | 冰晶术·蓄力 | 冰晶术施法开始 | | | |
| `cast_fireball` | 火球术·蓄力 | 火球术施法开始 | | | |
| `cast_lightning` | 雷电术·蓄力 | 雷电术施法开始 | | | |
| `cast_meteor` | 陨石术·蓄力 | 陨石术施法 | | | |
| `battle_skill_release` | 战斗·技能释放 | 战斗场景技能释放 | `subpackages/sound/game_sfx/battle/battle_skill.mp3` | | |

---

## 四、技能命中/伤害音效（打到目标时）

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `hit_ice_shard` | 冰晶术·命中 | 每个冰刃击中怪物 | | | |
| `hit_fireball` | 火球术·命中 | 火球射线贯穿 | | | |
| `hit_lightning` | 雷电术·命中 | 雷电链跳跃 | | | |
| `hit_meteor` | 陨石术·命中 | 陨石落地爆炸 | | | |
| `battle_explosion` | 战斗·爆炸 | 爆炸效果 | `subpackages/sound/game_sfx/battle/battle_explosion.mp3` | | |

---

## 五、自动攻击/普攻音效

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `attack_melee` | 近战普攻 | 近战角色平A | | | |
| `attack_range` | 远程普攻 | 远程角色平A | | | |
| `battle_attack` | 战斗·攻击 | 战斗场景攻击 | `subpackages/sound/game_sfx/battle/battle_attack.mp3` | | |
| `battle_hit` | 战斗·命中 | 攻击命中反馈 | `subpackages/sound/game_sfx/battle/battle_hit.mp3` | | |
| `battle_sword` | 战斗·剑击 | 剑类武器挥砍 | `subpackages/sound/game_sfx/battle/battle_sword_slash.mp3` | | |

---

## 六、怪物音效

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `monster_death` | 怪物死亡 | 怪物生命归零 | | | |
| `monster_hit` | 怪物受击 | 怪物被攻击 | | | |
| `monster_spawn` | 怪物生成 | 怪物出生/刷新 | | | |
| `boss_death` | BOSS死亡 | BOSS被击杀 | | | |

---

## 七、UI交互音效

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `ui_click` | 按钮点击 | 任意按钮点击 | `subpackages/sound/game_sfx/ui/ui_click.mp3` | | |
| `ui_confirm` | 确认 | 确定/确认按钮 | `subpackages/sound/game_sfx/ui/ui_confirm.mp3` | | |
| `ui_cancel` | 取消 | 取消/返回按钮 | `subpackages/sound/game_sfx/ui/ui_cancel.mp3` | | |
| `ui_popup` | 弹窗出现 | 弹窗/面板打开 | `subpackages/sound/game_sfx/ui/ui_popup.mp3` | | |
| `ui_error` | 操作错误 | 操作失败 | | | 待制作 |
| `ui_success` | 操作成功 | 操作成功 | | | 待制作 |
| `ui_countdown` | 倒计时 | 倒计时最后几秒 | | | 待制作 |

---

## 八、奖励/成就音效

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `reward_coin` | 获得金币 | 获得金币时 | `subpackages/sound/game_sfx/reward/reward_coin.mp3` | | |
| `reward_levelup` | 升级 | 角色升级时 | `subpackages/sound/game_sfx/reward/reward_levelup.mp3` | | |
| `reward_achievement` | 成就获得 | 成就解锁时 | `subpackages/sound/game_sfx/reward/reward_achievement.mp3` | | |
| `reward_get_item` | 获得物品 | 获得道具时 | | | 待制作 |

---

## 九、战场环境音效

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `wave_start` | 波次开始 | 每波怪物开始 | | | 待制作 |
| `wave_complete` | 波次完成 | 一波清理完毕 | | | 待制作 |
| `game_victory` | 胜利 | 游戏胜利 | | | 复用 `bgm_victory` |
| `game_defeat` | 失败 | 游戏失败 | | | 待制作 |

---

## 十、伤害飘字音效（可选）

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `dmg_crit` | 暴击伤害 | 暴击飘字 | | | 可选 |
| `dmg_heal` | 治疗飘字 | 治疗数字 | | | 可选 |

---

## 十一、角色音效（可选）

| 音效ID | 中文名称 | 触发时机 | 音效文件 | 时长(秒) | 备注 |
|--------|---------|---------|---------|---------|------|
| `char_jump` | 跳跃 | 角色跳跃 | | | 可选 |
| `char_land` | 落地 | 角色落地 | | | 可选 |

---

## 音效制作规范（供参考）

### 文件格式
- **MP3**（微信小游戏兼容性最好）
- **采样率**：44100Hz
- **比特率**：64-128kbps

### 体积参考
| 类型 | 建议时长 | 建议大小 |
|------|---------|---------|
| UI反馈音 | 0.1-0.3秒 | 5-20KB |
| 技能音效 | 0.3-1.0秒 | 20-80KB |
| 背景音乐 | 60-180秒 | 500KB-2MB |

### 待制作音效清单
以下音效ID在文档中已留空，需要制作后填入：
1. **技能蓄力**：`cast_ice_shard`、`cast_fireball`、`cast_lightning`、`cast_meteor`
2. **技能命中**：`hit_ice_shard`、`hit_fireball`、`hit_lightning`、`hit_meteor`
3. **普攻音效**：`attack_melee`、`attack_range`
4. **怪物音效**：`monster_death`、`monster_hit`、`monster_spawn`、`boss_death`
5. **UI扩展**：`ui_error`、`ui_success`、`ui_countdown`
6. **其他**：`wave_start`、`wave_complete`、`game_defeat`、`dmg_crit`、`dmg_heal`、`char_jump`、`char_land`
