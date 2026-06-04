/**
 * Extract a clean, friendly display name from a raw Ollama model name string.
 * E.g., 'gemma2:2b' -> 'Gemma 2'
 *       'llama3.1:latest' -> 'Llama 3.1'
 *       'qwen2.5-coder:7b' -> 'Qwen 2.5 Coder'
 */
export function getFriendlyModelName(modelName: string): string {
  if (!modelName) return 'AI Copilot';
  
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
