export interface HardwareProfile {
  gpuName: string;
  estimatedVramGb: number;
  recommendedModel: string;
  reason: string;
}

export function detectHardware(): HardwareProfile {
  let gpuName = 'Unknown Graphics Adapter';
  let estimatedVramGb = 4; // Safe default for VRAM estimate (e.g. mobile/integrated)

  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuName = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gpuName;
      }
    }
  } catch (err) {
    console.warn('Failed to query WebGL hardware details:', err);
  }

  // Basic device system memory (RAM) in GB (often unified for Apple M-series)
  const systemMemoryGb = (navigator as any).deviceMemory || 8;
  const isAppleSilicon = /Apple/i.test(gpuName) || /Apple M/i.test(gpuName);

  if (isAppleSilicon) {
    // Apple unified memory: Use system memory as VRAM metric
    estimatedVramGb = systemMemoryGb;
  } else {
    // Dedicated GPU heuristics based on model strings
    const gpuLower = gpuName.toLowerCase();

    if (gpuLower.includes('rtx 4090') || gpuLower.includes('rtx 3090') || gpuLower.includes('a100') || gpuLower.includes('h100') || gpuLower.includes('a10g') || gpuLower.includes('rtx 6000')) {
      estimatedVramGb = 24;
    } else if (gpuLower.includes('rtx 4080') || gpuLower.includes('rtx 3080') || gpuLower.includes('rtx 3085') || gpuLower.includes('rtx 4070 ti')) {
      estimatedVramGb = 16;
    } else if (gpuLower.includes('rtx 4070') || gpuLower.includes('rtx 3070') || gpuLower.includes('rtx 3060 ti') || gpuLower.includes('rtx 2080')) {
      estimatedVramGb = 12;
    } else if (gpuLower.includes('rtx 4060') || gpuLower.includes('rtx 3060') || gpuLower.includes('rtx 2070') || gpuLower.includes('rtx 2060')) {
      estimatedVramGb = 8;
    } else if (gpuLower.includes('gtx 1660') || gpuLower.includes('gtx 1080') || gpuLower.includes('gtx 1070')) {
      estimatedVramGb = 6;
    } else if (gpuLower.includes('gtx 1650') || gpuLower.includes('gtx 1060') || gpuLower.includes('intel') || gpuLower.includes('iris') || gpuLower.includes('amd radeon')) {
      // Integrated graphics or low-end card
      estimatedVramGb = Math.min(4, systemMemoryGb / 2);
    }
  }

  // Model size recommendations based on estimated VRAM capacity
  let recommendedModel = 'gemma4:2b';
  let reason = '';

  if (estimatedVramGb >= 20) {
    recommendedModel = 'gemma4:31b';
    reason = `Detected premium GPU (${gpuName}) with ~${estimatedVramGb}GB VRAM. Standard dense Gemma 4 31B is recommended for optimal intelligence.`;
  } else if (estimatedVramGb >= 12) {
    recommendedModel = 'gemma4:26b'; // Mixture of Experts (MoE)
    reason = `Detected mid-to-high GPU (${gpuName}) with ~${estimatedVramGb}GB VRAM. Gemma 4 26B (Mixture of Experts) is recommended for efficient performance.`;
  } else if (estimatedVramGb >= 8) {
    recommendedModel = 'gemma4:9b';
    reason = `Detected mid-range GPU (${gpuName}) with ~${estimatedVramGb}GB VRAM. Gemma 4 9B is recommended for a balanced speed-to-intelligence ratio.`;
  } else if (estimatedVramGb >= 6) {
    recommendedModel = 'gemma4:4b';
    reason = `Detected dedicated GPU (${gpuName}) with ~${estimatedVramGb}GB VRAM. Gemma 4 4B (Effective) is recommended for low-latency offline execution.`;
  } else {
    recommendedModel = 'gemma4:2b';
    reason = `Detected integrated or limited hardware (${gpuName}) with ~${estimatedVramGb}GB VRAM. Lightweight Gemma 4 2B is recommended to prevent system slowdown.`;
  }

  return {
    gpuName,
    estimatedVramGb,
    recommendedModel,
    reason
  };
}
