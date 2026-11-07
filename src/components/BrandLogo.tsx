import { Image, View } from 'react-native';
import { colors } from './theme';

export function BrandLogo() {
  return <View style={{ alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 12 }}>
    <Image source={require('../../logo-aps.png')} accessibilityLabel="Monisystem — logo oficial" resizeMode="contain" style={{ width: '100%', maxWidth: 260, aspectRatio: 1 }} />
  </View>;
}
