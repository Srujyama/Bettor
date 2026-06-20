/**
 * CrashGraph — a rising multiplier curve for the crash game. The curve climbs
 * locally for feel, but the AUTHORITATIVE crash point comes from the server: when
 * the round resolves, pass `crashAt` and we lock the curve at the right outcome
 * (cashed-out in jade if the player's target was hit, crashed in coral if not).
 *
 * Flow: the screen sets a cashout target, calls the callable, then on the result
 * runs the local climb up to `crashAt` and colors it by `won`. The displayed
 * multiplier is purely cosmetic motion — the win/loss is decided server-side.
 *
 * Reduce-motion: shows the final curve + multiplier with no animated climb.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import Svg, { Path, Line, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

const HEIGHT = 220;

interface Props {
  /** Player's chosen cashout target (for the dashed marker line). */
  cashoutTarget: number;
  /** Server crash point — set after the round resolves; null while idle/running. */
  crashAt: number | null;
  /** Did the player's cashout beat the crash (server-decided)? */
  won: boolean | null;
  /** True while the round is in flight (climbing). */
  running: boolean;
}

/** Map a multiplier (1..cap) to a 0..1 vertical fraction (log-ish for headroom). */
function multToFrac(m: number): number {
  return Math.min(1, Math.log(m) / Math.log(20));
}

export function CrashGraph({ cashoutTarget, crashAt, won, running }: Props) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 32, 360);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [shownMult, setShownMult] = useState(1);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Animated progress 0..1 of the climb toward crashAt.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (running) {
      progress.value = 0;
      setShownMult(1);
      if (!reduceMotion) {
        // Climb slowly; the screen pins the real outcome when the result lands.
        progress.value = withTiming(0.85, { duration: 4000, easing: Easing.in(Easing.quad) });
      }
    }
  }, [running, reduceMotion, progress]);

  useEffect(() => {
    if (running || crashAt == null) return;
    const target = crashAt;
    if (reduceMotion) {
      progress.value = 1;
      setShownMult(target);
      return;
    }
    progress.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done) runOnJS(setShownMult)(target);
    });
    // Tick the displayed number up to the crash point.
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 700);
      setShownMult(1 + (target - 1) * (1 - Math.pow(1 - t, 3)));
      if (t >= 1) clearInterval(id);
    }, 24);
    return () => clearInterval(id);
  }, [running, crashAt, reduceMotion, progress]);

  const curveColor = crashAt == null ? colors.gold : won ? colors.jade : colors.coral;

  // Build the curve path from progress (sampled in JS for the SVG path string).
  const pathStyle = useAnimatedStyle(() => ({ opacity: 1 }));

  // Static-ish path: an exponential-looking curve scaled by current shownMult.
  const frac = multToFrac(shownMult);
  const points: string[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const tx = i / steps;
    const ty = Math.pow(tx, 2.2) * frac; // accelerating rise
    const px = tx * w;
    const py = HEIGHT - ty * HEIGHT;
    points.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  const d = points.join(' ');

  const targetFrac = multToFrac(cashoutTarget);
  const targetY = HEIGHT - targetFrac * HEIGHT;

  return (
    <View className="gap-2">
      <View
        className="overflow-hidden rounded-card border border-hairline bg-surface-sunken"
        style={{ width: w, height: HEIGHT, alignSelf: 'center' }}
      >
        <Animated.View style={pathStyle}>
          <Svg width={w} height={HEIGHT}>
            <Defs>
              <SvgGradient id="crashfill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={curveColor} stopOpacity={0.28} />
                <Stop offset="1" stopColor={curveColor} stopOpacity={0} />
              </SvgGradient>
            </Defs>
            {/* Cashout target marker */}
            <Line
              x1={0}
              y1={targetY}
              x2={w}
              y2={targetY}
              stroke={colors.textFaint}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {/* Fill under the curve */}
            <Path d={`${d} L ${w} ${HEIGHT} L 0 ${HEIGHT} Z`} fill="url(#crashfill)" />
            {/* The curve */}
            <Path d={d} stroke={curveColor} strokeWidth={3} fill="none" />
          </Svg>
        </Animated.View>

        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' }}
        >
          <Txt variant="display" style={{ color: curveColor }}>
            {shownMult.toFixed(2)}×
          </Txt>
          {crashAt != null ? (
            <Txt variant="label" style={{ color: curveColor }}>
              {won ? `Cashed out at ${cashoutTarget.toFixed(2)}×` : `Crashed at ${crashAt.toFixed(2)}×`}
            </Txt>
          ) : null}
        </View>
      </View>
      <Txt variant="caption" muted className="text-center">
        Target {cashoutTarget.toFixed(2)}× · cash out before the crash
      </Txt>
    </View>
  );
}
