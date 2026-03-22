# EAS iOS builds & TestFlight

## What we fixed in the repo

- **`patches/expo-modules-core+55.0.17.patch`** – Swift 6 / MainActor fixes for `SwiftUIVirtualView` (same as EAS “Fastlane/Gym” compile step).
- **`eas.json`** – `EAS_BUILD_DISABLE_EXPO_DOCTOR_STEP=1` on all profiles so **`expo doctor` does not fail the build** when you intentionally use the **Xcode 16.4** image (Expo Doctor otherwise insists on Xcode ≥ 26 for SDK 55).
- **`package.json`** – removed direct **`expo-modules-core`** dependency (still installed transitively; **`patch-package` still applies**). Added **`expo.doctor.reactNativeDirectoryCheck.exclude`** for `expo-av`.

## Cloud build + auto-submit (recommended)

EAS does **not** support `--auto-submit` with **`--local`**. For one command:

```bash
eas build --platform ios --profile production --auto-submit
```

(Run on your machine; requires Apple / ASC credentials configured in EAS.)

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
