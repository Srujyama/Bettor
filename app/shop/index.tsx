/**
 * Shop — Cosmetics / Power-ups / Pro. Everything is bought with CHIPS only (no
 * real money). Cosmetics are cosmetic-only and Pro/power-ups affect only the
 * virtual Chip economy — a persistent disclosure makes that explicit. All money
 * is read-only here; purchases go through the economy feature hooks → callables,
 * and the server-written balance/inventory flow back via the live read hooks.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, ChipCounter, Screen, Txt } from '@/components/ui';
import { CosmeticCard, HoldToConfirm, PowerUpCard, ProBanner, SegmentedTabs } from '@/components/domain';
import { colors } from '@/theme';
import { useWallet, useInventory } from '@/hooks/data';
import {
  useBuyCosmetic,
  useBuyPowerUp,
  useEquipCosmetic,
  useSubscribePro,
} from '@/features/economy/hooks';
import { SHOP_CATALOG, POWERUPS, COSMETIC_BY_KEY, PRO } from '@/shared/gamification';
import type { CosmeticDef, CosmeticType } from '@/shared/gamification';
import type { InventoryItem } from '@/shared/schemas-ext';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

const TABS = ['Cosmetics', 'Power-ups', 'Pro'] as const;
type Tab = (typeof TABS)[number];

/** Expansion denorm fields written onto the user doc by the economy CFs. */
interface EconomyUserView {
  chipsBalance?: number;
  equipped?: Partial<Record<CosmeticType, string | null>> | null;
  pro?: { active?: boolean; since?: number | null; expiresAt?: number | null } | null;
  powerups?: Record<string, number> | null;
}

export default function ShopScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Cosmetics');
  const { data: userDoc } = useWallet();
  const { data: inventory } = useInventory();

  const user = (userDoc ?? {}) as EconomyUserView;
  const balance = user.chipsBalance ?? 0;
  const equipped = user.equipped ?? {};
  const powerups = user.powerups ?? {};
  const proActive =
    user.pro?.active === true && (user.pro?.expiresAt == null || (user.pro.expiresAt ?? 0) > Date.now());

  const ownedKeys = useMemo(
    () => new Set((inventory ?? []).map((i: InventoryItem) => i.cosmeticKey)),
    [inventory],
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Shop' }} />
      <View className="flex-row items-center justify-between px-4 pt-2">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          Your balance
        </Txt>
        <ChipCounter value={balance} size={22} color={colors.gold} />
      </View>

      <View className="px-4 pt-3">
        <SegmentedTabs tabs={[...TABS]} value={tab} onChange={(t) => setTab(t as Tab)} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}>
        {tab === 'Cosmetics' ? (
          <CosmeticsTab
            ownedKeys={ownedKeys}
            equipped={equipped}
            balance={balance}
            proActive={proActive}
          />
        ) : null}

        {tab === 'Power-ups' ? <PowerUpsTab powerups={powerups} balance={balance} /> : null}

        {tab === 'Pro' ? (
          <ProTab active={proActive} expiresAt={user.pro?.expiresAt ?? null} balance={balance} />
        ) : null}

        <View className="flex-row justify-end pt-2">
          <Button
            label="View inventory →"
            tone="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => router.push('/shop/inventory')}
          />
        </View>

        {/* Persistent compliance disclosure. */}
        <Txt variant="caption" muted className="px-1">
          Chips have no cash value · cosmetic only. {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}

// ─── Cosmetics tab ──────────────────────────────────────────────────────────--

function CosmeticsTab({
  ownedKeys,
  equipped,
  balance,
  proActive,
}: {
  ownedKeys: Set<string>;
  equipped: Partial<Record<CosmeticType, string | null>>;
  balance: number;
  proActive: boolean;
}) {
  const buy = useBuyCosmetic();
  const equip = useEquipCosmetic();
  const [confirming, setConfirming] = useState<CosmeticDef | null>(null);

  const pendingKey: string | null = buy.isPending
    ? (buy.variables ?? null)
    : equip.isPending
      ? (equip.variables?.cosmeticKey ?? null)
      : null;

  // Group catalog into rows of two for a grid.
  const rows = useMemo(() => {
    const out: CosmeticDef[][] = [];
    for (let i = 0; i < SHOP_CATALOG.length; i += 2) out.push(SHOP_CATALOG.slice(i, i + 2));
    return out;
  }, []);

  return (
    <View className="gap-3">
      {rows.map((row, ri) => (
        <View key={ri} className="flex-row gap-3">
          {row.map((cosmetic) => {
            const owned = ownedKeys.has(cosmetic.key);
            const isEquipped = equipped[cosmetic.type] === cosmetic.key;
            const proLocked = !!cosmetic.proOnly && !proActive;
            const canBuy = balance >= cosmetic.price;
            return (
              <CosmeticCard
                key={cosmetic.key}
                cosmetic={cosmetic}
                owned={owned}
                equipped={isEquipped}
                canBuy={canBuy}
                proLocked={proLocked}
                pending={pendingKey === cosmetic.key}
                onBuy={() => setConfirming(cosmetic)}
                onEquip={() =>
                  equip.mutate({
                    type: cosmetic.type,
                    cosmeticKey: isEquipped ? null : cosmetic.key,
                  })
                }
              />
            );
          })}
          {row.length === 1 ? <View className="flex-1" /> : null}
        </View>
      ))}

      {/* Hold-to-confirm purchase sheet (deliberate friction for spending Chips). */}
      {confirming ? (
        <View className="mt-2 items-center gap-3 rounded-card border border-gold/30 bg-surface p-4">
          <Txt variant="heading" className="text-center">
            Buy {confirming.name}?
          </Txt>
          <Txt variant="caption" dim className="text-center">
            {COSMETIC_BY_KEY[confirming.key]?.description}
          </Txt>
          <HoldToConfirm
            label={`💎 ${confirming.price}`}
            tone="gold"
            disabled={buy.isPending}
            onConfirm={() => {
              buy.mutate(confirming.key);
              setConfirming(null);
            }}
          />
          <Button
            label="Cancel"
            tone="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => setConfirming(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

// ─── Power-ups tab ─────────────────────────────────────────────────────────--

function PowerUpsTab({ powerups, balance }: { powerups: Record<string, number>; balance: number }) {
  const buy = useBuyPowerUp();
  return (
    <View className="gap-3">
      <Txt variant="caption" muted className="px-1">
        Power-ups change only the virtual Chip outcome of a bet — never the real-world result.
        Apply one to an entry before the bet locks.
      </Txt>
      {POWERUPS.map((powerup) => (
        <PowerUpCard
          key={powerup.key}
          powerup={powerup}
          owned={powerups[powerup.key] ?? 0}
          canBuy={balance >= powerup.price}
          pending={buy.isPending && buy.variables?.key === powerup.key}
          onBuy={() => buy.mutate({ key: powerup.key, count: 1 })}
        />
      ))}
    </View>
  );
}

// ─── Pro tab ─────────────────────────────────────────────────────────────────

function ProTab({
  active,
  expiresAt,
  balance,
}: {
  active: boolean;
  expiresAt: number | null;
  balance: number;
}) {
  const subscribe = useSubscribePro();
  return (
    <View className="gap-3">
      <ProBanner
        active={active}
        expiresAt={expiresAt}
        canSubscribe={balance >= PRO.PRICE_CHIPS}
        pending={subscribe.isPending}
        onSubscribe={() => subscribe.mutate()}
      />
      <Txt variant="caption" muted className="px-1">
        Pro is a cosmetic and convenience tier. It never improves your odds or payouts on a bet.
      </Txt>
    </View>
  );
}
