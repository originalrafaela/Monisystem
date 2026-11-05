import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './Button';
import { colors, ui } from './theme';

/** Mounted only while capturing so hidden tabs never keep the camera open. */
export function NativeCamera({ onCapture, onCancel }: { onCapture(uri: string): void; onCancel(): void }) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  async function capture() {
    if (!ready || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.65, exif: false, shutterSound: true });
      if (!photo?.uri) throw new Error('Não foi possível capturar. Tente novamente.');
      onCapture(photo.uri);
    } catch { setError('Não foi possível capturar a foto. Confira a câmera e tente novamente.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal visible animationType="slide" onRequestClose={() => { if (!lock.current) onCancel(); }}>
    <SafeAreaView style={styles.screen}>
      <Text style={ui.heading}>Fotografar ocorrência</Text>
      {!permission ? <Text style={ui.body}>Verificando permissão…</Text> : !permission.granted ? <View style={ui.card}>
        <Text style={ui.body}>Autorize a câmera para fotografar o local da ocorrência. Áudio não será gravado.</Text>
        {permission.canAskAgain ? <Button title="Permitir câmera" onPress={() => { void requestPermission().catch(() => setError('Não foi possível solicitar a permissão da câmera.')); }} /> : <Button title="Abrir configurações de permissão" onPress={() => { void Linking.openSettings().catch(() => setError('Abra as configurações do Android e permita acesso à câmera.')); }} />}
      </View> : <><CameraView ref={camera} style={styles.camera} facing="back" mode="picture" mute onCameraReady={() => setReady(true)} onMountError={() => { setReady(false); setError('Câmera indisponível. Feche outros aplicativos que estejam usando a câmera.'); }} />
        <Button title="Capturar foto" disabled={!ready} loading={busy} onPress={() => void capture()} /></>}
      {!!error && <Text accessibilityLiveRegion="polite" style={ui.body}>{error}</Text>}
      <Button title="Cancelar captura" secondary disabled={busy} onPress={onCancel} />
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 16 },
  camera: { flex: 1, minHeight: 200, borderRadius: 16, overflow: 'hidden' },
});
