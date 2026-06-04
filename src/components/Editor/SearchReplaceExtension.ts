import { Extension } from '@tiptap/core';
import { Selection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      replace: () => ReturnType;
      replaceAll: () => ReturnType;
      nextMatch: () => ReturnType;
      prevMatch: () => ReturnType;
    };
  }
}


const searchReplaceKey = new PluginKey('searchReplace');

export const SearchReplaceExtension = Extension.create({
  name: 'searchReplace',

  addStorage() {
    return {
      searchTerm: '',
      replaceTerm: '',
      currentIndex: -1,
      results: [] as Array<{ from: number; to: number }>,
    };
  },

  addCommands() {
    return {
      setSearchTerm:
        (term: string) =>
        ({ editor, dispatch }) => {
          this.storage.searchTerm = term;
          this.storage.currentIndex = -1;
          this.storage.results = [];
          
          if (dispatch) {
            // Trigger state updates
            editor.view.dispatch(editor.view.state.tr.setMeta('searchReplaceUpdate', true));
          }
          return true;
        },

      setReplaceTerm:
        (term: string) =>
        () => {
          this.storage.replaceTerm = term;
          return true;
        },

      nextMatch:
        () =>
        ({ editor, dispatch }) => {
          const results = this.storage.results;
          if (results.length === 0) return false;
          
          this.storage.currentIndex = (this.storage.currentIndex + 1) % results.length;
          
          if (dispatch) {
            editor.view.dispatch(editor.view.state.tr.setMeta('searchReplaceUpdate', true));
            // Scroll matching text into view
            const activeResult = results[this.storage.currentIndex];
            if (activeResult) {
              const tr = editor.view.state.tr.setSelection(
                Selection.near(
                  editor.view.state.doc.resolve(activeResult.from)
                )
              );
              editor.view.dispatch(tr.scrollIntoView());
            }
          }
          return true;
        },

      prevMatch:
        () =>
        ({ editor, dispatch }) => {
          const results = this.storage.results;
          if (results.length === 0) return false;
          
          this.storage.currentIndex =
            this.storage.currentIndex <= 0 ? results.length - 1 : this.storage.currentIndex - 1;
          
          if (dispatch) {
            editor.view.dispatch(editor.view.state.tr.setMeta('searchReplaceUpdate', true));
            const activeResult = results[this.storage.currentIndex];
            if (activeResult) {
              const tr = editor.view.state.tr.setSelection(
                Selection.near(
                  editor.view.state.doc.resolve(activeResult.from)
                )
              );
              editor.view.dispatch(tr.scrollIntoView());
            }
          }
          return true;
        },

      replace:
        () =>
        ({ editor, dispatch }) => {
          const { results, currentIndex, replaceTerm } = this.storage;
          if (results.length === 0 || currentIndex < 0) return false;
          
          const match = results[currentIndex];
          if (!match) return false;
          
          if (dispatch) {
            const tr = editor.view.state.tr.insertText(replaceTerm, match.from, match.to);
            // Need to offset indices of future searches after editing text
            this.storage.currentIndex = Math.max(0, currentIndex - 1);
            editor.view.dispatch(tr);
          }
          return true;
        },

      replaceAll:
        () =>
        ({ editor, dispatch }) => {
          const { results, replaceTerm } = this.storage;
          if (results.length === 0) return false;
          
          if (dispatch) {
            let tr = editor.view.state.tr;
            // Iterate in reverse to keep positions valid
            for (let i = results.length - 1; i >= 0; i--) {
              const match = results[i];
              tr = tr.insertText(replaceTerm, match.from, match.to);
            }
            this.storage.currentIndex = -1;
            this.storage.results = [];
            editor.view.dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    
    return [
      new Plugin({
        key: searchReplaceKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, _oldState) {
            // Find matches if search term is active
            const term = extension.storage.searchTerm;
            if (!term) {
              extension.storage.results = [];
              return DecorationSet.empty;
            }

            // Simple document text traversal
            const doc = tr.doc;
            const results: Array<{ from: number; to: number }> = [];
            
            doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                const text = node.text;
                let start = 0;
                let index = text.indexOf(term, start);
                
                while (index !== -1) {
                  results.push({
                    from: pos + index,
                    to: pos + index + term.length,
                  });
                  start = index + term.length;
                  index = text.indexOf(term, start);
                }
              }
            });

            extension.storage.results = results;
            
            // Build decorations
            const decorations = results.map((res, i) => {
              const isActive = i === extension.storage.currentIndex;
              return Decoration.inline(res.from, res.to, {
                class: isActive ? 'search-match search-match-active' : 'search-match',
                style: isActive
                  ? 'background-color: HSL(45, 100%, 50%); color: black; border-bottom: 2px solid orange;'
                  : 'background-color: HSL(45, 100%, 85%); color: black;',
              });
            });

            return DecorationSet.create(doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
