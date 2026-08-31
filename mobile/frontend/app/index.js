import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/auth';
import { colors } from '../src/theme';
export default function Index() { 
    const { token, loading } = useAuth(); 
    if (loading)
        return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
                    <ActivityIndicator color={colors.green}/>
                </View>; 
    return <Redirect href={token ? '/(tabs)' : '/login'}/>; 
}
