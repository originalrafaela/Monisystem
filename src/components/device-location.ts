import * as Location from 'expo-location';
import type { Coordinates } from '../domain/entities';

/** One foreground reading; never watches or stores the user's movement. */
export async function currentLocation(): Promise<Coordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error(permission.canAskAgain
    ? 'Localização não autorizada. Permita o GPS ou informe manualmente o local do relato.'
    : 'Permissão de localização bloqueada. Habilite-a nas configurações do Android ou informe as coordenadas manualmente.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Localização desativada. Ative o GPS do Android e tente novamente.');
  const position = await new Promise<Location.LocationObject>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('O GPS demorou para responder. Vá a um local aberto e tente novamente.')), 20_000);
    void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then(resolve, () => reject(new Error('Não foi possível obter o GPS. Tente novamente ou informe coordenadas manualmente.'))).finally(() => clearTimeout(timeout));
  });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
