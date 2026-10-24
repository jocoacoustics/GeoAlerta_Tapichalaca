"use strict";
/* Sitio estático: NO recibe contraseñas, archivos de estaciones ni coordenadas operativas. */
const CENTER = { lat: -4.50, lon: -79.13 }; // Centro cartográfico aproximado; no ubicación de sensores.
const state = { layer2d: null, viewer3d: null, active: '2d', data: null, marker2d: null, publicLayer2d: null, publicLayer3d: null };
const $ = (id) => document.getElementById(id);

async function loadPublicData() {
  try {
    const response = await fetch('data/overview.json', {cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    const valid = state.data && state.data.data_classification === 'public_aggregated' && !state.data.contains_precise_station_coordinates;
    if (!valid) throw new Error('Los datos carecen de etiqueta pública segura.');
    $('releaseBadge').textContent = state.data.publication_status === 'published' ? 'Indicadores públicos' : 'Sin datos operativos publicados';
  } catch(err) {
    state.data = null;
    $('releaseBadge').textContent = 'Datos públicos no disponibles';
    console.warn('GeoAlerta:',err.message);
  }
  updateScenario();
}
function updateScenario() {
  const which = $('scenario').value;
  const s = state.data?.scenarios?.[which];
  $('scenarioTitle').textContent = which === 'six' ? 'A · Seis estaciones' : 'B · Red mínima inteligente';
  $('stationCount').textContent = s && Number.isInteger(s.station_count) ? String(s.station_count) : '—';
  $('riskCoverage').textContent = s && typeof s.priority_coverage_percent === 'number' ? `${s.priority_coverage_percent.toFixed(1)} %` : '—';
  $('stationCaption').textContent = s && Number.isInteger(s.station_count) ? 'Modelo predictivo' : 'Pendiente de publicación';
  $('scenarioDescription').textContent = s?.description || 'Pendiente de cargar resultados públicos aprobados. El mapa no muestra posiciones de vigilancia.';
}
function init2d() {
  if (!window.L) { $('map2d').textContent = 'Leaflet no cargó. Verifica la conexión a Internet.'; return; }
  state.layer2d = L.map('map2d',{zoomControl:false}).setView([CENTER.lat,CENTER.lon],12);
  L.control.zoom({position:'bottomright'}).addTo(state.layer2d);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(state.layer2d);
  state.marker2d = L.circleMarker([CENTER.lat,CENTER.lon],{
    radius:7,color:'#fff',fillColor:'#80973e',fillOpacity:1,weight:2
  }).bindPopup('<b>Sector Tapichalaca</b><br>Referencia cartográfica aproximada.<br>No indica una estación de vigilancia.').addTo(state.layer2d);
  renderPublicZones();
}
function renderPublicZones() {
  if (!state.layer2d) return;
  if (state.publicLayer2d) state.layer2d.removeLayer(state.publicLayer2d);
  // Solo se aceptan zonas explícitamente aprobadas, de geometría generalizada.
  const zones = state.data?.approved_public_zones;
  if (!Array.isArray(zones) || !$('showPublicZones').checked) return;
  const features = zones.filter(z => z?.type==='Feature' && z.properties?.visibility==='public_generalized');
  state.publicLayer2d = L.geoJSON({type:'FeatureCollection',features},{
    style:{color:'#a2ad5a',weight:2,fillOpacity:.13},
    onEachFeature:(feature,layer)=>layer.bindPopup(String(feature.properties?.label||'Zona pública'))
  }).addTo(state.layer2d);
}
function updateReference() {
  if (state.layer2d && state.marker2d) {
    if ($('showReference').checked) state.marker2d.addTo(state.layer2d);
    else state.layer2d.removeLayer(state.marker2d);
  }
}
async function init3d() {
  if (state.viewer3d) {state.viewer3d.resize(); return;}
  if (!window.Cesium) { $('map3d').textContent='CesiumJS no cargó; verifica la conexión a Internet.'; return; }
  const C = window.Cesium;
  try {
    state.viewer3d = new C.Viewer('map3d', {
      baseLayer:new C.ImageryLayer(new C.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/',maximumLevel:18})),
      baseLayerPicker:false,animation:false,timeline:false,geocoder:false,homeButton:false,
      navigationHelpButton:false,sceneModePicker:false,fullscreenButton:false,
      terrainProvider:new C.EllipsoidTerrainProvider(),
    });
    state.viewer3d.scene.globe.depthTestAgainstTerrain = true;
    await fly3d(0);
  } catch(e){ console.error(e); $('mapStatus').textContent='Error al cargar el globo 3D: '+e.message; }
}
async function fly3d(duration=2) {
  if (!state.viewer3d) return;
  state.viewer3d.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(CENTER.lon,CENTER.lat,15500),
    orientation:{heading:Cesium.Math.toRadians(30),pitch:Cesium.Math.toRadians(-55),roll:0},
    duration
  });
}
async function mode(target) {
  state.active=target;
  $('map2d').classList.toggle('hidden',target!=='2d');
  $('map3d').classList.toggle('hidden',target!=='3d');
  $('mode2d').classList.toggle('selected',target==='2d');
  $('mode3d').classList.toggle('selected',target==='3d');
  $('mapStatus').textContent=target==='2d'
    ? 'OpenStreetMap · cartografía de referencia, no ubicación de estaciones'
    : 'CesiumJS · globo 3D; relieve topográfico detallado requiere un proveedor autorizado';
  if(target==='3d') await init3d();
  else if(state.layer2d) setTimeout(()=>state.layer2d.invalidateSize(),80);
}
async function activateTerrain() {
  const token=$('terrainToken').value.trim();
  if (!token) { $('mapStatus').textContent='Ingresa un token público restringido a tu dominio para activar el terreno.'; return; }
  await mode('3d');
  if (!state.viewer3d) return;
  try {
    Cesium.Ion.defaultAccessToken=token;
    state.viewer3d.terrainProvider=await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
    $('mapStatus').textContent='Terreno mundial Cesium ion activo. El dosel forestal no se modela árbol por árbol.';
    $('terrainToken').value='';
    await fly3d(1.5);
  } catch(err) { console.error(err); $('mapStatus').textContent='No se pudo activar el terreno: revisa permisos y restricciones del token.'; }
}
window.addEventListener('DOMContentLoaded',async()=>{
  init2d();
  $('scenario').addEventListener('change',updateScenario);
  $('mode2d').addEventListener('click',()=>mode('2d'));
  $('mode3d').addEventListener('click',()=>mode('3d'));
  $('flyButton').addEventListener('click',()=>{
    if(state.active==='3d')fly3d(2); else state.layer2d?.flyTo([CENTER.lat,CENTER.lon],12,{duration:1});
  });
  $('showPublicZones').addEventListener('change',renderPublicZones);
  $('showReference').addEventListener('change',updateReference);
  $('activateTerrain').addEventListener('click',activateTerrain);
  await loadPublicData();
  renderPublicZones();
});
