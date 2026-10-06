# Frame fonts

Fonts bundled for the generated default event frame (`lib/frame/fonts.ts`, camera#235). They are read from disk by the
server renderer (`@napi-rs/canvas`); they are never sent to a browser.

| File | Font | Licence |
|---|---|---|
| `Inter.ttf` | Inter (variable, weight axis) | SIL OFL 1.1, `licenses/Inter-OFL.txt`; also the fallback for every other font |
| `Roboto.ttf` | Roboto (variable) | SIL OFL 1.1, `licenses/Roboto-OFL.txt` |
| `Poppins-Bold.ttf` | Poppins Bold | SIL OFL 1.1, `licenses/Poppins-OFL.txt` |
| `Montserrat.ttf` | Montserrat (variable) | SIL OFL 1.1, `licenses/Montserrat-OFL.txt` |
| `NotoColorEmoji.woff2` | Noto Color Emoji (COLRv1), loaded only when a text contains an emoji | SIL OFL 1.1, `licenses/NotoColorEmoji-OFL.txt` |

Sources: the `google/fonts` repository (`ofl/inter`, `ofl/roboto`, `ofl/poppins`, `ofl/montserrat`,
`ofl/notocoloremoji`), fetched 2026-10-06. The OFL requires the licence text to travel with the fonts; keep `licenses/`.

`NotoColorEmoji.woff2` is `NotoColorEmoji-Regular.ttf` (25 MB) converted with fontTools
(`TTFont(path); font.flavor = 'woff2'; font.save(...)`, needs `brotli`) to 5.5 MB; it registers and draws in colour.

These are the fonts messmass offers by name (`inter`, `roboto`, `poppins`, `montserrat`). A custom partner font (for
example AS Roma) is **not** stored here: it is fetched from messmass at render time and kept in memory only, because
it is the partner's property. To add a bundled font, add the file and its licence here, add it to `BUNDLED` in
`lib/frame/fonts.ts`, and bump `FRAME_RENDER_VERSION` in `lib/frame/render.ts` if existing images should be redrawn.
