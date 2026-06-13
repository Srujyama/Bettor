import { View } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';

interface Props {
  children: React.ReactNode;
  className?: string;
  edges?: Edge[];
  scroll?: boolean;
}

export function Screen({ children, className = '', edges = ['top'] }: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        <View className={`flex-1 ${className}`}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
