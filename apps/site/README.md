# @obey/site

The public site at fealty.me: the homepage, `/privacy` and `/terms`. Plain HTML and CSS in `public/`, with no build
step and no scripts. `pnpm --filter @obey/site serve` serves it on `$PORT` (sirv maps `/privacy` to `privacy.html`).

The header and footer are repeated in each page, so change all three together. The mark in `public/mark.svg` is the
Links mark from `brand/`, drawn in `currentColor`. When what the app collects or who it shares data with changes,
update `privacy.html` and its date before the change ships.
