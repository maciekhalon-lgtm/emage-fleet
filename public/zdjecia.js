/* Emage FLEET — zdjęcia: zdjęcia do usterek, kosztów (paragony) oraz wydań i zwrotów aut */
'use strict';
const PHOTO_TYPES = ['image/jpeg','image/png','image/webp','image/gif'];
const MAX_PHOTOS = 3;

function photoStrip(ids){
  if (!ids || !ids.length) return '';
  return `<span class="thumbs">${ids.map(id => `<a data-file="${esc(id)}" href="#" target="_blank" rel="noopener" title="Otwórz zdjęcie"><img class="thumb" data-file="${esc(id)}" alt="Zdjęcie"></a>`).join('')}</span>`;
}

/* Pole formularza; `existing` to zdjęcia już zapisane przy wpisie (można je odpiąć). */
function photoField(prefix, existing = []){
  const have = existing.map(id => `<span class="thumb-edit">${photoStrip([id])}<button type="button" class="small ghost" data-rmphoto="${esc(id)}" aria-label="Usuń zdjęcie">✕</button></span>`).join('');
  if (!assetsNS) return existing.length ? `<div class="field full"><span class="label">Zdjęcia</span><span class="thumbs">${have}</span></div>`
    : `<div class="field full"><span class="label">Zdjęcia</span><span class="muted" style="font-size:13px">Dodawanie zdjęć nie jest dostępne na Twoim koncie.</span></div>`;
  const left = MAX_PHOTOS - existing.length;
  return `<div class="field full"><label for="${prefix}-photos">Zdjęcia (do ${MAX_PHOTOS}, JPG lub PNG)</label>
    ${have ? `<span class="thumbs">${have}</span>` : ''}
    ${left > 0 ? `<input id="${prefix}-photos" type="file" accept="${PHOTO_TYPES.join(',')}" multiple>` : '<span class="muted" style="font-size:13px">Osiągnięto limit zdjęć.</span>'}</div>`;
}

/* Wgrywa wybrane pliki; zwraca listę id albo null, gdy coś poszło nie tak (komunikat już pokazany). */
async function uploadPhotos(prefix, already = 0, max = MAX_PHOTOS){
  const el = $('#'+prefix+'-photos');
  const files = el && el.files ? [...el.files] : [];
  if (!files.length) return [];
  if (files.length + already > max){ toast('Możesz dodać najwyżej '+max+' zdjęć'); return null; }
  const bad = files.find(f => !PHOTO_TYPES.includes(f.type));
  if (bad){ toast('Plik „'+bad.name+'” nie jest zdjęciem JPG, PNG ani WebP'); return null; }
  const big = files.find(f => f.size > 10*1024*1024);
  if (big){ toast('Zdjęcie „'+big.name+'” jest większe niż 10 MB'); return null; }
  if (!assetsNS){ toast('Dodawanie zdjęć nie jest dostępne na Twoim koncie'); return null; }
  const ids = [];
  try {
    for (const f of files){ const up = await assetsNS.upload(f, {type: f.type}); ids.push(up.id); }
  } catch(err){
    toast(err && err.code==='quota_exceeded' ? 'Brak miejsca na pliki – usuń stare zdjęcia lub dokumenty' : 'Nie udało się wgrać zdjęcia');
    return null;
  }
  return ids;
}
