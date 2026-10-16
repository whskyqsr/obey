# Obey for Android

Kotlin, Jetpack Compose and Material 3. Package `app.obey`, minSdk 26, target/compile SDK 35.

## Run it

Requirements: Android Studio (Ladybug or newer) or the Android SDK command-line tools, and JDK 17.

```sh
cd apps/android
./gradlew assembleDebug          # build
./gradlew installDebug           # install on a running emulator/device
./gradlew lint test              # lint + JVM unit tests
```

Or open `apps/android` in Android Studio and press Run.

### Talking to the API

| Build | Base URL | Notes |
| --- | --- | --- |
| debug | `http://10.0.2.2:3000/` | `10.0.2.2` is your computer as seen from the emulator. Cleartext HTTP is allowed in debug only. |
| release | `https://api.obey.app/` | Placeholder until the real domain exists. |

Both live in `app/build.gradle.kts` as `BuildConfig.API_BASE_URL`. On a physical phone, either change the debug
URL to your machine's LAN IP or run `adb reverse tcp:3000 tcp:3000` and use `http://localhost:3000/`.

### Signing in without Firebase (dev auth)

Until the Firebase project exists, use dev auth:

1. Start the API with `DEV_AUTH=1`.
2. In the app (debug builds only), enter a user UUID under **Developer sign-in** on the first screen, or later in
   **Settings → Developer**. The app then sends `X-Dev-User: <uuid>` instead of a Firebase token.
3. Use a second emulator (or clear the field and enter another UUID) to act as the partner.

Release builds ignore the dev user id entirely.

With Firebase configured, every request carries `Authorization: Bearer <Firebase ID token>`.

## Firebase setup (Jake)

The build works without Firebase. The Google Services Gradle plugin is applied **only if
`app/google-services.json` exists**, and that file is git-ignored.

1. In the [Firebase console](https://console.firebase.google.com/), create (or open) the `obey` project.
2. **Authentication → Sign-in method:** enable **Google** and **Email/Password**. (The app has email + password
   sign-in and Google sign-in via Credential Manager. Email-link sign-in from the plan isn't wired up yet.)
3. **Project settings → Your apps → Add app → Android**, package name `app.obey`.
4. Add the SHA-1 and SHA-256 fingerprints (needed for Google sign-in):
   ```sh
   # debug key (created by Android Studio / Gradle on first build)
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```
   Add the release/upload key's fingerprints too once a release keystore exists (and Play App Signing's key from the
   Play Console later).
5. Download `google-services.json` and put it at `apps/android/app/google-services.json`. Don't commit it.
6. Rebuild. `BuildConfig.FIREBASE_CONFIGURED` becomes `true`, the sign-in screen offers Google and email sign-in,
   and push notifications start working.

For CI builds with Firebase, store the JSON as a GitHub secret and write it to `app/google-services.json` in a
workflow step before `./gradlew`. CI currently builds without it.

### Push notifications

`push/ObeyMessagingService.kt` receives FCM messages and, on token refresh, calls `POST /devices
{token, platform: "android"}`. The app also registers the current token after each Firebase sign-in. Notification
text comes from the server and is shown with private lock-screen visibility.

## Layout

```
app/src/main/java/app/obey/
  api/          Models.kt (hand-mirrored from packages/contracts), ObeyApi.kt (Retrofit), auth header interceptor
  auth/         Firebase Auth wrapper + dev-auth precedence
  data/         DataStore settings, session (me + selected relationship)
  di/           Hilt network module (OkHttp, Retrofit, kotlinx.serialization)
  push/         FCM service and device registration
  recurrence/   Recurrence picker model + Kotlin port of `describe` from packages/recurrence
  markdown/     Pure Markdown editing helpers (toolbar actions, list continuation) and a small parser
  ui/           Compose screens: today, upcoming, tasks, rewards, rules, notes, settings, onboarding
```

`recurrence/` and `markdown/` have no Android dependencies and are covered by `app/src/test`.

### Keeping models in sync

`api/Models.kt` mirrors `packages/contracts/src/index.ts` by hand. Fields that are `.optional()` in zod are
annotated `@EncodeDefault(NEVER)` so a Kotlin `null` is omitted rather than sent as `null` (zod rejects `null` for
optional fields); `.nullable()` fields are sent as explicit `null`.

## Notes editor

Notes are stored as Markdown. The editor is a plain-text Markdown field with a formatting toolbar (bold, italic,
strikethrough, heading levels, bullets, numbered list, checklist, quote, code), Enter continues lists and checklists
(Enter on an empty item ends the list), and a preview toggle renders the note. Checklist items can be ticked in the
preview and directly from the notes list.
