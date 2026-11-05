import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { CategoryId, PriorityCategories } from '../domain/entities';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { useMobile } from '../components/MobileProvider';
import { categoryIds, categoryLabels, demoRegions } from '../components/demo-data';
import { ui } from '../components/theme';
export default function PreferencesScreen() {
  const { preferences, setPreferences, services, demo, regions, categories } = useMobile();
  const [value, setValue] = useState(preferences);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!demo);
  const [loaded, setLoaded] = useState(demo);
  useEffect(() => {
    if (!services) return;
    let active = true; setLoading(true);
    void services.profile.getPreferences().then(result => {
      if (!active) return;
      if (!result.ok) { setMessage(result.error.message); return; }
      setValue(result.value); setLoaded(true);
    }).catch(() => { if (active) setMessage('Não foi possível carregar preferências. Volte e tente novamente.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [services]);
  const categoryOptions = demo ? categoryIds.map(id => ({ id, label: categoryLabels[id] })) : categories;
  const regionOptions = demo ? Object.entries(demoRegions).map(([id, name]) => ({ id, name })) : regions;
  function priority(id: CategoryId) {
    const next = value.priorityCategoryIds.some(item => item === id) ? value.priorityCategoryIds.filter(item => item !== id) : [...value.priorityCategoryIds, id];
    if (next.length > 3) { setMessage('Escolha no máximo três prioridades.'); return; }
    setValue({ ...value, priorityCategoryIds: toPriorities(next) }); setMessage('');
  }
  async function save() {
    setBusy(true);
    try { if (services) { const result = await services.profile.savePreferences(value); if (!result.ok) throw new Error(result.error.message); } setPreferences(value); setMessage(demo ? 'Preferências guardadas apenas na memória da demonstração. Notificações não são enviadas.' : 'Preferências salvas.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }
  return <Screen><Text style={ui.title}>Preferências</Text><Text style={ui.heading}>Categorias de interesse</Text><View style={ui.row}>{categoryOptions.map(({ id, label }) => <Button key={id} disabled={busy || loading || !loaded} title={label} selected={value.followedCategoryIds.includes(id)} secondary={!value.followedCategoryIds.includes(id)} onPress={() => setValue({ ...value, followedCategoryIds: value.followedCategoryIds.includes(id) ? value.followedCategoryIds.filter(item => item !== id) : [...value.followedCategoryIds, id] })} />)}</View>
    <Text style={ui.heading}>Até três prioridades</Text><View style={ui.row}>{categoryOptions.map(({ id, label }) => <Button key={id} disabled={busy || loading || !loaded} title={label} selected={value.priorityCategoryIds.some(item => item === id)} secondary={!value.priorityCategoryIds.some(item => item === id)} onPress={() => priority(id)} />)}</View>
    <Text style={ui.heading}>Regiões acompanhadas {demo ? '(exemplos)' : ''}</Text><View style={ui.row}>{regionOptions.map(({ id, name }) => <Button key={id} disabled={busy || loading || !loaded} title={name} selected={value.followedRegionIds.includes(id)} secondary={!value.followedRegionIds.includes(id)} onPress={() => setValue({ ...value, followedRegionIds: value.followedRegionIds.includes(id) ? value.followedRegionIds.filter(item => item !== id) : [...value.followedRegionIds, id] })} />)}</View>
    {loading && <Text style={ui.body}>Carregando preferências…</Text>}
    <View style={ui.row}><Text style={ui.label}>Permitir notificações quando o serviço estiver disponível</Text><Switch accessibilityLabel="Receber notificações" disabled={busy || loading || !loaded} value={value.notificationsEnabled} onValueChange={notificationsEnabled => setValue({ ...value, notificationsEnabled })} /></View>
    <Button title="Salvar preferências" disabled={loading || !loaded} loading={busy} onPress={() => void save()} />{!!message && <Text style={ui.body} accessibilityLiveRegion="polite">{message}</Text>}
  </Screen>;
}

function toPriorities(items: readonly CategoryId[]): PriorityCategories {
  const [a, b, c] = items;
  return a ? b ? c ? [a, b, c] : [a, b] : [a] : [];
}
