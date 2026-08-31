import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [token, setToken] = useState(null);
    const [member, setMember] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => { SecureStore.getItemAsync('member_token').then(async (saved) => { if (saved) {
        setToken(saved);
        try {
            setMember(await api.member(saved));
        }
        catch {
            await SecureStore.deleteItemAsync('member_token');
            setToken(null);
        }
    } }).finally(() => setLoading(false)); }, []);
    const value = useMemo(() => ({ token, member, loading, login: async (phone, password) => { const result = await api.login(phone, password); await SecureStore.setItemAsync('member_token', result.token); setToken(result.token); setMember(result.member); }, logout: async () => { await SecureStore.deleteItemAsync('member_token'); setToken(null); setMember(null); } }), [token, member, loading]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value)
    throw new Error('useAuth must be used inside AuthProvider'); return value; }
