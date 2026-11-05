import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { DemoBanner } from '../components/DemoBanner';
import { Screen } from '../components/Screen';
import { useMobile } from '../components/MobileProvider';
import { ui } from '../components/theme';
export default function HomeScreen() {
  const { services, entered, enter, demo, loading, configurationError } = useMobile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (entered && !loading) router.replace('/ocorrencias'); }, [entered, loading]);
  async function login() {
    if (!services) { setError('Login Google indisponível: configuração nativa e OAuth pendentes. Verifique a configuração do development build Android.'); return; }
    setBusy(true); setError('');
    try { const result = await services.auth.signInWithGoogle(); if (!result.ok) throw new Error(result.error.message); enter(); router.replace('/ocorrencias'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível entrar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <Screen><Text style={ui.title}>Monisystem</Text><Text style={ui.heading}>Sua cidade, nosso cuidado.</Text>{demo && <DemoBanner />}
    <View style={ui.card}><Text style={ui.title}>Informação que conecta a comunidade.</Text><Text style={ui.body}>Acompanhe trânsito, alagamentos e infraestrutura. Compartilhe relatos para ajudar quem está por perto.</Text>
    <Button title="Entrar com Google" disabled={loading || !services} loading={busy || loading} onPress={() => void login()} />
    {demo && <Button title={entered ? 'Continuar demonstração' : 'Explorar demonstração'} secondary onPress={() => { enter(); router.replace('/ocorrencias'); }} />}
    {!!configurationError && <Text accessibilityLiveRegion="polite" style={ui.body}>{configurationError}</Text>}
    {!!error && <Text accessibilityLiveRegion="polite" style={ui.body}>{error}</Text>}</View></Screen>;
}
