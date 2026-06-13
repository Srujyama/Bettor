/**
 * Achievements — a gallery grouped by tier (Bronze → Platinum). Every catalog
 * achievement is shown locked/unlocked from the user's unlocked set; secret
 * achievements that are still locked hide their details. Unlocking + Chip grants
 * happen server-side (awardProgress trigger); this screen is read-only.
 */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Screen, Txt } from '@/components/ui';
import { AchievementBadge } from '@/components/domain';
import { useAchievements } from '@/features/gamification/hooks';
import { ACHIEVEMENTS, type AchievementTier } from '@/shared/gamification';

const TIER_ORDER: AchievementTier[] = ['platinum', 'gold', 'silver', 'bronze'];
const TIER_TITLE: Record<AchievementTier, string> = {
  platinum: 'Platinum',
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
};

export default function AchievementsScreen() {
  const { data: unlocked } = useAchievements();

  const unlockedKeys = useMemo(
    () => new Set((unlocked ?? []).map((a) => a.key)),
    [unlocked],
  );

  const total = ACHIEVEMENTS.length;
  const have = useMemo(
    () => ACHIEVEMENTS.filter((a) => unlockedKeys.has(a.key)).length,
    [unlockedKeys],
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Achievements' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 18 }}>
        <View className="items-center gap-1 py-2">
          <Txt variant="display" style={{ fontWeight: '900' }}>
            {have}/{total}
          </Txt>
          <Txt variant="caption" muted className="uppercase tracking-wide">
            Achievements unlocked
          </Txt>
        </View>

        {TIER_ORDER.map((tier) => {
          const inTier = ACHIEVEMENTS.filter((a) => a.tier === tier);
          if (inTier.length === 0) return null;
          // Render two-per-row.
          const rows: (typeof inTier)[] = [];
          for (let i = 0; i < inTier.length; i += 2) rows.push(inTier.slice(i, i + 2));
          return (
            <View key={tier} className="gap-3">
              <Txt variant="label" dim className="px-1 uppercase tracking-wide">
                {TIER_TITLE[tier]}
              </Txt>
              {rows.map((row, ri) => (
                <View key={ri} className="flex-row gap-3">
                  {row.map((a) => (
                    <AchievementBadge
                      key={a.key}
                      icon={a.icon}
                      title={a.title}
                      description={a.description}
                      tier={a.tier}
                      reward={a.reward}
                      unlocked={unlockedKeys.has(a.key)}
                      secret={a.secret}
                    />
                  ))}
                  {row.length === 1 ? <View className="flex-1" /> : null}
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
