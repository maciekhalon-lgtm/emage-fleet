/* Emage FLEET — baza: Supabase (tabele, zmiany na żywo, zapisy, pliki) */
'use strict';
const sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true},
});
/* Podgląd jako kierowca: każdy zapis do bazy kończy się błędem „tylko do oglądania” (odczyty działają normalnie) */
const VIEWAS_MSG = 'Podgląd jako kierowca – tylko do oglądania, zmiany są zablokowane.';
(() => {
  const res = {data: null, error: {message: VIEWAS_MSG, code: 'viewas'}, count: 0};
  const stub = () => { const p = new Proxy(function(){}, {get: (t, k) => k==='then' ? (ok, bad) => Promise.resolve(res).then(ok, bad) : () => p, apply: () => p}); return p; };
  const from = sb.from.bind(sb), rpc = sb.rpc.bind(sb), READ_RPC = ['people', 'nbp_rate', 'fuel_fills'];
  sb.from = t => { const q = from(t); if (viewAs) ['insert', 'update', 'upsert', 'delete'].forEach(m => { q[m] = stub; }); return q; };
  sb.rpc = (n, a, o) => viewAs && !READ_RPC.includes(n) ? stub() : rpc(n, a, o);
})();

/* nazwa w aplikacji → tabela w bazie */
const TABLES = {workEvents:'work_events', kmAssign:'km_assignments', waybills:'waybills', wbRecipients:'waybill_recipients', gpsOdometer:'gps_odometer', odoGps:'odo_gps', events:'events', workOrders:'work_orders', woItems:'work_order_items', vehicles:'vehicles', drivers:'drivers', deadlines:'deadlines', bookings:'bookings', costs:'costs', issues:'issues', docs:'documents', settings:'settings', routeStops:'route_stops', fleetCosts:'fleet_costs', tires:'tires', contracts:'vehicle_contracts', equipment:'equipment', workshops:'workshops', visits:'service_visits', requests:'data_change_requests', crewChanges:'crew_changes', routes:'routes', serviceEntries:'service_entries', blockOverrides:'block_overrides', loadings:'loadings', loadingReports:'loading_reports', fuelCardImports:'fuel_card_imports', fuelCardRows:'fuel_card_rows', clients:'clients', routePlans:'route_plans', planCalc:'route_plan_calc', members:'profiles'};
const COL_OF = Object.fromEntries(Object.entries(TABLES).map(([a, b]) => [b, a]));

/* pole w aplikacji → kolumna w bazie */
const FIELDS = {
  common:    {createdBy:'created_by', createdAt:'created_at', updatedBy:'updated_by', updatedAt:'updated_at'},
  vehicles:  {insPremium:'ins_premium', weightClass:'weight_class', driverId:'driver_id', responsible:'responsible', monthlyLimit:'monthly_limit', consGood:'cons_good', consOk:'cons_ok', policyNo:'policy_no', insurer:'insurer', policyUntil:'policy_until', assistancePhone:'assistance_phone', hasTacho:'has_tacho', tankL:'tank_l', tireSize:'tire_size'},
  blockOverrides: {vehicleId:'vehicle_id'},
  drivers:   {name:'full_name', licenseExpiry:'license_expiry', medicalExpiry:'medical_expiry', psychExpiry:'psych_expiry'},
  crewChanges: {vehicleId:'vehicle_id', bookingId:'booking_id', newBookingId:'new_booking_id', fromDriverId:'from_driver_id', fromCoDriverId:'from_co_driver_id', toDriverId:'to_driver_id'},
  deadlines: {vehicleId:'vehicle_id', kmDue:'km_due', intervalMonths:'interval_months', intervalKm:'interval_km', remindKm:'remind_km', lastDoneKm:'last_done_km', lastDoneDate:'last_done_date'},
  serviceEntries: {vehicleId:'vehicle_id', tiresSet:'tires_set', oilChange:'oil_change', timingChange:'timing_change', deadlineId:'deadline_id', issueIds:'issue_ids', costId:'cost_id', assetId:'storage_path', fileName:'file_name', contentType:'content_type'},
  loadings:  {routeId:'route_id', driverId:'driver_id', loadDate:'load_date', forDate:'for_date'},
  routeStops: {routeId:'route_id', timeFrom:'time_from', clientId:'client_id'},
  routes:    {startClientId:'start_client_id', endClientId:'end_client_id'},
  routePlans: {startClientId:'start_client_id', endClientId:'end_client_id', routeId:'route_id'},
  fleetCosts: {},
  workshops: {},
  visits: {vehicleId:'vehicle_id', workshopId:'workshop_id', deadlineId:'deadline_id', issueId:'issue_id'},
  gpsOdometer: {vehicleId:'vehicle_id', updatedAt:'updated_at'},
  workOrders: {workshopId:'workshop_id', closedAt:'closed_at'},
  waybills: {senderWh:'sender_wh', recipientId:'recipient_id', rName:'r_name', rAddress:'r_address', rRegon:'r_regon', rNip:'r_nip', whName:'wh_name', whAddress:'wh_address', weightKg:'weight_kg', vehicleId:'vehicle_id', departDate:'depart_date', printedAt:'printed_at', printedBy:'printed_by'},
  wbRecipients: {whName:'wh_name', whAddress:'wh_address'},
  kmAssign: {vehicleId:'vehicle_id', driverId:'driver_id', whoName:'who_name'},
  events: {vehicleId:'vehicle_id', driverId:'driver_id', refId:'ref_id'},
  woItems: {orderId:'order_id', vehicleId:'vehicle_id', issueId:'issue_id', deadlineId:'deadline_id', serviceEntryId:'service_entry_id'},
  odoGps: {refId:'ref_id', vehicleId:'vehicle_id', gpsKm:'gps_km', checkedAt:'checked_at'},
  contracts: {vehicleId:'vehicle_id', contractNo:'contract_no', startDate:'start_date', endDate:'end_date', monthlyNet:'monthly_net', monthlyGross:'monthly_gross', kmLimit:'km_limit', kmStart:'km_start', kmExcessRate:'km_excess_rate', insuranceIn:'insurance_in', serviceIn:'service_in'},
  equipment: {vehicleId:'vehicle_id', validUntil:'valid_until', checkedAt:'checked_at'},
  tires: {vehicleId:'vehicle_id', treadMm:'tread_mm', mountedAt:'mounted_at', mountedKm:'mounted_km'},
  loadingReports: {driverId:'driver_id', loadDate:'load_date', weightKg:'weight_kg'},
  fuelCardImports: {invoiceNo:'invoice_no', invoicePath:'invoice_path', fileName:'file_name', periodFrom:'period_from', periodTo:'period_to', rowsTotal:'rows_total', rowsOurs:'rows_ours'},
  fuelCardRows: {amountNet:'amount_net', vatRate:'vat_rate', importId:'import_id', vehicleId:'vehicle_id', txDate:'tx_date', txTime:'tx_time', cardNo:'card_no', costId:'cost_id', excludedNote:'excluded_note', excludedAt:'excluded_at', excludedBy:'excluded_by', gpsPlace:'gps_place', gpsDistKm:'gps_dist_km', gpsOk:'gps_ok', gpsCheckedAt:'gps_checked_at'},
  bookings:  {origVehicleId:'orig_vehicle_id', swapReason:'swap_reason', swappedAt:'swapped_at', vehicleId:'vehicle_id', driverId:'driver_id', routeId:'route_id', from:'date_from', to:'date_to', coDriverId:'co_driver_id', pickupConfirmedAt:'pickup_confirmed_at', returnConfirmedAt:'return_confirmed_at', disputeStage:'dispute_stage', disputeNote:'dispute_note', disputeAt:'dispute_at', disputeResolvedAt:'dispute_resolved_at', pickupTs:'pickup_ts', returnTs:'return_ts', pickupFuelDoubt:'pickup_fuel_doubt'},
  costs:     {vehicleId:'vehicle_id', driverId:'driver_id', routeId:'route_id', amountOrig:'amount_orig', fxRate:'fx_rate', fxDate:'fx_date', fxTable:'fx_table', fxManual:'fx_manual', flagState:'flag_state', flagQuestion:'flag_question', flagReply:'flag_reply', flagBy:'flag_by', flagAt:'flag_at', full:'full_tank', coDriverId:'co_driver_id', confirmStatus:'confirm_status', confirmedAt:'confirmed_at', disputeNote:'dispute_note'},
  issues:    {vehicleId:'vehicle_id', repairNote:'repair_note', resolvedAt:'resolved_at', serviceType:'service_type'},
  docs:      {vehicleId:'vehicle_id', validUntil:'valid_until', assetId:'storage_path', fileName:'file_name', contentType:'content_type', size:'size_bytes'},
  members:   {driverId:'driver_id'},
  requests:  {driverId:'driver_id', oldValue:'old_value', newValue:'new_value', decidedAt:'decided_at', decidedBy:'decided_by'},
};
/* kolumny, które aplikacja może zapisywać (reszta ustawia baza) */
const WRITABLE = {
  vehicles:  ['id','plate','make','model','year','vin','fuel','km','driver_id','status','monthly_limit','notes','cons_good','cons_ok','policy_no','insurer','policy_until','assistance_phone','has_tacho','tank_l','weight_class','tires','responsible','tire_size','ins_premium'],
  drivers:   ['id','full_name','phone','categories','license_expiry','medical_expiry','psych_expiry','active'],
  crewChanges: [],
  routes:    ['id','code','name','tacho','loading','active','note','km','color','start_client_id','end_client_id','via'],
  clients:   ['id','name','address','lat','lng','phone','note'],
  routePlans: ['id','name','color','start_client_id','end_client_id','stops','via','route_id','note','calc'],
  planCalc:  ['id','calc'],
  blockOverrides: ['id','vehicle_id','date','reason'],
  deadlines: ['id','vehicle_id','type','date','km_due','interval_months','interval_km','remind_km','note','last_done_km','last_done_date'],
  serviceEntries: ['id','vehicle_id','date','km','workshop','description','cost','oil_change','deadline_id','issue_ids','note','storage_path','file_name','content_type','tires_set','timing_change'],
  loadings:  ['id','route_id','driver_id'],
  routeStops: ['id','route_id','pos','client','address','time_from','phone','note','client_id'],
  fleetCosts: ['id','date','category','amount','note'],
  workshops: ['id','name','phone','address','kind','note'],
  visits: ['id','vehicle_id','workshop_id','date','time','reason','deadline_id','issue_id','status','note'],
  contracts: ['id','vehicle_id','kind','provider','contract_no','start_date','end_date','monthly_net','monthly_gross','km_limit','km_start','km_excess_rate','buyout','insurance_in','service_in','note','currency'],
  equipment: ['id','vehicle_id','item','ok','valid_until','checked_at','note'],
  tires: ['id','vehicle_id','season','size','brand','dot','tread_mm','location','storage','mounted_at','mounted_km','note'],
  loadingReports: ['id','driver_id','weight_kg','photo'],
  bookings:  ['id','vehicle_id','driver_id','date_from','date_to','purpose','route_id','pickup_at','pickup_km','pickup_fuel','pickup_note','pickup_photos','pickup_by','pickup_checklist','return_at','return_km','return_fuel','return_note','return_photos','return_by','return_home','co_driver_id'],
  costs:     ['id','date','vehicle_id','driver_id','category','amount','liters','odometer','full_tank','note','photos','co_driver_id','confirm_status','currency','amount_orig','fx_rate','fx_manual','station','flag_state','flag_question','gross'],
  issues:    ['id','vehicle_id','title','description','severity','status','date','km','repair_note','resolved_at','photos','service_type'],
  workOrders: ['id','workshop_id','workshop','date','note','status','closed_at'],
  waybills: ['id','date','sender','sender_wh','recipient_id','r_name','r_address','r_regon','r_nip','wh_name','wh_address','items','pallets','weight_kg','vehicle_id','plate','depart_date','status','note','printed_at','printed_by'],
  wbRecipients: ['id','name','address','regon','nip','wh_name','wh_address'],
  kmAssign: ['id','vehicle_id','day','km','driver_id','who_name','purpose','note'],
  woItems:   ['id','order_id','vehicle_id','issue_id','deadline_id','kind','title','status','service_entry_id'],
  docs:      ['id','vehicle_id','kind','name','valid_until','storage_path','file_name','content_type','size_bytes'],
  settings:  ['key','value'],
  requests:  ['id','driver_id','field','old_value','new_value','status'],
  members:   ['status','role','driver_id','approved_at','approved_by','full_name'],
};
/* Rozmiar opon auta (migracja 032). Kolumna jest, gdy wczytane auta ją mają. */
const tireSizeOn = () => S.vehicles.length > 0 && 'tireSize' in S.vehicles[0];
/* „225/75r16c” → „225/75 R16C” */
const normTireSize = s => { s = String(s || '').trim().toUpperCase().replace(/\s+/g, ' '); const m = /^(\d{3})\s*\/\s*(\d{2})\s*(Z?R)\s*(\d{2}(?:[.,]5)?)\s*(C?)(.*)$/.exec(s); return m ? `${m[1]}/${m[2]} ${m[3]}${m[4].replace(',', '.')}${m[5]}${m[6] ? ' ' + m[6].trim() : ''}` : s; };
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
    if (o.returned) o.returned.home = !!r.return_home;
    delete o.return_home;
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
      else out.return_home = !!(v && v.home);
      continue;
    }
    out[m[k] || k] = v==='' ? null : v;
  }
  for (const k of Object.keys(out)) if (!WRITABLE[col].includes(k)) delete out[k];
  if (col==='vehicles' && !tireSizeOn()) delete out.tire_size;   // przed migracją 032 kolumny nie ma
  if (col==='vehicles' && S.vehicles[0] && !('insPremium' in S.vehicles[0])) delete out.ins_premium;   // przed migracją 064
  if (col==='costs' && S.costs[0] && !('gross' in S.costs[0])) delete out.gross;
  if ((col==='routes' || col==='routeStops') && !optOn('clients')){ delete out.color; delete out.start_client_id; delete out.end_client_id; delete out.client_id; }   // przed migracją 059 (mapa tras) tych kolumn nie ma
  if (col==='routes' && !(S.routes[0] && 'via' in S.routes[0])) delete out.via;   // przed migracją 060
  if (col==='routePlans' && (optOn('planCalc') || S.routePlans[0] && !('calc' in S.routePlans[0]))) delete out.calc;   // przed migracją 062; od 063 koszty w route_plan_calc
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
  if (e && e.code==='viewas') return {code:'invalid_argument', message: VIEWAS_MSG};
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
      // ustawienia: zawsze „wstaw albo nadpisz” – lokalna lista może być nieaktualna (np. „Wygeneruj nowe klucze”)
      const q = col==='settings' ? sb.from(table).upsert(row, {onConflict:'key'}) : exists ? sb.from(table).update(row).eq(key, id) : sb.from(table).insert(row);
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
const dbApi = {collection: col => ({doc: id => docRef(col, id || newId())})};

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
function setSync(cls, txt){ const el = syncEl(); if (!el) return; el.className = 'sync '+cls; el.querySelector('span').textContent = txt; el.title = txt; }

S.fuelAll = [];
async function refresh(col){
  const table = TABLES[col]; if (!table) return;
  if ((col==='members' || col==='crewChanges' || col==='fuelCardImports' || col==='fuelCardRows' || col==='fleetCosts') && !P().manage) return;
  if ((col==='tires' || col==='contracts' || col==='equipment' || col==='workshops' || col==='visits' || col==='gpsOdometer' || col==='odoGps' || col==='workOrders' || col==='woItems' || col==='events') && !P().manage && !P().service){ got[col] = true; return; }
  if (col==='serviceEntries' && !P().service) return;
  if (col==='planCalc' && !P().manage){ got[col] = true; return; }
  if (col==='workEvents'){   // karta pracy: wpisy wczytuje widok (kierowca + miesiąc); tu tylko sprawdzamy, czy tabela jest
    const {error} = await sb.from(table).select('id').limit(1); got[col] = true; OPT[col] = !error; S[col] = []; if (typeof wcCache!=='undefined') wcCache.clear(); return; }
  if ((col==='waybills' || col==='wbRecipients' || col==='kmAssign') && !P().manage){ got[col] = true; return; }   // listy przewozowe – tylko kierownik floty   // koszty planów tras – tylko kierownictwo
  // Supabase oddaje najwyżej 1000 wierszy na zapytanie – pobieramy partiami aż do końca
  const key = col==='settings' ? 'key' : 'id', PAGE = 1000, data = [];
  for (let from = 0; ; from += PAGE){
    const {data: part, error} = await sb.from(table).select('*').order(key).range(from, from + PAGE - 1);
    if (error){ got[col] = true; if (col in OPT) OPT[col] = false; if (col==='routeStops') stopsReady = false; if (col==='fleetCosts') fleetCostsReady = false; return; }
    data.push(...(part || []));
    if (!part || part.length < PAGE) break;
  }
  if (col==='routeStops') stopsReady = true;
  if (col==='fleetCosts') fleetCostsReady = true;
  if (col in OPT) OPT[col] = true;
  if (col==='members') profiles = data;
  else S[col] = data.map(r => toApp(col, r));
  if ((col==='routePlans' || col==='planCalc') && OPT.planCalc) mergePlanCalc();
  // tankowania z karty wykluczone z kosztów floty (migracja 050): w S.fuelCardRows ich nie ma – liczenia ich nie widzą; pełna lista w S.fuelCardRowsAll
  if (col==='fuelCardRows'){ S.fuelCardRowsAll = S.fuelCardRows; S.fuelCardRows = S.fuelCardRowsAll.filter(r => !r.excluded); }
  got[col] = true;
  if (col==='costs' && P().costs==='own') await refreshFuelAll();
  if (dbState==='live' && typeof saveSnapshot==='function') saveSnapshot();
  schedule();
}
async function refreshFuelAll(){
  const data = [];
  for (let from = 0; ; from += 1000){
    const {data: part, error} = await sb.rpc('fuel_fills').range(from, from + 999);
    if (error) break;
    data.push(...(part || []));
    if (!part || part.length < 1000) break;
  }
  S.fuelAll = data.map(r => ({id:r.id, vehicleId:r.vehicle_id, date:r.date, category:r.category, odometer:r.odometer, liters:Number(r.liters), full:r.full_tank, driverId:r.driver_ref || ''}));
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

let channel = null, stopsChannel = null, stopsReady = false, fcChannel = null, fleetCostsReady = false;
/* Tabele z nowszych migracji (027 opony, 028 wyposażenie, 029 umowy, 030 warsztaty): dopóki SQL nie jest uruchomiony, moduł jest ukryty,
   a reszta aplikacji działa normalnie. OPT[col] = true, gdy tabela istnieje i dane się wczytały. */
const OPT = {workEvents: false, kmAssign: false, waybills: false, wbRecipients: false, clients: false, routePlans: false, planCalc: false, tires: false, contracts: false, equipment: false, workshops: false, visits: false, gpsOdometer: false, odoGps: false, workOrders: false, woItems: false, events: false}, optChannels = {};
const optOn = col => !!OPT[col];
/* od migracji 063 wyliczenia kosztów planów są w osobnej tabeli (tylko kierownictwo) – w pamięci dalej jako plan.calc */
function mergePlanCalc(){ S.routePlans.forEach(p => { const c = S.planCalc.find(x => x.id===p.id); p.calc = c && c.calc || {}; }); }
async function loadAll(){
  db = dbApi;
  setSync('', 'Wczytywanie danych…');
  const cols = [...COLS, ...(P().manage ? ['members'] : [])];
  await Promise.all([...cols.map(refresh), refreshNames(), refreshLog()]);
  if (P().costs==='own') await refreshFuelAll();
  dbState = 'live'; setSync('live', 'Dane na żywo');
  if (typeof saveSnapshot==='function'){ saveSnapshot(); processQueue(); }
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('zmiany');
  // route_stops ma osobny kanał – dopóki migracja 022 nie jest uruchomiona, błąd tej subskrypcji nie zatrzymuje reszty
  Object.values(TABLES).filter(t => t!=='route_stops' && t!=='fleet_costs' && !(COL_OF[t] in OPT)).forEach(t => channel.on('postgres_changes', {event:'*', schema:'public', table:t}, p => {
    const col = COL_OF[p.table];
    if (col==='members' || p.table==='profiles'){ onProfileChange(p); return; }
    queueRefresh(col);
  }));
  channel.subscribe(status => {
    if (status==='SUBSCRIBED') setSync('live', 'Dane na żywo');
    else if (status==='CHANNEL_ERROR' || status==='TIMED_OUT'){ setSync('err', 'Odświeżanie na żywo wstrzymane'); }
  });
  if (stopsChannel) sb.removeChannel(stopsChannel);
  if (stopsReady) stopsChannel = sb.channel('przystanki').on('postgres_changes', {event:'*', schema:'public', table:'route_stops'}, () => queueRefresh('routeStops')).subscribe();
  // koszty ogólne (migracja 024) – też osobny kanał
  if (fcChannel) sb.removeChannel(fcChannel);
  if (fleetCostsReady) fcChannel = sb.channel('koszty-ogolne').on('postgres_changes', {event:'*', schema:'public', table:'fleet_costs'}, () => queueRefresh('fleetCosts')).subscribe();
  Object.keys(OPT).forEach(col => { if (optChannels[col]){ sb.removeChannel(optChannels[col]); delete optChannels[col]; }
    if (OPT[col]) optChannels[col] = sb.channel('opt-' + col).on('postgres_changes', {event:'*', schema:'public', table: TABLES[col]}, () => queueRefresh(col)).subscribe(); });
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
    if (viewAs) throw {code:'invalid_argument', message: VIEWAS_MSG};
    const ext = ((file.name || '').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${myId}/${newId()}.${ext}`;
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
