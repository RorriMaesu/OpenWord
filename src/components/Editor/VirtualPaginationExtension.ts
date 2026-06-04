import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const VirtualPaginationKey = new PluginKey('virtualPagination');

export interface VirtualPaginationOptions {
  headers: {
    default: string;
    differentFirstPage: boolean;
  };
  footers: {
    default: string;
    differentFirstPage: boolean;
  };
}

export const VirtualPaginationExtension = Extension.create<VirtualPaginationOptions>({
  name: 'virtualPagination',

  addOptions() {
    return {
      headers: { default: '', differentFirstPage: false },
      footers: { default: '', differentFirstPage: false }
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    let lastHeightHash = '';
    let debounceTimer: any = null;

    return [
      new Plugin({
        key: VirtualPaginationKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, value) {
            const meta = tr.getMeta(VirtualPaginationKey);
            if (meta) {
              return meta;
            }
            return value.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
        view(editorView) {
          const calculatePageBreaks = () => {
            const dom = editorView.dom;
            const children = dom.childNodes;
            if (children.length === 0) return;

            let heightHash = '';
            const childHeights: { pos: number; height: number; isPageBreakNode: boolean }[] = [];

            // Get computed layout options
            const rootStyle = getComputedStyle(document.documentElement);
            const zoom = parseFloat(rootStyle.getPropertyValue('--document-zoom')) || 1;
            const pageHeightPx = parseFloat(rootStyle.getPropertyValue('--page-height')) || 1123;
            const marginTop = parseFloat(rootStyle.getPropertyValue('--page-margin-top')) || 96;
            const marginBottom = parseFloat(rootStyle.getPropertyValue('--page-margin-bottom')) || 96;
            
            const usablePageHeight = pageHeightPx - marginTop - marginBottom;

            try {
              for (let i = 0; i < children.length; i++) {
                const child = children[i] as HTMLElement;
                if (child.nodeType !== Node.ELEMENT_NODE) continue;

                const pos = editorView.posAtDOM(child, 0);
                const rect = child.getBoundingClientRect();
                
                const height = rect.height / zoom;
                const isPageBreakNode = child.getAttribute('data-type') === 'page-break';

                childHeights.push({ pos, height, isPageBreakNode });
                heightHash += `${pos}:${height};`;
              }
            } catch (e) {
              // posAtDOM can occasionally throw if DOM is out of sync during render
              return;
            }

            // If heights and positions are identical to last check, do not re-dispatch
            if (heightHash === lastHeightHash) return;
            lastHeightHash = heightHash;

            const decorations: Decoration[] = [];
            let currentHeight = 0;
            let pageNum = 1;

            const headerText = extension.options.headers?.default || '';
            const footerText = extension.options.footers?.default || '';

            for (let i = 0; i < childHeights.length; i++) {
              const item = childHeights[i];
              
              if (item.isPageBreakNode) {
                // Manual page break
                currentHeight = 0;
                pageNum++;
                
                // Add header/footer overlays to the manual page break decoration
                decorations.push(
                  Decoration.widget(item.pos, () => {
                    const container = document.createElement('div');
                    container.className = 'virtual-page-break';
                    
                    if (footerText) {
                      const footerDiv = document.createElement('div');
                      footerDiv.className = 'virtual-page-footer-overlay';
                      footerDiv.innerText = footerText;
                      container.appendChild(footerDiv);
                    }
                    
                    const label = document.createElement('span');
                    label.className = 'virtual-page-break-label';
                    label.innerText = `PAGE BREAK (PAGE ${pageNum})`;
                    container.appendChild(label);
                    
                    if (headerText) {
                      const headerDiv = document.createElement('div');
                      headerDiv.className = 'virtual-page-header-overlay';
                      headerDiv.innerText = headerText;
                      container.appendChild(headerDiv);
                    }
                    
                    return container;
                  }, { side: -1 })
                );
                continue;
              }

              if (currentHeight + item.height > usablePageHeight && currentHeight > 0) {
                pageNum++;
                decorations.push(
                  Decoration.widget(item.pos, () => {
                    const container = document.createElement('div');
                    container.className = 'virtual-page-break';
                    
                    if (footerText) {
                      const footerDiv = document.createElement('div');
                      footerDiv.className = 'virtual-page-footer-overlay';
                      footerDiv.innerText = footerText;
                      container.appendChild(footerDiv);
                    }
                    
                    const label = document.createElement('span');
                    label.className = 'virtual-page-break-label';
                    label.innerText = `PAGE ${pageNum}`;
                    container.appendChild(label);
                    
                    if (headerText) {
                      const headerDiv = document.createElement('div');
                      headerDiv.className = 'virtual-page-header-overlay';
                      headerDiv.innerText = headerText;
                      container.appendChild(headerDiv);
                    }
                    
                    return container;
                  }, { side: -1 })
                );
                currentHeight = item.height;
              } else {
                currentHeight += item.height;
              }
            }

            const decorationSet = DecorationSet.create(editorView.state.doc, decorations);
            editorView.dispatch(editorView.state.tr.setMeta(VirtualPaginationKey, decorationSet));
          };

          const debouncedCalculate = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(calculatePageBreaks, 150);
          };

          // Initial delay calculation
          setTimeout(calculatePageBreaks, 100);

          return {
            update() {
              // Perform calculation 150ms after user pauses typing
              debouncedCalculate();
            },
            destroy() {
              clearTimeout(debounceTimer);
            }
          };
        },
      }),
    ];
  },
});
