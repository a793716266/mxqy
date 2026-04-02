/**
 * map-scene.js - 地图探索场景
 */

import { HEROES } from '../data/heroes.js'
import { MAP_NODES, ENEMIES_CH1 } from '../data/enemies.js'

export class MapScene {
  constructor(game, data) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0

    // 当前所在节点
    this.currentNodeId = data?.nodeId || 'ch1_town'
    this.currentNode = MAP_NODES[this.currentNodeId]

    // 战斗队伍状态（简单版：用默认数据）
    this.party = this._initParty()

    // 对话框
    this.dialogue = null
    this.dialogueQueue = []
    this.dialogueCallback = null

    // 战斗触发
    this._battleTriggered = false

    // UI 状态
    this.showMenu = false
    this.showParty = false
  }

  _initParty() {
    return HEROES.slice(0, 2).map(h => ({
      ...h,
      hp: h.maxHp,
      mp: h.maxMp,
      buffs: []
    }))
  }

  init() {
    // 如果是 Boss 节点，直接触发战斗
    if (this.currentNode.boss && !this.currentNode.defeated) {
      this._startBattle(this.currentNode.boss)
    } else if (this.currentNode.npc) {
      // 显示 NPC 对话
      for (const npc of this.currentNode.npc) {
        if (npc.dialogue) {
          this.dialogue = { text: npc.dialogue, name: npc.name }
        }
      }
    }

    // 随机遭遇检查
    if (this.currentNode.encounters && !this.currentNode.boss) {
      this._checkEncounter()
    }
  }

  _checkEncounter() {
    for (const enc of this.currentNode.encounters) {
      if (Math.random() < enc.chance * 0.4) { // 降低遭遇率
        this._battleTriggered = true
        // 延迟触发战斗，先显示场景
        setTimeout(() => {
          this._startBattle(enc.enemy)
        }, 1500)
        break
      }
    }
  }

  _startBattle(enemyId) {
    const enemyData = ENEMIES_CH1[enemyId]
    if (!enemyData) return

    this.game.changeScene('battle', {
      party: this.party,
      enemy: { ...enemyData, hp: enemyData.maxHp },
      bg: this.currentNode.bg,
      nodeId: this.currentNodeId
    })
  }

  update(dt) {
    this.time += dt

    // 点击处理
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        const tx = tap.x
        const ty = tap.y

        // 关闭对话框
        if (this.dialogue) {
          this.dialogue = null
          return
        }

        // 返回按钮
        if (this._isInRect(tx, ty, 10 * this.dpr, 10 * this.dpr, 80 * this.dpr, 40 * this.dpr)) {
          this.game.changeScene('main-menu')
          return
        }

        // 前进按钮（连接的节点）
        if (this.currentNode.connections && this.currentNode.connections.length > 0 && !this._battleTriggered) {
          const btnX = this.width - 130 * this.dpr
          const btnY = this.height - 100 * this.dpr
          if (this._isInRect(tx, ty, btnX, btnY, 120 * this.dpr, 50 * this.dpr)) {
            this._moveToNextNode()
          }
        }
      }
    }
  }

  _moveToNextNode() {
    const nextId = this.currentNode.connections[1] || this.currentNode.connections[0]
    if (nextId) {
      this.currentNodeId = nextId
      this.currentNode = MAP_NODES[nextId]
      this._battleTriggered = false
      this.init()
    }
  }

  _isInRect(x, y, rx, ry, rw, rh) {
    return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh
  }

  render(ctx) {
    const w = this.width
    const h = this.height
    const dpr = this.dpr

    // 背景色
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, w, h)

    // 节点名称
    ctx.font = `bold ${28 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(`📍 ${this.currentNode.name}`, w / 2, 60 * dpr)

    // 场景描述区
    const descY = 100 * dpr
    ctx.font = `${16 * dpr}px sans-serif`
    ctx.fillStyle = 'rgba(200, 200, 220, 0.7)'

    if (this.currentNode.type === 'town') {
      ctx.fillText('这里是一个宁静的小镇，猫咪们和平地生活着', w / 2, descY)
    } else if (this.currentNode.type === 'road') {
      ctx.fillText('探索中...小心野猫出没！', w / 2, descY)
    } else if (this.currentNode.type === 'boss') {
      ctx.fillText('危险！强大的敌人就在前方！', w / 2, descY)
    }

    // 角色状态栏
    this._renderPartyStatus(ctx)

    // 地图路线图（简化版）
    this._renderMinimap(ctx)

    // 遭遇提示
    if (this._battleTriggered) {
      ctx.font = `bold ${24 * dpr}px sans-serif`
      ctx.fillStyle = `rgba(255, 80, 80, ${0.5 + Math.sin(this.time * 8) * 0.5})`
      ctx.textAlign = 'center'
      ctx.fillText('⚠️ 遭遇敌人！', w / 2, h / 2)
    }

    // 前进按钮
    if (this.currentNode.connections && !this._battleTriggered) {
      const btnX = w - 130 * dpr
      const btnY = h - 100 * dpr
      this._drawButton(ctx, btnX, btnY, 120 * dpr, 50 * dpr, '前进 →', '#54a0ff')
    }

    // 返回按钮
    this._drawButton(ctx, 10 * dpr, 10 * dpr, 80 * dpr, 40 * dpr, '← 返回', '#666666')

    // 对话框
    if (this.dialogue) {
      this._renderDialogue(ctx)
    }
  }

  _renderPartyStatus(ctx) {
    const dpr = this.dpr
    const startY = 140 * dpr
    const cardW = (this.width - 40 * dpr) / 2

    this.party.forEach((hero, i) => {
      const x = 10 * dpr + (i % 2) * (cardW + 10 * dpr)
      const y = startY + Math.floor(i / 2) * 80 * dpr

      // 卡片背景
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.beginPath()
      this._roundRect(ctx, x, y, cardW - 5 * dpr, 70 * dpr, 8 * dpr)
      ctx.fill()

      // 名字
      ctx.font = `bold ${16 * dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(hero.name, x + 10 * dpr, y + 22 * dpr)

      // HP 条
      this._drawBar(ctx, x + 10 * dpr, y + 32 * dpr, cardW - 30 * dpr, 12 * dpr,
        hero.hp / hero.maxHp, '#ff6b6b', `${hero.hp}/${hero.maxHp}`)

      // MP 条
      this._drawBar(ctx, x + 10 * dpr, y + 50 * dpr, cardW - 30 * dpr, 12 * dpr,
        hero.mp / hero.maxMp, '#4ecdc4', `${hero.mp}/${hero.maxMp}`)
    })
  }

  _renderMinimap(ctx) {
    const dpr = this.dpr
    const mapX = 20 * dpr
    const mapY = this.height - 280 * dpr
    const mapW = this.width - 40 * dpr
    const mapH = 180 * dpr

    // 地图背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.beginPath()
    this._roundRect(ctx, mapX, mapY, mapW, mapH, 10 * dpr)
    ctx.fill()

    // 标题
    ctx.font = `bold ${14 * dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'left'
    ctx.fillText('🗺️ 路线图', mapX + 10 * dpr, mapY + 20 * dpr)

    // 绘制节点
    const allNodes = Object.values(MAP_NODES)
    for (const node of allNodes) {
      const nx = mapX + (node.x / 700) * (mapW - 40 * dpr) + 20 * dpr
      const ny = mapY + (node.y / 500) * (mapH - 40 * dpr) + 30 * dpr

      // 连线
      if (node.connections) {
        for (const connId of node.connections) {
          const conn = MAP_NODES[connId]
          if (conn && conn.x < node.x) { // 避免重复画线
            const cx = mapX + (conn.x / 700) * (mapW - 40 * dpr) + 20 * dpr
            const cy = mapY + (conn.y / 500) * (mapH - 40 * dpr) + 30 * dpr
            ctx.beginPath()
            ctx.moveTo(nx, ny)
            ctx.lineTo(cx, cy)
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'
            ctx.lineWidth = 2 * dpr
            ctx.stroke()
          }
        }
      }

      // 节点圆点
      const isCurrent = node.id === this.currentNodeId
      const radius = (isCurrent ? 10 : 6) * dpr

      ctx.beginPath()
      ctx.arc(nx, ny, radius, 0, Math.PI * 2)

      if (isCurrent) {
        ctx.fillStyle = '#ff9f43'
        ctx.fill()
        // 发光效果
        ctx.beginPath()
        ctx.arc(nx, ny, radius + 4 * dpr, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 159, 67, ${0.3 + Math.sin(this.time * 3) * 0.2})`
        ctx.lineWidth = 2 * dpr
        ctx.stroke()
      } else if (node.type === 'boss') {
        ctx.fillStyle = '#ff4757'
        ctx.fill()
      } else if (node.type === 'town') {
        ctx.fillStyle = '#2ed573'
        ctx.fill()
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fill()
      }

      // 节点名称
      ctx.font = `${10 * dpr}px sans-serif`
      ctx.fillStyle = isCurrent ? '#ff9f43' : 'rgba(255,255,255,0.6)'
      ctx.textAlign = 'center'
      ctx.fillText(node.name, nx, ny + radius + 14 * dpr)
    }
  }

  _renderDialogue(ctx) {
    const dpr = this.dpr
    const w = this.width
    const h = this.height
    const boxH = 140 * dpr
    const boxY = h - boxH - 30 * dpr

    // 对话框背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    this._roundRect(ctx, 20 * dpr, boxY, w - 40 * dpr, boxH, 12 * dpr)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 159, 67, 0.5)'
    ctx.lineWidth = 2 * dpr
    ctx.stroke()

    // 说话者名字
    ctx.font = `bold ${18 * dpr}px sans-serif`
    ctx.fillStyle = '#ff9f43'
    ctx.textAlign = 'left'
    ctx.fillText(this.dialogue.name, 40 * dpr, boxY + 30 * dpr)

    // 对话内容
    ctx.font = `${16 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(this.dialogue.text, 40 * dpr, boxY + 60 * dpr, w - 80 * dpr)

    // 点击继续提示
    ctx.font = `${12 * dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.textAlign = 'right'
    ctx.fillText('点击继续 ▶', w - 40 * dpr, boxY + boxH - 15 * dpr)
  }

  _drawButton(ctx, x, y, w, h, text, color) {
    ctx.fillStyle = color
    ctx.beginPath()
    this._roundRect(ctx, x, y, w, h, 8 * this.dpr)
    ctx.fill()

    ctx.font = `bold ${18 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + w / 2, y + h / 2)
    ctx.textBaseline = 'alphabetic'
  }

  _drawBar(ctx, x, y, w, h, ratio, color, text) {
    ratio = Math.max(0, Math.min(1, ratio))

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.beginPath()
    this._roundRect(ctx, x, y, w, h, h / 2)
    ctx.fill()

    // 填充
    if (ratio > 0) {
      ctx.fillStyle = color
      ctx.beginPath()
      this._roundRect(ctx, x, y, w * ratio, h, h / 2)
      ctx.fill()
    }

    // 文字
    ctx.font = `bold ${h * 0.8}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + w / 2, y + h / 2)
    ctx.textBaseline = 'alphabetic'
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }
}
