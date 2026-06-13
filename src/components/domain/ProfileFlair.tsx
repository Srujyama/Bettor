/**
 * ProfileFlair — wraps an Avatar with the user's EQUIPPED cosmetics: an
 * avatar_frame (a colored/glowing ring or crown) and a name_color (applied to
 * the name label rendered beside/below it). Cosmetics are cosmetic-only and were
 * bought with Chips; this component only RENDERS the equipped values it's given,
 * it never grants or equips anything.
 *
 * Pass the user's `equipped` map (EquippedCosmetics, denormalized on the user
 * doc). Frame/name-color render hints come from the shared SHOP_CATALOG.
 */
import { View } from 'react-native';
import { Avatar, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { COSMETIC_BY_KEY, type EquippedCosmetics } from '@/shared';

interface Props {
  uri?: string | null;
  name?: string;
  size?: number;
  equipped?: EquippedCosmetics | null;
  /** Show the name beneath the avatar (tinted by the equipped name_color). */
  showName?: boolean;
  /** Pro badge beside the name when the user is a Pro subscriber. */
  pro?: boolean;
}

/** Resolve a frame cosmetic key → a ring color + whether it glows / wears a crown. */
function frameStyle(frameKey?: string | null): { color: string; glow: boolean; crown: boolean } {
  if (!frameKey) return { color: colors.hairline, glow: false, crown: false };
  const def = COSMETIC_BY_KEY[frameKey];
  if (!def) return { color: colors.hairline, glow: false, crown: false };
  if (def.value === 'crown') return { color: colors.gold, glow: true, crown: true };
  if (def.value === 'neon-jade') return { color: colors.jade, glow: true, crown: false };
  // Hex value (e.g. bronze) or a named hint we don't special-case.
  const color = def.value.startsWith('#') ? def.value : colors.royal;
  return { color, glow: false, crown: false };
}

/** Resolve a name_color cosmetic key → a hex color. */
function nameColor(nameColorKey?: string | null): string {
  if (!nameColorKey) return colors.text;
  const def = COSMETIC_BY_KEY[nameColorKey];
  return def?.value?.startsWith('#') ? def.value : colors.text;
}

export function ProfileFlair({
  uri,
  name,
  size = 56,
  equipped,
  showName,
  pro,
}: Props) {
  const frame = frameStyle(equipped?.avatar_frame);
  const tint = nameColor(equipped?.name_color);
  const pad = 3;

  return (
    <View className="items-center gap-1.5">
      <View
        style={{
          width: size + pad * 2,
          height: size + pad * 2,
          borderRadius: (size + pad * 2) / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: frame.color,
          ...(frame.glow
            ? {
                shadowColor: frame.color,
                shadowOpacity: 0.9,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
                elevation: 6,
              }
            : null),
        }}
      >
        <Avatar uri={uri} name={name} size={size} />
        {frame.crown ? (
          <Txt
            style={{
              position: 'absolute',
              top: -size * 0.42,
              fontSize: size * 0.4,
            }}
          >
            👑
          </Txt>
        ) : null}
      </View>

      {showName && name ? (
        <View className="flex-row items-center gap-1">
          <Txt variant="label" numberOfLines={1} style={{ color: tint }}>
            {name}
          </Txt>
          {pro ? <Txt style={{ fontSize: 12, color: colors.gold }}>★</Txt> : null}
        </View>
      ) : null}
    </View>
  );
}
