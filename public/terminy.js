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
  if (editing) editing.renew = {type: d.type, vehicleId: d.vehicleId, months, kmStep};
  setTimeout(()=>{
    $('#dlg-title').textContent = 'Wykonane – ustaw kolejny termin';
    // kiedy i przy jakim przebiegu faktycznie wykonano – od tego liczy się kolejny termin
    const first = $('#f-deadlines-date') && $('#f-deadlines-date').closest('.row, .field, label, div');
    const anchor = $('#f-deadlines-type') ? $('#f-deadlines-type').closest('.row') || $('#f-deadlines-type').closest('div') : first;
    const svcOk = canCreate('serviceEntries') && !!P().service && !/Ubezpieczenie|Leasing|gwarancji/.test(d.type), svcOn = ['Wymiana rozrządu','Serwis olejowy','Wymiana opon','Przegląd techniczny','Inne'].includes(d.type);
    const box = document.createElement('div'); box.className = 'renew-done';
    box.innerHTML = `<p class="renew-h">Wykonano</p><div class="row"><label>Data wykonania *<input type="date" id="rn-date" value="${today()}" max="${today()}"></label>
      <label>Przy przebiegu (km)${kmStep ? ' *' : ''}<input type="text" inputmode="numeric" id="rn-km" value="${v && v.km ? Math.round(Number(v.km)) : ''}" placeholder="np. 454210"></label></div>
      ${svcOk ? `<label class="check small"><input type="checkbox" id="rn-svc" ${svcOn ? 'checked' : ''}> Zapisz w książce serwisowej (${esc(d.type)}${d.type==='Wymiana rozrządu' || d.type==='Serwis olejowy' ? ', z przebiegiem' : ''})</label>` : ''}
      <p class="muted small renew-calc" id="rn-calc"></p>`;
    const body = $('#dlg-body'); const tgt = anchor && anchor.parentElement===body ? anchor.nextSibling : body.firstChild;
    body.insertBefore(box, tgt);
    const calc = () => {
      const dd = $('#rn-date').value || today(), kmv = Number(String($('#rn-km').value).replace(/\s/g, ''));
      const de = $('#f-deadlines-date'); if (de) de.value = addMonths(dd, months);
      const k = $('#f-deadlines-kmDue'); if (k && kmStep && kmv > 0) k.value = kmv + kmStep;
      const cur = v && Number(v.km) || 0;
      $('#rn-calc').textContent = `Kolejny termin: ${fdate(addMonths(dd, months))}${kmStep && kmv > 0 ? ` albo przy ${new Intl.NumberFormat('pl-PL').format(kmv + kmStep)} km` : ''}${kmStep && kmv > 0 && cur && cur >= kmv + kmStep ? ' – już przekroczony, auto ma ' + new Intl.NumberFormat('pl-PL').format(cur) + ' km' : ''}.`;
    };
    box.addEventListener('input', calc); calc();
    $('#rn-km').focus();
  },30);
}
/* zapis „Wykonane”: notatka z datą i przebiegiem, opcjonalnie wpis w książce serwisowej (ten sam wyzwalacz w bazie liczy kolejny termin) */
function renewNote(note, dd, kmv){
  const clean = String(note || '').replace(/(Z rejestru rozrządów: )?ostatni[ao]? (wymiana|wykonan[ea])[^·\n]*(·\s*)?/ig, '').replace(/Ostatnio wykonane:[^·\n]*(·\s*)?/g, '').trim();
  return ['Ostatnio wykonane: ' + fdate(dd) + (kmv ? ' przy ' + new Intl.NumberFormat('pl-PL').format(kmv) + ' km' : ''), clean].filter(Boolean).join(' · ').slice(0, 500);
}
async function renewAfterSave(rn, deadlineId){
  if (!rn.svc) return '';
  await db.collection('serviceEntries').doc().set({vehicleId: rn.vehicleId, date: rn.date, km: rn.km || null, description: rn.type,
    timingChange: rn.type==='Wymiana rozrządu', oilChange: rn.type==='Serwis olejowy', deadlineId, issueIds: []});
  await Promise.all(['serviceEntries', 'deadlines', 'vehicles', 'costs'].map(refresh));
  return ' i dodano wpis w książce serwisowej';
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
