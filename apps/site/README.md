# @obey/site

The public site at fealty.me: the homepage, `/privacy` and `/terms`. Plain HTML and CSS in `public/`, with no build
step and no scripts. `pnpm --filter @obey/site serve` serves it on `$PORT` (sirv maps `/privacy` to `privacy.html`).
On Railway the start command skips pnpm to save memory, with healthcheck `/`:
`node apps/site/node_modules/sirv-cli/bin.js apps/site/public --host 0.0.0.0` (sirv-cli reads `PORT`).

The header and footer are repeated in each page, so change all three together. The mark in `public/mark.svg` is the
Links mark from `brand/`, drawn in `currentColor`. When what the app collects or who it shares data with changes,
update `privacy.html` and its date before the change ships.

Icons: `icon.svg` is the source. `favicon.ico` (16/32/48), `icon-192.png` and `apple-touch-icon.png` (180, square, no
transparency) are drawn from it, and `apps/web/public` carries the same set. Google search shows the homepage favicon,
so if the icon changes, redraw all of them in both folders. sirv sends `favicon.ico` without a content type, which is
why the pages link the SVG and PNG instead and the `.ico` is only there for clients that ask for `/favicon.ico`.
