/**
 * SportsBetButton — the "Bet on this game" call-to-action for a fixture. Offers
 * two affordances: the primary action opens a bet linked to the fixture (the
 * caller wires it to createBetFromFixture or a prefilled create flow), and a
 * secondary "Add to parlay" action. Disabled once the game is final. The button
 * is presentational + delegating: it never moves money itself.
 */
import { View } from 'react-native';
import { Button, Txt } from '@/components/ui';
import type { Fixture } from '@/shared/schemas-ext';

interface Props {
  fixture: Fixture;
  /** Open the create-bet flow linked to this fixture. */
  onBet: () => void;
  /** Add this fixture as a parlay leg. Hidden if omitted. */
  onAddToParlay?: () => void;
  loading?: boolean;
}

export function SportsBetButton({ fixture, onBet, onAddToParlay, loading }: Props) {
  const isFinal = fixture.status === 'final';
  const isLive = fixture.status === 'live';

  if (isFinal) {
    return (
      <View className="rounded-chip border border-hairline bg-surface-raised px-4 py-3">
        <Txt variant="label" muted className="text-center">
          This game has finished.
        </Txt>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Button
        label={isLive ? 'Bet live on this game' : 'Bet on this game'}
        tone="jade"
        size="lg"
        onPress={onBet}
        loading={loading}
        icon={<Txt variant="heading" className="text-ink">🎯</Txt>}
      />
      {onAddToParlay ? (
        <Button label="Add to parlay" tone="ghost" size="md" onPress={onAddToParlay} disabled={loading} />
      ) : null}
    </View>
  );
}
