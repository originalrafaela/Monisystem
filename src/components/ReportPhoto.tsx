import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { PhotoReference } from '../domain/entities';
import { useMobile } from './MobileProvider';
import { ui } from './theme';
export function ReportPhoto({ photo }: { photo: PhotoReference }) {
  const { services } = useMobile();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; setUri(null); setFailed(false);
    if (services) void services.resolvePhoto(photo.storagePath).then(value => { if (active) setUri(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [services, photo.storagePath]);
  return uri && !failed ? <Image source={{ uri }} accessibilityLabel="Fotografia da ocorrência" style={{ width: '100%', height: 220, borderRadius: 12 }} resizeMode="cover" onError={() => setFailed(true)} /> : <View><Text style={ui.body}>{failed ? 'Fotografia indisponível no momento.' : 'Carregando fotografia…'}</Text></View>;
}
