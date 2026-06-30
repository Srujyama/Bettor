/**
 * LayOddsTicket — compose a fixed-odds offer ("I'll lay you 2:1"). Pick the side
 * you back, set decimal odds with the OddsStepper, and stake some Chips. We
 * preview — with the SHARED fixedodds math — what a taker must put up, the full
 * matched pot, and what YOU win if your side hits. Commit through a HoldToConfirm
 * (deliberate friction for spending Chips).
 *
 * The client preview is UX-only; the authoritative escrow happens server-side
 * (fns.createOffer). Presentational + local draft state: onSubmit is owned by the
 * caller.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Input, Pill, Txt } from '@/components/ui';
import { HoldToConfirm } from './HoldToConfirm';
import { OddsStepper } from './OddsStepper';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import { layerRiskFor, matchedPot } from '@/shared/fixedodds';
import type { Outcome } from '@/shared/schemas';

interface Props {
  outcomes: Outcome[];
  balance: number;
  disabled?: boolean;
  pending?: boolean;
  onSubmit: (input: { outcomeId: string; odds: number; backerStake: number }) => void;
}

export function LayOddsTicket({ outcomes, balance, disabled, pending, onSubmit }: Props) {
  const [outcomeId, setOutcomeId] = useState<string | null>(outcomes[0]?.id ?? null);
  const [odds, setOdds] = useState(2.0);
  const [raw, setRaw] = useState('');

  const stake = Math.max(0, Math.floor(Number(raw) || 0));

  const preview = useMemo(() => {
    if (stake <= 0) return null;
    const layerRisk = layerRiskFor(stake, odds);
    return {
      layerRisk,
      pot: matchedPot(stake, odds),
      toWin: layerRisk, // maker's profit if their side hits == the layer's risk
    };
  }, [stake, odds]);

  const insufficient = stake > balance;
  const canSubmit =
    !disabled &&
    !pending &&
    !!outcomeId &&
    stake >= STAKE.MIN &&
    !insufficient;

  return (
    <View className="gap-4 rounded-card border border-hairline bg-surface p-4">
      <Txt variant="heading">Lay your own odds</Txt>

      {/* Side picker */}
      <View className="gap-2">
        <Txt variant="label" dim className="uppercase tracking-widest">
          You back
        </Txt>
        <View className="flex-row flex-wrap gap-2">
          {outcomes.map((o) => {
            const selected = o.id === outcomeId;
            return (
              <Pressable
                key={o.id}
                onPress={() => setOutcomeId(o.id)}
                className="rounded-pill border px-4 py-2"
                style={{
                  borderColor: selected ? colors.jade : colors.hairline,
                  backgroundColor: selected ? `${colors.jade}1A` : 'transparent',
                }}
              >
                <Txt variant="label" style={{ color: selected ? colors.jade : colors.textDim }}>
                  {o.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <OddsStepper value={odds} onChange={setOdds} disabled={disabled} />

      <Input
        label="Your stake"
        keyboardType="number-pad"
        prefix="💎"
        placeholder={`Min ${STAKE.MIN}`}
        placeholderTextColor={colors.textFaint}
        value={raw}
        onChangeText={setRaw}
      />

      {preview ? (
        <View className="gap-1 rounded-card bg-surface-raised p-3">
          <Row label="Taker must lay" value={`${formatChips(preview.layerRisk)} Chips`} color={colors.coral} />
          <Row label="Matched pot" value={`${formatChips(preview.pot)} Chips`} color={colors.text} />
          <Row label="You win if your side hits" value={`+${formatChips(preview.toWin)} Chips`} color={colors.jade} />
        </View>
      ) : (
        <Txt variant="caption" muted>
          Enter a stake to preview the matched pot.
        </Txt>
      )}

      {insufficient ? <Pill label="Not enough Chips for this stake" tone="coral" /> : null}

      <View className="items-center pt-1">
        <HoldToConfirm
          label={outcomeId ? 'Hold to post offer' : 'Pick a side'}
          tone="gold"
          size={120}
          disabled={!canSubmit}
          onConfirm={() => {
            if (!outcomeId) return;
            onSubmit({ outcomeId, odds, backerStake: stake });
            setRaw('');
          }}
        />
        <Txt variant="caption" muted className="mt-2 text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </View>
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Txt variant="caption" muted>
        {label}
      </Txt>
      <Txt variant="label" style={{ color }}>
        {value}
      </Txt>
    </View>
  );
}
