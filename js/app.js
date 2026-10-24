/* GeoAlerta v0.2.2 — CesiumJS. Datos privados NO se exportan a githubpages/.
   La geometría synthetic_demo ilustra interacción, no posiciones ni resultados reales. */
'use strict';
const $ = id => document.getElementById(id);
const state = {heatLayers:{},heatSeq:0,scene:null,viewer:null,imagery:null,terrainAvailable:false,sceneObjects:{},scenario:'six',activeSceneEntities:[],timeInterval:null,orbiting:false,orbitTick:null};
const C = () => window.Cesium;
const ACTIVE_COLOR = {blue:'#35b9fe',orange:'#ffc642',red:'#ee503d',green:'#79cb59'};
function notify(message,ms=4600){const n=$('toast');n.textContent=message;n.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>n.hidden=true,ms)}
function updateStatus(message){$('mapStatus').textContent=message;$('statusMini').textContent=message;}
function isSynthetic(){return state.scene?.classification==='synthetic_demo'}
function allowedLayer(name){const s=state.scene||{};const h=s.scenarios?.[state.scenario]?.heatmaps||{};return ({acousticHeat:!!h.acoustic,radioHeat:!!h.radio,canopy:(s.canopy||[]).length>0,loss:(s.loss||[]).length>0,forest:(s.forest||[]).length>0,risk:(s.risk||[]).length>0,boundary:!!s.boundary})[name] ?? true}
function selected(name){const el=document.querySelector(`input[data-layer="${name}"]`);return !!el?.checked;}
function updateLayers(){for(const el of document.querySelectorAll('input[data-layer]')){const kind=el.dataset.layer;const yes=allowedLayer(kind);el.disabled=!yes;if(!yes)el.checked=false;}for(const [name,objects] of Object.entries(state.sceneObjects)){for(const o of objects||[]) o.show=selected(name)}updateSatellite();updateTerrainVisibility();updateHeatVisibility();}
function color(hex,alpha=1){return C().Color.fromCssColorString(hex).withAlpha(alpha)}
function pointPosition(p){return C().Cartesian3.fromDegrees(+p.lon,+p.lat,(+p.elevation_m||0))}
function clearScene(){if(!state.viewer)return;state.viewer.entities.removeAll();state.sceneObjects={};}
function store(name,entity){(state.sceneObjects[name] ||= []).push(entity);return entity}
function makeEntity(name,opt){return store(name,state.viewer.entities.add(opt))}
function addBoundary(){const b=state.scene.boundary; if(!b?.geometry)return;const shapes=b.geometry.type==='Polygon'?[b.geometry.coordinates]:b.geometry.type==='MultiPolygon'?b.geometry.coordinates:[];
 for(const shape of shapes){const outer=shape[0]||[];if(outer.length<4)continue;const pts=outer.flatMap(coord=>[coord[0],coord[1]]);makeEntity('boundary',{name:'Límite del área',polygon:{hierarchy:C().Cartesian3.fromDegreesArray(pts),material:color('#69db85',0.075),outline:true,outlineColor:color('#a2ff9d',.86),height:0,heightReference:C().HeightReference.CLAMP_TO_GROUND},polyline:{positions:C().Cartesian3.fromDegreesArray(pts),clampToGround:true,width:2.7,material:color('#b4f8ae',.95)}})} }
function addEnvironment(){const S=state.scene;
 if(S.boundary)addBoundary();
 for(const s of S.risk||[]){const intensity=Math.max(0,Math.min(1,+s.score||0));const hue=intensity>.79?'#e03424':intensity>.55?'#f37a24':intensity>.32?'#ffd34b':'#73b92a';makeEntity('risk',{name:'Zona de riesgo',position:pointPosition(s),ellipse:{semiMinorAxis:+s.radius_m||90,semiMajorAxis:+s.radius_m||90,material:color(hue,.30),outline:true,outlineColor:color(hue,.36),heightReference:C().HeightReference.CLAMP_TO_GROUND}})}
 for(const s of S.canopy||[]){let h=+s.height_m||0;let cl=h>=30?'#145c43':h>=20?'#2e9a54':h>=10?'#81c85d':'#e1d965';makeEntity('canopy',{name:`Dosel estimado ${h.toFixed(1)} m`,position:pointPosition(s),ellipse:{semiMajorAxis:s.radius_m||45,semiMinorAxis:s.radius_m||45,material:color(cl,.52),heightReference:C().HeightReference.CLAMP_TO_GROUND},properties:{height_m:h}})}
 for(const p of S.forest||[]){makeEntity('forest',{name:'Bosque',position:pointPosition(p),ellipse:{semiMajorAxis:p.radius_m||70,semiMinorAxis:p.radius_m||70,material:color('#2e8d4e',.21),heightReference:C().HeightReference.CLAMP_TO_GROUND}})}
 for(const p of S.loss||[]){const ent=makeEntity('loss',{name:`Pérdida forestal ${p.year}`,position:pointPosition(p),ellipse:{semiMajorAxis:p.radius_m||50,semiMinorAxis:p.radius_m||50,material:color('#fc4431',.60),heightReference:C().HeightReference.CLAMP_TO_GROUND}});ent._geoalertYear=+p.year||0;}
 }
function makeStation(s,base=false){const code=s.id||'?';const shade=base?'#f05045':'#ffcf45';const point=pointPosition(s);const entity=makeEntity(base?'base':'stations',{
 id:code, name:base?`Base ${code}`:`Estación ${code}`,position:point,
 point:{heightReference:C().HeightReference.CLAMP_TO_GROUND,pixelSize:base?18:14,color:color(shade),outlineColor:color('#fff2ad'),outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},
 label:{heightReference:C().HeightReference.CLAMP_TO_GROUND,text:base?(s.name||'BASE_00'):code,font:'600 17px DM Sans, sans-serif',fillColor:color('#f5faff'),outlineColor:color('#07151b'),outlineWidth:3,style:C().LabelStyle.FILL_AND_OUTLINE,verticalOrigin:C().VerticalOrigin.BOTTOM,pixelOffset:new (C().Cartesian2)(0,-22),disableDepthTestDistance:Number.POSITIVE_INFINITY,scaleByDistance:new (C().NearFarScalar)(800,1,40000,.52)},
 properties:{kind:'station',sid:code,lat:+s.lat,lon:+s.lon,elevation_m:s.elevation_m??null,role:base?'base':'station',risk:s.risk??null}}
 );return entity;}
function drawProfile(points){const svg=$('profile');svg.innerHTML='';if(!Array.isArray(points)||points.length<2){svg.innerHTML='<text x="250" y="60" text-anchor="middle" fill="#98aab1" font-size="13">Perfil DEM aún no disponible</text>';return;}
 const heights=points.map(p=>+p.elevation_m).filter(Number.isFinite);if(heights.length<2){svg.innerHTML='<text x="250" y="60" text-anchor="middle" fill="#98aab1" font-size="13">Perfil DEM aún no disponible</text>';return;}
 const min=Math.min(...heights)-25,max=Math.max(...heights)+25;const x0=40,x1=490,y0=12,y1=94;const xy=points.map((p,i)=>[x0+(x1-x0)*i/(points.length-1),y1-(+p.elevation_m-min)/(max-min)*(y1-y0)]);const d=xy.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');const poly=`${d} L${x1} ${y1} L${x0} ${y1}Z`;svg.innerHTML=`<line x1="40" y1="94" x2="490" y2="94" stroke="#526673"/><path d="${poly}" fill="#64b530" fill-opacity=".45"/><path d="${d}" fill="none" stroke="#d6df41" stroke-width="2.4"/><text x="3" y="22" font-size="11" fill="#c4d7df">${Math.round(max)}m</text><text x="3" y="92" font-size="11" fill="#c4d7df">${Math.round(min)}m</text>`;
 }
function chooseLink(link){if(!link)return;$('profileName').textContent=`${link.from} → ${link.to}`;drawProfile(link.profile||[]);}

// Version 0.2.2: mapas transparentes, dibujados sobre el terreno real.
// IMPORTANTE: los PNG son proxies geométricos de cercanía, NO potencia RF ni detección acústica validada.
function heatAlpha(){return Number($('heatOpacity')?.value||70)/100}
function updateHeatVisibility(){
 for(const [name,layer] of Object.entries(state.heatLayers)){
    if(!layer)continue;
    layer.show=selected(name);
    layer.alpha=heatAlpha();
 }
}
async function updateHeatLayers(){
 const seq=++state.heatSeq;
 for(const layer of Object.values(state.heatLayers)){
   try{state.viewer.imageryLayers.remove(layer,true)}catch(e){console.warn('No se retiró una cobertura anterior',e)}
 }
 state.heatLayers={};
 const scenario=state.scene?.scenarios?.[state.scenario];
 if(!scenario||!state.viewer)return;
 for(const [kind,layerName] of [['acoustic','acousticHeat'],['radio','radioHeat']]){
   const info=scenario.heatmaps?.[kind];
   if(!info?.url||!Array.isArray(info.bounds)||info.bounds.length!==4)continue;
   try{
     const b=info.bounds.map(Number);
     if(!b.every(Number.isFinite)||b[0]>=b[2]||b[1]>=b[3])throw Error('Extensión inválida');
     const rectangle=C().Rectangle.fromDegrees(...b);
     // Cesium carga el PNG sobre una malla WGS84 y lo adapta al relieve 3D.
     const provider=await C().SingleTileImageryProvider.fromUrl(info.url,{rectangle});
     if(seq!==state.heatSeq)return;
     const layer=state.viewer.imageryLayers.addImageryProvider(provider);
     state.heatLayers[layerName]=layer;
     layer.alpha=heatAlpha();
     layer.show=selected(layerName);
   }catch(error){console.warn(`Mapa de calor ${kind} no disponible:`,error);notify(`No se pudo cargar la cobertura ${kind}.`,5600)}
 }
 updateHeatVisibility();
}

function addScenario(){const s=state.scene.scenarios[state.scenario]; if(!s){notify('Escenario no incluido en el conjunto de datos');return;}
 for(const item of state.activeSceneEntities)state.viewer.entities.remove(item);state.activeSceneEntities=[];
 for(const key of ['stations','links','acoustic','base'])state.sceneObjects[key]=[];
 if(s.base) {makeStation(s.base,true)};
 for(const n of s.stations||[]){makeStation(n); if(n.acoustic_radius_m || s.acoustic_radius_m)makeEntity('acoustic',{name:`Cobertura hipotética ${n.id}`,position:pointPosition(n),ellipse:{semiMajorAxis:n.acoustic_radius_m||s.acoustic_radius_m,semiMinorAxis:n.acoustic_radius_m||s.acoustic_radius_m,material:color('#54c54e',.19),outline:true,outlineColor:color('#8be662',.53),heightReference:C().HeightReference.CLAMP_TO_GROUND}})}
 const byId=new Map((s.stations||[]).concat(s.base?[s.base]:[]).map(a=>[a.id,a]));
 for(const l of s.links||[]){const a=byId.get(l.from),b=byId.get(l.to);if(!a||!b)continue;const link=makeEntity('links',{name:`Enlace ${l.from} – ${l.to}`,polyline:{positions:[pointPosition(a),pointPosition(b)],clampToGround:true,width:3,material:color('#ffcf3c',.9)},properties:{kind:'link',from:l.from,to:l.to,distance_m:l.distance_m||null}});link._geoalertLink=l;}
 state.activeSceneEntities=[...(state.sceneObjects.stations||[]),...(state.sceneObjects.links||[]),...(state.sceneObjects.acoustic||[]),...(state.sceneObjects.base||[])];
 $('stationDetail').textContent=`${s.stations?.length||0} estaciones ${isSynthetic()?'simuladas':'calculadas'}`;
 $('radiusParameter').textContent=`${s.acoustic_radius_m||150} m (hipótesis)`;
 $('linkParameter').textContent=`${s.max_link_m||500} m (cribado)`;
 $('modelParameter').textContent=s.status||'Pendiente';
 document.querySelectorAll('[data-scenario]').forEach(el=>el.classList.toggle('selected',el.dataset.scenario===state.scenario));
 $('detail').hidden=true;chooseLink(s.links?.find(l=>l.profile?.length)||s.links?.[0]);
 updateLayers();renderMinimap();void updateHeatLayers();
 }
function displayDetail(entity){const p=entity?.properties;if(!p)return;
 const get=name=>{const prop=p[name];return prop?.getValue?prop.getValue(C().JulianDate.now()):prop};
 if(get('kind')==='link'){const link=entity._geoalertLink;chooseLink(link);notify(`Enlace ${link.from} → ${link.to}: ${link.distance_m?Math.round(link.distance_m)+' m':'distancia no calculada'}`);return;}
 if(get('kind')!=='station')return;const id=get('sid');$('detailTitle').textContent=id==='BASE_00'?'Base de la red':`Estación ${id}`;
 const rows=[["Código",id],["Tipo",get('role')==='base'?'Gateway':'Sensor ecoacústico'],["Latitud",isSynthetic()?'—':(+get('lat')).toFixed(6)],["Longitud",isSynthetic()?'—':(+get('lon')).toFixed(6)],["Elevación",get('elevation_m')!=null?`${Math.round(get('elevation_m'))} m`:'Sin DEM'],["Escenario",state.scenario==='six'?'Seis nodos':'Red mínima'],["Estado",isSynthetic()?'SIMULADO':'Modelo no calibrado']];
 $('detailRows').replaceChildren();for(const [label,val] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(val);$('detailRows').append(dt,dd)}
 $('detailFoot').textContent=isSynthetic()?'Geometría ilustrativa. Esta ubicación no corresponde a una estación real.':'La posición procede del escenario generado en Python; revisar permisos de divulgación antes de compartir.';$('detail').hidden=false;
 }
function renderMinimap(){const s=state.scene?.scenarios?.[state.scenario];if(!s)return;const nodes=[...(s.stations||[]),...(s.base?[s.base]:[])];if(!nodes.length)return;const lons=nodes.map(p=>p.lon),lats=nodes.map(p=>p.lat),lon0=Math.min(...lons)-.008,lon1=Math.max(...lons)+.008,lat0=Math.min(...lats)-.008,lat1=Math.max(...lats)+.008;const xy=p=>[(p.lon-lon0)/(lon1-lon0)*270+10,135-(p.lat-lat0)/(lat1-lat0)*120];const map=new Map(nodes.map(n=>[n.id,n]));let svg='<svg viewBox="0 0 294 143" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L120 0 156 27 230 5 294 41 294 143 230 143 178 112 70 143 0 111Z" fill="#5e8c5a" fill-opacity=".35"/><path d="M25 130L56 38 124 89 177 45 270 10" fill="none" stroke="#b3d194" stroke-width="2" stroke-opacity=".4"/>';
 for(const l of s.links||[]){if(!map.has(l.from)||!map.has(l.to))continue;const a=xy(map.get(l.from)),b=xy(map.get(l.to));svg+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#f8d141" stroke-width="1.5"/>`}
 for(const p of nodes){const a=xy(p);svg+=`<circle cx="${a[0]}" cy="${a[1]}" r="${p.id==='BASE_00'?5:3.5}" stroke="#fff" stroke-width="1" fill="${p.id==='BASE_00'?'#e75a46':'#f6cf46'}"/>`}
 $('minimapPlot').innerHTML=svg+'</svg>';}
function timeControls(){const loss=state.scene.loss||[];if(!loss.length){$('timeStatus').textContent='Serie temporal no cargada';$('playTime').disabled=true;$('year').disabled=true;return;}
 const years=loss.map(d=>+d.year).filter(Number.isFinite);if(!years.length)return;$('year').min=String(Math.min(...years));$('year').max=String(Math.max(...years));$('year').value=$('year').max;$('year').disabled=false;$('playTime').disabled=false;$('timeStatus').textContent='Pérdida forestal · años de datos';document.querySelector('.year-ends span').textContent=$('year').min;updateYear();}
function updateYear(){$('yearValue').textContent=$('year').value;const yr=+$('year').value;for(const e of state.sceneObjects.loss||[])e.show=selected('loss')&&e._geoalertYear<=yr;}
function stopTime(){if(state.timeInterval){clearInterval(state.timeInterval);state.timeInterval=null;$('playTime').textContent='▶'}}
function zoom(factor){const v=state.viewer;if(!v)return;const mag=v.camera.positionCartographic.height||1200;v.camera.moveForward(mag*factor)}
function home(duration=2.4){if(!state.viewer||!state.scene)return;const S=state.scene;state.viewer.camera.flyTo({destination:C().Cartesian3.fromDegrees(S.center.lon,S.center.lat,S.camera?.height_m||9200),orientation:{heading:C().Math.toRadians(S.camera?.heading||25),pitch:C().Math.toRadians(S.camera?.pitch||-48),roll:0},duration});}
function flyToStation(id){const s=state.scene.scenarios[state.scenario],n=[...s.stations,s.base].find(x=>x?.id.toLowerCase()===id.toLowerCase());if(!n){notify(`No encuentro «${id}» en este escenario.`);return;}state.viewer.camera.flyTo({destination:C().Cartesian3.fromDegrees(n.lon,n.lat,(+n.elevation_m||2000)+1000),orientation:{heading:0,pitch:C().Math.toRadians(-55),roll:0},duration:2});}
function orbit(){if(state.orbiting){state.orbiting=false;$('orbit').textContent='▶ Iniciar vuelo panorámico';if(state.orbitTick)state.viewer.clock.onTick.removeEventListener(state.orbitTick);state.orbitTick=null;return;}
 state.orbiting=true;$('orbit').textContent='■ Detener vuelo panorámico';home(2);const pivot=C().Cartesian3.fromDegrees(state.scene.center.lon,state.scene.center.lat,2300);let first=0;state.orbitTick=()=>{if(!state.orbiting)return; if(!first){first=Date.now();return}state.viewer.camera.rotateRight(.00043)};state.viewer.clock.onTick.addEventListener(state.orbitTick);}
async function loadTerrainArcgis(){try{const provider=await C().ArcGISTiledElevationTerrainProvider.fromUrl('https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer');state._terrainProvider=provider;state.viewer.terrainProvider=provider;state.terrainAvailable=true;$('terrainDetail').textContent='ArcGIS Elevation · 3D real';updateStatus('Terreno 3D ArcGIS activo');}catch(err){state.terrainAvailable=false;$('terrainDetail').textContent='Globo básico · activar proveedor';updateStatus('Sin terreno externo. Actívalo en Herramientas.');console.warn('GeoAlerta terreno externo no disponible:',err.message)} updateTerrainVisibility()}
async function loadSatellite(){try{const provider=await C().ArcGisMapServerImageryProvider.fromUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer');state.imagery=state.viewer.imageryLayers.addImageryProvider(provider);state.imagery.show=selected('satellite');}catch(err){console.warn('Imagen ArcGIS no disponible:',err);try{state.imagery=state.viewer.imageryLayers.addImageryProvider(new (C().OpenStreetMapImageryProvider)({url:'https://tile.openstreetmap.org/'}))}catch(e){notify('No se pudo obtener el mapa base: verifica Internet.')}}}
function updateSatellite(){if(state.imagery)state.imagery.show=selected('satellite')}
function updateTerrainVisibility(){if(!state.viewer)return;state.viewer.terrainProvider=selected('terrain') && state.terrainAvailable && state._terrainProvider?state._terrainProvider:new (C().EllipsoidTerrainProvider)();}
async function activateIon(){const token=$('ionToken').value.trim();if(!token){notify('Introduce un token de Cesium ion restringido a este sitio.');return}try{C().Ion.defaultAccessToken=token;const provider=await C().createWorldTerrainAsync();state._terrainProvider=provider;state.terrainAvailable=true;$('terrainDetail').textContent='Cesium World Terrain · 3D real';$('ionToken').value='';document.querySelector('[data-layer="terrain"]').checked=true;updateTerrainVisibility();notify('Cesium World Terrain activado.');home(1);}catch(err){notify('No se pudo activar Cesium ion: comprueba token y permisos.');console.warn(err)}}
function initUI(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(e=>e.classList.toggle('on',e===b));document.querySelectorAll('.pane').forEach(e=>e.classList.toggle('on',e.id===`pane-${b.dataset.tab}`))}));
 document.querySelectorAll('input[data-layer]').forEach(el=>el.addEventListener('change',()=>{if(el.dataset.layer==='loss')updateYear();else updateLayers()}));
 $('heatOpacity').addEventListener('input',()=>{const n=heatAlpha();$('heatOpacityLabel').textContent=`${Math.round(n*100)} %`;updateHeatVisibility()});
 document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',()=>{state.scenario=b.dataset.scenario;addScenario()}));
 $('zoomIn').addEventListener('click',()=>zoom(.35));$('zoomOut').addEventListener('click',()=>zoom(-.45));$('north').addEventListener('click',()=>state.viewer?.camera.flyTo({destination:state.viewer.camera.position,orientation:{heading:0,pitch:C().Math.toRadians(-60),roll:0},duration:1.2}));
 $('goHome').addEventListener('click',()=>home());$('locate').addEventListener('click',()=>home());$('orbit').addEventListener('click',orbit);$('useIon').addEventListener('click',activateIon);
 $('search').addEventListener('keydown',e=>{if(e.key==='Enter'){flyToStation(e.currentTarget.value.trim());e.currentTarget.blur()}});
 $('closeDetail').addEventListener('click',()=>$('detail').hidden=true);$('year').addEventListener('input',updateYear);
 $('playTime').addEventListener('click',()=>{if(state.timeInterval){stopTime();return;}$('playTime').textContent='■';if(+$('year').value>=+$('year').max)$('year').value=$('year').min;updateYear();state.timeInterval=setInterval(()=>{if(+$('year').value>=+$('year').max){stopTime();return}$('year').value=+$('year').value+1;updateYear()},350)});
 $('help').addEventListener('click',()=>$('about').hidden=false);$('closeHelp').addEventListener('click',()=>$('about').hidden=true);$('about').addEventListener('click',e=>{if(e.target===$('about'))$('about').hidden=true});
 $('capture').addEventListener('click',()=>{try{state.viewer.render();const a=document.createElement('a');a.download='GeoAlerta_v0.2.2.png';a.href=state.viewer.canvas.toDataURL('image/png');a.click()}catch(err){notify('La captura está bloqueada por el navegador o el proveedor de imágenes.')}});
 }
function applySceneLabels(){const S=state.scene;const synthetic=isSynthetic();$('dataTag').textContent=synthetic?'VISTA DEMO · NO OPERATIVA':'VISOR INTERNO · DATOS DE MODELO';$('dataTag').classList.toggle('demo',synthetic);$('demoBanner').hidden=!synthetic;
 $('boundaryDetail').textContent=synthetic?'Polígono ficticio':'Límite procesado';$('baseDetail').textContent=synthetic?'Base ficticia':'Base en escenario interno';$('riskDetail').textContent=synthetic?'Riesgo ilustrativo':'Predicción sin calibrar';$('forestDetail').textContent=(S.forest||[]).length?'Capa del proyecto':'No descargada';$('canopyDetail').textContent=(S.canopy||[]).length?'ETH 2020 · estimación':'Sin datos de dosel';$('lossDetail').textContent=(S.loss||[]).length?'Serie del proyecto':'Sin serie temporal';$('aboutSource').textContent=`Origen: ${S.provenance||'No declarado'}. Calor acústico y LoRa: solo cercanía geométrica sin propagación ni calibración de campo.`;
 }
async function initialize(){initUI(); try{const response=await fetch('data/scene.json',{cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status}`);state.scene=await response.json();if(state.scene.schema!=='geoalerta.scene.v2'||!['synthetic_demo','internal_only'].includes(state.scene.classification))throw Error('Esquema o clasificación inválidos');if(state.scene.classification==='internal_only'&&document.body.dataset.public==='true')throw Error('DATOS INTERNOS NO PUEDEN PUBLICARSE EN GITHUB PAGES');}catch(err){$('loading').innerHTML=`<strong>No se pudieron cargar los datos del visor</strong><span>${String(err.message)}</span><span>Ejecuta un servidor local, no abras index.html con file://</span>`;return;}
 if(!window.Cesium){$('loading').innerHTML='<strong>CesiumJS no cargó</strong><span>Comprueba tu conexión a Internet y recarga.</span>';return;}
 applySceneLabels();window.CESIUM_BASE_URL='https://cdn.jsdelivr.net/npm/cesium@1.136.0/Build/Cesium/';
 try {state.viewer=new (C().Viewer)('world',{baseLayerPicker:false,baseLayer:false,terrainProvider:new (C().EllipsoidTerrainProvider)(),timeline:false,animation:false,homeButton:false,geocoder:false,selectionIndicator:false,infoBox:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,requestRenderMode:false,contextOptions:{webgl:{preserveDrawingBuffer:true}}});state.viewer.scene.globe.enableLighting=false;state.viewer.scene.globe.depthTestAgainstTerrain=false;state.viewer.scene.skyAtmosphere.show=true;state.viewer.scene.globe.baseColor=color('#244a45');state.viewer.selectedEntityChanged.addEventListener(displayDetail);state.viewer.canvas.addEventListener('click',()=>{});}
 catch(err){$('loading').innerHTML='<strong>El navegador no pudo iniciar CesiumJS</strong><span>Se necesita WebGL habilitado.</span>';console.error(err);return;}
 await loadSatellite();addEnvironment();addScenario();timeControls();home(0);$('loading').style.opacity='0';setTimeout(()=>$('loading').remove(),320);
 await loadTerrainArcgis();updateTerrainVisibility();
 if(isSynthetic())notify('DEMO: geometrías, estaciones y riesgos ficticios. Se requiere el procesamiento real para obtener resultados científicos.',7000);
}
window.addEventListener('DOMContentLoaded',initialize);
