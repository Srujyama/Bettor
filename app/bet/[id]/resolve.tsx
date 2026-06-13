/**
 * RESOLVE — pick the winning outcome and optionally attach evidence. In CREATOR
 * mode this proposes the result (fns.resolveBet) and opens the dispute window; in
 * CONSENSUS mode it casts the viewer's vote (fns.voteOutcome). The client never
 * settles money — the Cloud Function does, and the result flows back live.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Button, Card, Pill, Screen, Txt } from '@/components/ui';
import { OutcomePicker } from '@/components/domain';
import { useResolveBet, useVoteOutcome } from '@/features/bets/mutations';
import { useBet } from '@/hooks/data';
import { useSession } from '@/stores/session';
import { storageService } from '@/lib/firebase';
import { RESOLUTION_MODE, TIMING } from '@/shared/constants';

export default function ResolveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const betId = id ?? null;
  const myUid = useSession((s) => s.uid);

  const { data: bet } = useBet(betId);
  const resolveBet = useResolveBet();
  const voteOutcome = useVoteOutcome();

  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [evidenceUri, setEvidenceUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!bet) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Txt variant="body" dim>
            Loading…
          </Txt>
        </View>
      </Screen>
    );
  }

  const isConsensus = bet.resolutionMode === RESOLUTION_MODE.CONSENSUS;
  const isCreator = bet.creatorUid === myUid;
  const voting = isConsensus && !isCreator;
  const disputeHours = Math.round(TIMING.DISPUTE_WINDOW_MS / (60 * 60 * 1000));

  const pickEvidence = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]?.uri) setEvidenceUri(res.assets[0].uri);
  };

  const submit = async () => {
    if (!betId || !outcomeId) return;

    if (voting) {
      try {
        await voteOutcome.mutateAsync({ betId, outcomeId });
        router.back();
      } catch {
        /* toast surfaced by mutation */
      }
      return;
    }

    let evidencePath: string | null = null;
    if (evidenceUri && myUid) {
      try {
        setUploading(true);
        const path = storageService.storagePathForEvidence(betId, myUid);
        evidencePath = await storageService.uploadFromUri(path, evidenceUri);
      } catch {
        evidencePath = null;
      } finally {
        setUploading(false);
      }
    }

    try {
      await resolveBet.mutateAsync({ betId, winningOutcomeId: outcomeId, evidencePath });
      router.back();
    } catch {
      /* toast surfaced by mutation */
    }
  };

  const pending = resolveBet.isPending || voteOutcome.isPending || uploading;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Txt variant="title">{voting ? 'Cast your vote' : 'Declare the winner'}</Txt>
          <Txt variant="body" dim numberOfLines={3}>
            {bet.title}
          </Txt>
        </View>

        <OutcomePicker
          outcomes={bet.outcomes}
          value={outcomeId}
          onChange={setOutcomeId}
          poolByOutcome={bet.poolByOutcome}
        />

        {!voting ? (
          <View className="gap-2">
            <Txt variant="label" dim>
              Evidence (optional)
            </Txt>
            {evidenceUri ? (
              <View className="gap-2">
                <Image source={{ uri: evidenceUri }} style={{ width: '100%', height: 180, borderRadius: 16 }} contentFit="cover" />
                <Button label="Remove" tone="ghost" size="sm" onPress={() => setEvidenceUri(null)} />
              </View>
            ) : (
              <Button label="Attach a photo" tone="ghost" size="sm" onPress={pickEvidence} />
            )}
          </View>
        ) : null}

        <Card>
          {voting ? (
            <Txt variant="caption" dim>
              Your vote counts toward consensus. Once enough participants agree, the outcome is locked and the pot is settled.
            </Txt>
          ) : (
            <View className="gap-1">
              <Pill label={`${disputeHours}h dispute window`} tone="gold" />
              <Txt variant="caption" dim className="mt-1">
                After you submit, participants have {disputeHours} hours to dispute the result before the pot settles automatically. Choose carefully.
              </Txt>
            </View>
          )}
        </Card>

        <Button
          label={voting ? 'Submit vote' : 'Submit result'}
          tone="gold"
          onPress={submit}
          disabled={!outcomeId || pending}
          loading={pending}
        />
      </ScrollView>
    </Screen>
  );
}
