import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Sparkles, Send, Bot, User, Settings, RefreshCw, Cpu, 
  CornerDownLeft, FileText, Clipboard, AlertCircle, ToggleLeft, ToggleRight,
  Download, X, Trash2
} from 'lucide-react';
import { 
  checkOllamaStatus, launchLocalOllama, fetchLocalModels, 
  streamOllamaChat, getControlApiUrl, streamOllamaPull
} from '../../utils/ollama';
import type { PullProgress } from '../../utils/ollama';
import { detectHardware, detectOS } from '../../utils/hardware';
import type { HardwareProfile, OSDetails } from '../../utils/hardware';
import { 
  serializeEditorToBlocks, streamEditBlock, 
  insertPlaceholderBlock, executeDeleteBlock 
} from '../../utils/blocks';
import type { DocumentBlock, BlockOperation } from '../../utils/blocks';
import { CopilotDiffCard } from './CopilotDiffCard';
import { AgentStreamParser } from '../../utils/agentParser';
import type { ToolCallEvent } from '../../utils/agentParser';
import { getFriendlyModelName } from '../../utils/modelHelper';
import { 
  checkWebGPUSupport, getAvailableEdgeModels, loadWebGPUEngine, 
  isEngineLoaded, streamWebGPUChat 
} from '../../utils/webllm';
import type { EdgeModel } from '../../utils/webllm';
import { useIsMobile } from '../../utils/useIsMobile';

interface AICopilotProps {
  editor: Editor | null;
}

interface ExtendedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  operations?: BlockOperation[];
  explanation?: string;
  originalBlocks?: DocumentBlock[];
  status?: 'pending' | 'applied' | 'rejected';
}



export const AICopilot: React.FC<AICopilotProps> = ({ editor }) => {
  const isMobile = useIsMobile();
  // Connection and model states
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('openword_copilot_ollama_model') || 'gemma4:2b';
  });
  const [isLaunching, setIsLaunching] = useState<boolean>(false);

  // Model downloader states
  const [showDownloader, setShowDownloader] = useState<boolean>(false);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [downloadModelName, setDownloadModelName] = useState<string>('gemma2:2b');
  const [customModelName, setCustomModelName] = useState<string>('');
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [pullPercentage, setPullPercentage] = useState<number>(0);
  const cancelPullRef = useRef<(() => void) | null>(null);

  // WebGPU states
  const [modelMode, setModelMode] = useState<'ollama' | 'webgpu'>(() => {
    const saved = localStorage.getItem('openword_copilot_mode');
    return (saved as 'ollama' | 'webgpu') || 'ollama';
  });
  const [isWebGPUAvailable, setIsWebGPUAvailable] = useState<boolean>(true);
  const [webgpuModels, setWebgpuModels] = useState<EdgeModel[]>([]);
  const [selectedWebgpuModel, setSelectedWebgpuModel] = useState<string>(() => {
    return localStorage.getItem('openword_copilot_webgpu_model') || 'gemma-2-2b-it-q4f16_1-MLC';
  });
  const [isWebgpuLoading, setIsWebgpuLoading] = useState<boolean>(false);
  const [webgpuLoadProgress, setWebgpuLoadProgress] = useState<{ text: string; pct: number } | null>(null);
  const [isWebgpuLoaded, setIsWebgpuLoaded] = useState<boolean>(false);
  const [customWebgpuWeight, setCustomWebgpuWeight] = useState<string>(() => {
    return localStorage.getItem('openword_copilot_custom_weight') || '';
  });
  const [customWebgpuLib, setCustomWebgpuLib] = useState<string>(() => {
    return localStorage.getItem('openword_copilot_custom_lib') || '';
  });
  const cancelWebgpuChatRef = useRef<(() => void) | null>(null);

  // Hardware and OS states
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [showHardwareTip, setShowHardwareTip] = useState<boolean>(() => {
    const saved = localStorage.getItem('openword_copilot_show_hw_tip');
    return saved !== null ? saved === 'true' : true;
  });
  const [detectedOS, setDetectedOS] = useState<OSDetails | null>(null);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
  const [selectedOS, setSelectedOS] = useState<'Windows' | 'macOS' | 'Linux'>('Windows');
  const [downloadStarted, setDownloadStarted] = useState<boolean>(false);

  const [isControlApiAvailable, setIsControlApiAvailable] = useState<boolean>(false);

  // Chat settings
  const [temperature, setTemperature] = useState<number>(() => {
    const saved = localStorage.getItem('openword_copilot_temp');
    return saved ? parseFloat(saved) : 0.7;
  });
  const [enableMtp, setEnableMtp] = useState<boolean>(() => {
    const saved = localStorage.getItem('openword_copilot_mtp');
    return saved !== null ? saved === 'true' : true;
  });
  const [includeContext, setIncludeContext] = useState<boolean>(() => {
    const saved = localStorage.getItem('openword_copilot_context');
    return saved !== null ? saved === 'true' : true;
  });
  const [directEdit, setDirectEdit] = useState<boolean>(() => {
    const saved = localStorage.getItem('openword_copilot_direct_edit');
    return saved !== null ? saved === 'true' : false;
  });
  const [showSettings, setShowSettings] = useState<boolean>(() => {
    const saved = localStorage.getItem('openword_copilot_show_settings');
    return saved !== null ? saved === 'true' : false;
  });

  // Chat feed states
  const [messages, setMessages] = useState<ExtendedMessage[]>(() => {
    const saved = localStorage.getItem('openword_copilot_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error('Failed to parse saved copilot messages', e);
      }
    }
    return [];
  });
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [streamedResponse, setStreamedResponse] = useState<string>('');
  const [streamedOperations, setStreamedOperations] = useState<BlockOperation[]>([]);
  const [streamedOriginalBlocks, setStreamedOriginalBlocks] = useState<DocumentBlock[]>([]);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Select text state
  const [hasSelection, setHasSelection] = useState<boolean>(false);

  // WebGL hardware check on mount
  useEffect(() => {
    const hw = detectHardware();
    setHardware(hw);
    
    // Only set default model if not already saved in localStorage
    const savedModel = localStorage.getItem('openword_copilot_ollama_model');
    if (!savedModel) {
      setSelectedModel(hw.recommendedModel);
    }

    const os = detectOS();
    setDetectedOS(os);
    setSelectedOS(os.osName);

    // Check WebGPU availability
    const hasWebGPU = checkWebGPUSupport();
    setIsWebGPUAvailable(hasWebGPU);

    // Retrieve and populate filtered edge models
    const edgeList = getAvailableEdgeModels();
    setWebgpuModels(edgeList);
    
    const savedWebgpuModel = localStorage.getItem('openword_copilot_webgpu_model');
    if (!savedWebgpuModel && edgeList.length > 0) {
      setSelectedWebgpuModel(edgeList[0].model_id);
    }
  }, []);

  // Sync / set dynamic greeting based on currently selected model
  useEffect(() => {
    const activeModel = modelMode === 'webgpu' ? selectedWebgpuModel : selectedModel;
    const friendlyName = getFriendlyModelName(activeModel);
    
    // Check if we already have messages loaded (so we don't overwrite user's saved history)
    const saved = localStorage.getItem('openword_copilot_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return;
        }
      } catch (e) {
        // Parse error, proceed
      }
    }

    // If messages are empty or only contain a greeting assistant role, replace the greeting
    if (messages.length === 0 || (messages.length === 1 && messages[0].role === 'assistant')) {
      setMessages([
        { 
          role: 'assistant', 
          content: `Hello! I am ${friendlyName}, your offline AI co-writer. How can I help you write or edit your document today?` 
        }
      ]);
    }
  }, [selectedModel, selectedWebgpuModel, modelMode]);

  // Ollama connection polling
  const runConnectionCheck = async () => {
    setIsChecking(true);
    
    // Check if the control API is available
    const controlUrl = await getControlApiUrl();
    setIsControlApiAvailable(!!controlUrl);

    const status = await checkOllamaStatus();
    setIsConnected(status);
    setIsChecking(false);

    if (status) {
      const modelList = await fetchLocalModels();
      setModels(modelList);
      
      // If the recommended gemma4 model size is already pulled, keep it. 
      // Otherwise, pick the first available or default to gemma4
      if (modelList.length > 0) {
        const savedModel = localStorage.getItem('openword_copilot_ollama_model');
        if (savedModel && modelList.includes(savedModel)) {
          setSelectedModel(savedModel);
        } else {
          const hasRecommended = modelList.some(m => m.startsWith(hardware?.recommendedModel || 'gemma4'));
          if (!hasRecommended) {
            // Find any gemma model
            const gemmaModel = modelList.find(m => m.includes('gemma'));
            if (gemmaModel) {
              setSelectedModel(gemmaModel);
            } else {
              setSelectedModel(modelList[0]);
            }
          } else {
            setSelectedModel(hardware?.recommendedModel || 'gemma4:2b');
          }
        }
      }
    }
  };

  useEffect(() => {
    runConnectionCheck();
    // Poll connection state every 10 seconds
    const interval = setInterval(async () => {
      const status = await checkOllamaStatus();
      setIsConnected(status);
      
      // Also update control API availability status
      const controlUrl = await getControlApiUrl();
      setIsControlApiAvailable(!!controlUrl);
    }, 10000);
    return () => clearInterval(interval);
  }, [hardware]);

  // Monitor editor selections
  useEffect(() => {
    if (!editor) return;
    const handleSelection = () => {
      const { from, to } = editor.state.selection;
      setHasSelection(from !== to);
    };
    editor.on('selectionUpdate', handleSelection);
    return () => {
      editor.off('selectionUpdate', handleSelection);
    };
  }, [editor]);

  // Auto-scroll chat feed
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedResponse]);

  const handleLaunchOllama = async () => {
    setIsLaunching(true);
    const result = await launchLocalOllama();
    if (result.success && result.found) {
      // Poll rapidly for 10 seconds to detect startup
      let attempts = 0;
      const interval = setInterval(async () => {
        const status = await checkOllamaStatus();
        attempts++;
        if (status) {
          setIsConnected(true);
          setIsLaunching(false);
          clearInterval(interval);
          runConnectionCheck();
        } else if (attempts >= 20) {
          setIsLaunching(false);
          clearInterval(interval);
          setShowInstallModal(true); // Open modal helper if startup failed to connect
        }
      }, 500);
    } else {
      setIsLaunching(false);
      setShowInstallModal(true); // Instantly open helper if not found or launch failed
    }
  };

  useEffect(() => {
    return () => {
      if (cancelStreamRef.current) cancelStreamRef.current();
      if (cancelPullRef.current) cancelPullRef.current();
      if (cancelWebgpuChatRef.current) cancelWebgpuChatRef.current();
    };
  }, []);

  // Sync state settings to localStorage
  useEffect(() => {
    localStorage.setItem('openword_copilot_mode', modelMode);
  }, [modelMode]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_ollama_model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_webgpu_model', selectedWebgpuModel);
  }, [selectedWebgpuModel]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_custom_weight', customWebgpuWeight);
  }, [customWebgpuWeight]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_custom_lib', customWebgpuLib);
  }, [customWebgpuLib]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_temp', temperature.toString());
  }, [temperature]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_mtp', enableMtp.toString());
  }, [enableMtp]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_context', includeContext.toString());
  }, [includeContext]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_direct_edit', directEdit.toString());
  }, [directEdit]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_show_settings', showSettings.toString());
  }, [showSettings]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_show_hw_tip', showHardwareTip.toString());
  }, [showHardwareTip]);

  useEffect(() => {
    localStorage.setItem('openword_copilot_messages', JSON.stringify(messages));
  }, [messages]);

  const handleStartPull = async () => {
    const targetModel = downloadModelName === 'custom' ? customModelName.trim() : downloadModelName;
    if (!targetModel) return;

    setIsPulling(true);
    setPullProgress({ status: 'Initiating download...' });
    setPullPercentage(0);

    const cancel = await streamOllamaPull(
      targetModel,
      (progress) => {
        setPullProgress(progress);
        if (progress.total && progress.completed) {
          const pct = Math.round((progress.completed / progress.total) * 100);
          setPullPercentage(pct);
        }
      },
      () => {
        setIsPulling(false);
        setPullProgress(null);
        setPullPercentage(0);
        setShowDownloader(false);
        runConnectionCheck();
        setSelectedModel(targetModel);
        alert(`Successfully downloaded ${getFriendlyModelName(targetModel)}!`);
      },
      (err) => {
        console.error('Failed to download model:', err);
        setIsPulling(false);
        setPullProgress({ status: `Error: ${err.message || 'Download failed'}` });
        setPullPercentage(0);
      }
    );

    cancelPullRef.current = cancel;
  };

  const handleCancelPull = () => {
    if (cancelPullRef.current) {
      cancelPullRef.current();
      cancelPullRef.current = null;
      setIsPulling(false);
      setPullProgress(null);
      setPullPercentage(0);
    }
  };

  const handleLoadWebgpuModel = async () => {
    setIsWebgpuLoading(true);
    setIsWebgpuLoaded(false);
    setWebgpuLoadProgress({ text: 'Starting WebGPU context...', pct: 0 });

    let customConfig: any | null = null;
    if (selectedWebgpuModel === 'custom') {
      if (!customWebgpuWeight.trim() || !customWebgpuLib.trim()) {
        alert('Please provide both Hugging Face weights repository and compiled model WASM library path.');
        setIsWebgpuLoading(false);
        setWebgpuLoadProgress(null);
        return;
      }
      customConfig = {
        model: customWebgpuWeight.trim(),
        model_id: 'custom-webgpu-model',
        model_lib: customWebgpuLib.trim()
      };
    }

    try {
      const targetModelId = selectedWebgpuModel === 'custom' ? 'custom-webgpu-model' : selectedWebgpuModel;
      await loadWebGPUEngine(
        targetModelId,
        customConfig,
        (text, value) => {
          setWebgpuLoadProgress({
            text,
            pct: Math.round(value * 100)
          });
        }
      );
      
      setIsWebgpuLoading(false);
      setIsWebgpuLoaded(true);
      setWebgpuLoadProgress(null);
      alert(`WebGPU Model loaded and active in browser!`);
    } catch (err: any) {
      console.error('Failed to load WebGPU model:', err);
      setIsWebgpuLoading(false);
      setIsWebgpuLoaded(false);
      setWebgpuLoadProgress({ text: `Failed to load: ${err.message || err}`, pct: 0 });
      alert(`Error loading browser model: ${err.message || err}`);
    }
  };

  const handleSendPrompt = async (forcedPrompt?: string) => {
    const promptToSend = forcedPrompt || inputPrompt;
    if (!promptToSend.trim() || isGenerating) return;
    if (modelMode === 'ollama' && !isConnected) return;
    if (modelMode === 'webgpu' && !isWebgpuLoaded) {
      alert('Please load the WebGPU model first before chatting.');
      return;
    }

    if (!forcedPrompt) setInputPrompt('');
    
    // Clear welcome text if present before AI processes
    if (editor) {
      const text = editor.getText().trim().replace(/\s+/g, ' ');
      if (text === 'Welcome to OpenWord Start writing your document here...') {
        editor.commands.clearContent(true);
      }
    }

    // Construct user message
    const userMsg: ExtendedMessage = { role: 'user', content: promptToSend };
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setIsGenerating(true);
    setStreamedResponse('');

    // Capture original blocks snapshot before streaming starts
    const originalBlocks = editor ? serializeEditorToBlocks(editor) : [];
    setStreamedOriginalBlocks(originalBlocks);
    setStreamedOperations([]);

    // Construct request message pipeline
    const pipeline: any[] = [];

    // Inject editor context if checked
    let blockContext = '';
    if (editor) {
      const currentBlocks = serializeEditorToBlocks(editor);
      const { from, to } = editor.state.selection;
      const hasSel = from !== to;

      blockContext = `[CURRENT DOCUMENT BLOCKS]:\n` + 
        currentBlocks.map(b => {
          let annotatedText = b.text;
          let selLabel = '';
          if (hasSel && b.start < to && b.end > from) {
            const textStart = b.start + 1;
            const selStart = Math.max(0, from - textStart);
            const selEnd = Math.min(b.text.length, to - textStart);
            if (selStart < selEnd) {
              annotatedText = b.text.slice(0, selStart) + 
                '[HIGHLIGHT_START]' + 
                b.text.slice(selStart, selEnd) + 
                '[HIGHLIGHT_END]' + 
                b.text.slice(selEnd);
              selLabel = ' [CONTAINS_HIGHLIGHT]';
            }
          }
          return `Block ${b.index} (${b.type})${selLabel}: "${annotatedText}"`;
        }).join('\n') + '\n\n';
    }

    const activeModel = modelMode === 'webgpu' ? selectedWebgpuModel : selectedModel;
    const friendlyName = getFriendlyModelName(activeModel);

    const systemPromptBase = `You are ${friendlyName}, an expert AI writing collaborator and editor. You can help the user edit their document.
You have direct, real-time access to modify the document. To perform edits, inserts, or deletes, you must output special XML tags inline within your response.

Supported tags:
1. Edit an existing block:
<edit_block index="N">new block content HTML</edit_block>
(This replaces the content of the block at index N)

2. Insert a new block:
<insert_block after="N" type="paragraph">new block content HTML</insert_block>
(This inserts a new block after the block at index N. Use type="paragraph" or type="heading". To insert at the very beginning of the document, use after="-1".)

3. Delete an existing block:
<delete_block index="N" />
(This deletes the block at index N. This is a self-closing tag and should be written exactly as shown.)

Rules:
1. Conversational text: Any text outside of these XML tags will be streamed directly into the chat bubble. Use conversational text to explain what edits you are making or to chat with the user.
2. Index references: Refer to the current document blocks list provided below to find the correct block indices.
3. HTML content: The content inside the tags must be valid HTML (e.g. paragraphs, headings) using basic formatting like <strong>, <em>, etc. if needed.
4. Output flow: You can write conversational explanations first, and then output the XML tags to perform the edits. Or you can output them in any order. The changes will type themselves out in the editor in real-time!
5. IMPORTANT: Do not use standard markdown code blocks or json blocks for operations. Use ONLY the specified XML tags for document modification.
6. CRITICAL REQUIREMENT: If the user asks you to rewrite, delete, insert, erase, clear, or modify text in the document, you MUST use the XML tags to carry out the changes. Do NOT output the new text solely in conversational form — you must wrap all document changes inside the appropriate XML tags so the document can be updated.
7. HIGHLIGHTED TEXT INSTRUCTIONS: If the user has highlighted/selected text, it will be marked inside the blocks with [HIGHLIGHT_START] and [HIGHLIGHT_END]. You must locate the block marked with [CONTAINS_HIGHLIGHT] and use <edit_block index="N"> to rewrite that block, updating the highlighted section while keeping the surrounding un-highlighted text intact.

---
EXAMPLES OF CORRECT ACTIONS:

Example 1: Edit block 1
User request: Make the first paragraph more formal.
Response: I have rewritten the first paragraph to be more formal:
<edit_block index="1">We are pleased to announce the launch of our new software platform, designed to streamline your daily editing tasks.</edit_block>

Example 2: Insert after block 0
User request: Add a subheading after block 0 about installation.
Response: Here is the installation section:
<insert_block after="0" type="heading">System Setup and Installation</insert_block>

Example 3: Delete block 2
User request: Remove the paragraph about old features.
Response: Certainly, I will delete the outdated paragraph.
<delete_block index="2" />
---`;

    if (includeContext && editor) {
      const textSelection = editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        ' '
      );

      let contextText = '';
      if (textSelection && textSelection.trim().length > 0) {
        contextText = `[User Selected Document Text]:\n"${textSelection}"\n\n`;
      } else {
        // Fallback to last 1200 characters of doc text for nearby context
        const fullText = editor.getText();
        const start = Math.max(0, fullText.length - 1200);
        contextText = `[Context of Document Draft]:\n"...${fullText.slice(start)}"\n\n`;
      }

      pipeline.push({
        role: 'system',
        content: `${systemPromptBase}\n\n${contextText}${blockContext}`
      });
    } else {
      pipeline.push({
        role: 'system',
        content: `${systemPromptBase}\n\n${blockContext}`
      });
    }

    // Append history
    pipeline.push(...currentMessages.map(m => ({ role: m.role, content: m.content })));

    // Call API with MTP settings
    const options = {
      temperature,
      draft_num_predict: enableMtp ? 4 : 0
    };

    let activeInsertionIndex: number | null = null;
    const changes: { type: 'insert' | 'delete'; originalIndex: number }[] = [];

    const getShiftedIndex = (originalIndex: number): number => {
      let shift = 0;
      for (const change of changes) {
        if (change.type === 'insert') {
          if (originalIndex >= change.originalIndex) {
            shift += 1;
          }
        } else if (change.type === 'delete') {
          if (originalIndex > change.originalIndex) {
            shift -= 1;
          }
        }
      }
      return originalIndex + shift;
    };

    const parser = new AgentStreamParser(
      (conversationalText) => {
        setStreamedResponse(conversationalText);
      },
      (event: ToolCallEvent) => {
        if (directEdit) {
          if (!editor) return;
          try {
            if (event.type === 'insert') {
              if (activeInsertionIndex === null) {
                const shiftedAfterIndex = getShiftedIndex(event.index);
                const newIndex = insertPlaceholderBlock(editor, shiftedAfterIndex, event.blockType);
                if (newIndex !== -1) {
                  activeInsertionIndex = newIndex;
                  changes.push({ type: 'insert', originalIndex: event.index });
                }
              }

              if (activeInsertionIndex !== null) {
                streamEditBlock(editor, activeInsertionIndex, event.content, event.isFinal);
              }

              if (event.isFinal) {
                activeInsertionIndex = null;
              }
            } else if (event.type === 'edit') {
              const shiftedIndex = getShiftedIndex(event.index);
              streamEditBlock(editor, shiftedIndex, event.content, event.isFinal);
            } else if (event.type === 'delete') {
              const shiftedIndex = getShiftedIndex(event.index);
              executeDeleteBlock(editor, shiftedIndex);
              changes.push({ type: 'delete', originalIndex: event.index });
            }
          } catch (err) {
            console.error('Failed to apply stream mutator action:', err);
          }
        } else {
          // Build the live streamedOperations list in real-time as the chunks arrive (Proposal Mode)
          setStreamedOperations(prev => {
            const updated = [...prev];
            
            let wrappedHtml = event.content.trim();
            if (!wrappedHtml.startsWith('<')) {
              if (event.type === 'insert') {
                const tag = event.blockType === 'heading' ? 'h1' : 'p';
                wrappedHtml = `<${tag}>${wrappedHtml}</${tag}>`;
              } else if (event.type === 'edit') {
                const targetBlock = originalBlocks.find(b => b.index === event.index);
                const tagMatch = targetBlock?.html.trim().match(/^<([a-zA-Z0-9]+)([^>]*)>/);
                if (tagMatch) {
                  const tagName = tagMatch[1];
                  const attrs = tagMatch[2];
                  wrappedHtml = `<${tagName}${attrs}>${wrappedHtml}</${tagName}>`;
                } else {
                  wrappedHtml = `<p>${wrappedHtml}</p>`;
                }
              }
            }

            const lastOp = updated[updated.length - 1];
            if (lastOp && lastOp.type === event.type && lastOp.index === event.index) {
              updated[updated.length - 1] = {
                ...lastOp,
                html: wrappedHtml
              };
            } else {
              updated.push({
                type: event.type,
                index: event.index,
                html: event.type !== 'delete' ? wrappedHtml : undefined
              });
            }
            return updated;
          });
        }
      }
    );

    const onDoneCallback = (_doneText: string) => {
      parser.finalize();

      if (directEdit) {
        // In Direct Edit mode, edits are already applied directly in real-time
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: parser.getConversationalText()
        }]);
      } else {
        // Convert the finalized events to BlockOperations for Proposal Mode
        const finalOps: BlockOperation[] = parser.getFinalizedEvents().map(event => {
          let wrappedHtml = event.content.trim();
          if (!wrappedHtml.startsWith('<')) {
            if (event.type === 'insert') {
              const tag = event.blockType === 'heading' ? 'h1' : 'p';
              wrappedHtml = `<${tag}>${wrappedHtml}</${tag}>`;
            } else if (event.type === 'edit') {
              const targetBlock = originalBlocks.find(b => b.index === event.index);
              const tagMatch = targetBlock?.html.trim().match(/^<([a-zA-Z0-9]+)([^>]*)>/);
              if (tagMatch) {
                const tagName = tagMatch[1];
                const attrs = tagMatch[2];
                wrappedHtml = `<${tagName}${attrs}>${wrappedHtml}</${tagName}>`;
              } else {
                wrappedHtml = `<p>${wrappedHtml}</p>`;
              }
            }
          }
          return {
            type: event.type,
            index: event.index,
            html: event.type !== 'delete' ? wrappedHtml : undefined
          };
        });

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: parser.getConversationalText(),
          operations: finalOps,
          originalBlocks: originalBlocks,
          status: finalOps.length > 0 ? 'pending' : undefined
        }]);
      }
      setStreamedResponse('');
      setStreamedOperations([]);
      setIsGenerating(false);
    };

    const onErrorCallback = (err: any) => {
      console.error('AI stream error:', err);
      const friendlyError = modelMode === 'webgpu' 
        ? `❌ WebGPU error: ${err.message || err}`
        : `❌ Ollama error: Connection lost. Ensure Ollama is running and model '${selectedModel}' is available.`;
      setMessages(prev => [...prev, { role: 'assistant', content: friendlyError }]);
      setStreamedResponse('');
      setStreamedOperations([]);
      setIsGenerating(false);
    };

    if (modelMode === 'webgpu') {
      const cancel = await streamWebGPUChat(
        pipeline,
        { temperature },
        (chunk) => {
          parser.appendChunk(chunk);
        },
        onDoneCallback,
        onErrorCallback
      );
      cancelWebgpuChatRef.current = cancel;
    } else {
      const cancel = await streamOllamaChat(
        selectedModel,
        pipeline,
        options,
        (chunk) => {
          parser.appendChunk(chunk);
        },
        onDoneCallback,
        onErrorCallback
      );
      cancelStreamRef.current = cancel;
    }
  };

  const handleCancelGeneration = () => {
    if (modelMode === 'webgpu') {
      if (cancelWebgpuChatRef.current) {
        cancelWebgpuChatRef.current();
        cancelWebgpuChatRef.current = null;
        setMessages(prev => [...prev, { role: 'assistant', content: streamedResponse + ' [Generation Cancelled]' }]);
        setStreamedResponse('');
        setStreamedOperations([]);
        setIsGenerating(false);
      }
    } else {
      if (cancelStreamRef.current) {
        cancelStreamRef.current();
        cancelStreamRef.current = null;
        setMessages(prev => [...prev, { role: 'assistant', content: streamedResponse + ' [Generation Cancelled]' }]);
        setStreamedResponse('');
        setStreamedOperations([]);
        setIsGenerating(false);
      }
    }
  };

  const getSelectedText = () => {
    if (!editor) return '';
    return editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      ' '
    ).trim();
  };

  // Preset prompts
  const applyPreset = (action: string) => {
    if (!editor) return;
    const textSelection = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      ' '
    );

    if (action === 'continue') {
      handleSendPrompt('Based on the context of the document, continue writing the next paragraph seamlessly in the same voice and style.');
    } else if (action === 'rewrite') {
      if (!textSelection) {
        alert('Please highlight a block of text in your document first.');
        return;
      }
      handleSendPrompt(`Please rewrite the highlighted text (marked with [HIGHLIGHT_START] and [HIGHLIGHT_END] inside the document blocks) to make it sound more professional and clean, while maintaining its core message.`);
    } else if (action === 'shorten') {
      if (!textSelection) {
        alert('Please highlight a block of text in your document first.');
        return;
      }
      handleSendPrompt(`Summarize and condense the highlighted text (marked with [HIGHLIGHT_START] and [HIGHLIGHT_END] inside the document blocks) to make it shorter and more punchy.`);
    } else if (action === 'expand') {
      if (!textSelection) {
        alert('Please highlight a block of text in your document first.');
        return;
      }
      handleSendPrompt(`Elaborate on the highlighted text (marked with [HIGHLIGHT_START] and [HIGHLIGHT_END] inside the document blocks), adding more details, context, and arguments in the same writing style.`);
    }
  };

  // Editor placement actions
  const insertContent = (content: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(content).run();
  };

  const replaceSelection = (content: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(content).run();
  };

  const appendToDoc = (content: string) => {
    if (!editor) return;
    const currentSize = editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(currentSize, `\n\n${content}`).run();
  };

  const copyToClipboard = (content: string) => {
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        navigator.clipboard.writeText(content);
        success = true;
      } catch (err) {
        console.warn('Modern clipboard copy failed, trying fallback:', err);
      }
    }
    
    if (!success) {
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        success = document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
    
    if (success) {
      alert('Copied response to clipboard!');
    } else {
      alert('Failed to copy response. Please select the text and copy manually.');
    }
  };
  const handleClearChat = () => {
    const confirmClear = window.confirm('Are you sure you want to clear the chat history? This cannot be undone.');
    if (!confirmClear) return;

    const activeModel = modelMode === 'webgpu' ? selectedWebgpuModel : selectedModel;
    const friendlyName = getFriendlyModelName(activeModel);
    
    const defaultGreeting: ExtendedMessage[] = [
      { 
        role: 'assistant', 
        content: `Hello! I am ${friendlyName}, your offline AI co-writer. How can I help you write or edit your document today?` 
      }
    ];

    setMessages(defaultGreeting);
    localStorage.setItem('openword_copilot_messages', JSON.stringify(defaultGreeting));
  };

  return (
    <div className="copilot-panel">
      {/* Connection Header */}
      <div className="copilot-status-bar">
        <div className="status-indicator-wrapper">
          <span className={`status-led ${
            modelMode === 'webgpu' 
              ? (isWebgpuLoaded ? 'active' : isWebgpuLoading ? 'checking' : 'inactive') 
              : (isConnected ? 'active' : isChecking ? 'checking' : 'inactive')
          }`} />
          <select 
            className="copilot-mode-select"
            value={modelMode}
            onChange={(e) => setModelMode(e.target.value as 'ollama' | 'webgpu')}
          >
            <option value="ollama">Ollama (Daemon)</option>
            <option value="webgpu">WebGPU (Browser)</option>
          </select>
        </div>
        
        {modelMode === 'webgpu' ? (
          isWebGPUAvailable ? (
            <div className="status-model-row">
              <select 
                className="copilot-model-select"
                value={selectedWebgpuModel}
                onChange={(e) => {
                  setSelectedWebgpuModel(e.target.value);
                  setIsWebgpuLoaded(isEngineLoaded(e.target.value));
                }}
                disabled={isWebgpuLoading}
              >
                {webgpuModels.map(m => (
                  <option key={m.model_id} value={m.model_id}>
                    {m.name} ({m.size})
                  </option>
                ))}
                <option value="custom">Custom MLC Model...</option>
              </select>
              
              <button 
                onClick={handleLoadWebgpuModel}
                className={`webgpu-action-btn ${isWebgpuLoaded ? 'loaded' : ''}`}
                disabled={isWebgpuLoading || (selectedWebgpuModel !== 'custom' && isWebgpuLoaded)}
                title={isWebgpuLoaded ? "Model loaded and active" : "Load model weights into browser"}
              >
                {isWebgpuLoading ? (
                  <RefreshCw size={11} className="spinning" />
                ) : isWebgpuLoaded ? (
                  <Sparkles size={11} />
                ) : (
                  <Download size={11} />
                )}
              </button>

              <button 
                onClick={handleClearChat} 
                className="copilot-clear-chat-btn" 
                title="Clear Chat History"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ) : (
            <div className="status-model-row">
              <span className="unsupported-tag">Unsupported</span>
              <button 
                onClick={handleClearChat} 
                className="copilot-clear-chat-btn" 
                title="Clear Chat History"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        ) : (
          isConnected ? (
            <div className="status-model-row">
              <select 
                className="copilot-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map(m => <option key={m} value={m}>{m}</option>)}
                {models.length === 0 && <option value="gemma4:2b">gemma4:2b</option>}
              </select>
              <button 
                className={`copilot-download-toggle-btn ${showDownloader ? 'active' : ''}`}
                onClick={() => setShowDownloader(!showDownloader)}
                title="Download new models"
              >
                <Download size={13} />
              </button>
              <button 
                onClick={handleClearChat} 
                className="copilot-clear-chat-btn" 
                title="Clear Chat History"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ) : (
            <div className="status-model-row">
              <button onClick={runConnectionCheck} className="copilot-refresh-btn" title="Retry Check">
                <RefreshCw size={13} className={isChecking ? 'spinning' : ''} />
              </button>
              <button 
                onClick={handleClearChat} 
                className="copilot-clear-chat-btn" 
                title="Clear Chat History"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        )}
      </div>

      {/* WebGPU Loading Progress Card */}
      {modelMode === 'webgpu' && webgpuLoadProgress && (
        <div className="webgpu-loading-overlay">
          <div className="webgpu-load-progress-card">
            <div className="downloader-header">
              <RefreshCw size={14} className="downloader-header-icon spinning" />
              <span>Caching Browser Model...</span>
            </div>
            <div className="downloader-body">
              <p className="webgpu-load-tip">
                Caching model parameters directly into your browser storage. The first run takes a moment to download. Future loads are instantaneous.
              </p>
              
              <div className="pull-progress-panel">
                <div className="pull-status-row">
                  <span className="pull-status-text">{webgpuLoadProgress.text}</span>
                  <span className="pull-percentage-text">{webgpuLoadProgress.pct}%</span>
                </div>
                
                <div className="pull-progress-bar-bg">
                  <div 
                    className="pull-progress-bar-fill"
                    style={{ width: `${webgpuLoadProgress.pct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WebGPU Custom Settings Drawer */}
      {modelMode === 'webgpu' && selectedWebgpuModel === 'custom' && !isWebgpuLoaded && (
        <div className="model-downloader-card custom-webgpu-config animate-slide-down">
          <div className="downloader-header">
            <Settings size={14} className="downloader-header-icon" />
            <span>Custom WebGPU Configuration</span>
          </div>
          <div className="downloader-body">
            <div className="downloader-field-group">
              <label className="downloader-label">Hugging Face Weights URL:</label>
              <input 
                type="text"
                placeholder="e.g. https://huggingface.co/mlc-ai/gemma-2-2b-it-q4f16_1-MLC"
                value={customWebgpuWeight}
                onChange={(e) => setCustomWebgpuWeight(e.target.value)}
                className="downloader-text-input"
              />
            </div>
            <div className="downloader-field-group">
              <label className="downloader-label">WASM Library URL (.wasm):</label>
              <input 
                type="text"
                placeholder="e.g. https://raw.githubusercontent.com/.../gemma-2-2b-it-q4f16_1-webgpu.wasm"
                value={customWebgpuLib}
                onChange={(e) => setCustomWebgpuLib(e.target.value)}
                className="downloader-text-input"
              />
            </div>
          </div>
        </div>
      )}

      {/* WebGPU Unsupported Alert Card */}
      {modelMode === 'webgpu' && !isWebGPUAvailable && (
        <div className="copilot-connection-alert webgpu-unsupported-alert">
          <AlertCircle className="alert-icon" size={18} />
          <div className="alert-body">
            <h4>WebGPU Unsupported</h4>
            <p>
              Your browser or hardware does not support WebGPU acceleration. To run models locally in your browser:
            </p>
            <ol className="step-list">
              <li>Use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> (113+).</li>
              <li>Ensure hardware acceleration is enabled in browser settings.</li>
              <li>Or toggle back to <strong>Ollama (Daemon)</strong> mode above if you have Ollama installed.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Mobile WebGPU memory warning card */}
      {modelMode === 'webgpu' && isMobile && isWebGPUAvailable && (
        <div className="copilot-connection-alert webgpu-mobile-warning">
          <AlertCircle className="alert-icon" size={18} />
          <div className="alert-body">
            <h4>Mobile Browser Warning</h4>
            <p>
              Running local WebGPU engines inside mobile browsers is resource-intensive and may trigger memory-limit page crashes (tab reload). For a smooth co-writing experience on mobile devices, connect via remote Ollama endpoints or cloud models.
            </p>
          </div>
        </div>
      )}

      {/* Model Downloader Card */}
      {isConnected && showDownloader && (
        <div className="model-downloader-card">
          <div className="downloader-header">
            <Sparkles size={14} className="downloader-header-icon" />
            <span>Download Offline Models</span>
            <button onClick={() => setShowDownloader(false)} className="downloader-close" disabled={isPulling}>
              <X size={14} />
            </button>
          </div>
          
          <div className="downloader-body">
            <div className="downloader-field-group">
              <label className="downloader-label">Select standard model:</label>
              <select 
                value={downloadModelName}
                onChange={(e) => {
                  setDownloadModelName(e.target.value);
                  setCustomModelName('');
                }}
                className="downloader-select"
                disabled={isPulling}
              >
                <option value="gemma2:2b">Gemma 2 2B (2.0 GB - Recommended for integrated GPUs)</option>
                <option value="llama3.2:3b">Llama 3.2 3B (2.0 GB - Excellent general writer)</option>
                <option value="llama3.2:1b">Llama 3.2 1B (1.3 GB - Ultra lightweight)</option>
                <option value="qwen2.5-coder:7b">Qwen 2.5 Coder 7B (4.7 GB - Best for editing)</option>
                <option value="gemma2:9b">Gemma 2 9B (5.5 GB - Smart, needs GPU)</option>
                <option value="custom">Custom model tag...</option>
              </select>
            </div>

            {downloadModelName === 'custom' && (
              <div className="downloader-field-group animate-slide-down">
                <label className="downloader-label">Enter Ollama tag name:</label>
                <input 
                  type="text" 
                  placeholder="e.g., mistral:latest, phi3:3.8b"
                  value={customModelName}
                  onChange={(e) => setCustomModelName(e.target.value)}
                  className="downloader-text-input"
                  disabled={isPulling}
                />
                <small className="downloader-help-link">
                  Browse models on the <a href="https://ollama.com/library" target="_blank" rel="noreferrer">Ollama Library</a>
                </small>
              </div>
            )}

            {/* Pull Progress indicator */}
            {pullProgress && (
              <div className="pull-progress-panel">
                <div className="pull-status-row">
                  <span className="pull-status-text">
                    {pullProgress.status}
                    {pullProgress.digest && ` [${pullProgress.digest.slice(0, 7)}]`}
                  </span>
                  {pullPercentage > 0 && <span className="pull-percentage-text">{pullPercentage}%</span>}
                </div>
                
                <div className="pull-progress-bar-bg">
                  <div 
                    className="pull-progress-bar-fill"
                    style={{ width: `${pullPercentage}%` }}
                  />
                </div>
                
                {pullProgress.total && pullProgress.completed && (
                  <div className="pull-bytes-row">
                    <span>{(pullProgress.completed / 1024 / 1024).toFixed(1)} MB / {(pullProgress.total / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                )}
              </div>
            )}

            <div className="downloader-actions">
              {isPulling ? (
                <button onClick={handleCancelPull} className="btn-downloader-cancel">
                  Cancel Download
                </button>
              ) : (
                <button 
                  onClick={handleStartPull} 
                  className="btn-downloader-start"
                  disabled={downloadModelName === 'custom' && !customModelName.trim()}
                >
                  Start Download
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connection Troubleshooting card */}
      {!isConnected && !isChecking && (
        <div className="copilot-connection-alert">
          <AlertCircle className="alert-icon" size={18} />
          <div className="alert-body">
            <h4>Local LLM Client Off</h4>
            <p>Ollama was not detected running on port 11434.</p>
            <div className="alert-actions flex-wrap">
              {isControlApiAvailable ? (
                <button 
                  onClick={handleLaunchOllama} 
                  className="btn-alert-primary"
                  disabled={isLaunching}
                >
                  {isLaunching ? 'Spawning Daemon...' : 'Launch Ollama'}
                </button>
              ) : (
                <div className="manual-launch-tip">
                  <small>💡 Open Ollama on your computer to connect</small>
                </div>
              )}
              <button 
                onClick={() => {
                  setDownloadStarted(false);
                  setShowInstallModal(true);
                }} 
                className="btn-alert-secondary"
                title="Download and installation help"
              >
                Install Assistant
              </button>
            </div>
            <div className="cors-instruction">
              <small>Ensure CORS is enabled by setting environment variable:</small>
              <code>$env:OLLAMA_ORIGINS="*"</code>
            </div>
          </div>
        </div>
      )}

      {/* GPU / VRAM Recommendations Badge */}
      {isConnected && hardware && showHardwareTip && (
        <div className="hardware-badge-card">
          <div className="hw-header">
            <Cpu size={14} className="hw-icon" />
            <span>Hardware detected</span>
            <button onClick={() => setShowHardwareTip(false)} className="hw-close">×</button>
          </div>
          <p className="hw-info"><strong>GPU:</strong> {hardware.gpuName} (~{hardware.estimatedVramGb}GB VRAM)</p>
          <p className="hw-recommend"><strong>Recommendation:</strong> Use <code>{hardware.recommendedModel}</code>. {hardware.reason}</p>
          {!(models.includes(hardware.recommendedModel) || models.some(m => m.startsWith(hardware.recommendedModel))) && (
            <button 
              onClick={() => {
                setDownloadModelName('custom');
                setCustomModelName(hardware.recommendedModel);
                setShowDownloader(true);
              }}
              className="hw-download-btn"
              disabled={isPulling}
            >
              <Download size={11} />
              <span>Download Recommended Model</span>
            </button>
          )}
        </div>
      )}

      {/* Edit Mode Tabs */}
      <div className="copilot-mode-tabs">
        <button 
          className={`mode-tab-btn ${!directEdit ? 'active' : ''}`}
          onClick={() => setDirectEdit(false)}
          title="Review AI suggestions in a sidebar diff card before applying them"
        >
          <Sparkles size={13} className="tab-icon" />
          <span>Proposal Mode</span>
        </button>
        <button 
          className={`mode-tab-btn ${directEdit ? 'active' : ''}`}
          onClick={() => setDirectEdit(true)}
          title="Let the AI stream edits directly into your document in real-time"
        >
          <RefreshCw size={13} className="tab-icon" />
          <span>Direct Edit</span>
        </button>
      </div>

      {/* Main Chat Feed */}
      <div className="copilot-chat-feed">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble-row ${msg.role}`}>
            <div className="bubble-avatar">
              {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
            </div>
            <div className="bubble-content-card">
              <div className="bubble-text">{msg.content}</div>
              
              {/* Render Diff Card if this message contains proposed operations */}
              {msg.operations && msg.operations.length > 0 && (
                <CopilotDiffCard
                  editor={editor}
                  operations={msg.operations}
                  originalBlocks={msg.originalBlocks || []}
                  status={msg.status || 'pending'}
                  onStatusChange={(newStatus) => {
                    setMessages(prev => {
                      const updated = [...prev];
                      updated[i] = { ...updated[i], status: newStatus };
                      return updated;
                    });
                  }}
                />
              )}

              {/* Insert controls for assistant messages (only if no structured operations are present) */}
              {msg.role === 'assistant' && i > 0 && !msg.operations && (
                <div className="bubble-action-bar">
                  <button onClick={() => insertContent(msg.content)} className="bubble-action-btn" title="Insert at Cursor">
                    <CornerDownLeft size={12} />
                    <span>Insert</span>
                  </button>
                  {hasSelection && (
                    <button onClick={() => replaceSelection(msg.content)} className="bubble-action-btn" title="Replace Selection">
                      <FileText size={12} />
                      <span>Replace</span>
                    </button>
                  )}
                  <button onClick={() => appendToDoc(msg.content)} className="bubble-action-btn" title="Append to End">
                    <span>Append</span>
                  </button>
                  <button onClick={() => copyToClipboard(msg.content)} className="bubble-action-btn" title="Copy to Clipboard">
                    <Clipboard size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Live streaming text bubble */}
        {isGenerating && (streamedResponse || streamedOperations.length > 0) && (
          <div className="chat-bubble-row assistant streaming">
            <div className="bubble-avatar">
              <Bot size={14} className="spinning" />
            </div>
            <div className="bubble-content-card">
              {streamedResponse && <div className="bubble-text">{streamedResponse}</div>}
              
              {streamedOperations.length > 0 && (
                <CopilotDiffCard
                  editor={editor}
                  operations={streamedOperations}
                  originalBlocks={streamedOriginalBlocks}
                  status="pending"
                  onStatusChange={() => {}}
                  readOnly={true}
                />
              )}

              <div className="streaming-actions">
                <button onClick={handleCancelGeneration} className="btn-cancel-gen">Stop Generating</button>
              </div>
            </div>
          </div>
        )}
        <div ref={feedEndRef} />
      </div>

      {/* AI Controls Drawer */}
      <div className="copilot-controls-panel">
        <button 
          className="controls-toggle-btn"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings size={13} />
          <span>Inference Parameters</span>
          <span className="toggle-indicator">{showSettings ? '▲' : '▼'}</span>
        </button>

        {showSettings && (
          <div className="controls-drawer">
            {/* Speculative Decoding (MTP) */}
            <div className="control-row">
              <div className="control-label-col">
                <span className="control-title">{getFriendlyModelName(selectedModel)} MTP Decoding</span>
                <span className="control-desc">Accelerate token speeds ~3x using drafter tensors</span>
              </div>
              <button 
                onClick={() => setEnableMtp(!enableMtp)} 
                className="control-toggle-switch"
                title="Toggle MTP Speculative Decoding"
              >
                {enableMtp ? <ToggleRight className="toggle-icon active" size={26} /> : <ToggleLeft className="toggle-icon" size={26} />}
              </button>
            </div>

            {/* Temperature Slider */}
            <div className="control-row">
              <div className="control-label-col">
                <span className="control-title">Creativity (Temp): {temperature}</span>
                <span className="control-desc">Higher values make writing more creative</span>
              </div>
              <input 
                type="range" 
                min="0.1" 
                max="1.0" 
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="control-slider" 
              />
            </div>

            {/* Document Context Toggle */}
            <div className="control-row">
              <div className="control-label-col">
                <span className="control-title">Feed Document context</span>
                <span className="control-desc">Analyze surrounding paragraphs for context</span>
              </div>
              <button 
                onClick={() => setIncludeContext(!includeContext)} 
                className="control-toggle-switch"
              >
                {includeContext ? <ToggleRight className="toggle-icon active" size={26} /> : <ToggleLeft className="toggle-icon" size={26} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editor Shortcuts Section */}
      {isConnected && (
        <div className="copilot-editor-shortcuts">
          <button onClick={() => applyPreset('continue')} className="shortcut-tag-btn">
            <Sparkles size={11} />
            <span>Continue Writing</span>
          </button>
          <button 
            onClick={() => applyPreset('rewrite')} 
            className={`shortcut-tag-btn ${!hasSelection ? 'disabled' : ''}`}
            title={!hasSelection ? 'Select text in document first' : ''}
          >
            <span>Rewrite selection</span>
          </button>
          <button 
            onClick={() => applyPreset('shorten')} 
            className={`shortcut-tag-btn ${!hasSelection ? 'disabled' : ''}`}
            title={!hasSelection ? 'Select text in document first' : ''}
          >
            <span>Shorten</span>
          </button>
          <button 
            onClick={() => applyPreset('expand')} 
            className={`shortcut-tag-btn ${!hasSelection ? 'disabled' : ''}`}
            title={!hasSelection ? 'Select text in document first' : ''}
          >
            <span>Expand</span>
          </button>
        </div>
      )}

      {/* Selected Text Preview */}
      {hasSelection && (
        <div className="copilot-selected-text-preview">
          <div className="preview-header">
            <span className="preview-title">
              <Sparkles size={10} style={{ marginRight: '4px', color: 'var(--accent-color, #0078d4)', display: 'inline-block', verticalAlign: 'middle' }} />
              Active Selection
            </span>
            <button 
              className="preview-close-btn"
              onClick={() => {
                if (editor) {
                  const { to } = editor.state.selection;
                  editor.chain().focus().setTextSelection(to).run();
                }
              }}
              title="Clear selection"
            >
              <X size={10} />
            </button>
          </div>
          <div className="preview-text">
            "{getSelectedText()}"
          </div>
        </div>
      )}

      {/* Prompt input Form */}
      <div className="copilot-input-area">
        <textarea
          className="copilot-input-field"
          placeholder={
            modelMode === 'webgpu'
              ? (isWebgpuLoaded ? `Ask ${getFriendlyModelName(selectedWebgpuModel)} to rewrite, write a chapter, or format...` : "Load WebGPU model above to begin")
              : (isConnected ? `Ask ${getFriendlyModelName(selectedModel)} to rewrite, write a chapter, or format...` : "Ollama offline - launch service above")
          }
          disabled={
            isGenerating ||
            (modelMode === 'ollama' && !isConnected) ||
            (modelMode === 'webgpu' && !isWebgpuLoaded)
          }
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendPrompt();
            }
          }}
        />
        <button 
          onClick={() => handleSendPrompt()} 
          className="copilot-send-btn"
          disabled={
            isGenerating ||
            !inputPrompt.trim() ||
            (modelMode === 'ollama' && !isConnected) ||
            (modelMode === 'webgpu' && !isWebgpuLoaded)
          }
          title="Send message"
        >
          <Send size={15} />
        </button>
      </div>

      {/* 5. Glassmorphic Ollama Installation Assistant Modal */}
      {showInstallModal && (
        <div className="install-modal-backdrop" onClick={() => setShowInstallModal(false)}>
          <div className="install-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="install-modal-header">
              <Sparkles className="install-modal-icon animate-pulse" size={20} />
              <h3>Ollama Installation Assistant</h3>
              <button className="install-modal-close" onClick={() => setShowInstallModal(false)}>×</button>
            </div>
            
            <div className="install-modal-body">
              <p className="install-intro-text">
                Ollama allows you to run models like {getFriendlyModelName(selectedModel)} completely offline on your own machine. We detected your system configuration.
              </p>

              {/* OS Selection Tabs */}
              <div className="os-tabs">
                <button 
                  className={`os-tab-btn ${selectedOS === 'Windows' ? 'active' : ''}`}
                  onClick={() => setSelectedOS('Windows')}
                >
                  Windows
                </button>
                <button 
                  className={`os-tab-btn ${selectedOS === 'macOS' ? 'active' : ''}`}
                  onClick={() => setSelectedOS('macOS')}
                >
                  macOS
                </button>
                <button 
                  className={`os-tab-btn ${selectedOS === 'Linux' ? 'active' : ''}`}
                  onClick={() => setSelectedOS('Linux')}
                >
                  Linux
                </button>
              </div>

              {/* OS Content details */}
              <div className="os-install-content">
                <div className="detected-badge">
                  <span>Detected Platform:</span> 
                  <strong className="detected-tag">{detectedOS?.osName || 'Unknown'}</strong>
                  {detectedOS?.osName === selectedOS && <span className="recommended-badge">Recommended</span>}
                </div>

                {downloadStarted && (
                  <div className="download-started-alert">
                    <span>📥 <strong>Download triggered!</strong> Your browser is downloading the installer package directly. Please check your browser's download manager/icon to run the setup file.</span>
                  </div>
                )}

                <div className="install-instructions">
                  {selectedOS === 'Windows' && (
                    <div className="instruction-pane">
                      <ol className="step-list">
                        <li>Download the official Windows installer.</li>
                        <li>Run the <code>OllamaSetup.exe</code> file.</li>
                        <li>Verify Ollama is active by checking for the logo icon in your system tray.</li>
                      </ol>
                      <a 
                        href="https://ollama.com/download/OllamaSetup.exe" 
                        onClick={() => setDownloadStarted(true)}
                        className="btn-download-action"
                      >
                        Download Ollama for Windows
                      </a>
                    </div>
                  )}

                  {selectedOS === 'macOS' && (
                    <div className="instruction-pane">
                      <ol className="step-list">
                        <li>Download the official macOS app installer.</li>
                        <li>Open the <code>Ollama.dmg</code> file and drag the <code>Ollama</code> app into your <strong>Applications</strong> directory.</li>
                        <li>Run Ollama to complete configuration and open access points.</li>
                      </ol>
                      <a 
                        href="https://ollama.com/download/Ollama.dmg" 
                        onClick={() => setDownloadStarted(true)}
                        className="btn-download-action"
                      >
                        Download Ollama for macOS
                      </a>
                    </div>
                  )}

                  {selectedOS === 'Linux' && (
                    <div className="instruction-pane">
                      <ol className="step-list">
                        <li>Open a terminal shell.</li>
                        <li>Run the official installation script using the command below:</li>
                      </ol>
                      
                      <div className="terminal-command-box">
                        <code>curl -fsSL https://ollama.com/install.sh | sh</code>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText('curl -fsSL https://ollama.com/install.sh | sh');
                            alert('Command copied to clipboard!');
                          }} 
                          className="btn-copy-command"
                          title="Copy command to clipboard"
                        >
                          Copy
                        </button>
                      </div>
                      
                      <a 
                        href="https://ollama.com/download/linux" 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn-download-action secondary-style"
                      >
                        Visit Linux Instructions
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="install-modal-footer">
              <span className="cors-note">
                ⚠️ Note: Set environment variable <code>OLLAMA_ORIGINS="*"</code> to allow browser web apps to connect.
              </span>
              <button className="btn-close-modal" onClick={() => setShowInstallModal(false)}>Close Assistant</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
