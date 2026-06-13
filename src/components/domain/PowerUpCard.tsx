/**
 * PowerUpCard — a shop list row for a power-up: icon, name, description, the
 * owned count, and a Buy button (price). Pure presentation; onBuy is the
 * caller's mutation. Power-ups affect only the virtual Chip economy.
 */
import { View } from 'react-native';
import { Card, Txt, Button, Pill } from '@/components/ui';
import { PriceTag } from './PriceTag';
import type { PowerUpDef } from '@/shared/gamification';

interface Props {
  powerup: PowerUpDef;
  owned: number;
  canBuy?: boolean;
  pending?: boolean;
  onBuy?: () => void;
}

export function PowerUpCard({ powerup, owned, canBuy = true, pending = false, onBuy }: Props) {
  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-card bg-white/5">
          <Txt variant="title">{powerup.icon}</Txt>
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Txt variant="heading">{powerup.name}</Txt>
            {owned > 0 ? <Pill label={`×${owned}`} tone="royal" /> : null}
          </View>
          <Txt variant="caption" dim numberOfLines={2}>
            {powerup.description}
          </Txt>
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <PriceTag price={powerup.price} />
        <View className="w-28">
          <Button
            label="Buy"
            tone="gold"
            size="sm"
            onPress={onBuy}
            loading={pending}
            disabled={pending || !canBuy}
          />
        </View>
      </View>
    </Card>
  );
}
