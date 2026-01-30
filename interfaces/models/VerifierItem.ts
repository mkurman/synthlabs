import { SynthLogItem } from './SynthLogItem';

export interface VerifierItem extends SynthLogItem {
  score: number;
  isDuplicate?: boolean;
  duplicateGroupId?: string;
  isDiscarded?: boolean;
  verifiedTimestamp?: string;
  _doc?: any;
  hasUnsavedChanges?: boolean;
}
