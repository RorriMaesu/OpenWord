import { CreateWebWorkerMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { loadLiteRTGPUEngine, isLiteRTEngineLoaded, unloadLiteRTEngine, streamLiteRTChat, clearLiteRTCache } from './litert';

let activeEngine: WebWorkerMLCEngine | any | null = null;
let activeWorker: Worker | null = null;
let activeModelId: string | null = null;
let activeProvider: 'webllm' | 'litert' | null = null;

export interface EdgeModel {
  model_id: string;
  name: string;
  size: string;
  provider: 'webllm' | 'litert';
  customConfig?: {
    model: string;
    model_id?: string;
    model_lib?: string;
    required_features?: string[];
  };
}

export function checkWebGPUSupport(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * Get dynamic list of edge-suitable models from WebLLM registry.
 * 
 * Default list is curated with Gemma 4 E2B (custom HF repo) as the recommended
 * edge model. Dynamic discovery from WebLLM's prebuilt registry adds any NEW
 * small models, but excludes old Gemma 2/1 variants to prevent dropdown pollution.
 */
export function getAvailableEdgeModels(): EdgeModel[] {
  const defaultModels: EdgeModel[] = [
    {
      model_id: 'gemma-4-E2B-it-litert-lm',
      name: 'Gemma 4 E2B (Recommended)',
      size: '1.6 GB',
      provider: 'litert',
      customConfig: {
        model: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm'
      }
    },
    {
      model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.2 1B (Mobile Friendly)',
      size: '1.2 GB',
      provider: 'webllm'
    },
    {
      model_id: 'gemma-2-2b-it-q4f16_1-MLC',
      name: 'Gemma 2 2B (Older Edge Model)',
      size: '1.6 GB',
      provider: 'webllm'
    },
    {
      model_id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
      name: 'Qwen 2.5 1.5B (Fast & Clean)',
      size: '1.4 GB',
      provider: 'webllm'
    },
    {
      model_id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
      name: 'Phi 3 Mini (3.8B - Advanced)',
      size: '2.2 GB',
      provider: 'webllm'
    }
  ];

  // Exclusion prefixes — block old Gemma 2/1 duplicates and oversized models
  // from polluting the dropdown. WebLLM v0.2.84 ships ~13 Gemma 2 variants
  // (q4f32, -1k context, jpn locale, etc.) that all match broad keywords.
  const excludedPrefixes = [
    'gemma-2-',    // All Gemma 2 variants (already represented by our curated entry)
    'gemma-2b',    // Gemma 1 2B variants (e.g. gemma-2b-it-q4f32_1-MLC)
    'gemma-2-9b',  // Gemma 2 9B — too large for edge
    'gemma-2-27b', // Gemma 2 27B — far too large
  ];

  try {
    const prebuiltList = prebuiltAppConfig.model_list || [];
    
    const dynamicallyDiscovered = prebuiltList
      .filter(item => {
        const id = item.model_id.toLowerCase();
        
        // Block excluded model families
        if (excludedPrefixes.some(prefix => id.startsWith(prefix))) return false;
        
        // Only include genuinely small models suitable for edge/mobile
        const edgePatterns = [
          '1b', '1.5b', '2b', '3b', '4b',
          'e2b', 'e4b',
          'phi-3-mini', 'phi-3.5-mini',
          'gemma3-1b', 'gemma-4',
        ];
        return edgePatterns.some(kw => id.includes(kw));
      })
      .map(item => {
        const cleanName = item.model_id
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
          size,
          provider: 'webllm' as const
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
): Promise<any> {
  if (activeModelId === modelId) {
    return activeEngine;
  }

  // Unload any running engines first
  await unloadWebGPUEngine();

  const model = getAvailableEdgeModels().find(m => m.model_id === modelId);
  if (model?.provider === 'litert') {
    activeProvider = 'litert';
    const modelUrl = customConfig?.model || model.customConfig?.model || '';
    activeEngine = await loadLiteRTGPUEngine(modelId, modelUrl, onProgress);
    activeModelId = modelId;
    return activeEngine;
  }

  // WebWorker MLC Engine initialization path
  activeProvider = 'webllm';
  const engineConfig: any = {};
  if (customConfig) {
    engineConfig.appConfig = {
      model_list: [customConfig]
    };
  }

  // Detect mobile / tablet device to apply low-memory settings
  const isMobile = typeof navigator !== 'undefined' && 
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const chatOpts: any = {};
  if (isMobile) {
    // Crucial: reduce context window size on mobile to dramatically reduce KV cache allocation.
    // Default context window for Gemma 4 is often 4096 or 8192, which consumes 400MB-1GB of extra VRAM buffers.
    // Limiting it to 1024 prevents OOM crashes on memory-constrained mobile OS tabs.
    // Note: We MUST set sliding_window_size to -1 if context_window_size is positive.
    chatOpts.context_window_size = 1024;
    chatOpts.sliding_window_size = -1;
  }

  // Spawn the web worker
  activeWorker = new Worker(
    new URL('./webllm.worker.ts', import.meta.url),
    { type: 'module' }
  );

  activeEngine = await CreateWebWorkerMLCEngine(
    activeWorker,
    modelId,
    {
      initProgressCallback: (progress) => {
        onProgress(progress.text, progress.progress || 0);
      },
      ...engineConfig
    },
    chatOpts
  );
  
  activeModelId = modelId;
  return activeEngine;
}

/**
 * Check if the engine is currently loaded for a model
 */
export function isEngineLoaded(modelId: string): boolean {
  const model = getAvailableEdgeModels().find(m => m.model_id === modelId);
  if (model?.provider === 'litert') {
    return isLiteRTEngineLoaded(modelId);
  }
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

  if (activeProvider === 'litert') {
    return streamLiteRTChat(messages, onChunk, onDone, onError);
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
  // Unload LiteRT engine
  try {
    await unloadLiteRTEngine();
  } catch (e) {
    console.warn('Failed to unload LiteRT engine:', e);
  }

  // Unload WebWorker MLC engine
  if (activeEngine) {
    try {
      await activeEngine.unload();
    } catch (e) {
      console.warn('Failed to unload WebGPU engine:', e);
    }
    activeEngine = null;
    activeModelId = null;
  }
  if (activeWorker) {
    try {
      activeWorker.terminate();
    } catch (e) {
      console.warn('Failed to terminate Web Worker:', e);
    }
    activeWorker = null;
  }
  activeProvider = null;
}

/**
 * Clear WebGPU model files from Cache Storage and metadata databases from IndexedDB.
 */
export async function clearWebGPUCache(): Promise<{ success: boolean; freedCaches: string[] }> {
  const freedCaches: string[] = [];
  
  // 1. Unload engine to free memory first
  await unloadWebGPUEngine();

  // 2. Clear LiteRT Cache Storage
  try {
    const clearedLiteRT = await clearLiteRTCache();
    freedCaches.push(...clearedLiteRT);
  } catch (e) {
    console.error('Error clearing LiteRT cache:', e);
  }
  
  // 3. Clear Cache Storage
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
  
  // 4. Clear IndexedDB databases
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

