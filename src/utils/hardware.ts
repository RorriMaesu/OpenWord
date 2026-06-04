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
    // Dedicated GPU heuristics based on normalized model strings (spaces/dashes stripped)
    const gpuNormalized = gpuName.toLowerCase().replace(/[\s\-_]+/g, '');

    // RTX 50-series
    if (gpuNormalized.includes('rtx5090')) {
      estimatedVramGb = 32;
    } else if (gpuNormalized.includes('rtx5080')) {
      estimatedVramGb = 16;
    } else if (gpuNormalized.includes('rtx5070ti')) {
      estimatedVramGb = 16;
    } else if (gpuNormalized.includes('rtx5070')) {
      estimatedVramGb = 12;
    } else if (gpuNormalized.includes('rtx5060ti')) {
      estimatedVramGb = 16;
    } else if (gpuNormalized.includes('rtx5060')) {
      estimatedVramGb = 12;
    }
    // RTX 40-series
    else if (gpuNormalized.includes('rtx4090')) {
      estimatedVramGb = 24;
    } else if (gpuNormalized.includes('rtx4080ti') || gpuNormalized.includes('rtx4080')) {
      estimatedVramGb = 16;
    } else if (gpuNormalized.includes('rtx4070ti')) {
      estimatedVramGb = 16;
    } else if (gpuNormalized.includes('rtx4070')) {
      estimatedVramGb = 12;
    } else if (gpuNormalized.includes('rtx4060ti')) {
      estimatedVramGb = 16;
    } else if (gpuNormalized.includes('rtx4060')) {
      estimatedVramGb = 8;
    }
    // RTX 30-series
    else if (gpuNormalized.includes('rtx3090ti') || gpuNormalized.includes('rtx3090')) {
      estimatedVramGb = 24;
    } else if (gpuNormalized.includes('rtx3080ti') || gpuNormalized.includes('rtx3080')) {
      estimatedVramGb = 12;
    } else if (gpuNormalized.includes('rtx3070ti') || gpuNormalized.includes('rtx3070')) {
      estimatedVramGb = 8;
    } else if (gpuNormalized.includes('rtx3060ti')) {
      estimatedVramGb = 8;
    } else if (gpuNormalized.includes('rtx3060')) {
      estimatedVramGb = 12;
    }
    // Other high-end GPUs & accelerator cards
    else if (gpuNormalized.includes('rtx2080ti') || gpuNormalized.includes('rtx6000') || gpuNormalized.includes('a100') || gpuNormalized.includes('h100') || gpuNormalized.includes('a10g')) {
      estimatedVramGb = 24;
    } else if (gpuNormalized.includes('rtx2080')) {
      estimatedVramGb = 11;
    } else if (gpuNormalized.includes('rtx2070') || gpuNormalized.includes('rtx2060')) {
      estimatedVramGb = 8;
    } else if (gpuNormalized.includes('gtx1660') || gpuNormalized.includes('gtx1080') || gpuNormalized.includes('gtx1070')) {
      estimatedVramGb = 8;
    } else if (gpuNormalized.includes('gtx1650') || gpuNormalized.includes('gtx1060')) {
      estimatedVramGb = 6;
    }
    // AMD Radeon RX Series
    else if (gpuNormalized.includes('rx7900') || gpuNormalized.includes('rx7950')) {
      estimatedVramGb = 20;
    } else if (gpuNormalized.includes('rx7800') || gpuNormalized.includes('rx7700') || gpuNormalized.includes('rx6900') || gpuNormalized.includes('rx6800')) {
      estimatedVramGb = 16;
    } else if (gpuNormalized.includes('rx6700') || gpuNormalized.includes('rx5700')) {
      estimatedVramGb = 12;
    } else if (gpuNormalized.includes('rx7600') || gpuNormalized.includes('rx6600') || gpuNormalized.includes('rx5600')) {
      estimatedVramGb = 8;
    }
    // Intel Arc Series
    else if (gpuNormalized.includes('arca770')) {
      estimatedVramGb = 16;
    } else if (gpuNormalized.includes('arca750') || gpuNormalized.includes('arca580')) {
      estimatedVramGb = 8;
    } else if (gpuNormalized.includes('arca380')) {
      estimatedVramGb = 6;
    } else if (gpuNormalized.includes('intel') || gpuNormalized.includes('iris') || gpuNormalized.includes('amd')) {
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
