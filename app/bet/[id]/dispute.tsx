/**
 * DISPUTE — challenge a proposed resolution with a reason and optional evidence.
 * Sends fns.raiseDispute; a reviewer adjudicates. Settlement is paused while a
 * dispute is open — the client never touches money.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Button, Card, Input, Screen, Txt } from '@/components/ui';
import { useRaiseDispute } from '@/features/bets/mutations';
import { useBet } from '@/hooks/data';
import { useSession } from '@/stores/session';
import { storageService } from '@/lib/firebase';
import { TIMING } from '@/shared/constants';

export default function DisputeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const betId = id ?? null;
  const myUid = useSession((s) => s.uid);

  const { data: bet } = useBet(betId);
  const raiseDispute = useRaiseDispute();

  const [reason, setReason] = useState('');
  const [evidenceUri, setEvidenceUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const disputeHours = Math.round(TIMING.DISPUTE_WINDOW_MS / (60 * 60 * 1000));

  const pickEvidence = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (!res.canceled && res.assets[0]?.uri) setEvidenceUri(res.assets[0].uri);
  };

  const submit = async () => {
    const text = reason.trim();
    if (!betId || text.length < 1) return;

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
      await raiseDispute.mutateAsync({ betId, reason: text, evidencePath });
      router.back();
    } catch {
      /* toast surfaced by mutation */
    }
  };

  const pending = raiseDispute.isPending || uploading;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Txt variant="title">Raise a dispute</Txt>
          {bet ? (
            <Txt variant="body" dim numberOfLines={3}>
              {bet.title}
            </Txt>
          ) : null}
        </View>

        <Card>
          <Txt variant="caption" dim>
            Disputes pause settlement and send the result to a reviewer. You have {disputeHours} hours from the proposed
            result to raise one. Be specific — vague disputes are rejected.
          </Txt>
        </Card>

        <Input
          label="What's wrong with the result?"
          placeholder="Explain why the outcome is incorrect…"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={500}
        />

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

        <Button
          label="Submit dispute"
          tone="danger"
          onPress={submit}
          disabled={reason.trim().length < 1 || pending}
          loading={pending}
        />
      </ScrollView>
    </Screen>
  );
}
