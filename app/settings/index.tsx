/**
 * Settings home — a sectioned list routing to each settings sub-screen. Reads
 * the current user only for a header summary; no money or mutations here.
 */
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Avatar, Card, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useCurrentUser } from '@/hooks/data';

interface Item {
  icon: string;
  label: string;
  sub: string;
  href: Href;
}

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'You',
    items: [
      { icon: '👤', label: 'Account', sub: 'Name, handle, sign out', href: '/settings/account' },
      { icon: '🔔', label: 'Notifications', sub: 'Pushes and alerts', href: '/settings/notifications' },
      { icon: '🔒', label: 'Privacy', sub: 'Who can see you, data', href: '/settings/privacy' },
    ],
  },
  {
    title: 'Play safe',
    items: [
      {
        icon: '🛟',
        label: 'Responsible gaming',
        sub: 'Limits, reminders, activity',
        href: '/settings/responsible-gaming',
      },
    ],
  },
  {
    title: 'About',
    items: [{ icon: '📄', label: 'Legal', sub: 'Terms, privacy, 18+', href: '/settings/legal' }],
  },
];

export default function SettingsIndex() {
  const router = useRouter();
  const { data: user } = useCurrentUser();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {user ? (
          <Card raised className="flex-row items-center gap-3">
            <Avatar uri={user.photoURL} name={user.displayName} size={48} ring />
            <View className="flex-1">
              <Txt variant="heading" numberOfLines={1}>
                {user.displayName}
              </Txt>
              <Txt variant="caption" muted>
                @{user.handle}
              </Txt>
            </View>
          </Card>
        ) : null}

        {SECTIONS.map((section) => (
          <View key={section.title} className="gap-2">
            <Txt variant="label" dim className="px-1 uppercase tracking-wide">
              {section.title}
            </Txt>
            <Card className="gap-0 p-0">
              {section.items.map((item, i) => (
                <Card
                  key={item.label}
                  onPress={() => router.push(item.href)}
                  className={`flex-row items-center gap-3 rounded-none border-0 bg-transparent ${
                    i > 0 ? 'border-t border-hairline' : ''
                  }`}
                >
                  <Txt style={{ fontSize: 22 }}>{item.icon}</Txt>
                  <View className="flex-1">
                    <Txt variant="label">{item.label}</Txt>
                    <Txt variant="caption" muted>
                      {item.sub}
                    </Txt>
                  </View>
                  <Txt variant="body" style={{ color: colors.textFaint }}>
                    ›
                  </Txt>
                </Card>
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
