# iOS local build (`npx expo run:ios`)

## Requirements

- Xcode 16.x (tested with Swift 6.1 toolchain)
- CocoaPods: always run `pod install` after `npx expo prebuild` (or when `ios/Podfile` / plugins change)

## `Cannot find native module 'ExponentAV'`

This means the **JavaScript bundle** is loading `expo-av`, but the **native iOS app** you launched does not include the EXAV native module (or it was accessed before the runtime was ready).

**Debug evidence:** If `expo-constants` reports `executionEnvironment: 'bare'` and the app still throws *Cannot find native module 'ExponentAV'*, the **installed binary was built without `expo-av` linked** (stale build, wrong scheme, or no `ios/` project generated yet). This repo may not commit `ios/` — you must generate it and rebuild:

```bash
npx expo prebuild --clean -p ios
cd ios && pod install && cd ..
npx expo run:ios
```

1. **Use a dev build from this repo** — run `npx expo run:ios` (or open `ios/*.xcworkspace` in Xcode and build). Do **not** rely on the **Expo Go** app from the store unless it matches your SDK; mismatched Go + project SDK often breaks native modules.
2. **Rebuild after native changes** — from the project root:
   ```bash
   cd ios && pod install && cd .. && npx expo run:ios
   ```
3. **App code** — `Recording` / `Review` screens are lazy-loaded so `expo-av` is not imported at startup (helps with `[runtime not ready]` on Hermes).

## `Permissions module not found` / `useEffect` ReferenceError in Metro

- **Permissions (`E_NO_PERMISSIONS`):** On SDK 55, `EXAV` resolves the mic permission manager from the legacy `EXModuleRegistry`. If nothing registers `EXPermissionsInterface`, `EXPermissionsMethodsDelegate` rejects with *Permissions module not found*. The `patches/expo-av+16.0.8.patch` adds `ensurePermissionsManager` and a fallback to `[EXPermissionsService new]`, and sets `permissionsManager` to **`strong`** — the upstream property was **`weak`**, so a locally created `EXPermissionsService` was **deallocated** as soon as `ensurePermissionsManager` returned, leaving `_permissionsManager == nil` on the very next line. After updating the patch, run `cd ios && pod install` and rebuild with `npx expo run:ios`.
- **`Property 'useEffect' doesn't exist` in `App`:** Usually a **stale Metro bundle**. Run `npx expo start -c`. Keep **all `import` lines at the top** of `App.tsx` (no `lazy` above imports).

## Environment

CocoaPods can fail on some locales without UTF-8:

```bash
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
cd ios && pod install && cd ..
```

## Patches

`patches/` contains `patch-package` fixes for Expo SDK 55 + Xcode 16 (Swift / removed legacy headers / SDK mismatches). They apply automatically on `npm install` via the `postinstall` script.

## Swift settings

`plugins/withIosPodsSwiftConcurrency.js` injects into the generated `Podfile`:

- `SWIFT_STRICT_CONCURRENCY=minimal` and default Swift 6 for all pods
- **Swift 5.10 language mode** for CocoaPods targets whose names start with `Expo` or `EX` (avoids strict-concurrency / MainActor issues until upstream aligns with Xcode 16.4)

After changing the plugin, run `npx expo prebuild -p ios` (or merge the snippet into `ios/Podfile` if you do not regenerate) and `pod install` again.
