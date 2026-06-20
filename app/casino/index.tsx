/**
 * Casino hub — entry cards for the five provably-fair mini-games. Shows the live
 * balance (read-only; all Chip movement is server-side) and a persistent
 * "Chips have no cash value" disclosure. Each game has a configurable house edge
 * (entertainment, not cash) which we surface honestly.
 */
import { ScrollView, View, Pressable } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { ChipCounter, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useWallet } from '@/hooks/data';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

interface GameDef {
  key: string;
  title: string;
  emoji: string;
  blurb: string;
  href: Href;
  accent: string;
}

const GAMES: GameDef[] = [
  { key: 'slots', title: 'Slots', emoji: '🎰', blurb: 'Match three. Triple 7s pay big.', href: '/casino/slots', accent: colors.gold },
  { key: 'wheel', title: 'Wheel of Fortune', emoji: '🎡', blurb: 'Spin for up to 25×.', href: '/casino/wheel', accent: colors.royal },
  { key: 'scratch', title: 'Scratch Card', emoji: '🎟️', blurb: 'Scratch a 3×3. Three matches win.', href: '/casino/scratch', accent: colors.jade },
  { key: 'coinflip', title: 'Coin Flip', emoji: '🪙', blurb: 'Heads or tails, near-even odds.', href: '/casino/coinflip', accent: colors.coral },
  { key: 'crash', title: 'Crash', emoji: '🚀', blurb: 'Cash out before it crashes.', href: '/casino/crash', accent: colors.jade },
];

interface WalletView {
  chipsBalance?: number;
}

export default function CasinoHubScreen() {
  const router = useRouter();
  const { data: wallet } = useWallet();
  const balance = (wallet as WalletView | undefined)?.chipsBalance ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Casino' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}>
        <View className="flex-row items-center justify-between rounded-card border border-hairline bg-surface px-4 py-3">
          <View>
            <Txt variant="caption" muted className="uppercase tracking-widest">
              Your balance
            </Txt>
            <Txt variant="caption" muted>
              Play for fun — entertainment only
            </Txt>
          </View>
          <ChipCounter value={balance} size={26} color={colors.gold} />
        </View>

        <View className="gap-3">
          {GAMES.map((g) => (
            <Pressable
              key={g.key}
              onPress={() => router.push(g.href)}
              className="flex-row items-center gap-4 rounded-card border border-hairline bg-surface p-4"
            >
              <View
                className="items-center justify-center rounded-chip"
                style={{ width: 56, height: 56, backgroundColor: g.accent + '22', borderWidth: 1, borderColor: g.accent + '55' }}
              >
                <Txt style={{ fontSize: 30 }}>{g.emoji}</Txt>
              </View>
              <View className="flex-1">
                <Txt variant="heading">{g.title}</Txt>
                <Txt variant="caption" muted>
                  {g.blurb}
                </Txt>
              </View>
              <Txt variant="title" style={{ color: g.accent }}>
                ›
              </Txt>
            </Pressable>
          ))}
        </View>

        <View className="rounded-card border border-hairline bg-surface p-4">
          <Txt variant="label" className="mb-1">
            Provably fair
          </Txt>
          <Txt variant="caption" muted>
            Every round commits to a hashed server seed before you play and reveals
            it after, so you can verify the result was never rigged. Each game has a
            small house edge — it's entertainment, not a way to earn.
          </Txt>
        </View>

        <Txt variant="caption" muted className="px-1">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}
