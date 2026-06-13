/**
 * Notification settings — toggles that write into user.settings via
 * useUpdateProfile (which patches `settings.<key>` on the user doc). Each toggle
 * persists immediately and optimistically.
 */
import { ScrollView, Switch, View } from 'react-native';
import { Card, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useCurrentUser } from '@/hooks/data';
import { useUpdateProfile } from '@/features/social/hooks';
import type { User } from '@/shared/schemas';

type SettingKey = keyof User['settings'];

const TOGGLES: { key: SettingKey; label: string; sub: string }[] = [
  { key: 'pushEnabled', label: 'Push notifications', sub: 'Master switch for all pushes' },
  { key: 'notifyOnJoin', label: 'Someone joins my bet', sub: 'When a friend takes the other side' },
  { key: 'notifyOnResolve', label: 'A bet resolves', sub: 'Results and payouts' },
  { key: 'notifyOnComment', label: 'New comments', sub: 'Banter on bets you are in' },
];

export default function NotificationSettings() {
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();

  const settings = user?.settings;
  const setToggle = (key: SettingKey, value: boolean) => {
    updateProfile.mutate({ settings: { [key]: value } });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <Card className="gap-0 p-0">
          {TOGGLES.map((t, i) => {
            const value = Boolean(settings?.[t.key as keyof typeof settings] ?? true);
            const masterOff = t.key !== 'pushEnabled' && settings?.pushEnabled === false;
            return (
              <View
                key={t.key}
                className={`flex-row items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-hairline' : ''}`}
                style={{ opacity: masterOff ? 0.4 : 1 }}
              >
                <View className="flex-1">
                  <Txt variant="label">{t.label}</Txt>
                  <Txt variant="caption" muted>
                    {t.sub}
                  </Txt>
                </View>
                <Switch
                  value={value}
                  disabled={masterOff || !user}
                  onValueChange={(v) => setToggle(t.key, v)}
                  trackColor={{ true: colors.jade, false: colors.surfaceRaised }}
                  thumbColor={colors.text}
                />
              </View>
            );
          })}
        </Card>

        <Txt variant="caption" muted className="px-1">
          Turning off the master switch silences every notification. You can fine-tune the rest when
          it's on.
        </Txt>
      </ScrollView>
    </Screen>
  );
}
