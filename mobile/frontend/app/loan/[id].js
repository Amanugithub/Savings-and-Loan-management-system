import { useState } from 'react';
import { AppText as Text } from '../../src/components';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { useLanguage } from '../../src/language';
import { api } from '../../src/api';
import { formatEthiopianDate, formatEthiopianDateTime } from '../../src/ethiopian-calendar';
import { Button, ErrorState, Skeleton, StatusPill, ThemedAlert } from '../../src/components';
import { colors, useTheme, radii, shadow } from '../../src/theme';

const money = (v) => 'ETB ' + Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const BUCKET_LABEL = { collection_expense: 'Collection expense', interest_penalty: 'Interest / insurance / penalty', principal: 'Principal', cash_rounding_adjustment: 'Cash rounding adjustment' };
const INSTALLMENT_LABEL = { unpaid: 'Unpaid', partially_paid: 'Partially paid', paid: 'Paid' };

// Only the named guarantor may respond, and only while the loan is still
// awaiting_guarantor — the server enforces both with a conditional UPDATE,
// so a duplicate/late tap (e.g. after a slow or retried request) just gets
// a 409 back rather than double-applying. We also disable the buttons the
// moment a request is in flight so a fast double-tap can't even fire twice.
function GuarantorConsentCard({ loanId, queryKey }) {
  const { colors: themeColors } = useTheme();
  s = createStyles(themeColors);
  const { token } = useAuth();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(null); // 'approve' | 'decline' | null
  const [alreadyHandled, setAlreadyHandled] = useState(false);
  const respond = useMutation({
    mutationFn: (decision) => api.guarantorResponse(token, loanId, decision),
    onSuccess: () => { client.invalidateQueries({ queryKey }); client.invalidateQueries({ queryKey: ['loans'] }); },
    onError: (error) => { if (error.status === 409) setAlreadyHandled(true); },
  });

  return <View style={s.consentCard}>
    <View style={s.consentHeader}><Ionicons name="shield-checkmark-outline" size={20} color={themeColors.green} /><Text style={s.consentTitle}>You were asked to guarantee this loan</Text></View>
    <Text style={s.consentBody}>Approving confirms you accept responsibility if the borrower doesn't repay. This cannot be undone.</Text>
    <View style={s.consentActions}>
      <Button variant="secondary" onPress={() => setConfirm('decline')} disabled={respond.isPending} style={{ flex: 1 }}>Decline</Button>
      <Button onPress={() => setConfirm('approve')} disabled={respond.isPending} style={{ flex: 1 }}>Approve</Button>
    </View>
    {respond.isError && respond.error.status !== 409 && <Text style={s.consentError}>{respond.error.message}</Text>}
    <ThemedAlert
      visible={!!confirm}
      title={confirm === 'approve' ? 'Approve as guarantor?' : 'Decline this request?'}
      message={confirm === 'approve' ? 'You will be responsible for this loan if the borrower cannot repay it.' : 'The borrower will be notified and will need another guarantor to proceed.'}
      actions={[{ text: 'Cancel' }, { text: confirm === 'approve' ? 'Approve' : 'Decline', variant: confirm === 'decline' ? 'destructive' : undefined, onPress: () => respond.mutate(confirm) }]}
      onClose={() => setConfirm(null)}
    />
    <ThemedAlert visible={alreadyHandled} title="Already responded" message="This request was already answered — the page will refresh with the current status." actions={[{ text: 'OK', onPress: () => client.invalidateQueries({ queryKey }) }]} onClose={() => setAlreadyHandled(false)} />
  </View>;
}

function ScheduleSection({ schedule }) {
  if (!schedule?.length) return null;
  return <View style={s.section}>
    <Text style={s.sectionTitle}>Repayment schedule</Text>
    <View style={s.tableCard}>
      {schedule.map((installment) => <View key={installment.id} style={s.scheduleRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.scheduleNumber}>Installment {installment.installment_number}</Text>
          <Text style={s.scheduleDue}>Due {formatEthiopianDate(installment.due_date)}</Text>
        </View>
        <View style={s.scheduleAmounts}>
          <Text style={s.scheduleAmount}>{money(Number(installment.principal_due) + Number(installment.interest_due) + Number(installment.insurance_due))}</Text>
          <View style={[s.installmentPill, installment.status === 'paid' && s.installmentPillPaid, installment.status === 'partially_paid' && s.installmentPillPartial]}>
            <Text style={s.installmentPillText}>{INSTALLMENT_LABEL[installment.status] ?? installment.status}</Text>
          </View>
        </View>
      </View>)}
    </View>
  </View>;
}

function PenaltiesSection({ penalties, totalPenalties, outstandingPenaltyBalance }) {
  if (!penalties?.length) return null;
  return <View style={s.section}>
    <Text style={s.sectionTitle}>Overdue penalties</Text>
    <View style={s.tableCard}>
      <View style={s.penaltySummaryRow}>
        <View><Text style={s.scheduleDue}>Total accrued</Text><Text style={s.scheduleAmount}>{money(totalPenalties)}</Text></View>
        <View><Text style={s.scheduleDue}>Still outstanding</Text><Text style={[s.scheduleAmount, s.penaltyOutstanding]}>{money(outstandingPenaltyBalance)}</Text></View>
      </View>
      {penalties.map((penalty) => <View key={penalty.id} style={s.scheduleRow}>
        <Text style={s.scheduleNumber}>{penalty.penalty_period}</Text>
        <Text style={s.scheduleAmount}>{money(penalty.amount)}</Text>
      </View>)}
    </View>
  </View>;
}

function PaymentHistorySection({ payments, language }) {
  if (!payments?.length) return null;
  return <View style={s.section}>
    <Text style={s.sectionTitle}>Payment history</Text>
    {payments.map((payment) => <View key={payment.id} style={s.paymentCard}>
      <View style={s.row}><Text style={s.scheduleNumber}>{formatEthiopianDateTime(payment.payment_date, { language })}</Text><Text style={s.scheduleAmount}>{money(payment.amount)}</Text></View>
      {payment.allocations?.map((allocation) => <View key={allocation.id} style={s.allocationRow}><Text style={s.allocationLabel}>{BUCKET_LABEL[allocation.bucket] ?? allocation.bucket}</Text><Text style={s.allocationAmount}>{money(allocation.amount)}</Text></View>)}
    </View>)}
  </View>;
}

export default function LoanDetail() {
  const { colors: themeColors } = useTheme();
  s = createStyles(themeColors);
  const { id } = useLocalSearchParams();
  const { token, member } = useAuth();
  const { language } = useLanguage();
  const queryKey = ['loan', id];
  const q = useQuery({ queryKey, queryFn: () => api.loan(token, id), enabled: !!token && !!id });

  if (q.isError) return <ErrorState message="We couldn’t load this loan." retry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <View style={s.loading}><Skeleton width="100%" height={180} /><View style={{ gap: 14, width: '100%', marginTop: 18 }}><Skeleton width="70%" height={24} /><Skeleton width="90%" height={16} /><Skeleton width="90%" height={16} /></View></View>;

  const l = q.data;
  const isGuarantor = member?.id && l.guarantor_member_id === member.id;
  const needsGuarantorResponse = isGuarantor && l.status === 'awaiting_guarantor';

  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <Ionicons onPress={() => router.back()} name="arrow-back" size={24} color={colors.ink} />
    <View style={s.head}>
      <View><Text style={s.overline}>LOAN DETAILS</Text><Text style={s.title}>{l.type === 'self_secured' ? 'Self-secured loan' : 'Regular loan'}</Text></View>
      <StatusPill status={l.status} />
    </View>

    {needsGuarantorResponse && <GuarantorConsentCard loanId={l.id} queryKey={queryKey} />}

    <View style={s.hero}>
      <Text style={s.heroLabel}>PRINCIPAL</Text>
      <Text style={s.heroAmount}>{money(l.principal_amount)}</Text>
      <Text style={s.heroSub}>{l.term_years}-year term · {l.interest_rate}% interest</Text>
    </View>
    <View style={s.grid}>
      {[['Monthly installment', money(l.monthly_installment)], ['Monthly interest', money(l.monthly_interest_amount)], ['Insurance', money(l.insurance_amount)], ['Collateral', l.collateral_type === 'guarantor' ? 'Guarantor' : l.collateral_type === 'property' ? 'Property' : 'Self-secured']].map(([a, b]) => <View style={s.cell} key={a}><Text style={s.cellLabel}>{a}</Text><Text style={s.cellValue}>{b}</Text></View>)}
    </View>

    {Number(l.outstanding_balance) > 0 && <View style={s.balanceCard}>
      <Text style={s.balanceLabel}>Outstanding balance</Text>
      <Text style={s.balanceAmount}>{money(l.outstanding_balance)}</Text>
    </View>}

    <ScheduleSection schedule={l.schedule} />
    <PenaltiesSection penalties={l.penalties} totalPenalties={l.total_penalties} outstandingPenaltyBalance={l.outstanding_penalty_balance} />
    <PaymentHistorySection payments={l.payments} language={language} />

    <Text style={s.note}>{l.status === 'active' ? 'Payments are recorded by the cooperative office and will show here as they’re made.' : 'Loan applications are reviewed by the cooperative office. We’ll notify you when the status changes.'}</Text>
  </ScrollView>;
}

let s;
const createStyles = (colors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, paddingTop: 22, paddingBottom: 34 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  sub: { fontSize: 14, color: colors.muted },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginVertical: 26 },
  overline: { fontSize: 11, fontWeight: '900', letterSpacing: 1.3, color: colors.greenBright }, title: { fontSize: 26, fontWeight: '900', color: colors.ink, marginTop: 6 },
  hero: { backgroundColor: colors.green, borderRadius: radii.card, padding: 22 }, heroLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: colors.mintStrong }, heroAmount: { fontSize: 34, fontWeight: '900', color: '#FFF', marginTop: 13 }, heroSub: { fontSize: 13, color: '#D8F2E6', marginTop: 8 },
  grid: { backgroundColor: colors.surface, borderRadius: radii.card, marginTop: 14, padding: 5, flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '50%', padding: 15, borderBottomWidth: 1, borderRightWidth: 1, borderColor: colors.line }, cellLabel: { fontSize: 12, color: colors.muted }, cellValue: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 7 },
  balanceCard: { backgroundColor: colors.amberSoft, borderRadius: radii.card, padding: 18, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, balanceLabel: { fontSize: 13, fontWeight: '800', color: colors.amber }, balanceAmount: { fontSize: 20, fontWeight: '900', color: colors.ink },
  section: { marginTop: 24 }, sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.ink, marginBottom: 10 },
  tableCard: { backgroundColor: colors.surface, borderRadius: radii.card, ...shadow },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  scheduleNumber: { fontSize: 13, fontWeight: '800', color: colors.ink }, scheduleDue: { fontSize: 11, color: colors.muted, marginTop: 3 },
  scheduleAmounts: { alignItems: 'flex-end', gap: 6 }, scheduleAmount: { fontSize: 14, fontWeight: '900', color: colors.ink },
  installmentPill: { borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: colors.line }, installmentPillPartial: { backgroundColor: colors.amberSoft }, installmentPillPaid: { backgroundColor: colors.mint },
  installmentPillText: { fontSize: 10, fontWeight: '800', color: colors.ink },
  penaltySummaryRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line }, penaltyOutstanding: { color: colors.red },
  paymentCard: { backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, marginTop: 10, ...shadow },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  allocationRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  allocationLabel: { fontSize: 12, color: colors.muted }, allocationAmount: { fontSize: 12, fontWeight: '800', color: colors.ink },
  note: { fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 24, paddingHorizontal: 4 },
  consentCard: { backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, marginTop: 4, borderWidth: 1, borderColor: colors.mintStrong, ...shadow },
  consentHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 }, consentTitle: { fontSize: 15, fontWeight: '900', color: colors.ink, flex: 1 },
  consentBody: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 10 },
  consentActions: { flexDirection: 'row', gap: 10, marginTop: 16 }, consentError: { fontSize: 12, color: colors.red, marginTop: 10 },
});
