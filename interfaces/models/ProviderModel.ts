import { ExternalProvider } from '../enums';

export interface ProviderModel {
  id: string;
  name?: string;
  provider: ExternalProvider;
  context_length?: number;
  owned_by?: string;
  created?: number;
}
