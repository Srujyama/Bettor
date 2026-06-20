/**
 * GameStakeBar — the stake selector shared by every casino game. A row of Chip
 * denomination chips + the primary action button (e.g. SPIN / FLIP / PLAY). The
 * client never computes money; this only chooses how many Chips to wager and
 * fires `onPlay`. Disabled when the stake exceeds balance or a round is busy.
 */
import { Pressable, View } from 'react-native';
import { Button, ChipCounter, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { CHIP_DENOMINATIONS, STAKE } from '@/shared/constants';

/** Casino games cap below the global ceiling — mirror of playGame's GAME_MAX_STAKE. */
const GAME_MAX_STAKE = 5_000;

const PRESETS = CHIP_DENOMINATIONS.filter((d) => d >= STAKE.MIN && d <= GAME_MAX_STAKE);

interface Props {
  stake: number;
  onStakeChange: (stake: number) => void;
  balance: number;
  onPlay: () => void;
  playLabel: string;
  /** A round is animating / the callable is in-flight. */
  busy?: boolean;
  tone?: 'jade' | 'coral' | 'gold' | 'royal';
}

export function GameStakeBar({
  stake,
  onStakeChange,
  balance,
  onPlay,
  playLabel,
  busy,
  tone = 'gold',
}: Props) {
  const tooBig = stake > balance;
  const disabled = busy || tooBig || stake < STAKE.MIN;

  return (
    <View className="gap-3 rounded-card border border-hairline bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          Stake
        </Txt>
        <ChipCounter value={stake} size={18} color={colors.gold} />
      </View>

      <View className="flex-row flex-wrap gap-2">
        {PRESETS.map((amt) => {
          const active = amt === stake;
          const unaffordable = amt > balance;
          return (
            <Pressable
              key={amt}
              disabled={unaffordable || busy}
              onPress={() => onStakeChange(amt)}
              className={`rounded-pill border px-3 py-1.5 ${
                active ? 'border-gold/50 bg-gold/20' : 'border-hairline bg-white/5'
              }`}
              style={{ opacity: unaffordable ? 0.35 : 1 }}
            >
              <Txt
                variant="label"
                className="font-semibold"
                style={{ color: active ? colors.gold : colors.textDim }}
              >
                {amt}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {tooBig ? (
        <Txt variant="caption" style={{ color: colors.coral }}>
          Not enough Chips for that stake.
        </Txt>
      ) : null}

      <Button label={playLabel} tone={tone} loading={busy} disabled={disabled} onPress={onPlay} />
    </View>
  );
}
