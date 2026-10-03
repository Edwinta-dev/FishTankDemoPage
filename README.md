# Pond sitrep

Single-page, read-only front end for the Supabase RPC `public.get_bundled_dashboard_payload(p_user_id bigint) -> jsonb`.

HTML, a compiled Tailwind CSS file and plain JavaScript. No framework, no runtime dependencies.

## Run

```bash
npm install
npm run build      # compiles src/input.css -> styles.css (commit the result)
npm start          # http://localhost:8080
```

`styles.css` is committed, so any static host can serve the repo root with no build step.
If you change classes in `index.html` or `app.js`, run `npm run build` and commit `styles.css` before pushing.
Add `?demo=1` to the URL to preview the layout with generated data (clearly labelled on the page).

## Configure

Everything lives in `CONFIG` at the top of `app.js`: Supabase URL, publishable key, user id,
refresh interval (60 s), the experiment start time that the chart filters from (`historyStart`) and the target ranges for water temperature (20–28 °C) and pH (7.0–8.5).
The target ranges are placeholders. Set them for your species.

## Design

- Palette: pond green, lichen grey, ink, koi saffron. Brick red only when a reading is out of range.
- One typeface (Schibsted Grotesk, self-hosted), sentence case throughout.
- One bold block (the hero). Everything else is type, spacing and thin rules. No cards, badges or gradients.
- The hero answers "is the pond OK?" with a pond-vs-air-vs-target scale instead of a tile of numbers.
- Motion: the markers settle once on load. Reduced-motion is respected.

## Deploy

| Host | How | Notes |
|---|---|---|
| GitHub Pages | Settings > Pages > Source: Deploy from a branch > `main` / `(root)`. | No build step, since `styles.css` is committed. Free, simplest. |
| Cloudflare Pages | Connect repo, build command `npm run build`, output `/`. | Fast CDN, free, custom headers via `_headers`. |
| Netlify | Connect repo. `netlify.toml` is included. | Includes a CSP that only allows this Supabase project. |
| Vercel | Import repo, framework "Other", output `.`. | Works, no config needed. |

## Before sharing the URL publicly

The publishable key is safe in the browser, but the RPC takes `p_user_id` from the caller.
Anyone who can open the page can call it with any id. Before going public:

1. Enable RLS on the underlying tables and make the RPC `SECURITY INVOKER`, or hard-code the allowed user inside the function.
2. Test with another `p_user_id` and confirm it returns nothing.
3. Consider returning `null` (not a default) for missing sensor values so gaps are not charted as readings.
