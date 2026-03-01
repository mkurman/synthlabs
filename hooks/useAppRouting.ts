import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { AppView, Environment } from '../interfaces/enums';
import { RouteMode } from '../interfaces/enums/RouteMode';
import { RouteQueryKey } from '../interfaces/enums/RouteQueryKey';

interface UseAppRoutingParams {
  appView: AppView;
  environment: Environment;
  sessionUid: string;
  includeSessionUid: boolean;
  setAppView: Dispatch<SetStateAction<AppView>>;
  setEnvironment: Dispatch<SetStateAction<Environment>>;
  onSessionNavigate?: (sessionId: string) => void;
  onSessionRouteClear?: () => void;
}

const HASH_PREFIX = '#';
const HASH_QUERY_SEPARATOR = '?';

const getAppViewFromHash = (hash: string): AppView | null => {
  const normalized = hash.startsWith(HASH_PREFIX) ? hash.slice(1) : hash;
  if (normalized === AppView.Creator) {
    return AppView.Creator;
  }
  if (normalized === AppView.Verifier) {
    return AppView.Verifier;
  }
  if (normalized === AppView.BatchDebugger) {
    return AppView.BatchDebugger;
  }
  return null;
};

const getRouteModeFromEnvironment = (environment: Environment): RouteMode => {
  if (environment === Environment.Production) {
    return RouteMode.Prod;
  }
  return RouteMode.Dev;
};

const getEnvironmentFromRouteMode = (mode: string | null): Environment | null => {
  if (mode === RouteMode.Prod) {
    return Environment.Production;
  }
  if (mode === RouteMode.Dev) {
    return Environment.Development;
  }
  return null;
};

const getSessionIdFromParams = (params: URLSearchParams): string | null => {
  const primary = params.get(RouteQueryKey.Session);
  if (primary && primary.trim().length > 0) {
    return primary;
  }
  const legacy = params.get('session');
  if (legacy && legacy.trim().length > 0) {
    return legacy;
  }
  return null;
};

const parseHash = (hash: string): {
  view: AppView | null;
  environment: Environment | null;
  sessionId: string | null;
} => {
  const normalized = hash.startsWith(HASH_PREFIX) ? hash.slice(1) : hash;
  const [rawView, queryString = ''] = normalized.split(HASH_QUERY_SEPARATOR);
  const view = getAppViewFromHash(rawView);
  const params = new URLSearchParams(queryString);
  const environment = getEnvironmentFromRouteMode(params.get(RouteQueryKey.Mode));
  const sessionId = getSessionIdFromParams(params);
  return { view, environment, sessionId };
};

export const getInitialAppView = (): AppView => {
  if (typeof window === 'undefined') {
    return AppView.Creator;
  }
  const { view } = parseHash(window.location.hash);
  return view ?? AppView.Creator;
};

export const getInitialEnvironment = (): Environment => {
  if (typeof window === 'undefined') {
    return Environment.Development;
  }
  const { environment } = parseHash(window.location.hash);
  return environment ?? Environment.Development;
};

export function useAppRouting({
  appView,
  environment,
  sessionUid,
  includeSessionUid,
  setAppView,
  setEnvironment,
  onSessionNavigate,
  onSessionRouteClear
}: UseAppRoutingParams): void {
  const appViewRef = useRef(appView);
  const environmentRef = useRef(environment);
  const sessionUidRef = useRef(sessionUid);
  const initialHasSessionRef = useRef(false);
  const lastWrittenHashRef = useRef<string | null>(null);
  const initialAppliedRef = useRef(false);

  useEffect(() => {
    appViewRef.current = appView;
    environmentRef.current = environment;
    sessionUidRef.current = sessionUid;
  }, [appView, environment, sessionUid]);

  const applyHash = useCallback((hash: string, isInitial: boolean): void => {
    if (lastWrittenHashRef.current && hash === lastWrittenHashRef.current) {
      return;
    }
    const parsed = parseHash(hash);
    if (parsed.sessionId && parsed.sessionId.trim().length > 0) {
      initialHasSessionRef.current = true;
    }
    if (parsed.view && parsed.view !== appViewRef.current) {
      setAppView(parsed.view);
    }
    if (parsed.environment && parsed.environment !== environmentRef.current) {
      setEnvironment(parsed.environment);
    }
    if (isInitial) {
      if (parsed.sessionId && parsed.sessionId !== sessionUidRef.current) {
        onSessionNavigate?.(parsed.sessionId);
      } else if (!parsed.sessionId) {
        onSessionRouteClear?.();
      }
    }
  }, [onSessionNavigate, onSessionRouteClear, setAppView, setEnvironment]);

  // Apply initial hash only once on mount
  useEffect(() => {
    if (typeof window === 'undefined' || initialAppliedRef.current) {
      return;
    }
    initialAppliedRef.current = true;
    applyHash(window.location.hash, true);
  }, [applyHash]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleHashChange = (): void => {
      applyHash(window.location.hash, false);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [applyHash]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const routeMode = getRouteModeFromEnvironment(environment);
    const params = new URLSearchParams();
    params.set(RouteQueryKey.Mode, routeMode);
    const normalizedSessionUid = sessionUid?.trim();
    if ((includeSessionUid || initialHasSessionRef.current) && normalizedSessionUid) {
      params.set(RouteQueryKey.Session, normalizedSessionUid);
    }
    const queryString = params.toString();
    const targetHash = `${HASH_PREFIX}${appView}${HASH_QUERY_SEPARATOR}${queryString}`;
    if (window.location.hash !== targetHash) {
      lastWrittenHashRef.current = targetHash;
      window.history.replaceState(null, '', targetHash);
    }
  }, [appView, environment, includeSessionUid, sessionUid]);
}
