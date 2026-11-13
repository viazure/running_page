/// <reference types="vite/client" />

declare module '@config' {
  const config: Record<string, unknown>;
  export default config;
}

declare module '*.yml' {
  const content: Record<string, unknown>;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_LTHR?: string;
  readonly VITE_MAX_HR?: string;
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly MAPBOX_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
