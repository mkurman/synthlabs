import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import { Environment } from '../interfaces/enums';
import { setVerbose } from '../utils/logger';

interface UseVerboseLoggingOptions {
    environment: Environment;
    environmentRef: MutableRefObject<Environment>;
}

export function useVerboseLogging({ environment, environmentRef }: UseVerboseLoggingOptions) {
    useEffect(() => {
        environmentRef.current = environment;
        setVerbose(environment === Environment.Development);
    }, [environment, environmentRef]);
}

export default useVerboseLogging;
