#!/usr/bin/env python3
"""
检测 cast_universal.png 每帧中角色的实际位置（边界框）
用于诊断"前后平移"问题
"""
from PIL import Image

IMG = "subpackages/battle/images/characters_anim/transparent/lixiaobao/cast_universal.png"

img = Image.open(IMG).convert("RGBA")
w, h = img.size
print(f"图片尺寸: {w}x{h}")
px = img.load()

frames = 7
frameW = w // frames  # 234

print(f"\n{'帧':>3} | {'X范围':>10} | {'角色左':>6} {'角色右':>6} {'角色宽':>6} | {'脚底Y':>5} {'头顶Y':>5} {'高度':>5} | {'水平中心':>7} {'偏离均值':>8}")
print("-" * 100)

centers = []
for i in range(frames):
    sx = i * frameW
    ex = sx + frameW
    
    # 找这帧内角色的边界
    min_x, max_x = frameW, 0
    min_y, max_y = h, 0
    bottom_y = 0  # 脚底(最下面的不透明像素)
    
    for y in range(h):
        for x in range(sx, ex):
            r, g, b, a = px[x, y]
            if a > 30:
                local_x = x - sx  # 相对于帧起始的x
                min_x = min(min_x, local_x)
                max_x = max(max_x, local_x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                bottom_y = max(bottom_y, y)
    
    role_w = max_x - min_x if max_x > min_x else 0
    center = (min_x + max_x) / 2 if max_x > min_x else frameW // 2
    centers.append(center)
    
    print(f"{i:>3} | {sx:>4}-{ex:<4} | {min_x:>6} {max_x:>6} {role_w:>6} | {bottom_y:>5} {min_y:>5} {max_y-min_y:>5} | {center:>7.1f}")

# 统计
if centers:
    avg_c = sum(centers) / len(centers)
    print(f"\n{'平均中心':}: {avg_c:.1f} px (相对于帧左边缘)")
    print(f"\n各帧中心与平均值的偏差:")
    for i, c in enumerate(centers):
        diff = c - avg_c
        bar = " " * int(avg_c) + "*" * int(abs(diff))
        direction = "→右偏" if diff > 0 else ("←左偏" if diff < 0 else "  居中")
        print(f"  帧{i}: 偏差 {diff:+.1f}px ({direction})")

print(f"\n结论:")
print(f"  如果偏差 > 5px，播放时会有明显的前后抖动/平移")
print(f"  解决方案: 需要对每帧单独裁剪后，按'脚底锚点'重新排列到统一画布上")
