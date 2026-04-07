from PIL import Image

# 打开处理后的图片
img = Image.open('images/characters_anim/zhenbao_walk_frames_no_bg/frame_0001.png')

# 打印基本信息
print('Mode:', img.mode)
print('Has alpha channel:', 'A' in img.mode)
width, height = img.size
print('Image size:', width, 'x', height)

# 检查不同位置的像素
print('Pixel at (10,10):', img.getpixel((10,10)))
print('Pixel at center:', img.getpixel((width//2, height//2)))
print('Pixel at edge:', img.getpixel((width-10, 10)))

# 统计透明像素数量
transparent_count = 0
total_count = width * height
for x in range(width):
    for y in range(height):
        if img.getpixel((x,y))[3] == 0:
            transparent_count += 1

print(f'Transparent pixels: {transparent_count}/{total_count} ({transparent_count/total_count*100:.2f}%)')