import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { Coordinates, Incident, UserPreferences, Category, Region } from '../domain/entities';
import type { AuthService, ProfileService, ReportService, CatalogService, PhotoService, MetricsService } from '../services/contracts';
import { demoIncidents } from './demo-data';
import { NativeCamera } from './NativeCamera';
import { composeMobileServices } from './mobile-composition';

export interface MobileServices {
  auth: AuthService; profile: ProfileService; reports: ReportService;
  catalog: CatalogService; photos: PhotoService; metrics: MetricsService;
  capturePhoto(): Promise<string>;
  currentLocation(): Promise<Coordinates>;
  resolvePhoto(path: string): Promise<string>;
}
interface MobileState {
  services: MobileServices | undefined;
  demo: boolean; loading: boolean; configurationError: string;
  entered: boolean; enter(): void; leave(): void;
  incidents: readonly Incident[];
  rememberIncidents(items: readonly Incident[]): void;
  categories: readonly Category[]; regions: readonly Region[];
  catalogError: string; refreshCatalog(): Promise<void>;
  preferences: UserPreferences; setPreferences(value: UserPreferences): void;
  revision: number; reportPublished(): void;
}
const emptyPreferences: UserPreferences = { followedCategoryIds: [], followedRegionIds: [], priorityCategoryIds: [], notificationsEnabled: false };
const Context = createContext<MobileState | null>(null);
export function MobileProvider({ children, services: suppliedServices }: PropsWithChildren<{ services?: MobileServices }>) {
  const config: unknown = Constants.expoConfig?.extra?.monisystem;
  const demo = typeof config === 'object' && config !== null && 'mode' in config && config.mode === 'demo' && !suppliedServices;
  const [services, setServices] = useState(suppliedServices);
  const [loading, setLoading] = useState(!demo);
  const [configurationError, setConfigurationError] = useState('');
  const [entered, setEntered] = useState(false);
  const [incidents, setIncidents] = useState<readonly Incident[]>(demo ? demoIncidents : []);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [regions, setRegions] = useState<readonly Region[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [preferences, setPreferences] = useState<UserPreferences>(emptyPreferences);
  const [revision, setRevision] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const capture = useRef<{ resolve(uri: string): void; reject(error: Error): void } | null>(null);
  const capturePhoto = useCallback(() => new Promise<string>((resolve, reject) => {
    if (capture.current) { reject(new Error('Já existe uma captura em andamento.')); return; }
    capture.current = { resolve, reject }; setCameraOpen(true);
  }), []);
  useEffect(() => () => { capture.current?.reject(new Error('Captura encerrada.')); capture.current = null; }, []);
  useEffect(() => {
    if (suppliedServices) { setServices(suppliedServices); return; }
    if (demo) { setLoading(false); return; }
    let active = true;
    async function initialize() {
      try {
        const composed = await composeMobileServices(capturePhoto);
        if (active) setServices(composed);
      } catch (e) { if (active) { setConfigurationError(e instanceof Error ? e.message : 'Integração nativa indisponível. Use o development build Android configurado.'); setLoading(false); } }
    }
    void initialize();
    return () => { active = false; };
  }, [suppliedServices, demo, capturePhoto]);
  useEffect(() => {
    if (!services) return;
    try { return services.auth.observeSession(session => { setEntered(session !== null); setLoading(false); if (!session) { setIncidents([]); setPreferences(emptyPreferences); capture.current?.reject(new Error('Sessão encerrada.')); capture.current = null; setCameraOpen(false); } }); }
    catch { setConfigurationError('Não foi possível observar a sessão Firebase.'); setLoading(false); }
  }, [services]);
  const refreshCatalog = useCallback(async () => {
    if (!services) return;
    try {
      const [cats, regs] = await Promise.all([services.catalog.getCategories(), services.catalog.getRegions()]);
      if (!cats.ok) throw new Error(cats.error.message); if (!regs.ok) throw new Error(regs.error.message);
      setCategories(cats.value); setRegions(regs.value); setCatalogError('');
    } catch (e) { setCatalogError(e instanceof Error ? e.message : 'Não foi possível consultar categorias e regiões.'); }
  }, [services]);
  useEffect(() => {
    if (!entered || !services) return;
    void refreshCatalog(); let active = true;
    void services.profile.getPreferences().then(result => { if (active && result.ok) setPreferences(result.value); }).catch(() => {});
    return () => { active = false; };
  }, [entered, services, refreshCatalog]);
  const rememberIncidents = useCallback((items: readonly Incident[]) => setIncidents(previous => Array.from(new Map([...previous, ...items].map(item => [item.id, item])).values())), []);
  return <Context.Provider value={{ services, demo, loading, configurationError, entered,
    enter: () => setEntered(true), leave: () => { setEntered(false); setPreferences(emptyPreferences); setIncidents(demo ? demoIncidents : []); },
    incidents, rememberIncidents, categories, regions, catalogError, refreshCatalog, preferences, setPreferences,
    revision, reportPublished: () => setRevision(value => value + 1),
  }}>{children}{cameraOpen && <NativeCamera onCapture={uri => { capture.current?.resolve(uri); capture.current = null; setCameraOpen(false); }} onCancel={() => { capture.current?.reject(new Error('Captura cancelada.')); capture.current = null; setCameraOpen(false); }} />}</Context.Provider>;
}
export function useMobile() {
  const state = useContext(Context);
  if (!state) throw new Error('MobileProvider ausente');
  return state;
}
