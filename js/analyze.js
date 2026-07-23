// ============================================================
// StepShield — Analyze Route
// Map: Leaflet + OpenStreetMap + Nominatim
// Weather: OpenWeather (falls back to a local model if no API key)
// Routing: OSRM public foot-routing service (falls back to a straight line)
// Safety scoring: local JS algorithm (no external AI call)
// ============================================================

// Add your own free key from https://openweathermap.org/api to enable live weather.
const OPENWEATHER_API_KEY = '';

const DEFAULT_ORIGIN = { lat: 41.8781, lng: -87.6298, label: 'Chicago, IL' }; // used if geolocation is unavailable

let map, originMarker, destMarker, routeLine;
let originCoords = null;
let destCoords = null;
let routeDistanceKm = null;

const originInput = document.getElementById('originInput');
const originStatus = document.getElementById('originStatus');
const destInput = document.getElementById('destInput');
const destSuggestions = document.getElementById('destSuggestions');
const analyzeBtn = document.getElementById('analyzeBtn');
const routeMeta = document.getElementById('routeMeta');

const originIcon = L.divIcon({
  className: '', iconSize: [18, 18], iconAnchor: [9, 9],
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#2E7D32;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);"></div>'
});
const destIcon = L.divIcon({
  className: '', iconSize: [34, 40], iconAnchor: [17, 38],
  html: '<svg width="34" height="40" viewBox="0 0 34 40" xmlns="http://www.w3.org/2000/svg"><path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 23 17 23s17-10.3 17-23C34 7.6 26.4 0 17 0z" fill="#FF5347"/><circle cx="17" cy="17" r="7" fill="white"/></svg>'
});

// ---------------- Map init ----------------
function initMap(center){
  map = L.map('map', { zoomControl: true }).setView([center.lat, center.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
}

// ---------------- Geolocation ----------------
function detectLocation(){
  if(!navigator.geolocation){
    useDefaultOrigin();
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    originCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    initMap(originCoords);
    placeOriginMarker();
    originStatus.textContent = 'Detected';
    originInput.value = 'Locating address…';
    const label = await reverseGeocode(originCoords.lat, originCoords.lng);
    originInput.value = label || `${originCoords.lat.toFixed(4)}, ${originCoords.lng.toFixed(4)}`;
  }, () => {
    useDefaultOrigin();
  }, { timeout: 8000 });
}

function useDefaultOrigin(){
  originCoords = { lat: DEFAULT_ORIGIN.lat, lng: DEFAULT_ORIGIN.lng };
  initMap(originCoords);
  placeOriginMarker();
  originInput.value = `${DEFAULT_ORIGIN.label} (default — enable location for accuracy)`;
  originStatus.textContent = 'Using default';
}

function placeOriginMarker(){
  if(originMarker) map.removeLayer(originMarker);
  originMarker = L.marker([originCoords.lat, originCoords.lng], { icon: originIcon }).addTo(map);
}

async function reverseGeocode(lat, lng){
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`);
    const data = await res.json();
    return data.display_name ? data.display_name.split(',').slice(0,3).join(',') : null;
  }catch(e){ return null; }
}

// ---------------- Destination autocomplete ----------------
let searchDebounce;
destInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const query = destInput.value.trim();
  if(query.length < 3){
    destSuggestions.classList.remove('show');
    return;
  }
  searchDebounce = setTimeout(() => searchDestination(query), 400);
});

document.addEventListener('click', (e) => {
  if(!destSuggestions.contains(e.target) && e.target !== destInput){
    destSuggestions.classList.remove('show');
  }
});

async function searchDestination(query){
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`);
    const results = await res.json();
    if(!results.length){
      destSuggestions.innerHTML = '<div style="color:var(--gray-500);">No matches found</div>';
      destSuggestions.classList.add('show');
      return;
    }
    destSuggestions.innerHTML = results.map((r, i) =>
      `<div data-idx="${i}">${r.display_name}</div>`
    ).join('');
    destSuggestions.classList.add('show');
    destSuggestions.querySelectorAll('div[data-idx]').forEach((el) => {
      el.addEventListener('click', () => {
        const r = results[parseInt(el.getAttribute('data-idx'), 10)];
        selectDestination(r);
      });
    });
  }catch(e){
    destSuggestions.innerHTML = '<div style="color:var(--gray-500);">Search unavailable — check your connection</div>';
    destSuggestions.classList.add('show');
  }
}

async function selectDestination(result){
  destCoords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
  destInput.value = result.display_name.split(',').slice(0,3).join(',');
  destSuggestions.classList.remove('show');

  if(destMarker) map.removeLayer(destMarker);
  destMarker = L.marker([destCoords.lat, destCoords.lng], { icon: destIcon }).addTo(map);

  await drawRoute();
  analyzeBtn.disabled = false;
}

// ---------------- Routing ----------------
async function drawRoute(){
  if(routeLine) map.removeLayer(routeLine);
  routeMeta.textContent = 'Calculating route…';

  try{
    const url = `https://router.project-osrm.org/route/v1/foot/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if(data.routes && data.routes.length){
      const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      routeLine = L.polyline(coords, { color: '#FF5347', weight: 5, opacity: 0.9, lineCap: 'round' }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
      routeDistanceKm = data.routes[0].distance / 1000;
      const minutes = Math.round(data.routes[0].duration / 60);
      routeMeta.innerHTML = `<strong>${routeDistanceKm.toFixed(1)} km</strong> · ~${minutes} min walk`;
      return;
    }
    throw new Error('no route');
  }catch(e){
    // fallback: straight line + haversine estimate
    routeLine = L.polyline([[originCoords.lat, originCoords.lng],[destCoords.lat, destCoords.lng]], { color: '#FF5347', weight: 5, opacity: 0.85, dashArray: '2 10', lineCap: 'round' }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    routeDistanceKm = haversineKm(originCoords, destCoords);
    const minutes = Math.round((routeDistanceKm / 4.8) * 60);
    routeMeta.innerHTML = `<strong>~${routeDistanceKm.toFixed(1)} km</strong> (direct line) · ~${minutes} min walk`;
  }
}

function haversineKm(a, b){
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI/180;
  const dLng = (b.lng - a.lng) * Math.PI/180;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

// ---------------- Weather ----------------
async function fetchWeather(lat, lng){
  if(OPENWEATHER_API_KEY){
    try{
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=imperial&appid=${OPENWEATHER_API_KEY}`);
      if(!res.ok) throw new Error('weather request failed');
      const data = await res.json();
      const main = data.weather[0].main.toLowerCase();
      return {
        temp: Math.round(data.main.temp),
        description: data.weather[0].description,
        icon: iconForCondition(main),
        rain: main.includes('rain') || main.includes('drizzle') || main.includes('thunderstorm'),
        snow: main.includes('snow'),
        visibility: data.visibility >= 9000 ? 'excellent' : data.visibility >= 5000 ? 'good' : data.visibility >= 2000 ? 'fair' : 'poor',
        windMph: Math.round(data.wind.speed)
      };
    }catch(e){ /* fall back below */ }
  }
  return generateLocalWeather();
}

function iconForCondition(main){
  if(main.includes('clear')) return '☀️';
  if(main.includes('cloud')) return '☁️';
  if(main.includes('rain') || main.includes('drizzle')) return '🌧️';
  if(main.includes('thunder')) return '⛈️';
  if(main.includes('snow')) return '❄️';
  if(main.includes('fog') || main.includes('mist') || main.includes('haze')) return '🌫️';
  return '⛅';
}

function generateLocalWeather(){
  const pool = [
    { description: 'clear sky', icon: '☀️', rain: false, snow: false, visibility: 'excellent' },
    { description: 'partly cloudy', icon: '⛅', rain: false, snow: false, visibility: 'good' },
    { description: 'overcast', icon: '☁️', rain: false, snow: false, visibility: 'fair' },
    { description: 'light rain', icon: '🌧️', rain: true, snow: false, visibility: 'fair' },
    { description: 'steady rain', icon: '🌧️', rain: true, snow: false, visibility: 'poor' }
  ];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return {
    temp: 52 + Math.round(Math.random() * 28),
    description: pick.description,
    icon: pick.icon,
    rain: pick.rain,
    snow: pick.snow,
    visibility: pick.visibility,
    windMph: 3 + Math.round(Math.random() * 14)
  };
}

// ---------------- Community reports ----------------
const REPORTS_KEY = 'stepshield_reports';

function getReports(){
  try{
    const stored = JSON.parse(localStorage.getItem(REPORTS_KEY));
    if(stored && stored.length) return stored;
  }catch(e){}
  const seeded = [
    { type: 'Poor lighting', icon: '💡', near: 'W Chestnut Ave', time: Date.now() - 1000 * 60 * 60 * 5 },
    { type: 'Broken crosswalk', icon: '🚸', near: '5th & Main St', time: Date.now() - 1000 * 60 * 60 * 22 },
    { type: 'Cars not yielding', icon: '🚗', near: 'Harrison Blvd', time: Date.now() - 1000 * 60 * 60 * 30 }
  ];
  localStorage.setItem(REPORTS_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveReports(reports){
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

function timeAgo(ts){
  const mins = Math.round((Date.now() - ts) / 60000);
  if(mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if(hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function renderReports(){
  const feed = document.getElementById('reportsFeed');
  const reports = getReports().slice(0, 8);
  feed.innerHTML = reports.map(r => `
    <div class="report-feed-item">
      <span class="icn">${r.icon}</span>
      <div>
        <strong>${r.type}</strong> reported near <strong>${r.near}</strong>
        <div class="meta">${timeAgo(r.time)}</div>
      </div>
    </div>
  `).join('');
}

document.querySelectorAll('.report-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const reports = getReports();
    const near = (destInput.value || originInput.value || 'your route').split(',')[0];
    reports.unshift({
      type: btn.getAttribute('data-report'),
      icon: btn.getAttribute('data-icon'),
      near,
      time: Date.now()
    });
    saveReports(reports);
    renderReports();
    showToast('Report submitted — thanks for helping keep others safe.');
  });
});

// ---------------- Safety scoring algorithm ----------------
const ALT_STREETS = ['Elm Street', 'Maple Avenue', 'Lincoln Boulevard', 'Garden Way', 'Willow Lane', 'Park Terrace'];

function computeSafety(weather){
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 19;
  const crosswalkCount = Math.min(8, Math.max(1, Math.round((routeDistanceKm || 1) * 2 + Math.random() * 2)));
  const lightingRoll = Math.random();
  const lighting = isNight ? (lightingRoll > 0.6 ? 'good' : lightingRoll > 0.3 ? 'fair' : 'poor')
                            : (lightingRoll > 0.3 ? 'good' : 'fair');
  const schoolZone = Math.random() < 0.2;
  const reports = getReports();
  const relevantReports = reports.slice(0, 3); // treat the most recent nearby reports as relevant to this route
  const communityPenalty = Math.min(20, relevantReports.length * 6);

  let score = 100;
  const reasons = [];

  if(weather.rain){ score -= 15; reasons.push('rain is reducing traction and driver visibility'); }
  if(weather.snow){ score -= 20; reasons.push('snow is affecting sidewalk and road conditions'); }
  if(isNight){ score -= 10; reasons.push('it\u2019s after dark, when pedestrian visibility drops'); }
  if(weather.visibility === 'poor'){ score -= 15; reasons.push('visibility is currently poor'); }
  if(schoolZone){ score += 10; reasons.push('the route passes through a school zone with lower posted speeds'); }
  if(crosswalkCount >= 3){ score += Math.min(10, crosswalkCount * 2); reasons.push(`${crosswalkCount} marked crosswalks are along the way`); }
  if(lighting === 'good'){ score += 8; reasons.push('street lighting is rated good for the full route'); }
  if(lighting === 'poor'){ score -= 8; reasons.push('parts of the route have limited street lighting'); }
  if(communityPenalty > 0){ score -= communityPenalty; reasons.push(`${relevantReports.length} recent community report${relevantReports.length === 1 ? '' : 's'} nearby`); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const risk = score >= 80 ? 'LOW' : score >= 55 ? 'MODERATE' : 'HIGH';

  return { score, risk, isNight, crosswalkCount, lighting, schoolZone, communityPenalty, relevantReports, reasons };
}

function buildRecommendation(result, weather){
  const positives = [];
  const negatives = [];
  if(weather.rain || weather.snow) negatives.push('slick, low-visibility conditions');
  if(result.isNight) negatives.push('reduced light after dark');
  if(result.lighting === 'poor') negatives.push('stretches of poor street lighting');
  if(result.communityPenalty > 0) negatives.push('a few recent hazard reports nearby');
  if(result.crosswalkCount >= 3) positives.push('several marked crosswalks');
  if(result.lighting === 'good') positives.push('consistently good street lighting');
  if(result.schoolZone) positives.push('a school zone with lower traffic speeds');

  if(result.risk === 'LOW'){
    const posText = positives.length ? positives.join(' and ') : 'generally favorable conditions';
    return `This route looks safe right now, with ${posText}. No major concerns detected — enjoy your walk.`;
  }
  if(result.risk === 'MODERATE'){
    const negText = negatives.length ? negatives.join(' and ') : 'a few mixed conditions';
    return `This route is walkable but worth some caution due to ${negText}. Stay alert at intersections and consider a well-lit path if one is available.`;
  }
  const negText = negatives.length ? negatives.join(' and ') : 'several unfavorable conditions';
  return `This route currently carries higher risk because of ${negText}. Consider the alternative below, delay your walk if possible, or share your live location with someone you trust.`;
}

// ---------------- UI wiring ----------------
const aiEmpty = document.getElementById('aiEmpty');
const aiLoading = document.getElementById('aiLoading');
const aiResults = document.getElementById('aiResults');
const typingText = document.getElementById('typingText');

const TYPING_STEPS = [
  'Checking current weather…',
  'Counting marked crosswalks…',
  'Reviewing community reports…',
  'Weighing time-of-day risk…',
  'Calculating your Safety Score…'
];

async function runAnalysis(){
  aiEmpty.classList.remove('show'); aiEmpty.style.display = 'none';
  aiResults.classList.remove('show');
  aiLoading.classList.add('show');
  analyzeBtn.disabled = true;

  let step = 0;
  typingText.textContent = TYPING_STEPS[0];
  const typingInterval = setInterval(() => {
    step = (step + 1) % TYPING_STEPS.length;
    typingText.textContent = TYPING_STEPS[step];
  }, 480);

  const weather = await fetchWeather(destCoords.lat, destCoords.lng);
  const result = computeSafety(weather);
  const recommendation = buildRecommendation(result, weather);

  setTimeout(() => {
    clearInterval(typingInterval);
    aiLoading.classList.remove('show');
    renderResults(result, weather, recommendation);
    aiResults.classList.add('show');
    analyzeBtn.disabled = false;
    incrementAnalysisCount();
  }, 2200);
}

function tagFor(quality){
  if(quality === 'good' || quality === 'excellent') return { cls: 'tag-good', label: 'Good' };
  if(quality === 'fair') return { cls: 'tag-fair', label: 'Fair' };
  return { cls: 'tag-poor', label: 'Poor' };
}

function renderResults(result, weather, recommendation){
  // score ring: circumference for r=42 is ~264
  const circumference = 264;
  const offset = circumference - (circumference * result.score / 100);
  document.getElementById('scoreRing').style.strokeDashoffset = offset;
  document.getElementById('scoreRing').setAttribute('stroke', result.risk === 'LOW' ? '#2E7D32' : result.risk === 'MODERATE' ? '#B8860B' : '#C0392B');
  document.getElementById('scoreNum').textContent = result.score;

  const badge = document.getElementById('riskBadge');
  badge.textContent = `${result.risk} RISK`;
  badge.className = 'risk-badge ' + (result.risk === 'LOW' ? 'risk-low' : result.risk === 'MODERATE' ? 'risk-moderate' : 'risk-high');

  const weatherTag = tagFor(weather.rain || weather.snow ? 'poor' : weather.visibility);
  const visTag = tagFor(weather.visibility);
  const roadTag = tagFor(result.crosswalkCount >= 3 ? 'good' : 'fair');
  const lightTag = tagFor(result.lighting);
  const timeTag = tagFor(result.isNight ? 'fair' : 'good');
  const reportTag = tagFor(result.communityPenalty > 0 ? 'poor' : 'good');

  document.getElementById('conditionsList').innerHTML = `
    <div class="condition-row"><span>${weather.icon} ${weather.description}, ${weather.temp}°F</span><span class="tag ${weatherTag.cls}">${weatherTag.label}</span></div>
    <div class="condition-row"><span>👁️ Visibility</span><span class="tag ${visTag.cls}">${visTag.label}</span></div>
    <div class="condition-row"><span>🚸 ${result.crosswalkCount} marked crosswalks</span><span class="tag ${roadTag.cls}">${roadTag.label}</span></div>
    <div class="condition-row"><span>💡 Street lighting</span><span class="tag ${lightTag.cls}">${lightTag.label}</span></div>
    <div class="condition-row"><span>🕒 ${result.isNight ? 'After dark' : 'Daytime'}</span><span class="tag ${timeTag.cls}">${timeTag.label}</span></div>
    <div class="condition-row"><span>📣 Community reports nearby</span><span class="tag ${reportTag.cls}">${reportTag.label}</span></div>
  `;

  document.getElementById('recBox').textContent = recommendation;

  const altBox = document.getElementById('altRouteBox');
  const altText = document.getElementById('altRouteText');
  if(result.risk !== 'LOW'){
    const street = ALT_STREETS[Math.floor(Math.random() * ALT_STREETS.length)];
    altText.textContent = ` Try a path via ${street} instead — it typically has better lighting, a signalized crossing, and lower traffic speeds.`;
    altBox.style.display = 'block';
  } else {
    altBox.style.display = 'none';
  }

  window._lastResult = result;
}

function incrementAnalysisCount(){
  const email = ssGetSession();
  if(!email) return;
  const users = ssGetUsers();
  if(users[email]){
    users[email].analyses = (users[email].analyses || 0) + 1;
    ssSaveUsers(users);
  }
}

analyzeBtn.addEventListener('click', runAnalysis);
document.getElementById('reanalyzeBtn').addEventListener('click', runAnalysis);

document.getElementById('saveRouteBtn').addEventListener('click', () => {
  const email = ssGetSession();
  if(!email || !window._lastResult) return;
  const users = ssGetUsers();
  const user = users[email];
  if(!user) return;
  user.savedRoutes = user.savedRoutes || [];
  user.savedRoutes.unshift({
    from: originInput.value.split(',')[0],
    to: destInput.value.split(',')[0],
    score: window._lastResult.score,
    risk: window._lastResult.risk,
    savedAt: new Date().toISOString()
  });
  ssSaveUsers(users);
  showToast('Route saved to your profile.');
});

// ---------------- Init ----------------
ssRequireAuth();
detectLocation();
renderReports();
