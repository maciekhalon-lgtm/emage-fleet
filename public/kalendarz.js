/* Emage FLEET — wspólne dla grafiku: dni tygodnia i początek tygodnia */
'use strict';
const DOW = ['pn','wt','śr','cz','pt','so','nd'];
function mondayOf(iso){ const d = parse(iso); d.setDate(d.getDate() - (d.getDay()+6)%7); return isoOf(d); }
let calStart = mondayOf(today());
