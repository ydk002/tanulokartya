// src/ui/study.js – Tanulási mód (előlap -> Mutasd -> hátlap -> SM-2 értékelés + billentyűparancsok)

import { sm2, BUTTON_TO_Q, elonezetIntervallumok } from '../sm2.js';
import {
  listazPaklikat,
  lekerdezEsedekesKartyak,
  mentKartyat,
  maiDatumStr
} from '../db.js';
import { escapeHtml, mutasdUzenetet } from './toast.js';

let kivalasztottPakliId = '';
let esedekesSor = [];
let aktualisIndex = 0;
let hatlapLathato = false;
let munkamenetKeszDb = 0;
let billentyuHallgatoRegisztralva = false;
let onAdatValtozasCallback = null;

/**
 * Beállítja a kiválasztott paklit kívülről (pl. Paklik nézetből indított tanuláskor).
 * @param {string} pakliId
 */
export function beallitTanulasiPaklit(pakliId) {
  kivalasztottPakliId = pakliId || '';
}

/**
 * Inicializálja a tanulási nézetet és a globális billentyűparancsokat (Space, 1-4).
 * @param {() => void} onAdatValtozas
 */
export function initTanulasNezet(onAdatValtozas) {
  onAdatValtozasCallback = onAdatValtozas;

  if (!billentyuHallgatoRegisztralva) {
    window.addEventListener('keydown', kezeldBillentyuzetParancsot);
    billentyuHallgatoRegisztralva = true;
  }
}

/**
 * Billentyűparancsok kezelése:
 * - Space: hátlap megjelenítése (ha az előlap látszik)
 * - 1: Újra (q=1), 2: Nehéz (q=3), 3: Jó (q=4), 4: Könnyű (q=5) (ha a hátlap látszik)
 * @param {KeyboardEvent} e
 */
function kezeldBillentyuzetParancsot(e) {
  const tanulasSzekcio = document.getElementById('view-study');
  if (!tanulasSzekcio || tanulasSzekcio.hidden) return;

  const aktivElem = document.activeElement;
  if (
    aktivElem &&
    (aktivElem.tagName === 'INPUT' ||
      aktivElem.tagName === 'TEXTAREA' ||
      aktivElem.tagName === 'SELECT' ||
      aktivElem.isContentEditable)
  ) {
    return;
  }

  const aktualisKartya = esedekesSor[aktualisIndex];
  if (!aktualisKartya) return;

  if ((e.code === 'Space' || e.key === ' ') && !hatlapLathato) {
    e.preventDefault();
    felfedHatlapot();
    return;
  }

  if (hatlapLathato) {
    if (e.key === '1') {
      e.preventDefault();
      ertekeldAktualisKartyat(BUTTON_TO_Q.ujra, 'Újra');
    } else if (e.key === '2') {
      e.preventDefault();
      ertekeldAktualisKartyat(BUTTON_TO_Q.nehez, 'Nehéz');
    } else if (e.key === '3') {
      e.preventDefault();
      ertekeldAktualisKartyat(BUTTON_TO_Q.jo, 'Jó');
    } else if (e.key === '4') {
      e.preventDefault();
      ertekeldAktualisKartyat(BUTTON_TO_Q.konnyu, 'Könnyű');
    }
  }
}

/**
 * Betölti a ma esedékes kártyákat az IndexedDB indexből és kirendereli a tanulókártyát.
 */
export async function renderTanulasNezet() {
  const kontener = document.getElementById('study-container');
  if (!kontener) return;

  const ma = maiDatumStr();
  const [paklik, esedekes] = await Promise.all([
    listazPaklikat(ma),
    lekerdezEsedekesKartyak(ma, kivalasztottPakliId || null)
  ]);

  const pakliNevMap = new Map(paklik.map((p) => [p.id, p.nev]));
  esedekesSor = esedekes;
  aktualisIndex = 0;
  hatlapLathato = false;

  renderAktualisKartyaAllapot(paklik, pakliNevMap);
}

function felfedHatlapot() {
  hatlapLathato = true;
  const hatlapBlokk = document.getElementById('study-back-section');
  const mutasdGomb = document.getElementById('btn-show-answer');
  const ertekeloSav = document.getElementById('study-rating-bar');

  if (hatlapBlokk) hatlapBlokk.hidden = false;
  if (mutasdGomb) mutasdGomb.hidden = true;
  if (ertekeloSav) ertekeloSav.hidden = false;
}

async function ertekeldAktualisKartyat(q, cimke) {
  const kartya = esedekesSor[aktualisIndex];
  if (!kartya) return;

  const ma = new Date();
  const frissitettSm2 = sm2(kartya, q, ma);

  const mentendo = {
    ...kartya,
    ef: frissitettSm2.ef,
    intervallum: frissitettSm2.intervallum,
    ismetles: frissitettSm2.ismetles,
    kovetkezo: frissitettSm2.kovetkezo,
    utolsoIsmetles: ma.toISOString()
  };

  await mentKartyat(mentendo);
  munkamenetKeszDb += 1;

  mutasdUzenetet(
    `${cimke} • Következő ismétlés: ${frissitettSm2.intervallum} nap múlva (${frissitettSm2.kovetkezo}, EF: ${frissitettSm2.ef.toFixed(2)})`,
    q < 3 ? 'info' : 'success'
  );

  aktualisIndex += 1;
  hatlapLathato = false;

  if (onAdatValtozasCallback) {
    onAdatValtozasCallback();
  }

  const maStr = maiDatumStr();
  const paklik = await listazPaklikat(maStr);
  const pakliNevMap = new Map(paklik.map((p) => [p.id, p.nev]));
  renderAktualisKartyaAllapot(paklik, pakliNevMap);
}

function renderAktualisKartyaAllapot(paklik, pakliNevMap) {
  const kontener = document.getElementById('study-container');
  if (!kontener) return;

  const hatralevo = Math.max(0, esedekesSor.length - aktualisIndex);
  const aktualisKartya = esedekesSor[aktualisIndex];

  const pakliOpciok = [
    `<option value="">Összes pakli (${paklik.reduce((acc, p) => acc + p.esedekesSzam, 0)} esedékes)</option>`,
    ...paklik.map(
      (p) =>
        `<option value="${escapeHtml(p.id)}" ${p.id === kivalasztottPakliId ? 'selected' : ''}>
          ${escapeHtml(p.nev)} (${p.esedekesSzam} / ${p.kartyaSzam})
        </option>`
    )
  ].join('');

  if (!aktualisKartya) {
    kontener.innerHTML = `
      <div class="study-toolbar">
        <div class="study-deck-selector">
          <label for="study-deck-select">Tanult pakli:</label>
          <select id="study-deck-select" class="input-select">${pakliOpciok}</select>
        </div>
        <div class="study-Counters">
          <span class="badge badge-due">Hátralévő ma: 0</span>
          <span class="badge badge-done">Ma átismételve: ${munkamenetKeszDb}</span>
        </div>
      </div>

      <div class="empty-study-card">
        <div class="empty-icon" aria-hidden="true">🎉</div>
        <h2>Minden ma esedékes kártyát átismételtél!</h2>
        <p>Kiváló munka! Az SM-2 algoritmus beütemezte a következő ismétléseket a memóriád megőrzéséhez.</p>
        <div class="empty-actions">
          <button type="button" class="btn btn-primary" id="btn-go-stats">30 napos előrejelzés megtekintése</button>
          <button type="button" class="btn btn-secondary" id="btn-go-decks">Paklik és kártyák kezelése</button>
        </div>
      </div>
    `;

    kotEsemenyeket(kontener);
    return;
  }

  const elonezet = elonezetIntervallumok(aktualisKartya);
  const pakliNev = pakliNevMap.get(aktualisKartya.pakliId) || 'Ismeretlen pakli';

  kontener.innerHTML = `
    <div class="study-toolbar">
      <div class="study-deck-selector">
        <label for="study-deck-select">Tanult pakli:</label>
        <select id="study-deck-select" class="input-select">${pakliOpciok}</select>
      </div>
      <div class="study-counters">
        <span class="badge badge-due" title="Ma esedékes kártyák száma">Hátralévő ma: ${hatralevo}</span>
        <span class="badge badge-done" title="Ebben a munkamenetben értékelt kártyák">Kész: ${munkamenetKeszDb}</span>
      </div>
    </div>

    <article class="flashcard" aria-live="polite">
      <header class="flashcard-meta">
        <span class="deck-pill">${escapeHtml(pakliNev)}</span>
        <span class="sm2-pill" title="Könnyűségi tényező (Easiness Factor) és eddigi sikeres ismétlések">
          EF: ${Number(aktualisKartya.ef ?? 2.5).toFixed(2)} · Ismétlés: ${aktualisKartya.ismetles ?? 0}× · Intervallum: ${aktualisKartya.intervallum ?? 0} nap
        </span>
      </header>

      <div class="flashcard-side flashcard-front">
        <div class="side-label">ELŐLAP (KÉRDÉS)</div>
        <div class="card-text">${escapeHtml(aktualisKartya.elolap).replace(/\n/g, '<br>')}</div>
      </div>

      <div id="study-back-section" class="flashcard-side flashcard-back" ${hatlapLathato ? '' : 'hidden'}>
        <div class="side-label">HÁTLAP (VÁLASZ)</div>
        <div class="card-text">${escapeHtml(aktualisKartya.hatlap).replace(/\n/g, '<br>')}</div>
      </div>

      <footer class="flashcard-actions">
        <button
          type="button"
          id="btn-show-answer"
          class="btn btn-primary btn-large btn-reveal"
          ${hatlapLathato ? 'hidden' : ''}
        >
          Mutasd a hátlapot <kbd>Space</kbd>
        </button>

        <div id="study-rating-bar" class="rating-grid" ${hatlapLathato ? '' : 'hidden'}>
          <button type="button" class="btn-rate rate-again" data-rate="ujra">
            <span class="rate-interval">${elonezet.ujra} nap</span>
            <span class="rate-title">Újra <kbd>1</kbd></span>
            <span class="rate-sub">q = 1 (elfelejtettem)</span>
          </button>
          <button type="button" class="btn-rate rate-hard" data-rate="nehez">
            <span class="rate-interval">${elonezet.nehez} nap</span>
            <span class="rate-title">Nehéz <kbd>2</kbd></span>
            <span class="rate-sub">q = 3 (nehezen ment)</span>
          </button>
          <button type="button" class="btn-rate rate-good" data-rate="jo">
            <span class="rate-interval">${elonezet.jo} nap</span>
            <span class="rate-title">Jó <kbd>3</kbd></span>
            <span class="rate-sub">q = 4 (helyes válasz)</span>
          </button>
          <button type="button" class="btn-rate rate-easy" data-rate="konnyu">
            <span class="rate-interval">${elonezet.konnyu} nap</span>
            <span class="rate-title">Könnyű <kbd>4</kbd></span>
            <span class="rate-sub">q = 5 (azonnal tudtam)</span>
          </button>
        </div>
      </footer>
    </article>

    <p class="keyboard-hint">
      Billentyűparancsok: <kbd>Space</kbd> Hátlap felfedése · <kbd>1</kbd> Újra · <kbd>2</kbd> Nehéz · <kbd>3</kbd> Jó · <kbd>4</kbd> Könnyű
    </p>
  `;

  kotEsemenyeket(kontener);
}

function kotEsemenyeket(kontener) {
  const select = kontener.querySelector('#study-deck-select');
  if (select) {
    select.addEventListener('change', (e) => {
      kivalasztottPakliId = e.target.value;
      renderTanulasNezet();
    });
  }

  const mutasdGomb = kontener.querySelector('#btn-show-answer');
  if (mutasdGomb) {
    mutasdGomb.addEventListener('click', () => felfedHatlapot());
  }

  const ertekeloGombok = kontener.querySelectorAll('[data-rate]');
  ertekeloGombok.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tipus = btn.getAttribute('data-rate');
      if (tipus === 'ujra') ertekeldAktualisKartyat(BUTTON_TO_Q.ujra, 'Újra');
      else if (tipus === 'nehez') ertekeldAktualisKartyat(BUTTON_TO_Q.nehez, 'Nehéz');
      else if (tipus === 'jo') ertekeldAktualisKartyat(BUTTON_TO_Q.jo, 'Jó');
      else if (tipus === 'konnyu') ertekeldAktualisKartyat(BUTTON_TO_Q.konnyu, 'Könnyű');
    });
  });

  const goStats = kontener.querySelector('#btn-go-stats');
  if (goStats) {
    goStats.addEventListener('click', () => {
      document.querySelector('[data-nav="stats"]')?.click();
    });
  }

  const goDecks = kontener.querySelector('#btn-go-decks');
  if (goDecks) {
    goDecks.addEventListener('click', () => {
      document.querySelector('[data-nav="decks"]')?.click();
    });
  }
}
