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

            // Mobile/Pageless performance bypass: Skip layout loop if pageless mode is active
            const workspaceContainer = document.querySelector('.editor-workspace-container');
            const isPageless = workspaceContainer ? workspaceContainer.classList.contains('pageless-mode') : true;
            if (isPageless) {
              const decorationSet = DecorationSet.empty;
              editorView.dispatch(editorView.state.tr.setMeta(VirtualPaginationKey, decorationSet));
              document.dispatchEvent(new CustomEvent('openword-pagination-update', {
                detail: {
                  totalPages: 1,
                  posPages: [{ pos: 0, page: 1 }]
                }
              }));
              return;
            }

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
            const posPages: { pos: number; page: number }[] = [];

            const headerText = extension.options.headers?.default || '';
            const footerText = extension.options.footers?.default || '';

            for (let i = 0; i < childHeights.length; i++) {
              const item = childHeights[i];
              
              if (item.isPageBreakNode) {
                // Manual page break
                const prevPage = pageNum;
                currentHeight = 0;
                pageNum++;
                const currentPageNum = pageNum;
                posPages.push({ pos: item.pos, page: pageNum });
                
                // Add header/footer overlays to the manual page break decoration
                decorations.push(
                  Decoration.widget(item.pos, () => {
                    const container = document.createElement('div');
                    container.className = 'virtual-page-break';
                    
                    if (footerText || prevPage) {
                      const footerDiv = document.createElement('div');
                      footerDiv.className = 'virtual-page-footer-overlay';
                      
                      const textSpan = document.createElement('span');
                      textSpan.innerText = footerText;
                      footerDiv.appendChild(textSpan);

                      const pageSpan = document.createElement('span');
                      pageSpan.innerText = String(prevPage);
                      footerDiv.appendChild(pageSpan);

                      container.appendChild(footerDiv);
                    }
                    
                    const label = document.createElement('span');
                    label.className = 'virtual-page-break-label';
                    label.innerText = `PAGE BREAK (PAGE ${currentPageNum})`;
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
                const prevPage = pageNum;
                pageNum++;
                const currentPageNum = pageNum;
                posPages.push({ pos: item.pos, page: pageNum });

                decorations.push(
                  Decoration.widget(item.pos, () => {
                    const container = document.createElement('div');
                    container.className = 'virtual-page-break';
                    
                    if (footerText || prevPage) {
                      const footerDiv = document.createElement('div');
                      footerDiv.className = 'virtual-page-footer-overlay';
                      
                      const textSpan = document.createElement('span');
                      textSpan.innerText = footerText;
                      footerDiv.appendChild(textSpan);

                      const pageSpan = document.createElement('span');
                      pageSpan.innerText = String(prevPage);
                      footerDiv.appendChild(pageSpan);

                      container.appendChild(footerDiv);
                    }
                    
                    const label = document.createElement('span');
                    label.className = 'virtual-page-break-label';
                    label.innerText = `PAGE ${currentPageNum}`;
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
                posPages.push({ pos: item.pos, page: pageNum });
                currentHeight += item.height;
              }
            }

            const decorationSet = DecorationSet.create(editorView.state.doc, decorations);
            editorView.dispatch(editorView.state.tr.setMeta(VirtualPaginationKey, decorationSet));

            // Dispatch pagination info for Editor selection and Status Bar
            document.dispatchEvent(new CustomEvent('openword-pagination-update', {
              detail: {
                totalPages: pageNum,
                posPages
              }
            }));
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
