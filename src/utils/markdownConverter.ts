// Premium, dependency-free Markdown to HTML and HTML to Markdown converter
// Suitable for client-side conversions of document editor content

export function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = md;

  // 1. Block elements
  
  // Headers (# H1 to ###### H6)
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Blockquotes (> quote)
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal Rules (---)
  html = html.replace(/^---\s*$/gm, '<hr />');

  // Unordered Lists (* or - list item)
  // We match block of list items and wrap them in <ul>
  html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
  // Simple wrapping of consecutive <li> tags
  html = html.replace(/(<li>.*<\/li>)/gs, (match) => {
    // If not already wrapped
    return `<ul>${match}</ul>`;
  });
  // Clean up nested <ul> that might be duplicate
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Ordered Lists (1. list item)
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, (match) => {
    if (match.includes('<ul>')) return match; // avoid conflict with UL
    return `<ol>${match}</ol>`;
  });
  html = html.replace(/<\/ol>\s*<ol>/g, '');

  // 2. Inline elements
  
  // Images (![alt](url))
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />');

  // Links ([text](url))
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Inline Code (`code`)
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // 3. Paragraphs (lines separated by double newlines)
  const lines = html.split(/\n\n+/);
  const paragraphs = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    // If it's already a block tag, leave it
    if (/^<(h[1-6]|ul|ol|li|blockquote|hr|img|table|thead|tbody|tr|td|th)/i.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
  });

  return paragraphs.join('\n');
}

export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  return nodeToMarkdown(doc.body).trim();
}

function nodeToMarkdown(node: Node): string {

  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const children = Array.from(el.childNodes).map(nodeToMarkdown).join('');

  switch (el.tagName.toLowerCase()) {
    case 'p':
      return `${children}\n\n`;
    case 'h1':
      return `# ${children}\n\n`;
    case 'h2':
      return `## ${children}\n\n`;
    case 'h3':
      return `### ${children}\n\n`;
    case 'h4':
      return `#### ${children}\n\n`;
    case 'h5':
      return `##### ${children}\n\n`;
    case 'h6':
      return `###### ${children}\n\n`;
    case 'strong':
    case 'b':
      return `**${children}**`;
    case 'em':
    case 'i':
      return `*${children}*`;
    case 'code':
      return `\`${children}\``;
    case 'blockquote':
      return `> ${children.trim().replace(/\n/g, '\n> ')}\n\n`;
    case 'hr':
      return `---\n\n`;
    case 'a':
      return `[${children}](${el.getAttribute('href') || ''})`;
    case 'img':
      return `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})`;
    case 'br':
      return '\n';
    case 'li':
      return `${children}\n`;
    case 'ul': {
      // Find list items and add asterisk
      const items = Array.from(el.childNodes)
        .filter(n => n.nodeName.toLowerCase() === 'li')
        .map(n => `* ${nodeToMarkdown(n).trim()}`)
        .join('\n');
      return `${items}\n\n`;
    }
    case 'ol': {
      let index = 1;
      const items = Array.from(el.childNodes)
        .filter(n => n.nodeName.toLowerCase() === 'li')
        .map(n => `${index++}. ${nodeToMarkdown(n).trim()}`)
        .join('\n');
      return `${items}\n\n`;
    }
    case 'table': {
      // Table converter to Markdown
      const rows = Array.from(el.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      
      let tableMd = '';
      rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        const cellTexts = cells.map(cell => nodeToMarkdown(cell).trim().replace(/\|/g, '\\|'));
        tableMd += `| ${cellTexts.join(' | ')} |\n`;
        
        // Add divider line after header row
        if (rowIndex === 0) {
          const divider = cells.map(() => '---');
          tableMd += `| ${divider.join(' | ')} |\n`;
        }
      });
      return `${tableMd}\n`;
    }
    case 'th':
    case 'td':
      return children;
    case 'div':
    case 'span':
    case 'section':
    case 'body':
    default:
      return children;
  }
}
