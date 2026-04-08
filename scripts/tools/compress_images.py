#!/usr/bin/env python3
"""
压缩项目图片资源 - 目标让images目录 < 3MB
- 动画帧：缩小到极小尺寸（小游戏Canvas渲染足够）
- 特效帧：大幅缩小
- 背景图：缩小到512px
- 地图：缩小
- 移除源素材(mp4/jpeg)
"""

import os
import shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMAGES_DIR = os.path.join(ROOT, 'images')
BACKUP_DIR = os.path.join(ROOT, '_source_backup')

def compress_png(filepath, max_size):
    """压缩PNG图片到指定最大边长"""
    try:
        img = Image.open(filepath)
        w, h = img.size
        if max(w, h) > max_size:
            ratio = max_size / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        img.save(filepath, 'PNG', optimize=True)
        return True
    except Exception as e:
        print(f"  ✗ {filepath}: {e}")
        return False

def compress_jpeg(filepath, max_size, quality=60):
    """压缩JPEG"""
    try:
        img = Image.open(filepath)
        w, h = img.size
        if max(w, h) > max_size:
            ratio = max_size / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        img.save(filepath, 'JPEG', quality=quality, optimize=True)
        return True
    except Exception as e:
        print(f"  ✗ {filepath}: {e}")
        return False

def main():
    # 创建源素材备份目录
    os.makedirs(BACKUP_DIR, exist_ok=True)

    total_before = 0
    total_after = 0

    # 1. 移动mp4和jpeg源素材到备份（不打包进游戏）
    print("📦 移动源素材到备份目录...")
    for root, dirs, files in os.walk(IMAGES_DIR):
        for f in files:
            src = os.path.join(root, f)
            if f.endswith('.mp4') or (f.endswith('.jpeg') and 'village' not in f):
                rel = os.path.relpath(src, ROOT)
                dst = os.path.join(BACKUP_DIR, f)
                shutil.move(src, dst)
                print(f"  移动: {rel} → _source_backup/")

    # 2. 压缩动画帧（角色动画 - max 160px，小游戏中显示约60px高度足够）
    print("\n🖼️ 压缩角色动画帧 (max 160px)...")
    anim_dir = os.path.join(IMAGES_DIR, 'characters_anim')
    if os.path.exists(anim_dir):
        for root, dirs, files in os.walk(anim_dir):
            if 'backup' in root or '_未使用' in root:
                continue
            for f in files:
                if not f.endswith('.png'): continue
                p = os.path.join(root, f)
                before = os.path.getsize(p)
                compress_png(p, 160)
                after = os.path.getsize(p)
                total_before += before
                total_after += after

    # 3. 压缩特效帧（max 200px）
    print("\n✨ 压缩特效帧 (max 200px)...")
    effects_dir = os.path.join(IMAGES_DIR, 'effects')
    if os.path.exists(effects_dir):
        for root, dirs, files in os.walk(effects_dir):
            for f in files:
                if not f.endswith('.png'): continue
                p = os.path.join(root, f)
                before = os.path.getsize(p)
                compress_png(p, 200)
                after = os.path.getsize(p)
                total_before += before
                total_after += after

    # 4. 压缩背景图（max 512px）
    print("\n🏞️ 压缩背景图 (max 512px)...")
    bg_dir = os.path.join(IMAGES_DIR, 'backgrounds')
    if os.path.exists(bg_dir):
        for f in os.listdir(bg_dir):
            p = os.path.join(bg_dir, f)
            if f.endswith('.png'):
                before = os.path.getsize(p)
                compress_png(p, 512)
                after = os.path.getsize(p)
                total_before += before
                total_after += after

    # 5. 压缩地图（max 800px）
    print("\n🗺️ 压缩地图 (max 800px)...")
    map_dir = os.path.join(IMAGES_DIR, 'map')
    if os.path.exists(map_dir):
        for f in os.listdir(map_dir):
            p = os.path.join(map_dir, f)
            before = os.path.getsize(p)
            if f.endswith('.png'):
                compress_png(p, 800)
            elif f.endswith('.jpeg'):
                compress_jpeg(p, 800, 60)
            after = os.path.getsize(p)
            total_before += before
            total_after += after

    # 6. 压缩map_world.png
    p = os.path.join(IMAGES_DIR, 'map_world.png')
    if os.path.exists(p):
        before = os.path.getsize(p)
        compress_png(p, 800)
        after = os.path.getsize(p)
        total_before += before
        total_after += after

    # 7. 压缩猫咪图鉴和角色（max 300px）
    print("\n🐱 压缩猫咪/角色图 (max 300px)...")
    for subdir in ['cats', 'characters']:
        sd = os.path.join(IMAGES_DIR, subdir)
        if os.path.exists(sd):
            for root, dirs, files in os.walk(sd):
                for f in files:
                    p = os.path.join(root, f)
                    before = os.path.getsize(p)
                    if f.endswith('.png'):
                        compress_png(p, 300)
                    elif f.endswith('.jpeg'):
                        compress_jpeg(p, 300, 70)
                    after = os.path.getsize(p)
                    total_before += before
                    total_after += after

    # 统计
    print(f"\n{'='*50}")
    # 重新计算总大小
    final_total = 0
    for root, dirs, files in os.walk(IMAGES_DIR):
        for f in files:
            p = os.path.join(root, f)
            final_total += os.path.getsize(p)
    print(f"压缩后 images/ 总大小: {final_total/1024/1024:.1f}MB")
    print(f"目标: < 3MB")

if __name__ == '__main__':
    main()
