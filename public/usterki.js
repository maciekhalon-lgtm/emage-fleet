/* Emage FLEET — usterki: zgłaszanie i obsługa usterek pojazdów */
'use strict';
const ISSUE_SEV = {
  drobna:  {l:'Drobna',          cls:'off'},
  istotna: {l:'Istotna',         cls:'warn'},
  stop:    {l:'Auto niesprawne', cls:'bad'},
};
const ISSUE_ST = {
  nowe:       {l:'Nowe',        cls:'bad'},
  naprawa:    {l:'W naprawie',  cls:'warn'},
  naprawione: {l:'Naprawione',  cls:'ok'},
};
let issueFilter = 'open';

function openIssues(vehId){ return S.issues.filter(i => i.status!=='naprawione' && (!vehId || i.vehicleId===vehId)); }
function stopIssue(vehId){ return S.issues.find(i => i.vehicleId===vehId && i.status!=='naprawione' && i.severity==='stop'); }

function issueRow(i, showVeh = true){
  const sev = ISSUE_SEV[i.severity] || ISSUE_SEV.drobna;
  const st = ISSUE_ST[i.status] || ISSUE_ST.nowe;
  const edit = canEditDoc('issues', i);
  const quick = P().issues==='rw' && canWrite
    ? (i.status==='nowe' ? `<button class="small" data-issue-st="naprawa" data-id="${esc(i.id)}">Do naprawy</button>` : '')
      + (i.status!=='naprawione' ? `<button class="small" data-issue-st="naprawione" data-id="${esc(i.id)}">Naprawione</button>` : '')
      + (i.status!=='naprawione' && P().service && canCreate('serviceEntries') ? `<button class="small ghost" data-svc-issue="${esc(i.id)}" title="Wpis do książki serwisowej – po zapisaniu usterka zamknie się sama">${ic('wrench')}Wpis serwisowy</button>` : '')
    : '';
  return `<div class="is-row ${i.status==='naprawione'?'done':sev.cls}" ${edit?`data-edit="issues" data-id="${esc(i.id)}" tabindex="0"`:'style="cursor:default"'}>
    <div class="dl-date">${fdate(i.date)}</div>
    <div style="min-width:0"><b>${esc(i.title)}</b>${typeof isAccident==='function' && isAccident(i) ? ' <span class="pill bad">szkoda</span>' : ''}<span class="sub ${typeof isAccident==='function' && isAccident(i) ? 'pre' : ''}">${esc(i.description||'')}${i.repairNote?` · Naprawa: ${esc(i.repairNote)}`:''}</span>
      <span class="sub">Zgłosił(a): ${esc(i.createdBy?pName(i.createdBy):'—')}${i.km?' · przy '+km(i.km):''}</span>${photoStrip(i.photos)}</div>
    ${showVeh?`<div class="hide-sm" style="min-width:0">${vPlate(i.vehicleId)}<span class="sub">${esc(vName(i.vehicleId))}</span></div>`:''}
    <div class="is-pills"><span class="pill ${sev.cls}">${sev.l}</span><span class="pill ${st.cls}">${st.l}</span></div>
    <div class="is-act">${quick}</div>
  </div>`;
}

function viewIssues(){
  const chips = [['open','Otwarte'],['stop','Auto niesprawne'],['done','Naprawione'],['all','Wszystkie']];
  const head = `<div class="bar"><h2>Usterki</h2><div class="tools">${chips.map(([k,l])=>`<button class="small ${issueFilter===k?'primary':''}" data-isf="${k}">${l}</button>`).join('')}${canCreate('issues')?'<button class="primary" data-new="issues">+ Zgłoś usterkę</button>':''}</div></div>`;
  if (!S.issues.length) return head + loadingOr('issues', emptyBlock('Brak zgłoszonych usterek',
    'Kierowcy zgłaszają tu problemy z autem – od przepalonej żarówki po awarię. Kierownik serwisu zmienia status zgłoszenia, a auto oznaczone jako niesprawne znika z puli dostępnych.',
    '<button class="primary" data-new="issues">+ Zgłoś usterkę</button>', '', 'issues'));
  const order = {nowe:0, naprawa:1, naprawione:2}, sevO = {stop:0, istotna:1, drobna:2};
  const list = S.issues.filter(i =>
      issueFilter==='all' || (issueFilter==='open' && i.status!=='naprawione') ||
      (issueFilter==='stop' && i.status!=='naprawione' && i.severity==='stop') || (issueFilter==='done' && i.status==='naprawione'))
    .sort((a,b) => (order[a.status]-order[b.status]) || (sevO[a.severity]-sevO[b.severity]) || (a.date<b.date?1:-1));
  return head + `<div class="panel dl">${list.map(i => issueRow(i)).join('') || '<div class="empty"><p>Brak usterek w tym filtrze.</p></div>'}</div>`;
}

async function setIssueStatus(id, status){
  if (!db) return;
  const body = {status, updatedAt:new Date().toISOString()};
  if (myId) body.updatedBy = myId;
  if (status==='naprawione') body.resolvedAt = today();
  try {
    await db.collection('issues').doc(id).update(body);
    toast(status==='naprawione' ? 'Oznaczono jako naprawione' : 'Przekazano do naprawy');
  } catch(err){ handleWriteErr(err); }
}

/* Usterka → wpis do książki serwisowej jednym kliknięciem (zapis wpisu sam zamyka usterkę – trigger w bazie) */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-svc-issue]'); if (!t) return;
  e.preventDefault(); e.stopPropagation();
  const i = byId('issues', t.dataset.svcIssue); if (!i) return;
  const v = byId('vehicles', i.vehicleId) || {};
  openForm('serviceEntries', null, {vehicleId: i.vehicleId, issueIds: [i.id], date: today(), km: v.km || i.km || null, description: i.title});
}, true);
