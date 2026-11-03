/* Emage FLEET — historia: dziennik zmian (kto, kiedy, co zmienił) */
'use strict';
let LOG = [];
let histWho = '', histCol = '';
const LOG_KEEP_DAYS = 365;
const COL_NAMES = {vehicles:'Pojazd', drivers:'Kierowca', deadlines:'Termin', bookings:'Rezerwacja', costs:'Koszt', issues:'Usterka', docs:'Dokument', members:'Rola', settings:'Ustawienia', routes:'Trasa', serviceEntries:'Serwis'};
const ACT_NAMES = {add:'dodał(a)', edit:'zmienił(a)', delete:'usunął/usunęła', status:'zmienił(a) status', pickup:'wydał(a) auto', return:'przyjął/przyjęła zwrot', role:'zmienił(a) rolę', import:'zaimportował(a)', done:'oznaczył(a) jako wykonane'};

function labelFor(col, d){
  if (!d) return '';
  const p = d.vehicleId ? (byId('vehicles', d.vehicleId)?.plate || '') : '';
  switch (col){
    case 'vehicles':  return [d.plate, d.make, d.model].filter(Boolean).join(' ');
    case 'drivers':   return d.name || '';
    case 'deadlines': return `${d.type||''} · ${p} · ${fdate(d.date)}`;
    case 'bookings':  return `${dName(d.driverId)} · ${p} · ${fdate(d.from)}–${fdate(d.to)}`;
    case 'costs':     return `${d.category||''} ${zl2(d.amount)} · ${p}`;
    case 'issues':    return `${d.title||''} · ${p}${d.status?' → '+(ISSUE_ST[d.status]||{}).l:''}`;
    case 'docs':      return `${d.kind||''} · ${p}`;
    case 'routes':    return `${d.code||''} · ${d.name||''}`;
    case 'serviceEntries': return `${d.description||''} · ${p}`;
    case 'settings':  return d.monthly ? 'Budżet floty: '+zl(d.monthly)+' / mies.' : 'Budżet floty';
    case 'members':   return `${(ROLES[d.role]||{}).name || 'bez roli'} · ${(STATUS[d.status]||{}).l || ''}`;
    default: return d.label || '';
  }
}

/* Zapis do dziennika – nie blokuje zapisu właściwego; błąd jest ignorowany. */
/* Historię zapisuje baza (wyzwalacze), aplikacja niczego tu nie dopisuje. */
function logChange(){}
function _unusedLogChange(action, col, doc, extra = {}){
  if (!db || !doc || doc.sample) return;
  const e = {at: new Date().toISOString(), action, col, label: labelFor(col, doc).slice(0, 200), docId: doc.id || '', vehicleId: doc.vehicleId || (col==='vehicles' ? doc.id || '' : ''), ...extra};
  if (myId) e.by = myId;
  db.collection('log').doc().set(e).catch(() => {});
}

function viewHistory(){
  needProfiles([...LOG.map(l => l.by), ...LOG.map(l => l.targetId)].filter(Boolean));
  const people = [...new Set(LOG.map(l => l.by).filter(Boolean))];
  const head = `<div class="bar"><h2>Historia zmian</h2><div class="tools">
    <select id="hist-who" aria-label="Osoba" style="width:auto"><option value="">Wszystkie osoby</option>${people.map(id => `<option value="${esc(id)}" ${histWho===id?'selected':''}>${esc(pName(id))}</option>`).join('')}</select>
    <select id="hist-col" aria-label="Rodzaj" style="width:auto"><option value="">Wszystkie rodzaje</option>${Object.entries(COL_NAMES).map(([k,l]) => `<option value="${k}" ${histCol===k?'selected':''}>${l}</option>`).join('')}</select></div></div>`;
  if (!LOG.length) return head + `<div class="panel empty"><h3>Brak zapisanych zmian</h3><p>Od teraz każde dodanie, zmiana i usunięcie wpisu trafia tutaj – z nazwą osoby i godziną. Zapisuje je baza danych automatycznie. Pokazujemy ostatnie 300 zmian, starsze niż rok są usuwane.</p></div>`;
  const list = LOG.filter(l => (!histWho || l.by===histWho) && (!histCol || l.col===histCol));
  let html = '', day = '';
  for (const l of list){
    const d = (l.at||'').slice(0,10);
    if (d !== day){ day = d; html += `<div class="dl-group label">${d===today()?'Dziś':d===addDays(today(),-1)?'Wczoraj':fdate(d)}</div>`; }
    const t = new Date(l.at); const hm = isNaN(t) ? '' : pad(t.getHours())+':'+pad(t.getMinutes());
    const what = l.col==='members' ? `${esc(pName(l.targetId))} → ${esc(l.label)}` : esc(l.label);
    html += `<div class="hist ${l.vehicleId && byId('vehicles', l.vehicleId) ? 'click' : ''}" ${l.vehicleId && byId('vehicles', l.vehicleId) ? `data-card-go="${esc(l.vehicleId)}"` : ''}>
      <span class="num muted">${hm}</span><span class="pill ${l.action==='delete'?'bad':l.action==='add'||l.action==='import'?'ok':'off'}">${esc(COL_NAMES[l.col]||l.col)}</span>
      <span class="hist-txt"><b>${esc(l.by ? pName(l.by) : 'Ktoś')}</b> ${esc(ACT_NAMES[l.action]||l.action)}: ${what}</span></div>`;
  }
  return head + `<div class="panel dl">${html || '<div class="empty"><p>Brak zmian dla wybranych filtrów.</p></div>'}</div>`;
}

let pruned = false;
async function _unusedPruneLog(){
  if (pruned || !db || !P().manage || !canWrite) return;
  pruned = true;
  try {
    const cut = addDays(today(), -LOG_KEEP_DAYS);
    const old = await db.collection('log').where('at', '<', cut).limit(50).get();
    for (const d of old.docs) await db.collection('log').doc(d.id).delete();
  } catch(_){}
}
