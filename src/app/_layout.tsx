import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { MobileProvider, useMobile } from '../components/MobileProvider';
import { colors } from '../components/theme';
export default function RootLayout() {
  return <MobileProvider><Navigation /></MobileProvider>;
}
function Navigation() {
  const { entered, loading } = useMobile();
  return <><StatusBar style="dark" />
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' } }}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }} accessibilityElementsHidden>⌂</Text> }} />
      <Tabs.Protected guard={entered && !loading}>
        <Tabs.Screen name="ocorrencias" options={{ title: 'Ocorrências', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }} accessibilityElementsHidden>≡</Text> }} />
        <Tabs.Screen name="publicar" options={{ title: 'Publicar', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }} accessibilityElementsHidden>＋</Text> }} />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }} accessibilityElementsHidden>◎</Text> }} />
        <Tabs.Screen name="detalhes" options={{ href: null }} />
        <Tabs.Screen name="preferencias" options={{ href: null }} />
        <Tabs.Screen name="historico" options={{ href: null }} />
      </Tabs.Protected>
    </Tabs></>;
}
