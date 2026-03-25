# EAS iOS builds & TestFlight

## What we fixed in the repo

- **`patches/expo-modules-core+55.0.17.patch`** – Swift 6 / MainActor fixes for `SwiftUIVirtualView` (same as EAS “Fastlane/Gym” compile step).
- **`plugins/withIosPodsSwiftConcurrency.js`** – In `post_install`, sets **`SWIFT_VERSION = 5.10`** and **`SWIFT_STRICT_CONCURRENCY = minimal`** for **every** CocoaPods target. RN 0.83 pods (e.g. `RCTSwiftUI`, `RNScreens`) left on Swift 6.0 can fail EAS with *“sending 'self' risks causing data races”* on Xcode 16.4.
- **`eas.json`** – `EAS_BUILD_DISABLE_EXPO_DOCTOR_STEP=1` on all profiles so **`expo doctor` does not fail the build** when you intentionally use the **Xcode 16.4** image (Expo Doctor otherwise insists on Xcode ≥ 26 for SDK 55).
- **`package.json`** – removed direct **`expo-modules-core`** dependency (still installed transitively; **`patch-package` still applies**). Added **`expo.doctor.reactNativeDirectoryCheck.exclude`** for `expo-av`.

## iOS build number (no manual bump)

**`eas.json`** uses **`cli.appVersionSource`: `"remote"`** and **`build.production.autoIncrement`: `true`**. EAS stores **`ios.buildNumber`** on Expo’s servers and **increments it on each production build** — you don’t edit `app.json` for every TestFlight upload.

**One-time:** If the counter on Expo doesn’t match App Store Connect yet, sync the last shipped build number:

```bash
eas build:version:set --platform ios
```

Choose **remote** when asked, then enter the **current** `CFBundleVersion` from App Store Connect so the next build increments from there.

## Cloud build + auto-submit (recommended)

EAS does **not** support `--auto-submit` with **`--local`**. For one command:

```bash
eas build --platform ios --profile production --auto-submit
```

(Run on your machine; requires Apple / ASC credentials configured in EAS.)

### Non-interactive submit (`--non-interactive`)

EAS needs **`ascAppId`** (your app’s numeric **Apple ID** in App Store Connect). It’s set in **`eas.json` → `submit.production.ios.ascAppId`**.

1. Open [App Store Connect](https://appstoreconnect.apple.com/) → **Apps** → your app → **App Information** (under *General*).
2. Under **General Information**, copy **Apple ID** (digits only, e.g. `6738123456`).
3. Paste that value into `eas.json` (replace `YOUR_APP_STORE_CONNECT_APP_ID`).

Then:

```bash
eas submit --platform ios --latest --non-interactive
```

If you don’t want to store the ID in the repo, run submit **once without** `--non-interactive` and pick the app from the list; EAS can remember the association for your account.

## Local build (`eas build --local`)

Useful to reproduce the Xcode archive on your Mac:

```bash
npm run eas:ios:local
```

If the **distribution certificate** step fails with *“hasn't been imported successfully”*, run the same command in **Terminal.app** on your Mac (not in a restricted/CI sandbox). Ensure the cert password stored in EAS for that certificate is correct (`eas credentials`).

After a successful local build, submit the produced `.ipa` separately:

```bash
npm run eas:ios:submit-latest
# or: eas submit --platform ios --path /path/to/your.ipa
```

## `expo doctor` locally

You may still see **one** failure: *Expo SDK 55 vs Xcode 16.4* — expected while you pin the 16.4 image. CI/EAS builds skip the doctor **step** via `eas.json`; locally you can ignore that warning or upgrade Xcode when you move off the pinned image.
