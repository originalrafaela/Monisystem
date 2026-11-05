import { useMemo, useRef, useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import type { CategoryId } from '../domain/entities';
import { Button } from '../components/Button';
import { DemoBanner } from '../components/DemoBanner';
import { Screen } from '../components/Screen';
import { useMobile } from '../components/MobileProvider';
import { categoryIds, categoryLabels } from '../components/demo-data';
import { PublicationAttempt, validateCoordinates } from '../components/publication';
import { colors, ui } from '../components/theme';
export default function PublishScreen() {
  const { services, demo, entered, categories, reportPublished } = useMobile();
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const attempt = useMemo(() => services ? new PublicationAttempt(services.photos, services.reports) : null, [services]);
  const [locked, setLocked] = useState(false);
  const actionLock = useRef(false);
  const readOnly = busy || locked;
  const categoryOptions = demo ? categoryIds.map(id => ({ id, label: categoryLabels[id] })) : categories;
  async function capture() {
    if (actionLock.current) return;
    actionLock.current = true; setMessage(''); setBusy(true);
    try { if (!services) throw new Error('Câmera nativa não instalada nesta demonstração. Nenhuma foto foi capturada.'); const captured = await services.capturePhoto();
      setPhoto(captured); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Câmera indisponível ou permissão negada. Verifique as permissões nas configurações Android.'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function locate() {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setMessage('');
    try { if (!services) throw new Error('GPS indisponível nesta demonstração. Informe manualmente as coordenadas do local do relato.'); const position = await services.currentLocation(); setLatitude(String(position.latitude)); setLongitude(String(position.longitude)); setConfirmed(false); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Localização indisponível ou permissão negada. Informe as coordenadas manualmente.'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function publish() {
    if (actionLock.current) return;
    const location = validateCoordinates(latitude, longitude);
    if (!category || description.trim().length < 10 || !photo || !location || !confirmed) {
      setMessage('Escolha a categoria, escreva pelo menos 10 caracteres, capture uma foto e confirme coordenadas válidas para o local do relato.'); return;
    }
    if (!services || !entered || !attempt) { setMessage('Publicação requer login e serviços reais conectados. Nenhuma ocorrência foi enviada.'); return; }
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setMessage('');
    try {
      await attempt.submit({ photoUri: photo, description, categoryId: category, location });
      setMessage('Ocorrência publicada com sucesso. Obrigado por colaborar!'); setPhoto(null); setDescription(''); setCategory(null); setLatitude(''); setLongitude(''); setConfirmed(false); setLocked(false); reportPublished();
    } catch (e) { setLocked(attempt.awaitingResult); setMessage(`${e instanceof Error ? e.message : 'Falha ao publicar.'}${attempt.awaitingResult ? ' Tente novamente para confirmar o mesmo envio. Os campos foram preservados.' : ''}`); }
    finally { actionLock.current = false; setBusy(false); }
  }
  return <Screen><Text style={ui.title}>Publicar ocorrência</Text>{demo && <DemoBanner />}<View style={ui.card}>
    <Text style={ui.label}>1. Fotografia do local</Text><Button title={photo ? 'Refazer fotografia' : 'Abrir câmera'} disabled={readOnly} onPress={() => void capture()} secondary />
    {photo && <Image source={{ uri: photo }} accessibilityLabel="Prévia da foto capturada" style={{ width: '100%', height: 220, borderRadius: 12 }} />}
    <Text style={ui.label}>2. Categoria</Text><View style={ui.row}>{categoryOptions.map(({ id, label }) => <Button key={id} title={label} disabled={readOnly} selected={category === id} secondary={category !== id} onPress={() => setCategory(id)} />)}</View>
    <Text style={ui.label}>3. Descrição</Text><TextInput accessibilityLabel="Descrição da ocorrência" editable={!readOnly} multiline maxLength={2000} value={description} onChangeText={setDescription} placeholder="O que aconteceu? Inclua um ponto de referência." placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 130, textAlignVertical: 'top' }]} />
    <Text style={ui.label}>4. Localização da ocorrência</Text><Text style={ui.body}>Sua posição atual só deve ser usada se você estiver no local do acontecimento. Confira as coordenadas antes de confirmar.</Text>
    <Button title="Obter minha posição para conferir" secondary disabled={readOnly} onPress={() => void locate()} />
    <TextInput accessibilityLabel="Latitude da ocorrência" editable={!readOnly} value={latitude} placeholder="Latitude, exemplo -23.55" style={ui.input} onChangeText={value => { setLatitude(value); setConfirmed(false); }} />
    <TextInput accessibilityLabel="Longitude da ocorrência" editable={!readOnly} value={longitude} placeholder="Longitude, exemplo -46.63" style={ui.input} onChangeText={value => { setLongitude(value); setConfirmed(false); }} />
    <Button title={confirmed ? 'Local do relato confirmado ✓' : 'Confirmar que este é o local do relato'} selected={confirmed} secondary={!confirmed} disabled={readOnly} onPress={() => setConfirmed(!confirmed)} />
    <Button title={locked ? 'Confirmar envio anterior' : 'Publicar'} disabled={demo || !categories.length} loading={busy} onPress={() => void publish()} />{!!message && <Text accessibilityLiveRegion="polite" style={ui.body}>{message}</Text>}
  </View></Screen>;
}
