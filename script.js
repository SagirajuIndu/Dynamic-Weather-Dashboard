// CONFIG
const API_KEY = 'e15d05a0cf0c6b8b879d39a669af2a8e';
let units = 'metric';

let lastCoords = null;  
let lastCityName = null; 

// Timers
let __istTimer = null;
let __cityTimer = null;

// DOM helpers
const $ = id => document.getElementById(id);

// Elements
const status = $('status');
const btnLocate = $('btnLocate');
const btnSearch = $('btnSearch');
const searchInput = $('search');
const unitToggle = $('unitToggle');
const themeToggle = $('themeToggle');
const suggestionsBox = $('suggestions');
const recentWrap = $('recentWrap');

// STATUS
function setStatus(text, loading = false) {
  status.textContent = text;
  if (loading) status.innerHTML = `<span class="loader"></span> ${text}`;
}

// ---------- TIME HELPERS ----------
function formatTime(ts, tzOffsetSec) {
  const d = new Date((ts + tzOffsetSec) * 1000);
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function localTimeForZone(tzOffsetSec) {
  const nowUTC = Math.floor(Date.now() / 1000);
  const localMs = (nowUTC + tzOffsetSec) * 1000;
  const d = new Date(localMs);
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()];
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2,'0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${day} ${h}:${m} ${ampm}`;
}

function startLiveISTClock() {
  const el = $('localTime');
  if (!el) return;
  function tick() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).formatToParts(now);
    const get = k => parts.find(p => p.type === k)?.value || '';
    const day = get('weekday');
    const hour = get('hour');
    const minute = get('minute');
    const dayPeriod = (get('dayPeriod') || '').toUpperCase();
    el.textContent = `${day} ${hour}:${minute} ${dayPeriod} (IST)`;
  }
  tick();
  clearInterval(__istTimer);
  __istTimer = setInterval(tick, 1000);
}

function startLiveCityClock(tzOffsetSec) {
  const el = $('localTime');
  if (!el) return;
  function tick() {
    const utcNow = Date.now();
    const d = new Date(utcNow + tzOffsetSec * 1000);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const day = days[d.getUTCDay()];
    let h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    el.textContent = `${day} ${h}:${m} ${ampm}`;
  }
  tick();
  clearInterval(__cityTimer);
  __cityTimer = setInterval(tick, 1000);
}

function stopClocks() {
  clearInterval(__istTimer);
  clearInterval(__cityTimer);
}

// ---------- AQI ----------
function aqiColor(aqi){
  switch(aqi){
    case 1: return { bg:'#16a34a', text:'Good' };
    case 2: return { bg:'#84cc16', text:'Fair' };
    case 3: return { bg:'#f59e0b', text:'Moderate' };
    case 4: return { bg:'#f97316', text:'Poor' };
    case 5: return { bg:'#ef4444', text:'Very Poor' };
    default: return { bg:'#6b7280', text:'N/A' };
  }
}

async function renderAQI(lat, lon){
  const row = $('aqiRow');
  const badge = $('aqiBadge');
  const desc = $('aqiDesc');
  if(!row || !badge || !desc) return;
  try{
    const r = await fetch(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`
    );
    if(!r.ok) throw new Error('AQI fetch failed');
    const data = await r.json();
    const aqi = data?.list?.[0]?.main?.aqi || 0;
    const comps = data?.list?.[0]?.components || {};
    const m = aqiColor(aqi);
    badge.textContent = `AQI ${aqi}`;
    badge.style.background = m.bg;
    badge.style.color = '#0b1220';
    badge.style.borderColor = 'transparent';
    const pm25 = comps.pm2_5 != null ? comps.pm2_5.toFixed(1) : '--';
    const pm10 = comps.pm10 != null ? comps.pm10.toFixed(1) : '--';
    desc.textContent = `${m.text} • PM2.5: ${pm25} • PM10: ${pm10}`;
    row.style.display = 'flex';
  }catch(e){
    console.warn('AQI error', e);
    row.style.display = 'none';
  }
}

// ------------------------
// WEATHER BY COORDS
async function fetchWeatherByCoords(lat, lon) {
  try {
    setStatus('Fetching weather...', true);
    const curRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`
    );
    if (!curRes.ok) throw new Error('Current weather failed');
    const cur = await curRes.json();

    const fRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`
    );
    if (!fRes.ok) throw new Error('Forecast failed');
    const fdata = await fRes.json();

    // Update cache with exact coords to keep conditions stable
    lastCoords = { lat, lon };
    lastCityName = cur.name || lastCityName;

    renderCurrent(cur);
    renderForecast(fdata);
    renderAQI(lat, lon);

    setStatus('Updated');
    updateRecents(lastCityName, lastCoords);
  } catch (e) {
    console.error(e);
    setStatus('Unable to fetch weather');
  }
}

// WEATHER BY CITY
async function fetchWeatherByCity(city) {
  try {
    setStatus(`Searching "${city}"...`, true);
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${units}&appid=${API_KEY}`
    );
    if (!res.ok) throw new Error('City not found');
    const cur = await res.json();

    lastCityName = cur.name || city;
    localStorage.setItem('lastCity', lastCityName);
    lastCoords = { lat: cur.coord.lat, lon: cur.coord.lon };
    await fetchWeatherByCoords(cur.coord.lat, cur.coord.lon);
  } catch (e) {
    console.error(e);
    setStatus('City not found or API error');
  }
}

// RENDER CURRENT
function renderCurrent(data) {
  const tz = data.timezone || 0;

  $('wIconImg').src = data.weather?.[0]
    ? `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`
    : '';
  $('wIconImg').alt = data.weather?.[0]?.description || '';

  $('temp').textContent = Math.round(data.main.temp) + (units === 'metric' ? '°C' : '°F');
  $('cond').textContent = data.weather[0].description.replace(/\b(\w)/g, s => s.toUpperCase());
  $('place').textContent = `${data.name}, ${data.sys.country}`;

  $('feels').textContent = Math.round(data.main.feels_like) + (units === 'metric' ? '°C' : '°F');
  $('humidity').textContent = data.main.humidity + '%';
  $('wind').textContent = Math.round(data.wind.speed) + (units === 'metric' ? ' m/s' : ' mph');
  $('pressure').textContent = data.main.pressure + ' hPa';
  $('visibility').textContent = (data.visibility / 1000).toFixed(1) + ' km';

  $('sunrise').textContent = formatTime(data.sys.sunrise, tz);
  $('sunset').textContent  = formatTime(data.sys.sunset, tz);

  // Paint once immediately
  $('localTime').textContent = localTimeForZone(tz);

  // Switch to live city clock
  stopClocks();
  startLiveCityClock(tz);
}

// FORECAST
function groupForecastByDay(list, tz) {
  const byDay = {};
  list.forEach(item => {
    const local = new Date((item.dt + tz) * 1000);
    const key = local.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(item);
  });
  return Object.keys(byDay).slice(0, 5).map(k => ({ date: k, items: byDay[k] }));
}

function renderForecast(fdata) {
  const wrap = $('forecast');
  wrap.innerHTML = '';
  const tz = fdata.city.timezone || 0;
  const days = groupForecastByDay(fdata.list, tz);

  days.forEach(day => {
    const mid = day.items[Math.floor(day.items.length / 2)];
    const icon = mid.weather[0].icon;
    const desc = mid.weather[0].main;
    const temps = day.items.map(i => i.main.temp);
    const min = Math.round(Math.min(...temps));
    const max = Math.round(Math.max(...temps));
    const d = new Date(day.date);
    const wk = d.toLocaleDateString(undefined, { weekday: 'short' });

    const el = document.createElement('div');
    el.className = 'day fade-in';
    el.innerHTML = `
      <div class="wk">${wk}</div>
      <img alt="${desc}" src="https://openweathermap.org/img/wn/${icon}.png" />
      <div class="range"><span>${min}°</span><span>${max}°</span></div>
    `;
    wrap.appendChild(el);
  });
}

// ---------- RECENTS ----------
function getRecents(){
  try{
    return JSON.parse(localStorage.getItem('recents') || '[]');
  }catch{ return []; }
}
function setRecents(arr){
  localStorage.setItem('recents', JSON.stringify(arr.slice(0, 8)));
}
function updateRecents(name, coords){
  if(!name || !coords) return;
  const list = getRecents().filter(r => r.name.toLowerCase() !== name.toLowerCase());
  list.unshift({ name, coords });
  setRecents(list);
  renderRecents();
}
function renderRecents(){
  const list = getRecents();
  recentWrap.innerHTML = '';
  list.forEach(r => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = r.name;
    b.onclick = () => fetchWeatherByCoords(r.coords.lat, r.coords.lon);
    recentWrap.appendChild(b);
  });
}

// ---------- TYPEAHEAD SUGGESTIONS ----------
let sugActiveIndex = -1;
let lastSugList = [];
let sugAbort = null;

function showSuggestions(list) {
  if (!suggestionsBox) return;
  if (!list || list.length === 0) {
    suggestionsBox.style.display = 'none';
    suggestionsBox.innerHTML = '';
    return;
  }
  suggestionsBox.innerHTML = list.map((it, idx) => {
    const name = it.name || '';
    const state = it.state ? `, ${it.state}` : '';
    const country = it.country ? `, ${it.country}` : '';
    return `<div class="suggestion-item" data-idx="${idx}" tabindex="-1">${name}${state}${country}</div>`;
  }).join('');
  suggestionsBox.style.display = 'block';
  lastSugList = list;
  sugActiveIndex = -1;

  suggestionsBox.querySelectorAll('.suggestion-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      const idx = Number(el.getAttribute('data-idx'));
      selectSuggestion(idx);
      e.preventDefault();
    });
  });
}

function setActiveSuggestion(nextIndex) {
  const items = suggestionsBox?.querySelectorAll('.suggestion-item');
  if (!items || items.length === 0) return;
  items.forEach(el => el.classList.remove('active'));
  sugActiveIndex = ((nextIndex % items.length) + items.length) % items.length;
  items[sugActiveIndex].classList.add('active');
  items[sugActiveIndex].scrollIntoView({ block: 'nearest' });
}

function selectSuggestion(idx) {
  const item = lastSugList[idx];
  if (!item) return;
  const display = item.name + (item.state ? `, ${item.state}` : '') + (item.country ? `, ${item.country}` : '');
  searchInput.value = display;
  fetchWeatherByCoords(item.lat, item.lon);
  updateRecents(display, { lat: item.lat, lon: item.lon });
  showSuggestions([]);
}

function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

async function fetchCitySuggestions(q) {
  if (!q || q.length < 2) {
    showSuggestions([]);
    return;
  }
  try {
    if (sugAbort) sugAbort.abort();
    sugAbort = new AbortController();
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=7&appid=${API_KEY}`;
    const res = await fetch(url, { signal: sugAbort.signal });
    if (!res.ok) throw new Error('geocoding failed');
    const data = await res.json();
    const seen = new Set();
    const list = [];
    for (const d of data) {
      const key = [d.name || '', d.state || '', d.country || ''].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ name: d.name, state: d.state, country: d.country, lat: d.lat, lon: d.lon });
    }
    showSuggestions(list);
  } catch (e) {
    showSuggestions([]);
  }
}

const debouncedSuggest = debounce(fetchCitySuggestions, 300);

// Wire input + keyboard for suggestions
searchInput?.addEventListener('input', () => {
  const q = searchInput.value.trim();
  debouncedSuggest(q);
});
searchInput?.addEventListener('focus', () => {
  if (lastSugList.length > 0) {
    showSuggestions(lastSugList);
  } else {
    const q = searchInput.value.trim();
    debouncedSuggest(q);
  }
});
searchInput?.addEventListener('keydown', (e) => {
  const isOpen = suggestionsBox && suggestionsBox.style.display === 'block';
  if (e.key === 'ArrowDown') {
    if (isOpen) { e.preventDefault(); setActiveSuggestion(sugActiveIndex + 1); }
  } else if (e.key === 'ArrowUp') {
    if (isOpen) { e.preventDefault(); setActiveSuggestion(sugActiveIndex - 1); }
  } else if (e.key === 'Enter') {
    if (isOpen && sugActiveIndex >= 0) {
      e.preventDefault();
      selectSuggestion(sugActiveIndex);
    } else {
      const q = searchInput.value.trim();
      if (q) fetchWeatherByCity(q);
    }
  } else if (e.key === 'Escape') {
    showSuggestions([]);
  }
});
// Close suggestions on outside click / blur
document.addEventListener('click', (e) => {
  if (!suggestionsBox) return;
  const within = suggestionsBox.contains(e.target) || searchInput.contains(e.target);
  if (!within) showSuggestions([]);
});
searchInput?.addEventListener('blur', () => {
  setTimeout(() => showSuggestions([]), 120);
});

// ---------- THEME ----------
function applyTheme() {
  const mode = localStorage.getItem('theme') || 'light';
  document.body.classList.toggle('dark', mode === 'dark');
  themeToggle?.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
}

// ---------- INIT + EVENTS ----------
async function locateMe() {
  if (!navigator.geolocation) {
    setStatus('Geolocation not supported');
    return;
  }
  setStatus('Locating...', true);
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude, longitude } = pos.coords;
      await fetchWeatherByCoords(latitude, longitude);
    },
    () => setStatus('Location permission denied'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function restoreLast() {
  const savedCity = localStorage.getItem('lastCity');
  if (savedCity) {
    fetchWeatherByCity(savedCity);
  } else {
    startLiveISTClock();
    setStatus('Ready');
  }
}

btnLocate?.addEventListener('click', locateMe);
btnSearch?.addEventListener('click', () => {
  const q = searchInput.value.trim();
  if (q) fetchWeatherByCity(q);
});

unitToggle?.addEventListener('click', async () => {
  units = units === 'metric' ? 'imperial' : 'metric';
  unitToggle.textContent = units === 'metric' ? '°C/°F' : '°F/°C';
  if (lastCoords) {
    await fetchWeatherByCoords(lastCoords.lat, lastCoords.lon);
  } else if (lastCityName) {
    await fetchWeatherByCity(lastCityName);
  }
});

themeToggle?.addEventListener('click', () => {
  const current = localStorage.getItem('theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme();
});

function init() {
  applyTheme();
  renderRecents();
  restoreLast();
}
document.addEventListener('DOMContentLoaded', init);
