import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { X, Bot, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PROVIDER_PRESETS } from "../../services/ai-provider/presets";
import { messageFor } from "../errorMessages";

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
  useEnvKey: false,
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

// Shape forwarded to /api/suggest and /api/transliterate so the server can build
// an OpenAI-compatible client for the user-selected provider.
export function toProviderRequest(settings: AIProviderSettings) {
  return {
    baseURL: settings.baseURL,
    model: settings.model,
    apiKey: settings.useEnvKey ? undefined : settings.apiKey,
    envVar: settings.useEnvKey ? settings.envVar : undefined,
  };
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
        setTestMessage(data.kind ? messageFor(data.kind) : data.error || "فشل الاتصال");
      }
    } catch {
      setTestState("error");
      setTestMessage(messageFor("network"));
    }
  };

  return (
    <div className="
      fixed flex
      items-center justify-center
      p-4
      inset-0 z-[100]
    ">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="
          absolute
          bg-black/60
          backdrop-blur-sm inset-0
        "
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="
          flex relative
          max-h-[90vh] max-w-md w-full
          bg-bg-panel
          border-2 border-border-main rounded-3xl
          shadow-2xl
          flex-col overflow-hidden z-10
        "
      >
        <div className="
          flex
          items-center justify-between
          shrink-0
          px-5 py-2.5
          border-b-2 border-border-main
        ">
          <div className="
            flex
            gap-2 items-center
          ">
            <Bot className="
              h-4 w-4
              text-accent
            " />
            <h3 className="
              font-bold font-display text-sm text-text-main
            ">AI Provider Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="
              p-1.5
              text-text-muted
              rounded-lg
              hover:bg-bg-page hover:text-text-main
              cursor-pointer transition-colors
            "
          >
            <X className="
              h-4 w-4
            " />
          </button>
        </div>

        <div className="
          flex
          gap-2.5
          px-5 py-3
          flex-1 flex-col overflow-y-auto
        ">
          <div>
            <label className="
              block
              mb-1
              font-semibold text-text-muted text-xs
            ">Provider preset</label>
            <select
              value={settings.providerId}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="
                w-full
                px-3 py-1.5
                text-sm text-text-main
                bg-bg-page
                border-2 border-border-main outline-none rounded-xl
                focus:border-accent
                cursor-pointer transition-colors
              "
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="
              block
              mb-1
              font-semibold text-text-muted text-xs
            ">Base URL</label>
            <input
              type="text"
              value={settings.baseURL}
              onChange={(e) => setSettings((prev) => ({ ...prev, baseURL: e.target.value }))}
              className="
                w-full
                px-3 py-1.5
                font-mono text-sm text-text-main
                bg-bg-page
                border-2 border-border-main outline-none rounded-xl
                focus:border-accent
                transition-colors
              "
            />
          </div>

          <div>
            <label className="
              block
              mb-1
              font-semibold text-text-muted text-xs
            ">Model</label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => setSettings((prev) => ({ ...prev, model: e.target.value }))}
              className="
                w-full
                px-3 py-1.5
                font-mono text-sm text-text-main
                bg-bg-page
                border-2 border-border-main outline-none rounded-xl
                focus:border-accent
                transition-colors
              "
            />
          </div>

          <label className="
            flex
            gap-2 items-center
            cursor-pointer select-none
          ">
            <input
              type="checkbox"
              checked={settings.useEnvKey}
              onChange={(e) => setSettings((prev) => ({ ...prev, useEnvKey: e.target.checked }))}
              className="
                h-4 shrink-0 w-4
                accent-accent cursor-pointer
              "
            />
            <span className="
              font-semibold text-text-main text-xs
            ">Use API key from environment or .env file</span>
          </label>

          {settings.useEnvKey ? (
            <div>
              <label className="
                block
                mb-1
                font-semibold text-text-muted text-xs
              ">Environment variable</label>
              <input
                type="text"
                value={settings.envVar}
                onChange={(e) => setSettings((prev) => ({ ...prev, envVar: e.target.value }))}
                className="
                  w-full
                  px-3 py-1.5
                  font-mono text-sm text-text-main
                  bg-bg-page
                  border-2 border-border-main outline-none rounded-xl
                  focus:border-accent
                  transition-colors
                "
              />
              <p className="
                mt-1
                text-[11px] text-text-muted
              ">
                Reads from the server's environment, not yours. Only works when you're self-hosting/running this app locally (or you've set this variable on your own deployment) — on a shared/public site, use "API key" below instead.
              </p>
            </div>
          ) : (
            <div>
              <label className="
                block
                mb-1
                font-semibold text-text-muted text-xs
              ">API key</label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="
                  w-full
                  px-3 py-1.5
                  font-mono text-sm text-text-main
                  bg-bg-page
                  border-2 border-border-main outline-none rounded-xl
                  focus:border-accent
                  transition-colors
                "
              />
            </div>
          )}

        </div>

        <div className="
          flex
          gap-2
          shrink-0
          px-5 py-2.5
          border-border-main border-t-2
          flex-col
        ">
          {testMessage && (
            <div className={`flex items-start gap-1.5 text-xs font-semibold ${testState === "success" ? "text-emerald-500" : "text-rose-500"}`}>
              {testState === "success" ? <CheckCircle2 className="
                h-3.5 shrink-0 w-3.5
                mt-0.5
              " /> : <XCircle className="
                h-3.5 shrink-0 w-3.5
                mt-0.5
              " />}
              <span className="
                break-words
              ">{testMessage}</span>
            </div>
          )}
          <div className="
            flex
            gap-2 items-center justify-between
          ">
            <button
              onClick={handleTestConnection}
              disabled={testState === "testing"}
              className="
                flex
                gap-1.5 items-center
                shrink-0
                px-4 py-2.5
                font-bold text-text-main text-xs
                bg-bg-page
                border-2 border-border-main rounded-xl
                disabled:opacity-60 hover:bg-border-main/20
                cursor-pointer transition-colors
              "
            >
              {testState === "testing" && <Loader2 className="
                h-3.5 w-3.5
                animate-spin
              " />}
              <span>Test connection</span>
            </button>
            <button
              onClick={handleSave}
              className="
                px-5 py-2.5
                font-semibold text-white text-xs
                bg-accent
                border border-secondary rounded-xl
                hover:bg-accent-hover
                cursor-pointer transition-all
              "
            >
              Done
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
