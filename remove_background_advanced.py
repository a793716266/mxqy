import os
from PIL import Image, ImageFilter

def remove_background_advanced(input_dir, output_dir):
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
            
            # 转换为RGBA模式
            img = img.convert('RGBA')
            
            # 获取像素数据
            pixels = img.load()
            width, height = img.size
            
            # 分析图片边缘像素，确定背景颜色
            background_color = None
            edge_pixels = []
            
            # 收集边缘像素
            for x in range(width):
                edge_pixels.append(img.getpixel((x, 0)))
                edge_pixels.append(img.getpixel((x, height-1)))
            for y in range(height):
                edge_pixels.append(img.getpixel((0, y)))
                edge_pixels.append(img.getpixel((width-1, y)))
            
            # 找出最常见的颜色作为背景色
            color_count = {}
            for color in edge_pixels:
                color_tuple = tuple(color[:3])  # 只考虑RGB值
                if color_tuple in color_count:
                    color_count[color_tuple] += 1
                else:
                    color_count[color_tuple] = 1
            
            if color_count:
                background_color = max(color_count, key=color_count.get)
                print(f'背景颜色: {background_color}')
            else:
                background_color = (255, 255, 255)  # 默认白色背景
            
            # 计算颜色相似度的阈值
            threshold = 30
            
            # 创建一个掩码，标记需要保留的区域
            mask = Image.new('L', (width, height), 0)
            mask_pixels = mask.load()
            
            # 遍历所有像素，标记需要保留的区域
            for x in range(width):
                for y in range(height):
                    r, g, b, a = pixels[x, y]
                    
                    # 计算与背景颜色的距离
                    color_distance = ((r - background_color[0]) ** 2 + 
                                    (g - background_color[1]) ** 2 + 
                                    (b - background_color[2]) ** 2) ** 0.5
                    
                    # 如果颜色与背景差异较大，标记为需要保留
                    if color_distance > threshold:
                        mask_pixels[x, y] = 255
            
            # 对掩码进行膨胀操作，确保物体边缘完整
            mask = mask.filter(ImageFilter.MaxFilter(3))
            
            # 再次遍历所有像素，根据掩码移除背景
            for x in range(width):
                for y in range(height):
                    r, g, b, a = pixels[x, y]
                    
                    # 如果掩码为0（背景区域），设置为透明
                    if mask.getpixel((x, y)) == 0:
                        pixels[x, y] = (r, g, b, 0)
            
            # 保存处理后的图片
            img.save(output_path, 'PNG')
            print(f'处理完成: {filename}')

if __name__ == '__main__':
    input_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim/zhenbao_walk_frames'
    output_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim/zhenbao_walk_frames_no_bg'
    remove_background_advanced(input_dir, output_dir)