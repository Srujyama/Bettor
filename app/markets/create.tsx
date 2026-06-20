/**
 * Create a market — question, category, a close window (when trading stops) and a
 * resolve-by deadline (when it must be settled or auto-voids), plus an optional
 * Chip seed for AMM liquidity. Submits to fns.createMarket via the feature hook;
 * the server picks the LMSR depth and writes the market. Money is read-only here.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, ChipCounter, Input, Screen, Txt } from '@/components/ui';
import { useCreateMarket } from '@/features/markets/hooks';
import { useWallet } from '@/hooks/data';
import { makeIdempotencyKey } from '@/shared/ids';
import { colors } from '@/theme';

const CATEGORIES = ['sports', 'crypto', 'politics', 'weather', 'culture', 'custom'] as const;
type Category = (typeof CATEGORIES)[number];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Trading-window presets (hours until close). */
const CLOSE_PRESETS = [
  { label: '1h', ms: HOUR },
  { label: '6h', ms: 6 * HOUR },
  { label: '1d', ms: DAY },
  { label: '3d', ms: 3 * DAY },
  { label: '1w', ms: 7 * DAY },
] as const;

export default function CreateMarketScreen() {
  const router = useRouter();
  const create = useCreateMarket();
  const { data: userDoc } = useWallet();
  const balance = (userDoc as { chipsBalance?: number } | undefined)?.chipsBalance ?? 0;

  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('custom');
  const [closeMs, setCloseMs] = useState<number>(DAY);
  const [seedRaw, setSeedRaw] = useState('');

  const seed = Math.max(0, Math.floor(Number(seedRaw) || 0));
  const questionOk = question.trim().length >= 6 && question.trim().length <= 140;
  const seedOk = seed === 0 || seed <= balance;
  const canSubmit = questionOk && seedOk && !create.isPending;

  const closesPreview = useMemo(() => new Date(Date.now() + closeMs), [closeMs]);

  const submit = () => {
    if (!canSubmit) return;
    const now = Date.now();
    const closesAt = now + closeMs;
    // Resolve window: 24h after close to report the outcome before auto-void.
    const resolvesBy = closesAt + DAY;
    create.mutate(
      {
        question: question.trim(),
        description: description.trim() || undefined,
        category,
        closesAt,
        resolvesBy,
        seedChips: seed > 0 ? seed : undefined,
        idempotencyKey: makeIdempotencyKey(),
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New market' }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 64, gap: 16 }}
      >
        <Input
          label="Question (YES / NO)"
          placeholder="Will it rain in Macau this Friday?"
          placeholderTextColor={colors.textFaint}
          value={question}
          onChangeText={setQuestion}
          maxLength={140}
          multiline
        />
        <Input
          label="Details (optional)"
          placeholder="How this resolves, the source of truth…"
          placeholderTextColor={colors.textFaint}
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          multiline
        />

        <View className="gap-2">
          <Txt variant="label">Category</Txt>
          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Button
                key={c}
                label={c}
                size="sm"
                tone={c === category ? 'royal' : 'ghost'}
                fullWidth={false}
                onPress={() => setCategory(c)}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Txt variant="label">Trading closes in</Txt>
          <View className="flex-row flex-wrap gap-2">
            {CLOSE_PRESETS.map((p) => (
              <Button
                key={p.label}
                label={p.label}
                size="sm"
                tone={p.ms === closeMs ? 'jade' : 'ghost'}
                fullWidth={false}
                onPress={() => setCloseMs(p.ms)}
              />
            ))}
          </View>
          <Txt variant="caption" muted>
            Closes {closesPreview.toLocaleString()} · must resolve within 24h after or it auto-voids
            and refunds.
          </Txt>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Txt variant="label">Seed liquidity (optional)</Txt>
            <View className="flex-row items-center gap-1">
              <Txt variant="caption" muted>
                Balance
              </Txt>
              <ChipCounter value={balance} size={13} color={colors.gold} />
            </View>
          </View>
          <Input
            label=""
            keyboardType="number-pad"
            prefix="💎"
            placeholder="Default 2000 (house-funded)"
            placeholderTextColor={colors.textFaint}
            value={seedRaw}
            onChangeText={setSeedRaw}
          />
          {!seedOk ? (
            <Txt variant="caption" style={{ color: colors.coral }}>
              You don't have enough Chips to seed that much.
            </Txt>
          ) : (
            <Txt variant="caption" muted>
              Seeding makes prices less jumpy. The house holds the seed and reconciles it at
              resolution.
            </Txt>
          )}
        </View>

        <Button
          label={create.isPending ? 'Creating…' : 'Create market'}
          tone="jade"
          loading={create.isPending}
          disabled={!canSubmit}
          onPress={submit}
        />

        <Txt variant="caption" muted className="px-1 text-center">
          Markets settle in Chips. Chips have no cash value.
        </Txt>
      </ScrollView>
    </Screen>
  );
}
