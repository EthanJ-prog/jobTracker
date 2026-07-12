/* finder.map.js - map initialization + markers + geocoding cache */

(function () {
  const PF = window.Pathfinder;
  const core = window.PathfinderFinderCore;
  const state = window.PathfinderFinderState;

  if (!PF || !core || !state) return;

  const MAP_PROVIDER = 'mapbox';
  const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiZXRoYW4tcmoiLCJhIjoiY21ueHVodHQ2MDRvYTJxcTJmYzV2aGsyayJ9.XU_Ydi4BdqzJGA3ad2UgWQ';
  const GEOCODE_CACHE_KEY = 'finderGeoCache';

  let jobMap = null;
  let jobMapMarkers = [];
  let mapInitialized = false;

  function getMatchScoreColor(score) {
    return core.getMatchScoreColor(score);
  }

  function escapeHtml(value) {
    return PF.escapeHtml(value);
  }

  function loadGeocodeCache() {
    try {
      return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveGeocodeCache(cache) {
    try {
      localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {}
  }

  async function geocodeJobLocation(location) {
    if (!location || !location.trim()) return null;
    const normalizedLocation = location.trim().toLowerCase();
    const cache = loadGeocodeCache();
    if (cache[normalizedLocation]) return cache[normalizedLocation];

    const params = new URLSearchParams({
      format: 'json',
      q: location,
      addressdetails: '0',
      limit: '1'
    });

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          'Accept-Language': 'en-US',
          'User-Agent': 'PathfinderJobFinder/1.0'
        }
      });

      if (!response.ok) return null;
      const results = await response.json();
      if (!Array.isArray(results) || results.length === 0) return null;

      const geo = { lat: Number(results[0].lat), lng: Number(results[0].lon) };
      if (isFinite(geo.lat) && isFinite(geo.lng)) {
        cache[normalizedLocation] = geo;
        saveGeocodeCache(cache);
        return geo;
      }
    } catch (e) {}

    return null;
  }

  function clearJobMapMarkers() {
    if (!mapInitialized || !jobMap) return;
    if (MAP_PROVIDER === 'mapbox' && window.mapboxgl) {
      jobMapMarkers.forEach(({ marker }) => marker.remove());
      jobMapMarkers = [];
    }
  }

  function initializeJobMap() {
    if (mapInitialized) return;
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    if (MAP_PROVIDER === 'mapbox') {
      if (!window.mapboxgl) {
        mapEl.innerHTML = `<div class="map-placeholder"><div><strong>Mapbox failed to load</strong><p>Check your network or script include.</p></div></div>`;
        return;
      }

      if (!MAPBOX_ACCESS_TOKEN || MAPBOX_ACCESS_TOKEN.includes('YOUR_MAPBOX_ACCESS_TOKEN_HERE')) {
        mapEl.innerHTML = `<div class="map-placeholder"><div><strong>Mapbox token required</strong><p>Set MAPBOX_ACCESS_TOKEN in finder.map.js.</p></div></div>`;
        return;
      }

      try {
        window.mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
        jobMap = new window.mapboxgl.Map({
          container: 'map',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [0, 20],
          zoom: 2
        });
        jobMap.addControl(new window.mapboxgl.NavigationControl(), 'top-right');
        mapInitialized = true;
      } catch (e) {
        console.error('Mapbox initialization failed', e);
      }
    }
  }

  function focusJobOnMap(jobId) {
    const entry = jobMapMarkers.find(item => item.jobIds.some(id => String(id) === String(jobId)));
    if (!entry || !entry.marker || !jobMap) return;

    // highlight card
    document.querySelectorAll('.job-card--active').forEach(card => card.classList.remove('job-card--active'));
    const card = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
    if (card) {
      card.classList.add('job-card--active');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const element = entry.marker.getElement();
    if (element) {
      element.style.transform = 'translate(-50%, -50%) scale(1.2)';
      element.style.zIndex = '999';
    }

    const popup = entry.marker.getPopup();
    if (popup && !popup.isOpen()) entry.marker.togglePopup();

    jobMap.flyTo({ center: entry.marker.getLngLat(), zoom: 10, speed: 0.8 });
  }

  function addJobMapMarker(jobsAtLocation, lat, lng, matchScore) {
    const firstJob = jobsAtLocation[0];
    const jobCount = jobsAtLocation.length;

    let jobListHtml = '';
    for (const job of jobsAtLocation) {
      const title = escapeHtml(job.title || 'Job');
      const company = escapeHtml(job.company || 'Unknown Company');

      const jobMatchData = matchScore[job.id];
      const hasJobMatchScore = state.hasResume && jobMatchData && typeof jobMatchData.score === 'number';
      const jobMatchColor = hasJobMatchScore ? getMatchScoreColor(jobMatchData.score) : '#4f46e5';
      const matchScoreHtml = hasJobMatchScore
        ? `<span class="map-popup-match-score" style="background: ${jobMatchColor};">${jobMatchData.score}% Match</span>`
        : '';

      jobListHtml += `
        <li class="${hasJobMatchScore ? 'map-popup-job--matched' : ''}" style="--job-match-color: ${jobMatchColor};">
          <div class="map-popup-job-header">
            <strong>${title}</strong>
            ${matchScoreHtml}
          </div>
          <span class="map-popup-company">${company}</span>
        </li>`;
    }

    const locationText = escapeHtml(firstJob.location || 'Location Not Found');
    const locationSubtitle = jobCount > 1 ? `${jobCount} jobs at this location` : 'Single job location';

    const popupHtml = `
      <div class="map-popup">
        <h4>${locationText}</h4>
        <p>${locationSubtitle}</p>
        <ul>${jobListHtml}</ul>
      </div>`;

    const matchData = matchScore[firstJob.id];
    const isClusteredLocation = jobsAtLocation.length > 1;
    const markerColor = isClusteredLocation
      ? '#4f46e5'
      : (state.hasResume && matchData && typeof matchData.score === 'number')
        ? getMatchScoreColor(matchData.score)
        : '#4f46e5';

    const markerEl = document.createElement('div');
    markerEl.className = 'custom-map-marker';
    markerEl.style.backgroundColor = markerColor;
    markerEl.title = locationText;

    if (isClusteredLocation) {
      markerEl.textContent = String(jobCount);
      markerEl.classList.add('custom-map-marker--cluster');
    }

    const marker = new window.mapboxgl.Marker(markerEl)
      .setLngLat([lng, lat])
      .setPopup(new window.mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml))
      .addTo(jobMap);

    marker.getElement().addEventListener('click', () => focusJobOnMap(firstJob.id));

    const jobIds = jobsAtLocation.map(j => j.id);
    jobMapMarkers.push({ jobIds, marker });
  }

  async function updateJobMap(jobs) {
    initializeJobMap();
    if (!mapInitialized || !jobMap || MAP_PROVIDER === 'none') return;

    clearJobMapMarkers();
    if (!Array.isArray(jobs) || jobs.length === 0) return;

    const bounds = [];
    const jobsByCoords = new Map();

    for (const job of jobs) {
      let jobLat = Number(job.latitude);
      let jobLng = Number(job.longitude);

      if (!Number.isFinite(jobLat) || !Number.isFinite(jobLng)) {
        const geo = await geocodeJobLocation(job.location || job.city || job.region);
        if (geo && isFinite(geo.lat) && isFinite(geo.lng)) {
          jobLat = geo.lat;
          jobLng = geo.lng;
        } else {
          continue;
        }
      }

      const key = jobLat + ',' + jobLng;
      if (!jobsByCoords.has(key)) {
        jobsByCoords.set(key, { lat: jobLat, lng: jobLng, jobs: [] });
        bounds.push([jobLat, jobLng]);
      }
      jobsByCoords.get(key).jobs.push(job);
    }

    for (const group of jobsByCoords.values()) {
      try {
        addJobMapMarker(group.jobs, group.lat, group.lng, state.matchScore);
      } catch (e) {
        console.error('Failed to add map marker', e);
      }
    }

    if (bounds.length > 0 && window.mapboxgl) {
      const mapboxBounds = new window.mapboxgl.LngLatBounds();
      bounds.forEach(([lat, lng]) => mapboxBounds.extend([lng, lat]));
      jobMap.fitBounds(mapboxBounds, { padding: 40, maxZoom: 11 });
    }
  }

  function resizeJobMap() {
    if (!jobMap || typeof jobMap.resize !== 'function') return;
    try {
      jobMap.resize();
    } catch (e) {}
  }

  window.PathfinderFinderMap = {
    initializeJobMap,
    updateJobMap,
    focusJobOnMap,
    resizeJobMap
  };
})();


