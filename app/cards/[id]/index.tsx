/**
 * A live card-game session. Shows the game type + mode, the pot, every player's
 * running buy-in / cash-out / net, and host controls: add a buy-in/rebuy per
 * player, cash a player out, add a player (or guest in tracking mode), and settle
 * up. All money is read-only here and server-written; actions go through the
 * card feature hooks → callables and the new state streams back via the live
 * read hooks.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, ChipCounter, Input, Pill as UiPill, Screen, Txt } from '@/components/ui';
import { BuyInStepper, GameTypePill, PlayerLedgerRow } from '@/components/domain';
import { useSession } from '@/stores/session';
import { useCardSession, useSessionPlayers } from '@/hooks/data';
import { useJoinSession, useSessionBuyIn, useSessionCashout } from '@/features/cards/hooks';
import type { SessionPlayer } from '@/shared/schemas-cards';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import { colors } from '@/theme';

type Dialog =
  | { kind: 'none' }
  | { kind: 'buyin'; player: SessionPlayer; rebuy: boolean }
  | { kind: 'cashout'; player: SessionPlayer }
  | { kind: 'addGuest' };

export default function CardSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const myUid = useSession((s) => s.uid);

  const { data: session, isLoading } = useCardSession(id ?? null);
  const { data: players } = useSessionPlayers(id ?? null);

  const buyIn = useSessionBuyIn();
  const cashout = useSessionCashout();
  const join = useJoinSession();

  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });

  const isHost = !!session && session.hostUid === myUid;
  const isChips = session?.mode === 'chips';
  const isTournament = session?.gameType === 'poker_tournament';
  const isOpen = session?.status === 'open';

  const meJoined = useMemo(
    () => (players ?? []).some((p) => p.uid === myUid),
    [players, myUid],
  );

  if (!isLoading && !session) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Home game' }} />
        <View className="flex-1 items-center justify-center p-8">
          <Txt variant="heading">Game not found</Txt>
          <Txt variant="caption" muted className="mt-1 text-center">
            It may have been removed.
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: session?.title ?? 'Home game' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }}>
        {/* Header: pot + badges */}
        <View className="items-center gap-2 rounded-card border border-hairline bg-surface p-5">
          <Txt variant="caption" muted>
            {isChips ? 'Pot (escrowed)' : 'On the table'}
          </Txt>
          <ChipCounter value={session?.pot ?? 0} size={44} color={colors.gold} />
          <View className="mt-1 flex-row items-center gap-2">
            {session ? <GameTypePill gameType={session.gameType} /> : null}
            <UiPill label={isChips ? '💎 Chips' : '📋 Tracking'} tone={isChips ? 'gold' : 'muted'} />
            {session ? (
              <UiPill
                label={session.status === 'open' ? 'Live' : session.status === 'settled' ? 'Settled' : session.status}
                tone={session.status === 'open' ? 'jade' : 'muted'}
              />
            ) : null}
          </View>
        </View>

        {/* Players */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Txt variant="label" dim>
              Players · {players?.length ?? 0}
            </Txt>
            {isOpen ? (
              <View className="flex-row gap-2">
                {!meJoined ? (
                  <Pressable
                    onPress={() => myUid && join.mutate({ sessionId: id! })}
                    className="rounded-pill border border-jade/40 bg-jade/10 px-3 py-1.5"
                  >
                    <Txt variant="caption" className="text-jade font-semibold">
                      Join
                    </Txt>
                  </Pressable>
                ) : null}
                {isHost && !isChips ? (
                  <Pressable
                    onPress={() => setDialog({ kind: 'addGuest' })}
                    className="rounded-pill border border-hairline bg-surface px-3 py-1.5"
                  >
                    <Txt variant="caption" className="text-text-dim font-semibold">
                      ＋ Guest
                    </Txt>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {(players ?? []).map((p) => {
            const isMe = p.uid === myUid;
            const canBuyIn = isOpen && (isChips ? isMe : isHost || isMe);
            const canCashOut = isOpen && (isHost || isMe) && p.cashOut == null;
            return (
              <PlayerLedgerRow
                key={p.uid}
                player={p}
                isMe={isMe}
                isHost={!!session && p.uid === session.hostUid}
                actions={
                  <>
                    {canBuyIn ? (
                      <ActionChip
                        label={p.buyIn > 0 ? 'Rebuy' : 'Buy in'}
                        onPress={() => setDialog({ kind: 'buyin', player: p, rebuy: p.buyIn > 0 })}
                        tone="jade"
                      />
                    ) : null}
                    {canCashOut ? (
                      <ActionChip
                        label="Cash out"
                        onPress={() => setDialog({ kind: 'cashout', player: p })}
                        tone="coral"
                      />
                    ) : null}
                  </>
                }
              />
            );
          })}
        </View>

        <Txt variant="caption" muted className="text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>

      {/* Settle bar (host, open session) */}
      {isHost && isOpen ? (
        <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-ink/95 px-4 pb-8 pt-3">
          <Button
            label="Settle up"
            tone="gold"
            onPress={() => router.push(`/cards/${id}/settle`)}
          />
        </View>
      ) : null}
      {session?.status === 'settled' ? (
        <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-ink/95 px-4 pb-8 pt-3">
          <Button
            label="View settle-up"
            tone="royal"
            onPress={() => router.push(`/cards/${id}/settle`)}
          />
        </View>
      ) : null}

      {/* Buy-in dialog */}
      <BuyInDialog
        visible={dialog.kind === 'buyin'}
        player={dialog.kind === 'buyin' ? dialog.player : null}
        rebuy={dialog.kind === 'buyin' ? dialog.rebuy : false}
        defaultBuyIn={session?.defaultBuyIn ?? 0}
        loading={buyIn.isPending}
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={(amount) => {
          if (dialog.kind !== 'buyin' || !id) return;
          buyIn.mutate(
            { sessionId: id, uid: dialog.player.uid, amount, kind: dialog.rebuy ? 'rebuy' : 'buy_in' },
            { onSuccess: () => setDialog({ kind: 'none' }) },
          );
        }}
      />

      {/* Cash-out dialog */}
      <CashOutDialog
        visible={dialog.kind === 'cashout'}
        player={dialog.kind === 'cashout' ? dialog.player : null}
        isTournament={!!isTournament}
        loading={cashout.isPending}
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={(amount, place) => {
          if (dialog.kind !== 'cashout' || !id) return;
          cashout.mutate(
            { sessionId: id, uid: dialog.player.uid, amount, place },
            { onSuccess: () => setDialog({ kind: 'none' }) },
          );
        }}
      />

      {/* Add-guest dialog (tracking mode) */}
      <AddGuestDialog
        visible={dialog.kind === 'addGuest'}
        loading={join.isPending}
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={(guestName) => {
          if (!id) return;
          join.mutate(
            { sessionId: id, guestName },
            { onSuccess: () => setDialog({ kind: 'none' }) },
          );
        }}
      />
    </Screen>
  );
}

function ActionChip({ label, onPress, tone }: { label: string; onPress: () => void; tone: 'jade' | 'coral' }) {
  const cls = tone === 'jade' ? 'border-jade/40 bg-jade/10' : 'border-coral/40 bg-coral/10';
  const txt = tone === 'jade' ? 'text-jade' : 'text-coral';
  return (
    <Pressable onPress={onPress} className={`rounded-pill border px-3 py-1.5 ${cls}`}>
      <Txt variant="caption" className={`${txt} font-semibold`}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ─── Dialogs (lightweight RN modals; no extra deps) ────────────────────────────

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <View className="flex-1 justify-end bg-black/60">
      <Pressable className="flex-1" onPress={onClose} />
      <View className="gap-4 rounded-t-sheet border-t border-hairline bg-surface-raised p-5 pb-10">
        {children}
      </View>
    </View>
  );
}

function BuyInDialog({
  visible,
  player,
  rebuy,
  defaultBuyIn,
  loading,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  player: SessionPlayer | null;
  rebuy: boolean;
  defaultBuyIn: number;
  loading: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(defaultBuyIn > 0 ? defaultBuyIn : 100);
  // Reset to the default each time the sheet opens for a fresh player.
  const seed = `${visible}:${player?.uid ?? ''}`;
  const [seedKey, setSeedKey] = useState(seed);
  if (seed !== seedKey) {
    setSeedKey(seed);
    setAmount(defaultBuyIn > 0 ? defaultBuyIn : 100);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Sheet onClose={onClose}>
        <Txt variant="title">
          {rebuy ? 'Rebuy' : 'Buy in'}
          {player ? ` · ${player.displayName}` : ''}
        </Txt>
        <BuyInStepper value={amount} onChange={setAmount} defaultBuyIn={defaultBuyIn} />
        <Button
          label={rebuy ? 'Add rebuy' : 'Confirm buy-in'}
          tone="jade"
          onPress={() => onConfirm(amount)}
          disabled={amount <= 0 || loading}
          loading={loading}
        />
      </Sheet>
    </Modal>
  );
}

function CashOutDialog({
  visible,
  player,
  isTournament,
  loading,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  player: SessionPlayer | null;
  isTournament: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (amount: number, place?: number) => void;
}) {
  const [stackText, setStackText] = useState('0');
  const [placeText, setPlaceText] = useState('');
  const seed = `${visible}:${player?.uid ?? ''}`;
  const [seedKey, setSeedKey] = useState(seed);
  if (seed !== seedKey) {
    setSeedKey(seed);
    setStackText('0');
    setPlaceText('');
  }

  const amount = Math.max(0, Math.round(Number(stackText) || 0));
  const place = placeText ? Math.max(1, Math.round(Number(placeText))) : undefined;
  const valid = !isTournament || place != null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Sheet onClose={onClose}>
        <Txt variant="title">Cash out{player ? ` · ${player.displayName}` : ''}</Txt>
        <Input
          label="Final stack (Chips)"
          value={stackText}
          onChangeText={(t) => setStackText(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
        />
        {isTournament ? (
          <Input
            label="Finishing place (1 = winner)"
            value={placeText}
            onChangeText={(t) => setPlaceText(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />
        ) : null}
        <Button
          label="Record cash-out"
          tone="coral"
          onPress={() => onConfirm(amount, place)}
          disabled={!valid || loading}
          loading={loading}
        />
      </Sheet>
    </Modal>
  );
}

function AddGuestDialog({
  visible,
  loading,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (guestName: string) => void;
}) {
  const [name, setName] = useState('');
  const seed = String(visible);
  const [seedKey, setSeedKey] = useState(seed);
  if (seed !== seedKey) {
    setSeedKey(seed);
    setName('');
  }
  const valid = name.trim().length >= 1;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Sheet onClose={onClose}>
        <Txt variant="title">Add a guest</Txt>
        <Txt variant="caption" muted>
          Guests aren't Chipd users — they're tracked on the scoreboard only.
        </Txt>
        <Input label="Name" value={name} onChangeText={setName} maxLength={40} autoFocus />
        <Button
          label="Add guest"
          tone="royal"
          onPress={() => onConfirm(name.trim())}
          disabled={!valid || loading}
          loading={loading}
        />
      </Sheet>
    </Modal>
  );
}
