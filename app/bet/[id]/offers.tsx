/**
 * ODDS BOOK — the fixed-odds peer market for one bet ("I'll lay you 2:1").
 *
 * Two halves:
 *  1. A "Lay your own odds" composer (LayOddsTicket): pick the side you back, set
 *     decimal odds, stake Chips → fns.createOffer (the maker escrows their stake).
 *  2. The OFFER BOOK: every open/partial offer as an OfferRow with the maker, the
 *     price (decimal + fractional + implied %), the open stake, and a Take button
 *     that opens a bottom sheet (TakeOfferSheet) to lay the other side via
 *     fns.takeOffer (partial fills supported). The viewer's own offers show a
 *     Cancel control instead (fns.cancelOffer refunds the unmatched stake).
 *
 * The client NEVER computes money: previews use the shared fixedodds math for UX
 * only; all escrow/matching/settlement is server-authoritative and flows back
 * through the live read hooks.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { EmptyState, Pill, Screen, Txt } from '@/components/ui';
import { LayOddsTicket, OfferRow, TakeOfferSheet } from '@/components/domain';
import {
  useOffers,
  useCreateOffer,
  useTakeOffer,
  useCancelOffer,
} from '@/features/fixedodds/hooks';
import { useBet, useCurrentUser } from '@/hooks/data';
import { useSession } from '@/stores/session';
import { colors } from '@/theme';
import { BET_STATUS } from '@/shared/constants';
import { makeIdempotencyKey } from '@/shared/ids';
import type { FixedOddsOffer } from '@/shared/schemas-cards';

function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />;
}

export default function OddsBookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const betId = id ?? null;
  const myUid = useSession((s) => s.uid);

  const { data: bet, isLoading } = useBet(betId);
  const { data: offers } = useOffers(betId);
  const { data: me } = useCurrentUser();

  const createOffer = useCreateOffer();
  const takeOffer = useTakeOffer();
  const cancelOffer = useCancelOffer();

  const sheet = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<FixedOddsOffer | null>(null);

  const balance = me?.chipsBalance ?? 0;

  const labelFor = useCallback(
    (outcomeId: string) => bet?.outcomes.find((o) => o.id === outcomeId)?.label ?? '—',
    [bet],
  );

  // Open offers float to the top; the maker's own + closed ones follow.
  const sortedOffers = useMemo(() => {
    const list = offers ?? [];
    const rank = (o: FixedOddsOffer) =>
      o.status === 'open' ? 0 : o.status === 'partial' ? 1 : 2;
    return [...list].sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt);
  }, [offers]);

  const openOffer = useCallback((offer: FixedOddsOffer) => {
    setActive(offer);
    sheet.current?.present();
  }, []);

  const submitCreate = (input: { outcomeId: string; odds: number; backerStake: number }) => {
    if (!betId) return;
    void createOffer.mutateAsync({
      betId,
      outcomeId: input.outcomeId,
      odds: input.odds,
      backerStake: input.backerStake,
      idempotencyKey: makeIdempotencyKey(),
    });
  };

  const submitTake = async (budget: number) => {
    if (!betId || !active) return;
    try {
      await takeOffer.mutateAsync({
        betId,
        offerId: active.offerId,
        budget,
        idempotencyKey: makeIdempotencyKey(),
      });
      sheet.current?.dismiss();
      setActive(null);
    } catch {
      // toast surfaced by the mutation
    }
  };

  const submitCancel = (offer: FixedOddsOffer) => {
    if (!betId) return;
    void cancelOffer.mutateAsync({ betId, offerId: offer.offerId });
  };

  if (isLoading || !bet) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Txt variant="body" dim>
            {isLoading ? 'Loading odds book…' : 'Bet not found.'}
          </Txt>
        </View>
      </Screen>
    );
  }

  const acceptsOffers =
    bet.status === BET_STATUS.OPEN && Date.now() < bet.lockAt;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Odds book
          </Txt>
          <Txt variant="heading" numberOfLines={2}>
            {bet.title}
          </Txt>
          <Txt variant="caption" dim>
            Back a side at your own price, or lay someone else's odds. Winner takes the matched pot.
          </Txt>
        </View>

        {acceptsOffers ? (
          <LayOddsTicket
            outcomes={bet.outcomes}
            balance={balance}
            pending={createOffer.isPending}
            onSubmit={submitCreate}
          />
        ) : (
          <Pill label="This bet is no longer accepting offers" tone="muted" />
        )}

        <View className="gap-3">
          <Txt variant="label" dim className="uppercase tracking-widest">
            Open offers · {sortedOffers.filter((o) => o.status === 'open' || o.status === 'partial').length}
          </Txt>
          {sortedOffers.length === 0 ? (
            <EmptyState
              emoji="⚖️"
              title="No offers yet"
              subtitle="Be the first to lay your odds on this bet."
            />
          ) : (
            sortedOffers.map((offer) => (
              <OfferRow
                key={offer.offerId}
                offer={offer}
                outcomeLabel={labelFor(offer.outcomeId)}
                mine={offer.makerUid === myUid}
                takeDisabled={!acceptsOffers || takeOffer.isPending}
                onTake={() => openOffer(offer)}
                onCancel={() => submitCancel(offer)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <BottomSheetModal
        ref={sheet}
        index={0}
        snapPoints={['70%']}
        enablePanDownToClose
        backdropComponent={Backdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.muted }}
        onDismiss={() => setActive(null)}
      >
        <BottomSheetView style={{ padding: 16, paddingBottom: 32 }}>
          {active ? (
            <TakeOfferSheet
              offer={active}
              outcomeLabel={labelFor(active.outcomeId)}
              balance={balance}
              pending={takeOffer.isPending}
              onSubmit={submitTake}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>
    </Screen>
  );
}
