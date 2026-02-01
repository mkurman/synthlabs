import { useCallback } from 'react';

import { DataTransformService } from '../services/dataTransformService';
import { AppMode } from '../interfaces/enums';
import type { HuggingFaceConfig } from '../types';

interface UseRowContentOptions {
    hfConfig: HuggingFaceConfig;
    appMode: AppMode;
}

export function useRowContent({ hfConfig, appMode }: UseRowContentOptions) {
    return useCallback((row: Record<string, unknown>): string => {
        return DataTransformService.getRowContent(row, {
            hfConfig,
            appMode
        });
    }, [appMode, hfConfig]);
}

export default useRowContent;
