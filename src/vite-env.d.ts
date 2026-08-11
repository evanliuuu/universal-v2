/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_OPENROUTER_FAST_MODEL?: string;
  readonly VITE_OPENROUTER_BIG_MODEL?: string;
  readonly VITE_OPENROUTER_PLANNER_MODEL?: string;
  readonly VITE_OPENROUTER_EXECUTOR_MODEL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
