import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { X, Bot, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PROVIDER_PRESETS } from "../../services/ai-provider/presets";

const STORAGE_KEY = "ai_provider_settings";

export interface AIProviderSettings {
  providerId: string;
  label: string;
  baseURL: string;
  model: string;
  useEnvKey: boolean;
  envVar: string;
  apiKey: string;
}

const DEFAULT_SETTINGS: AIProviderSettings = {
  providerId: PROVIDER_PRESETS[0].id,
  label: PROVIDER_PRESETS[0].label,
  baseURL: PROVIDER_PRESETS[0].baseURL,
  model: PROVIDER_PRESETS[0].model,
  useEnvKey: true,
  envVar: PROVIDER_PRESETS[0].envVar,
  apiKey: "",
};

export function loadAIProviderSettings(): AIProviderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore malformed storage
  }
  return DEFAULT_SETTINGS;
}

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const [settings, setSettings] = useState<AIProviderSettings>(DEFAULT_SETTINGS);
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSettings(loadAIProviderSettings());
      setTestState("idle");
      setTestMessage("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePresetChange = (providerId: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
    if (!preset) return;
    setSettings((prev) => ({
      ...prev,
      providerId: preset.id,
      label: preset.label,
      baseURL: preset.baseURL,
      model: preset.model,
      envVar: preset.envVar,
    }));
    setTestState("idle");
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    onClose();
  };

  const handleTestConnection = async () => {
    setTestState("testing");
    setTestMessage("");
    try {
      const res = await fetch("/api/ai-provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseURL: settings.baseURL,
          apiKey: settings.useEnvKey ? undefined : settings.apiKey,
          envVar: settings.useEnvKey ? settings.envVar : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestState("success");
        setTestMessage("تم الاتصال بنجاح");
      } else {
        setTestState("error");
        setTestMessage(data.error || "فشل الاتصال");
      }
    } catch (e: any) {
      setTestState("error");
      setTestMessage(e.message || "فشل الاتصال");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="relative w-full max-w-md bg-bg-panel border-2 border-border-main rounded-3xl shadow-2xl z-10 max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border-main shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent" />
            <h3 className="font-display font-bold text-sm text-text-main">AI Provider Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-bg-page rounded-lg transition-colors text-text-muted hover:text-text-main cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-text-muted block mb-1.5">Provider preset</label>
            <select
              value={settings.providerId}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-bg-page border-2 border-border-main rounded-xl text-sm text-text-main outline-none focus:border-accent transition-colors cursor-pointer"
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-text-muted mt-1">Auto-fills base URL, model & environment variable. Tweak any field below.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-text-muted block mb-1.5">Base URL</label>
            <input
              type="text"
              value={settings.baseURL}
              onChange={(e) => setSettings((prev) => ({ ...prev, baseURL: e.target.value }))}
              className="w-full px-3 py-2.5 bg-bg-page border-2 border-border-main rounded-xl text-sm text-text-main font-mono outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-text-muted block mb-1.5">Model</label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => setSettings((prev) => ({ ...prev, model: e.target.value }))}
              className="w-full px-3 py-2.5 bg-bg-page border-2 border-border-main rounded-xl text-sm text-text-main font-mono outline-none focus:border-accent transition-colors"
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.useEnvKey}
              onChange={(e) => setSettings((prev) => ({ ...prev, useEnvKey: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-accent cursor-pointer"
            />
            <div>
              <span className="text-sm font-semibold text-text-main block">Use API key from environment or .env file</span>
              <span className="text-[11px] text-text-muted">Keeps the key out of the saved settings file.</span>
            </div>
          </label>

          {settings.useEnvKey ? (
            <div>
              <label className="text-xs font-semibold text-text-muted block mb-1.5">Environment variable</label>
              <input
                type="text"
                value={settings.envVar}
                onChange={(e) => setSettings((prev) => ({ ...prev, envVar: e.target.value }))}
                className="w-full px-3 py-2.5 bg-bg-page border-2 border-border-main rounded-xl text-sm text-text-main font-mono outline-none focus:border-accent transition-colors"
              />
              <p className="text-[11px] text-text-muted mt-1">Read from the process environment, or a .env file in the app data folder or working directory.</p>
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-text-muted block mb-1.5">API key</label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full px-3 py-2.5 bg-bg-page border-2 border-border-main rounded-xl text-sm text-text-main font-mono outline-none focus:border-accent transition-colors"
              />
              <p className="text-[11px] text-text-muted mt-1">Stored locally in this browser only.</p>
            </div>
          )}

          {testMessage && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${testState === "success" ? "text-emerald-500" : "text-rose-500"}`}>
              {testState === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>{testMessage}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t-2 border-border-main shrink-0">
          <button
            onClick={handleTestConnection}
            disabled={testState === "testing"}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-bg-page border-2 border-border-main hover:bg-border-main/20 disabled:opacity-60 rounded-xl text-xs font-bold text-text-main transition-colors cursor-pointer"
          >
            {testState === "testing" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Test connection</span>
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl text-xs transition-all cursor-pointer border border-secondary"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
