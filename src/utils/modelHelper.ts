/**
 * Extract a clean, friendly display name from a raw Ollama model name string.
 * E.g., 'gemma2:2b' -> 'Gemma 2'
 *       'llama3.1:latest' -> 'Llama 3.1'
 *       'qwen2.5-coder:7b' -> 'Qwen 2.5 Coder'
 */
export function getFriendlyModelName(modelName: string): string {
  if (!modelName) return 'AI Copilot';
  
  // Custom cleanup for WebGPU model IDs
  const lowerName = modelName.toLowerCase();
  if (lowerName.includes('gemma-4-e2b')) return 'Gemma 4 E2B';
  if (lowerName.includes('gemma-4-e4b')) return 'Gemma 4 E4B';
  if (lowerName.includes('gemma-2-2b')) return 'Gemma 2 2B';
  if (lowerName.includes('llama-3.2-1b')) return 'Llama 3.2 1B';
  if (lowerName.includes('qwen2.5-1.5b')) return 'Qwen 2.5 1.5B';
  if (lowerName.includes('phi-3-mini')) return 'Phi 3 Mini';

  // 1. Strip the tag (everything after the colon)
  const baseName = modelName.split(':')[0];
  
  // 2. Split by hyphens or underscores and map to Title Case
  return baseName
    .split(/[-_]/)
    .map(word => {
      if (!word) return '';
      
      const lower = word.toLowerCase();
      if (lower === 'mtp') return 'MTP';
      
      // Separate digit sequences at the end of name for better formatting (e.g. gemma2 -> Gemma 2)
      const digitMatch = word.match(/^([a-zA-Z\.]+)(\d+)$/);
      if (digitMatch) {
        const letters = digitMatch[1];
        const digits = digitMatch[2];
        return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() + ' ' + digits;
      }
      
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Checks if a candidate model tag is compatible with a target recommended model.
 * Maps legacy gemma4 model tags (2b, 4b, 9b) to the official ones (e2b, e4b, 12b) and vice-versa.
 */
export function isCompatibleModel(candidate: string, target: string): boolean {
  if (!candidate || !target) return false;
  if (candidate === target) return true;

  // Clean tags of any trailing ':latest' or tag details
  const cleanCandidate = candidate.split(':')[0] + ':' + (candidate.split(':')[1] || 'latest').replace(/:latest$/, '');
  const cleanTarget = target.split(':')[0] + ':' + (target.split(':')[1] || 'latest').replace(/:latest$/, '');

  if (cleanCandidate === cleanTarget) return true;

  const compatibilityMap: Record<string, string[]> = {
    'gemma4:e2b': ['gemma4:e2b', 'gemma4:2b'],
    'gemma4:e4b': ['gemma4:e4b', 'gemma4:4b'],
    'gemma4:12b': ['gemma4:12b', 'gemma4:9b'],
    'gemma4:26b': ['gemma4:26b'],
    'gemma4:31b': ['gemma4:31b'],
    // Reverse compatibility
    'gemma4:2b': ['gemma4:e2b', 'gemma4:2b'],
    'gemma4:4b': ['gemma4:e4b', 'gemma4:4b'],
    'gemma4:9b': ['gemma4:12b', 'gemma4:9b']
  };

  const targets = compatibilityMap[cleanTarget] || [cleanTarget];
  return targets.some(t => cleanCandidate.startsWith(t) || t.startsWith(cleanCandidate));
}
