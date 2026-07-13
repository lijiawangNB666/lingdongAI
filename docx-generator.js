const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = require('docx');
const fs = require('fs');

/**
 * 将 Markdown 风格的内容转换为 docx 文档
 * @param {string} markdownContent - Markdown 格式的内容
 * @param {string} outputPath - 输出的 docx 文件路径
 * @returns {Promise<string>} - 返回生成的文件路径
 */
async function generateDocxFromMarkdown(markdownContent, outputPath) {
  const lines = markdownContent.split('\n');
  const children = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // 处理标题
    if (trimmedLine.startsWith('# ')) {
      children.push(new Paragraph({
        text: trimmedLine.substring(2),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        style: { heading1: true }
      }));
    } else if (trimmedLine.startsWith('## ')) {
      children.push(new Paragraph({
        text: trimmedLine.substring(3),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 }
      }));
    } else if (trimmedLine.startsWith('### ')) {
      children.push(new Paragraph({
        text: trimmedLine.substring(4),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 }
      }));
    } else if (trimmedLine.startsWith('#### ')) {
      children.push(new Paragraph({
        text: trimmedLine.substring(5),
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 150, after: 80 }
      }));
    }
    // 处理列表项
    else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      const text = trimmedLine.substring(2);
      children.push(new Paragraph({
        children: parseInlineFormatting(text),
        bullet: { level: 0 },
        spacing: { before: 50, after: 50 }
      }));
    }
    // 处理数字列表
    else if (/^\d+\.\s/.test(trimmedLine)) {
      const text = trimmedLine.replace(/^\d+\.\s/, '');
      children.push(new Paragraph({
        children: parseInlineFormatting(text),
        numbering: { reference: "default-numbering", level: 0 },
        spacing: { before: 50, after: 50 }
      }));
    }
    // 处理表格 (简单的 | 分隔格式)
    else if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      // 跳过表格分隔行 (|---|---|)
      if (/^\|\s*[-:]+\s*\|/.test(trimmedLine)) {
        continue;
      }
      const cells = trimmedLine.split('|').filter(c => c.trim()).map(c => c.trim());
      children.push(new Paragraph({
        text: cells.join(' | '),
        spacing: { before: 50, after: 50 }
      }));
    }
    // 处理加粗文本行
    else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: trimmedLine.replace(/\*\*/g, ''),
          bold: true,
          size: 24
        })],
        spacing: { before: 100, after: 100 }
      }));
    }
    // 空行
    else if (trimmedLine === '') {
      children.push(new Paragraph({
        text: '',
        spacing: { before: 100, after: 100 }
      }));
    }
    // 普通段落
    else {
      children.push(new Paragraph({
        children: parseInlineFormatting(trimmedLine),
        spacing: { before: 50, after: 50 }
      }));
    }
  }
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });
  
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  
  return outputPath;
}

/**
 * 解析行内格式（加粗、斜体等）
 * @param {string} text - 文本内容
 * @returns {TextRun[]} - 返回 TextRun 数组
 */
function parseInlineFormatting(text) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
  
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({
        text: part.substring(2, part.length - 2),
        bold: true
      }));
    } else if (part.startsWith('_') && part.endsWith('_')) {
      runs.push(new TextRun({
        text: part.substring(1, part.length - 1),
        italics: true
      }));
    } else if (part.startsWith('`') && part.endsWith('`')) {
      runs.push(new TextRun({
        text: part.substring(1, part.length - 1),
        font: "Consolas",
        size: 20,
        color: "666666"
      }));
    } else if (part.trim()) {
      runs.push(new TextRun({
        text: part,
        size: 24,
        font: "Microsoft YaHei"
      }));
    }
  }
  
  return runs.length > 0 ? runs : [new TextRun({ text, size: 24, font: "Microsoft YaHei" })];
}

/**
 * 创建格式化的 Word 文档
 * @param {Object} options - 文档配置
 * @returns {Promise<string>} - 返回生成的文件路径
 */
async function createFormattedDocx(options) {
  const { outputPath, title, sections } = options;
  const children = [];
  
  // 添加标题
  if (title) {
    children.push(new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      spacing: { before: 400, after: 400 },
      alignment: "center"
    }));
  }
  
  // 添加各个章节
  for (const section of sections) {
    if (section.heading) {
      children.push(new Paragraph({
        text: section.heading,
        heading: section.headingLevel || HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 }
      }));
    }
    
    if (section.content) {
      for (const line of section.content.split('\n')) {
        if (line.trim() === '') {
          children.push(new Paragraph({ text: '', spacing: { before: 50, after: 50 } }));
        } else {
          children.push(new Paragraph({
            children: parseInlineFormatting(line.trim()),
            spacing: { before: 50, after: 50 }
          }));
        }
      }
    }
    
    if (section.list) {
      for (const item of section.list) {
        children.push(new Paragraph({
          children: parseInlineFormatting(item),
          bullet: { level: 0 },
          spacing: { before: 50, after: 50 }
        }));
      }
    }
  }
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });
  
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  
  return outputPath;
}

module.exports = {
  generateDocxFromMarkdown,
  createFormattedDocx,
  parseInlineFormatting
};
