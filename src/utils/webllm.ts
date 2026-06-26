import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import type { MLCEngine } from '@mlc-ai/web-llm';

let activeEngine: MLCEngine | null = null;
let activeModelId: string | null = null;

export interface EdgeModel {
  model_id: string;
  name: string;
  size: string;
  customConfig?: {
    model: string;
    model_id: string;
    model_lib: string;
    required_features?: string[];
  };
}

export function checkWebGPUSupport(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * Get dynamic list of edge-suitable models from WebLLM registry
 */
export function getAvailableEdgeModels(): EdgeModel[] {
  const defaultModels: EdgeModel[] = [
    {
      model_id: 'gemma-4-E2B-it-q4f16_1-MLC',
      name: 'Gemma 4 E2B (Recommended)',
      size: '1.6 GB',
      customConfig: {
        model: 'https://huggingface.co/welcoma/gemma-4-E2B-it-q4f16_1-MLC',
        model_id: 'gemma-4-E2B-it-q4f16_1-MLC',
        model_lib: 'https://huggingface.co/welcoma/gemma-4-E2B-it-q4f16_1-MLC/resolve/main/libs/gemma-4-E2B-it-q4f16_1-MLC-webgpu.wasm',
        required_features: ['shader-f16']
      }
    },
    {
      model_id: 'gemma-4-E4B-it-q4f16_1-MLC',
      name: 'Gemma 4 E4B (Edge Multimodal Advanced)',
      size: '2.8 GB',
      customConfig: {
        model: 'https://huggingface.co/cnhktyom/gemma-4-E4B-it-q4f16_1-MLC',
        model_id: 'gemma-4-E4B-it-q4f16_1-MLC',
        model_lib: 'https://huggingface.co/cnhktyom/gemma-4-E4B-it-q4f16_1-MLC/resolve/main/libs/gemma-4-E4B-it-q4f16_1-MLC-webgpu.wasm',
        required_features: ['shader-f16']
      }
    },
    {
      model_id: 'gemma-2-2b-it-q4f16_1-MLC',
      name: 'Gemma 2 2B (Older Edge Model)',
      size: '1.6 GB'
    },
    {
      model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.2 1B (Mobile Friendly)',
      size: '1.2 GB'
    },
    {
      model_id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
      name: 'Qwen 2.5 1.5B (Fast & Clean)',
      size: '1.4 GB'
    },
    {
      model_id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
      name: 'Phi 3 Mini (3.8B - Advanced)',
      size: '2.2 GB'
    }
  ];

  try {
    const prebuiltList = prebuiltAppConfig.model_list || [];
    const edgeCompatibleKeywords = ['1b', '2b', '3b', '4b', '1.5b', 'e2b', 'e4b', 'gemma-2b', 'gemma2-2b', 'gemma-4', 'gemma4', 'gemma-4-e2b', 'gemma-4-e4b', 'gemma4-2b', 'phi-3-mini', 'phi-3'];
    
    const dynamicallyDiscovered = prebuiltList
      .filter(item => {
        const id = item.model_id.toLowerCase();
        return edgeCompatibleKeywords.some(kw => id.includes(kw));
      })
      .map(item => {
        let cleanName = item.model_id
          .replace(/-MLC$/, '')
          .replace(/-q\w+$/, '')
          .replace(/-Instruct$/, '')
          .replace(/-it$/, '')
          .replace(/-/g, ' ');
        
        const idLower = item.model_id.toLowerCase();
        let size = '2.0 GB';
        if (idLower.includes('1b') || idLower.includes('1.5b')) {
          size = '1.2 GB';
        } else if (idLower.includes('2b') || idLower.includes('e2b')) {
          size = '1.6 GB';
        } else if (idLower.includes('3b') || idLower.includes('e3b')) {
          size = '1.8 GB';
        } else if (idLower.includes('4b') || idLower.includes('e4b')) {
          size = '2.8 GB';
        }

        return {
          model_id: item.model_id,
          name: cleanName,
          size
        };
      });
      
    const merged = [...defaultModels];
    for (const item of dynamicallyDiscovered) {
      if (!merged.some(m => m.model_id === item.model_id)) {
        merged.push(item);
      }
    }
    return merged;
  } catch (err) {
    console.warn('Failed to retrieve WebLLM prebuilt config, using defaults:', err);
    return defaultModels;
  }
}

/**
 * Initialize WebLLM engine with loading callback
 */
export async function loadWebGPUEngine(
  modelId: string,
  customConfig: any | null,
  onProgress: (text: string, value: number) => void
): Promise<MLCEngine> {
  if (activeEngine && activeModelId === modelId) {
    return activeEngine;
  }

  if (activeEngine) {
    try {
      await activeEngine.unload();
    } catch {
      // Ignore unload errors
    }
    activeEngine = null;
  }

  const engineConfig: any = {};
  if (customConfig) {
    engineConfig.appConfig = {
      model_list: [customConfig]
    };
  }

  activeEngine = await CreateMLCEngine(modelId, {
    initProgressCallback: (progress) => {
      onProgress(progress.text, progress.progress || 0);
    },
    ...engineConfig
  });
  
  activeModelId = modelId;
  return activeEngine;
}

/**
 * Check if the engine is currently loaded for a model
 */
export function isEngineLoaded(modelId: string): boolean {
  return !!activeEngine && activeModelId === modelId;
}

/**
 * Stream completions from the WebGPU engine
 */
export async function streamWebGPUChat(
  messages: any[],
  options: { temperature?: number },
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: any) => void
): Promise<() => void> {
  if (!activeEngine) {
    onError(new Error('WebGPU Engine is not loaded. Please select and load a model.'));
    return () => {};
  }

  let isCancelled = false;

  const runChat = async () => {
    try {
      const completion = await activeEngine!.chat.completions.create({
        messages,
        temperature: options.temperature ?? 0.7,
        stream: true
      });

      let fullResponseText = '';
      for await (const chunk of completion) {
        if (isCancelled) break;
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullResponseText += delta;
          onChunk(delta);
        }
      }
      
      if (!isCancelled) {
        onDone(fullResponseText);
      }
    } catch (err) {
      if (!isCancelled) {
        onError(err);
      }
    }
  };

  runChat();

  return () => {
    isCancelled = true;
  };
}

/**
 * Unload the active WebGPU engine to release RAM and GPU memory.
 */
export async function unloadWebGPUEngine(): Promise<void> {
  if (activeEngine) {
    try {
      await activeEngine.unload();
    } catch (e) {
      console.warn('Failed to unload WebGPU engine:', e);
    }
    activeEngine = null;
    activeModelId = null;
  }
}

/**
 * Clear WebGPU model files from Cache Storage and metadata databases from IndexedDB.
 */
export async function clearWebGPUCache(): Promise<{ success: boolean; freedCaches: string[] }> {
  const freedCaches: string[] = [];
  
  // 1. Unload engine to free memory first
  await unloadWebGPUEngine();
  
  // 2. Clear Cache Storage
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await window.caches.keys();
      for (const key of keys) {
        if (key.toLowerCase().includes('webllm') || key.toLowerCase().includes('mlc')) {
          const deleted = await window.caches.delete(key);
          if (deleted) {
            freedCaches.push(`Cache: ${key}`);
          }
        }
      }
    } catch (err) {
      console.error('Error clearing Cache Storage keys:', err);
    }
  }
  
  // 3. Clear IndexedDB databases
  if (typeof window !== 'undefined' && window.indexedDB && window.indexedDB.databases) {
    try {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name && (
          db.name.startsWith('mlc_llm_db') || 
          db.name.toLowerCase().includes('webllm') || 
          db.name.toLowerCase().includes('mlc')
        )) {
          window.indexedDB.deleteDatabase(db.name);
          freedCaches.push(`IndexedDB: ${db.name}`);
        }
      }
    } catch (err) {
      console.error('Error clearing IndexedDB databases:', err);
    }
  } else if (typeof window !== 'undefined' && window.indexedDB) {
    // Fallback delete database names
    const commonDbs = ['mlc_llm_db'];
    for (const dbName of commonDbs) {
      try {
        window.indexedDB.deleteDatabase(dbName);
        freedCaches.push(`IndexedDB: ${dbName} (fallback)`);
      } catch (err) {
        // Ignore
      }
    }
  }
  
  return { success: true, freedCaches };
}

