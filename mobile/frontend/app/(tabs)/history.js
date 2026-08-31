import { AppText as Text } from '../../src/components';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { useLanguage } from '../../src/language';
import { api } from '../../src/api';
import { formatEthiopianDateTime } from '../../src/ethiopian-calendar';
import { ErrorState, Skeleton } from '../../src/components';
import { colors, useTheme, radii } from '../../src/theme';

const transactionKinds = {
  savings_deposit: { label: 'Savings deposit', color: '#087F5B', tint: '#C9F2E1', icon: 'arrow-down-circle-outline' },
  share_purchase: { label: 'Share purchase', color: '#056B8C', tint: '#C7ECF4', icon: 'pie-chart-outline' },
  opening_savings_balance: { label: 'Opening savings balance', color: '#6B3FA0', tint: '#EAD8FA', icon: 'wallet-outline' },
  opening_share_balance: { label: 'Opening share balance', color: '#A33A7A', tint: '#F6D5E9', icon: 'ribbon-outline' },
  penalty_payment: { label: 'Penalty payment', color: '#B42318', tint: '#FBD5D2', icon: 'alert-circle-outline' },
  registration_fee: { label: 'Registration fee', color: '#B25E05', tint: '#FFE3B5', icon: 'document-text-outline' },
  card_fee: { label: 'Card fee', color: '#8B5A00', tint: '#F9E2A8', icon: 'card-outline' },
  loan_disbursement: { label: 'Loan disbursement', color: '#2457A6', tint: '#D5E4FF', icon: 'arrow-down-circle-outline' },
  loan_installment: { label: 'Loan payment', color: '#5840A5', tint: '#DED8FF', icon: 'briefcase-outline' },
  loan_interest: { label: 'Loan interest', color: '#7138A5', tint: '#EAD8FF', icon: 'trending-up-outline' },
  loan_insurance: { label: 'Loan insurance', color: '#8C3D58', tint: '#F5D7E1', icon: 'shield-checkmark-outline' },
  member_exit_payout: { label: 'Exit payout', color: '#A13B35', tint: '#F8D8D2', icon: 'arrow-up-circle-outline' },
  bank_interest_income: { label: 'Bank interest', color: '#087A76', tint: '#C8EFEC', icon: 'trending-up-outline' },
};
const kindFor = (type) => transactionKinds[type] ?? { label: type.replaceAll('_', ' '), color: colors.muted, tint: colors.line, icon: 'swap-vertical-outline' };

export default function History() { const { colors: themeColors } = useTheme(); s = createStyles(themeColors);
  const { token, member } = useAuth();
  const { language } = useLanguage();
  const [mode, setMode] = useState('transactions');
  const tx = useQuery({ queryKey: ['transactions', member?.id], queryFn: () => api.transactions(token), enabled: !!token });
  const div = useQuery({ queryKey: ['dividends', member?.id], queryFn: () => api.dividends(token), enabled: !!token });
  return <ScrollView style={s.page} contentContainerStyle={s.content}><Text style={s.title}>History</Text><Text style={s.sub}>Your membership, from every angle</Text><View style={s.segment}><Pressable onPress={() => setMode('transactions')} style={[s.segmentItem, mode === 'transactions' && s.active]}><Text style={[s.segmentText, mode === 'transactions' && s.activeText]}>Transactions</Text></Pressable><Pressable onPress={() => setMode('dividends')} style={[s.segmentItem, mode === 'dividends' && s.active]}><Text style={[s.segmentText, mode === 'dividends' && s.activeText]}>Dividends</Text></Pressable></View>{mode === 'transactions' ? <><Text style={s.sectionLabel}>ACTIVITY TYPES</Text><View style={s.legend}>{Object.entries(transactionKinds).slice(0, 6).map(([key, kind]) => <View key={key} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: kind.color }]} /><Text style={s.legendText}>{kind.label}</Text></View>)}</View>{tx.isError ? <ErrorState message="We couldn’t load your transactions." retry={() => tx.refetch()} /> : tx.isLoading ? <><TransactionSkeleton /><TransactionSkeleton /><TransactionSkeleton /></> : tx.data?.length ? tx.data.map(item => <TransactionRow key={item.id} item={item} />) : <Empty title="No transactions yet" body="Your savings, shares and payments will appear here." />}</> : <>{div.isError ? <ErrorState message="We couldn’t load your dividends." retry={() => div.refetch()} /> : div.isLoading ? <><TransactionSkeleton /><TransactionSkeleton /></> : div.data?.length ? div.data.map(item => <View style={s.item} key={String(item.fiscal_year)}><View style={[s.itemIcon, { backgroundColor: colors.mint }]}><Text style={s.initial}>D</Text></View><View style={{ flex: 1 }}><Text style={s.itemTitle}>{item.fiscal_year} dividend</Text><Text style={s.itemDate}>{formatEthiopianDateTime(item.date_calculated, { language })}</Text></View><Text style={s.amount}>ETB {(Number(item.savings_dividend) + Number(item.share_dividend)).toLocaleString()}</Text></View>) : <Empty title="No dividends yet" body="Your calculated dividends will appear here." />}</>}</ScrollView>;
}
function TransactionRow({ item }) { const { language } = useLanguage(); const kind = kindFor(item.type); return <View style={s.item}><View style={[s.itemIcon, { backgroundColor: kind.tint }]}><Ionicons name={kind.icon} size={18} color={kind.color} /></View><View style={{ flex: 1, minWidth: 0 }}><Text style={s.itemTitle} numberOfLines={2}>{kind.label}</Text><Text style={s.itemDate} numberOfLines={1}>{formatEthiopianDateTime(item.date, { language })}</Text></View><Text style={[s.amount, { color: kind.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>ETB {Number(item.amount).toLocaleString()}</Text></View>; }
function TransactionSkeleton() { return <View style={s.item}><Skeleton width={40} height={40} /><View style={{ flex: 1, gap: 8 }}><Skeleton width="72%" height={13} /><Skeleton width="48%" height={11} /></View><Skeleton width={72} height={13} /></View>; }
function Empty({ title, body }) { return <View style={s.empty}><Ionicons name="file-tray-outline" size={28} color={colors.greenBright} /><Text style={s.emptyTitle}>{title}</Text><Text style={s.emptyBody}>{body}</Text></View>; }
let s;
const createStyles = (colors) => StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, paddingBottom: 36 }, title: { fontSize: 28, fontWeight: '900', color: colors.ink, letterSpacing: -.7 }, sub: { fontSize: 14, color: colors.muted, marginTop: 5 }, segment: { marginTop: 24, backgroundColor: colors.mint, padding: 4, borderRadius: radii.control, flexDirection: 'row' }, segmentItem: { flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingVertical: 11 }, active: { backgroundColor: colors.surface }, segmentText: { color: colors.muted, fontSize: 13, fontWeight: '800' }, activeText: { color: colors.green }, sectionLabel: { color: colors.subtle, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginTop: 25, marginBottom: 10 }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 7 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendDot: { width: 8, height: 8, borderRadius: 4 }, legendText: { color: colors.muted, fontSize: 10 }, item: { backgroundColor: colors.surface, borderRadius: 17, padding: 14, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }, itemIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, initial: { fontWeight: '900', color: colors.green, fontSize: 17 }, itemTitle: { fontSize: 13, fontWeight: '800', color: colors.ink, textTransform: 'capitalize' }, itemDate: { fontSize: 11, color: colors.muted, marginTop: 5 }, amount: { fontSize: 12, fontWeight: '900' }, empty: { backgroundColor: colors.surface, borderRadius: 18, padding: 28, alignItems: 'center', marginTop: 15, gap: 8 }, emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.ink }, emptyBody: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 } });
