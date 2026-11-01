# Localization

**Scope:** English only at first, but every string goes through the locale system from day one, so adding languages never needs code changes.

## Strings

- **No hard-coded UI text.** Every visible string is a key in a locale file. The content validator flags missing keys; a lint rule flags string literals in JSX.
- **Locale files** are JSON, one per language per pack: `content/packs/<pack>/locales/<lang>.json` for content (unit names, descriptions, dialogue) and `apps/web/src/locales/<lang>.json` for UI.
- **Format:** ICU MessageFormat for plurals, gender and variables (`"{count, plural, one {# unit} other {# units}}"`).
- **Fallback:** missing keys fall back to English, and are logged in development builds.

## Layout and text

- Layouts survive 30% longer strings ([screens/README.md](../design/screens/README.md#conventions-for-every-screen)).
- **Pseudo-localization** (accented, padded strings) is a dev setting that catches truncation and hard-coded text.
- Numbers, durations and dates use the browser's `Intl` APIs for the active language.
- Fonts must cover every shipped language's glyphs; CJK and Cyrillic need checking before those languages ship.
- **Right-to-left** languages are out of scope until someone wants to translate into one; layouts avoid assuming left-to-right where it's free to do so.

## Audio and video

- Voice lines are per language, with subtitles in every language. Missing voice for a language falls back to English voice with localized subtitles.
- Text in textures is avoided; signs and labels in the 3D world use icons or rendered text.

## Contributing translations

- Translations are ordinary PRs to the locale files, or later through a translation platform that syncs to the repo.
- A translation coverage report (per language, per pack) runs in CI.
- A language ships in the settings menu once it reaches 100% of UI strings and 90% of content strings.

## Mods

Mods ship their own locale files and can add languages for their content. They can't override base-game UI strings.
