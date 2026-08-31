import { AppText as Text } from '../src/components';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth';
import { Button } from '../src/components';
import { useLanguage } from '../src/language';
import { colors, useTheme, radii } from '../src/theme';

export default function Login() { const { colors: themeColors } = useTheme(); s = createStyles(themeColors);
  const { login } = useAuth();
  const { language, isAmharic, isOromo, t, changeLanguage } = useLanguage();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const font = isAmharic ? { fontFamily: 'SurGraphicsRegular' } : {};
  async function submit() {
    if (!phone || !password) return Alert.alert(t('almostThere'), t('required'));
    setBusy(true);
    try { await login(phone, password); router.replace('/(tabs)'); }
    catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.toLowerCase().includes('inactive')) Alert.alert(t('membershipInactive'), t('inactiveBody'));
      else if (message.toLowerCase().includes('no password')) Alert.alert(t('passwordNotSet'), t('passwordNotSetBody'));
      else Alert.alert(t('couldNotSignIn'), t('incorrect'));
    } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.page}>
    <View style={s.topRow}><View style={s.mark}><View style={s.markLeaf}><Ionicons name="leaf" size={24} color="#FFF" /></View><Text style={s.brand}>Tokuma Misomaf<Text style={s.brandDot}>.</Text></Text></View><LanguageSwitch language={language} isAmharic={isAmharic} isOromo={isOromo} changeLanguage={changeLanguage} t={t} /></View>
    <View style={s.copy}><Text style={[s.eyebrow, font]}>{t('memberAccess')}</Text><Text style={[s.heading, font]}>{t('heading')}</Text><Text style={[s.body, font]}>{t('loginBody')}</Text></View>
    <View style={s.form}><Text style={[s.label, font]}>{t('phone')}</Text><TextInput value={phone} onChangeText={setPhone} placeholder={t('phonePlaceholder')} placeholderTextColor={colors.subtle} keyboardType="phone-pad" style={[s.input, font]} /><Text style={[s.label, font]}>{t('password')}</Text><View style={s.password}><TextInput value={password} onChangeText={setPassword} placeholder={t('passwordPlaceholder')} placeholderTextColor={colors.subtle} secureTextEntry={!show} style={[s.input, font, { flex: 1, borderWidth: 0 }]} /><Pressable hitSlop={8} onPress={() => setShow(!show)}><Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} /></Pressable></View><Button disabled={busy} onPress={submit} style={{ marginTop: 10 }}><Text style={font}>{busy ? t('signingIn') : t('signIn')}</Text></Button><Text style={[s.help, font]}>{t('passwordHelp')}</Text></View>
  </KeyboardAvoidingView>;
}
function LanguageSwitch({ language, isAmharic, isOromo, changeLanguage, t }) { return <View style={s.language}><Pressable onPress={() => changeLanguage('en')} style={[s.languageItem, language === 'en' && s.languageActive]}><Text style={[s.languageText, language === 'en' && s.languageActiveText]}>EN</Text></Pressable><Pressable onPress={() => changeLanguage('am')} style={[s.languageItem, isAmharic && s.languageActive]}><Text style={[s.languageText, isAmharic && s.languageActiveText]}>አማ</Text></Pressable><Pressable onPress={() => changeLanguage('om')} style={[s.languageItem, isOromo && s.languageActive]}><Text style={[s.languageText, isOromo && s.languageActiveText]}>OM</Text></Pressable></View>; }
let s;
const createStyles = (colors) => StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 24, paddingTop: 24 }, topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, mark: { flexDirection: 'row', alignItems: 'center', gap: 10 }, markLeaf: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }, brand: { fontSize: 20, fontWeight: '900', letterSpacing: -.6, color: colors.ink }, brandDot: { color: colors.greenBright }, language: { flexDirection: 'row', backgroundColor: colors.mint, borderRadius: 12, padding: 3 }, languageItem: { minWidth: 35, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, languageActive: { backgroundColor: colors.surface }, languageText: { color: colors.muted, fontSize: 11, fontWeight: '900' }, languageActiveText: { color: colors.green }, copy: { marginTop: 58 }, eyebrow: { color: colors.greenBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 }, heading: { color: colors.ink, fontSize: 39, lineHeight: 45, fontWeight: '900', letterSpacing: -1.5, marginTop: 14 }, body: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 14, maxWidth: 310 }, form: { marginTop: 45 }, label: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 7, marginTop: 15 }, input: { minHeight: 52, borderRadius: radii.control, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 15, color: colors.ink, fontSize: 15 }, password: { minHeight: 52, borderRadius: radii.control, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingRight: 15 }, help: { color: colors.muted, textAlign: 'center', fontSize: 12, marginTop: 22 } });
