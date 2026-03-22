export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
}

export interface OllamaStatus {
  connected: boolean;
  version: string | null;
  models: OllamaModel[];
  baseUrl: string;
}

export interface OllamaPullProgress {
  modelName: string;
  status: string;
  digest: string | null;
  total: number | null;
  completed: number | null;
  percent: number;
}

// Raw types from Rust (snake_case)
export interface RawOllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface RawOllamaStatus {
  connected: boolean;
  version: string | null;
  models: RawOllamaModel[];
  base_url: string;
}

export interface RawOllamaPullProgress {
  model_name: string;
  status: string;
  digest: string | null;
  total: number | null;
  completed: number | null;
  percent: number;
}

export function mapOllamaModel(raw: RawOllamaModel): OllamaModel {
  return {
    name: raw.name,
    size: raw.size,
    digest: raw.digest,
    modifiedAt: raw.modified_at,
  };
}

export function mapOllamaStatus(raw: RawOllamaStatus): OllamaStatus {
  return {
    connected: raw.connected,
    version: raw.version,
    models: raw.models.map(mapOllamaModel),
    baseUrl: raw.base_url,
  };
}

export function mapOllamaPullProgress(raw: RawOllamaPullProgress): OllamaPullProgress {
  return {
    modelName: raw.model_name,
    status: raw.status,
    digest: raw.digest,
    total: raw.total,
    completed: raw.completed,
    percent: raw.percent,
  };
}

// Install types
export interface OllamaInstallStatus {
  isInstalled: boolean;
  binaryPath: string | null;
  isManaged: boolean;
  isSystemInstall: boolean;
  isServeRunning: boolean;
  platform: string;
  arch: string;
}

export interface OllamaInstallProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  status: string;
}

export interface RawOllamaInstallStatus {
  is_installed: boolean;
  binary_path: string | null;
  is_managed: boolean;
  is_system_install: boolean;
  is_serve_running: boolean;
  platform: string;
  arch: string;
}

export interface RawOllamaInstallProgress {
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
  status: string;
}

export function mapOllamaInstallStatus(raw: RawOllamaInstallStatus): OllamaInstallStatus {
  return {
    isInstalled: raw.is_installed,
    binaryPath: raw.binary_path,
    isManaged: raw.is_managed,
    isSystemInstall: raw.is_system_install,
    isServeRunning: raw.is_serve_running,
    platform: raw.platform,
    arch: raw.arch,
  };
}

export function mapOllamaInstallProgress(raw: RawOllamaInstallProgress): OllamaInstallProgress {
  return {
    downloadedBytes: raw.downloaded_bytes,
    totalBytes: raw.total_bytes,
    percent: raw.percent,
    status: raw.status,
  };
}

export interface RecommendedOllamaModel {
  name: string;
  displayName: string;
  sizeMb: number;
  description: string;
  parameterCount: string;
  speed: string;
  accuracy: string;
}

export const RECOMMENDED_OLLAMA_MODELS: RecommendedOllamaModel[] = [
  {
    name: 'llama3.2',
    displayName: 'Llama 3.2',
    sizeMb: 2000,
    description: 'Fast, great multilingual support. Best balance for most users.',
    parameterCount: '3B',
    speed: 'Fast',
    accuracy: 'Good',
  },
  {
    name: 'llama3.1:8b',
    displayName: 'Llama 3.1 8B',
    sizeMb: 4700,
    description: 'Stronger reasoning and grammar correction. Excellent for tutoring.',
    parameterCount: '8B',
    speed: 'Medium',
    accuracy: 'Very Good',
  },
  {
    name: 'gemma3:4b',
    displayName: 'Gemma 3 4B',
    sizeMb: 3000,
    description: 'Google model with strong multilingual ability. Good for vocabulary exercises.',
    parameterCount: '4B',
    speed: 'Fast',
    accuracy: 'Good',
  },
  {
    name: 'mistral',
    displayName: 'Mistral 7B',
    sizeMb: 4100,
    description: 'Strong European language support (French, German, Spanish). Fast inference.',
    parameterCount: '7B',
    speed: 'Medium',
    accuracy: 'Very Good',
  },
  {
    name: 'phi4-mini',
    displayName: 'Phi-4 Mini',
    sizeMb: 2400,
    description: 'Microsoft compact model. Quick responses, good for conversation practice.',
    parameterCount: '3.8B',
    speed: 'Fast',
    accuracy: 'Good',
  },
  {
    name: 'qwen3:8b',
    displayName: 'Qwen 3 8B',
    sizeMb: 4900,
    description: 'Best for Chinese, Arabic, and Asian languages. Alibaba model.',
    parameterCount: '8B',
    speed: 'Medium',
    accuracy: 'Very Good',
  },
  {
    name: 'aya-expanse:8b',
    displayName: 'Aya Expanse 8B',
    sizeMb: 4800,
    description: 'Cohere model trained on 23+ languages. Built for multilingual tasks.',
    parameterCount: '8B',
    speed: 'Medium',
    accuracy: 'Good',
  },
  {
    name: 'llama3.1:70b',
    displayName: 'Llama 3.1 70B',
    sizeMb: 40000,
    description: 'Most capable. Needs 48GB+ RAM. Best grammar and writing feedback.',
    parameterCount: '70B',
    speed: 'Slow',
    accuracy: 'Excellent',
  },
];
