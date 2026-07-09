# jobTracker Refactor Plan

## Step 1 — Repo understanding (JS only)
- [x] Read `finder/finder.js`, `home/home.js`, `auth/signup.js`, `shared/pathfinder.js`, `shared/theme.js`, `tracker/tracker.js`.
- [x] Read `finder/finder.html` to confirm script loading.

## Step 2 — Refactor `finder/finder.js` into split modules
- [x] Create new JS modules under `finder/` (core/cards/map/resume/overlay/profile as needed).
- [x] Replace `finder/finder.js` with a thin entry/loader that wires modules (or expose globals).



## Step 3 — Update `finder/finder.html`
- [x] Add `<script>` tags for new `finder/*` modules (order-safe).


## Step 4 — Refactor `home/home.js`
- [x] Shortened/cleaned `tracker/tracker.js` and started `home/home.js` cleanup.


## Step 5 — Refactor `tracker/tracker.js` and `auth/signup.js`
- [x] Remove unused code and dedupe where safe (initial cleanup + fix malformed concatenation).


## Step 6 — Safety verification
- [x] Quick static checks: confirm all referenced functions/IDs still exist (node --check for updated JS files).
- [ ] Manual runtime sanity: load pages and test main flows.


