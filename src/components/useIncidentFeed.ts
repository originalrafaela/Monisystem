import { useCallback, useEffect, useRef, useState } from 'react';
import type { CategoryId, Coordinates, Incident } from '../domain/entities';
import { APP_POLICY } from '../config/app';
import { useMobile } from './MobileProvider';
export function useIncidentFeed(center: Coordinates | null, category: CategoryId | null, region: string | null) {
  const { services, demo, incidents, rememberIncidents, revision } = useMobile();
  const [items, setItems] = useState<readonly Incident[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const nextCursor = useRef<string | null>(null);
  const inFlight = useRef(false);
  const demoItems = useRef(incidents);
  const load = useCallback(async (append = false) => {
    if (append && (inFlight.current || !nextCursor.current)) return;
    const version = ++generation.current;
    inFlight.current = true; setBusy(true); setError('');
    if (!append) { setItems([]); setCursor(null); }
    try {
      if (demo) { setItems(demoItems.current.filter(item => (!category || item.categoryId === category) && (!region || item.regionId === region))); return; }
      if (!services || !center) return;
      const result = await services.reports.getFeed({ center, radiusMeters: APP_POLICY.initialFeedRadiusMeters, categoryIds: category ? [category] : [], regionIds: region ? [region] : [], cursor: append ? nextCursor.current : null, limit: 20 });
      if (version !== generation.current) return;
      if (!result.ok) throw new Error(result.error.message);
      setItems(previous => append ? Array.from(new Map([...previous, ...result.value.items].map(item => [item.id, item])).values()) : result.value.items);
      nextCursor.current = result.value.nextCursor; setCursor(result.value.nextCursor); rememberIncidents(result.value.items);
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'Não foi possível carregar o feed.'); }
    finally { if (version === generation.current) { setBusy(false); inFlight.current = false; } }
  }, [services, demo, center, category, region, rememberIncidents]);
  useEffect(() => { const requestGeneration = generation; const requestLock = inFlight; void load(); return () => { requestGeneration.current++; requestLock.current = false; }; }, [load, revision]);
  return { items, busy, error, hasMore: cursor !== null, refresh: () => load(), loadMore: () => load(true) };
}
