/* Emage FLEET — terminy: terminy i przypomnienia */
'use strict';
function viewDeadlines(){
  if (dlFilter==='soon' || dlFilter==='later') dlFilter = 'urgent';
  const chips = [['urgent','Pilne'],['over','Po terminie'],['plan','Plan 8 tygodni'],['all','Pokaż wszystkie']];
  const head = `<div class="bar"><h2>Terminy i przypomnienia</h2><div class="tools">${chips.map(([k,l])=>`<button class="small ${dlFilter===k?'primary':''}" data-dlf="${k}">${l}</button>`).join('')}${canCreate('deadlines') && typeof stdMissing==='function' && stdMissing().length ? `<button class="small" data-action="std-bulk" title="Przegląd, OC i olej dla aut, które ich nie mają">${ic('plus')}Terminy floty (${stdMissing().length})</button>` : ''}${P().manage ? `<button class="small" data-action="cal-open" title="Terminy w kalendarzu Google lub iPhone">${ic('cal')}W kalendarzu</button>` : ''}${canCreate('deadlines')?'<button class="primary" data-new="deadlines">+ Dodaj termin</button>':''}</div></div>`;
  if (!S.deadlines.length) return head + loadingOr('deadlines', emptyBlock('Brak zapisanych terminów','Zapisz daty przeglądów technicznych, końca polis OC/AC, serwisów i wymiany opon. Strona podświetli to, co zbliża się w ciągu 30 dni.', '<button class="primary" data-new="deadlines">+ Dodaj termin</button>', '', 'deadlines'));
  if (dlFilter==='plan') return head + deadlinePlan();
  const all = S.deadlines.map(d => ({d, s:dlState(d)})).sort((a,b)=> a.d.date<b.d.date?-1:a.d.date>b.d.date?1:0);
  // pilne: po terminie albo w ciągu 60 dni (przy terminach na km – gdy zbliża się przypomnienie)
  const f = all.filter(({s}) => dlFilter==='all' || (dlFilter==='over' && s.d<=0) || (dlFilter==='urgent' && s.d<=60));
  const hidden = all.length - f.length;
  const groups = [['Po terminie lub dziś', x=>x.s.d<=0],['W ciągu 14 dni', x=>x.s.d>0&&x.s.d<=14],['W ciągu 60 dni',x=>x.s.d>14&&x.s.d<=60],['Później',x=>x.s.d>60]];
  let html='';
  for (const [name, fn] of groups){
    const items = f.filter(fn); if (!items.length) continue;
    html += `<div class="dl-group label">${name} · ${items.length}</div>` + items.map(({d,s}) => {
      const v = byId('vehicles', d.vehicleId);
      const cyc = [d.intervalMonths?'co '+d.intervalMonths+' mies.':'', d.intervalKm?'co '+km(d.intervalKm):''].filter(Boolean).join(' lub ');
      const kmInfo = (d.kmDue ? `<span class="sub num">lub przy ${km(d.kmDue)}${v&&v.km?` (teraz ${km(v.km)})`:''}</span>` : '') + (cyc ? `<span class="sub">Cykl: ${cyc}</span>` : '') + (d.note && !d.kmDue ? `<span class="sub">${esc(d.note)}</span>` : '');
      return `<div class="dl-row ${s.cls==='ok'?'':s.cls}" ${canEditDoc('deadlines',d)?'data-edit="deadlines" tabindex="0"':'style="cursor:default"'} data-id="${esc(d.id)}">
        <div class="dl-date">${fdate(d.date)}</div>
        <div style="min-width:0"><b>${esc(d.type)}</b>${kmInfo}</div>
        <div class="is-veh" style="min-width:0">${vPlate(d.vehicleId)} <span class="sub">${esc(vName(d.vehicleId))}</span></div>
        <div class="is-pills"><span class="pill ${s.cls}">${esc(s.txt)}</span></div>
        <div>${canEditDoc('deadlines',d) && d.type!=='Koniec gwarancji'?`<button class="small" data-renew="${esc(d.id)}" title="Oznacz jako wykonane i ustaw kolejny termin">Wykonane</button>`:''}</div>
      </div>`; }).join('');
  }
  const more = hidden && dlFilter!=='all' ? `<p class="muted small" style="margin:0">${hidden} ${isPlural(hidden,'dalszy termin ukryty','dalsze terminy ukryte','dalszych terminów ukrytych')} – <a href="#" data-dlf="all">pokaż wszystkie</a>.</p>` : '';
  return head + `<div class="panel dl">${html || `<div class="empty"><p>${dlFilter==='urgent' ? 'Nic pilnego – wszystkie terminy są dalej niż 60 dni.' : 'Brak terminów w tym filtrze.'}</p></div>`}</div>` + more;
}
/* domyślne cykle: [miesiące, km] */
const DL_INTERVALS = {'Przegląd techniczny':[12,null],'Ubezpieczenie OC':[12,null],'Ubezpieczenie AC':[12,null],'Serwis olejowy':[12,15000],'Wymiana rozrządu':[60,80000],'Wymiana opon':[6,null],'Przegląd gwarancyjny':[12,30000],'Koniec gwarancji':[null,null],'Legalizacja tachografu':[24,null],'Leasing – koniec umowy':[null,null],'Inne':[null,null]};
function renew(id){
  const d = byId('deadlines', id); if (!d) return;
  if (typeof openWarrantyDone==='function' && d.type==='Przegląd gwarancyjny' && canCreate('serviceEntries')) return openWarrantyDone(d.vehicleId);
  if (typeof openWarranty==='function' && d.type==='Koniec gwarancji') return openWarranty(d.vehicleId);
  const def = DL_INTERVALS[d.type] || [12,null];
  const months = Number(d.intervalMonths) || def[0] || 12;
  const kmStep = Number(d.intervalKm) || (d.kmDue ? def[1] : null);
  const v = byId('vehicles', d.vehicleId);
  openForm('deadlines', id);
  if (editing) editing.renew = true;
  setTimeout(()=>{ const el=$('#f-deadlines-date'); if(el){ el.value = addMonths(today(), months); el.focus(); }
    const k=$('#f-deadlines-kmDue'); if (k && kmStep && v && v.km) k.value = Number(v.km) + kmStep;
    $('#dlg-title').textContent = 'Wykonane – ustaw kolejny termin'; },30);
}


/* Średni dzienny przebieg auta z ostatnich 60 dni (wszystkie liczniki) – do przewidywania terminów „na km” */
function kmPerDay(vid){
  if (typeof odoRange!=='function') return 0;
  const t = today(), r = odoRange(vid, addDays(t, -60), t);
  return r && r.km > 0 ? r.km / 60 : 0;
}
/* Kiedy termin faktycznie wypadnie: data albo (wcześniej) dzień, w którym auto dojedzie do km_due */
function dueEstimate(d){
  const v = byId('vehicles', d.vehicleId) || {};
  let when = d.date, byKm = false, rate = 0;
  if (d.kmDue && v.km){
    rate = kmPerDay(d.vehicleId);
    const left = Number(d.kmDue) - Number(v.km);
    const kd = left <= 0 ? today() : rate > 0 ? addDays(today(), Math.floor(left / rate)) : null;
    if (kd && (!when || kd < when)){ when = kd; byKm = true; }
  }
  return {when, byKm, rate};
}
function deadlinePlan(){
  const t = today(), mon = mondayOf(t), end = addDays(mon, 7 * 8 - 1);
  const items = S.deadlines.map(d => ({d, e: dueEstimate(d)})).filter(x => x.e.when && x.e.when <= end).sort((a, b) => a.e.when < b.e.when ? -1 : 1);
  if (!items.length) return '<div class="panel"><div class="empty"><p>W najbliższych 8 tygodniach nie ma żadnych terminów.</p></div></div>';
  const weeks = [{k:'over', l:'Po terminie', f: x => x.e.when < t}];
  for (let i = 0; i < 8; i++){ const a = addDays(mon, 7 * i), b = addDays(a, 6);
    weeks.push({k: a, l: i===0 ? 'Ten tydzień' : i===1 ? 'Przyszły tydzień' : `Tydzień ${fdate(a).slice(0, 5)} – ${fdate(b).slice(0, 5)}`, sub: i < 2 ? `${fdate(a).slice(0, 5)} – ${fdate(b).slice(0, 5)}` : '', f: x => x.e.when >= (i===0 ? t : a) && x.e.when <= b}); }
  const html = weeks.map(w => { const xs = items.filter(w.f); if (!xs.length) return '';
    const cars = new Set(xs.map(x => x.d.vehicleId)).size;
    return `<div class="pl-week ${w.k==='over' ? 'over' : ''}"><div class="pl-h"><b>${w.l}</b>${w.sub ? `<span class="muted small">${w.sub}</span>` : ''}<span class="pill ${w.k==='over' ? 'bad' : 'soon'}">${xs.length} ${isPlural(xs.length,'termin','terminy','terminów')} · ${cars} ${isPlural(cars,'auto','auta','aut')}</span></div>
      ${xs.map(({d, e}) => `<div class="pl-it" ${canEditDoc('deadlines', d) ? `data-edit="deadlines" data-id="${esc(d.id)}" tabindex="0"` : ''}>
        <span class="pl-d num">${fdate(e.when).slice(0, 5)}<em>${DOW[(parse(e.when).getDay() + 6) % 7]}</em></span>
        ${vPlate(d.vehicleId)}
        <span class="pl-t"><b>${esc(d.type)}</b><span class="sub">${e.byKm ? `wg przebiegu: ${km(d.kmDue)} (jeździ ok. ${Math.round(e.rate)} km/dzień)` : d.kmDue ? `albo przy ${km(d.kmDue)}` : 'termin kalendarzowy'}</span></span>
        ${canEditDoc('deadlines', d) && d.type!=='Koniec gwarancji' ? `<button class="small" data-renew="${esc(d.id)}">Wykonane</button>` : ''}</div>`).join('')}</div>`; }).join('');
  return `<p class="muted small" style="margin:0">Terminy „na kilometry” są przeliczone na datę według tego, ile auto jeździło w ostatnich 60 dniach – widać, kiedy naprawdę trzeba zjechać do serwisu.</p><div class="panel pl">${html}</div>`;
}
