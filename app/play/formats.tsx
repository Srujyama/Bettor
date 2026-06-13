/**
 * GAME FORMATS hub — entry cards for every new format: Parlay builder, Challenge
 * a friend, Squares, Bracket, and the Quick-bet Templates library. Reached from
 * the Play hub's "Game Formats" tile. Below the cards a live strip shows the
 * user's own parlay slips. Pure navigation + one live read; no money here.
 */
import { ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Card, Screen, Txt } from '@/components/ui';
import { ParlaySlipCard } from '@/components/domain';
import { useParlaySlips } from '@/features/formats/hooks';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

interface HubCard {
  emoji: string;
  title: string;
  subtitle: string;
  href: Href;
  accent: string;
}

const HUB_CARDS: HubCard[] = [
  {
    emoji: '🎯',
    title: 'Parlay',
    subtitle: 'Stack picks, multiply the payout.',
    href: '/play/parlay',
    accent: 'border-gold/40 bg-gold/10',
  },
  {
    emoji: '⚔️',
    title: 'Challenge a friend',
    subtitle: 'One-tap head-to-head.',
    href: '/play/templates',
    accent: 'border-coral/40 bg-coral/10',
  },
  {
    emoji: '🔲',
    title: 'Squares',
    subtitle: 'Claim a cell on the 10×10 grid.',
    href: '/play/squares/new',
    accent: 'border-royal/40 bg-royal/10',
  },
  {
    emoji: '⚡',
    title: 'Quick bets',
    subtitle: 'One-tap templates to prefill.',
    href: '/play/templates',
    accent: 'border-jade/40 bg-jade/10',
  },
];

export default function GameFormatsHub() {
  const { data: slips } = useParlaySlips({ mine: true });

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <Txt variant="body" dim>
          New ways to bet with your crew.
        </Txt>

        <View className="gap-3">
          {HUB_CARDS.map((c) => (
            <Card key={c.title} onPress={() => router.push(c.href)} className={c.accent}>
              <View className="flex-row items-center gap-3">
                <Txt style={{ fontSize: 30 }}>{c.emoji}</Txt>
                <View className="flex-1 gap-0.5">
                  <Txt variant="heading">{c.title}</Txt>
                  <Txt variant="caption" dim>
                    {c.subtitle}
                  </Txt>
                </View>
                <Txt variant="heading" muted>
                  ›
                </Txt>
              </View>
            </Card>
          ))}
        </View>

        {slips && slips.length > 0 ? (
          <View className="gap-3">
            <Txt variant="label" dim className="uppercase tracking-widest">
              My slips
            </Txt>
            {slips.map((slip) => (
              <ParlaySlipCard
                key={slip.slipId}
                slip={slip}
                onPress={(id) => router.push(`/play/parlay/${id}` as Href)}
              />
            ))}
          </View>
        ) : null}

        <Txt variant="caption" muted className="mt-2 text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}
