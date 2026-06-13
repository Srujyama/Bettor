# Chipd — Setup & Deploy Checklist

Step-by-step to go from this repo to a running app, then to a real Firebase backend.

## 0. Prerequisites
- Node 20+ (you have 24 — fine), Xcode (iOS) / Android Studio (Android), `firebase-tools` (installed), CocoaPods.
- `npm install` at the root, and `(cd functions && npm install)`.

## 1. Run everything locally (no cloud needed)
```bash
npm run emulators       # terminal 1 — Auth/Firestore/Functions/Storage + UI :4000
npm run seed            # terminal 2 — demo users + bets
npm start               # terminal 3 — Expo; press i / a / w
```
- Default `.env` already points at the emulators (`EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1`).
- Android emulator: edit `.env` → `EXPO_PUBLIC_EMULATOR_HOST=10.0.2.2`. Physical device: your LAN IP.
- Demo Auth-emulator login: `alextan@example.com` / `chipd123` (also `miacosta`, `davekim`, `saralopes`).

## 2. Log into Firebase (when you're up)
```bash
firebase login          # or: firebase login --reauth  if your token expired
firebase projects:list
```
The emulator warns about an expired token but still runs Firestore/Functions locally. You only *need* login to deploy or to use a real project.

## 3. Create / select Firebase projects
Recommended: three projects for clean environments.
```bash
firebase projects:create chipd-dev      # (or use an existing project id)
# edit .firebaserc to map aliases:
#   { "projects": { "default": "chipd-dev", "staging": "chipd-staging", "production": "chipd-prod" } }
```
Then in each project's **Firebase Console**:
1. **Build → Authentication → Sign-in method**: enable **Email/Password**. (Phone / Google / Apple later.)
2. **Build → Firestore Database**: create it (production mode — our rules lock it down).
3. **Build → Storage**: enable it.
4. **Project settings → General → Your apps → Add app → Web**: copy the config keys.

## 4. Point the app at the real project
```bash
cp .env.example .env    # if you don't already have one
```
Fill in from the web-app config you copied:
```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=chipd-dev.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=chipd-dev
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=chipd-dev.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=0
EXPO_PUBLIC_FUNCTIONS_REGION=asia-east2
```

## 5. Deploy the backend
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```
- Cloud Functions are **gen2** in region **asia-east2** (Hong Kong — closest to Macau). First deploy enables required Google Cloud APIs; follow any prompts.
- Functions need the **Blaze (pay-as-you-go)** plan. Costs are tiny at pilot scale.

## 6. Configure App Check (before pilot, after functions work)
- Console → **App Check**. Register providers: iOS = App Attest/DeviceCheck, Android = Play Integrity, Web = reCAPTCHA Enterprise.
- Start in **monitoring** mode; verify traffic is attested; then **enforce** on Firestore, Storage, and Functions.
- For hardware-backed attestation you'll want to migrate the Firebase layer to **react-native-firebase + Expo Dev Client** (see the swap-boundary note in the README). The JS SDK's RN App Check only does reCAPTCHA.

## 7. (Later) Native builds with EAS
```bash
npm i -g eas-cli && eas login
eas build --profile development --platform ios   # Dev Client
eas build --profile preview --platform all       # internal testers
```
Add an `eas.json` with development/preview/production profiles when you start native builds.

## 8. Production launch gates (do NOT skip)
- [ ] Macau-qualified legal opinion confirming the Chips design isn't real-money gambling.
- [ ] `realMoneyEnabled` / `cashOutEnabled` are **false** in prod Remote Config / `config/*`.
- [ ] "Chips have no cash value" shown in onboarding + wallet + ToS.
- [ ] 18+ age gate verified server-side (it is — `verifyAge` CF).
- [ ] App Check enforced.
- [ ] Store listings framed as a **social prediction/challenge game** (no "gambling / win cash / casino").
- [ ] Responsible-gaming helpline number verified for Macau (placeholder in `app/settings/legal.tsx`).

---

### Troubleshooting
- **Emulator "credentials no longer valid"** → `firebase login --reauth`. Local emulators still run without it.
- **Android can't reach backend** → `EXPO_PUBLIC_EMULATOR_HOST=10.0.2.2`.
- **Metro cache weirdness** → `npx expo start -c`.
- **Functions won't deploy** → ensure Blaze plan + `cd functions && npm run build` passes (it does).
