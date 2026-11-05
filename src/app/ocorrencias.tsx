import { useState } from 'react';
import { router } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import type { CategoryId, Coordinates } from '../domain/entities';
import { Button } from '../components/Button';
import { DemoBanner } from '../components/DemoBanner';
import { FeedbackState } from '../components/FeedbackState';
import { IncidentCard } from '../components/IncidentCard';
import { Screen } from '../components/Screen';
import { useMobile } from '../components/MobileProvider';
import { useIncidentFeed } from '../components/useIncidentFeed';
import { categoryIds, categoryLabels, demoRegions } from '../components/demo-data';
import { ui } from '../components/theme';
export default function OccurrencesScreen() {
  const { services, demo, categories, regions, catalogError, refreshCatalog } = useMobile();
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [center, setCenter] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const feed = useIncidentFeed(center, category, region);
  async function locate() {
    if (!services || locating) return;
    setLocating(true); setLocationError('');
    try { setCenter(await services.currentLocation()); }
    catch (e) { setLocationError(e instanceof Error ? e.message : 'Localização indisponível. Verifique as configurações Android.'); }
    finally { setLocating(false); }
  }
  const availableCategories = demo ? categoryIds.map(id => ({ id, label: categoryLabels[id] })) : categories;
  const availableRegions = demo ? Object.entries(demoRegions).map(([id, name]) => ({ id, name })) : regions;
  return <Screen><View style={ui.row}><Text style={ui.title}>No seu radar</Text><Button title="Meu perfil" secondary onPress={() => router.navigate('/perfil')} /></View>
    {demo && <DemoBanner />}<Text style={ui.body}>{center ? `Posição de consulta: ${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)} · raio de 5 km` : 'Obtenha sua localização para consultar ocorrências em até 5 km.'}</Text>
    {!demo && <Button title="Obter localização atual" loading={locating} secondary onPress={() => void locate()} />}
    {!!locationError && <><Text style={ui.body} accessibilityLiveRegion="polite">{locationError}</Text><Button title="Abrir configurações Android" secondary onPress={() => { void Linking.openSettings().catch(() => setLocationError('Abra as configurações do Android manualmente.')); }} /></>}
    {!!catalogError && <><Text style={ui.body}>{catalogError}</Text><Button title="Recarregar categorias e regiões" secondary onPress={() => void refreshCatalog()} /></>}
    <Text style={ui.label}>Categorias</Text><View style={ui.row}><Button title="Todas" selected={!category} secondary={!!category} onPress={() => setCategory(null)} />{availableCategories.map(item => <Button key={item.id} title={item.label} selected={category === item.id} secondary={category !== item.id} onPress={() => setCategory(item.id)} />)}</View>
    <Text style={ui.label}>Regiões</Text><View style={ui.row}><Button title="Todas as regiões" selected={!region} secondary={!!region} onPress={() => setRegion(null)} />{availableRegions.map(item => <Button key={item.id} title={item.name} secondary={region !== item.id} selected={region === item.id} onPress={() => setRegion(item.id)} />)}</View>
    <Button title="Atualizar lista" loading={feed.busy} disabled={!demo && !center} onPress={() => void feed.refresh()} secondary />
    {!!feed.error && <Text style={ui.body} accessibilityLiveRegion="polite">{feed.error}</Text>}
    {feed.busy && !feed.items.length ? <FeedbackState status="loading" onRetry={() => void feed.refresh()} /> : feed.items.length ? feed.items.map(incident => <IncidentCard key={incident.id} incident={incident} center={center} />) : (demo || center) ? <FeedbackState status={feed.error ? 'error' : 'empty'} onRetry={() => void feed.refresh()} /> : <View style={ui.card}><Text style={ui.body}>Sua localização será usada somente para esta consulta. O local de uma nova publicação será confirmado separadamente.</Text></View>}
    {feed.hasMore && <Button title="Carregar mais ocorrências" loading={feed.busy} secondary onPress={() => void feed.loadMore()} />}
    <Button title="Publicar ocorrência" onPress={() => router.navigate('/publicar')} />
    <Button title="Histórico e indicadores" secondary onPress={() => router.push('/historico')} />
  </Screen>;
}
