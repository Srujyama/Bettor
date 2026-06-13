/**
 * CREATE WIZARD — a single modal screen with internal step state.
 *
 *   1. Basics   — title, category, optional cover image (picked + uploaded).
 *   2. Type     — bet shape → outcomes (binary/head-to-head/multi/over-under/pool).
 *   3. Stakes   — stake mode + min/max, market model, visibility, resolution mode.
 *   4. Timing   — lockAt + resolveBy (Macau time; defaults lock +24h, resolve +48h).
 *   5. Review   — recap → useCreateBet (fns.createBet) with a fresh idempotency key.
 *
 * The client never touches money: it only sends a validated CreateBetPayload and
 * routes to the new bet on success.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { formatInTimeZone } from 'date-fns-tz';
import { Button, Card, Input, Pill, Screen, Txt } from '@/components/ui';
import { SegmentedTabs } from '@/components/domain';
import { useCreateBet } from '@/features/bets/mutations';
import { storageService } from '@/lib/firebase';
import { colors } from '@/theme';
import {
  BET_CATEGORY,
  BET_TYPE,
  BET_VISIBILITY,
  MARKET_MODEL,
  RESOLUTION_MODE,
  STAKE,
  TIMEZONE,
  NO_CASH_VALUE_DISCLOSURE,
  type BetCategory,
  type BetType,
  type BetVisibility,
  type ResolutionMode,
} from '@/shared/constants';
import { makeIdempotencyKey, makeId } from '@/shared/ids';
import { formatChips } from '@/shared/money';
import type { CreateBetPayload } from '@/shared/schemas';

const STEPS = ['Basics', 'Type', 'Stakes', 'Timing', 'Review'] as const;

const CATEGORY_OPTIONS: { value: BetCategory; label: string; emoji: string }[] = [
  { value: BET_CATEGORY.SPORTS, label: 'Sports', emoji: '🏆' },
  { value: BET_CATEGORY.SOCIAL, label: 'Social', emoji: '🍸' },
  { value: BET_CATEGORY.GAMING, label: 'Gaming', emoji: '🎮' },
  { value: BET_CATEGORY.WEATHER, label: 'Weather', emoji: '🌦️' },
  { value: BET_CATEGORY.PROP, label: 'Prop', emoji: '🎲' },
  { value: BET_CATEGORY.CUSTOM, label: 'Custom', emoji: '✨' },
];

const TYPE_OPTIONS: { value: BetType; label: string; hint: string }[] = [
  { value: BET_TYPE.BINARY, label: 'Yes / No', hint: 'A simple will-it-happen bet.' },
  { value: BET_TYPE.HEAD_TO_HEAD, label: 'Head to head', hint: 'Two named sides go at it.' },
  { value: BET_TYPE.MULTI, label: 'Multiple choice', hint: 'Pick one of several options.' },
  { value: BET_TYPE.OVER_UNDER, label: 'Over / Under', hint: 'Set a number line.' },
  { value: BET_TYPE.POOL, label: 'Pool', hint: 'Many sides split the pot.' },
];

const VISIBILITY_OPTIONS: { value: BetVisibility; label: string }[] = [
  { value: BET_VISIBILITY.FRIENDS, label: 'Friends' },
  { value: BET_VISIBILITY.PUBLIC, label: 'Public' },
  { value: BET_VISIBILITY.GROUP, label: 'Group' },
];

const HOUR = 60 * 60 * 1000;

interface OutcomeDraft {
  key: string;
  label: string;
}

export default function CreateBetModal() {
  const createBet = useCreateBet();

  // Prefill from a template or rematch (see src/features/formats/templates.ts).
  // Params are flat strings; `outcomes` is a "|"-joined list of labels.
  const params = useLocalSearchParams<{
    title?: string;
    description?: string;
    category?: string;
    type?: string;
    outcomes?: string;
  }>();
  const prefillOutcomes = useMemo(
    () => (params.outcomes ? String(params.outcomes).split('|').filter(Boolean) : []),
    [params.outcomes],
  );
  const prefillType = (params.type as BetType) || BET_TYPE.BINARY;

  const [step, setStep] = useState(0);

  // Step 1 — basics
  const [title, setTitle] = useState(params.title ? String(params.title) : '');
  const [description, setDescription] = useState(params.description ? String(params.description) : '');
  const [category, setCategory] = useState<BetCategory>(
    (params.category as BetCategory) || BET_CATEGORY.SOCIAL,
  );
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Step 2 — type + outcomes
  const [type, setType] = useState<BetType>(prefillType);
  const [sideA, setSideA] = useState(prefillOutcomes[0] ?? ''); // head-to-head
  const [sideB, setSideB] = useState(prefillOutcomes[1] ?? '');
  const [multiOutcomes, setMultiOutcomes] = useState<OutcomeDraft[]>(
    prefillOutcomes.length >= 2
      ? prefillOutcomes.map((label) => ({ key: makeId('o'), label }))
      : [
          { key: makeId('o'), label: '' },
          { key: makeId('o'), label: '' },
        ],
  );
  const [ouLine, setOuLine] = useState(''); // over-under numeric line
  const [ouMetric, setOuMetric] = useState(''); // what's being measured

  // Step 3 — stakes + rules
  const [stakeMode, setStakeMode] = useState<'fixed' | 'open'>('open');
  const [fixedStake, setFixedStake] = useState('100');
  const [minStake, setMinStake] = useState(String(STAKE.MIN));
  const [maxStake, setMaxStake] = useState(String(STAKE.DEFAULT_MAX));
  const [visibility, setVisibility] = useState<BetVisibility>(BET_VISIBILITY.FRIENDS);
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>(RESOLUTION_MODE.CREATOR);

  // Step 4 — timing (epoch millis)
  const [lockAt, setLockAt] = useState(() => Date.now() + 24 * HOUR);
  const [resolveBy, setResolveBy] = useState(() => Date.now() + 48 * HOUR);

  // ── Derived outcomes for the payload ──────────────────────────────────────
  const outcomes = useMemo(() => buildOutcomes({ type, sideA, sideB, multiOutcomes, ouLine, ouMetric }), [
    type,
    sideA,
    sideB,
    multiOutcomes,
    ouLine,
    ouMetric,
  ]);

  const marketModel =
    type === BET_TYPE.HEAD_TO_HEAD || type === BET_TYPE.BINARY
      ? MARKET_MODEL.WINNER_TAKE_ALL
      : MARKET_MODEL.PARI_MUTUEL;

  // ── Per-step validation ───────────────────────────────────────────────────
  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return title.trim().length >= 3;
      case 1:
        return outcomes.length >= 2 && outcomes.every((o) => o.label.trim().length >= 1);
      case 2: {
        const min = Number(minStake);
        const max = Number(maxStake);
        if (!Number.isInteger(min) || min < STAKE.MIN) return false;
        if (maxStake && (!Number.isInteger(max) || max < min)) return false;
        if (stakeMode === 'fixed') {
          const fx = Number(fixedStake);
          if (!Number.isInteger(fx) || fx < STAKE.MIN) return false;
        }
        return true;
      }
      case 3:
        return resolveBy > lockAt && lockAt > Date.now();
      default:
        return true;
    }
  }, [step, title, outcomes, minStake, maxStake, stakeMode, fixedStake, resolveBy, lockAt]);

  // ── Cover image ───────────────────────────────────────────────────────────
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setMediaUri(res.assets[0].uri);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    let mediaPath: string | null = null;
    if (mediaUri) {
      try {
        setUploading(true);
        // We don't have the betId yet; key media by a client id under bets/.
        const path = storageService.storagePathForBetMedia(makeId('newbet'));
        mediaPath = await storageService.uploadFromUri(path, mediaUri);
      } catch {
        mediaPath = null; // non-fatal: create the bet without the cover
      } finally {
        setUploading(false);
      }
    }

    const min = Number(minStake);
    const max = maxStake ? Number(maxStake) : null;
    const payload: CreateBetPayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      type,
      outcomes: outcomes.map((o) => ({ label: o.label.trim() })),
      marketModel,
      stakeMode,
      fixedStakeAmount: stakeMode === 'fixed' ? Number(fixedStake) : null,
      minStake: stakeMode === 'fixed' ? Number(fixedStake) : min,
      maxStake: stakeMode === 'fixed' ? Number(fixedStake) : max,
      visibility,
      resolutionMode,
      consensusThreshold: resolutionMode === RESOLUTION_MODE.CONSENSUS ? 0.6 : null,
      lockAt,
      resolveBy,
      mediaPath,
      idempotencyKey: makeIdempotencyKey(),
    };

    const result = await createBet.mutateAsync(payload);
    if (result?.betId) {
      router.replace(`/bet/${result.betId}`);
    } else {
      router.back();
    }
  };

  const goNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  };
  const goBack = () => {
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  return (
    <Screen>
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
        <Pressable onPress={goBack} hitSlop={12}>
          <Txt variant="label" dim>
            {step === 0 ? 'Cancel' : 'Back'}
          </Txt>
        </Pressable>
        <Txt variant="label" className="uppercase tracking-widest">
          New bet
        </Txt>
        <View style={{ width: 48 }} />
      </View>

      <StepDots count={STEPS.length} active={step} />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 20 }} keyboardShouldPersistTaps="handled">
        <Txt variant="title">{STEPS[step]}</Txt>

        {step === 0 ? (
          <BasicsStep
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            category={category}
            setCategory={setCategory}
            mediaUri={mediaUri}
            onPickImage={pickImage}
            onClearImage={() => setMediaUri(null)}
          />
        ) : null}

        {step === 1 ? (
          <TypeStep
            type={type}
            setType={setType}
            sideA={sideA}
            setSideA={setSideA}
            sideB={sideB}
            setSideB={setSideB}
            multiOutcomes={multiOutcomes}
            setMultiOutcomes={setMultiOutcomes}
            ouLine={ouLine}
            setOuLine={setOuLine}
            ouMetric={ouMetric}
            setOuMetric={setOuMetric}
          />
        ) : null}

        {step === 2 ? (
          <StakesStep
            stakeMode={stakeMode}
            setStakeMode={setStakeMode}
            fixedStake={fixedStake}
            setFixedStake={setFixedStake}
            minStake={minStake}
            setMinStake={setMinStake}
            maxStake={maxStake}
            setMaxStake={setMaxStake}
            visibility={visibility}
            setVisibility={setVisibility}
            resolutionMode={resolutionMode}
            setResolutionMode={setResolutionMode}
            marketModel={marketModel}
          />
        ) : null}

        {step === 3 ? (
          <TimingStep lockAt={lockAt} setLockAt={setLockAt} resolveBy={resolveBy} setResolveBy={setResolveBy} />
        ) : null}

        {step === 4 ? (
          <ReviewStep
            title={title}
            category={category}
            type={type}
            outcomes={outcomes.map((o) => o.label)}
            stakeMode={stakeMode}
            fixedStake={fixedStake}
            minStake={minStake}
            maxStake={maxStake}
            visibility={visibility}
            resolutionMode={resolutionMode}
            lockAt={lockAt}
            resolveBy={resolveBy}
          />
        ) : null}
      </ScrollView>

      {/* Footer */}
      <View className="gap-2 border-t border-hairline px-4 pb-6 pt-3">
        {step < STEPS.length - 1 ? (
          <Button label="Continue" tone="jade" onPress={goNext} disabled={!stepValid} />
        ) : (
          <Button
            label="Create bet"
            tone="jade"
            onPress={submit}
            loading={createBet.isPending || uploading}
            disabled={createBet.isPending || uploading}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Step components ───────────────────────────────────────────────────────────

function BasicsStep(props: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  category: BetCategory;
  setCategory: (v: BetCategory) => void;
  mediaUri: string | null;
  onPickImage: () => void;
  onClearImage: () => void;
}) {
  return (
    <View className="gap-5">
      <Input
        label="What's the bet?"
        placeholder="e.g. Will it rain on Saturday?"
        value={props.title}
        onChangeText={props.setTitle}
        maxLength={120}
      />
      <Input
        label="Details (optional)"
        placeholder="Add context, rules, how it resolves…"
        value={props.description}
        onChangeText={props.setDescription}
        multiline
        maxLength={500}
      />

      <View className="gap-2">
        <Txt variant="label" dim>
          Category
        </Txt>
        <View className="flex-row flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => {
            const active = props.category === c.value;
            return (
              <Pressable
                key={c.value}
                onPress={() => props.setCategory(c.value)}
                className={`flex-row items-center gap-1.5 rounded-pill border px-3 py-2 ${
                  active ? 'border-jade/60 bg-jade/15' : 'border-hairline bg-surface-raised'
                }`}
              >
                <Txt style={{ fontSize: 14 }}>{c.emoji}</Txt>
                <Txt variant="label" className={active ? 'text-jade' : 'text-text-dim'}>
                  {c.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2">
        <Txt variant="label" dim>
          Cover image (optional)
        </Txt>
        {props.mediaUri ? (
          <View className="gap-2">
            <Image
              source={{ uri: props.mediaUri }}
              style={{ width: '100%', height: 160, borderRadius: 16 }}
              contentFit="cover"
            />
            <Button label="Remove image" tone="ghost" size="sm" onPress={props.onClearImage} />
          </View>
        ) : (
          <Pressable
            onPress={props.onPickImage}
            className="h-32 items-center justify-center rounded-card border border-dashed border-hairline bg-surface-raised"
          >
            <Txt style={{ fontSize: 28 }}>🖼️</Txt>
            <Txt variant="caption" dim>
              Add a cover
            </Txt>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function TypeStep(props: {
  type: BetType;
  setType: (v: BetType) => void;
  sideA: string;
  setSideA: (v: string) => void;
  sideB: string;
  setSideB: (v: string) => void;
  multiOutcomes: OutcomeDraft[];
  setMultiOutcomes: (v: OutcomeDraft[]) => void;
  ouLine: string;
  setOuLine: (v: string) => void;
  ouMetric: string;
  setOuMetric: (v: string) => void;
}) {
  const updateMulti = (key: string, label: string) =>
    props.setMultiOutcomes(props.multiOutcomes.map((o) => (o.key === key ? { ...o, label } : o)));
  const addMulti = () => {
    if (props.multiOutcomes.length >= 12) return;
    props.setMultiOutcomes([...props.multiOutcomes, { key: makeId('o'), label: '' }]);
  };
  const removeMulti = (key: string) => {
    if (props.multiOutcomes.length <= 2) return;
    props.setMultiOutcomes(props.multiOutcomes.filter((o) => o.key !== key));
  };

  return (
    <View className="gap-5">
      <View className="gap-2">
        {TYPE_OPTIONS.map((t) => {
          const active = props.type === t.value;
          return (
            <Pressable
              key={t.value}
              onPress={() => props.setType(t.value)}
              className={`gap-0.5 rounded-card border px-4 py-3 ${
                active ? 'border-jade/60 bg-jade/10' : 'border-hairline bg-surface-raised'
              }`}
            >
              <Txt variant="heading" className={active ? 'text-jade' : 'text-text'}>
                {t.label}
              </Txt>
              <Txt variant="caption" dim>
                {t.hint}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {/* Outcome inputs by type */}
      {props.type === BET_TYPE.BINARY ? (
        <Card>
          <Txt variant="label" dim className="mb-1">
            Outcomes
          </Txt>
          <Txt variant="body">Yes / No (set automatically).</Txt>
        </Card>
      ) : null}

      {props.type === BET_TYPE.HEAD_TO_HEAD ? (
        <View className="gap-3">
          <Input label="Side A" placeholder="e.g. Me" value={props.sideA} onChangeText={props.setSideA} maxLength={60} />
          <Input label="Side B" placeholder="e.g. You" value={props.sideB} onChangeText={props.setSideB} maxLength={60} />
        </View>
      ) : null}

      {props.type === BET_TYPE.MULTI || props.type === BET_TYPE.POOL ? (
        <View className="gap-3">
          {props.multiOutcomes.map((o, i) => (
            <View key={o.key} className="flex-row items-end gap-2">
              <View className="flex-1">
                <Input
                  label={`Option ${i + 1}`}
                  placeholder="Outcome label"
                  value={o.label}
                  onChangeText={(v) => updateMulti(o.key, v)}
                  maxLength={60}
                />
              </View>
              {props.multiOutcomes.length > 2 ? (
                <Pressable
                  onPress={() => removeMulti(o.key)}
                  className="mb-1 h-11 w-11 items-center justify-center rounded-chip border border-hairline bg-surface-raised"
                >
                  <Txt variant="heading" muted>
                    ×
                  </Txt>
                </Pressable>
              ) : null}
            </View>
          ))}
          {props.multiOutcomes.length < 12 ? (
            <Button label="Add option" tone="ghost" size="sm" onPress={addMulti} />
          ) : null}
        </View>
      ) : null}

      {props.type === BET_TYPE.OVER_UNDER ? (
        <View className="gap-3">
          <Input
            label="What's being measured?"
            placeholder="e.g. Total goals"
            value={props.ouMetric}
            onChangeText={props.setOuMetric}
            maxLength={50}
          />
          <Input
            label="The line"
            placeholder="e.g. 2.5"
            value={props.ouLine}
            onChangeText={props.setOuLine}
            keyboardType="numeric"
          />
          <Card>
            <Txt variant="caption" dim>
              Backers pick Over {props.ouLine || '—'} or Under {props.ouLine || '—'}.
            </Txt>
          </Card>
        </View>
      ) : null}
    </View>
  );
}

function StakesStep(props: {
  stakeMode: 'fixed' | 'open';
  setStakeMode: (v: 'fixed' | 'open') => void;
  fixedStake: string;
  setFixedStake: (v: string) => void;
  minStake: string;
  setMinStake: (v: string) => void;
  maxStake: string;
  setMaxStake: (v: string) => void;
  visibility: BetVisibility;
  setVisibility: (v: BetVisibility) => void;
  resolutionMode: ResolutionMode;
  setResolutionMode: (v: ResolutionMode) => void;
  marketModel: string;
}) {
  return (
    <View className="gap-5">
      <View className="gap-2">
        <Txt variant="label" dim>
          Stake mode
        </Txt>
        <SegmentedTabs
          tabs={['Open', 'Fixed']}
          value={props.stakeMode === 'open' ? 'Open' : 'Fixed'}
          onChange={(t) => props.setStakeMode(t === 'Open' ? 'open' : 'fixed')}
        />
        <Txt variant="caption" muted>
          {props.stakeMode === 'open'
            ? 'Players choose how many Chips to stake within your range.'
            : 'Everyone stakes the same fixed amount.'}
        </Txt>
      </View>

      {props.stakeMode === 'fixed' ? (
        <Input
          label="Fixed stake (Chips)"
          value={props.fixedStake}
          onChangeText={props.setFixedStake}
          keyboardType="number-pad"
          prefix="🪙"
        />
      ) : (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Input
              label="Min stake"
              value={props.minStake}
              onChangeText={props.setMinStake}
              keyboardType="number-pad"
            />
          </View>
          <View className="flex-1">
            <Input
              label="Max stake"
              value={props.maxStake}
              onChangeText={props.setMaxStake}
              keyboardType="number-pad"
            />
          </View>
        </View>
      )}

      <Card>
        <View className="flex-row items-center justify-between">
          <Txt variant="label" dim>
            Market model
          </Txt>
          <Pill
            label={props.marketModel === MARKET_MODEL.WINNER_TAKE_ALL ? 'Winner takes all' : 'Pari-mutuel'}
            tone="gold"
          />
        </View>
        <Txt variant="caption" muted className="mt-1">
          Winners split the pot proportionally to their stake. The house takes no rake in the pilot.
        </Txt>
      </Card>

      <View className="gap-2">
        <Txt variant="label" dim>
          Who can see it?
        </Txt>
        <View className="flex-row flex-wrap gap-2">
          {VISIBILITY_OPTIONS.map((v) => {
            const active = props.visibility === v.value;
            return (
              <Pressable
                key={v.value}
                onPress={() => props.setVisibility(v.value)}
                className={`rounded-pill border px-3 py-2 ${
                  active ? 'border-royal/60 bg-royal/15' : 'border-hairline bg-surface-raised'
                }`}
              >
                <Txt variant="label" className={active ? 'text-royal' : 'text-text-dim'}>
                  {v.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2">
        <Txt variant="label" dim>
          Who resolves it?
        </Txt>
        <SegmentedTabs
          tabs={['You', 'Consensus']}
          value={props.resolutionMode === RESOLUTION_MODE.CREATOR ? 'You' : 'Consensus'}
          onChange={(t) =>
            props.setResolutionMode(t === 'You' ? RESOLUTION_MODE.CREATOR : RESOLUTION_MODE.CONSENSUS)
          }
        />
        <Txt variant="caption" muted>
          {props.resolutionMode === RESOLUTION_MODE.CREATOR
            ? 'You declare the winner after the bet locks.'
            : 'A majority of participants must agree on the outcome.'}
        </Txt>
      </View>
    </View>
  );
}

function TimingStep(props: {
  lockAt: number;
  setLockAt: (v: number) => void;
  resolveBy: number;
  setResolveBy: (v: number) => void;
}) {
  const LOCK_PRESETS = [
    { label: '1 hour', ms: 1 * HOUR },
    { label: '6 hours', ms: 6 * HOUR },
    { label: '24 hours', ms: 24 * HOUR },
    { label: '3 days', ms: 72 * HOUR },
    { label: '1 week', ms: 168 * HOUR },
  ];
  const RESOLVE_PRESETS = [
    { label: '+6 hours', ms: 6 * HOUR },
    { label: '+24 hours', ms: 24 * HOUR },
    { label: '+3 days', ms: 72 * HOUR },
    { label: '+1 week', ms: 168 * HOUR },
  ];

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Txt variant="label" dim>
          Entries lock in
        </Txt>
        <View className="flex-row flex-wrap gap-2">
          {LOCK_PRESETS.map((p) => {
            const target = Date.now() + p.ms;
            const active = Math.abs(props.lockAt - target) < 2 * 60 * 1000;
            return (
              <Pressable
                key={p.label}
                onPress={() => {
                  props.setLockAt(target);
                  // Keep resolveBy at least 1h after lock.
                  if (props.resolveBy <= target) props.setResolveBy(target + 24 * HOUR);
                }}
                className={`rounded-pill border px-3 py-2 ${
                  active ? 'border-jade/60 bg-jade/15' : 'border-hairline bg-surface-raised'
                }`}
              >
                <Txt variant="label" className={active ? 'text-jade' : 'text-text-dim'}>
                  {p.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
        <Txt variant="caption" muted>
          Locks {formatInTimeZone(props.lockAt, TIMEZONE, "EEE d MMM, HH:mm")} (Macau)
        </Txt>
      </View>

      <View className="gap-2">
        <Txt variant="label" dim>
          Must resolve by
        </Txt>
        <View className="flex-row flex-wrap gap-2">
          {RESOLVE_PRESETS.map((p) => {
            const target = props.lockAt + p.ms;
            const active = Math.abs(props.resolveBy - target) < 2 * 60 * 1000;
            return (
              <Pressable
                key={p.label}
                onPress={() => props.setResolveBy(target)}
                className={`rounded-pill border px-3 py-2 ${
                  active ? 'border-gold/60 bg-gold/15' : 'border-hairline bg-surface-raised'
                }`}
              >
                <Txt variant="label" className={active ? 'text-gold' : 'text-text-dim'}>
                  {p.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
        <Txt variant="caption" muted>
          Resolves by {formatInTimeZone(props.resolveBy, TIMEZONE, "EEE d MMM, HH:mm")} (Macau)
        </Txt>
        <Txt variant="caption" muted>
          A bet that isn't resolved by then is auto-voided and everyone is refunded.
        </Txt>
      </View>
    </View>
  );
}

function ReviewStep(props: {
  title: string;
  category: BetCategory;
  type: BetType;
  outcomes: string[];
  stakeMode: 'fixed' | 'open';
  fixedStake: string;
  minStake: string;
  maxStake: string;
  visibility: BetVisibility;
  resolutionMode: ResolutionMode;
  lockAt: number;
  resolveBy: number;
}) {
  const stakeLine =
    props.stakeMode === 'fixed'
      ? `Fixed ${formatChips(Number(props.fixedStake) || 0)} Chips`
      : `${formatChips(Number(props.minStake) || 0)}–${formatChips(Number(props.maxStake) || 0)} Chips`;

  return (
    <View className="gap-3">
      <Card raised>
        <Txt variant="heading">{props.title}</Txt>
        <View className="mt-2 flex-row flex-wrap gap-2">
          <Pill label={props.category} tone="muted" />
          <Pill label={props.type.replace(/_/g, ' ')} tone="royal" />
          <Pill label={props.visibility} tone="jade" />
        </View>
      </Card>

      <Card>
        <Txt variant="label" dim className="mb-2">
          Outcomes
        </Txt>
        <View className="gap-1">
          {props.outcomes.map((o, i) => (
            <Txt key={`${o}-${i}`} variant="body">
              • {o}
            </Txt>
          ))}
        </View>
      </Card>

      <ReviewRow label="Stakes" value={stakeLine} />
      <ReviewRow
        label="Resolution"
        value={props.resolutionMode === RESOLUTION_MODE.CREATOR ? 'You call it' : 'Consensus'}
      />
      <ReviewRow label="Locks" value={`${formatInTimeZone(props.lockAt, TIMEZONE, 'EEE d MMM, HH:mm')} (Macau)`} />
      <ReviewRow label="Resolves by" value={`${formatInTimeZone(props.resolveBy, TIMEZONE, 'EEE d MMM, HH:mm')} (Macau)`} />

      <Txt variant="caption" muted className="mt-2 text-center">
        {NO_CASH_VALUE_DISCLOSURE}
      </Txt>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-hairline py-2.5">
      <Txt variant="label" dim>
        {label}
      </Txt>
      <Txt variant="label" className="flex-1 text-right" numberOfLines={2}>
        {value}
      </Txt>
    </View>
  );
}

function StepDots({ count, active }: { count: number; active: number }) {
  return (
    <View className="flex-row items-center justify-center gap-2 pb-1">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 4,
            width: i === active ? 24 : 8,
            borderRadius: 2,
            backgroundColor: i <= active ? colors.jade : colors.hairline,
          }}
        />
      ))}
    </View>
  );
}

// ─── Outcome derivation ─────────────────────────────────────────────────────────

function buildOutcomes(input: {
  type: BetType;
  sideA: string;
  sideB: string;
  multiOutcomes: OutcomeDraft[];
  ouLine: string;
  ouMetric: string;
}): OutcomeDraft[] {
  switch (input.type) {
    case BET_TYPE.BINARY:
      return [
        { key: 'yes', label: 'Yes' },
        { key: 'no', label: 'No' },
      ];
    case BET_TYPE.HEAD_TO_HEAD:
      return [
        { key: 'a', label: input.sideA.trim() || 'Side A' },
        { key: 'b', label: input.sideB.trim() || 'Side B' },
      ];
    case BET_TYPE.OVER_UNDER: {
      const line = input.ouLine.trim();
      const suffix = line ? ` ${line}` : '';
      return [
        { key: 'over', label: `Over${suffix}` },
        { key: 'under', label: `Under${suffix}` },
      ];
    }
    case BET_TYPE.MULTI:
    case BET_TYPE.POOL:
    default:
      return input.multiOutcomes;
  }
}
