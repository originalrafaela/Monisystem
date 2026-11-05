import { StyleSheet } from 'react-native';

export const colors = {
  background: '#F3F7F5', surface: '#FFFFFF', primary: '#175541',
  accent: '#D7F1DF', text: '#17382D', muted: '#536A60', border: '#D5E2DA',
  danger: '#A52D35', warning: '#77510C',
} as const;

export const ui = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: colors.text },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  card: { backgroundColor: colors.surface, padding: 20, borderRadius: 20, gap: 12, borderWidth: 1, borderColor: colors.border },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
