import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, ui } from './theme';

export type FeedbackStatus = 'ready' | 'loading' | 'error' | 'empty';
export function FeedbackState({ status, onRetry }: { status: Exclude<FeedbackStatus, 'ready'>; onRetry: () => void }) {
  const content = {
    loading: ['Carregando ocorrências', 'Consultando ocorrências.'],
    error: ['Não foi possível carregar', 'Verifique a conexão e tente novamente.'],
    empty: ['Nenhuma ocorrência por aqui', 'Não há resultados para os filtros selecionados.'],
  }[status];
  return <View style={ui.card} accessibilityLiveRegion="polite">
    {status === 'loading' && <ActivityIndicator size="large" color={colors.primary} />}
    <Text accessibilityRole="header" style={ui.heading}>{content[0]}</Text>
    <Text style={ui.body}>{content[1]}</Text>
    {status !== 'loading' && <Button title={status === 'error' ? 'Tentar novamente' : 'Tentar novamente'} onPress={onRetry} secondary />}
  </View>;
}
