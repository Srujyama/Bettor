/**
 * BetCard — the atomic "playing card" surface for a bet in feeds and discovery.
 * Title, category pill, creator avatar+name, a draining CountdownRing, the pool
 * total via ChipCounter, the TwoSidedBar split, a status pill and entry count.
 * A foil-gradient hairline frames the card. Presentational: data in via props,
 * tap fires onPress(betId).
 */
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import {
  Avatar,
  ChipCounter,
  CountdownRing,
  Pill,
  TwoSidedBar,
  Txt,
} from '@/components/ui';
import { colors, categoryColor } from '@/theme';
import { formatChips } from '@/shared/money';
import { BET_STATUS, type BetStatus } from '@/shared/constants';
import type { Bet, BetEntry } from '@/shared/schemas';

interface Props {
  bet: Bet;
  myEntry?: BetEntry | null;
  onPress: (betId: string) => void;
}

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

/** Bet status → readable label + pill tone. */
const STATUS_META: Record<BetStatus, { label: string; tone: PillTone }> = {
  [BET_STATUS.DRAFT]: { label: 'Draft', tone: 'muted' },
  [BET_STATUS.OPEN]: { label: 'Open', tone: 'jade' },
  [BET_STATUS.LOCKED]: { label: 'Locked', tone: 'royal' },
  [BET_STATUS.PENDING_RESOLUTION]: { label: 'Resolving', tone: 'gold' },
  [BET_STATUS.DISPUTED]: { label: 'Disputed', tone: 'coral' },
  [BET_STATUS.RESOLVED]: { label: 'Resolved', tone: 'gold' },
  [BET_STATUS.SETTLED]: { label: 'Settled', tone: 'muted' },
  [BET_STATUS.CANCELLED]: { label: 'Cancelled', tone: 'muted' },
  [BET_STATUS.VOIDED]: { label: 'Voided', tone: 'muted' },
};

const CATEGORY_TONE: Record<string, PillTone> = {
  sports: 'jade',
  weather: 'royal',
  social: 'coral',
  gaming: 'gold',
  custom: 'muted',
  prop: 'royal',
};

export function BetCard({ bet, myEntry, onPress }: Props) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const statusMeta = STATUS_META[bet.status as BetStatus] ?? STATUS_META[BET_STATUS.OPEN];
  const segments = bet.outcomes.map((o) => ({
    outcomeId: o.id,
    label: o.label,
    amount: bet.poolByOutcome[o.id] ?? 0,
  }));
  const accent = categoryColor[bet.category] ?? colors.muted;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(bet.betId);
  };

  return (
    <Animated.View style={aStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => (scale.value = withSpring(0.98, { damping: 16 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 16 }))}
        accessibilityRole="button"
      >
        {/* Matte card: flat surface + hairline border + one solid category
            accent stripe down the left edge (replaces the old foil-gradient
            rainbow frame, which read glossy, not matte). */}
        <View className="relative overflow-hidden gap-3 rounded-card border border-hairline bg-surface p-4">
          <View
            style={{ backgroundColor: accent }}
            className="absolute left-0 top-0 bottom-0 w-1"
          />
          {/* pad the content clear of the accent bar */}
          <View className="gap-3 pl-1">
            {/* Header: category + status, ring on the right */}
            <View className="flex-row items-start gap-3">
              <View className="flex-1 gap-2">
                <View className="flex-row items-center gap-2">
                  <Pill label={bet.category} tone={CATEGORY_TONE[bet.category] ?? 'muted'} />
                  <Pill label={statusMeta.label} tone={statusMeta.tone} />
                </View>
                <Txt variant="heading" numberOfLines={2}>
                  {bet.title}
                </Txt>
              </View>
              <CountdownRing lockAt={bet.lockAt} createdAt={bet.createdAt} size={60} />
            </View>

            {/* Creator */}
            <View className="flex-row items-center gap-2">
              <Avatar uri={bet.creatorPhotoURL} name={bet.creatorName} size={24} />
              <Txt variant="caption" dim numberOfLines={1}>
                {bet.creatorName ?? 'Someone'}
              </Txt>
              <View className="flex-1" />
              <Txt variant="caption" muted>
                {bet.entryCount === 1 ? '1 in' : `${formatChips(bet.entryCount)} in`}
              </Txt>
            </View>

            {/* Pool + split */}
            <View className="gap-2 border-t border-hairline pt-3">
              <View className="flex-row items-baseline justify-between">
                <Txt variant="caption" muted className="uppercase tracking-widest">
                  Pot
                </Txt>
                <ChipCounter value={bet.poolTotal} size={26} color={colors.gold} />
              </View>
              <TwoSidedBar segments={segments} mySide={myEntry?.outcomeId ?? null} height={10} />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
