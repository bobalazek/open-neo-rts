# Localization

**Scope:** English first. Every string is still written so that adding a language never needs code changes.

## Where strings live

| Strings                                                                                       | Where                                                                    | Example                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Content** (unit, structure, faction, map names and descriptions; ability and research text) | English, **inline in each definition**                                   | `"name": "Dragon Tank"` in `unit.json`                        |
| **Content translations**                                                                      | `content/<pack>/locales/<lang>.json`, keyed by definition ID and field   | `"unit:eastern-collective/dragon-tank.name": "Drachenpanzer"` |
| **Interface** (menus, HUD, settings, errors, announcer subtitles)                             | `packages/client/src/locales/<lang>.json`, keyed `ui.<screen>.<element>` | `"ui.lobby.ready": "Ready"`                                   |

- Content strings sit next to the content, so adding a unit means writing its name once, in its own file.
- Interface strings belong to the client code that shows them. They're keys, never literals in components; a lint rule flags string literals in JSX.
- Mods translate their own content in their own `locales/` and can add languages. They can't override another pack's translations or the interface strings.

## Messages

- **ICU MessageFormat** for plurals and variables: `"ui.match.units-selected": "{count, plural, one {# unit} other {# units}} selected"`.
- Keys use kebab-case segments separated by dots. Values are plain text; formatting comes from the UI.
- **Fallback:** a missing translation falls back to English (the inline content text, or the English interface file). Development builds log it.

## Layout and text

- Layouts survive 30% longer strings ([screens/README.md](../design/screens/README.md#conventions-for-every-screen)).
- **Pseudo-localization** (accented, padded strings) is a development setting that catches truncation and hard-coded text.
- Numbers, durations and dates use the browser's `Intl` APIs in the client. The simulation never formats text.
- Fonts must cover every shipped language. Right-to-left languages are out of scope until someone translates into one.

## Audio

Voice lines are per language (`<name>.<event>.<lang>.ogg`), with subtitles in every language. A language without voice falls back to English voice with translated subtitles.

## Translations as pull requests

- A translation is a **translation** PR ([pull-requests.md](../contributing/pull-requests.md)) adding or updating `<lang>.json` files.
- `bun neo validate` reports coverage per language: missing keys, and keys for definitions that no longer exist.
- A language appears in settings once it covers all interface keys and 90% of content strings.
