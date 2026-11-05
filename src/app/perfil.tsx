import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import type { PublicProfile } from '../domain/entities';
import { Button } from '../components/Button';
import { DemoBanner } from '../components/DemoBanner';
import { Screen } from '../components/Screen';
import { useMobile } from '../components/MobileProvider';
import { demoProfile } from '../components/demo-data';
import { ReportPhoto } from '../components/ReportPhoto';
import { ui } from '../components/theme';
export default function ProfileScreen() {
  const { services, demo, leave } = useMobile();
  const [profile, setProfile] = useState<PublicProfile | null>(demo ? demoProfile : null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (services) void services.profile.getOwnProfile().then(result => { if (active) { if (result.ok) setProfile(result.value); else setMessage(result.error.message); } }).catch(() => { if (active) setMessage('Não foi possível consultar o perfil.'); });
    return () => { active = false; };
  }, [services]);
  async function logout() {
    setBusy(true);
    try { if (services) { const result = await services.auth.signOut(); if (!result.ok) throw new Error(result.error.message); } leave(); router.replace('/'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível sair.'); }
    finally { setBusy(false); }
  }
  return <Screen><Text style={ui.title}>Meu perfil</Text>{demo && <DemoBanner />}<View style={ui.card}>
    {profile?.photo && <ReportPhoto photo={profile.photo} />}
    <Text style={ui.heading}>{profile?.nickname ?? 'Consultando perfil…'}</Text><Text style={ui.body}>{demo ? 'Perfil fictício · nenhuma conta conectada.' : 'Perfil da comunidade'}</Text>
    <Button title="Preferências e regiões" onPress={() => router.push('/preferencias')} />
    <Button title="Histórico e indicadores" secondary onPress={() => router.push('/historico')} />
    <Button title={demo ? 'Sair da demonstração' : 'Sair da conta'} loading={busy} secondary onPress={() => void logout()} />
  </View><View style={ui.card}><Text style={ui.heading}>Minhas publicações</Text><Text style={ui.body}>{demo ? 'Você ainda não publicou. A demonstração não salva relatos.' : 'A consulta de publicações próprias ainda depende de um serviço de histórico pessoal.'}</Text></View>
  {!!message && <Text accessibilityLiveRegion="polite" style={ui.body}>{message}</Text>}</Screen>;
}
