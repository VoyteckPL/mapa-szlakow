/* sandbox2 · interfejs: lista scen (ikony), przeciąganie węzłów i punktów, edycja drogi, kopiuj/wklej, cofnij. */
'use strict';
const S2 = {
  sc: parseScene(SCENY[0].t),
  name: SCENY[0].g + ' ' + SCENY[0].n,
  V: { cx: 0, cy: 0, z: 4 },
  B: null,
  sel: null,
  osie: true,
  hist: [],
};
const $ = (id) => document.getElementById(id);
const cv = $('cv');

function przelicz() {
  try {
    S2.B = buduj(S2.sc);
    S2.err = null;
  } catch (e) {
    S2.err = e;
    console.error(e);
  }
  if (S2.B) rysuj(cv, S2.V, S2.sc, S2.B, { osie: S2.osie, sel: S2.sel });
  $('stat').textContent = S2.err
    ? '⚠ ' + S2.err.message
    : Object.entries(S2.B.typy)
        .filter(([, t]) => t !== 'koniec')
        .map(([k, t]) => k + ' ' + t)
        .join(' · ');
  try {
    localStorage.setItem('sb2', JSON.stringify({ t: sceneText(S2.sc), n: S2.name }));
  } catch (e) {
    /* prywatne okno – bez zapisu */
  }
}
function zapamietaj() {
  S2.hist.push(sceneText(S2.sc));
  if (S2.hist.length > 60) S2.hist.shift();
}
function wczytaj(txt, name, fit) {
  S2.sc = parseScene(txt);
  S2.name = name || S2.name;
  S2.sel = null;
  if (fit !== false) dopasuj();
  edycja();
  przelicz();
}
function dopasuj() {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  for (const n of S2.sc.nodes.values()) {
    x0 = Math.min(x0, n.p[0]);
    y0 = Math.min(y0, n.p[1]);
    x1 = Math.max(x1, n.p[0]);
    y1 = Math.max(y1, n.p[1]);
  }
  S2.V.cx = (x0 + x1) / 2;
  S2.V.cy = (y0 + y1) / 2;
  S2.V.z = Math.min(cv.clientWidth / (x1 - x0 + 60), cv.clientHeight / (y1 - y0 + 60), 12);
}

/* ---------- lista scen ---------- */
function lista() {
  const grp = [...new Set(SCENY.map((s) => s.g))];
  $('sceny').innerHTML = grp
    .map(
      (g) =>
        `<div class="g">${g}</div><div class="grid">` +
        SCENY.map((s, i) => (s.g === g ? `<button class="sc" data-i="${i}" title="${g} ${s.n}">${ikona(s.t)}<span>${s.n}</span></button>` : '')).join('') +
        '</div>',
    )
    .join('');
  $('sceny').querySelectorAll('.sc').forEach(
    (b) =>
      (b.onclick = () => {
        const s = SCENY[+b.dataset.i];
        zapamietaj();
        wczytaj(s.t, s.g + ' ' + s.n);
        $('sceny').querySelectorAll('.sc').forEach((x) => x.classList.toggle('on', x === b));
      }),
  );
}

/* ---------- mysz / dotyk ---------- */
const W2S = (p) => [(p[0] - S2.V.cx) * S2.V.z + cv.clientWidth / 2, cv.clientHeight / 2 - (p[1] - S2.V.cy) * S2.V.z];
const S2W = (x, y) => [(x - cv.clientWidth / 2) / S2.V.z + S2.V.cx, (cv.clientHeight / 2 - y) / S2.V.z + S2.V.cy];
function trafienie(x, y) {
  for (const n of S2.sc.nodes.values()) {
    const s = W2S(n.p);
    if (Math.hypot(s[0] - x, s[1] - y) < 11) return { node: n };
  }
  for (const r of S2.sc.roads)
    for (let i = 0; i < r.mid.length; i++) {
      const s = W2S(r.mid[i]);
      if (Math.hypot(s[0] - x, s[1] - y) < 9) return { r, i };
    }
  const w = S2W(x, y);
  let best = null;
  for (const r of S2.sc.roads) {
    const P = roadPts(S2.sc, r);
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1],
        b = P[i],
        ab = G.sub(b, a),
        t = Math.max(0, Math.min(1, G.dot(G.sub(w, a), ab) / (G.dot(ab, ab) || 1))),
        d = G.dist(w, G.add(a, G.mul(ab, t)));
      if (d < hwOf(r) + 2 && (!best || d < best.d)) best = { road: r, seg: i, d, w };
    }
  }
  return best;
}
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  const h = trafienie(e.offsetX, e.offsetY);
  cv.setPointerCapture(e.pointerId);
  if (h && (h.node || h.r)) {
    zapamietaj();
    drag = { h, moved: false };
  } else drag = { pan: [e.offsetX, e.offsetY, S2.V.cx, S2.V.cy], h, moved: false };
});
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.moved = true;
  if (drag.pan) {
    const [x, y, cx, cy] = drag.pan;
    S2.V.cx = cx - (e.offsetX - x) / S2.V.z;
    S2.V.cy = cy + (e.offsetY - y) / S2.V.z;
  } else {
    const w = S2W(e.offsetX, e.offsetY).map((v) => Math.round(v * 2) / 2);
    if (drag.h.node) drag.h.node.p = w;
    else drag.h.r.mid[drag.h.i] = w;
  }
  przelicz();
});
cv.addEventListener('pointerup', () => {
  if (drag && !drag.moved && drag.pan) {
    S2.sel = drag.h && drag.h.road ? drag.h.road : null;
    edycja();
    przelicz();
  }
  if (drag && !drag.moved && !drag.pan) S2.hist.pop();
  drag = null;
});
cv.addEventListener('dblclick', (e) => {
  const h = trafienie(e.offsetX, e.offsetY);
  if (!h) return;
  zapamietaj();
  if (h.r) h.r.mid.splice(h.i, 1);
  else if (h.road) h.road.mid.splice(h.seg - 1, 0, h.w.map((v) => Math.round(v * 2) / 2));
  else return void S2.hist.pop();
  przelicz();
});
cv.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const w0 = S2W(e.offsetX, e.offsetY);
    S2.V.z = Math.max(0.3, Math.min(40, S2.V.z * Math.exp(-e.deltaY * 0.0015)));
    const w1 = S2W(e.offsetX, e.offsetY);
    S2.V.cx += w0[0] - w1[0];
    S2.V.cy += w0[1] - w1[1];
    przelicz();
  },
  { passive: false },
);
addEventListener('resize', przelicz);
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    $('bUndo').click();
  }
});

/* ---------- edycja zaznaczonej drogi (ikony, bez opisów) ---------- */
function edycja() {
  const r = S2.sel,
    el = $('ed');
  if (!r) return void (el.style.display = 'none');
  el.style.display = 'flex';
  el.innerHTML =
    `<b>${r.id}</b>` +
    Object.keys(TYPY)
      .map((t) => `<button data-t="${t}" class="${r.typ === t ? 'on' : ''}" title="${TYPY[t].n}">${t}</button>`)
      .join('') +
    `<span class="sep"></span><button data-p="-1" title="mniej pasów">−</button><b>${r.pasy}</b><button data-p="1" title="więcej pasów">+</button>` +
    `<button data-j class="${r.jedn ? 'on' : ''}" title="jednokierunkowa">→</button><button data-o title="odwróć kierunek">⇄</button>`;
  el.querySelectorAll('button').forEach(
    (b) =>
      (b.onclick = () => {
        zapamietaj();
        if (b.dataset.t) r.typ = b.dataset.t;
        if (b.dataset.p) r.pasy = Math.max(1, Math.min(8, r.pasy + +b.dataset.p));
        if ('j' in b.dataset) r.jedn = !r.jedn;
        if ('o' in b.dataset) {
          [r.a, r.b] = [r.b, r.a];
          r.mid.reverse();
        }
        edycja();
        przelicz();
      }),
  );
}

/* ---------- pasek narzędzi ---------- */
$('bUndo').onclick = () => {
  const t = S2.hist.pop();
  if (t) wczytaj(t, null, false);
};
$('bOsie').onclick = () => {
  S2.osie = !S2.osie;
  $('bOsie').classList.toggle('on', S2.osie);
  przelicz();
};
$('bFit').onclick = () => {
  dopasuj();
  przelicz();
};
$('bCopy').onclick = () => {
  const typy = Object.entries(S2.B ? S2.B.typy : {})
    .filter(([, t]) => t !== 'koniec')
    .map(([k, t]) => k + ' ' + t)
    .join(', ');
  const txt = `# sandbox2 · ${S2.name}\n# węzły: ${typy}\n` + sceneText(S2.sc);
  const ok = () => toast('Skopiowano – wklej Claude i napisz, przy którym węźle (np. W2) jest problem');
  try {
    navigator.clipboard.writeText(txt).then(ok, () => okno(txt));
  } catch (e) {
    okno(txt);
  }
};
$('bPaste').onclick = () => okno('', true);
function okno(txt, paste) {
  $('mod').style.display = 'flex';
  $('modT').value = txt;
  $('modOk').style.display = paste ? '' : 'none';
  $('modT').focus();
  $('modT').select();
}
$('modX').onclick = () => ($('mod').style.display = 'none');
$('modOk').onclick = () => {
  zapamietaj();
  const t = $('modT').value,
    m = /#\s*sandbox2\s*·\s*(.*)/.exec(t);
  wczytaj(t, m ? m[1].trim() : 'wklejona');
  $('mod').style.display = 'none';
};
function toast(t) {
  const e = $('toast');
  e.textContent = t;
  e.style.opacity = 1;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (e.style.opacity = 0), 2600);
}

/* ---------- start ---------- */
lista();
try {
  const z = JSON.parse(localStorage.getItem('sb2') || 'null');
  if (z && z.t) wczytaj(z.t, z.n);
  else wczytaj(SCENY[0].t, S2.name);
} catch (e) {
  wczytaj(SCENY[0].t, S2.name);
}
