// Pathfinder Job Finder entry point
// Kept intentionally small. All logic lives in finder/* modules.

(function () {
  if (!window.PathfinderFinder || typeof window.PathfinderFinder.init !== 'function') {
    console.error('PathfinderFinder.init not found. Ensure finder modules are loaded before finder.js');
    return;
  }

  window.PathfinderFinder.init();
})();

