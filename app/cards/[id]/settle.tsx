/**
 * Settle up — the books for a session. Computes a LIVE PREVIEW client-side with
 * the shared pure math (computeSettlement / tournamentPayouts) so the host sees
 * who's up/down and the minimal who-pays-whom plan before confirming. The
 * server re-computes authoritatively in settleSession — this is preview only and
 * moves no money. Cash games warn (and block) on an imbalance; tournaments show
 * placement payouts.
 */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Screen, Txt } from '@/components/ui';
import { NetBadge, SettleUpRow } from '@/components/domain';
import { useSession } from '@/stores/session';
import { useCardSession, useSessionPlayers } from '@/hooks/data';
import { useSettleSession } from '@/features/cards/hooks';
import {
  computeSettlement,
  tournamentPayouts,
  type PlayerLedger,
  type Transfer,
} from '@/shared/settleup';
import { formatChips } from '@/shared/money';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

export default function SettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const myUid = useSession((s) => s.uid);

  const { data: session } = useCardSession(id ?? null);
  const { data: players } = useSessionPlayers(id ?? null);
  const settle = useSettleSession();

  const isHost = !!session && session.hostUid === myUid;
  const isTournament = session?.gameType === 'poker_tournament';
  const alreadySettled = session?.status === 'settled';
  const pot = session?.pot ?? 0;

  const nameByUid = useMemo(() => {
    const m = new Map<string, { name: string; photo: string | null }>();
    for (const p of players ?? []) m.set(p.uid, { name: p.displayName, photo: p.photoURL ?? null });
    return m;
  }, [players]);

  // ── Live preview (read-only; server re-computes on confirm). ──
  const preview = useMemo(() => {
    const list = players ?? [];
    if (list.length === 0) {
      return { nets: [] as { uid: string; net: number }[], transfers: [] as Transfer[], imbalance: 0, balanced: true, ready: false };
    }

    if (isTournament) {
      const everyonePlaced = list.every((p) => p.place != null);
      if (!everyonePlaced) {
        return { nets: [], transfers: [], imbalance: 0, balanced: true, ready: false };
      }
      const payouts = tournamentPayouts(
        list.map((p) => ({ uid: p.uid, place: p.place as number })),
        pot,
      );
      const payoutByUid = new Map(payouts.map((t) => [t.uid, t.amount]));
      const ledgers: PlayerLedger[] = list.map((p) => ({
        uid: p.uid,
        buyIn: p.buyIn ?? 0,
        cashOut: payoutByUid.get(p.uid) ?? 0,
      }));
      const s = computeSettlement(ledgers);
      return { ...s, ready: true, placements: payouts };
    }

    // Cash game.
    const everyoneCashed = list.every((p) => p.cashOut != null);
    if (!everyoneCashed) {
      return { nets: [], transfers: [], imbalance: 0, balanced: true, ready: false };
    }
    const ledgers: PlayerLedger[] = list.map((p) => ({
      uid: p.uid,
      buyIn: p.buyIn ?? 0,
      cashOut: p.cashOut ?? 0,
    }));
    const s = computeSettlement(ledgers);
    return { ...s, ready: true };
  }, [players, isTournament, pot]);

  const placements = (preview as { placements?: { uid: string; place: number; amount: number }[] }).placements;
  const canSettle = isHost && !alreadySettled && preview.ready && preview.balanced && !settle.isPending;

  const onConfirm = () => {
    if (!id) return;
    settle.mutate({ sessionId: id }, { onSuccess: () => router.back() });
  };

  // For an already-settled session, show the stored transfers.
  const transfers: Transfer[] = alreadySettled
    ? ((session?.transfers as Transfer[]) ?? [])
    : preview.transfers;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Settle up' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 18 }}>
        {/* Nets */}
        <View className="gap-2">
          <Txt variant="title">Where everyone lands</Txt>
          <View className="gap-2">
            {(players ?? []).map((p) => {
              const net =
                preview.nets.find((n) => n.uid === p.uid)?.net ??
                (p.cashOut != null ? p.cashOut - (p.buyIn ?? 0) : p.net ?? 0);
              return (
                <View
                  key={p.uid}
                  className="flex-row items-center justify-between rounded-card border border-hairline bg-surface px-3 py-3"
                >
                  <View className="flex-1">
                    <Txt variant="label" numberOfLines={1}>
                      {p.displayName}
                    </Txt>
                    <Txt variant="caption" muted>
                      In {formatChips(p.buyIn ?? 0)}
                      {p.cashOut != null ? ` · Out ${formatChips(p.cashOut)}` : ''}
                      {p.place != null ? ` · #${p.place}` : ''}
                    </Txt>
                  </View>
                  <NetBadge net={net} size="md" />
                </View>
              );
            })}
          </View>
        </View>

        {/* Tournament placement payouts */}
        {isTournament && placements && placements.length > 0 ? (
          <View className="gap-2">
            <Txt variant="label" dim>
              Placement payouts (pot {formatChips(pot)})
            </Txt>
            <View className="gap-1.5">
              {placements
                .filter((pl) => pl.amount > 0)
                .map((pl) => (
                  <View
                    key={pl.uid}
                    className="flex-row items-center justify-between rounded-card border border-gold/30 bg-gold/10 px-3 py-2.5"
                  >
                    <Txt variant="label" className="text-gold">
                      #{pl.place} · {nameByUid.get(pl.uid)?.name ?? 'Player'}
                    </Txt>
                    <Txt variant="label" className="text-gold font-semibold">
                      {formatChips(pl.amount)}
                    </Txt>
                  </View>
                ))}
            </View>
          </View>
        ) : null}

        {/* Imbalance warning (cash games) */}
        {!alreadySettled && preview.ready && !preview.balanced ? (
          <View className="gap-1 rounded-card border border-coral/40 bg-coral/10 p-4">
            <Txt variant="label" className="text-coral">
              Stacks don't balance
            </Txt>
            <Txt variant="caption" muted>
              The cash-outs are off by {formatChips(Math.abs(preview.imbalance))} Chips
              {preview.imbalance > 0 ? ' (too much cashed out)' : ' (too little cashed out)'}.
              Go back and fix the final stacks before settling.
            </Txt>
          </View>
        ) : null}

        {/* Not-ready hint */}
        {!alreadySettled && !preview.ready ? (
          <View className="gap-1 rounded-card border border-hairline bg-surface p-4">
            <Txt variant="label" dim>
              Almost there
            </Txt>
            <Txt variant="caption" muted>
              {isTournament
                ? 'Every player needs a finishing place before a tournament can settle.'
                : 'Every player needs a recorded cash-out before you can settle.'}
            </Txt>
          </View>
        ) : null}

        {/* Transfers */}
        {transfers.length > 0 ? (
          <View className="gap-2">
            <Txt variant="label" dim>
              Settle up · {transfers.length} {transfers.length === 1 ? 'payment' : 'payments'}
            </Txt>
            <View className="gap-2">
              {transfers.map((t, i) => (
                <SettleUpRow
                  key={`${t.from}-${t.to}-${i}`}
                  fromName={nameByUid.get(t.from)?.name ?? 'Player'}
                  toName={nameByUid.get(t.to)?.name ?? 'Player'}
                  fromPhotoURL={nameByUid.get(t.from)?.photo ?? null}
                  toPhotoURL={nameByUid.get(t.to)?.photo ?? null}
                  amount={t.amount}
                />
              ))}
            </View>
          </View>
        ) : preview.ready && preview.balanced ? (
          <View className="rounded-card border border-hairline bg-surface p-4">
            <Txt variant="caption" muted className="text-center">
              Everyone's even — no payments needed.
            </Txt>
          </View>
        ) : null}

        <Txt variant="caption" muted className="text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>

      {!alreadySettled && isHost ? (
        <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-ink/95 px-4 pb-8 pt-3">
          <Button
            label={session?.mode === 'chips' ? 'Settle & pay out the pot' : 'Confirm settle-up'}
            tone="gold"
            onPress={onConfirm}
            disabled={!canSettle}
            loading={settle.isPending}
          />
        </View>
      ) : null}
    </Screen>
  );
}
