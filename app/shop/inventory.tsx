/**
 * Inventory — the player's owned cosmetics, grouped by slot type, with equip /
 * unequip controls. Reads come from the live `useInventory` hook + the user
 * doc's denormalized `equipped` map; equip mutations go through the economy
 * feature hook → callable. Cosmetic-only — nothing here affects a bet outcome.
 */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card, EmptyState, Screen, Txt } from '@/components/ui';
import { CosmeticCard } from '@/components/domain';
import { useInventory, useWallet } from '@/hooks/data';
import { useEquipCosmetic } from '@/features/economy/hooks';
import { COSMETIC_BY_KEY } from '@/shared/gamification';
import type { CosmeticType } from '@/shared/gamification';
import type { InventoryItem } from '@/shared/schemas-ext';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

interface EconomyUserView {
  equipped?: Partial<Record<CosmeticType, string | null>> | null;
}

const SLOT_LABEL: Record<CosmeticType, string> = {
  card_skin: 'Card Skins',
  avatar_frame: 'Avatar Frames',
  sticker_pack: 'Sticker Packs',
  name_color: 'Name Colors',
  win_effect: 'Win Effects',
};

const SLOT_ORDER: CosmeticType[] = [
  'card_skin',
  'avatar_frame',
  'name_color',
  'win_effect',
  'sticker_pack',
];

export default function InventoryScreen() {
  const { data: inventory } = useInventory();
  const { data: userDoc } = useWallet();
  const equip = useEquipCosmetic();

  const equipped = ((userDoc ?? {}) as EconomyUserView).equipped ?? {};

  const bySlot = useMemo(() => {
    const map = new Map<CosmeticType, InventoryItem[]>();
    for (const item of inventory ?? []) {
      const type = item.type as CosmeticType;
      const list = map.get(type) ?? [];
      list.push(item);
      map.set(type, list);
    }
    return map;
  }, [inventory]);

  const isEmpty = (inventory ?? []).length === 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Inventory' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {isEmpty ? (
          <EmptyState
            emoji="🎴"
            title="Nothing here yet"
            subtitle="Buy cosmetics in the Shop to build your loadout."
          />
        ) : (
          SLOT_ORDER.map((slot) => {
            const items = bySlot.get(slot) ?? [];
            if (items.length === 0) return null;
            const equippedKey = equipped[slot] ?? null;
            return (
              <View key={slot} className="gap-3">
                <View className="flex-row items-center justify-between px-1">
                  <Txt variant="label" dim className="uppercase tracking-wide">
                    {SLOT_LABEL[slot]}
                  </Txt>
                  <Txt variant="caption" muted>
                    {equippedKey ? COSMETIC_BY_KEY[equippedKey]?.name ?? 'Equipped' : 'None equipped'}
                  </Txt>
                </View>
                {rowsOf(items).map((row, ri) => (
                  <View key={ri} className="flex-row gap-3">
                    {row.map((item) => {
                      const cosmetic = COSMETIC_BY_KEY[item.cosmeticKey];
                      if (!cosmetic) return <View key={item.itemId} className="flex-1" />;
                      const isEquipped = equippedKey === item.cosmeticKey;
                      return (
                        <CosmeticCard
                          key={item.itemId}
                          cosmetic={cosmetic}
                          owned
                          equipped={isEquipped}
                          pending={
                            equip.isPending && equip.variables?.type === slot
                          }
                          onEquip={() =>
                            equip.mutate({
                              type: slot,
                              cosmeticKey: isEquipped ? null : item.cosmeticKey,
                            })
                          }
                        />
                      );
                    })}
                    {row.length === 1 ? <View className="flex-1" /> : null}
                  </View>
                ))}
              </View>
            );
          })
        )}

        <Card className="gap-1">
          <Txt variant="caption" muted>
            Chips have no cash value · cosmetic only. {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </Card>
      </ScrollView>
    </Screen>
  );
}

/** Chunk a list into rows of two for the grid. */
function rowsOf(items: InventoryItem[]): InventoryItem[][] {
  const out: InventoryItem[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}
