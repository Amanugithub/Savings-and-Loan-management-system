import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const lightColors = {
    ink: '#315249',
    muted: '#6B8179',
    subtle: '#9AAEA6',
    canvas: '#F4F8F5',
    surface: '#FFFFFF',
    line: '#DCE9E2',
    green: '#0D5C4A',
    greenBright: '#1B8A69',
    mint: '#DDF3E9',
    mintStrong: '#BCE7D3',
    amber: '#A56516',
    amberSoft: '#FFF1D5',
    red: '#B54747',
    redSoft: '#FCE8E7',
};
const darkColors = {
    ink: '#DCEBE4',
    muted: '#9CB5AA',
    subtle: '#78958A',
    canvas: '#0D1915',
    surface: '#172B24',
    line: '#29443A',
    green: '#53B88F',
    greenBright: '#6BCDA4',
    mint: '#1D3D32',
    mintStrong: '#315E4D',
    amber: '#E9B765',
    amberSoft: '#4A3922',
    red: '#F08A84',
    redSoft: '#4A292B',
};
export const colors = { ...lightColors };
export function applyTheme(mode) {
    Object.assign(colors, mode === 'dark' ? darkColors : lightColors);
}
export const themePalettes = { light: lightColors, dark: darkColors };
export const radii = { card: 18, control: 12, pill: 999 };
export const shadow = Platform.select({
    ios: { shadowColor: '#153F32', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 3 },
    default: {},
});

const ThemeContext = createContext(null);
export function ThemeProvider({ children }) {
    const [mode, setMode] = useState('light');
    const [ready, setReady] = useState(false);
    useEffect(() => {
        SecureStore.getItemAsync('member_theme').then((saved) => {
            if (saved === 'light' || saved === 'dark') setMode(saved);
        }).finally(() => setReady(true));
    }, []);
    applyTheme(mode);
    const toggleTheme = async () => {
        const next = mode === 'dark' ? 'light' : 'dark';
        setMode(next);
        await SecureStore.setItemAsync('member_theme', next);
    };
    const value = useMemo(() => ({
        mode,
        isDark: mode === 'dark',
        ready,
        toggleTheme,
        colors: mode === 'dark' ? darkColors : lightColors,
    }), [mode, ready]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
    const value = useContext(ThemeContext);
    if (!value) throw new Error('useTheme must be used inside ThemeProvider');
    return value;
}
