import { Engine } from '@litert-lm/core';
import type { Conversation } from '@litert-lm/core';

let activeEngine: Engine | null = null;
let activeConversation: Conversation | null = null;
let activeModelId: string | null = null;

const LITERTLM_CACHE_NAME = 'litert-lm-cache';

/**
 * Fetch model with caching and progress reporting
 */
export async function fetchLiteRTModelWithCache(
  url: string,
  onProgress: (text: string, value: number) => void
): Promise<Blob> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    // Cache not supported, fetch directly
    const response = await fetch(url);
    return response.blob();
  }

  const cache = await window.caches.open(LITERTLM_CACHE_NAME);
  const cachedResponse = await cache.match(url);

  if (cachedResponse) {
    onProgress('Loading model from browser cache...', 0.5);
    const blob = await cachedResponse.blob();
    onProgress('Model loaded from cache.', 1.0);
    return blob;
  }

  // Not in cache, fetch and store
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model weights: ${response.statusText}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

  let receivedLength = 0;
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedLength += value.length;
    const pct = contentLength ? receivedLength / contentLength : 0;
    onProgress(`Downloading model weights... (${(receivedLength / 1024 / 1024).toFixed(1)} MB)`, pct);
  }

  const blob = new Blob(chunks as any);
  
  // Cache the response blob
  try {
    const cacheResponse = new Response(blob, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': blob.size.toString()
      }
    });
    await cache.put(url, cacheResponse);
  } catch (err) {
    console.warn('Failed to cache LiteRT-LM model weights:', err);
  }

  return blob;
}

/**
 * Load LiteRT-LM model weights and start the engine
 */
export async function loadLiteRTGPUEngine(
  modelId: string,
  modelUrl: string,
  onProgress: (text: string, value: number) => void
): Promise<Engine> {
  if (activeEngine && activeModelId === modelId) {
    return activeEngine;
  }

  await unloadLiteRTEngine();

  onProgress('Preparing model weights...', 0);
  const blob = await fetchLiteRTModelWithCache(modelUrl, onProgress);

  onProgress('Initializing LiteRT engine...', 1.0);
  
  // Detect if on mobile to set lower token constraints
  const isMobile = typeof navigator !== 'undefined' && 
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  activeEngine = await Engine.create({
    model: blob.stream(),
    mainExecutorSettings: {
      maxNumTokens: isMobile ? 1024 : 4096,
    }
  });

  activeModelId = modelId;
  activeConversation = await activeEngine.createConversation({
    preface: {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' }
      ]
    }
  });

  return activeEngine;
}

/**
 * Check if the LiteRT engine is loaded for a model
 */
export function isLiteRTEngineLoaded(modelId: string): boolean {
  return !!activeEngine && activeModelId === modelId;
}

/**
 * Unload the active LiteRT engine to release RAM/VRAM
 */
export async function unloadLiteRTEngine(): Promise<void> {
  if (activeConversation) {
    try {
      await activeConversation.delete();
    } catch (e) {
      console.warn('Failed to delete LiteRT conversation:', e);
    }
    activeConversation = null;
  }
  if (activeEngine) {
    try {
      await activeEngine.delete();
    } catch (e) {
      console.warn('Failed to delete LiteRT engine:', e);
    }
    activeEngine = null;
    activeModelId = null;
  }
}

/**
 * Stream chat completion from the LiteRT engine
 */
export async function streamLiteRTChat(
  messages: any[],
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: any) => void
): Promise<() => void> {
  if (!activeConversation) {
    onError(new Error('LiteRT conversation is not initialized. Please load the model first.'));
    return () => {};
  }

  let isCancelled = false;

  // Extract only the latest user message as LiteRT-LM conversation handles history internally
  const userMessage = messages[messages.length - 1];
  const content = userMessage?.content || '';

  const runChat = async () => {
    try {
      const stream = activeConversation!.sendMessageStreaming(content);
      const reader = stream.getReader();
      let fullText = '';

      try {
        while (!isCancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          let text = '';
          if (typeof value.content === 'string') {
            text = value.content;
          } else if (Array.isArray(value.content)) {
            text = value.content.map(c => c.text || '').join('');
          }

          if (text) {
            fullText += text;
            onChunk(text);
          }
        }

        if (!isCancelled) {
          onDone(fullText);
        }
      } finally {
        reader.releaseLock();
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
    if (activeConversation) {
      try {
        activeConversation.cancel();
      } catch (e) {
        console.warn('Failed to cancel LiteRT streaming:', e);
      }
    }
  };
}

/**
 * Clear cached LiteRT-LM models
 */
export async function clearLiteRTCache(): Promise<string[]> {
  const cleared: string[] = [];
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const deleted = await window.caches.delete(LITERTLM_CACHE_NAME);
      if (deleted) {
        cleared.push('LiteRT Model Cache');
      }
    } catch (e) {
      console.error('Error clearing LiteRT cache:', e);
    }
  }
  return cleared;
}
