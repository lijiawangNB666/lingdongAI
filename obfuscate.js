const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// 混淆配置
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 0.5,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// 需要混淆的文件列表
const filesToObfuscate = [
  'main.js',
  'renderer.js',
  'preload.js'
];

// 创建备份目录
const backupDir = path.join(__dirname, 'backup');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

console.log('开始混淆代码...');

filesToObfuscate.forEach(fileName => {
  try {
    const filePath = path.join(__dirname, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.log(`文件不存在: ${fileName}`);
      return;
    }
    
    console.log(`处理文件: ${fileName}`);
    
    // 备份原始文件
    const backupPath = path.join(backupDir, fileName + '.backup');
    fs.copyFileSync(filePath, backupPath);
    console.log(`  已备份到: ${backupPath}`);
    
    // 读取文件内容
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    
    // 混淆代码
    const obfuscatedResult = JavaScriptObfuscator.obfuscate(sourceCode, obfuscationOptions);
    
    // 写入混淆后的代码
    fs.writeFileSync(filePath, obfuscatedResult.getObfuscatedCode(), 'utf-8');
    
    console.log(`  混淆完成，大小: ${obfuscatedResult.getObfuscatedCode().length} 字符`);
    
    // 保存混淆映射（可选，用于调试）
    const mapPath = path.join(backupDir, fileName + '.map.json');
    fs.writeFileSync(mapPath, JSON.stringify(obfuscatedResult.getSourceMap(), null, 2));
    console.log(`  映射文件: ${mapPath}`);
    
  } catch (error) {
    console.error(`处理文件 ${fileName} 时出错:`, error.message);
  }
});

console.log('\n混淆完成！');
console.log('重要提示：');
console.log('1. 混淆后的代码已覆盖原始文件');
console.log('2. 原始文件已备份到 backup/ 目录');
console.log('3. 建议测试应用功能是否正常');
console.log('4. 可以运行 npm run build 重新打包应用');

// 创建还原脚本
const restoreScript = `
const fs = require('fs');
const path = require('path');

const backupDir = path.join(__dirname, 'backup');
const files = ['main.js', 'renderer.js', 'preload.js'];

files.forEach(fileName => {
  const backupPath = path.join(backupDir, fileName + '.backup');
  const targetPath = path.join(__dirname, fileName);
  
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, targetPath);
    console.log('已恢复:', fileName);
  }
});

console.log('还原完成！');
`;

fs.writeFileSync(path.join(__dirname, 'restore.js'), restoreScript, 'utf-8');
console.log('\n已创建还原脚本: restore.js');