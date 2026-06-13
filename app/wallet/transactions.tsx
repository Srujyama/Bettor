/**
 * Full ledger list. Read-only audit view of every Chip movement: reason→label,
 * credit in jade / debit in coral, the running balanceAfter the server recorded,
 * and a timestamp. The ledger is append-only and CF-written — we only display.
 */
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { EmptyState, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useLedger } from '@/hooks/data';
import { formatChips } from '@/shared/money';
import { LEDGER_DIRECTION, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import { ledgerLabel, shortDate } from '@/lib/format';
import type { LedgerEntry } from '@/shared/schemas';

export default function TransactionsScreen() {
  const { data: ledger, isLoading } = useLedger(200);
  const entries = ledger ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Transactions' }} />
      {entries.length === 0 && !isLoading ? (
        <EmptyState
          emoji="🧾"
          title="No transactions yet"
          subtitle="Daily Chips, stakes and winnings will show up here."
        />
      ) : (
        <FlashList
          data={entries}
          keyExtractor={(e) => e.entryId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}
          renderItem={({ item }) => <LedgerRow entry={item} />}
          ListFooterComponent={
            <Txt variant="caption" muted className="px-1 pt-6">
              {NO_CASH_VALUE_DISCLOSURE}
            </Txt>
          }
        />
      )}
    </Screen>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const credit = entry.direction === LEDGER_DIRECTION.CREDIT;
  const color = credit ? colors.jade : colors.coral;
  return (
    <View className="flex-row items-center gap-3 border-b border-hairline py-3.5">
      <View className="flex-1">
        <Txt variant="label" numberOfLines={1}>
          {ledgerLabel(entry.reason)}
        </Txt>
        <Txt variant="caption" muted>
          {shortDate(entry.createdAt)}
        </Txt>
      </View>
      <View className="items-end">
        <Txt variant="heading" className="text-base" style={{ color }}>
          {credit ? '+' : '−'}
          {formatChips(entry.amount)}
        </Txt>
        <Txt variant="caption" muted>
          balance {formatChips(entry.balanceAfter)}
        </Txt>
      </View>
    </View>
  );
}
