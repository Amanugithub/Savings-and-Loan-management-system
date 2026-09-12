import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useLanguage } from '../../src/language';
import { colors, useTheme } from '../../src/theme';
export default function TabsLayout() { 
    const { language, isAmharic } = useLanguage(); 
    useTheme(); 
    const font = isAmharic ? { fontFamily: 'SurGraphicsBold', fontWeight: 'normal' } : {}; return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.subtle, tabBarStyle: { height: 76, paddingTop: 9, borderTopColor: colors.line, backgroundColor: colors.surface }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginBottom: 8, ...font } }}><Tabs.Screen name="index" options={{ title: language === 'am' ? 'መነሻ' : language === 'om' ? 'Manaa' : 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} /><Tabs.Screen name="loans" options={{ title: language === 'am' ? 'ብድር' : language === 'om' ? 'Liqii' : 'Loans', tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" size={size} color={color} /> }} /><Tabs.Screen name="history" options={{ title: language === 'am' ? 'ታሪክ' : language === 'om' ? 'Seenaa' : 'History', tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} /> }} /><Tabs.Screen name="notifications" options={{ title: language === 'am' ? 'መልዕክቶች' : language === 'om' ? 'Ergaa' : 'Inbox', tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} /> }} /></Tabs>; }
