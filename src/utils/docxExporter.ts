// DOCX Exporter using 'docx' library for structured client-side file compilation
// Operates as an async pipeline to support remote asset fetching and image conversions

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  BorderStyle,
  WidthType,
  PageOrientation,
  ExternalHyperlink
} from 'docx';

export interface ExportData {
  title: string;
  content: any; // Tiptap JSON content
  headers: {
    default: string;
    differentFirstPage: boolean;
  };
  footers: {
    default: string;
    differentFirstPage: boolean;
  };
  margins: {
    top: number; // in px
    bottom: number;
    left: number;
    right: number;
  };
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
}

// Convert CSS pixels back to Word dxa (twips): px * 15
function pxToDxa(px: number): number {
  return Math.round(px * 15);
}

// Normalize color values (rgb or hex) to standard 6-digit hex string required by docx library
function normalizeColorToHex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  
  const clean = color.trim().toLowerCase();
  
  if (clean.startsWith('#')) {
    let hex = clean.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(char => char + char).join('');
    }
    return hex;
  }
  
  if (clean.startsWith('rgb')) {
    const matches = clean.match(/\d+/g);
    if (matches && matches.length >= 3) {
      const r = parseInt(matches[0], 10);
      const g = parseInt(matches[1], 10);
      const b = parseInt(matches[2], 10);
      return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
  }
  
  return undefined;
}

// Convert dataURIs or remote URLs to ArrayBuffers for ImageRun injection
async function fetchImageBuffer(src: string): Promise<ArrayBuffer> {
  if (src.startsWith('data:')) {
    const base64 = src.split(',')[1];
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
  }
  
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${src}`);
  }
  return response.arrayBuffer();
}

export async function exportToDocx(data: ExportData): Promise<Blob> {
  const { content, margins, pageSize, orientation, headers, footers } = data;
  
  // Array of DOCX block elements
  const docxChildren: any[] = [];
  
  // Recursively translate Tiptap JSON nodes to docx elements
  const processNodes = async (nodes: any[]) => {
    for (const node of nodes) {
      if (!node) continue;
      
      switch (node.type) {
        case 'paragraph':
        case 'heading': {
          const isHeading = node.type === 'heading';
          const headingLevel = isHeading ? node.attrs?.level : undefined;
          const align = node.attrs?.textAlign || 'left';
          
          let docxAlign: any = AlignmentType.LEFT;
          if (align === 'center') docxAlign = AlignmentType.CENTER;
          if (align === 'right') docxAlign = AlignmentType.RIGHT;
          if (align === 'justify') docxAlign = AlignmentType.BOTH;

          const textRuns: any[] = [];
          
          if (node.content) {
            for (const child of node.content) {
              if (child.type === 'text') {
                const text = child.text || '';
                const marks = child.marks || [];
                
                let isBold = false;
                let isItalic = false;
                let isUnderline = false;
                let isStrike = false;
                let colorHex: string | undefined = undefined;
                let highlightHex: string | undefined = undefined;
                let fontFamily: string | undefined = undefined;
                let fontSizePt: number | undefined = undefined;
                let linkUrl: string | undefined = undefined;
                
                marks.forEach((mark: any) => {
                  if (mark.type === 'bold') isBold = true;
                  if (mark.type === 'italic') isItalic = true;
                  if (mark.type === 'underline') isUnderline = true;
                  if (mark.type === 'strike') isStrike = true;
                  if (mark.type === 'textStyle') {
                    if (mark.attrs?.color) {
                      colorHex = normalizeColorToHex(mark.attrs.color);
                    }
                    if (mark.attrs?.fontFamily) {
                      fontFamily = mark.attrs.fontFamily;
                    }
                  }
                  if (mark.type === 'fontSize') {
                    if (mark.attrs?.size) {
                      fontSizePt = parseInt(mark.attrs.size.replace('px', ''), 10);
                    }
                  }
                  if (mark.type === 'highlight') {
                    if (mark.attrs?.color) {
                      highlightHex = normalizeColorToHex(mark.attrs.color);
                    }
                  }
                  if (mark.type === 'link') {
                    linkUrl = mark.attrs?.href;
                  }
                });
                
                // Adjust font size based on headings if not explicitly styled
                let calculatedSize: number | undefined = fontSizePt;
                if (isHeading && !calculatedSize) {
                  if (headingLevel === 1) calculatedSize = 24;
                  else if (headingLevel === 2) calculatedSize = 18;
                  else calculatedSize = 14;
                }
                
                const textRun = new TextRun({
                  text,
                  bold: isBold,
                  italics: isItalic,
                  underline: isUnderline ? {} : undefined,
                  strike: isStrike,
                  color: colorHex,
                  shading: highlightHex ? { fill: highlightHex } : undefined,
                  font: fontFamily || 'Calibri',
                  size: calculatedSize ? calculatedSize * 2 : 22, // docx uses half-points (22 = 11pt)
                });
                
                if (linkUrl) {
                  textRuns.push(new ExternalHyperlink({
                    children: [textRun],
                    link: linkUrl
                  }));
                } else {
                  textRuns.push(textRun);
                }
              }
            }
          }
          
          docxChildren.push(new Paragraph({
            children: textRuns,
            alignment: docxAlign,
            spacing: {
              after: isHeading ? 120 : 80, // Space in twentieths of a point
              before: isHeading ? 240 : 0
            }
          }));
          break;
        }
        
        case 'bulletList':
        case 'orderedList': {
          if (node.content) {
            const isBullet = node.type === 'bulletList';
            for (let i = 0; i < node.content.length; i++) {
              const listItem = node.content[i];
              if (listItem.type === 'listItem' && listItem.content) {
                // To keep lists extremely robust in docx, we parse contents as paragraph with numbering/bullet
                const contentNodes = listItem.content;
                
                // Process the paragraph children
                for (const subNode of contentNodes) {
                  const subRuns: any[] = [];
                  if (subNode.content) {
                    for (const subChild of subNode.content) {
                      if (subChild.type === 'text') {
                        subRuns.push(new TextRun({
                          text: subChild.text || '',
                          bold: subChild.marks?.some((m: any) => m.type === 'bold'),
                          italics: subChild.marks?.some((m: any) => m.type === 'italic'),
                          font: 'Calibri',
                          size: 22
                        }));
                      }
                    }
                  }
                  
                  docxChildren.push(new Paragraph({
                    children: subRuns,
                    bullet: isBullet ? { level: 0 } : undefined,
                    numbering: !isBullet ? {
                      reference: 'default-numbering',
                      level: 0,
                      instance: i + 1
                    } : undefined,
                    spacing: { after: 60 }
                  }));
                }
              }
            }
          }
          break;
        }

        case 'table': {
          if (node.content) {
            const tableRows: TableRow[] = [];
            
            for (const rowNode of node.content) {
              if (rowNode.type === 'tableRow' && rowNode.content) {
                const cells: TableCell[] = [];
                
                for (const cellNode of rowNode.content) {
                  // cellNode can be tableCell or tableHeader
                  if ((cellNode.type === 'tableCell' || cellNode.type === 'tableHeader') && cellNode.content) {
                    const cellParagraphs: Paragraph[] = [];
                    
                    // Cells can contain paragraphs
                    for (const subNode of cellNode.content) {
                      const runs: TextRun[] = [];
                      if (subNode.content) {
                        for (const child of subNode.content) {
                          if (child.type === 'text') {
                            runs.push(new TextRun({
                              text: child.text || '',
                              bold: child.marks?.some((m: any) => m.type === 'bold') || cellNode.type === 'tableHeader',
                              font: 'Calibri',
                              size: 20
                            }));
                          }
                        }
                      }
                      
                      cellParagraphs.push(new Paragraph({ children: runs }));
                    }
                    
                    cells.push(new TableCell({
                      children: cellParagraphs.length > 0 ? cellParagraphs : [new Paragraph('')],
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 4, color: 'D3D3D3' },
                        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D3D3D3' },
                        left: { style: BorderStyle.SINGLE, size: 4, color: 'D3D3D3' },
                        right: { style: BorderStyle.SINGLE, size: 4, color: 'D3D3D3' }
                      },
                      shading: cellNode.type === 'tableHeader' ? { fill: 'F2F2F2' } : undefined,
                      width: {
                        size: 100 / rowNode.content.length,
                        type: WidthType.PERCENTAGE
                      }
                    }));
                  }
                }
                
                tableRows.push(new TableRow({ children: cells }));
              }
            }
            
            docxChildren.push(new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE }
            }));
          }
          break;
        }

        case 'image': {
          const src = node.attrs?.src;
          const alt = node.attrs?.alt || 'Image';
          if (src) {
            try {
              const buffer = await fetchImageBuffer(src);
              
              // Estimate sizes
              const width = parseInt(node.attrs?.width || '450', 10);
              const height = parseInt(node.attrs?.height || '300', 10);
              
              docxChildren.push(new Paragraph({
                children: [
                  new ImageRun({
                    data: buffer,
                    transformation: {
                      width,
                      height
                    },
                    altText: {
                      name: alt,
                      title: alt,
                      description: alt
                    }
                  } as any)
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 120, before: 120 }
              }));
            } catch (err) {
              console.error('Failed to include image in DOCX export:', err);
              docxChildren.push(new Paragraph({
                children: [new TextRun(`[Failed to load image: ${alt}]`)]
              }));
            }
          }
          break;
        }

        case 'pageBreak':
          docxChildren.push(new Paragraph({
            children: [new PageBreak()]
          }));
          break;

        case 'horizontalRule':
          docxChildren.push(new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A0A0A0' }
            },
            spacing: { after: 120 }
          }));
          break;

        default:
          break;
      }
    }
  };

  if (content && Array.isArray(content.content)) {
    await processNodes(content.content);
  }
  
  if (docxChildren.length === 0) {
    docxChildren.push(new Paragraph(''));
  }

  // 3. Compile Section Header
  const docxHeader = headers.default.trim()
    ? new Header({
        children: [
          new Paragraph({
            text: headers.default,
            alignment: AlignmentType.CENTER
          })
        ]
      })
    : undefined;

  // 4. Compile Section Footer (Inject dynamic fields for X of Y count)
  const docxFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: footers.default.trim() ? `${footers.default}  |  Page ` : "Page ",
            size: 18,
            font: 'Calibri'
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: 18,
            font: 'Calibri'
          }),
          new TextRun({
            text: " of ",
            size: 18,
            font: 'Calibri'
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            size: 18,
            font: 'Calibri'
          })
        ]
      })
    ]
  });

  // 5. Generate document with settings
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: pxToDxa(margins.top),
              bottom: pxToDxa(margins.bottom),
              left: pxToDxa(margins.left),
              right: pxToDxa(margins.right)
            },
            size: {
              width: pageSize === 'Letter' ? 12240 : 11906,
              height: pageSize === 'Letter' ? 15840 : 16838,
              orientation: orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
            }
          },
          titlePage: headers.differentFirstPage
        },
        headers: docxHeader ? { default: docxHeader } : undefined,
        footers: { default: docxFooter },
        children: docxChildren
      }
    ]
  });

  // 6. Generate binary blob
  return Packer.toBlob(doc);
}
