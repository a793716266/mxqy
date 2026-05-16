"""
统一艾米动画帧的画布尺寸
问题：不同帧的内容区域大小不一，导致渲染时大小不一
解决：将所有帧统一到相同画布尺寸，角色脚底对齐
"""
from PIL import Image
import os

# 配置
base_dir = 'subpackages/battle/images/characters_anim/transparent/aimi'
output_dir = 'subpackages/battle/images/characters_anim/transparent/aimi_unified'
animations = ['idle', 'walk', 'attack', 'support', 'skill', 'buff']

# 统一画布尺寸（根据之前计算结果 + 边距）
# 最大内容尺寸: 294x452
# 加上边距，确保特效不超出
CANVAS_WIDTH = 350
CANVAS_HEIGHT = 500

# 脚底对齐的Y坐标（所有帧的角色脚底都在这个Y坐标）
# 这样角色在游戏中看起来是站在同一水平线上的
FOOT_Y = CANVAS_HEIGHT - 30  # 距离画布底部30px

def get_content_bbox(img):
    """获取内容边界框（去掉透明边距后的角色实际范围）"""
    datas = list(img.getdata())
    width, height = img.size
    
    min_x, max_x = width, 0
    min_y, max_y = height, 0
    found = False
    
    for y in range(height):
        for x in range(width):
            if datas[y * width + x][3] > 0:  # 不透明像素
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                found = True
    
    if not found:
        return None
    
    return (min_x, min_y, max_x, max_y)

def unify_frame(input_path, output_path):
    """统一单帧的画布尺寸"""
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    
    # 获取内容边界
    bbox = get_content_bbox(img)
    if bbox is None:
        print(f"  跳过（无内容）: {os.path.basename(input_path)}")
        img.close()
        return False
    
    min_x, min_y, max_x, max_y = bbox
    content_height = max_y - min_y + 1
    content_width = max_x - min_x + 1
    
    # 创建新画布
    canvas = Image.new('RGBA', (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    
    # 计算粘贴位置：
    # 1. 水平居中
    paste_x = (CANVAS_WIDTH - content_width) // 2
    
    # 2. 脚底对齐到 FOOT_Y
    #    角色脚底在 max_y（原始图片坐标）
    #    需要让这个点在画布的 FOOT_Y 位置
    paste_y = FOOT_Y - (max_y - min_y)  # 注意：这里是内容区域的底部对齐
    
    # 实际上我们应该把整个内容区域粘贴到正确位置
    # 内容区域的底部（max_y）应该对齐到 FOOT_Y
    paste_y = FOOT_Y - content_height
    
    # 再调整：paste_y 是内容区域左上角在画布中的Y坐标
    # 内容区域的高度是 content_height
    # 内容区域底部在画布中的Y坐标 = paste_y + content_height
    # 我们希望这个等于 FOOT_Y
    # 所以 paste_y = FOOT_Y - content_height
    
    # 但还要考虑原始图片的偏移：
    # 内容区域在原始图片中的位置是 (min_x, min_y) 到 (max_x, max_y)
    # 我们需要把 (min_x, min_y) 这个点在画布中放到 (paste_x, paste_y)
    
    # 裁剪出内容区域
    content_img = img.crop((min_x, min_y, max_x + 1, max_y + 1))
    
    # 粘贴到画布
    canvas.paste(content_img, (paste_x, paste_y), content_img)
    
    # 保存
    canvas.save(output_path)
    
    img.close()
    content_img.close()
    
    return True

def main():
    print("=" * 60)
    print("统一艾米动画帧画布尺寸")
    print("=" * 60)
    print(f"\n统一画布尺寸: {CANVAS_WIDTH}x{CANVAS_HEIGHT}")
    print(f"脚底对齐Y坐标: {FOOT_Y}")
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    total_processed = 0
    
    for anim in animations:
        input_dir = os.path.join(base_dir, anim)
        output_anim_dir = os.path.join(output_dir, anim)
        
        if not os.path.exists(input_dir):
            print(f"\n⚠️  跳过 {anim}（目录不存在）")
            continue
        
        os.makedirs(output_anim_dir, exist_ok=True)
        
        print(f"\n=== 处理 {anim} ===")
        
        for i in range(1, 9):
            input_file = os.path.join(input_dir, f"{anim}_{str(i).zfill(2)}.png")
            output_file = os.path.join(output_anim_dir, f"{anim}_{str(i).zfill(2)}.png")
            
            if not os.path.exists(input_file):
                print(f"  缺失: {anim}_{str(i).zfill(2)}.png")
                continue
            
            success = unify_frame(input_file, output_file)
            if success:
                total_processed += 1
                print(f"  ✅ {anim}_{str(i).zfill(2)}.png")
    
    print(f"\n{'=' * 60}")
    print(f"处理完成！共 {total_processed} 帧")
    print(f"输出目录: {output_dir}")
    print(f"{'=' * 60}")

if __name__ == '__main__':
    main()
