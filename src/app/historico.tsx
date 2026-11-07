import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { CategoryId, RegionalMetric, Report } from '../domain/entities';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { ReportPhoto } from '../components/ReportPhoto';
import { useMobile } from '../components/MobileProvider';
import { ui } from '../components/theme';
export default function HistoryScreen() {
  const { services, demo, regions, categories, catalogError, refreshCatalog } = useMobile();
  const [region, setRegion] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [reports, setReports] = useState<readonly Report[]>([]);
  const [metrics, setMetrics] = useState<readonly RegionalMetric[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [metricError, setMetricError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const cursor = useRef<string | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const load = useCallback(async (append = false) => {
    if (!services || !region || (append && (lock.current || !cursor.current))) return;
    const version = ++generation.current; lock.current = true; setBusy(true); setError('');
    if (!append) { setReports([]); setMetrics([]); setMetricError(''); setHasMore(false); }
    try {
      const categoryIds = category ? [category] : [];
      const [history, indicators] = await Promise.allSettled([
        services.reports.getRegionalHistory({ regionId: region, categoryIds, cursor: append ? cursor.current : null }),
        append ? Promise.resolve(null) : services.metrics.getRegionalMetrics(region, categoryIds),
      ]);
      if (version !== generation.current) return;
      if (indicators.status === 'fulfilled' && indicators.value) {
        if (indicators.value.ok) setMetrics(indicators.value.value); else setMetricError(indicators.value.error.message);
      } else if (indicators.status === 'rejected') setMetricError('Indicadores indisponíveis. Tente novamente mais tarde.');
      if (history.status === 'rejected') throw new Error('Não foi possível consultar o histórico.');
      if (!history.value.ok) throw new Error(history.value.error.message);
      const page = history.value.value;
      setReports(previous => append ? Array.from(new Map([...previous, ...page.items].map(item => [item.id, item])).values()) : page.items);
      cursor.current = page.nextCursor; setHasMore(page.nextCursor !== null);
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'Histórico indisponível.'); }
    finally { if (version === generation.current) { setBusy(false); lock.current = false; } }
  }, [services, region, category]);
  useEffect(() => { const requestGeneration = generation; const requestLock = lock; void load(); return () => { requestGeneration.current++; requestLock.current = false; }; }, [load]);
  return <Screen><Text style={ui.title}>Histórico e indicadores</Text><Text style={ui.body}>Consulte relatos recentes por região. Relatos individuais e ocorrências agrupadas são contagens diferentes.</Text>
    {demo && <Text style={ui.body}>Histórico real e indicadores não estão disponíveis no modo demonstrativo.</Text>}
    {!!catalogError && <><Text style={ui.body}>{catalogError}</Text><Button title="Recarregar regiões" secondary onPress={() => void refreshCatalog()} /></>}
    <Text style={ui.label}>Selecione uma região</Text><View style={ui.row}>{regions.map(item => <Button key={item.id} title={item.name} selected={region === item.id} secondary={region !== item.id} onPress={() => setRegion(item.id)} />)}</View>
    <Text style={ui.label}>Categoria</Text><View style={ui.row}><Button title="Todas" selected={!category} secondary={!!category} onPress={() => setCategory(null)} />{categories.map(item => <Button key={item.id} title={item.label} selected={category === item.id} secondary={category !== item.id} onPress={() => setCategory(item.id)} />)}</View>
    {region && <Button title="Atualizar histórico e indicadores" secondary loading={busy} onPress={() => void load()} />}
    {!!error && <Text accessibilityLiveRegion="polite" style={ui.body}>{error}</Text>}
    <Text style={ui.heading}>Relatos recentes</Text>{busy && <Text accessibilityLiveRegion="polite" style={ui.body}>Consultando serviços…</Text>}
    {region && !busy && !error && !reports.length && <Text style={ui.body}>Nenhum relato recente para estes filtros.</Text>}
    {reports.map(report => <View key={report.id} style={ui.card}><Text style={ui.heading}>{categories.find(item => item.id === report.categoryId)?.label ?? report.categoryId}</Text><ReportPhoto photo={report.photo} /><Text style={ui.body}>{report.description}</Text><Text style={ui.caption}>{new Date(report.createdAt).toLocaleString('pt-BR')}</Text></View>)}
    {hasMore && <Button title="Carregar mais relatos" loading={busy} secondary onPress={() => void load(true)} />}
    <Text style={ui.heading}>Indicadores por categoria</Text>{!!metricError && <Text style={ui.body}>{metricError}</Text>}
    {region && !busy && !metricError && !metrics.length && <Text style={ui.body}>Nenhum indicador disponível para este período.</Text>}
    {metrics.map(item => <View key={`${item.regionId}-${item.categoryId}-${item.periodStart}`} style={ui.card}><Text style={ui.label}>{categories.find(cat => cat.id === item.categoryId)?.label ?? item.categoryId}</Text><Text style={ui.body}>{item.reportCount} relatos · {item.incidentCount} ocorrências</Text><Text style={ui.caption}>{new Date(item.periodStart).toLocaleDateString('pt-BR')} a {new Date(item.periodEnd).toLocaleDateString('pt-BR')}</Text><Text style={ui.caption}>Atualizado em {new Date(item.updatedAt).toLocaleString('pt-BR')}</Text></View>)}
  </Screen>;
}
