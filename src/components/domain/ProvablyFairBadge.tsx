/**
 * ProvablyFairBadge — a small tappable chip that reassures the player the round
 * outcome was committed before they played. Tapping expands to show the
 * serverSeedHash (commitment), the revealed serverSeed, the clientSeed and the
 * nonce, so a curious player can verify sha256(serverSeed) === serverSeedHash
 * and re-derive the result offline.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  serverSeedHash?: string | null;
  serverSeed?: string | null;
  clientSeed?: string | null;
  nonce?: number | null;
}

function truncate(s?: string | null): string {
  if (!s) return '—';
  return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
}

export function ProvablyFairBadge({ serverSeedHash, serverSeed, clientSeed, nonce }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View className="rounded-chip border border-hairline bg-surface">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center justify-between px-3 py-2"
      >
        <View className="flex-row items-center gap-2">
          <Txt style={{ color: colors.jade }}>🛡️</Txt>
          <Txt variant="label">Provably fair</Txt>
        </View>
        <Txt variant="caption" muted>
          {open ? 'Hide' : 'Verify'}
        </Txt>
      </Pressable>

      {open ? (
        <View className="gap-2 border-t border-hairline px-3 py-3">
          <Row label="Commitment (sha256)" value={truncate(serverSeedHash)} />
          <Row label="Server seed (revealed)" value={truncate(serverSeed)} />
          <Row label="Client seed" value={truncate(clientSeed)} />
          <Row label="Nonce" value={nonce != null ? String(nonce) : '—'} />
          <Txt variant="caption" muted className="pt-1">
            Verify: sha256(server seed) must equal the commitment. The outcome is
            derived from server:client:nonce — identical inputs always reproduce it.
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Txt variant="caption" muted>
        {label}
      </Txt>
      <Txt variant="mono">{value}</Txt>
    </View>
  );
}
