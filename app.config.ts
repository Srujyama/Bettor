import { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Chipd — social P2P betting app for Macau expats (virtual Chips pilot).
 *
 * APP_VARIANT selects bundle id / scheme suffix / Firebase project so we can run
 * dev / staging / prod side by side. Firebase web config is supplied via
 * EXPO_PUBLIC_FIREBASE_* env vars (see .env.example) and read at runtime in
 * src/lib/firebase. Nothing secret lives in the bundle.
 */

const VARIANT = (process.env.APP_VARIANT ?? 'development') as
  | 'development'
  | 'staging'
  | 'production';

const VARIANT_CONFIG = {
  development: {
    name: 'Chipd (Dev)',
    bundleId: 'com.chipd.app.dev',
    scheme: 'chipd-dev',
  },
  staging: {
    name: 'Chipd (Staging)',
    bundleId: 'com.chipd.app.staging',
    scheme: 'chipd-staging',
  },
  production: {
    name: 'Chipd',
    bundleId: 'com.chipd.app',
    scheme: 'chipd',
  },
}[VARIANT];

// `newArchEnabled` is a valid SDK 56 root key consumed by prebuild/CNG, but the
// ExpoConfig type lags behind — widen the return type to accept it.
export default ({ config }: ConfigContext): ExpoConfig & { newArchEnabled?: boolean } => ({
  ...config,
  name: VARIANT_CONFIG.name,
  slug: 'chipd',
  scheme: VARIANT_CONFIG.scheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: VARIANT_CONFIG.bundleId,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'Chipd uses your camera to add photos to bets and submit proof when resolving an outcome.',
      NSPhotoLibraryUsageDescription:
        'Chipd lets you attach images from your library to bets and your profile.',
      NSFaceIDUsageDescription:
        'Chipd can ask for Face ID before you place a stake, as a responsible-play safeguard.',
    },
  },
  android: {
    package: VARIANT_CONFIG.bundleId,
    adaptiveIcon: {
      backgroundColor: '#0A0B0F',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['USE_BIOMETRIC', 'USE_FINGERPRINT'],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0A0B0F',
      },
    ],
    'expo-secure-store',
    'expo-localization',
    [
      'expo-image-picker',
      {
        photosPermission:
          'Chipd needs photo access so you can attach images to bets and your profile.',
        cameraPermission:
          'Chipd needs camera access so you can add photos to bets and proof.',
      },
    ],
    [
      'expo-local-authentication',
      { faceIDPermission: 'Chipd can use Face ID as a responsible-play safeguard before staking.' },
    ],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4' },
        android: { compileSdkVersion: 35, targetSdkVersion: 35 },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    variant: VARIANT,
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '' },
  },
});
