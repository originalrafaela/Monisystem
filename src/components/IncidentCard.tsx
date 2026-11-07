import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Coordinates, Incident, Report } from '../domain/entities';
import { Button } from './Button';
import { useMobile } from './MobileProvider';
import { ReportPhoto } from './ReportPhoto';
import { categoryLabels, demoRegions } from './demo-data';
import { colors, ui } from './theme';
export function IncidentCard({ incident, center }: { incident: Incident; center?: Coordinates | null }) {
  const { demo, services, categories, regions } = useMobile();
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => {
    let active = true; setReport(null);
    if (services) void services.reports.getIncidentReports(incident.id, null).then(result => { if (active && result.ok) setReport(result.value.items[0] ?? null); }).catch(() => {});
    return () => { active = false; };
  }, [services, incident.id, incident.updatedAt]);
  return <View style={ui.card}>
    <View style={ui.row}><Text style={[styles.badge, incident.state === 'expired' && styles.expiredBadge]}>{incident.state === 'active' ? '● Alerta ativo' : 'Alerta expirado'}</Text>{demo && <Text style={styles.detail}>SIMULADO</Text>}</View>
    <Text accessibilityRole="header" style={ui.heading}>{categories.find(item => item.id === incident.categoryId)?.label ?? categoryLabels[incident.categoryId]}</Text>
    <Text style={ui.body}>{regions.find(item => item.id === incident.regionId)?.name ?? (demo ? demoRegions[incident.regionId] : incident.regionId)}</Text>
    {center && <Text style={styles.detail}>A aproximadamente {distance(center, incident.location).toFixed(1)} km de sua posição de consulta</Text>}
    {report && <><ReportPhoto photo={report.photo} /><Text style={ui.body}>{report.description}</Text></>}
    <Text style={styles.detail}>{incident.reportCount} {incident.reportCount === 1 ? 'relato' : 'relatos agrupados'} · {new Date(incident.updatedAt).toLocaleString('pt-BR')}</Text>
    <Button title="Ver detalhes" secondary onPress={() => router.push({ pathname: '/detalhes', params: { id: incident.id } })} />
  </View>;
}
function distance(a: Coordinates, b: Coordinates) {
  const rad = Math.PI / 180;
  const sinLat = Math.sin((b.latitude - a.latitude) * rad / 2);
  const sinLon = Math.sin((b.longitude - a.longitude) * rad / 2);
  const value = sinLat ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * sinLon ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}
const styles = StyleSheet.create({
  badge: { fontSize: 12, fontWeight: '700', color: colors.primary, backgroundColor: colors.attentionBackground, borderRadius: 8, padding: 7 },
  expiredBadge: { backgroundColor: colors.background, color: colors.muted },
  detail: { fontSize: 13, lineHeight: 20, color: colors.muted },
});
