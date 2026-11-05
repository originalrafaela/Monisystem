import type { CategoryId, Incident, PublicProfile } from '../domain/entities';

export const categoryLabels: Record<CategoryId, string> = {
  traffic: 'Trânsito', accident: 'Acidente', waterlogging: 'Alagamento', flood: 'Inundação',
  'fallen-tree': 'Árvore caída', infrastructure: 'Infraestrutura', other: 'Outros',
};
export const categoryIds = Object.keys(categoryLabels) as CategoryId[];
export const demoRegions: Record<string, string> = { centro: 'Centro', jardim: 'Jardim das Flores', norte: 'Zona Norte' };
const referenceTime = Date.now();
export const demoIncidents: readonly Incident[] = [
  { id: 'demo-1', categoryId: 'waterlogging', regionId: 'centro', reportCount: 4, location: { latitude: -23.55, longitude: -46.63 }, geohash: '6gyf4', state: 'active', createdAt: referenceTime - 1200000, updatedAt: referenceTime - 300000, alertExpiresAt: referenceTime + 3600000, deleteAfter: referenceTime + 1209600000 },
  { id: 'demo-2', categoryId: 'fallen-tree', regionId: 'jardim', reportCount: 2, location: { latitude: -23.56, longitude: -46.64 }, geohash: '6gyf4', state: 'active', createdAt: referenceTime - 2400000, updatedAt: referenceTime - 600000, alertExpiresAt: referenceTime + 3600000, deleteAfter: referenceTime + 1209600000 },
  { id: 'demo-3', categoryId: 'infrastructure', regionId: 'norte', reportCount: 1, location: { latitude: -23.54, longitude: -46.62 }, geohash: '6gyf4', state: 'expired', createdAt: referenceTime - 86400000, updatedAt: referenceTime - 7200000, alertExpiresAt: referenceTime - 3600000, deleteAfter: referenceTime + 1209600000 },
];
export const demoProfile: PublicProfile = { id: 'demo-profile', nickname: 'Pessoa colaboradora', photo: null };
