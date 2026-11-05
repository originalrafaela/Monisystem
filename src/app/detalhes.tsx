import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Report } from '../domain/entities';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { DemoBanner } from '../components/DemoBanner';
import { ReportPhoto } from '../components/ReportPhoto';
import { useMobile } from '../components/MobileProvider';
import { categoryLabels } from '../components/demo-data';
import { ui } from '../components/theme';
export default function DetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { incidents, demo, services, regions, categories } = useMobile();
  const incident = incidents.find(item => item.id === id);
  const [reports, setReports] = useState<readonly Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const load = useCallback(async (append = false) => {
    if (!services || !id || (append && (lock.current || !cursorRef.current))) return;
    const version = ++generation.current;
    lock.current = true; setBusy(true); setError('');
    if (!append) setReports([]);
    try {
      const result = await services.reports.getIncidentReports(id, append ? cursorRef.current : null);
      if (version !== generation.current) return;
      if (!result.ok) throw new Error(result.error.message);
      setReports(previous => append ? Array.from(new Map([...previous, ...result.value.items].map(item => [item.id, item])).values()) : result.value.items);
      cursorRef.current = result.value.nextCursor; setCursor(result.value.nextCursor);
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'Não foi possível consultar os relatos.'); }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  }, [services, id]);
  useEffect(() => { const requestGeneration = generation; const requestLock = lock; void load(); return () => { requestGeneration.current++; requestLock.current = false; }; }, [load]);
  const categoryId = incident?.categoryId ?? reports[0]?.categoryId;
  const regionId = incident?.regionId ?? reports[0]?.regionId;
  const location = incident?.location ?? reports[0]?.location;
  return <Screen><Button title="Voltar ao feed" secondary onPress={() => router.replace('/ocorrencias')} />{demo && <DemoBanner />}
    <View style={ui.card}><Text style={ui.title}>{categoryId ? categories.find(item => item.id === categoryId)?.label ?? categoryLabels[categoryId] : 'Detalhes da ocorrência'}</Text>
      {incident && <><Text style={ui.body}>{incident.state === 'active' ? 'Alerta ativo' : 'Alerta expirado'}</Text><Text style={ui.body}>{incident.reportCount} relatos relacionados</Text><Text style={ui.body}>{new Date(incident.updatedAt).toLocaleString('pt-BR')}</Text></>}
      {regionId && <Text style={ui.heading}>{regions.find(item => item.id === regionId)?.name ?? regionId}</Text>}
      {location && <Text style={ui.body}>Localização aproximada: {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}</Text>}
      {demo && <Text style={ui.body}>Fotos e descrições não fazem parte deste exemplo fictício.</Text>}
    </View>
    {reports.map(report => <View style={ui.card} key={report.id}><ReportPhoto photo={report.photo} /><Text style={ui.body}>{report.description}</Text><Text style={ui.body}>{new Date(report.createdAt).toLocaleString('pt-BR')}</Text><Text style={ui.body}>Alerta {report.alertExpiresAt > Date.now() ? 'vigente' : 'expirado'}</Text></View>)}
    {busy && <Text accessibilityLiveRegion="polite" style={ui.body}>Carregando relatos…</Text>}
    {!!error && <Text accessibilityLiveRegion="polite" style={ui.body}>{error}</Text>}
    {!demo && !busy && !error && !reports.length && <Text style={ui.body}>Nenhum relato disponível. A ocorrência pode ter expirado.</Text>}
    {!demo && <Button title={cursor ? 'Carregar mais relatos' : 'Atualizar relatos'} loading={busy} secondary onPress={() => void load(cursor !== null)} />}
  </Screen>;
}
