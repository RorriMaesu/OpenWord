export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaOptions {
  temperature?: number;
  draft_num_predict?: number;
}

const OLLAMA_HOST = 'http://localhost:11434';

/**
 * Check if Ollama is running, first through our dev server API proxy, 
 * then falling back to direct network connection to Ollama's default port.
 */
export async function checkOllamaStatus(): Promise<boolean> {
  try {
    // 1. Try Vite dev server bridge first
    const proxyRes = await fetch('/api/ollama-control', { method: 'GET' }).catch(() => null);
    if (proxyRes && proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.running) return true;
    }
  } catch (err) {
    // Ignore proxy error, fall back to direct ping
  }

  try {
    // 2. Direct CORS check to local Ollama instance
    const directRes = await fetch(`${OLLAMA_HOST}/`, { method: 'GET' });
    return directRes.ok || directRes.status === 404;
  } catch (err) {
    return false;
  }
}

/**
 * Request the dev server bridge to launch Ollama on the user's host OS.
 */
export async function launchLocalOllama(): Promise<boolean> {
  try {
    const res = await fetch('/api/ollama-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'launch' }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.success;
    }
  } catch (err) {
    console.error('Failed to trigger local daemon launch bridge:', err);
  }
  return false;
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
