import { AppText as Text, Button, ThemedAlert } from '../src/components';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useState } from 'react';
import { useAuth } from '../src/auth';
import { useLanguage } from '../src/language';
import { formatEthiopianDateTime } from '../src/ethiopian-calendar';
import { colors, radii, useTheme } from '../src/theme';

export default function Profile() {
  const { colors: themeColors, isDark, toggleTheme } = useTheme();
  s = createStyles(themeColors);
  const { member, logout } = useAuth();
  const { language, isAmharic, t, changeLanguage } = useLanguage();
  const [alert, setAlert] = useState(null);
  const font = isAmharic ? { fontFamily: 'SurGraphicsRegular' } : {};
  const display = (value) => value || t('notProvided');
  const gender = member?.gender === 'male' ? (language === 'am' ? 'ወንድ' : language === 'om' ? 'Dhiira' : 'Male') : member?.gender === 'female' ? (language === 'am' ? 'ሴት' : language === 'om' ? 'Dhalaa' : 'Female') : display(member?.gender);
  const joined = member?.date_joined ? formatEthiopianDateTime(member.date_joined, { language }) : null;

  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}><Ionicons name="arrow-back" size={22} color={themeColors.ink} /><Text style={[s.backText, font]}>{language === 'am' ? 'ወደ ኋላ' : language === 'om' ? 'Deebi’i' : 'Back'}</Text></Pressable>
    <View style={s.hero}>
      <View style={s.avatar}><Text style={s.avatarText}>{member?.name?.slice(0, 1).toUpperCase()}</Text></View>
      <View style={s.identity}><Text style={[s.name, font]}>{display(member?.name)}</Text><Text style={s.phone}>{display(member?.phone_number)}</Text><View style={s.status}><View style={s.statusDot} /><Text style={[s.statusText, font]}>{language === 'am' ? 'ንቁ' : language === 'om' ? 'Hojii irra' : 'Active'}</Text></View></View>
    </View>
    <View style={s.card}><Text style={[s.label, font]}>{t('personalDetails')}</Text><View style={s.detailGrid}><Detail icon="calendar-outline" label={t('age')} value={member?.age ? String(member.age) : null} fallback={t('notProvided')} /><Detail icon="person-outline" label={t('gender')} value={gender} /><Detail icon="location-outline" label={t('address')} value={member?.address} fallback={t('notProvided')} /><Detail icon="today-outline" label={t('dateJoined')} value={joined} fallback={t('notProvided')} /></View></View>
    {member?.heir_info && <View style={s.card}><Text style={[s.label, font]}>{t('heirInfo')}</Text><View style={s.infoRow}><View style={s.infoIcon}><Ionicons name="people-outline" size={18} color={themeColors.green} /></View><Text style={[s.infoValue, font]}>{member.heir_info}</Text></View></View>}
    <View style={s.card}><Text style={[s.label, font]}>{t('language')}</Text><Text style={[s.languageHint, font]}>{t('changeLanguage')}</Text><View style={s.language}><Pressable onPress={() => changeLanguage('en')} style={[s.languageItem, language === 'en' && s.languageActive]}><Text style={[s.languageText, language === 'en' && s.languageActiveText]}>English</Text></Pressable><Pressable onPress={() => changeLanguage('am')} style={[s.languageItem, language === 'am' && s.languageActive]}><Text style={[s.languageText, language === 'am' && s.languageActiveText, language === 'am' && s.amharic]}>አማርኛ</Text></Pressable><Pressable onPress={() => changeLanguage('om')} style={[s.languageItem, language === 'om' && s.languageActive]}><Text style={[s.languageText, language === 'om' && s.languageActiveText]}>Oromo</Text></Pressable></View></View>
    <View style={s.card}><Text style={[s.label, font]}>{t('appearance')}</Text><View style={s.settingRow}><View style={{ flex: 1 }}><Text style={[s.key, font]}>{t('darkMode')}</Text><Text style={[s.languageHint, font]}>{t('darkModeHint')}</Text></View><Switch value={isDark} onValueChange={toggleTheme} trackColor={{ false: themeColors.line, true: themeColors.mintStrong }} thumbColor={isDark ? themeColors.greenBright : themeColors.surface} /></View></View>
    <Button variant="secondary" onPress={() => setAlert({ title: t('changePassword'), message: language === 'am' ? 'የይለፍ ቃል መቀየር በቅርቡ ይጨመራል።' : 'Password change is connected to the API and will be added to this profile flow next.' })}><Text style={font}>{t('changePassword')}</Text></Button>
    <Pressable onPress={() => setAlert({ title: t('logOutQuestion'), message: t('logOutBody'), actions: [{ text: t('cancel') }, { text: t('logOut'), variant: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } }] })} style={s.logout}><Text style={[s.logoutText, font]}>{t('logOut')}</Text></Pressable>
    <ThemedAlert visible={!!alert} title={alert?.title} message={alert?.message} actions={alert?.actions} onClose={() => setAlert(null)} />
  </ScrollView>;
}

function Detail({ icon, label, value, fallback }) { const { colors: themeColors } = useTheme(); return <View style={s.detail}><View style={s.detailIcon}><Ionicons name={icon} size={17} color={themeColors.green} /></View><View style={{ flex: 1 }}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailValue}>{value || fallback}</Text></View></View>; }
let s;
const createStyles = (palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 22, paddingBottom: 34, gap: 14 }, back: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' }, backText: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  hero: { backgroundColor: palette.green, borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 }, avatar: { width: 72, height: 72, borderRadius: 25, backgroundColor: palette.mintStrong, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 31, fontWeight: '900', color: palette.green }, identity: { flex: 1 }, name: { fontSize: 23, fontWeight: '900', color: '#FFF' }, phone: { fontSize: 13, color: '#D8F2E6', marginTop: 4 }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.greenBright }, statusText: { color: '#D8F2E6', fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: palette.surface, borderRadius: radii.card, padding: 18 }, label: { color: palette.greenBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 13 }, detailGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }, detail: { width: '50%', flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingRight: 9 }, detailIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center' }, detailLabel: { color: palette.muted, fontSize: 11 }, detailValue: { color: palette.ink, fontSize: 13, fontWeight: '800', marginTop: 3 }, infoRow: { flexDirection: 'row', gap: 10, alignItems: 'center' }, infoIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center' }, infoValue: { flex: 1, color: palette.ink, fontSize: 13, lineHeight: 19 },
  languageHint: { color: palette.muted, fontSize: 12, marginBottom: 11 }, language: { flexDirection: 'row', backgroundColor: palette.mint, borderRadius: 12, padding: 3 }, languageItem: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, languageActive: { backgroundColor: palette.surface }, languageText: { color: palette.muted, fontSize: 13, fontWeight: '900' }, languageActiveText: { color: palette.green }, amharic: { fontFamily: 'SurGraphicsRegular' }, settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }, key: { color: palette.ink, fontSize: 14, fontWeight: '800' }, logout: { alignItems: 'center', padding: 14 }, logoutText: { color: palette.red, fontSize: 14, fontWeight: '800' },
});
