/**
 * Missions — daily + weekly cards with progress bars and a claim button. Reads
 * the current user's mission docs (CF-seeded) and calls ensureMissions on mount
 * so the period's missions exist. Claiming routes through the claimMission
 * callable (server grants Chips + XP via the ledger). Money is read-only here.
 */
import { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { EmptyState, Screen, Txt } from '@/components/ui';
import { MissionCard } from '@/components/domain';
import {
  useClaimMission,
  useEnsureMissions,
  useMissions,
} from '@/features/gamification/hooks';
import type { UserMission } from '@/shared/schemas-ext';

export default function MissionsScreen() {
  const ensure = useEnsureMissions();
  const { data: missions, isLoading } = useMissions();
  const claim = useClaimMission();

  // Seed the current period's missions once on open.
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { daily, weekly } = useMemo(() => {
    const all = missions ?? [];
    const now = Date.now();
    const active = all.filter((m) => m.expiresAt > now);
    return {
      daily: active.filter((m) => m.period === 'daily'),
      weekly: active.filter((m) => m.period === 'weekly'),
    };
  }, [missions]);

  const isEmpty = !isLoading && daily.length === 0 && weekly.length === 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Missions' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {isEmpty ? (
          <EmptyState
            emoji="🎯"
            title="No missions right now"
            subtitle="Check back after the next reset for fresh daily and weekly missions."
            actionLabel="Refresh"
            onAction={() => ensure.mutate()}
          />
        ) : (
          <>
            <Section
              label="Daily"
              missions={daily}
              claimingId={claim.isPending ? (claim.variables ?? null) : null}
              onClaim={(id) => claim.mutate(id)}
            />
            <Section
              label="Weekly"
              missions={weekly}
              claimingId={claim.isPending ? (claim.variables ?? null) : null}
              onClaim={(id) => claim.mutate(id)}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({
  label,
  missions,
  claimingId,
  onClaim,
}: {
  label: string;
  missions: UserMission[];
  claimingId: string | null;
  onClaim: (missionId: string) => void;
}) {
  if (missions.length === 0) return null;
  return (
    <View className="gap-3">
      <Txt variant="label" dim className="px-1 uppercase tracking-wide">
        {label}
      </Txt>
      {missions.map((m) => (
        <MissionCard
          key={m.missionId}
          icon={(m as UserMission & { icon?: string }).icon ?? '🎲'}
          title={(m as UserMission & { title?: string }).title ?? 'Mission'}
          description={(m as UserMission & { description?: string }).description ?? ''}
          period={m.period}
          progress={m.progress}
          target={m.target}
          reward={m.reward}
          xp={m.xp}
          completed={m.completed}
          claimed={m.claimed}
          claiming={claimingId === m.missionId}
          onClaim={() => onClaim(m.missionId)}
        />
      ))}
    </View>
  );
}
