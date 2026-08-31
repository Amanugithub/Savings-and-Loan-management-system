import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth';
import { LanguageProvider } from '../src/language';
import { colors, ThemeProvider, useTheme } from '../src/theme';

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
export default function Layout() {

    const [fontsLoaded] = useFonts({ SurGraphicsRegular: require('../assets/SurGraphics-Regular.ttf'),
                                     SurGraphicsBold: require('../assets/SurGraphics-Bold.ttf'), 
                                     SurGraphicsExtraBold: require('../assets/SurGraphics-ExtraBold.ttf') }); 
    if (!fontsLoaded) 
        return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
                    <ActivityIndicator color={colors.green} />
                </View>; 
    return <QueryClientProvider client={client}>
                <SafeAreaProvider>
                    <ThemeProvider>
                        <ThemeShell />
                    </ThemeProvider>
                </SafeAreaProvider>
            </QueryClientProvider>; }


function ThemeShell() { 
    const { isDark } = useTheme();
    return <LanguageProvider>
                <AuthProvider>
                    <StatusBar style={isDark ? 'light' : 'dark'}/>
                    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
                        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}/>
                    </SafeAreaView>
                </AuthProvider>
            </LanguageProvider>; }
