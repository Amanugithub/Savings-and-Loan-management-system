import { AppText as Text } from '../../src/components';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { useLanguage } from '../../src/language';
import { api } from '../../src/api';
import { formatEthiopianDateTime } from '../../src/ethiopian-calendar';
import { Button, ErrorState, Skeleton, StatusPill } from '../../src/components';
import { colors, useTheme, radii, shadow } from '../../src/theme';
const money = (value) => 'ETB ' + Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
export default function Loans() { const { colors: themeColors } = useTheme(); s = createStyles(themeColors); const { token, member } = useAuth(); const { language } = useLanguage(); const q = useQuery({ queryKey: ['loans', member?.id], queryFn: () => api.loans(token), enabled: !!token }); const loans = q.data?.data ?? []; const guarantorRequests = q.data?.guarantor_requests ?? []; return <ScrollView style={s.page} contentContainerStyle={s.content}><View style={s.head}><View><Text style={s.kicker}>MEMBER FINANCE</Text><Text style={s.title}>Loans</Text><Text style={s.sub}>Your applications and repayment plans</Text></View><View style={s.headIcon}><Ionicons name="briefcase-outline" size={22} color={colors.green} /></View></View><Button onPress={() => router.push('/apply-loan')}>Apply for a loan</Button>{q.isError ? <ErrorState message="We couldn’t load your loans." retry={() => q.refetch()} /> : q.isLoading ? <><View style={s.sectionHead}><Text style={s.sectionTitle}>Your applications</Text></View><LoanSkeleton /><LoanSkeleton /></> : <>{guarantorRequests.length > 0 && <>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>Guarantor requests</Text></View>
    {guarantorRequests.map(loan => <LoanCard key={loan.id} loan={loan} language={language} isGuarantorRequest />)}
  </>}<View style={s.sectionHead}><Text style={s.sectionTitle}>{loans.length ? loans.length + ' applications' : 'Your applications'}</Text></View>{loans.length ? loans.map(loan => <LoanCard key={loan.id} loan={loan} language={language} />) : <View style={s.empty}><Ionicons name="briefcase-outline" size={26} color={colors.greenBright} /><Text style={s.emptyTitle}>No applications yet</Text><Text style={s.emptyBody}>When you’re ready, we’ll guide you through each step.</Text></View>}</>}</ScrollView>; }
function LoanCard({ loan, language, isGuarantorRequest }) {
  return <Pressable onPress={() => router.push('/loan/' + loan.id)} style={({ pressed }) => [s.card, pressed && s.pressed]}>
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.type}>{loan.type === 'self_secured' ? 'Self-secured loan' : 'Regular loan'}</Text>
        <Text style={s.date}>{isGuarantorRequest ? 'Requested' : 'Applied'} {formatEthiopianDateTime(loan.created_at, { language })}</Text>
      </View>
      <StatusPill status={loan.status} />
    </View>
    <Text style={s.amount}>{money(loan.principal_amount)}</Text>
    <View style={s.meta}>
      <Text style={s.metaText}>{loan.term_years} year term</Text>
      <Text style={s.metaText}>{loan.interest_rate}% interest</Text>
      {Number(loan.total_penalties) > 0 && <Text style={[s.metaText, s.metaPenalty]}>{money(loan.total_penalties)} penalties</Text>}
      <Ionicons name="chevron-forward" size={17} color={colors.subtle} />
    </View>
    {isGuarantorRequest && loan.status === 'awaiting_guarantor' && <View style={s.actionHint}><Ionicons name="alert-circle-outline" size={15} color={colors.amber} /><Text style={s.actionHintText}>Your response is needed</Text></View>}
  </Pressable>;
}
function LoanSkeleton() { return <View style={s.card}><View style={s.row}><View style={{ flex: 1, gap: 8 }}><Skeleton width="55%" height={15} /><Skeleton width="70%" height={11} /></View><Skeleton width={61} height={25} /></View><Skeleton width={135} height={25} /><View style={s.meta}><Skeleton width="30%" height={12} /><Skeleton width="30%" height={12} /></View></View>; }
let s;
const createStyles = (colors) => StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, paddingBottom: 36 }, head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }, kicker: { color: colors.greenBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 7 }, title: { fontSize: 28, fontWeight: '900', color: colors.ink, letterSpacing: -.7 }, sub: { fontSize: 14, color: colors.muted, marginTop: 5 }, headIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }, sectionHead: { marginTop: 28, marginBottom: 1 }, sectionTitle: { fontSize: 17, fontWeight: '900', color: colors.ink }, card: { backgroundColor: colors.surface, borderRadius: 18, padding: 17, marginTop: 12, ...shadow }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, type: { fontSize: 15, fontWeight: '800', color: colors.ink }, date: { fontSize: 11, color: colors.muted, marginTop: 6 }, amount: { fontSize: 24, fontWeight: '900', color: colors.ink, marginTop: 20 }, meta: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 14, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }, metaText: { fontSize: 12, color: colors.muted, flex: 1 }, metaPenalty: { color: colors.red, fontWeight: '800', flex: 0 }, actionHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: colors.amberSoft, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, alignSelf: 'flex-start' }, actionHintText: { fontSize: 11, fontWeight: '800', color: colors.amber }, empty: { backgroundColor: colors.surface, borderRadius: 18, padding: 28, marginTop: 13, alignItems: 'center', gap: 8 }, emptyTitle: { fontWeight: '800', color: colors.ink }, emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' }, pressed: { opacity: .8, transform: [{ scale: .985 }] } });
