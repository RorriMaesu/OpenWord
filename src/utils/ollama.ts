export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaOptions {
  temperature?: number;
  draft_num_predict?: number;
}

const OLLAMA_HOST = 'http://localhost:11434';

let cachedControlUrl: string | null = null;
let hasCheckedControlUrl = false;

/**
 * Dynamically check candidate endpoints for the Vite dev control server
 * to find where the local launcher bridge is listening.
 */
export async function getControlApiUrl(forceCheck = false): Promise<string | null> {
  if (forceCheck) {
    cachedControlUrl = null;
    hasCheckedControlUrl = false;
  }

  if (cachedControlUrl) return cachedControlUrl === 'none' ? null : cachedControlUrl;
  if (hasCheckedControlUrl) return null;

  hasCheckedControlUrl = true;

  const isLocal = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const candidates = [
    ...(isLocal ? ['/api/ollama-control'] : []),
    'http://localhost:5173/api/ollama-control',
    'http://127.0.0.1:5173/api/ollama-control',
    'http://localhost:5174/api/ollama-control',
    'http://localhost:5175/api/ollama-control'
  ];

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 600);
      const res = await fetch(url, { method: 'GET', signal: controller.signal }).catch(() => null);
      clearTimeout(id);
      if (res && res.ok) {
        cachedControlUrl = url;
        return url;
      }
    } catch {
      // Ignore and try next candidate
    }
  }

  cachedControlUrl = 'none';
  return null;
}

/**
 * Check if Ollama is running, first through our dev server API proxy, 
 * then falling back to direct network connection to Ollama's default port.
 */
export async function checkOllamaStatus(): Promise<boolean> {
  try {
    // 1. Try Vite dev server bridge first
    const controlUrl = await getControlApiUrl();
    if (controlUrl) {
      const proxyRes = await fetch(controlUrl, { method: 'GET' }).catch(() => null);
      if (proxyRes && proxyRes.ok) {
        const data = await proxyRes.json();
        if (data.running) return true;
      }
    }
  } catch {
    // Ignore proxy error, fall back to direct ping
  }

  try {
    // 2. Direct CORS check to local Ollama instance
    const directRes = await fetch(`${OLLAMA_HOST}/`, { method: 'GET' });
    return directRes.ok || directRes.status === 404;
  } catch {
    return false;
  }
}

export async function launchLocalOllama(): Promise<{ success: boolean; found: boolean; error?: string }> {
  try {
    const controlUrl = await getControlApiUrl();
    if (!controlUrl) {
      return { success: false, found: false, error: 'No local control API available' };
    }
    const res = await fetch(controlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'launch' }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: !!data.success, found: !!data.found };
    }
  } catch (err) {
    console.error('Failed to trigger local daemon launch bridge:', err);
  }
  return { success: false, found: false };
}

/**
 * Fetch list of downloaded models from the local Ollama instance.
 */
export async function fetchLocalModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      return (data.models || []).map((m: any) => m.name);
    }
  } catch (err) {
    console.warn('Failed to retrieve Ollama model list:', err);
  }
  return [];
}

/**
 * Stream responses from the local Ollama API chat endpoint.
 */
export async function streamOllamaChat(
  model: string,
  messages: OllamaMessage[],
  options: OllamaOptions,
  onChunk: (chunk: string) => void,
  onDone: (fullResponse: string) => void,
  onError: (err: any) => void
): Promise<() => void> {
  let isCancelled = false;
  const abortController = new AbortController();

  const runStream = async () => {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          options,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`Ollama API error: ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable.');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (!isCancelled) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        // Ollama streams JSON objects separated by newlines
        const lines = textChunk.split('\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              const content = parsed.message.content;
              accumulatedText += content;
              onChunk(content);
            }
            if (parsed.done) {
              onDone(accumulatedText);
            }
          } catch (err) {
            // Ignore partial line parsing errors (handled on next chunk)
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !isCancelled) {
        onError(err);
      }
    }
  };

  runStream();

  // Return a cancel function
  return () => {
    isCancelled = true;
    abortController.abort();
  };
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

/**
 * Pull/Download a model from the Ollama library.
 */
export async function streamOllamaPull(
  model: string,
  onProgress: (progress: PullProgress) => void,
  onDone: () => void,
  onError: (err: any) => void
): Promise<() => void> {
  let isCancelled = false;
  const abortController = new AbortController();

  const runPull = async () => {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`Ollama API error: ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable.');
      }

      const decoder = new TextDecoder();

      while (!isCancelled) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        const lines = textChunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            onProgress({
              status: parsed.status,
              digest: parsed.digest,
              total: parsed.total,
              completed: parsed.completed,
            });
            if (parsed.status === 'success') {
              onDone();
            }
          } catch (err) {
            // Ignore parse errors for partial lines
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !isCancelled) {
        onError(err);
      }
    }
  };

  runPull();

  return () => {
    isCancelled = true;
    abortController.abort();
  };
}
