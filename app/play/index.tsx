/**
 * Play hub — the launchpad for everything beyond the core feed: your level, the
 * season race, missions, achievements, the shop, sports, and the game formats.
 * Reached from the Profile screen. Pure navigation + a couple of live read hooks
 * for the at-a-glance header; no money is computed here.
 */
import { ScrollView, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { Card, Screen, Txt } from '@/components/ui';
import { LevelRing } from '@/components/domain';
import { colors } from '@/theme';
import { useCurrentUser } from '@/hooks/data';
import { useSeason } from '@/features/gamification/hooks';

interface HubItem {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  href: Href;
  tint: string;
}

const ITEMS: HubItem[] = [
  { key: 'season', icon: '🗓️', title: 'Season', subtitle: 'Climb the standings for Chip rewards', href: '/season', tint: colors.gold },
  { key: 'missions', icon: '🎯', title: 'Missions', subtitle: 'Daily & weekly goals', href: '/missions', tint: colors.jade },
  { key: 'achievements', icon: '🏅', title: 'Achievements', subtitle: 'Unlock badges as you play', href: '/achievements', tint: colors.royal },
  { key: 'play', icon: '🃏', title: 'Game Formats', subtitle: 'Parlays, brackets & squares', href: '/play/formats', tint: colors.coral },
  { key: 'cards', icon: '🃏', title: 'Card games', subtitle: 'Track a poker night & settle up', href: '/cards', tint: colors.jade },
  { key: 'sports', icon: '🏟️', title: 'Sports', subtitle: 'Browse fixtures & live games', href: '/sports', tint: colors.jade },
  { key: 'shop', icon: '🛍️', title: 'Shop', subtitle: 'Cosmetics, power-ups & Pro', href: '/shop', tint: colors.gold },
];

export default function PlayHubScreen() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: seasons } = useSeason();
  const season = seasons?.[0] ?? null;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Play' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {/* Level header */}
        <Card raised className="flex-row items-center gap-4">
          <LevelRing xp={user?.xp ?? 0} size={84} stroke={7} />
          <View className="flex-1 gap-1">
            <Txt variant="heading">{user?.displayName ?? 'Player'}</Txt>
            <Txt variant="caption" muted>
              {season ? `Competing in ${season.name}` : 'Off-season — stats still count'}
            </Txt>
          </View>
        </Card>

        <View className="gap-3">
          {ITEMS.map((item) => (
            <Card
              key={item.key}
              onPress={() => router.push(item.href)}
              className="flex-row items-center gap-3"
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceSunken,
                  borderWidth: 1,
                  borderColor: item.tint,
                }}
              >
                <Txt style={{ fontSize: 22 }}>{item.icon}</Txt>
              </View>
              <View className="flex-1">
                <Txt variant="label">{item.title}</Txt>
                <Txt variant="caption" muted numberOfLines={1}>
                  {item.subtitle}
                </Txt>
              </View>
              <Txt variant="body" muted>
                ›
              </Txt>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
