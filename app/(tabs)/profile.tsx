/**
 * Profile (current user) — identity header (avatar + name + @handle), a grid of
 * StatBadges (record, win rate, streak, lifetime wagered/won via useCurrentUser),
 * an achievements strip, the user's Crews, and entry points to edit profile and
 * settings. All stats are read-only — they are CF-maintained on the user doc.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, Card, Input, Pill, Screen, Txt } from '@/components/ui';
import { LevelRing, ProfileFlair, StatBadge } from '@/components/domain';
import { colors } from '@/theme';
import { paths } from '@/lib/firebase/paths';
import { useCollectionQuery } from '@/hooks/useFirestoreQuery';
import { useSession } from '@/stores/session';
import { useCurrentUser, useGroups } from '@/hooks/data';
import { useUpdateProfile } from '@/features/social/hooks';
import { formatChips, formatChipsCompact } from '@/shared/money';
import { orderBy } from 'firebase/firestore';
import type { Achievement, Group, User } from '@/shared/schemas';
import type { EquippedCosmetics } from '@/shared/schemas-ext';

/** Expansion denorm fields written onto the user doc by the economy CFs. */
type CosmeticUserView = User & {
  equipped?: EquippedCosmetics | null;
  pro?: { active?: boolean; expiresAt?: number | null } | null;
};

/** Whether the user currently holds an active Pro subscription. */
function isProActive(user: CosmeticUserView): boolean {
  const pro = user.pro;
  if (!pro?.active) return false;
  return pro.expiresAt == null || pro.expiresAt > Date.now();
}

function useAchievements() {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<Achievement>(
    ['achievements', uid],
    uid ? paths.achievements(uid) : null,
    [orderBy('unlockedAt', 'desc')],
    !!uid,
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: groups } = useGroups();
  const { data: achievements } = useAchievements();

  const stats = useMemo(() => {
    const games = (user?.winCount ?? 0) + (user?.lossCount ?? 0);
    const winRate = games > 0 ? Math.round(((user?.winCount ?? 0) / games) * 100) : 0;
    return { games, winRate };
  }, [user]);

  if (!user) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Profile' }} />
        <View className="flex-1 items-center justify-center">
          <Txt variant="body" muted>
            Loading your profile…
          </Txt>
        </View>
      </Screen>
    );
  }

  // useGroups returns the crews available to the user (pilot scope). Show as-is.
  const myGroups = groups ?? [];

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Profile',
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} className="px-2">
              <Txt style={{ fontSize: 20 }}>⚙️</Txt>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        <ProfileHeader user={user} />

        {/* Play hub: level + entry points to season/missions/achievements/shop */}
        <PlayHubCard
          xp={user.xp}
          onOpenPlay={() => router.push('/play')}
          onOpenLevel={() => router.push('/level')}
        />

        {/* Record + rates */}
        <View className="flex-row gap-2">
          <StatBadge label="Record" value={`${user.winCount}–${user.lossCount}`} tone="default" />
          <StatBadge label="Win rate" value={`${stats.winRate}%`} tone="jade" />
          <StatBadge
            label="Streak"
            value={user.currentStreak >= 0 ? `🔥${user.currentStreak}` : `${user.currentStreak}`}
            tone={user.currentStreak > 0 ? 'gold' : 'default'}
          />
        </View>
        <View className="flex-row gap-2">
          <StatBadge label="Wagered" value={formatChipsCompact(user.lifetimeWagered)} tone="royal" />
          <StatBadge label="Won" value={formatChipsCompact(user.lifetimeWon)} tone="jade" />
          <StatBadge label="Best streak" value={user.bestStreak} tone="gold" />
        </View>

        {/* Achievements strip */}
        <AchievementStrip
          achievements={achievements ?? []}
          onSeeAll={() => router.push('/achievements')}
        />

        {/* Crews */}
        <CrewList
          groups={myGroups}
          onPress={(id) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/group/${id}`);
          }}
        />

        {/* Lifetime detail */}
        <Card className="gap-2">
          <Txt variant="label" dim className="uppercase tracking-wide">
            Lifetime
          </Txt>
          <Row label="Chips wagered" value={formatChips(user.lifetimeWagered)} />
          <Row label="Chips won" value={formatChips(user.lifetimeWon)} valueColor={colors.jade} />
          <Row label="Games played" value={String(stats.games)} />
          <Pressable onPress={() => router.push('/level')} accessibilityRole="button">
            <Row label="Level" value={`Lv ${user.level} · ${formatChips(user.xp)} XP  ›`} />
          </Pressable>
        </Card>

        <Button
          label="Edit profile"
          tone="ghost"
          onPress={() => router.push('/settings/account')}
        />
      </ScrollView>
    </Screen>
  );
}

function PlayHubCard({
  xp,
  onOpenPlay,
  onOpenLevel,
}: {
  xp: number;
  onOpenPlay: () => void;
  onOpenLevel: () => void;
}) {
  return (
    <Card raised className="flex-row items-center gap-4">
      <Pressable onPress={onOpenLevel} accessibilityRole="button">
        <LevelRing xp={xp} size={76} stroke={7} />
      </Pressable>
      <View className="flex-1 gap-1">
        <Txt variant="label">Play & progress</Txt>
        <Txt variant="caption" muted>
          Season, missions, achievements and the shop.
        </Txt>
      </View>
      <Button label="Open" tone="jade" size="sm" fullWidth={false} onPress={onOpenPlay} />
    </Card>
  );
}

function ProfileHeader({ user }: { user: User }) {
  const router = useRouter();
  const updateProfile = useUpdateProfile();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName);

  const cosmeticUser = user as CosmeticUserView;

  return (
    <Card raised className="items-center gap-3 py-6">
      <ProfileFlair
        uri={user.photoURL}
        name={user.displayName}
        size={88}
        equipped={cosmeticUser.equipped}
        pro={isProActive(cosmeticUser)}
      />
      {editing ? (
        <View className="w-full gap-2 px-4">
          <Input
            label="Display name"
            value={name}
            onChangeText={setName}
            maxLength={40}
            autoFocus
            placeholder="Your name"
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                label="Cancel"
                tone="ghost"
                size="sm"
                onPress={() => {
                  setName(user.displayName);
                  setEditing(false);
                }}
              />
            </View>
            <View className="flex-1">
              <Button
                label="Save"
                tone="jade"
                size="sm"
                loading={updateProfile.isPending}
                onPress={() => {
                  const trimmed = name.trim();
                  if (trimmed.length >= 1 && trimmed.length <= 40 && trimmed !== user.displayName) {
                    updateProfile.mutate({ displayName: trimmed });
                  }
                  setEditing(false);
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <View className="items-center gap-1">
          <Txt variant="title" className="text-center">
            {user.displayName}
          </Txt>
          <Txt variant="body" muted>
            @{user.handle}
          </Txt>
          <View className="mt-1 flex-row gap-2">
            <Pill label={`Lv ${user.level}`} tone="gold" />
            {user.region ? <Pill label={user.region} tone="muted" /> : null}
          </View>
        </View>
      )}
      {!editing ? (
        <View className="flex-row gap-2">
          <Button label="Edit name" tone="ghost" size="sm" fullWidth={false} onPress={() => setEditing(true)} />
          <Button
            label="Settings"
            tone="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => router.push('/settings')}
          />
        </View>
      ) : null}
    </Card>
  );
}

function AchievementStrip({
  achievements,
  onSeeAll,
}: {
  achievements: Achievement[];
  onSeeAll: () => void;
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-1">
        <Txt variant="label" dim className="uppercase tracking-wide">
          Achievements
        </Txt>
        <Button label="See all" tone="ghost" size="sm" fullWidth={false} onPress={onSeeAll} />
      </View>
      {achievements.length === 0 ? (
        <Card className="items-center py-5">
          <Txt variant="caption" muted>
            No achievements yet. Win bets to unlock badges.
          </Txt>
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {achievements.map((a) => (
            <View
              key={a.achievementId}
              className="w-24 items-center gap-1 rounded-card border border-hairline bg-surface px-2 py-3"
            >
              <Txt style={{ fontSize: 28 }}>{a.icon}</Txt>
              <Txt variant="caption" className="text-center" numberOfLines={1}>
                {a.title}
              </Txt>
              <Pill
                label={a.tier}
                tone={a.tier === 'gold' ? 'gold' : a.tier === 'silver' ? 'muted' : 'coral'}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function CrewList({ groups, onPress }: { groups: Group[]; onPress: (id: string) => void }) {
  const router = useRouter();
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-1">
        <Txt variant="label" dim className="uppercase tracking-wide">
          Crews
        </Txt>
        <Button
          label="Find / create"
          tone="ghost"
          size="sm"
          fullWidth={false}
          onPress={() => router.push('/(modals)/invite-friends')}
        />
      </View>
      {groups.length === 0 ? (
        <Card className="items-center py-5">
          <Txt variant="caption" muted>
            You're not in any crews yet.
          </Txt>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.groupId} onPress={() => onPress(g.groupId)} className="flex-row items-center gap-3">
            <Txt style={{ fontSize: 26 }}>{g.emoji}</Txt>
            <View className="flex-1">
              <Txt variant="label" numberOfLines={1}>
                {g.name}
              </Txt>
              <Txt variant="caption" muted>
                {g.memberCount === 1 ? '1 member' : `${g.memberCount} members`}
              </Txt>
            </View>
            <Txt variant="body" muted>
              ›
            </Txt>
          </Card>
        ))
      )}
    </View>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Txt variant="body" dim>
        {label}
      </Txt>
      <Txt variant="label" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </Txt>
    </View>
  );
}
