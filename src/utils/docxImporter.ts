// DOCX Importer using Mammoth.js for semantic body parsing 
// and JSZip + DOMParser for OpenXML page setup metadata extraction

import JSZip from 'jszip';
import mammoth from 'mammoth';

export interface ImportResult {
  html: string;
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  headers: {
    default: string;
    differentFirstPage: boolean;
  };
  footers: {
    default: string;
    differentFirstPage: boolean;
  };
}

// Convert Word dxa (1/20 of a point) to CSS pixels (96 DPI)
// 1440 dxa = 72 pt = 1 inch = 96 px.
// px = dxa / 15
function dxaToPx(dxaStr: string | null, defaultValue: number): number {
  if (!dxaStr) return defaultValue;
  const dxa = parseInt(dxaStr, 10);
  return isNaN(dxa) ? defaultValue : Math.round(dxa / 15);
}

// Helper to extract text from a header/footer XML file
async function extractTextFromXmlPart(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) return '';
  
  try {
    const xmlText = await file.async('text');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    
    // Find all text elements in the part
    const textNodes = xmlDoc.getElementsByTagNameNS('*', 't');
    let outputText = '';
    
    for (let i = 0; i < textNodes.length; i++) {
      outputText += textNodes[i].textContent || '';
    }
    
    return outputText.trim();
  } catch (err) {
    console.error(`Error parsing XML part at ${path}:`, err);
    return '';
  }
}

export async function importDocx(arrayBuffer: ArrayBuffer): Promise<ImportResult> {
  // Default values
  const result: ImportResult = {
    html: '',
    margins: { top: 96, bottom: 96, left: 96, right: 96 },
    pageSize: 'Letter',
    orientation: 'portrait',
    headers: { default: '', differentFirstPage: false },
    footers: { default: '', differentFirstPage: false },
  };

  try {
    // 1. Unzip docx package using JSZip to parse metadata
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Load word/document.xml to parse page settings and layout
    const documentXmlText = await zip.file('word/document.xml')?.async('text');
    if (documentXmlText) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(documentXmlText, 'application/xml');

      // Parse Page Margins: <w:pgMar>
      const pgMarNode = xmlDoc.getElementsByTagNameNS('*', 'pgMar')[0];
      if (pgMarNode) {
        result.margins.top = dxaToPx(pgMarNode.getAttribute('w:top') || pgMarNode.getAttribute('top'), 96);
        result.margins.bottom = dxaToPx(pgMarNode.getAttribute('w:bottom') || pgMarNode.getAttribute('bottom'), 96);
        result.margins.left = dxaToPx(pgMarNode.getAttribute('w:left') || pgMarNode.getAttribute('left'), 96);
        result.margins.right = dxaToPx(pgMarNode.getAttribute('w:right') || pgMarNode.getAttribute('right'), 96);
      }

      // Parse Page Size: <w:pgSz>
      const pgSzNode = xmlDoc.getElementsByTagNameNS('*', 'pgSz')[0];
      if (pgSzNode) {
        const widthDxa = parseInt(pgSzNode.getAttribute('w:w') || pgSzNode.getAttribute('w') || '12240', 10);
        // Letter: 12240 dxa width; A4: 11906 dxa width. Check which one is closer.
        result.pageSize = widthDxa < 12000 ? 'A4' : 'Letter';
        
        const orient = pgSzNode.getAttribute('w:orient') || pgSzNode.getAttribute('orient');
        result.orientation = orient === 'landscape' ? 'landscape' : 'portrait';
      }
      
      // Parse header/footer settings (Different First Page)
      const titlePgNode = xmlDoc.getElementsByTagNameNS('*', 'titlePg')[0];
      if (titlePgNode) {
        // titlePg tag indicates different first page is checked
        result.headers.differentFirstPage = true;
        result.footers.differentFirstPage = true;
      }
    }

    // 2. Load primary header and footer from ZIP if they exist
    // By convention in basic documents, header1.xml and footer1.xml are the default headers/footers.
    result.headers.default = await extractTextFromXmlPart(zip, 'word/header1.xml');
    result.footers.default = await extractTextFromXmlPart(zip, 'word/footer1.xml');

    // 3. Convert document body XML to HTML using Mammoth
    const mammothResult = await mammoth.convertToHtml({ arrayBuffer }, {
      styleMap: [
        "u => u", // Preserve underline
        "strike => del" // Preserve strikethrough
      ]
    });
    result.html = mammothResult.value;

    return result;
  } catch (err) {
    console.error('Error during DOCX import parsing:', err);
    throw err;
  }
}
