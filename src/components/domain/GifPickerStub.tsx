/**
 * GifPickerStub — a placeholder GIF picker. A real integration (Giphy/Tenor)
 * would search a provider; for the pilot we surface a small curated set of
 * trash-talk reaction GIF URLs plus a disabled "search" affordance, and fire
 * onPick(url) when one is chosen. Kept intentionally simple — no network deps.
 */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Input, Txt } from '@/components/ui';
import { colors } from '@/theme';

/** A small curated set of reaction GIFs (provider-agnostic direct URLs). */
const CURATED: { label: string; url: string }[] = [
  { label: 'Let’s go', url: 'https://media.tenor.com/placeholder-lets-go.gif' },
  { label: 'Cooked', url: 'https://media.tenor.com/placeholder-cooked.gif' },
  { label: 'Easy money', url: 'https://media.tenor.com/placeholder-easy.gif' },
  { label: 'No chance', url: 'https://media.tenor.com/placeholder-nochance.gif' },
  { label: 'Crying', url: 'https://media.tenor.com/placeholder-crying.gif' },
  { label: 'Mind blown', url: 'https://media.tenor.com/placeholder-mindblown.gif' },
];

interface Props {
  onPick: (gifUrl: string) => void;
}

export function GifPickerStub({ onPick }: Props) {
  const [query, setQuery] = useState('');

  return (
    <View className="gap-2">
      <Input
        placeholder="Search GIFs (coming soon)"
        value={query}
        onChangeText={setQuery}
        editable={false}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
        {CURATED.map((g) => (
          <Pressable
            key={g.url}
            onPress={() => onPick(g.url)}
            className="overflow-hidden rounded-chip border border-hairline"
            style={{ width: 110, height: 84, backgroundColor: colors.surfaceSunken }}
          >
            <Image source={{ uri: g.url }} style={{ flex: 1 }} contentFit="cover" />
            <View className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-0.5">
              <Txt variant="caption" numberOfLines={1}>
                {g.label}
              </Txt>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <Txt variant="caption" muted className="px-1">
        GIF search is a stub in the pilot — these are curated reactions.
      </Txt>
    </View>
  );
}
