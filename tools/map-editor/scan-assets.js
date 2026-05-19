const fs = require('fs');
const path = require('path');

const mapDir = path.join(__dirname, '../../images/map');
const outputFile = path.join(__dirname, 'assets.json');

// 扫描目录
function scanDir(dir, basePath = '') {
  const result = {};
  const items = fs.readdirSync(dir);
  
  // 目录到前缀的映射
  const prefixMap = {
    'town': 'TOWN_',
    'npc': 'NPC_',
    'other': ''
  };
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = basePath ? `${basePath}/${item}` : item;
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // 递归扫描子目录
      const subItems = scanDir(fullPath, relPath);
      Object.assign(result, subItems);
    } else if (item.endsWith('.png') || item.endsWith('.jpeg') || item.endsWith('.jpg')) {
      // 图片文件 - 使用绝对路径（相对于服务器根目录）
      const baseName = path.basename(item, path.extname(item));
      // 根据目录生成键（添加前缀）
      let key = baseName.toUpperCase();
      if (basePath && prefixMap[basePath]) {
        // 如果文件名还没有前缀，添加前缀
        if (!key.startsWith(prefixMap[basePath].replace(/_$/, ''))) {
          key = prefixMap[basePath] + key;
        }
      }
      
      result[key] = {
        name: baseName,
        path: `/images/map/${relPath}`,
        category: basePath || 'other'
      };
    }
  }
  
  return result;
}

const assets = scanDir(mapDir);

// 按类别分组
const categories = {};
Object.keys(assets).forEach(key => {
  const cat = assets[key].category;
  if (!categories[cat]) categories[cat] = [];
  categories[cat].push({ key, ...assets[key] });
});

const output = {
  assets,
  categories
};

fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
console.log(`扫描完成！共找到 ${Object.keys(assets).length} 个素材`);
console.log('分类：', Object.keys(categories).join(', '));
