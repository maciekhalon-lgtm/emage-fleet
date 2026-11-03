/* Emage FLEET — baza: Supabase (tabele, zmiany na żywo, zapisy, pliki) */
'use strict';
const sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true},
});

/* nazwa w aplikacji → tabela w bazie */
const TABLES = {vehicles:'vehicles', drivers:'drivers', deadlines:'deadlines', bookings:'bookings', costs:'costs', issues:'issues', docs:'documents', settings:'settings', requests:'data_change_requests', crewChanges:'crew_changes', routes:'routes', serviceEntries:'service_entries', members:'profiles'};
const COL_OF = Object.fromEntries(Object.entries(TABLES).map(([a, b]) => [b, a]));

/* pole w aplikacji → kolumna w bazie */
const FIELDS = {
  common:    {createdBy:'created_by', createdAt:'created_at', updatedBy:'updated_by', updatedAt:'updated_at'},
  vehicles:  {driverId:'driver_id', monthlyLimit:'monthly_limit', consGood:'cons_good', consOk:'cons_ok', policyNo:'policy_no', hasTacho:'has_tacho'},
  drivers:   {name:'full_name', licenseExpiry:'license_expiry', medicalExpiry:'medical_expiry', psychExpiry:'psych_expiry'},
  crewChanges: {vehicleId:'vehicle_id', bookingId:'booking_id', newBookingId:'new_booking_id', fromDriverId:'from_driver_id', fromCoDriverId:'from_co_driver_id', toDriverId:'to_driver_id'},
  deadlines: {vehicleId:'vehicle_id', kmDue:'km_due', intervalMonths:'interval_months', intervalKm:'interval_km', remindKm:'remind_km'},
  serviceEntries: {vehicleId:'vehicle_id', oilChange:'oil_change', deadlineId:'deadline_id', issueIds:'issue_ids', costId:'cost_id', assetId:'storage_path', fileName:'file_name', contentType:'content_type'},
  bookings:  {vehicleId:'vehicle_id', driverId:'driver_id', routeId:'route_id', from:'date_from', to:'date_to', coDriverId:'co_driver_id', pickupConfirmedAt:'pickup_confirmed_at', returnConfirmedAt:'return_confirmed_at', disputeStage:'dispute_stage', disputeNote:'dispute_note', disputeAt:'dispute_at', disputeResolvedAt:'dispute_resolved_at'},
  costs:     {vehicleId:'vehicle_id', driverId:'driver_id', routeId:'route_id', amountOrig:'amount_orig', fxRate:'fx_rate', fxDate:'fx_date', fxTable:'fx_table', fxManual:'fx_manual', full:'full_tank', coDriverId:'co_driver_id', confirmStatus:'confirm_status', confirmedAt:'confirmed_at', disputeNote:'dispute_note'},
  issues:    {vehicleId:'vehicle_id', repairNote:'repair_note', resolvedAt:'resolved_at'},
  docs:      {vehicleId:'vehicle_id', validUntil:'valid_until', assetId:'storage_path', fileName:'file_name', contentType:'content_type', size:'size_bytes'},
  members:   {driverId:'driver_id'},
  requests:  {driverId:'driver_id', oldValue:'old_value', newValue:'new_value', decidedAt:'decided_at', decidedBy:'decided_by'},
};
/* kolumny, które aplikacja może zapisywać (reszta ustawia baza) */
const WRITABLE = {
  vehicles:  ['id','plate','make','model','year','vin','fuel','km','driver_id','status','monthly_limit','notes','cons_good','cons_ok','policy_no','has_tacho'],
  drivers:   ['id','full_name','phone','categories','license_expiry','medical_expiry','psych_expiry','active'],
  crewChanges: [],
  routes:    ['id','code','name','tacho','loading','active','note'],
  deadlines: ['id','vehicle_id','type','date','km_due','interval_months','interval_km','remind_km','note'],
  serviceEntries: ['id','vehicle_id','date','km','workshop','description','cost','oil_change','deadline_id','issue_ids','note','storage_path','file_name','content_type'],
  bookings:  ['id','vehicle_id','driver_id','date_from','date_to','purpose','route_id','pickup_at','pickup_km','pickup_fuel','pickup_note','pickup_photos','pickup_by','pickup_checklist','return_at','return_km','return_fuel','return_note','return_photos','return_by','co_driver_id'],
  costs:     ['id','date','vehicle_id','driver_id','category','amount','liters','odometer','full_tank','note','photos','co_driver_id','confirm_status','currency','amount_orig','fx_rate','fx_manual','station'],
  issues:    ['id','vehicle_id','title','description','severity','status','date','km','repair_note','resolved_at','photos'],
  docs:      ['id','vehicle_id','kind','name','valid_until','storage_path','file_name','content_type','size_bytes'],
  settings:  ['key','value'],
  requests:  ['id','driver_id','field','old_value','new_value','status'],
  members:   ['status','role','driver_id','approved_at','approved_by','full_name'],
};
const fieldMap = col => ({...FIELDS.common, ...(FIELDS[col] || {})});

function toApp(col, r){
  if (!r) return r;
  if (col==='settings') return {id: r.key, ...(r.value || {}), updatedAt: r.updated_at};
  const inv = Object.fromEntries(Object.entries(fieldMap(col)).map(([a, b]) => [b, a]));
  const o = {};
  for (const [k, v] of Object.entries(r)) o[inv[k] || k] = v;
  if (col==='bookings'){
    const part = p => r[p+'km']==null ? null : {at: r[p+'at'], km: r[p+'km'], fuel: r[p+'fuel']==null ? '' : String(r[p+'fuel']), note: r[p+'note'] || '', photos: r[p+'photos'] || [], by: r[p+'by'], checklist: p==='pickup_' ? (r.pickup_checklist || []) : undefined};
    o.pickup = part('pickup_'); o.returned = part('return_');
  }
  return o;
}
function toDb(col, o){
  if (col==='settings'){ const {id, updatedAt, updatedBy, createdBy, ...rest} = o; return {key: id, value: rest}; }
  const m = fieldMap(col), out = {};
  for (const [k, v] of Object.entries(o)){
    if (col==='bookings' && (k==='pickup' || k==='returned')){
      const p = k==='pickup' ? 'pickup_' : 'return_';
      out[p+'at'] = v ? v.at : null; out[p+'km'] = v ? v.km : null;
      out[p+'fuel'] = v && v.fuel!=='' && v.fuel!=null ? Number(v.fuel) : null;
      out[p+'note'] = v && v.note ? v.note : null; out[p+'photos'] = v ? (v.photos || []) : [];
      out[p+'by'] = v ? (v.by || myId) : null;
      if (k==='pickup') out.pickup_checklist = v ? (v.checklist || []) : [];
      continue;
    }
    out[m[k] || k] = v==='' ? null : v;
  }
  for (const k of Object.keys(out)) if (!WRITABLE[col].includes(k)) delete out[k];
  return out;
}

/* błędy bazy → komunikaty dla ludzi */
const CHECK_MSG = {
  fuel_needs_odometer: 'Przy tankowaniu wpisz stan licznika i ilość paliwa.',
  return_after_pickup: 'Stan licznika przy zwrocie nie może być niższy niż przy wydaniu.',
  dates_ok: 'Data końca jest wcześniejsza niż początek.',
  active_needs_role: 'Najpierw wybierz rolę dla tej osoby.',
};
function dbErr(e){
  const msg = e && e.message || '';
  if (e && (e.code==='42501' || /row-level security/i.test(msg))) return {code:'invalid_argument', message:msg};
  if (e && e.code==='23505') return {code:'duplicate', message: /plate/.test(msg) ? 'Pojazd o takim numerze rejestracyjnym już jest w ewidencji.' : /routes_code/.test(msg) ? 'Trasa o takim kodzie już istnieje.' : 'Taki wpis już istnieje.'};
  if (e && (e.code==='23514' || e.code==='P0001')){
    const c = Object.keys(CHECK_MSG).find(k => msg.includes(k));
    return {code:'check', message: c ? CHECK_MSG[c] : msg};
  }
  if (e && e.code==='23503') return {code:'check', message:'Ten wpis jest powiązany z innymi danymi.'};
  return {code:'unavailable', message: msg};
}

/* Interfejs zapisu używany przez moduły: db.collection(x).doc(id).set / update / delete */
function docRef(col, id){
  const table = TABLES[col], key = col==='settings' ? 'key' : 'id';
  return {
    id,
    async set(data){
      const row = toDb(col, {...data, id});
      const exists = col==='settings' ? S.settings.some(x => x.id===id) : S[col] && S[col].some(x => x.id===id);
      const q = exists ? sb.from(table).update(row).eq(key, id) : sb.from(table).insert(row);
      const {error} = await q;
      if (error) throw dbErr(error);
      await refresh(col);
    },
    async update(data){
      const row = toDb(col, data); delete row.id; delete row.key;
      const {error, count} = await sb.from(table).update(row, {count:'exact'}).eq(key, id);
      if (error) throw dbErr(error);
      if (count===0) throw {code:'invalid_argument', message:'Brak uprawnień do zmiany tego wpisu.'};
      await refresh(col);
    },
    async delete(){
      const {error} = await sb.from(table).delete().eq(key, id);
      if (error) throw dbErr(error);
      await refresh(col);
    },
  };
}
const dbApi = {collection: col => ({doc: id => docRef(col, id || crypto.randomUUID())})};

/* ---------- wczytywanie i odświeżanie ---------- */
let pending = false;
const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => {
  pending = false;
  const a = document.activeElement;
  // nie przerywaj pisania w polu na stronie – odśwież, gdy użytkownik skończy
  if (a && a.id!=='search' && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest && a.closest('#view')){ setTimeout(schedule, 1500); return; }
  if (a && a.id==='search'){ const pos = a.selectionStart; render(); const s = $('#search'); if (s){ s.focus(); s.setSelectionRange(pos, pos); } }
  else render();
}); };
const syncEl = () => $('#sync');
function setSync(cls, txt){ const el = syncEl(); if (!el) return; el.className = 'sync '+cls; el.querySelector('span').textContent = txt; }

S.fuelAll = [];
async function refresh(col){
  const table = TABLES[col]; if (!table) return;
  if ((col==='members' || col==='crewChanges') && !P().manage) return;
  if (col==='serviceEntries' && !P().service) return;
  const {data, error} = await sb.from(table).select('*').limit(10000);
  if (error){ got[col] = true; return; }
  if (col==='members') profiles = data;
  else S[col] = data.map(r => toApp(col, r));
  got[col] = true;
  if (col==='costs' && P().costs==='own') await refreshFuelAll();
  schedule();
}
async function refreshFuelAll(){
  const {data} = await sb.rpc('fuel_fills');
  S.fuelAll = (data || []).map(r => ({id:r.id, vehicleId:r.vehicle_id, date:r.date, category:r.category, odometer:r.odometer, liters:Number(r.liters), full:r.full_tank, driverId:r.driver_ref || ''}));
}
async function refreshNames(){
  const {data} = await sb.rpc('people');
  (data || []).forEach(p => { names[p.id] = p.full_name; });
}
let LOG_LOADED = false;
async function refreshLog(){
  if (!P().history) return;
  const {data} = await sb.from('change_log').select('*').order('at', {ascending:false}).limit(300);
  LOG = (data || []).map(r => {
    const col = COL_OF[r.entity] || r.entity;
    const d = toApp(col, r.data || {});
    return {id:r.id, at:r.at, by:r.actor, action: r.action==='insert' ? 'add' : r.action==='update' ? 'edit' : 'delete', col, label: labelFor(col, d), vehicleId:r.vehicle_id, docId:r.entity_id, targetId: col==='members' ? r.entity_id : null};
  });
  LOG_LOADED = true;
  if (tab==='historia') schedule();
}

const timers = {};
function queueRefresh(col){
  clearTimeout(timers[col]);
  timers[col] = setTimeout(() => { refresh(col); if (P().history) refreshLog(); }, 400);
}

let channel = null;
async function loadAll(){
  db = dbApi;
  setSync('', 'Wczytywanie danych…');
  const cols = [...COLS, ...(P().manage ? ['members'] : [])];
  await Promise.all([...cols.map(refresh), refreshNames(), refreshLog()]);
  if (P().costs==='own') await refreshFuelAll();
  dbState = 'live'; setSync('live', 'Dane na żywo');
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('zmiany');
  Object.values(TABLES).forEach(t => channel.on('postgres_changes', {event:'*', schema:'public', table:t}, p => {
    const col = COL_OF[p.table];
    if (col==='members' || p.table==='profiles'){ onProfileChange(p); return; }
    queueRefresh(col);
  }));
  channel.subscribe(status => {
    if (status==='SUBSCRIBED') setSync('live', 'Dane na żywo');
    else if (status==='CHANNEL_ERROR' || status==='TIMED_OUT'){ setSync('err', 'Odświeżanie na żywo wstrzymane'); }
  });
  if (P().manage) sb.rpc('prune_change_log').then(() => {}, () => {});
  schedule();
}
function onProfileChange(p){
  const row = p.new && p.new.id ? p.new : p.old;
  if (row && me && row.id===me.id) reloadMe();
  if (P().manage) queueRefresh('members');
  refreshNames().then(schedule);
}

/* ---------- pliki: Supabase Storage, prywatny magazyn 'pliki' ---------- */
const BUCKET = 'pliki';
const storageApi = {
  async upload(file, opts = {}){
    const ext = ((file.name || '').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${myId}/${crypto.randomUUID()}.${ext}`;
    const {error} = await sb.storage.from(BUCKET).upload(path, file, {contentType: opts.type || file.type, upsert:false});
    if (error) throw {code: /size|large/i.test(error.message) ? 'too_big' : 'upload', message:error.message};
    return {id:path, contentType: opts.type || file.type, sizeBytes:file.size};
  },
  async delete(path){ await sb.storage.from(BUCKET).remove([path]); },
};
const urlCache = new Map();
async function hydrateFiles(root){
  if (!root) return;
  const els = [...root.querySelectorAll('[data-file]')];
  if (!els.length) return;
  const now = Date.now();
  const need = [...new Set(els.map(e => e.dataset.file))].filter(p => !(urlCache.get(p) && urlCache.get(p).exp > now));
  if (need.length){
    const {data} = await sb.storage.from(BUCKET).createSignedUrls(need, 3600);
    (data || []).forEach(d => { if (d.signedUrl) urlCache.set(d.path, {url:d.signedUrl, exp: now + 3500e3}); });
  }
  els.forEach(e => {
    const c = urlCache.get(e.dataset.file); if (!c) return;
    if (e.tagName==='IMG'){ if (e.src !== c.url) e.src = c.url; } else e.href = c.url;
  });
}
