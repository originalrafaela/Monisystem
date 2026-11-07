import { StyleSheet } from 'react-native';

export const colors = {
  background: '#F5F5F5', surface: '#FFFFFF', primary: '#202020',
  accent: '#FFC400', text: '#202020', muted: '#666666', border: '#E5E5E5',
  danger: '#D9232E', warning: '#FFC400',
  attentionBackground: '#FFF4CC', criticalBackground: '#FDEBEC',
} as const;

export const ui = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '700', color: colors.text },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  caption: { fontSize: 13, lineHeight: 20, color: colors.muted },
  notice: { backgroundColor: colors.attentionBackground, color: colors.text, padding: 14, borderRadius: 12, fontSize: 14, lineHeight: 21 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  card: { backgroundColor: colors.surface, padding: 20, borderRadius: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
