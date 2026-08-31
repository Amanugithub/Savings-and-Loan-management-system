import React, { useState } from 'react';
import { AppText as Text, ErrorState, Skeleton } from '../../src/components';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { useLanguage } from '../../src/language';
import { api } from '../../src/api';
import { formatEthiopianDateTime } from '../../src/ethiopian-calendar';
import { colors, useTheme, radii } from '../../src/theme';

export default function Notifications() {
  const { colors: themeColors } = useTheme();
  s = createStyles(themeColors);
  const { token, member } = useAuth();
  const { language } = useLanguage();
  const [selected, setSelected] = useState(null);
  const client = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', member?.id], queryFn: () => api.notifications(token), enabled: !!token });
  const read = useMutation({ mutationFn: (id) => api.markRead(token, id), onSuccess: () => client.invalidateQueries({ queryKey: ['notifications', member?.id] }) });
  const openNotification = (item) => { setSelected(item); if (!item.is_read) read.mutate(item.id); };
  return <>
    <ScrollView style={s.page} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={() => q.refetch()} tintColor={themeColors.green} colors={[themeColors.green]} />}>
      <Text style={s.kicker}>FROM YOUR COOPERATIVE</Text>
      <Text style={s.title}>Inbox</Text>
      <Text style={s.sub}>Updates, reminders and loan decisions</Text>
      {q.isError ? <ErrorState message="We couldn’t load your notifications." retry={() => q.refetch()} /> : q.isLoading ? <><NotificationSkeleton /><NotificationSkeleton /><NotificationSkeleton /></> : q.data?.length ? q.data.map((item) => (
        <Pressable key={item.id} onPress={() => openNotification(item)} style={({ pressed }) => [s.item, !item.is_read && s.unread, pressed && s.pressed]}>
          <View style={[s.icon, !item.is_read && s.unreadIcon]}><Ionicons name={item.type === 'loan_status' ? 'briefcase-outline' : 'notifications-outline'} size={19} color={themeColors.green} /></View>
          <View style={{ flex: 1 }}><View style={s.row}><Text style={s.itemTitle}>{item.title}</Text>{!item.is_read && <View style={s.dot} />}</View><Text style={s.message}>{item.message}</Text><Text style={s.date}>{formatEthiopianDateTime(item.created_at, { language })}</Text></View>
          <Ionicons name="chevron-forward" size={17} color={themeColors.subtle} />
        </Pressable>
      )) : <View style={s.empty}><View style={s.emptyIcon}><Ionicons name="checkmark-circle-outline" size={30} color={themeColors.greenBright} /></View><Text style={s.emptyTitle}>You’re all caught up</Text><Text style={s.message}>New updates from Tokuma Misomaf will appear here.</Text></View>}
    </ScrollView>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      <Pressable style={s.modalBackdrop} onPress={() => setSelected(null)}>
        <View style={s.modalCard}>
          <View style={s.modalTop}><View style={s.modalIcon}><Ionicons name={selected?.type === 'loan_status' ? 'briefcase-outline' : 'notifications-outline'} size={21} color={themeColors.green} /></View><Pressable onPress={() => setSelected(null)} hitSlop={10} style={s.closeButton}><Ionicons name="close" size={21} color={themeColors.muted} /></Pressable></View>
          <Text style={s.modalTitle}>{selected?.title}</Text>
          <Text style={s.modalDate}>{selected ? formatEthiopianDateTime(selected.created_at, { language }) : ''}</Text>
          <Text style={s.modalMessage}>{selected?.message}</Text>
          {selected?.loan_id && <Pressable onPress={() => { setSelected(null); router.push('/loan/' + selected.loan_id); }} style={({ pressed }) => [s.modalAction, pressed && s.pressed]}><Text style={s.modalActionText}>View loan</Text><Ionicons name="arrow-forward" size={17} color="#FFF" /></Pressable>}
          <Pressable onPress={() => setSelected(null)} style={s.dismiss}><Text style={s.dismissText}>Close</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  </>;
}
function NotificationSkeleton() { return <View style={s.item}><Skeleton width={40} height={40} /><View style={{ flex: 1, gap: 8 }}><Skeleton width="65%" height={14} /><Skeleton width="92%" height={12} /><Skeleton width="38%" height={10} /></View></View>; }
let s;
const createStyles = (palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingBottom: 36 },
  kicker: { color: palette.greenBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 7 }, title: { fontSize: 28, fontWeight: '900', color: palette.ink, letterSpacing: -.7 }, sub: { fontSize: 14, color: palette.muted, marginTop: 5 },
  item: { backgroundColor: palette.surface, borderRadius: 17, padding: 15, marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, unread: { borderWidth: 1, borderColor: palette.mintStrong },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center' }, unreadIcon: { backgroundColor: palette.mintStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 }, itemTitle: { fontSize: 14, fontWeight: '800', color: palette.ink, flex: 1 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.greenBright }, message: { fontSize: 12, color: palette.muted, lineHeight: 18, marginTop: 5 }, date: { fontSize: 11, color: palette.subtle, marginTop: 7 },
  empty: { alignItems: 'center', backgroundColor: palette.surface, borderRadius: 18, padding: 30, marginTop: 20, gap: 8 }, emptyIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }, emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink }, pressed: { opacity: .8, transform: [{ scale: .985 }] },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(4, 20, 15, 0.58)', justifyContent: 'center', padding: 22 }, modalCard: { backgroundColor: palette.surface, borderRadius: 24, padding: 22, paddingBottom: 24, minHeight: 300, shadowColor: palette.ink, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, modalHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: palette.line, alignSelf: 'center', marginBottom: 20 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center' }, closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: palette.ink, fontSize: 21, lineHeight: 27, fontWeight: '900', marginTop: 20 }, modalDate: { color: palette.subtle, fontSize: 12, marginTop: 7 }, modalMessage: { color: palette.muted, fontSize: 15, lineHeight: 23, marginTop: 18 },
  modalAction: { minHeight: 48, borderRadius: radii.control, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }, modalActionText: { color: '#FFF', fontSize: 14, fontWeight: '800' }, dismiss: { alignItems: 'center', paddingVertical: 15, marginTop: 3 }, dismissText: { color: palette.muted, fontSize: 13, fontWeight: '700' },
});
