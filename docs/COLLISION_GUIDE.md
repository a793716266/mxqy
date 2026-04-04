# 地图碰撞系统使用指南

## 功能说明

已在游戏中添加完整的碰撞检测系统，可以阻止玩家穿过地图上的障碍物。

## 快速开始

### 1. 查看坐标

游戏中已显示玩家当前坐标（右上角黄色文字），格式：`(X, Y)`

### 2. 标记障碍物

编辑文件：`scripts/data/map_collisions.js`

**矩形障碍物（如大树、房子）：**
```javascript
{ type: 'rect', x: 500, y: 300, width: 100, height: 80, name: '大树' }
```

**圆形障碍物（如水池、石头堆）：**
```javascript
{ type: 'circle', x: 800, y: 600, radius: 50, name: '水池' }
```

### 3. 启用碰撞可视化（调试用）

编辑 `scripts/scenes/field-scene.js`，找到第685行：

```javascript
// this._renderObstacles(ctx)
```

取消注释：
```javascript
this._renderObstacles(ctx)
```

这样可以在游戏中看到红色的碰撞区域。

## 标记步骤

### 方法一：直接记录坐标

1. 在游戏中走到障碍物旁边
2. 记下右上角显示的坐标
3. 在 `map_collisions.js` 中添加障碍物信息
4. 刷新游戏测试

### 方法二：使用可视化调试

1. 启用碰撞可视化（取消注释第685行）
2. 在游戏中移动，观察红色区域
3. 调整坐标直到完全覆盖障碍物
4. 完成后注释掉可视化代码

## 示例配置

```javascript
export const MAP_COLLISIONS = {
  grassland: {
    name: '阳光草原',
    obstacles: [
      // 左上角的大树
      { type: 'rect', x: 300, y: 200, width: 120, height: 100, name: '大树1' },
      
      // 中央的水池
      { type: 'circle', x: 1000, y: 750, radius: 80, name: '水池' },
      
      // 右下角的石头群
      { type: 'rect', x: 1500, y: 1100, width: 150, height: 120, name: '石头群' },
      
      // 上方的小屋
      { type: 'rect', x: 800, y: 150, width: 180, height: 140, name: '小屋' }
    ]
  }
}
```

## 坐标系统说明

- **原点**：左上角 (0, 0)
- **X轴**：向右增加（0 → 2000）
- **Y轴**：向下增加（0 → 1500）
- **单位**：逻辑像素（非物理像素）

## 注意事项

1. 坐标使用逻辑像素，无需考虑DPR
2. 矩形的 x, y 是左上角坐标
3. 圆形的 x, y 是圆心坐标
4. name 字段仅用于调试显示
5. 完成标记后记得注释掉可视化代码

## 文件位置

- 碰撞配置：`scripts/data/map_collisions.js`
- 碰撞检测：`scripts/scenes/field-scene.js`
- 使用说明：`docs/COLLISION_GUIDE.md`
