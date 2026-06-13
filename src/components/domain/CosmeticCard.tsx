/**
 * CosmeticCard — a shop grid card for a single cosmetic. Rarity-colored border,
 * big icon, name + description, a RarityTag, and a footer that shows either the
 * PriceTag (with a Buy affordance) or the owned/equip state. Pure presentation:
 * onBuy / onEquip are owned by the caller (the shop screen wires the mutations).
 */
import { View } from 'react-native';
import { Card, Txt, Button } from '@/components/ui';
import { RarityTag } from './RarityTag';
import { PriceTag } from './PriceTag';
import { OwnedBadge } from './OwnedBadge';
import type { CosmeticDef } from '@/shared/gamification';

const RARITY_BORDER: Record<CosmeticDef['rarity'], string> = {
  common: 'border-hairline',
  rare: 'border-royal/40',
  epic: 'border-coral/40',
  legendary: 'border-gold/50',
};

interface Props {
  cosmetic: CosmeticDef;
  owned?: boolean;
  equipped?: boolean;
  /** Caller can't afford / not Pro — disables the Buy affordance. */
  canBuy?: boolean;
  proLocked?: boolean;
  pending?: boolean;
  onBuy?: () => void;
  onEquip?: () => void;
}

export function CosmeticCard({
  cosmetic,
  owned = false,
  equipped = false,
  canBuy = true,
  proLocked = false,
  pending = false,
  onBuy,
  onEquip,
}: Props) {
  return (
    <Card className={`flex-1 gap-2 ${RARITY_BORDER[cosmetic.rarity]}`}>
      <View className="flex-row items-center justify-between">
        <RarityTag rarity={cosmetic.rarity} />
        <OwnedBadge owned={owned} equipped={equipped} />
      </View>

      <View className="items-center py-2">
        <Txt variant="display" className="text-4xl">
          {cosmetic.icon}
        </Txt>
      </View>

      <View className="gap-0.5">
        <View className="flex-row items-center gap-1">
          <Txt variant="heading" numberOfLines={1}>
            {cosmetic.name}
          </Txt>
          {cosmetic.proOnly ? (
            <Txt variant="caption" className="text-gold font-semibold">
              PRO
            </Txt>
          ) : null}
        </View>
        <Txt variant="caption" dim numberOfLines={2}>
          {cosmetic.description}
        </Txt>
      </View>

      <View className="mt-1 flex-row items-center justify-between">
        <PriceTag price={cosmetic.price} owned={owned} />
      </View>

      {owned ? (
        <Button
          label={equipped ? 'Unequip' : 'Equip'}
          tone={equipped ? 'ghost' : 'jade'}
          size="sm"
          onPress={onEquip}
          loading={pending}
          disabled={pending}
        />
      ) : (
        <Button
          label={proLocked ? 'Pro only' : 'Buy'}
          tone="gold"
          size="sm"
          onPress={onBuy}
          loading={pending}
          disabled={pending || proLocked || !canBuy}
        />
      )}
    </Card>
  );
}
