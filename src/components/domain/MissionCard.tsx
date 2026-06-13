/**
 * MissionCard — one daily/weekly mission with a progress bar and a claim button.
 * Money is never computed here; pressing Claim calls the parent's onClaim which
 * wraps the claimMission callable. Shows completed/claimed states.
 */
import { View } from 'react-native';
import { Button, Card, Pill, Txt } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  icon: string;
  title: string;
  description: string;
  period: 'daily' | 'weekly';
  progress: number;
  target: number;
  reward: number;
  xp: number;
  completed: boolean;
  claimed: boolean;
  claiming?: boolean;
  onClaim: () => void;
}

export function MissionCard({
  icon,
  title,
  description,
  period,
  progress,
  target,
  reward,
  xp,
  completed,
  claimed,
  claiming,
  onClaim,
}: Props) {
  const pct = target > 0 ? Math.min(1, progress / target) : 0;
  const isComplete = completed || progress >= target;

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-3">
        <Txt style={{ fontSize: 28 }}>{icon}</Txt>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Txt variant="label" numberOfLines={1} className="flex-1">
              {title}
            </Txt>
            <Pill label={period === 'daily' ? 'Daily' : 'Weekly'} tone={period === 'daily' ? 'jade' : 'royal'} />
          </View>
          <Txt variant="caption" muted numberOfLines={2}>
            {description}
          </Txt>
        </View>
      </View>

      {/* Progress bar */}
      <View className="gap-1">
        <View className="h-2 overflow-hidden rounded-pill bg-white/5">
          <View
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              backgroundColor: isComplete ? colors.jade : colors.gold,
              borderRadius: 999,
            }}
          />
        </View>
        <View className="flex-row items-center justify-between">
          <Txt variant="caption" muted>
            {Math.min(progress, target)}/{target}
          </Txt>
          <Txt variant="caption" style={{ color: colors.gold, fontWeight: '700' }}>
            +{reward.toLocaleString()} Chips · {xp} XP
          </Txt>
        </View>
      </View>

      {claimed ? (
        <Pill label="Claimed ✓" tone="muted" />
      ) : isComplete ? (
        <Button label="Claim reward" tone="gold" size="sm" loading={claiming} onPress={onClaim} />
      ) : (
        <Button label="In progress" tone="ghost" size="sm" disabled onPress={onClaim} />
      )}
    </Card>
  );
}
