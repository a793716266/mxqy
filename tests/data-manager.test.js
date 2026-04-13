/**
 * data-manager.test.js - 存档管理器测试
 *
 * 覆盖范围：
 * - 默认数据结构
 * - dot-notation 读写
 * - 旧字段兼容（get/set old flat keys）
 * - v0 → v1 自动迁移
 * - 版本检测与 _mergeDefaults 补全
 * - _validate() 校验
 * - save / load / clear
 * - addFlag / hasFlag
 * - fieldMonsters 双向读写
 */

import { DataManager } from '../scripts/core/data-manager.js'

// 工具：从 DataManager 实例直接读取内存数据（绕过 wx.getStorage）
const getMemoryData = (dm) => dm.data

describe('DataManager', () => {
  beforeEach(() => {
    // 每个测试前清空 mockStorage
    global.mockStorage = {}
  })

  // ================================================================
  // 默认数据结构
  // ================================================================
  describe('默认数据结构', () => {
    test('version 字段存在且为 1', () => {
      const dm = new DataManager()
      expect(dm.data.version).toBe(1)
    })

    test('所有嵌套域都存在', () => {
      const dm = new DataManager()
      expect(dm.data.player).toBeDefined()
      expect(dm.data.progression).toBeDefined()
      expect(dm.data.characters).toEqual([])
      expect(dm.data.equipment).toEqual([])
      expect(dm.data.inventory).toEqual([])
      expect(dm.data.catsDiscovered).toEqual([])
      expect(dm.data.meta).toBeDefined()
      expect(dm.data.battle).toBeDefined()
      expect(dm.data.areas).toEqual({})
    })

    test('player 域默认值正确', () => {
      const dm = new DataManager()
      expect(dm.data.player.gold).toBe(100)
      expect(dm.data.player.level).toBe(1)
      expect(dm.data.player.exp).toBe(0)
      expect(dm.data.player.name).toBe('臻宝')
    })

    test('meta 域默认值正确', () => {
      const dm = new DataManager()
      expect(dm.data.meta.introShown).toBe(false)
      expect(dm.data.meta.testUnlockAll).toBe(false)
    })
  })

  // ================================================================
  // dot-notation 读写
  // ================================================================
  describe('dot-notation 读写', () => {
    test('get 新路径', () => {
      const dm = new DataManager()
      expect(dm.get('player.gold')).toBe(100)
      expect(dm.get('player.name')).toBe('臻宝')
      expect(dm.get('meta.introShown')).toBe(false)
    })

    test('set 新路径', () => {
      const dm = new DataManager()
      dm.set('player.gold', 9999)
      expect(dm.get('player.gold')).toBe(9999)
      expect(dm.data.player.gold).toBe(9999)  // 内部也是新路径
    })

    test('set 嵌套数组', () => {
      const dm = new DataManager()
      dm.set('progression.party', [0, 2, 3])
      expect(dm.get('progression.party')).toEqual([0, 2, 3])
    })

    test('set 嵌套对象属性', () => {
      const dm = new DataManager()
      dm.set('battle.victory', true)
      expect(dm.get('battle.victory')).toBe(true)
    })

    test('不存在的路径返回 undefined', () => {
      const dm = new DataManager()
      expect(dm.get('player.notExist')).toBeUndefined()
      expect(dm.get('notExist')).toBeUndefined()
    })

    test('set 不存在路径不应抛异常（直接挂到 data 下）', () => {
      const dm = new DataManager()
      expect(() => dm.set('newField', 123)).not.toThrow()
      expect(dm.get('newField')).toBe(123)
    })
  })

  // ================================================================
  // 旧字段兼容
  // ================================================================
  describe('旧字段兼容（legacyMap）', () => {
    test('get gold → player.gold', () => {
      const dm = new DataManager()
      expect(dm.get('gold')).toBe(100)
    })

    test('set gold → 写 player.gold', () => {
      const dm = new DataManager()
      dm.set('gold', 500)
      expect(dm.get('gold')).toBe(500)
      expect(dm.get('player.gold')).toBe(500)
    })

    test('get party → progression.party', () => {
      const dm = new DataManager()
      dm.set('party', [1, 2])
      expect(dm.get('party')).toEqual([1, 2])
      expect(dm.get('progression.party')).toEqual([1, 2])
    })

    test('get characterStates → characters', () => {
      const dm = new DataManager()
      const chars = [{ id: 'h0', hp: 100 }]
      dm.set('characterStates', chars)
      expect(dm.get('characterStates')).toEqual(chars)
      expect(dm.get('characters')).toEqual(chars)
    })

    test('get equipmentData → equipment', () => {
      const dm = new DataManager()
      dm.set('equipmentData', [{ id: 1 }])
      expect(dm.get('equipmentData')).toEqual([{ id: 1 }])
      expect(dm.get('equipment')).toEqual([{ id: 1 }])
    })

    test('get currentChapter → progression.currentChapter', () => {
      const dm = new DataManager()
      dm.set('currentChapter', 3)
      expect(dm.get('currentChapter')).toBe(3)
      expect(dm.get('progression.currentChapter')).toBe(3)
    })

    test('get introShown → meta.introShown', () => {
      const dm = new DataManager()
      dm.set('introShown', true)
      expect(dm.get('introShown')).toBe(true)
      expect(dm.get('meta.introShown')).toBe(true)
    })

    test('get amyDefeated → progression.flags.amyDefeated', () => {
      const dm = new DataManager()
      dm.set('amyDefeated', true)
      expect(dm.get('amyDefeated')).toBe(true)
      expect(dm.get('progression.flags.amyDefeated')).toBe(true)
    })

    test('get currentBattleMonsterId → battle.currentMonsterId', () => {
      const dm = new DataManager()
      dm.set('currentBattleMonsterId', 'boss_001')
      expect(dm.get('currentBattleMonsterId')).toBe('boss_001')
      expect(dm.get('battle.currentMonsterId')).toBe('boss_001')
    })

    test('get battleVictory → battle.victory', () => {
      const dm = new DataManager()
      dm.set('battleVictory', true)
      expect(dm.get('battleVictory')).toBe(true)
      expect(dm.get('battle.victory')).toBe(true)
    })

    test('get flags → progression.flags', () => {
      const dm = new DataManager()
      dm.set('flags', { foo: true })
      expect(dm.get('flags')).toEqual({ foo: true })
      expect(dm.get('progression.flags')).toEqual({ foo: true })
    })

    test('get unlockedCats → catsDiscovered', () => {
      const dm = new DataManager()
      dm.set('unlockedCats', [1, 2, 3])
      expect(dm.get('unlockedCats')).toEqual([1, 2, 3])
      expect(dm.get('catsDiscovered')).toEqual([1, 2, 3])
    })

    test('get playerName → player.name', () => {
      const dm = new DataManager()
      dm.set('playerName', '测试玩家')
      expect(dm.get('playerName')).toBe('测试玩家')
      expect(dm.get('player.name')).toBe('测试玩家')
    })
  })

  // ================================================================
  // addFlag / hasFlag
  // ================================================================
  describe('addFlag / hasFlag', () => {
    test('addFlag 设置标记', () => {
      const dm = new DataManager()
      dm.addFlag('boss_amy_defeated')
      expect(dm.hasFlag('boss_amy_defeated')).toBe(true)
      expect(dm.data.progression.flags.boss_amy_defeated).toBe(true)
    })

    test('addFlag 设置值（hasFlag 实际返回 boolean，取反后为 false）', () => {
      // hasFlag 内部用 !! 转 boolean，所以存 123 → 返回 true（123 是 truthy）
      // 若存 false → !!false = false
      const dm = new DataManager()
      dm.addFlag('key', 0)  // 存 0，!!0 = false
      expect(dm.hasFlag('key')).toBe(false)  // 因为 0 是 falsy
    })

    test('hasFlag 对未设置的 key 返回 false', () => {
      const dm = new DataManager()
      expect(dm.hasFlag('notExist')).toBe(false)
    })

    test('addFlag 兼容旧字段名', () => {
      const dm = new DataManager()
      dm.addFlag('amyDefeated', true)
      expect(dm.hasFlag('amyDefeated')).toBe(true)
      expect(dm.get('progression.flags.amyDefeated')).toBe(true)
    })
  })

  // ================================================================
  // v0 → v1 迁移
  // ================================================================
  describe('v0 → v1 迁移', () => {
    test('旧格式存档（无 version）正确迁移', () => {
      const dm = new DataManager()
      const oldSave = {
        playerName: '测试玩家',
        gold: 888,
        level: 5,
        exp: 1234,
        party: [0, 1],
        currentChapter: 2,
        characterStates: [{ id: 'h0', hp: 80 }],
        equipmentData: [{ id: 1, name: '铁剑' }],
        introShown: true,
        amyDefeated: true,
        battleVictory: true,
        // fieldMonsters_ 开头的动态字段
        fieldMonsters_area_1: [{ id: 'm1', hp: 0 }],
        fieldMonsters_area_2: [{ id: 'm2', hp: 50 }],
      }

      // 直接用 _migrate 模拟旧存档加载
      const migrated = dm._migrate(oldSave)

      expect(migrated.version).toBe(1)
      expect(migrated.player.name).toBe('测试玩家')
      expect(migrated.player.gold).toBe(888)
      expect(migrated.player.level).toBe(5)
      expect(migrated.player.exp).toBe(1234)
      expect(migrated.progression.party).toEqual([0, 1])
      expect(migrated.progression.currentChapter).toBe(2)
      expect(migrated.characters).toEqual([{ id: 'h0', hp: 80 }])
      expect(migrated.equipment).toEqual([{ id: 1, name: '铁剑' }])
      expect(migrated.meta.introShown).toBe(true)
      expect(migrated.progression.flags.amyDefeated).toBe(true)
      expect(migrated.battle.victory).toBe(true)
    })

    test('fieldMonsters_${areaId} 迁移到 areas[areaId].monsters', () => {
      const dm = new DataManager()
      const oldSave = {
        fieldMonsters_area_1: [{ id: 'm1', hp: 10 }],
        fieldMonsters_area_forest: [{ id: 'm2', hp: 20 }],
      }
      const migrated = dm._migrate(oldSave)

      expect(migrated.areas.area_1.monsters).toEqual([{ id: 'm1', hp: 10 }])
      expect(migrated.areas.area_forest.monsters).toEqual([{ id: 'm2', hp: 20 }])
    })

    test('新格式存档（version >= 1）直接使用（不覆盖已有数据）', () => {
      const dm = new DataManager()
      const newSave = {
        version: 1,
        player: { name: '老玩家', gold: 9999, level: 99, exp: 500, playTime: 10 },
        progression: { currentChapter: 5, currentNode: 'node_x', party: [0, 1, 2], flags: { foo: true } },
        characters: [{ id: 'h0', hp: 50 }],
        equipment: [{ id: 99 }],
        inventory: [{ id: 1, count: 3 }],
        catsDiscovered: [1, 2],
        meta: { introShown: true, testUnlockAll: true },
        battle: { currentMonsterId: 'boss_2', victory: false, droppedEquipment: null },
        areas: { area_1: { monsters: [{ id: 'm1' }] } }
      }
      const merged = dm._migrate(newSave)

      expect(merged.version).toBe(1)
      expect(merged.player.name).toBe('老玩家')
      expect(merged.player.gold).toBe(9999)
      expect(merged.player.level).toBe(99)
      expect(merged.progression.party).toEqual([0, 1, 2])
      expect(merged.progression.flags.foo).toBe(true)
      expect(merged.characters).toEqual([{ id: 'h0', hp: 50 }])
      expect(merged.equipment).toEqual([{ id: 99 }])
      expect(merged.inventory).toEqual([{ id: 1, count: 3 }])
      expect(merged.catsDiscovered).toEqual([1, 2])
      expect(merged.meta.introShown).toBe(true)
      expect(merged.battle.currentMonsterId).toBe('boss_2')
      expect(merged.areas.area_1.monsters).toEqual([{ id: 'm1' }])
    })

    test('新格式存档补全缺失字段', () => {
      const dm = new DataManager()
      // 只有 player 和 version，其他域都缺
      const partialSave = {
        version: 1,
        player: { name: '部分', gold: 100 }
      }
      const merged = dm._migrate(partialSave)

      // 默认值补全
      expect(merged.player.level).toBe(1)   // 默认值
      expect(merged.progression.currentChapter).toBe(1)  // 默认值
      expect(merged.meta.introShown).toBe(false)  // 默认值
      expect(merged.battle.currentMonsterId).toBe(null)  // 默认值
    })
  })

  // ================================================================
  // _validate 校验
  // ================================================================
  describe('_validate 校验', () => {
    test('正常数据校验通过', () => {
      const dm = new DataManager()
      dm.data.player.gold = 500
      dm.data.player.level = 3
      dm.data.player.exp = 100
      dm.data.progression.party = [0, 1]
      expect(dm._validate()).toBe(true)
    })

    test('gold 为 NaN 校验失败', () => {
      const dm = new DataManager()
      dm.data.player.gold = NaN
      expect(dm._validate()).toBe(false)
    })

    test('gold 为负数 校验失败', () => {
      const dm = new DataManager()
      dm.data.player.gold = -1
      expect(dm._validate()).toBe(false)
    })

    test('gold 为字符串 校验失败', () => {
      const dm = new DataManager()
      dm.data.player.gold = '100'
      expect(dm._validate()).toBe(false)
    })

    test('level < 1 校验失败', () => {
      const dm = new DataManager()
      dm.data.player.level = 0
      expect(dm._validate()).toBe(false)
    })

    test('party 不是数组 校验失败', () => {
      const dm = new DataManager()
      dm.data.progression.party = 'not_array'
      expect(dm._validate()).toBe(false)
    })

    test('characters 不是数组 校验失败', () => {
      const dm = new DataManager()
      dm.data.characters = null
      expect(dm._validate()).toBe(false)
    })

    test('meta.introShown 不是 boolean 校验失败', () => {
      const dm = new DataManager()
      dm.data.meta.introShown = 'true'  // string，不是 boolean
      expect(dm._validate()).toBe(false)
    })

    test('progression.flags 不是 object 校验失败', () => {
      const dm = new DataManager()
      dm.data.progression.flags = 'not_object'
      expect(dm._validate()).toBe(false)
    })

    test('progression.party 含非数字 校验失败', () => {
      const dm = new DataManager()
      dm.data.progression.party = [0, '1', 2]
      expect(dm._validate()).toBe(false)
    })

    test('校验过程抛异常时返回 false（不崩溃）', () => {
      const dm = new DataManager()
      // 故意破坏数据结构触发异常
      dm.data = null
      expect(dm._validate()).toBe(false)
    })
  })

  // ================================================================
  // save / load / clear / hasSave
  // ================================================================
  describe('save / load / clear', () => {
    test('save 后 hasSave 返回 true', () => {
      const dm = new DataManager()
      dm.set('player.gold', 777)
      const result = dm.save()
      expect(result).toBe(true)
      expect(dm.hasSave()).toBe(true)
    })

    test('save 后 load 恢复数据', () => {
      const dm = new DataManager()
      dm.set('player.gold', 1234)
      dm.set('player.name', '存档测试')
      dm.set('progression.party', [0, 2])
      dm.save()

      const dm2 = new DataManager()
      dm2.load()
      expect(dm2.get('player.gold')).toBe(1234)
      expect(dm2.get('player.name')).toBe('存档测试')
      expect(dm2.get('progression.party')).toEqual([0, 2])
    })

    test('clear 重置为默认数据', () => {
      const dm = new DataManager()
      dm.set('player.gold', 9999)
      dm.set('player.name', '改了')
      dm.set('progression.party', [9])
      dm.save()

      dm.clear()
      expect(dm.get('player.gold')).toBe(100)  // 默认值
      expect(dm.get('player.name')).toBe('臻宝')
      expect(dm.get('progression.party')).toEqual([0])
      expect(dm.hasSave()).toBe(false)
    })

    test('无存档时 hasSave 返回 false', () => {
      const dm = new DataManager()
      expect(dm.hasSave()).toBe(false)
    })

    test('load 校验失败时回退到默认数据', () => {
      const dm = new DataManager()
      dm.save()

      // 手动破坏存档内容（gold 改成字符串）
      global.mockStorage['meow_star_save'] = JSON.stringify({ player: { gold: 'broken' }, version: 1 })

      const dm2 = new DataManager()
      const result = dm2.load()
      expect(result).toBe(false)  // load 返回 false（校验失败）
      expect(dm2.get('player.gold')).toBe(100)  // 回退到默认值
    })

    test('save 后 playTime 递增', () => {
      const dm = new DataManager()
      dm.save()
      expect(dm.data.player.playTime).toBe(1)
      dm.save()
      expect(dm.data.player.playTime).toBe(2)
    })
  })

  // ================================================================
  // fieldMonsters_${areaId} 兼容
  // ================================================================
  describe('fieldMonsters_${areaId} 双向读写', () => {
    test('set 写入后 get 能读到（兼容路径）', () => {
      const dm = new DataManager()
      const monsters = [{ id: 'm1', hp: 100 }, { id: 'm2', hp: 50 }]
      dm.set('fieldMonsters_area_town', monsters)

      // 新路径（优先）
      expect(dm.get('fieldMonsters_area_town')).toEqual(monsters)
      expect(dm.data.areas.area_town.monsters).toEqual(monsters)
      // 根级别也有（向后兼容）
      expect(dm.data.fieldMonsters_area_town).toEqual(monsters)
    })

    test('直接写 areas[areaId].monsters，get 兼容路径也能读到', () => {
      const dm = new DataManager()
      dm.data.areas.area_test = { monsters: [{ id: 'm1' }] }

      expect(dm.get('fieldMonsters_area_test')).toEqual([{ id: 'm1' }])
    })

    test('save/load 后数据完整', () => {
      const dm = new DataManager()
      dm.set('fieldMonsters_area_1', [{ id: 'm1' }])
      dm.set('fieldMonsters_area_2', [{ id: 'm2' }])
      dm.save()

      const dm2 = new DataManager()
      dm2.load()

      expect(dm2.get('fieldMonsters_area_1')).toEqual([{ id: 'm1' }])
      expect(dm2.get('fieldMonsters_area_2')).toEqual([{ id: 'm2' }])
      expect(dm2.data.areas.area_1.monsters).toEqual([{ id: 'm1' }])
    })
  })

  // ================================================================
  // delete
  // ================================================================
  describe('delete', () => {
    test('delete 旧字段', () => {
      const dm = new DataManager()
      dm.set('droppedEquipment', { id: 1 })
      dm.delete('droppedEquipment')
      expect(dm.get('droppedEquipment')).toBeUndefined()
      expect(dm.get('battle.droppedEquipment')).toBeUndefined()
    })

    test('delete 新路径字段', () => {
      const dm = new DataManager()
      dm.set('battle.droppedEquipment', { id: 1 })
      dm.delete('battle.droppedEquipment')
      expect(dm.get('battle.droppedEquipment')).toBeUndefined()
    })

    test('delete 不存在的 key 不抛异常', () => {
      const dm = new DataManager()
      expect(() => dm.delete('notExist')).not.toThrow()
    })
  })
})
