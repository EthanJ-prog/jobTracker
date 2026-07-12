# TODO

- [ ] Fix Mapbox map not filling full map section when switching to Job Map tab.
  - [ ] Update finder/finder.init.js to trigger Mapbox `resize()` after tab becomes visible.
  - [ ] Expose a resize method from finder/finder.map.js (or call resize on map instance).
  - [ ] Add window resize listener to keep map height correct.
  - [ ] Smoke test: switch between tabs repeatedly and ensure map fills section.

