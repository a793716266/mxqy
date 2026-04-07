import os
from PIL import Image

def remove_background(input_dir, output_dir):
    # 创建输出目录
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # 遍历输入目录中的所有文件
    for filename in os.listdir(input_dir):
        if filename.endswith('.png'):
            input_path = os.path.join(input_dir, filename)
            output_path = os.path.join(output_dir, filename)
            
            # 打开图片
            img = Image.open(input_path)
            
            # 转换为RGBA模式以确保透明度
            img = img.convert('RGBA')
            
            # 直接保存图片（保留原始透明度）
            img.save(output_path, 'PNG')
            print(f'处理完成: {filename}')

if __name__ == '__main__':
    input_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim/zhenbao_walk_frames'
    output_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim/zhenbao_walk_frames_no_bg'
    remove_background(input_dir, output_dir)