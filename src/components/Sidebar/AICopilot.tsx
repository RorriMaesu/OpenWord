import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Sparkles, Send, Bot, User, Settings, RefreshCw, Cpu, 
  CornerDownLeft, FileText, Clipboard, AlertCircle, ToggleLeft, ToggleRight 
} from 'lucide-react';
import { 
  checkOllamaStatus, launchLocalOllama, fetchLocalModels, 
  streamOllamaChat, getControlApiUrl
} from '../../utils/ollama';
import type { OllamaMessage } from '../../utils/ollama';
import { detectHardware, detectOS } from '../../utils/hardware';
import type { HardwareProfile, OSDetails } from '../../utils/hardware';

interface AICopilotProps {
  editor: Editor | null;
}

export const AICopilot: React.FC<AICopilotProps> = ({ editor }) => {
  // Connection and model states
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemma4:2b');
  const [isLaunching, setIsLaunching] = useState<boolean>(false);

  // Hardware and OS states
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [showHardwareTip, setShowHardwareTip] = useState<boolean>(true);
  const [detectedOS, setDetectedOS] = useState<OSDetails | null>(null);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
  const [selectedOS, setSelectedOS] = useState<'Windows' | 'macOS' | 'Linux'>('Windows');
  const [downloadStarted, setDownloadStarted] = useState<boolean>(false);

  const [isControlApiAvailable, setIsControlApiAvailable] = useState<boolean>(false);

  // Chat settings
  const [temperature, setTemperature] = useState<number>(0.7);
  const [enableMtp, setEnableMtp] = useState<boolean>(true);
  const [includeContext, setIncludeContext] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Chat feed states
  const [messages, setMessages] = useState<OllamaMessage[]>([
    { role: 'assistant', content: 'Hello! I am Gemma, your offline AI co-writer. How can I help you write or edit your document today?' }
  ]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [streamedResponse, setStreamedResponse] = useState<string>('');
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Select text state
  const [hasSelection, setHasSelection] = useState<boolean>(false);

  // WebGL hardware check on mount
  useEffect(() => {
    const hw = detectHardware();
    setHardware(hw);
    setSelectedModel(hw.recommendedModel);

    const os = detectOS();
    setDetectedOS(os);
    setSelectedOS(os.osName);
  }, []);

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
        const hasRecommended = modelList.some(m => m.startsWith(hardware?.recommendedModel || 'gemma4'));
        if (!hasRecommended) {
          // Find any gemma model
          const gemmaModel = modelList.find(m => m.includes('gemma'));
          if (gemmaModel) {
            setSelectedModel(gemmaModel);
          } else {
            setSelectedModel(modelList[0]);
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
    const agree = window.confirm(
      "Would you like OpenWord to attempt to automatically locate and launch the local Ollama background service on your machine?"
    );
    if (!agree) return;

    setIsLaunching(true);
    const launched = await launchLocalOllama();
    if (launched) {
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
      setShowInstallModal(true);
    }
  };

  const handleSendPrompt = async (forcedPrompt?: string) => {
    const promptToSend = forcedPrompt || inputPrompt;
    if (!promptToSend.trim() || isGenerating || !isConnected) return;

    if (!forcedPrompt) setInputPrompt('');
    
    // Construct user message
    const userMsg: OllamaMessage = { role: 'user', content: promptToSend };
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setIsGenerating(true);
    setStreamedResponse('');

    // Construct request message pipeline
    const pipeline: OllamaMessage[] = [];
    
    // Inject editor context if checked
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
        content: `You are an expert AI writing collaborator and editor. Actively help the user build, refine, or format their document. Use the following context as reference:\n\n${contextText}`
      });
    } else {
      pipeline.push({
        role: 'system',
        content: 'You are an expert AI writing collaborator and editor.'
      });
    }

    // Append history
    pipeline.push(...currentMessages);

    // Call API with MTP settings
    const options = {
      temperature,
      draft_num_predict: enableMtp ? 4 : 0
    };

    const cancel = await streamOllamaChat(
      selectedModel,
      pipeline,
      options,
      (chunk) => {
        setStreamedResponse(prev => prev + chunk);
      },
      (doneText) => {
        setMessages(prev => [...prev, { role: 'assistant', content: doneText }]);
        setStreamedResponse('');
        setIsGenerating(false);
      },
      (err) => {
        console.error('Ollama Stream error:', err);
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: Connection lost or request failed. Please check that Ollama is serving ${selectedModel}.` }]);
        setIsGenerating(false);
      }
    );

    cancelStreamRef.current = cancel;
  };

  const handleCancelGeneration = () => {
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      setMessages(prev => [...prev, { role: 'assistant', content: streamedResponse + ' [Generation Cancelled]' }]);
      setStreamedResponse('');
      setIsGenerating(false);
    }
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
      handleSendPrompt(`Please rewrite the highlighted text to make it sound more professional and clean, while maintaining its core message.`);
    } else if (action === 'shorten') {
      if (!textSelection) {
        alert('Please highlight a block of text in your document first.');
        return;
      }
      handleSendPrompt(`Summarize and condense the highlighted text to make it shorter and more punchy.`);
    } else if (action === 'expand') {
      if (!textSelection) {
        alert('Please highlight a block of text in your document first.');
        return;
      }
      handleSendPrompt(`Elaborate on the highlighted text, adding more details, context, and arguments in the same writing style.`);
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
    navigator.clipboard.writeText(content);
    alert('Copied response to clipboard!');
  };

  return (
    <div className="copilot-panel">
      {/* Connection Header */}
      <div className="copilot-status-bar">
        <div className="status-indicator-wrapper">
          <span className={`status-led ${isConnected ? 'active' : isChecking ? 'checking' : 'inactive'}`} />
          <span className="status-label">
            {isConnected ? 'Ollama: Connected' : isChecking ? 'Checking System...' : 'Ollama: Off'}
          </span>
        </div>
        
        {isConnected ? (
          <select 
            className="copilot-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map(m => <option key={m} value={m}>{m}</option>)}
            {models.length === 0 && <option value="gemma4:2b">gemma4:2b</option>}
          </select>
        ) : (
          <button onClick={runConnectionCheck} className="copilot-refresh-btn" title="Retry Check">
            <RefreshCw size={13} className={isChecking ? 'spinning' : ''} />
          </button>
        )}
      </div>

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
        </div>
      )}

      {/* Main Chat Feed */}
      <div className="copilot-chat-feed">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble-row ${msg.role}`}>
            <div className="bubble-avatar">
              {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
            </div>
            <div className="bubble-content-card">
              <div className="bubble-text">{msg.content}</div>
              
              {/* Insert controls for assistant messages */}
              {msg.role === 'assistant' && i > 0 && (
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
        {isGenerating && streamedResponse && (
          <div className="chat-bubble-row assistant streaming">
            <div className="bubble-avatar">
              <Bot size={14} className="spinning" />
            </div>
            <div className="bubble-content-card">
              <div className="bubble-text">{streamedResponse}</div>
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
                <span className="control-title">Gemma 4 MTP Decoding</span>
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

      {/* Prompt input Form */}
      <div className="copilot-input-area">
        <textarea
          className="copilot-input-field"
          placeholder={isConnected ? "Ask Gemma to rewrite, write a chapter, or format..." : "Ollama offline - launch service above"}
          disabled={!isConnected || isGenerating}
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
          disabled={!isConnected || isGenerating || !inputPrompt.trim()}
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
                Ollama allows you to run models like Gemma 4 completely offline on your own machine. We detected your system configuration.
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
