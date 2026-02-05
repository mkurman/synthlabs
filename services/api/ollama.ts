import { logger } from '../../utils/logger';

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaModelListResponse {
  models: OllamaModel[];
}

export async function fetchOllamaModels(baseUrl: string = 'http://localhost:11434'): Promise<OllamaModel[]> {
  try {
    const url = `${baseUrl.replace(/\/v1\/?$/, '')}/api/tags`;
    logger.log(`Fetching Ollama models from: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn(`Ollama API returned ${response.status}: ${response.statusText}`);
      return [];
    }

    const data: OllamaModelListResponse = await response.json();
    logger.log(`Found ${data.models?.length || 0} Ollama models`);
    return data.models || [];
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        logger.warn('Ollama connection timed out - is Ollama running?');
      } else if (error.message.includes('fetch')) {
        logger.warn('Could not connect to Ollama - is Ollama running?');
      } else {
        logger.warn('Error fetching Ollama models:', error.message);
      }
    }
    return [];
  }
}

export async function checkOllamaStatus(baseUrl: string = 'http://localhost:11434'): Promise<boolean> {
  try {
    const url = `${baseUrl.replace(/\/v1\/?$/, '')}/api/tags`;
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function formatOllamaModelSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)}GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)}MB`;
}
