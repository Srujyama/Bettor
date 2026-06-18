/**
 * RivalryCard — the head-to-head summary surface for two players. Shows both
 * avatars facing off, the win record via HeadToHeadBar, the head-to-head bet
 * count, and your net Chips against this rival (jade when ahead, coral when
 * behind). Foil hairline frame to match BetCard. Presentational: the rivalry
 * doc + the two display identities come in via props.
 */
import { View } from 'react-native';
import { Avatar, ChipCounter, Pill, Txt } from '@/components/ui';
import { HeadToHeadBar } from './HeadToHeadBar';
import { colors } from '@/theme';
import type { Rivalry } from '@/shared/schemas-ext';

interface Identity {
  uid: string;
  name?: string;
  photoURL?: string | null;
}

interface Props {
  rivalry: Rivalry | null;
  me: Identity;
  them: Identity;
}

export function RivalryCard({ rivalry, me, them }: Props) {
  // Resolve "my" / "their" stats from the canonical A/B orientation of the doc.
  const meIsA = rivalry ? rivalry.uidA === me.uid : true;
  const myWins = rivalry ? (meIsA ? rivalry.aWins : rivalry.bWins) : 0;
  const theirWins = rivalry ? (meIsA ? rivalry.bWins : rivalry.aWins) : 0;
  const totalBets = rivalry?.totalBets ?? 0;
  // aNetChips is A's net; flip the sign if I'm B.
  const myNet = rivalry ? (meIsA ? rivalry.aNetChips : -rivalry.aNetChips) : 0;

  const ahead = myNet > 0;
  const tied = myNet === 0;

  return (
    <View className="gap-4 rounded-card border border-hairline bg-surface p-4">
      {/* Face-off */}
        <View className="flex-row items-center justify-between">
          <View className="items-center gap-1">
            <Avatar uri={me.photoURL} name={me.name} size={52} ring />
            <Txt variant="caption" className="text-jade" numberOfLines={1}>
              {me.name ?? 'You'}
            </Txt>
          </View>

          <View className="items-center gap-1">
            <Txt variant="title" style={{ color: colors.gold }}>
              {myWins}
              <Txt variant="heading" muted>
                {'  '}vs{'  '}
              </Txt>
              {theirWins}
            </Txt>
            <Txt variant="caption" muted className="uppercase tracking-widest">
              {totalBets === 1 ? '1 bet' : `${totalBets} bets`}
            </Txt>
          </View>

          <View className="items-center gap-1">
            <Avatar uri={them.photoURL} name={them.name} size={52} ring />
            <Txt variant="caption" className="text-coral" numberOfLines={1}>
              {them.name ?? 'Rival'}
            </Txt>
          </View>
        </View>

        <HeadToHeadBar
          leftWins={myWins}
          rightWins={theirWins}
          leftLabel={me.name ?? 'You'}
          rightLabel={them.name ?? 'Them'}
        />

        {/* Net chips */}
        <View className="flex-row items-center justify-between border-t border-hairline pt-3">
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Your net
          </Txt>
          {tied ? (
            <Pill label="Dead even" tone="muted" />
          ) : (
            <ChipCounter
              value={Math.abs(myNet)}
              size={24}
              color={ahead ? colors.jade : colors.coral}
              prefix={ahead ? '+' : '−'}
            />
          )}
        </View>
    </View>
  );
}
