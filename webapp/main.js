const map = L.map('map').setView([45.576, 9.525], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);

let selectedLayer, resultsLayer;
let osmResults = [];
let selectedCabinCode = '';

function setInfo(message){
  const el = document.getElementById('info');
  if(el) el.textContent = message;
}

function esc(value){
  return String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

async function fetchJson(url, options){
  const response = await fetch(url, options);
  if(!response.ok){
    let message = `${response.status} ${response.statusText}`;
    try{
      const body = await response.json();
      if(body && body.error) message = body.error;
    }catch(e){
      try{ message = await response.text(); }catch(e2){}
    }
    throw new Error(message);
  }
  return response.json();
}

async function loadCabins(){
  try{
    const data = await fetchJson('/api/cabins');
    populateCabinList(data.features || []);
    const layer = L.geoJSON(data, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 7, weight: 2, fillOpacity: 0.8 }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const label = p.COD_AC || p.NOME || 'Area cabina';
        layer.bindPopup(`<strong>${esc(label)}</strong><br>${esc(p.COMUNE || '')}`);
      }
    }).addTo(map);
    try{ map.fitBounds(layer.getBounds().pad(0.2)); }catch(e){}
  }catch(err){
    setInfo('Errore caricamento cabine: ' + err.message);
  }
}

function populateCabinList(features){
  const ul = document.getElementById('cabinsList');
  if(!ul) return;
  ul.innerHTML = '';
  features.forEach(feature => {
    const p = feature.properties || {};
    const code = p.COD_AC || p.NOME;
    const li = document.createElement('li');
    li.textContent = `${p.COD_AC || 'Area'}${p.COMUNE ? ' - ' + p.COMUNE : ''}`;
    li.dataset.code = code;
    li.onclick = () => selectAreaByCode(code, li);
    ul.appendChild(li);
  });
}

async function selectAreaByCode(code, li){
  try{
    selectedCabinCode = code;
    document.querySelectorAll('#cabinsList li,.ac-btn').forEach(n=>n.classList.remove('active'));
    if(li) li.classList.add('active');
    setInfo(`Caricamento area ${code}...`);

    const geo = await fetchJson(`/api/area?code=${encodeURIComponent(code)}`);
    const feature = geo.features && geo.features[0];
    if(!feature) throw new Error('Area non trovata');

    if(selectedLayer) selectedLayer.remove();
    selectedLayer = L.geoJSON(feature, { style: { color: '#00a5ff', weight: 3, fillOpacity: 0.12 } }).addTo(map);
    try{ map.fitBounds(selectedLayer.getBounds().pad(0.2)); }catch(e){}

    setInfo(`Area ${code} caricata. Ricerca utenze non domestiche in corso...`);
    const osm = await fetchJson('/api/osm-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geojson: feature.geometry })
    });
    osmResults = enrichFeatures(osm.features || [], code);
    renderResults(osmResults, osm.meta || {});
  }catch(err){
    setInfo('Errore: ' + err.message);
  }
}

function enrichFeatures(features, code){
  return features
    .map(f => {
      const p = Object.assign({}, f.properties || {});
      const cat = categorizeFeature(p);
      const coords = getCoordinates(f);
      return Object.assign({}, f, {
        properties: Object.assign(p, {
          cabina_cod_ac: code,
          category_macro: cat.macro,
          category_sub: cat.sub,
          lat: coords.lat,
          lon: coords.lon,
          address: formatAddress(p),
          outreach_name: p.name || p.operator || p.brand || p.shop || p.craft || p.office || p.amenity || p.building || 'Da verificare',
          note_verifica: buildVerificationNote(p, cat)
        })
      });
    })
    .filter(f => {
      const p = f.properties || {};
      return p.category_macro && (p.outreach_name !== 'Da verificare' || p.confidence !== 'bassa');
    })
    .sort((a,b) => String(a.properties.category_macro).localeCompare(String(b.properties.category_macro)) || String(a.properties.outreach_name).localeCompare(String(b.properties.outreach_name)));
}

function getCoordinates(feature){
  if(feature.geometry && feature.geometry.type === 'Point'){
    const [lon, lat] = feature.geometry.coordinates;
    return { lat, lon };
  }
  return { lat: '', lon: '' };
}

function formatAddress(p){
  return [p['addr:street'], p['addr:housenumber'], p['addr:postcode'], p['addr:city']].filter(Boolean).join(' ');
}

function buildVerificationNote(p, cat){
  if(!p.name && !p.operator && !p.brand) return 'Nome non disponibile in OSM: verificare manualmente prima del contatto.';
  if(cat.macro === 'Edificio potenzialmente non domestico') return 'Classificazione basata su tag edificio: verificare occupante/attivita.';
  return 'Potenziale utenza non domestica identificata da tag OSM.';
}

function renderResults(features, meta){
  if(resultsLayer) resultsLayer.remove();
  resultsLayer = L.geoJSON(features, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng,{radius:7,fillOpacity:0.9,weight:1}),
    onEachFeature: (f, layer) => {
      const p = f.properties || {};
      layer.bindPopup(`<strong>${esc(p.outreach_name)}</strong><br>${esc(p.category_macro)}${p.category_sub ? ' / ' + esc(p.category_sub) : ''}<br>${esc(p.address || '')}<br>Confidenza: ${esc(p.confidence || '')}`);
    }
  }).addTo(map);
  try{ if(features.length) map.fitBounds(resultsLayer.getBounds().pad(0.2)); }catch(e){}
  populateLongList(features);
  const source = meta.source === 'mock' ? 'mock' : 'OpenStreetMap/Overpass';
  setInfo(`Trovati ${features.length} potenziali utenti non domestici. Fonte: ${source}.`);
}

function populateLongList(features){
  const div = document.getElementById('resultsList');
  if(!div) return;
  div.innerHTML = '';
  if(!features.length){ div.textContent = 'Nessun risultato'; return; }
  features.forEach(f=>{
    const p = f.properties || {};
    const el = document.createElement('div');
    el.className = 'result-item';
    el.innerHTML = `<strong>${esc(p.outreach_name)}</strong><br><small>${esc(p.category_macro)}${p.category_sub ? ' / ' + esc(p.category_sub) : ''}<br>${esc(p.address || 'Indirizzo non disponibile')}<br>Confidenza: ${esc(p.confidence || 'n.d.')}</small>`;
    div.appendChild(el);
  });
}

function getSelectedColumns(){
  const preset = document.getElementById('exportPreset')?.value || 'outreach';
  if(preset === 'minimal') return ['cabina_cod_ac','outreach_name','category_macro','category_sub','address','lat','lon','_osm_type','_osm_id'];
  if(preset === 'all'){
    const inputs = Array.from(document.querySelectorAll('#columnsSelector input[type=checkbox]'));
    const cols = inputs.filter(i=>i.checked).map(i=>i.dataset.col);
    return cols.length ? cols : ['cabina_cod_ac','outreach_name','category_macro','category_sub'];
  }
  return ['cabina_cod_ac','outreach_name','category_macro','category_sub','address','phone','contact:phone','email','website','lat','lon','confidence','note_verifica','source','_osm_type','_osm_id'];
}

function exportCSV(){
  if(!osmResults.length){ alert('Nessun risultato da esportare'); return; }
  const cols = getSelectedColumns();
  const rows = osmResults.map(f => cols.map(c => csvCell((f.properties || {})[c])).join(';'));
  const csv = [cols.join(';'), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vaprio_potenziali_utenti_non_domestici_${selectedCabinCode || 'export'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value){
  const v = String(value ?? '');
  return `"${v.replace(/"/g,'""')}"`;
}

async function exportPDF(){
  if(!osmResults.length){ alert('Nessun risultato da esportare'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const body = osmResults.map(f => {
    const p = f.properties || {};
    return [p.cabina_cod_ac, p.outreach_name, p.category_macro, p.category_sub, p.address, p.confidence];
  });
  doc.text('Potenziali utenze non domestiche - Vaprio d Adda', 40, 40);
  doc.autoTable({ head: [['Cabina','Nome','Macro categoria','Sotto-categoria','Indirizzo','Confidenza']], body, startY: 60, styles: { fontSize: 8 } });
  doc.save(`vaprio_potenziali_utenti_${selectedCabinCode || 'export'}.pdf`);
}

function categorizeFeature(p){
  const lower = (s) => (s || '').toString().toLowerCase();
  if(p.craft){
    const v = lower(p.craft);
    if(v.includes('car_repair') || v.includes('mechanic')) return { macro: 'Artigiani e laboratori', sub: 'Officina / autoriparazione' };
    if(v.includes('electrician')) return { macro: 'Artigiani e laboratori', sub: 'Elettricista' };
    if(v.includes('plumber')) return { macro: 'Artigiani e laboratori', sub: 'Idraulico' };
    if(v.includes('carpenter')) return { macro: 'Artigiani e laboratori', sub: 'Falegname' };
    return { macro: 'Artigiani e laboratori', sub: p.craft };
  }
  if(p.shop){
    const v = lower(p.shop);
    if(v.includes('supermarket') || v.includes('grocery')) return { macro: 'Negozi e servizi locali', sub: 'Supermercato / alimentari' };
    if(v.includes('butcher')) return { macro: 'Negozi e servizi locali', sub: 'Macelleria' };
    if(v.includes('bakery')) return { macro: 'Negozi e servizi locali', sub: 'Panetteria / pasticceria' };
    if(v.includes('hairdresser') || v.includes('beauty')) return { macro: 'Negozi e servizi locali', sub: 'Cura persona' };
    return { macro: 'Negozi e servizi locali', sub: p.shop };
  }
  if(p.office) return { macro: 'Uffici e PMI', sub: p.office };
  if(p.tourism) return { macro: 'Ospitalita e turismo', sub: p.tourism };
  if(p.amenity){
    const v = lower(p.amenity);
    if(['restaurant','bar','cafe'].includes(v)) return { macro: 'Ristorazione', sub: p.amenity };
    if(['school','clinic','hospital','doctors','dentist','pharmacy','post_office','townhall','library','community_centre'].includes(v)) return { macro: 'Servizi pubblici o collettivi', sub: p.amenity };
    if(['bank','fuel','marketplace'].includes(v)) return { macro: 'Servizi e commercio', sub: p.amenity };
    return { macro: 'Servizi e commercio', sub: p.amenity };
  }
  if(p.landuse === 'industrial') return { macro: 'Aree produttive', sub: 'landuse=industrial' };
  if(['commercial','industrial','retail','office','warehouse','supermarket','school','hospital'].includes(lower(p.building))){
    return { macro: 'Edificio potenzialmente non domestico', sub: p.building };
  }
  return { macro: '', sub: '' };
}

document.addEventListener('DOMContentLoaded', () => {
  loadCabins();
  document.querySelectorAll('.ac-btn').forEach(button => {
    button.addEventListener('click', () => selectAreaByCode(button.dataset.code, button));
  });
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCSV);
  document.getElementById('exportPdfBtn')?.addEventListener('click', exportPDF);
});
