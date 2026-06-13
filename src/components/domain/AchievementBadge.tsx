/**
 * AchievementBadge — a single achievement tile for the gallery. Renders the
 * icon, title and tier. Locked achievements are dimmed with a lock glyph; a
 * locked *secret* achievement hides its title/description entirely. Presentational.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import type { AchievementTier } from '@/shared/gamification';

const TIER_RING: Record<AchievementTier, string> = {
  bronze: '#CD7F32',
  silver: '#C9CDD6',
  gold: colors.gold,
  platinum: colors.royal,
};

const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

interface Props {
  icon: string;
  title: string;
  description: string;
  tier: AchievementTier;
  reward: number;
  unlocked: boolean;
  /** Hide details when locked (surprise achievements). */
  secret?: boolean;
}

export function AchievementBadge({ icon, title, description, tier, reward, unlocked, secret }: Props) {
  const hidden = secret && !unlocked;
  const ring = TIER_RING[tier];

  return (
    <View
      className="flex-1 items-center gap-1.5 rounded-card border border-hairline bg-surface px-3 py-4"
      style={{ opacity: unlocked ? 1 : 0.55 }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 2,
          borderColor: unlocked ? ring : colors.hairline,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceSunken,
        }}
      >
        <Txt style={{ fontSize: 28 }}>{hidden ? '🔒' : unlocked ? icon : icon}</Txt>
      </View>
      <Txt variant="label" className="text-center" numberOfLines={1}>
        {hidden ? 'Secret' : title}
      </Txt>
      <Txt variant="caption" muted className="text-center" numberOfLines={2}>
        {hidden ? 'Keep playing to discover this one.' : description}
      </Txt>
      <Txt variant="caption" style={{ color: unlocked ? ring : colors.faint, fontWeight: '700' }}>
        {TIER_LABEL[tier]}
        {!hidden && reward > 0 ? ` · +${reward.toLocaleString()}` : ''}
      </Txt>
    </View>
  );
}
