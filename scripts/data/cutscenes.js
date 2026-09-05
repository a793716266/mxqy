/**
 * cutscenes.js — 过场剧本注册表（路线 A：引擎内演出）
 *
 * 剧本由 CutsceneScene 消费。每个剧本 = { startTheme, beats: [...] }。
 * beat 字段：
 *   bg        : 背景主题 dawn/day/sunset/night/battle/flash（交叉淡入）
 *   camera    : { focus:{x,y}(分数), zoom, dur } 相机目标
 *   actorDur  : 角色补间时长（默认=相机 dur）
 *   actors    : [{ id, heroId?, name?, at:{x,y}(分数), face:'left'|'right',
 *                  state:'idle'|'walk'|'attack'|'skill'|'buff', moving:bool,
 *                  exit?:bool, alpha?:0..1, renderConfig?:{} }]
 *   lines     : [{ speaker?, text, narrator? }]
 *   hold      : 自动推进时本 beat 停留秒数（默认 2.6）
 *   waitTap   : true=字幕全部显示后等待点击
 *   sfx/bgm   : 音效 / BGM 切换
 *   fade      : 'in'|'out' 黑场
 *
 * 角色精灵复用 CharacterSprite；heroId 解析自 heroes.js，缺失资源时静默跳过。
 */

import { HEROES } from './heroes.js'

/** 按 id 解析角色数据（供 CutsceneScene 创建精灵） */
export function getHeroById(id) {
  if (!id) return null
  return HEROES.find(h => h.id === id) || null
}

// 艾米专属渲染配置：精灵前缀 AIMI（与战斗/治愈动画一致），避免落到 HERO_AMY 错误 key
const AIMI_RENDER = {
  assetPrefix: 'AIMI',
  spriteType: 'aimi',
  totalWalkFrames: 8,
  totalIdleFrames: 8,
  walkFrameOffset: 1,
  idleFrameOffset: 1,
  walkFramePad: 2,
  idleFramePad: 2,
  flipRule: 'same',
  shadow: true,
  targetHeight: 78,
  frameDuration: 0.15,
}

export const CUTSCENES = {
  /**
   * 第一章开场：黎明草原，臻宝登场，与失散的艾米相遇。
   * 复用 zhenbao / lixiaobao / amy 现有精灵，纯引擎内演出，零包体成本。
   */
  ch1_intro: {
    startTheme: 'dawn',
    beats: [
      {
        bg: 'dawn',
        fade: 'in',
        camera: { focus: { x: 0.5, y: 0.55 }, zoom: 1, dur: 0.01 },
        lines: [
          { narrator: true, text: '很久很久以前，喵星大陆上，猫族与人类曾共享同一片星空。' },
        ],
        hold: 3.2,
      },
      {
        camera: { focus: { x: 0.5, y: 0.55 }, zoom: 1, dur: 0.01 },
        lines: [
          { narrator: true, text: '直到“黯雾”降临，记忆被窃取，伙伴们失散在大陆四方……' },
        ],
        hold: 3.2,
      },
      {
        bg: 'day',
        camera: { focus: { x: 0.32, y: 0.72 }, zoom: 1, dur: 1.0 },
        actors: [
          { id: 'zhenbao', heroId: 'zhenbao', at: { x: 0.12, y: 0.8 }, face: 'right', state: 'walk', moving: true },
        ],
        lines: [],
        hold: 1.2,
      },
      {
        camera: { focus: { x: 0.5, y: 0.72 }, zoom: 1, dur: 1.1 },
        actors: [
          { id: 'zhenbao', at: { x: 0.5, y: 0.8 }, face: 'right', state: 'idle', moving: false },
        ],
        lines: [
          { speaker: '臻宝', text: '这里的风……带着熟悉又陌生的味道。' },
        ],
        hold: 2.8,
      },
      {
        camera: { focus: { x: 0.5, y: 0.68 }, zoom: 1.35, dur: 1.0 },
        actors: [
          { id: 'zhenbao', at: { x: 0.5, y: 0.8 }, face: 'right', state: 'idle', moving: false },
        ],
        lines: [
          { speaker: '臻宝', text: '系统提示：检测到失散伙伴信号，方位——东南方。' },
        ],
        hold: 2.8,
      },
      {
        bg: 'sunset',
        camera: { focus: { x: 0.62, y: 0.72 }, zoom: 1.2, dur: 1.2 },
        actors: [
          { id: 'zhenbao', at: { x: 0.46, y: 0.8 }, face: 'right', state: 'idle', moving: false },
          { id: 'amy', heroId: 'amy', renderConfig: AIMI_RENDER, at: { x: 0.98, y: 0.82 }, face: 'left', state: 'walk', moving: true },
        ],
        lines: [
          { narrator: true, text: '草丛深处，一双怯生生的眼睛望了过来。' },
        ],
        hold: 2.6,
      },
      {
        camera: { focus: { x: 0.66, y: 0.72 }, zoom: 1.2, dur: 1.0 },
        actors: [
          { id: 'zhenbao', at: { x: 0.46, y: 0.8 }, face: 'right', state: 'idle', moving: false },
          { id: 'amy', at: { x: 0.72, y: 0.82 }, face: 'left', state: 'idle', moving: false },
        ],
        lines: [
          { speaker: '艾米', text: '你……也是来找“家”的猫吗？' },
        ],
        hold: 2.8,
      },
      {
        camera: { focus: { x: 0.58, y: 0.7 }, zoom: 1.0, dur: 1.1 },
        actors: [
          { id: 'zhenbao', at: { x: 0.46, y: 0.8 }, face: 'right', state: 'idle', moving: false },
          { id: 'amy', at: { x: 0.72, y: 0.82 }, face: 'left', state: 'idle', moving: false },
        ],
        lines: [
          { speaker: '臻宝', text: '别怕。这一次，我们一起回去。' },
        ],
        hold: 3.0,
      },
      {
        bg: 'flash',
        camera: { focus: { x: 0.58, y: 0.7 }, zoom: 1.0, dur: 0.8 },
        actors: [
          { id: 'zhenbao', at: { x: 0.46, y: 0.8 }, face: 'right', state: 'idle', moving: false },
          { id: 'amy', at: { x: 0.72, y: 0.82 }, face: 'left', state: 'idle', moving: false },
        ],
        lines: [
          { narrator: true, text: '【第一章 · 失落的星光】' },
        ],
        hold: 1.6,
        fade: 'out',
      },
    ],
  },
}

export default CUTSCENES
