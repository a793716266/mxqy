"""
李小宝角色资源处理脚本
功能：
  1. 去除深灰色背景（透明化）
  2. 将精灵图拆分为独立帧PNG
  3. 压缩输出（优化文件大小）
"""

import os
from PIL import Image, ImageFilter

# ============================================================
# 配置
# ============================================================
SOURCE_DIR = '_source_backup/李小宝'
OUTPUT_DIR = 'images/characters_anim/lixiaobao'

# 背景色（深灰色，从图片边缘采样）
BG_COLOR = (58, 58, 66)  # #3a3a42
BG_THRESHOLD = 35        # 颜色距离阈值

# 帧布局参数（4列 x 2行 = 8帧）
# 图片尺寸约 1254x1254 或 1305x1206，需要根据实际调整裁剪区域
# 每帧包含角色区域 + 下方的编号标签，我们只保留角色部分

# 各图片的帧裁剪配置: (文件名前缀, 列数, 行数, 单帧宽, 单帧高, 起始X偏移, 起始Y偏移, 列间距, 行间距)
FRAME_CONFIGS = {
    '李小宝移动动画':   {'cols': 4, 'rows': 2, 'fw': 290, 'fh': 520, 'ox': 30, 'oy': 40, 'gx': 20, 'gy': 60},
    '李小宝待机动画':   {'cols': 4, 'rows': 2, 'fw': 290, 'fh': 520, 'ox': 30, 'oy': 50, 'gx': 20, 'gy': 55},
    '李小宝普通攻击':   {'cols': 4, 'rows': 2, 'fw': 290, 'fh': 520, 'ox': 30, 'oy': 45, 'gx': 20, 'gy': 55},
    '冰晶术释放动画':   {'cols': 4, 'rows': 2, 'fw': 300, 'fh': 520, 'ox': 25, 'oy': 35, 'gx': 22, 'gy': 60},
    '火球术释放动画':   {'cols': 4, 'rows': 2, 'fw': 290, 'fh': 520, 'ox': 30, 'oy': 40, 'gx': 20, 'gy': 55},
    '雷击术释放':       {'cols': 4, 'rows': 2, 'fw': 290, 'fh': 480, 'ox': 28, 'oy': 100, 'gx': 18, 'gy': 50},  # 雷击顶部有法杖特写帧
}


def remove_background(img, bg_color, threshold):
    """移除背景色，返回RGBA图像"""
    img = img.convert('RGBA')
    pixels = img.load()
    width, height = img.size
    
    # 创建掩码
    mask = Image.new('L', (width, height), 0)
    
    for x in range(width):
        for y in range(height):
            r, g, b, a = pixels[x, y]
            dist = ((r - bg_color[0]) ** 2 +
                    (g - bg_color[1]) ** 2 +
                    (b - bg_color[2]) ** 2) ** 0.5
            if dist > threshold:
                mask.putpixel((x, y), 255)
    
    # 膨胀掩码保护边缘
    mask = mask.filter(ImageFilter.MaxFilter(3))
    
    # 应用透明度
    for x in range(width):
        for y in range(height):
            if mask.getpixel((x, y)) == 0:
                r, g, b, a = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)
    
    return img


def crop_to_content(img):
    """裁剪到非透明内容区域（去除周围空白）"""
    if img.mode != 'RGBA':
        return img
    
    # 获取边界框
    bbox = img.getbbox()
    if bbox:
        # 加一点padding
        pad = 2
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - pad)
        x1 = min(img.width, bbox[2] + pad)
        y1 = min(img.height, bbox[3] + pad)
        return img.crop((x0, y0, x1, y1))
    return img


def split_frames(img, config):
    """将精灵图拆分为独立的帧"""
    frames = []
    cols = config['cols']
    rows = config['rows']
    fw = config['fw']
    fh = config['fh']
    ox = config['ox']   # 起始X偏移
    oy = config['oy']   # 起始Y偏移
    gx = config['gx']   # 列间距
    gy = config['gy']   # 行间距
    
    for row in range(rows):
        for col in range(cols):
            x = ox + col * (fw + gx)
            y = oy + row * (fh + gy)
            
            # 确保不超出图片边界
            x = min(x, img.width - fw)
            y = min(y, img.height - fh)
            
            frame = img.crop((x, y, x + fw, y + fh))
            frame_num = row * cols + col + 1
            frames.append((frame_num, frame))
    
    return frames


def process_image(src_path, output_dir, prefix, bg_color, threshold, frame_config):
    """处理单张图片：去背景 -> 拆帧 -> 裁剪 -> 保存"""
    print(f'\n处理: {os.path.basename(src_path)}')
    
    # 1. 打开并去背景
    img = Image.open(src_path)
    print(f'  原始尺寸: {img.size[0]}x{img.size[1]}, 大小: {os.path.getsize(src_path)/1024:.0f}KB')
    
    img_no_bg = remove_background(img, bg_color, threshold)
    
    # 2. 拆帧
    raw_frames = split_frames(img_no_bg, frame_config)
    
    # 3. 裁剪每帧到内容区域并保存
    saved_files = []
    for frame_num, frame in raw_frames:
        cropped = crop_to_content(frame)
        
        # 输出文件名
        out_name = f'{prefix}_{frame_num:02d}.png'
        out_path = os.path.join(output_dir, out_name)
        
        # 保存（使用优化压缩）
        cropped.save(out_path, 'PNG', optimize=True)
        
        size_kb = os.path.getsize(out_path) / 1024
        print(f'  帧{frame_num:02d}: {cropped.size[0]}x{cropped.size[1]}, {size_kb:.1f}KB')
        saved_files.append(out_name)
    
    return saved_files


def main():
    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print('=' * 60)
    print('李小宝角色资源处理')
    print(f'源目录: {SOURCE_DIR}')
    print(f'输出目录: {OUTPUT_DIR}')
    print(f'背景色: RGB{BG_COLOR}, 阈值: {BG_THRESHOLD}')
    print('=' * 60)
    
    total_input_size = 0
    total_output_size = 0
    all_results = {}
    
    for filename in sorted(os.listdir(SOURCE_DIR)):
        src_path = os.path.join(SOURCE_DIR, filename)
        if not os.path.isfile(src_path) or not filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue
        
        total_input_size += os.path.getsize(src_path)
        
        # 匹配配置
        matched_prefix = None
        frame_cfg = None
        for prefix_key in FRAME_CONFIGS:
            if filename.startswith(prefix_key):
                matched_prefix = prefix_key
                frame_cfg = FRAME_CONFIGS[prefix_key]
                break
        
        if not frame_cfg:
            print(f'\n跳过（无配置）: {filename}')
            continue
        
        # 生成输出文件名前缀
        # 映射中文名为英文key
        name_map = {
            '李小宝移动动画': 'WALK',
            '李小宝待机动画': 'IDLE',
            '李小宝普通攻击': 'ATTACK',
            '冰晶术释放动画': 'SKILL_ICE',
            '火球术释放动画': 'SKILL_FIRE',
            '雷击术释放': 'SKILL_THUNDER',
        }
        output_prefix = name_map.get(matched_prefix, matched_prefix)
        
        saved = process_image(src_path, OUTPUT_DIR, output_prefix, BG_COLOR, BG_THRESHOLD, frame_cfg)
        
        for f in saved:
            total_output_size += os.path.getsize(os.path.join(OUTPUT_DIR, f))
        
        all_results[matched_prefix] = saved
    
    # 统计摘要
    print('\n' + '=' * 60)
    print('处理完成！')
    print(f'输入总大小: {total_input_size/1024:.0f}KB ({total_input_size/1024/1024:.1f}MB)')
    print(f'输出总大小: {total_output_size/1024:.0f}KB ({total_output_size/1024/1024:.1f}MB)')
    print(f'压缩比: {total_output_size/total_input_size*100:.1f}%')
    print(f'输出目录: {OUTPUT_DIR}/')
    print('\n生成的文件:')
    for prefix, files in all_results.items():
        print(f'  [{prefix}]')
        for f in files:
            print(f'    - {f}')


if __name__ == '__main__':
    main()
