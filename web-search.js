/**
 * 灵动AI - 网络搜索与网页抓取模块
 *
 * 功能：
 * 1. searchWeb(query) - 使用 Bing 搜索（国内可访问）
 * 2. fetchUrl(url) - 抓取网页内容并转为 Markdown
 */

const { URL } = require('url');

// ============================================================================
// WebSearch - 使用 Bing 搜索（国内版，无需 API Key）
// ============================================================================

const BING_URL = 'https://cn.bing.com/search';

/**
 * 搜索网络信息
 * @param {string} query - 搜索关键词
 * @param {Object} options - 选项 {limit: 5, region: 'zh-cn'}
 * @returns {Promise<Object>} 搜索结果
 */
async function searchWeb(query, options = {}) {
  const limit = options.limit || 5;
  const region = options.region || 'zh-cn';

  if (!query || query.trim().length === 0) {
    return { success: false, error: '搜索关键词不能为空' };
  }

  try {
    // Bing 搜索参数
    const params = new URLSearchParams({
      q: query,
      count: Math.min(limit, 10),
      setlang: 'zh',
      setmkt: region
    });

    const response = await fetch(`${BING_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://cn.bing.com/'
      }
    });

    if (!response.ok) {
      return { success: false, error: `搜索请求失败: ${response.status} ${response.statusText}` };
    }

    const html = await response.text();
    const results = parseBingResults(html, limit);

    if (results.length === 0) {
      return { success: true, results: [], message: '未找到相关搜索结果，建议更换关键词重试' };
    }

    return {
      success: true,
      query,
      results,
      total: results.length,
      engine: 'bing'
    };

  } catch (e) {
    console.error('[WebSearch] Error:', e.message);
    return { success: false, error: `搜索失败: ${e.message}` };
  }
}

/**
 * 解析 Bing HTML 结果
 */
function parseBingResults(html, limit) {
  const results = [];

  // Bing 结果通常在 <li class="b_algo"> 中
  const resultRegex = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
  let match;

  while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
    const block = match[1];

    // 提取标题和链接
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    // 提取摘要
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) ||
                         block.match(/<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/i);
    // 提取来源域名
    const citeMatch = block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i);

    if (titleMatch) {
      const title = stripHtml(titleMatch[2]).trim();
      let link = decodeHtmlEntities(titleMatch[1]).trim();

      // 处理相对链接
      if (link.startsWith('/')) link = 'https://cn.bing.com' + link;

      const snippet = snippetMatch ? stripHtml(snippetMatch[1]).trim() : '';
      const displayUrl = citeMatch ? stripHtml(citeMatch[1]).trim() : '';

      if (title && link && !link.includes('bing.com')) {
        results.push({
          title,
          link,
          snippet: snippet || '',
          displayUrl: displayUrl || ''
        });
      }
    }
  }

  return results;
}

// ============================================================================
// WebFetch - 抓取网页内容
// ============================================================================

/**
 * 抓取网页内容并转为 Markdown
 * @param {string} url - 网页 URL
 * @param {Object} options - 选项 {maxLength: 8000, timeout: 15000}
 * @returns {Promise<Object>} 网页内容
 */
async function fetchUrl(url, options = {}) {
  const maxLength = options.maxLength || 8000;
  const timeout = options.timeout || 15000;

  if (!url || !url.startsWith('http')) {
    return { success: false, error: '无效的 URL，必须以 http:// 或 https:// 开头' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: `请求失败: ${response.status} ${response.statusText}` };
    }

    const contentType = response.headers.get('content-type') || '';

    // 非 HTML 内容直接返回文本
    if (!contentType.includes('text/html')) {
      const text = await response.text();
      return {
        success: true,
        url,
        title: '',
        content: text.slice(0, maxLength),
        contentType,
        type: 'text'
      };
    }

    const html = await response.text();
    const result = extractArticle(html, url, maxLength);

    return {
      success: true,
      url,
      title: result.title,
      content: result.content,
      excerpt: result.excerpt,
      type: 'html'
    };

  } catch (e) {
    if (e.name === 'AbortError') {
      return { success: false, error: '抓取超时，网页加载时间过长' };
    }
    console.error('[WebFetch] Error:', e.message);
    return { success: false, error: `抓取失败: ${e.message}` };
  }
}

/**
 * 从 HTML 中提取文章正文
 */
function extractArticle(html, url, maxLength) {
  // 提取标题
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]).trim() : '';

  // 尝试提取 meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
                     html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  const description = descMatch ? descMatch[1] : '';

  // 移除 script, style, nav, header, footer, aside 等标签
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 尝试提取 article 或 main 内容
  let content = '';
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  const contentMatch = cleaned.match(/<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  if (articleMatch) {
    content = htmlToMarkdown(articleMatch[1]);
  } else if (mainMatch) {
    content = htmlToMarkdown(mainMatch[1]);
  } else if (contentMatch) {
    content = htmlToMarkdown(contentMatch[1]);
  } else {
    // 回退：提取 body 中的文本
    const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = htmlToMarkdown(bodyMatch[1]);
    } else {
      content = htmlToMarkdown(cleaned);
    }
  }

  // 清理内容
  content = content
    .replace(/\n{3,}/g, '\n\n')  // 多余空行
    .replace(/^\s+|\s+$/g, '');   // 首尾空白

  const excerpt = description || content.slice(0, 200).replace(/\n/g, ' ');

  return {
    title,
    content: content.slice(0, maxLength),
    excerpt
  };
}

/**
 * 简单的 HTML 转 Markdown
 */
function htmlToMarkdown(html) {
  let md = html;

  // 块级元素
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '\n$1\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '\n$1\n');
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '\n$1\n');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n');

  // 行内元素
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // 移除剩余标签
  md = stripHtml(md);

  return md;
}

/**
 * 移除 HTML 标签
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 解码 HTML 实体
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

module.exports = {
  searchWeb,
  fetchUrl,
  extractArticle,
  htmlToMarkdown
};
