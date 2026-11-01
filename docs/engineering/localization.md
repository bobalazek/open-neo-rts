# Localization

**Scope:** English only at first, but every string goes through the locale system from day one, so adding languages never needs code changes.

## One rule: every string lives in a pack

There is one string system for the base game and mods alike:

```text
content/packs/
├── core/locales/
│   ├── en.json               UI strings (ui.*) plus core content (resources, test faction…)
│   └── de.json               a translation: same keys, translated values
└── dev/locales/
    └── en.json               test faction names (developer pack)
```

- **UI strings** (menus, HUD, settings, errors) live in `core`, under `ui.<screen>.<element>` keys. The client ships no strings of its own.
- **Content strings** live in the pack that defines the content, under `<kind>.<name>.<field>` keys ([conventions.md](../contributing/conventions.md)).
- **Mods** add keys for their own content and can add languages. They can't override `ui.*` keys or another pack's keys; the loader rejects it.
- The loader (`packages/content/src/locales`) merges packs in dependency order into one table per language.

## Keys and messages

| Key pattern                           | Used for                          | Example                                       |
| ------------------------------------- | --------------------------------- | --------------------------------------------- |
| `ui.<screen>.<element>`               | Screen text                       | `ui.lobby.ready`, `ui.match.population-limit` |
| `ui.error.<code>`                     | Error and rejection messages      | `ui.error.rate-limited`                       |
| `<kind>.<name>.name` / `.description` | Content names and descriptions    | `unit.tank.name`                              |
| `dialogue.<mission>.<line>`           | Campaign dialogue and subtitles   | `dialogue.afn-04.vale-bridge`                 |
| `hint.<id>`                           | Contextual hints and loading tips | `hint.low-power`                              |

- Messages use **ICU MessageFormat** for plurals and variables: `"ui.match.units-selected": "{count, plural, one {# unit} other {# units}} selected"`.
- Keys are kebab-case segments separated by dots. Values are plain text; formatting (bold, colour) comes from the UI, not the string.
- **Fallback:** a missing key falls back to English. In development builds it also logs; in CI, `bun neo validate-content` (planned) fails on missing English keys and reports coverage for other languages.

## Layout and text

- Layouts survive 30% longer strings ([screens/README.md](../design/screens/README.md#conventions-for-every-screen)).
- **Pseudo-localization** (accented, padded strings) is a dev setting that catches truncation and hard-coded text. A lint rule flags string literals in JSX.
- Numbers, durations and dates use the browser's `Intl` APIs in the client. The sim never formats text.
- Fonts must cover every shipped language's glyphs. Right-to-left languages are out of scope until someone wants to translate into one.

## Audio and video

- Voice lines are per language (`<name>.<event>.<lang>.ogg`), with subtitles in every language. Missing voice for a language falls back to English voice with localized subtitles.
- Text in textures is avoided; signs and labels in the 3D world use icons or rendered text.

## Contributing translations

- A translation is a `locales/<lang>.json` file per pack, added by PR.
- CI reports coverage per language and pack. A language appears in settings once it covers 100% of `ui.*` keys and 90% of content keys.
