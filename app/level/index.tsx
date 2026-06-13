/**
 * Level & XP — surfaces the player's level ring, XP-to-next-level, and the XP
 * earning table. Reached from the Profile screen. Read-only; XP is CF-maintained
 * on the user doc and level-up Chip rewards are granted server-side.
 */
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card, Screen, Txt } from '@/components/ui';
import { LevelRing } from '@/components/domain';
import { colors } from '@/theme';
import { useCurrentUser } from '@/hooks/data';
import { levelFromXp, levelUpReward, XP } from '@/shared/gamification';
import { formatChips } from '@/shared/money';

const XP_ROWS: { label: string; xp: number }[] = [
  { label: 'Place a bet', xp: XP.PLACE_BET },
  { label: 'Create a bet', xp: XP.CREATE_BET },
  { label: 'Win a bet', xp: XP.WIN_BET },
  { label: 'Resolve a bet', xp: XP.RESOLVE_BET },
  { label: 'Friend accepts your invite', xp: XP.INVITE_ACCEPTED },
  { label: 'Daily login', xp: XP.DAILY_LOGIN },
  { label: 'Complete a mission', xp: XP.MISSION_COMPLETE },
];

export default function LevelScreen() {
  const { data: user } = useCurrentUser();
  const xp = user?.xp ?? 0;
  const { level, intoLevel, span, nextLevelXp } = levelFromXp(xp);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Level & XP' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        <Card raised className="items-center gap-3 py-6">
          <LevelRing xp={xp} size={140} stroke={12} />
          <Txt variant="body" muted>
            {span - intoLevel} XP to level {level + 1}
          </Txt>
          <Txt variant="caption" muted>
            {formatChips(xp)} XP total · next level at {formatChips(nextLevelXp)}
          </Txt>
        </Card>

        <Card className="items-center gap-1 py-4">
          <Txt variant="caption" muted className="uppercase tracking-wide">
            Reward at level {level + 1}
          </Txt>
          <Txt variant="title" style={{ color: colors.gold, fontWeight: '900' }}>
            +{formatChips(levelUpReward(level + 1))} Chips
          </Txt>
        </Card>

        <Card className="gap-2">
          <Txt variant="label" dim className="uppercase tracking-wide">
            How you earn XP
          </Txt>
          {XP_ROWS.map((r) => (
            <View key={r.label} className="flex-row items-center justify-between">
              <Txt variant="body" dim>
                {r.label}
              </Txt>
              <Txt variant="label" style={{ color: colors.jade }}>
                +{r.xp} XP
              </Txt>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
