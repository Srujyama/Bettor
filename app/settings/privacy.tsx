/**
 * Privacy settings — choose who can see your profile/activity (writes
 * settings.privacy via useUpdateProfile), an optional reduce-motion preference,
 * and informational notes on data export / account deletion (handled by support
 * for the pilot; no destructive client action).
 */
import { ScrollView, Switch, View } from 'react-native';
import { Card, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useCurrentUser } from '@/hooks/data';
import { useUpdateProfile } from '@/features/social/hooks';
import type { User } from '@/shared/schemas';

type Privacy = User['settings']['privacy'];

const PRIVACY_OPTIONS: { value: Privacy; label: string; sub: string }[] = [
  { value: 'public', label: 'Public', sub: 'Anyone can find and view you' },
  { value: 'friends', label: 'Friends only', sub: 'Only friends see your activity' },
  { value: 'private', label: 'Private', sub: 'Hidden from discovery and boards' },
];

export default function PrivacySettings() {
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const settings = user?.settings;
  const current: Privacy = settings?.privacy ?? 'friends';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View className="gap-2">
          <Txt variant="label" dim className="px-1 uppercase tracking-wide">
            Profile visibility
          </Txt>
          <Card className="gap-0 p-0">
            {PRIVACY_OPTIONS.map((opt, i) => {
              const active = current === opt.value;
              return (
                <Card
                  key={opt.value}
                  onPress={() => updateProfile.mutate({ settings: { privacy: opt.value } })}
                  className={`flex-row items-center gap-3 rounded-none border-0 bg-transparent ${
                    i > 0 ? 'border-t border-hairline' : ''
                  }`}
                >
                  <View className="flex-1">
                    <Txt variant="label">{opt.label}</Txt>
                    <Txt variant="caption" muted>
                      {opt.sub}
                    </Txt>
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: active ? colors.jade : colors.hairline,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {active ? (
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.jade }} />
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </Card>
        </View>

        <Card className="flex-row items-center gap-3">
          <View className="flex-1">
            <Txt variant="label">Reduce motion</Txt>
            <Txt variant="caption" muted>
              Calmer animations across the app
            </Txt>
          </View>
          <Switch
            value={Boolean(settings?.reduceMotion)}
            disabled={!user}
            onValueChange={(v) => updateProfile.mutate({ settings: { reduceMotion: v } })}
            trackColor={{ true: colors.jade, false: colors.surfaceRaised }}
            thumbColor={colors.text}
          />
        </Card>

        <View className="gap-2">
          <Txt variant="label" dim className="px-1 uppercase tracking-wide">
            Your data
          </Txt>
          <Card className="gap-2">
            <Txt variant="label">Export your data</Txt>
            <Txt variant="caption" muted>
              Request a copy of your account data and bet history. Email support@chipd.app and we'll
              send your export within 30 days.
            </Txt>
          </Card>
          <Card className="gap-2">
            <Txt variant="label" style={{ color: colors.coral }}>
              Delete your account
            </Txt>
            <Txt variant="caption" muted>
              Account deletion is permanent and removes your profile, friends and history. Email
              support@chipd.app to start the process. Chips have no cash value and are not refundable.
            </Txt>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
