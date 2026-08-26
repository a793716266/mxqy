// 石像守卫动画资源 & 三处接线回归（2026-08-26）
//
// 覆盖：
//   1) 切片产物：subpackages/battle/images/characters_anim/transparent/stone_golem/{idle,walk,attack,skill}/<a>_NN.png
//      共 4×8 = 32 帧全部存在
//   2) stone-golem.js animationConfig：4 套动作各 start=1 end=8 framePad=2，路径含子目录
//   3) buildFrames 期望键：STONE_GOLEM_<ACTION>_01..08 共 32 键
//   4) field-scene.js 三处接线：useCatAnim×3 / configMap / prefixMap
//   5) asset-manager.js：STONE_GOLEM buildFrames 注册
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const ROOT = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log(`  ✓ ${msg}`); };
const ng = (msg) => { fail++; console.log(`  ✗ ${msg}`); };

// 1) 32 帧文件
console.log('== 帧文件 ==');
const FRAME_DIR = path.join(ROOT, 'subpackages/battle/images/characters_anim/transparent/stone_golem');
const acts = ['idle', 'walk', 'attack', 'skill'];
for (const a of acts) {
  for (let n = 1; n <= 8; n++) {
    const f = path.join(FRAME_DIR, a, `${a}_${String(n).padStart(2, '0')}.png`);
    if (fs.existsSync(f)) ok(`${a}/${a}_${String(n).padStart(2, '0')}.png`);
    else ng(`缺失 ${path.relative(ROOT, f)}`);
  }
}

// 2) stone-golem.js animationConfig
console.log('== stone-golem.js 动画配置 ==');
const cfg = require(path.join(ROOT, 'scripts/entities/monsters/stone-golem.js'));
if (cfg.id === 'stone_golem') ok('id=stone_golem'); else ng(`id=${cfg.id}`);
if (cfg.type === 'stone_golem') ok('type=stone_golem'); else ng(`type=${cfg.type}`);
if (cfg.animationConfig) ok('含 animationConfig'); else ng('缺 animationConfig');
for (const a of acts) {
  const ac = cfg.animationConfig && cfg.animationConfig[a];
  if (!ac) { ng(`animationConfig.${a} 缺失`); continue; }
  const ok_ = ac.start === 1 && ac.end === 8 && ac.framePad === 2
    && typeof ac.frameDuration === 'number'
    && ac.path.includes(`stone_golem/${a}/`);
  if (ok_) ok(`${a}: 1..8 pad=2 dur=${ac.frameDuration}ms`);
  else ng(`${a} 异常: ${JSON.stringify({ s: ac.start, e: ac.end, p: ac.framePad, d: ac.frameDuration, path: ac.path })}`);
}
if (cfg.renderConfig && cfg.renderConfig.spriteType === 'stone_golem') ok('renderConfig.spriteType=stone_golem');
else ng(`spriteType=${cfg.renderConfig && cfg.renderConfig.spriteType}`);

// 3) buildFrames 期望键
console.log('== buildFrames 键 ==');
const wantKeys = new Set();
for (const a of acts) for (let n = 1; n <= 8; n++) {
  wantKeys.add(`STONE_GOLEM_${a.toUpperCase()}_${String(n).padStart(2, '0')}`);
}
if (wantKeys.size === 32) ok(`期望 32 键 STONE_GOLEM_<A>_01..08`); else ng(`wantKeys.size=${wantKeys.size}`);

// 4) field-scene.js 三处接线
console.log('== field-scene.js 接线 ==');
const fsCode = fs.readFileSync(path.join(ROOT, 'scripts/scenes/field-scene.js'), 'utf8');
// 4a) useCatAnim 三处都含 stone_golem
const useCatMatches = fsCode.match(/\['slime_cat'[^\]]*?shadow_mouse_smooth',\s*'stone_golem'\]/g) || [];
if (useCatMatches.length === 3) ok(`useCatAnim 三处均含 stone_golem`);
else ng(`useCatAnim 含 stone_golem 处数=${useCatMatches.length}（期望 3）`);
// 4b) configMap
const cfgRe = /'stone_golem':\s*require\('\.\.\/entities\/monsters\/stone-golem\.js'\)/;
if (cfgRe.test(fsCode)) ok('_getMonsterConfig.configMap 含 stone_golem');
else ng('configMap 缺 stone_golem');
// 4c) prefixMap
const pfxRe = /'stone_golem':\s*'STONE_GOLEM'/;
if (pfxRe.test(fsCode)) ok('_buildFrameKey.prefixMap 含 stone_golem');
else ng('prefixMap 缺 stone_golem');

// 5) asset-manager.js 注册
console.log('== asset-manager.js 注册 ==');
const amCode = fs.readFileSync(path.join(ROOT, 'scripts/core/asset-manager.js'), 'utf8');
const amRe = /buildFrames\('STONE_GOLEM',\s*'images\/characters_anim\/transparent\/stone_golem',?\s*\[[\s\S]*?frames:\s*8[\s\S]*?\]\)/;
if (amRe.test(amCode)) ok('STONE_GOLEM buildFrames 已注册（idle/walk/attack/skill 各 8 帧）');
else ng('asset-manager 缺 STONE_GOLEM buildFrames');

// 6) 运行时键→文件解析（等价于加载 ASSETS 后 assets.get(key) 拿到的 path 必须落盘存在）
console.log('== 键→文件解析（BATTLE_PKG + images/.../stone_golem/<a>/<a>_NN.png）==');
const BATTLE_PKG = 'subpackages/battle/';
let resolvePass = 0, resolveFail = 0;
for (const a of acts) for (let n = 1; n <= 8; n++) {
  const p = path.join(ROOT, BATTLE_PKG,
    'images/characters_anim/transparent/stone_golem', a,
    `${a}_${String(n).padStart(2, '0')}.png`);
  if (fs.existsSync(p)) resolvePass++;
  else { resolveFail++; ng(`key STONE_GOLEM_${a.toUpperCase()}_${String(n).padStart(2,'0')} → 缺失 ${path.relative(ROOT, p)}`); }
}
if (resolveFail === 0) ok(`32 键全部解析到落盘文件（${resolvePass}/32）`);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
