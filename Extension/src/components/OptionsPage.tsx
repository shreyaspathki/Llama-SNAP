import  { useState, useEffect } from 'react';
import '../index.css';
import { 
  Settings, 
  Cpu, 
  Globe, 
  Shield, 
  Zap, 
  Server, 
  Save, 
  CheckCircle,
  Database,
  Eye,
  Check
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Switch } from './ui/switch';
import { useAccessibilityTheme, THEME_OPTIONS, type A11yTheme } from '../context/AccessibilityThemeContext';

const sendMessage = (msg: any): Promise<any> =>
  new Promise(r => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(msg, res => r(res));
    } else r(null);
  });

export function OptionsPage() {
  const { theme, setTheme } = useAccessibilityTheme();
  const [provider, setProvider] = useState('gateway');
  const [gatewayUrl, setGatewayUrl] = useState('http://localhost:8000/v1/generate');
  const [forceStrategy, setForceStrategy] = useState('local');
  const [ollamaModel, setOllamaModel] = useState('llama3.2:3b');
  const [maxTokens, setMaxTokens] = useState(512);
  const [privacy, setPrivacy] = useState(true);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    sendMessage({ type: 'getSettings' }).then((res: any) => {
      if (!res?.settings) return;
      const s = res.settings;
      setProvider(s.aiProvider || 'gateway');
      setGatewayUrl(s.gatewayUrl || 'http://localhost:8000/v1/generate');
      setForceStrategy(s.forceStrategy || 'local');
      setOllamaModel(s.ollamaModel || 'llama3.2:3b');
      setMaxTokens(s.maxTokens || 512);
      setPrivacy(!!s.privacyOnlySelectedText);
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    await sendMessage({
      type: 'setSettings',
      patch: { aiProvider: provider, gatewayUrl, forceStrategy, ollamaModel, maxTokens, privacyOnlySelectedText: privacy },
    });
    setIsSaving(false);
    setStatus('Saved successfully!');
    setTimeout(() => setStatus(''), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center py-12 px-4 font-sans text-zinc-900">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-zinc-900 px-8 py-6 flex items-center gap-4 border-b border-zinc-800">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-zinc-900 shadow-lg" style={{ backgroundColor: 'var(--snap-primary)', boxShadow: '0 10px 15px -3px var(--snap-primary-ring)' }}>
            <Settings className="w-7 h-7" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Extension Settings</h1>
            <p className="text-zinc-400 text-sm font-medium">Configure AI providers and privacy</p>
          </div>
        </div>

        <div className="p-8 space-y-8">
          
          {/* AI Provider Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--snap-primary)' }}>
              <Cpu className="w-4 h-4" />
              AI Configuration
            </div>
            
            <div className="grid gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700">AI Provider</label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="w-full h-11 bg-white border-zinc-200">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200">
                    <SelectItem value="gateway">Local Llama Gateway (Port 8000)</SelectItem>
                    <SelectItem value="groq_only">Groq Cloud API</SelectItem>
                    <SelectItem value="ollama">Ollama (Direct)</SelectItem>
                    <SelectItem value="mock">Mock Mode (Offline Testing)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500">
                  Select the backend service that powers the AI features.
                </p>
              </div>

              {(provider === 'gateway' || provider === 'groq_only') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-zinc-400" />
                      Gateway URL
                    </label>
                    <input
                      type="text"
                      value={gatewayUrl}
                      onChange={e => setGatewayUrl(e.target.value)}
                      className="w-full h-10 border border-zinc-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--snap-primary-ring)] focus:border-[var(--snap-primary)] transition-all font-mono text-zinc-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-zinc-400" />
                      Inference Strategy
                    </label>
                     <Select value={forceStrategy} onValueChange={setForceStrategy}>
                      <SelectTrigger className="w-full h-10 bg-white border-zinc-200">
                        <SelectValue placeholder="Auto" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-zinc-200">
                        <SelectItem value="local">Local Llama (Fine-tuned)</SelectItem>
                        <SelectItem value="groq">Groq (Cloud Fallback)</SelectItem>
                        <SelectItem value="auto">Auto-Detect</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {provider === 'ollama' && (
                <div className="space-y-2 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                  <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                    <Database className="w-4 h-4 text-zinc-400" />
                    Ollama Model Name
                  </label>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={e => setOllamaModel(e.target.value)}
                    placeholder="llama3.2:3b"
                    className="w-full h-10 border border-zinc-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--snap-primary-ring)] focus:border-[var(--snap-primary)] transition-all font-mono"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-px bg-zinc-100" />

          {/* Accessibility Theme Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--snap-primary)' }}>
              <Eye className="w-4 h-4" />
              Color Vision Accessibility
            </div>
            <p className="text-xs text-zinc-500">
              Choose a color palette optimized for your vision. Similar to GitHub's accessibility themes.
            </p>
            <div className="grid gap-2">
              {THEME_OPTIONS.map(opt => {
                const isActive = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTheme(opt.id as A11yTheme)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      isActive
                        ? 'border-[var(--snap-primary)] bg-[var(--snap-primary-light)] shadow-sm'
                        : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200 hover:bg-white'
                    }`}
                  >
                    <span className="text-xl select-none w-8 text-center" aria-hidden="true">{opt.icon}</span>
                    <div className="flex-1">
                      <span className={`block text-sm font-bold ${
                        isActive ? 'text-zinc-900' : 'text-zinc-700'
                      }`}>
                        {opt.label}
                      </span>
                      <span className="block text-xs text-zinc-400 mt-0.5">{opt.description}</span>
                    </div>
                    {isActive && (
                      <Check className="w-5 h-5 shrink-0" style={{ color: 'var(--snap-primary)' }} aria-label="Active" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full h-px bg-zinc-100" />

          {/* Performance & Privacy */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--snap-primary)' }}>
                <Server className="w-4 h-4" />
                Performance
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-semibold text-zinc-700">Max Tokens</label>
                  <span className="text-xs font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min={64}
                  max={2048}
                  step={64}
                  value={maxTokens}
                  onChange={e => setMaxTokens(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--snap-primary)' }}
                />
                <p className="text-xs text-zinc-500">Maximum length of AI response.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--snap-primary)' }}>
                <Shield className="w-4 h-4" />
                Privacy Control
              </div>
              <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-bold text-zinc-800 block">Context Privacy</label>
                  </div>
                  <p className="text-xs text-zinc-500 leading-tight">Only send user-selected text.</p>
                </div>
                <div className="scale-90 origin-right">
                  <Switch 
                    checked={privacy} 
                    onCheckedChange={setPrivacy}
                    className="snap-switch"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-zinc-50 px-8 py-5 border-t border-zinc-100 flex items-center justify-between">
          <p className="text-xs text-zinc-400 font-medium font-mono">
            SNAP v1.0.2
          </p>
          
          <div className="flex items-center gap-4">
             {status && (
              <div className="flex items-center gap-1.5 text-sm font-bold animate-pulse" style={{ color: 'var(--snap-primary)' }}>
                <CheckCircle className="w-4 h-4" />
                {status}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 h-10 bg-zinc-900 text-white font-bold text-sm rounded-lg hover:bg-zinc-800 active:scale-95 transition-all shadow-lg shadow-zinc-900/10 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
