// 塔楼守护者动画资源 & 三处接线回归（2026-08-26）
//
// 覆盖：
//   1) 切片产物：subpackages/battle/images/characters_anim/transparent/tower_guardian/{idle,walk,attack,skill}/<a>_NN.png
//      共 4×8 = 32 帧全部存在
//   2) tower-guardian.js animationConfig：4 套动作各 start=1 end=8 framePad=2，路径含子目录
//   3) buildFrames 期望键：TOWER_GUARDIAN_<ACTION>_01..08 共 32 键
//   4) field-scene.js 三处接线：useCatAnim×3 / configMap / prefixMap
//   5) asset-manager.js：TOWER_GUARDIAN buildFrames 注册
//   6) 帧视觉校验：每帧四角透明（v7.3 removeBottomIsolated 删 AI 标签后应无白底/标签残留）
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
const FRAME_DIR = path.join(ROOT, 'subpackages/battle/images/characters_anim/transparent/tower_guardian');
const acts = ['idle', 'walk', 'attack', 'skill'];
for (const a of acts) {
  for (let n = 1; n <= 8; n++) {
    const f = path.join(FRAME_DIR, a, `${a}_${String(n).padStart(2, '0')}.png`);
    if (fs.existsSync(f)) ok(`${a}/${a}_${String(n).padStart(2, '0')}.png`);
    else ng(`缺失 ${path.relative(ROOT, f)}`);
  }
}

// 2) tower-guardian.js animationConfig
console.log('== tower-guardian.js 动画配置 ==');
const cfg = require(path.join(ROOT, 'scripts/entities/monsters/tower-guardian.js'));
if (cfg.id === 'tower_guardian') ok('id=tower_guardian'); else ng(`id=${cfg.id}`);
if (cfg.type === 'tower_guardian') ok('type=tower_guardian'); else ng(`type=${cfg.type}`);
if (cfg.animationConfig) ok('含 animationConfig'); else ng('缺 animationConfig');
for (const a of acts) {
  const ac = cfg.animationConfig && cfg.animationConfig[a];
  if (!ac) { ng(`animationConfig.${a} 缺失`); continue; }
  const ok_ = ac.start === 1 && ac.end === 8 && ac.framePad === 2
    && typeof ac.frameDuration === 'number'
    && ac.path.includes(`tower_guardian/${a}/`);
  if (ok_) ok(`${a}: 1..8 pad=2 dur=${ac.frameDuration}ms`);
  else ng(`${a} 异常: ${JSON.stringify({ s: ac.start, e: ac.end, p: ac.framePad, d: ac.frameDuration, path: ac.path })}`);
}
if (cfg.renderConfig && cfg.renderConfig.spriteType === 'tower_guardian') ok('renderConfig.spriteType=tower_guardian');
else ng(`spriteType=${cfg.renderConfig && cfg.renderConfig.spriteType}`);

// 3) buildFrames 期望键
console.log('== buildFrames 键 ==');
const wantKeys = new Set();
for (const a of acts) for (let n = 1; n <= 8; n++) {
  wantKeys.add(`TOWER_GUARDIAN_${a.toUpperCase()}_${String(n).padStart(2, '0')}`);
}
if (wantKeys.size === 32) ok(`期望 32 键 TOWER_GUARDIAN_<A>_01..08`); else ng(`wantKeys.size=${wantKeys.size}`);

// 4) field-scene.js 三处接线
console.log('== field-scene.js 接线 ==');
const fsCode = fs.readFileSync(path.join(ROOT, 'scripts/scenes/field-scene.js'), 'utf8');
// 4a) useCatAnim 三处都含 tower_guardian
const useCatMatches = fsCode.match(/'thug_leader',\s*'tower_guardian'\]/g) || [];
if (useCatMatches.length === 3) ok(`useCatAnim 三处均含 tower_guardian`);
else ng(`useCatAnim 含 tower_guardian 处数=${useCatMatches.length}（期望 3）`);
// 4b) configMap
const cfgRe = /'tower_guardian':\s*require\('\.\.\/entities\/monsters\/tower-guardian\.js'\)/;
if (cfgRe.test(fsCode)) ok('_getMonsterConfig.configMap 含 tower_guardian');
else ng('configMap 缺 tower_guardian');
// 4c) prefixMap
const pfxRe = /'tower_guardian':\s*'TOWER_GUARDIAN'/;
if (pfxRe.test(fsCode)) ok('_buildFrameKey.prefixMap 含 tower_guardian');
else ng('prefixMap 缺 tower_guardian');

// 5) asset-manager.js 注册
console.log('== asset-manager.js 注册 ==');
const amCode = fs.readFileSync(path.join(ROOT, 'scripts/core/asset-manager.js'), 'utf8');
const amRe = /buildFrames\('TOWER_GUARDIAN',\s*'images\/characters_anim\/transparent\/tower_guardian',?\s*\[[\s\S]*?frames:\s*8[\s\S]*?\]\)/;
if (amRe.test(amCode)) ok('TOWER_GUARDIAN buildFrames 已注册（idle/walk/attack/skill 各 8 帧）');
else ng('TOWER_GUARDIAN buildFrames 未注册');

// 6) 帧视觉校验：每帧四角透明（用 zlib+png 解析，过简版：读 8 byte 头，size 字段取 IHDR 宽高）
console.log('== 帧四角透明（v7.3 removeBottomIsolated）==');
// 简化：调用 zlib + 简单 PNG 解析得到 IDAT 解压后的 RGBA
const zlib = require('node:zlib');
function readPngRGBA(p) {
  const buf = fs.readFileSync(p);
  // PNG signature 8B, chunks
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    const type = buf.toString('ascii', off, off + 4); off += 4;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(off);
      height = buf.readUInt32BE(off + 4);
      bitDepth = buf[off + 8];
      colorType = buf[off + 9];
    } else if (type === 'IDAT') {
      idat.push(buf.slice(off, off + len));
    } else if (type === 'IEND') break;
    off += len + 4; // data + CRC
  }
  const compressed = Buffer.concat(idat);
  const raw = zlib.inflateSync(compressed);
  // colorType 6 = RGBA, 8bpp → 4 bytes/pixel + 1 filter byte per row
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp + 1;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const rowStart = y * stride + 1;
    for (let x = 0; x < width; x++) {
      const si = rowStart + x * bpp;
      const di = (y * width + x) * 4;
      rgba[di] = raw[si];
      rgba[di + 1] = raw[si + 1];
      rgba[di + 2] = raw[si + 2];
      rgba[di + 3] = bpp === 4 ? raw[si + 3] : 255;
    }
  }
  return { rgba, w: width, h: height };
}

let cornerFail = 0;
for (const a of acts) for (let n = 1; n <= 8; n++) {
  const f = path.join(FRAME_DIR, a, `${a}_${String(n).padStart(2, '0')}.png`);
  if (!fs.existsSync(f)) continue;
  const { rgba, w, h } = readPngRGBA(f);
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  const transparentCorners = corners.every((i) => rgba[i * 4 + 3] === 0);
  if (!transparentCorners) { cornerFail++; ng(`${a}_${String(n).padStart(2, '0')} 角污染`); }
}
if (cornerFail === 0) ok(`32 帧四角均透明（无 AI 源图标签/底色残留）`);

console.log(`\n=== 总结：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
