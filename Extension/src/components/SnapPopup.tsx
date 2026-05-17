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
import logoSnap from '../assets/logosnap.png';

// Import Localization
import en from '../ui/i18n/en.json';
import hi from '../ui/i18n/hi.json';
import kn from '../ui/i18n/kn.json';

const translations = { en, hi, kn };

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

  // Translation Helper
  const t = (k: keyof typeof en) => {
    const lang = (features as any).language || language || 'en';
    const dict = (translations as any)[lang] || translations.en;
    return dict[k] || (translations.en as any)[k] || k;
  };

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
    // 1. Update Local State
    setFeatures(prev => ({ ...prev, [key]: value }));
    const patch = { [key]: value };


    // 2. Persist settings via Background
    sendMessage({ type: 'setSettings', patch });

    // 3. FORCE APPLY directly using scripting API (Bypass messaging issues)
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;

        // Try to notify existing content script (e.g. for Overlay UI sync)
        chrome.tabs.sendMessage(tabId, { type: 'applySettings', patch }).catch(() => {});

        chrome.scripting.executeScript({
          target: { tabId },
          // We inject a function that runs in the page context
          // This ensures the DOM is manipulated directly without waiting for message passing
          func: (featureKey: string, featureValue: boolean) => {
             // 1. Define Styles if missing
             if (!document.getElementById('snap-global-styles')) {
                const style = document.createElement('style');
                style.id = 'snap-global-styles';
                style.textContent = `
                  html.snap-easy-read * { line-height: 1.8 !important; letter-spacing: 0.5px !important; word-spacing: 2px !important; }
                  @font-face { font-family: 'OpenDyslexic'; src: url('${chrome.runtime.getURL('assets/OpenDyslexic-Regular.otf')}'); }
                  html.snap-dyslexia * { font-family: 'OpenDyslexic', 'Comic Sans MS', sans-serif !important; }
                  html.snap-contrast { filter: contrast(125%) saturate(110%) !important; background-color: #000 !important; color: #FFD700 !important; }
                  html.snap-contrast * { background-color: #000 !important; color: #FFD700 !important; border-color: #FFD700 !important; }
                  html.snap-contrast img { filter: opacity(0.8) !important; }
                  html.snap-focus *:not(.snap-focus-highlight) { opacity: 0.3 !important; transition: opacity 0.3s ease; }
                  html.snap-focus .snap-focus-highlight { opacity: 1 !important; box-shadow: 0 0 0 10000px rgba(0,0,0,0.7); position: relative; z-index: 10000; background: white; }
                  #snap-reading-ruler { position: fixed; left: 0; right: 0; height: 60px; background: rgba(255, 235, 59, 0.2); border-top: 2px solid rgba(255, 0, 0, 0.5); border-bottom: 2px solid rgba(255, 0, 0, 0.5); pointer-events: none; z-index: 2147483646; display: none; transform: translateY(-50%); }
                  html.snap-ruler #snap-reading-ruler { display: block; }
                `;
                document.head.appendChild(style);
             }
             
             // 2. Init Ruler if needed
             if (featureKey === 'readingRuler' && !document.getElementById('snap-reading-ruler')) {
                const ruler = document.createElement('div');
                ruler.id = 'snap-reading-ruler';
                document.body.appendChild(ruler);
                window.addEventListener('mousemove', (e) => {
                   if (document.documentElement.classList.contains('snap-ruler')) ruler.style.top = e.clientY + 'px';
                });
             }

             // 3. Toggle Class on HTML
             const html = document.documentElement;
             const classMap: Record<string, string> = {
               'easyRead': 'snap-easy-read',
               'dyslexiaFont': 'snap-dyslexia',
               'highContrast': 'snap-contrast',
               // 'focusMode': 'snap-focus', // Removed
               'readingRuler': 'snap-ruler'
             };

             if (featureKey === 'readAloud') {
                 if (featureValue) {
                     const selection = window.getSelection()?.toString().trim();
                     const textToRead = selection || document.body.innerText;
                     
                     if (textToRead) {
                         // Cancel any current speech
                         window.speechSynthesis.cancel();
                         
                         const utterance = new SpeechSynthesisUtterance(textToRead);
                         // Optional: Detect language or set default
                         // utterance.lang = 'en-US'; 
                         window.speechSynthesis.speak(utterance);
                     }
                 } else {
                     window.speechSynthesis.cancel();
                 }
                 return;
             }
             
             // Removed Special handling for focus mode
             /*
             if (featureKey === 'focusMode') {
                 html.classList.toggle('snap-focus', featureValue);
             } else {
             */
                 const cls = classMap[featureKey];
                 if (cls) {
                    html.classList.toggle(cls, featureValue);
                 }
             // }
             
             console.log(`[Llama-SNAP] Toggled ${featureKey} -> ${featureValue}`);
          },
          args: [key, value]
        });
      });
    }
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
    { id: 'chat', icon: <MessageSquare size={16} />, label: t('tabChat') },
    { id: 'ai', icon: <Sparkles size={16} />, label: t('tabTools') },
    { id: 'tools-plus', icon: <Settings size={16} />, label: t('tabAccess') },
  ];

  return (
    <div className="w-[380px] h-[600px] bg-zinc-50 flex flex-col overflow-hidden shadow-2xl rounded-2xl border border-zinc-200 font-sans">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-zinc-100 px-5 py-4 shrink-0 relative z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <img src={logoSnap} alt="SNAP Logo" className="w-9 h-9 rounded-xl shadow-lg select-none" style={{ objectFit: 'contain' }} />
            <div>
              <h1 className="text-lg font-bold text-zinc-900 tracking-tight leading-none">Llama-SNAP</h1>
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
              className="h-8 px-2.5 flex items-center justify-center gap-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors bg-zinc-50/50 border border-zinc-200 ml-1"
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
        {currentView === 'chat' && <ChatView t={t} />}
        {currentView === 'ai' && (
          <AIToolsView
            t={t}
            targetLanguage={targetLanguage}
            setTargetLanguage={setTargetLanguage}
            onAction={handleAIAction}
            onOverlay={handleOverlay}
          />
        )}
        {currentView === 'tools-plus' && (
          <ToolsPlusView t={t} features={features} updateSetting={updateSetting} />
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
            {t('modePopup')}
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
            {t('modeOverlay')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Chat Tab ──────────────────────────────── */
function ChatView({ t }: { t: (k: any) => string }) {
  const [messages, setMessages] = useState<
    { text: string; sender: 'user' | 'bot' | 'error' }[]
  >([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);
  
  // ... (rest of ChatView logic)

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
          // ... (Empty state)
          <div className="flex flex-col items-center justify-center h-full text-center p-6 select-none animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 ring-1" style={{ backgroundColor: 'var(--snap-primary-light)', borderColor: 'var(--snap-primary-ring)' }}>
              <MessageSquare size={32} style={{ color: 'var(--snap-primary)', opacity: 0.8 }} strokeWidth={1.5} />
            </div>
            <h3 className="text-zinc-800 font-bold mb-1">Llama-SNAP Assistant</h3>
            <p className="text-xs text-zinc-500 max-w-[200px] leading-relaxed">
              Ask questions about the current page or request summaries. I'm here to help!
            </p>
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            {/* ... (Message bubbles) */}
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
             // ... (Loading bubble)
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
            placeholder={t('chatPlaceholder')}
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
  t,
  targetLanguage,
  setTargetLanguage,
  onAction,
}: {
  t: (k: any) => string;
  targetLanguage: string;
  setTargetLanguage: (v: string) => void;
  onAction: (type: string) => void;
  onOverlay: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* AI actions card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-5">
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
                 <span className="text-white font-bold text-sm leading-none mb-0.5">{t('cmdSimplify')}</span>
                 <span className="text-white/70 text-[10px] font-medium">{t('cmdSimplifyDesc')}</span>
               </div>
             </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            {[
              { action: 'explain', icon: <Info size={18} />, label: t('explain'), desc: t('cmdExplainDesc') },
              { action: 'expand', icon: <Maximize2 size={18} />, label: t('expand'), desc: t('cmdExpandDesc') },
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
            <h2 className="text-sm font-bold text-zinc-900 tracking-tight">{t('cmdTranslate')}</h2>
            <p className="text-[10px] text-zinc-400 font-medium">{t('cmdTranslateDesc')}</p>
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
            </SelectContent>
          </Select>
          <button
            onClick={() => onAction('translate')}
            className="px-6 h-11 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 active:scale-95 transition-all shadow-lg shadow-zinc-900/10 flex items-center gap-2"
          >
            {t('translate')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Tools+ Tab ─────────────────────────────── */
function ToolsPlusView({
  t,
  features,
  updateSetting,
}: {
  t: (k: any) => string;
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
    { id: 'readAloud', label: t('featureScreenReader'), desc: t('featureScreenReaderDesc'), icon: <Volume2 size={18} />, color: 'bg-orange-50 text-orange-600 ring-orange-100' },
    { id: 'easyRead', label: t('featureEasyRead'), desc: t('featureEasyReadDesc'), icon: <Type size={18} />, color: 'bg-blue-50 text-blue-600 ring-blue-100' },
    { id: 'dyslexiaFont', label: t('featureDyslexia'), desc: t('featureDyslexiaDesc'), icon: <BookOpen size={18} />, color: 'bg-purple-50 text-purple-600 ring-purple-100' },
    { id: 'highContrast', label: t('featureContrast'), desc: t('featureContrastDesc'), icon: <Contrast size={18} />, color: 'bg-zinc-100 text-zinc-800 ring-zinc-200' },
    // { id: 'focusMode', label: t('focus'), desc: 'Dim distractions', icon: <Eye size={18} />, color: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
    { id: 'readingRuler', label: t('featureRuler'), desc: t('featureRulerDesc'), icon: <Minus size={18} />, color: 'bg-rose-50 text-rose-600 ring-rose-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-zinc-50/50 border-b border-zinc-100 flex items-center justify-between">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <Settings size={14} />
            {t('tabAccess')}
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
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('poweredBy')}</p>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-zinc-200 rounded-full shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--snap-info)' }}></span>
            <span className="text-[10px] font-mono text-zinc-600">{t('modelName')}</span>
        </div>
      </div>
    </div>
  );
}
