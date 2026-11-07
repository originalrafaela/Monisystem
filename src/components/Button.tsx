import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from './theme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
  selected?: boolean;
}
export function Button({ title, onPress, disabled = false, loading = false, secondary = false, selected }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, selected && styles.selected, (pressed || disabled || loading) && styles.dim]}>
      {loading && <ActivityIndicator color={secondary || selected ? colors.primary : colors.surface} />}
      <Text style={[styles.text, (secondary || selected) && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: colors.attentionBackground, borderWidth: 1, borderColor: colors.accent },
  text: { color: colors.surface, fontSize: 15, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  secondaryText: { color: colors.primary }, dim: { opacity: 0.55 },
});
