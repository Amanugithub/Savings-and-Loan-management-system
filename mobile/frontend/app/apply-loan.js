import { AppText as Text, ThemedAlert } from '../src/components';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../src/auth';
import { api } from '../src/api';
import { Button } from '../src/components';
import { colors, useTheme, radii, shadow } from '../src/theme';

const INTEREST_RATES = { 1: 8, 2: 8, 3: 10, 4: 11, 5: 13 };
const money = (value) => 'ETB ' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ApplyLoan() { const { colors: themeColors } = useTheme(); s = createStyles(themeColors);
  const { token, member } = useAuth();
  const client = useQueryClient();
  const [type, setType] = useState('regular');
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState(1);
  const [collateral, setCollateral] = useState('property');
  const [guarantor, setGuarantor] = useState('');
  const [alert, setAlert] = useState(null);
  const principal = Number(amount.replace(/,/g, ''));
  const rate = INTEREST_RATES[term];
  const months = term * 12;
  const interest = principal > 0 ? principal * rate / 100 : 0;
  const insurance = principal > 0 ? principal * 0.01 : 0;
  const total = principal + interest + insurance;
  const monthly = total / months;
  const mutation = useMutation({
    mutationFn: () => api.applyLoan(token, { type, principal_amount: principal, term_years: term, collateral_type: collateral, ...(collateral === 'guarantor' ? { guarantor_member_id: guarantor } : {}) }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['loans', member?.id] }); setAlert({ title: 'Application sent', message: 'Your loan application is now pending review.', actions: [{ text: 'View my loans', onPress: () => router.replace('/loans') }] }); },
  });
  function submit() {
    if (!principal || principal <= 0) return setAlert({ title: 'Check the amount', message: 'Enter an amount greater than zero.' });
    if (collateral === 'guarantor' && !guarantor) return setAlert({ title: 'Choose a guarantor', message: 'Enter the member ID of your guarantor.' });
    mutation.mutate();
  }
  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
    <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}><Ionicons name="arrow-back" size={18} color={themeColors.green} /><Text style={s.backText}>Back to loans</Text></Pressable>
    <Text style={s.title}>Plan your loan</Text>
    <Text style={s.sub}>See the full cost before you send your application.</Text>
    <Text style={s.label}>Loan type</Text>
    <View style={s.options}>{[['regular', 'Regular'], ['self_secured', 'Self-secured']].map(([value, label]) => <Pressable key={value} onPress={() => setType(value)} style={[s.option, type === value && s.selected]}><Text style={[s.optionText, type === value && s.selectedText]}>{label}</Text></Pressable>)}</View>
    <Text style={s.label}>How much do you need?</Text>
    <View style={s.amountInput}><Text style={s.currency}>ETB</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={themeColors.subtle} style={s.amountField} /></View>
    <Text style={s.label}>Repayment term</Text>
    <View style={s.options}>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} onPress={() => setTerm(value)} style={[s.term, term === value && s.selected]}><Text style={[s.optionText, term === value && s.selectedText]}>{value} yr</Text></Pressable>)}</View>
    <Text style={s.label}>Collateral</Text>
    <View style={s.options}>{[['property', 'Property'], ['guarantor', 'Guarantor']].map(([value, label]) => <Pressable key={value} onPress={() => setCollateral(value)} style={[s.option, collateral === value && s.selected]}><Text style={[s.optionText, collateral === value && s.selectedText]}>{label}</Text></Pressable>)}</View>
    {collateral === 'guarantor' && <><Text style={s.label}>Guarantor member ID</Text><TextInput value={guarantor} onChangeText={setGuarantor} placeholder="Enter member ID" placeholderTextColor={themeColors.subtle} style={s.input} /></>}
    {principal > 0 && <View style={s.breakdown}><View style={s.breakdownHeading}><View><Text style={s.breakdownKicker}>ESTIMATED COST</Text><Text style={s.breakdownTitle}>What repayment looks like</Text></View><View style={s.rate}><Text style={s.rateValue}>{rate}%</Text><Text style={s.rateLabel}>annual rate</Text></View></View><CostRow label="Principal" value={money(principal)} /><CostRow label={'Interest over ' + term + ' year' + (term === 1 ? '' : 's')} value={money(interest)} /><CostRow label="Insurance (1%)" value={money(insurance)} /><View style={s.totalRow}><View><Text style={s.totalLabel}>Estimated total repayment</Text><Text style={s.monthly}>About {money(monthly)} per month</Text></View><Text style={s.totalValue}>{money(total)}</Text></View><Text style={s.disclaimer}>Interest is calculated using the cooperative’s simple-interest schedule. Final approval and terms are confirmed by the office.</Text></View>}
    {mutation.isError && <Text style={s.error}>{mutation.error.message}</Text>}
    <Button disabled={mutation.isPending} onPress={submit} style={{ marginTop: 24 }}>{mutation.isPending ? 'Sending application…' : 'Submit application'}</Button>
    <ThemedAlert visible={!!alert} title={alert?.title} message={alert?.message} actions={alert?.actions} onClose={() => setAlert(null)} />
  </ScrollView></KeyboardAvoidingView>;
}
function CostRow({ label, value }) { return <View style={s.costRow}><Text style={s.costLabel}>{label}</Text><Text style={s.costValue}>{value}</Text></View>; }
let s;
const createStyles = (colors) => StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 20, paddingTop: 22, paddingBottom: 40 }, back: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' }, backText: { color: colors.green, fontWeight: '800', fontSize: 14 }, title: { fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -.8, marginTop: 25 }, sub: { fontSize: 14, color: colors.muted, lineHeight: 21, marginTop: 6, maxWidth: 310 }, label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 24, marginBottom: 8 }, options: { flexDirection: 'row', gap: 8 }, option: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }, term: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }, selected: { backgroundColor: colors.mint, borderColor: colors.greenBright }, optionText: { color: colors.muted, fontSize: 13, fontWeight: '800' }, selectedText: { color: colors.green }, amountInput: { minHeight: 58, borderWidth: 1, borderColor: colors.greenBright, borderRadius: radii.control, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 }, currency: { color: colors.greenBright, fontSize: 15, fontWeight: '900', paddingRight: 10, borderRightWidth: 1, borderRightColor: colors.line }, amountField: { flex: 1, color: colors.ink, fontSize: 22, fontWeight: '800', paddingLeft: 12 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, paddingHorizontal: 15, color: colors.ink, fontSize: 15 }, breakdown: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginTop: 28, ...shadow }, breakdownHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.line }, breakdownKicker: { color: colors.greenBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, breakdownTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 5 }, rate: { backgroundColor: colors.mint, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' }, rateValue: { color: colors.green, fontSize: 15, fontWeight: '900' }, rateLabel: { color: colors.muted, fontSize: 9, marginTop: 2 }, costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 }, costLabel: { color: colors.muted, fontSize: 13 }, costValue: { color: colors.ink, fontSize: 13, fontWeight: '800' }, totalRow: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 3, paddingTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, totalLabel: { color: colors.ink, fontSize: 14, fontWeight: '900' }, monthly: { color: colors.muted, fontSize: 11, marginTop: 4 }, totalValue: { color: colors.green, fontSize: 19, fontWeight: '900' }, disclaimer: { color: colors.subtle, fontSize: 10, lineHeight: 15, marginTop: 15 }, error: { color: colors.red, fontSize: 13, lineHeight: 19, marginTop: 18 } });
