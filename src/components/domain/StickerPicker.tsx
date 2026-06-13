/**
 * StickerPicker — a horizontal tray of stickers from the sticker packs the user
 * OWNS (compliance: cosmetics are bought with Chips and owned, never faked
 * client-side; the server re-checks ownership on send). Each sticker key is
 * namespaced `${packKey}:${index}`. Tapping a sticker fires onPick(stickerKey).
 *
 * Packs the user does not own are not shown; an empty state nudges them to the
 * shop. The glyph set per pack is defined here (the SHOP_CATALOG only stores the
 * pack's render hint via CosmeticDef.value).
 */
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/ui';
import { COSMETIC_BY_KEY } from '@/shared';
import type { InventoryItem } from '@/shared/schemas-ext';

/** Emoji glyphs per sticker-pack render hint (CosmeticDef.value). */
const PACK_GLYPHS: Record<string, string[]> = {
  classic: ['😏', '😤', '😭', '🤡', '🫡', '💀', '🥶', '🤝', '👀', '🔥', '🧊', '🤑'],
  macau: ['🎆', '🀄️', '🐉', '🧧', '🎇', '🥟', '🛕', '🏮', '🎴', '🐲', '💴', '🌃'],
};

/** Resolve a namespaced sticker key (`pack:index`) to its emoji glyph. */
export function stickerGlyph(stickerKey: string): string | null {
  const [packKey, idxStr] = stickerKey.split(':');
  const def = COSMETIC_BY_KEY[packKey];
  const glyphs = def ? PACK_GLYPHS[def.value] : undefined;
  if (!glyphs) return null;
  const idx = Number(idxStr);
  return Number.isFinite(idx) ? glyphs[idx] ?? null : null;
}

interface Props {
  /** The user's full inventory; we filter to owned sticker packs. */
  inventory: InventoryItem[];
  onPick: (stickerKey: string) => void;
}

export function StickerPicker({ inventory, onPick }: Props) {
  const ownedPacks = inventory
    .filter((i) => i.type === 'sticker_pack')
    .map((i) => i.cosmeticKey)
    .filter((k) => !!COSMETIC_BY_KEY[k]);

  if (ownedPacks.length === 0) {
    return (
      <View className="items-center gap-1 py-4">
        <Txt variant="caption" muted className="text-center">
          No sticker packs yet — grab one in the Shop to talk trash in style.
        </Txt>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {ownedPacks.map((packKey) => {
        const def = COSMETIC_BY_KEY[packKey];
        const glyphs = PACK_GLYPHS[def.value] ?? [];
        return (
          <View key={packKey} className="gap-1.5">
            <Txt variant="caption" muted className="px-1 uppercase tracking-widest">
              {def.name}
            </Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
              {glyphs.map((glyph, idx) => (
                <Pressable
                  key={`${packKey}:${idx}`}
                  onPress={() => onPick(`${packKey}:${idx}`)}
                  className="h-12 w-12 items-center justify-center rounded-chip border border-hairline bg-surface-raised"
                >
                  <Txt style={{ fontSize: 26 }}>{glyph}</Txt>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}
