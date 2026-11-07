import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export function DemoBanner() {
  return <View style={styles.banner}><Text style={styles.text}>MODO DEMONSTRAÇÃO · Dados fictícios, sem conexão com serviços.</Text></View>;
}
const styles = StyleSheet.create({
  banner: { backgroundColor: colors.attentionBackground, padding: 12, borderRadius: 12 },
  text: { color: colors.primary, fontSize: 12, lineHeight: 18, fontWeight: '600' },
});
