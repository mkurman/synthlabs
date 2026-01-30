import { ExternalProvider, ProviderType } from '../enums';
import { ProviderModel } from './ProviderModel';

export interface CachedModelList {
  cacheKey: string;
  provider: ExternalProvider | ProviderType.Gemini;
  models: ProviderModel[];
  fetchedAt: number;
  expiresAt: number;
  error?: string;
}
