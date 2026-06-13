/**
 * RarityTag — a small rarity chip for cosmetics. Tints by rarity tier
 * (common → muted, rare → royal, epic → coral, legendary → gold). Presentational.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import type { CosmeticDef } from '@/shared/gamification';

type Rarity = CosmeticDef['rarity'];

const RARITY_BOX: Record<Rarity, string> = {
  common: 'bg-white/5 border-hairline',
  rare: 'bg-royal/15 border-royal/40',
  epic: 'bg-coral/15 border-coral/40',
  legendary: 'bg-gold/15 border-gold/40',
};

const RARITY_TEXT: Record<Rarity, string> = {
  common: 'text-muted',
  rare: 'text-royal',
  epic: 'text-coral',
  legendary: 'text-gold',
};

export const RARITY_COLORS = RARITY_TEXT;

export function RarityTag({ rarity }: { rarity: Rarity }) {
  return (
    <View className={`self-start rounded-pill border px-2 py-0.5 ${RARITY_BOX[rarity]}`}>
      <Txt variant="caption" className={`${RARITY_TEXT[rarity]} uppercase tracking-wide font-semibold`}>
        {rarity}
      </Txt>
    </View>
  );
}
