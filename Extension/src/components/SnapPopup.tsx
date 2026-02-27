import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Info,
  Maximize2,
  Type,
  BookOpen,
  Contrast,
  Eye,
  Minus,
  Settings,
  Volume2,
  MessageSquare,
  Send,
  Mic,
  Languages,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Switch } from './ui/switch';
import { AccessibilityDropdown } from './ui/AccessibilityDropdown';

type View = 'chat' | 'ai' | 'tools-plus';

const sendMessage = (msg: any): Promise<any> =>
  new Promise(r => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(msg, res => r(res));
    } else {
      // Dev preview mode — mock response
      r({ settings: {} });
    }
  });

export function SnapPopup() {
  const [currentView, setCurrentView] = useState<View>('ai');
  const [mode, setMode] = useState<'popup' | 'toolbar'>('popup');
  const [language, setLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('hi');
  const [features, setFeatures] = useState({
    readAloud: false,
    easyRead: false,
    dyslexiaFont: false,
    highContrast: false,
    focusMode: false,
    readingRuler: false,
  });

  useEffect(() => {
    sendMessage({ type: 'getSettings' }).then((res: any) => {
      if (!res?.settings) return;
      const s = res.settings;
      setLanguage(s.language || 'en');
      setTargetLanguage(s.targetLanguage || 'hi');
      setMode(s.uiMode || 'popup');
      setFeatures({
        readAloud: !!s.readAloud,
        easyRead: !!s.easyRead,
        dyslexiaFont: !!s.dyslexiaFont,
        highContrast: !!s.highContrast,
        focusMode: !!s.focusMode,
        readingRuler: !!s.readingRuler,
      });
    });
  }, []);

  const updateSetting = (key: string, value: any) => {
    setFeatures(prev => ({ ...prev, [key]: value }));
    sendMessage({ type: 'setSettings', patch: { [key]: value } });
  };

  const handleAIAction = (actionType: string) => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['content/content-script.js'] },
        () => {
          chrome.tabs.sendMessage(tabId, {
            type: 'aiProxy',
            actionType,
            payload: { lang: targetLanguage },
          });
        }
      );
    });
  };

  const handleOverlay = (closePopup = false) => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['content/content-script.js'] },
        () => {
          chrome.tabs.sendMessage(tabId, { type: 'toggleOverlay' });
          if (closePopup) setTimeout(() => window.close(), 150);
        }
      );
    });
  };

  const tabs: { id: View; icon: React.ReactNode; label: string }[] = [
    { id: 'chat', icon: <MessageSquare size={16} />, label: 'Chat Assistant' },
    { id: 'ai', icon: <Sparkles size={16} />, label: 'Smart Tools' },
    { id: 'tools-plus', icon: <Settings size={16} />, label: 'Accessibility' },
  ];

  return (
    <div className="w-[380px] h-[600px] bg-zinc-50 flex flex-col overflow-hidden shadow-2xl rounded-2xl border border-zinc-200 font-sans">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-zinc-100 px-5 py-4 shrink-0 relative z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg select-none" style={{ backgroundColor: 'var(--snap-primary)', boxShadow: '0 10px 15px -3px var(--snap-primary-ring)' }}>
              S
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 tracking-tight leading-none">SNAP</h1>
              <p className="text-[10px] font-medium uppercase tracking-wider mt-0.5" style={{ color: 'var(--snap-primary)' }}>Smart Accessibility</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={language}
              onValueChange={val => {
                setLanguage(val);
                sendMessage({ type: 'setSettings', patch: { language: val } });
              }}
            >
              <SelectTrigger className="w-[110px] h-8 text-xs font-medium border-zinc-200 bg-zinc-50/50 rounded-lg hover:bg-zinc-100 transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">Hindi</SelectItem>
                <SelectItem value="kn">Kannada</SelectItem>
              </SelectContent>
            </Select>
            <AccessibilityDropdown />
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors bg-zinc-50/50 border border-zinc-200"
              title="More Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-zinc-100/80 p-1.5 rounded-xl">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setCurrentView(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[11px] font-bold transition-all duration-200 ${
                currentView === tab.id
                  ? 'bg-white shadow-sm scale-[1.02]'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/50'
              }`}
              style={currentView === tab.id ? { color: 'var(--snap-primary)' } : undefined}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 bg-zinc-50/50">
        {currentView === 'chat' && <ChatView />}
        {currentView === 'ai' && (
          <AIToolsView
            targetLanguage={targetLanguage}
            setTargetLanguage={setTargetLanguage}
            onAction={handleAIAction}
            onOverlay={handleOverlay}
          />
        )}
        {currentView === 'tools-plus' && (
          <ToolsPlusView features={features} updateSetting={updateSetting} />
        )}
      </div>

      {/* ── Footer / mode switch ────────────────────────────── */}
      <div className="p-4 bg-white border-t border-zinc-100 shrink-0">
        <div className="bg-zinc-100/80 rounded-xl p-1 flex gap-1">
          <button
            onClick={() => {
               setMode('popup');
               sendMessage({ type: 'setSettings', patch: { uiMode: 'popup' } });
               // Close any active overlay on the page
               if (typeof chrome !== 'undefined' && chrome.tabs) {
                 chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                   const tabId = tabs[0]?.id;
                   if (tabId) {
                     chrome.tabs.sendMessage(tabId, { type: 'closeOverlay' });
                   }
                 });
               }
            }}
            className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all duration-200 ${
              mode === 'popup'
                ? 'bg-white shadow-sm'
                : 'text-zinc-500 hover:bg-white/50'
            }`}
            style={mode === 'popup' ? { color: 'var(--snap-primary)' } : undefined}
          >
            Popup Mode
          </button>
          <button
            onClick={() => {
              setMode('toolbar');
              sendMessage({ type: 'setSettings', patch: { uiMode: 'toolbar' } });
              handleOverlay(true); // Launch overlay, then close popup after message is sent
            }}
            className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all duration-200 ${
              mode === 'toolbar'
                ? 'bg-white shadow-sm'
                : 'text-zinc-500 hover:bg-white/50'
            }`}
            style={mode === 'toolbar' ? { color: 'var(--snap-primary)' } : undefined}
          >
            Overlay Mode
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Chat Tab ──────────────────────────────── */
function ChatView() {
  const [messages, setMessages] = useState<
    { text: string; sender: 'user' | 'bot' | 'error' }[]
  >([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const doSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { text, sender: 'user' }]);
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'QA', prompt: text, forceProvider: 'local' }),
      });
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { text: data.ok ? data.output : data.error ?? 'Unknown error', sender: data.ok ? 'bot' : 'error' },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { text: 'Connection failed. Is Gateway running?', sender: 'error' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm overflow-hidden border border-zinc-200">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4 bg-zinc-50/30">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 select-none animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 ring-1" style={{ backgroundColor: 'var(--snap-primary-light)', ringColor: 'var(--snap-primary-ring)' }}>
              <MessageSquare size={32} style={{ color: 'var(--snap-primary)', opacity: 0.8 }} strokeWidth={1.5} />
            </div>
            <h3 className="text-zinc-800 font-bold mb-1">SNAP Assistant</h3>
            <p className="text-xs text-zinc-500 max-w-[200px] leading-relaxed">
              Ask questions about the current page or request summaries. I'm here to help!
            </p>
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                m.sender === 'user'
                  ? 'snap-chat-user rounded-tr-sm font-medium'
                  : m.sender === 'error'
                  ? 'snap-chat-error border rounded-tl-sm'
                  : 'snap-chat-bot border rounded-tl-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-in fade-in duration-300">
            <div className="bg-white border border-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ backgroundColor: 'var(--snap-primary)' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ backgroundColor: 'var(--snap-primary)' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--snap-primary)' }} />
              </div>
              <span className="text-xs font-medium text-zinc-400 ml-1">Thinking</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="p-3 bg-white border-t border-zinc-100">
        <div className="flex gap-2 items-center bg-zinc-50 rounded-xl p-1.5 border border-zinc-200 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
          <button className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 transition-all" title="Voice input" style={{ '--hover-color': 'var(--snap-primary)' } as React.CSSProperties}>
            <Mic size={18} />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSend()}
            placeholder="Ask something..."
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none min-w-0"
          />
          <button
            onClick={doSend}
            disabled={!input.trim()}
            className="p-2 text-white rounded-lg disabled:opacity-50 transition-all shadow-sm active:scale-95 snap-btn-primary"
            title="Send message"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── AI Tools Tab ───────────────────────────── */
function AIToolsView({
  targetLanguage,
  setTargetLanguage,
  onAction,
}: {
  targetLanguage: string;
  setTargetLanguage: (v: string) => void;
  onAction: (type: string) => void;
  onOverlay: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* AI actions card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--snap-primary-light)', color: 'var(--snap-primary)' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Content Intelligence</h2>
            <p className="text-[10px] text-zinc-400 font-medium">Simplify & understand webpage content</p>
          </div>
        </div>
        
        <div className="space-y-3">
          <button
            onClick={() => onAction('simplify')}
            className="relative w-full h-14 group rounded-xl p-[1px] shadow-lg transition-all active:scale-[0.98] snap-btn-primary"
            style={{ boxShadow: '0 10px 15px -3px var(--snap-primary-ring)' }}
          >
             <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
             <div className="h-full w-full bg-white/0 flex items-center px-4 rounded-xl gap-3">
               <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white backdrop-blur-sm">
                 <Sparkles size={16} fill="white" />
               </div>
               <div className="flex flex-col items-start">
                 <span className="text-white font-bold text-sm leading-none mb-0.5">Simplify Selection</span>
                 <span className="text-white/70 text-[10px] font-medium">Rewrite complex text simply</span>
               </div>
             </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            {[
              { action: 'explain', icon: <Info size={18} />, label: 'Explain', desc: 'Detailed analysis' },
              { action: 'expand', icon: <Maximize2 size={18} />, label: 'Expand', desc: 'Add context' },
            ].map(({ action, icon, label, desc }) => (
              <button
                key={action}
                onClick={() => onAction(action)}
                className="group flex flex-col items-start p-3 bg-zinc-50 border border-zinc-100 rounded-xl hover:bg-white hover:border-emerald-200 hover:shadow-md hover:shadow-emerald-500/5 transition-all text-left space-y-2 h-24"
              >
                <div className="p-2 bg-white rounded-lg border border-zinc-100 text-zinc-600 group-hover:text-emerald-600 group-hover:border-emerald-100 transition-colors">
                  {icon}
                </div>
                <div>
                  <span className="block text-xs font-bold text-zinc-800 group-hover:text-emerald-800">{label}</span>
                  <span className="block text-[10px] text-zinc-400 group-hover:text-emerald-600/70">{desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Translation card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--snap-info-light)', color: 'var(--snap-info)' }}>
            <Languages size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Rapid Translation</h2>
            <p className="text-[10px] text-zinc-400 font-medium">Instant text localization</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Select value={targetLanguage} onValueChange={setTargetLanguage}>
            <SelectTrigger className="flex-1 h-11 border-zinc-200 bg-zinc-50 text-sm font-medium rounded-xl hover:bg-white hover:border-blue-200 transition-all">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hi">Hindi (हिंदी)</SelectItem>
              <SelectItem value="kn">Kannada (ಕನ್ನಡ)</SelectItem>
              <SelectItem value="es">Spanish (Español)</SelectItem>
              <SelectItem value="fr">French (Français)</SelectItem>
              <SelectItem value="de">German (Deutsch)</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => onAction('translate')}
            className="px-6 h-11 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 active:scale-95 transition-all shadow-lg shadow-zinc-900/10 flex items-center gap-2"
          >
            Translate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Tools+ Tab ─────────────────────────────── */
function ToolsPlusView({
  features,
  updateSetting,
}: {
  features: {
    readAloud: boolean;
    easyRead: boolean;
    dyslexiaFont: boolean;
    highContrast: boolean;
    focusMode: boolean;
    readingRuler: boolean;
  };
  updateSetting: (key: string, val: any) => void;
}) {
  const items = [
    { id: 'readAloud', label: 'Screen Reader', desc: 'Text-to-speech engine', icon: <Volume2 size={18} />, color: 'bg-orange-50 text-orange-600 ring-orange-100' },
    { id: 'easyRead', label: 'Easy Read', desc: 'Simplified typography', icon: <Type size={18} />, color: 'bg-blue-50 text-blue-600 ring-blue-100' },
    { id: 'dyslexiaFont', label: 'OpenDyslexic', desc: 'Optimized font', icon: <BookOpen size={18} />, color: 'bg-purple-50 text-purple-600 ring-purple-100' },
    { id: 'highContrast', label: 'High Contrast', desc: 'Max visual clarity', icon: <Contrast size={18} />, color: 'bg-zinc-100 text-zinc-800 ring-zinc-200' },
    { id: 'focusMode', label: 'Focus Canvas', desc: 'Dim distractions', icon: <Eye size={18} />, color: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
    { id: 'readingRuler', label: 'Reading Ruler', desc: 'Line guide', icon: <Minus size={18} />, color: 'bg-rose-50 text-rose-600 ring-rose-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-zinc-50/50 border-b border-zinc-100 flex items-center justify-between">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <Settings size={14} />
            Accessibility Suite
          </span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--snap-primary)' }}></span>
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'var(--snap-primary)' }}></span>
          </span>
        </div>
        <div className="divide-y divide-zinc-50">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl ring-1 ring-inset ${item.color} group-hover:scale-105 transition-transform shadow-sm`}>
                  {item.icon}
                </div>
                <div>
                    <span className="block text-sm font-bold text-zinc-800">{item.label}</span>
                    <span className="block text-[10px] font-medium text-zinc-400 mt-0.5">{item.desc}</span>
                </div>
              </div>
              <Switch
                checked={(features as any)[item.id]}
                onCheckedChange={val => updateSetting(item.id, val)}
                className="snap-switch"
              />
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex flex-col items-center gap-2 pt-4 opacity-60 hover:opacity-100 transition-opacity">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Powered by</p>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-zinc-200 rounded-full shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--snap-info)' }}></span>
            <span className="text-[10px] font-mono text-zinc-600">Llama 3.2 (Fine-tuned)</span>
        </div>
      </div>
    </div>
  );
}
