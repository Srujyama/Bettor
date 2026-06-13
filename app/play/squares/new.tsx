/**
 * NEW SQUARES BOARD — name the board and set the price per square, then open it.
 * No money moves here (claiming a cell escrows the price, later). On success we
 * route into the live board so the creator can share + claim.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Input, Screen, Txt } from '@/components/ui';
import { useCreateSquaresGame } from '@/features/formats/hooks';
import { formatChips } from '@/shared/money';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

const PRICE_PRESETS = [50, 100, 250, 500];

export default function NewSquaresScreen() {
  const createGame = useCreateSquaresGame();
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('100');

  const priceNum = Number(price) || 0;
  const valid =
    title.trim().length >= 3 &&
    Number.isInteger(priceNum) &&
    priceNum >= STAKE.MIN &&
    priceNum <= STAKE.DEFAULT_MAX;

  const pool = priceNum * 100; // 10×10 grid

  const submit = async () => {
    const res = await createGame.mutateAsync({
      title: title.trim(),
      pricePerSquare: priceNum,
      groupId: null,
    });
    const gameId = (res as { gameId?: string })?.gameId;
    if (gameId) router.replace(`/play/squares/${gameId}`);
    else router.back();
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label="Board name"
          placeholder="e.g. Super Bowl Squares"
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />

        <View className="gap-2">
          <Txt variant="label" dim>
            Price per square (Chips)
          </Txt>
          <View className="flex-row flex-wrap gap-2">
            {PRICE_PRESETS.map((p) => {
              const active = priceNum === p;
              return (
                <Button
                  key={p}
                  label={formatChips(p)}
                  tone={active ? 'jade' : 'ghost'}
                  size="sm"
                  fullWidth={false}
                  onPress={() => setPrice(String(p))}
                />
              );
            })}
          </View>
          <Input
            value={price}
            onChangeText={setPrice}
            keyboardType="number-pad"
            prefix="🪙"
          />
        </View>

        <Card>
          <View className="flex-row items-center justify-between">
            <Txt variant="label" dim>
              Full pool (100 squares)
            </Txt>
            <Txt variant="heading" className="text-gold">
              {formatChips(pool)}
            </Txt>
          </View>
          <Txt variant="caption" muted className="mt-1">
            Players claim squares; when all 100 fill, row/column digits are randomly assigned and the
            board locks. The square matching the final score takes the whole pool.
          </Txt>
        </Card>

        <Txt variant="caption" muted className="text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>

      <View className="border-t border-hairline px-4 pb-6 pt-3">
        <Button
          label="Open board"
          tone="royal"
          onPress={submit}
          loading={createGame.isPending}
          disabled={!valid || createGame.isPending}
        />
      </View>
    </Screen>
  );
}
