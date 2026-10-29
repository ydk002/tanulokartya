// src/ui/decks.js – Paklik és kártyák teljes CRUD kezelőfelülete

import {
  listazPaklikat,
  mentPaklit,
  torolPaklit,
  listazKartyakat,
  mentKartyat,
  torolKartyat,
  maiDatumStr
} from '../db.js';
import { escapeHtml, mutasdUzenetet } from './toast.js';
import { beallitTanulasiPaklit } from './study.js';

let aktivPakliId = null;
let szerkesztettPakliId = null;
let szerkesztettKartyaId = null;
let kartyaKeresoSzoveg = '';
let onAdatValtozasCallback = null;

export function initPaklikNezet(onAdatValtozas) {
  onAdatValtozasCallback = onAdatValtozas;
}

export async function renderPaklikNezet() {
  const kontener = document.getElementById('decks-container');
  if (!kontener) return;

  const ma = maiDatumStr();
  const paklik = await listazPaklikat(ma);

  if (!aktivPakliId && paklik.length > 0) {
    aktivPakliId = paklik[0].id;
  } else if (aktivPakliId && !paklik.some((p) => p.id === aktivPakliId)) {
    aktivPakliId = paklik[0]?.id || null;
  }

  const aktivPakli = paklik.find((p) => p.id === aktivPakliId) || null;
  const szerkesztettPakli = paklik.find((p) => p.id === szerkesztettPakliId) || null;

  let kartyak = [];
  if (aktivPakli) {
    kartyak = await listazKartyakat(aktivPakli.id);
  }
  const szerkesztettKartya = kartyak.find((k) => k.id === szerkesztettKartyaId) || null;

  const szurtKartyak = kartyak.filter((k) => {
    if (!kartyaKeresoSzoveg.trim()) return true;
    const q = kartyaKeresoSzoveg.toLowerCase();
    return k.elolap.toLowerCase().includes(q) || k.hatlap.toLowerCase().includes(q);
  });

  kontener.innerHTML = `
    <div class="crud-layout">
      <!-- BAL OSZLOP: PAKLIK CRUD -->
      <section class="panel">
        <div class="panel-header">
          <h2>📚 Paklik (${paklik.length})</h2>
        </div>

        <form id="form-deck" class="crud-form">
          <h3>${szerkesztettPakli ? '✏️ Pakli szerkesztése' : '➕ Új pakli létrehozása'}</h3>
          <input type="hidden" id="deck-id" value="${escapeHtml(szerkesztettPakli?.id || '')}">
          <div class="form-group">
            <label for="deck-name">Pakli neve *</label>
            <input
              type="text"
              id="deck-name"
              class="input-text"
              placeholder="pl. Neuroanatómia – Agyidegek"
              value="${escapeHtml(szerkesztettPakli?.nev || '')}"
              required
            >
          </div>
          <div class="form-group">
            <label for="deck-desc">Leírás</label>
            <input
              type="text"
              id="deck-desc"
              class="input-text"
              placeholder="pl. I–XII. agyidegek magvai, kilépési helyei és ágai"
              value="${escapeHtml(szerkesztettPakli?.leiras || '')}"
            >
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="btn-cancel-deck" ${szerkesztettPakli ? '' : 'hidden'}>
              Mégse
            </button>
            <button type="submit" class="btn btn-primary">
              ${szerkesztettPakli ? 'Pakli mentése' : 'Pakli hozzáadása'}
            </button>
          </div>
        </form>

        <div class="deck-list">
          ${
            paklik.length === 0
              ? `<p class="muted-text">Még nincs egyetlen pakli sem. Hozz létre egyet fent, vagy importálj JSON fájlt!</p>`
              : paklik
                  .map(
                    (p) => `
                <div class="deck-item ${p.id === aktivPakliId ? 'deck-item-active' : ''}" data-select-deck="${escapeHtml(p.id)}">
                  <div class="deck-item-main">
                    <div class="deck-item-title">${escapeHtml(p.nev)}</div>
                    ${p.leiras ? `<div class="deck-item-desc">${escapeHtml(p.leiras)}</div>` : ''}
                    <div class="deck-item-badges">
                      <span class="badge">${p.kartyaSzam} kártya</span>
                      <span class="badge ${p.esedekesSzam > 0 ? 'badge-due' : 'badge-done'}">
                        Ma esedékes: ${p.esedekesSzam}
                      </span>
                    </div>
                  </div>
                  <div class="deck-item-actions">
                    <button type="button" class="btn btn-sm btn-primary" data-study-deck="${escapeHtml(p.id)}" title="Tanulás indítása ebből a pakliból">
                      Tanulás
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" data-edit-deck="${escapeHtml(p.id)}" title="Pakli átnevezése / szerkesztése">
                      Szerk.
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" data-delete-deck="${escapeHtml(p.id)}" title="Pakli és kártyáinak törlése">
                      Törlés
                    </button>
                  </div>
                </div>
              `
                  )
                  .join('')
          }
        </div>
      </section>

      <!-- JOBB OSZLOP: KIVÁLASZTOTT PAKLI KÁRTYÁINAK CRUD KEZELÉSE -->
      <section class="panel">
        ${
          !aktivPakli
            ? `<div class="empty-state"><p>Válassz ki vagy hozz létre egy paklit a bal oldalon a kártyák kezeléséhez.</p></div>`
            : `
          <div class="panel-header">
            <div>
              <h2>🗂️ Kártyák: ${escapeHtml(aktivPakli.nev)}</h2>
              <p class="muted-text">Összesen ${kartyak.length} kártya ebben a pakliban</p>
            </div>
          </div>

          <form id="form-card" class="crud-form">
            <h3>${szerkesztettKartya ? '✏️ Kártya szerkesztése' : '➕ Új kártya hozzáadása a paklihoz'}</h3>
            <input type="hidden" id="card-id" value="${escapeHtml(szerkesztettKartya?.id || '')}">
            <div class="form-group">
              <label for="card-front">Előlap (Kérdés) *</label>
              <textarea
                id="card-front"
                class="input-textarea"
                rows="2"
                placeholder="pl. Melyek a nervus vagus (X.) nyaki ágai?"
                required
              >${escapeHtml(szerkesztettKartya?.elolap || '')}</textarea>
            </div>
            <div class="form-group">
              <label for="card-back">Hátlap (Válasz) *</label>
              <textarea
                id="card-back"
                class="input-textarea"
                rows="3"
                placeholder="pl. Rami pharyngei, n. laryngeus superior, rami cardiaci cervicales..."
                required
              >${escapeHtml(szerkesztettKartya?.hatlap || '')}</textarea>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel-card" ${szerkesztettKartya ? '' : 'hidden'}>
                Mégse
              </button>
              <button type="submit" class="btn btn-primary">
                ${szerkesztettKartya ? 'Kártya frissítése' : 'Kártya mentése'}
              </button>
            </div>
          </form>

          <div class="card-filter-bar">
            <input
              type="search"
              id="card-search"
              class="input-text"
              placeholder="🔍 Keresés a pakli kártyáiban (előlap vagy hátlap)..."
              value="${escapeHtml(kartyaKeresoSzoveg)}"
            >
          </div>

          <div class="cards-table-wrapper">
            ${
              szurtKartyak.length === 0
                ? `<p class="muted-text">Nincs megjeleníthető kártya.</p>`
                : szurtKartyak
                    .map(
                      (k) => `
                  <div class="card-row">
                    <div class="card-row-content">
                      <div class="card-row-front"><strong>Q:</strong> ${escapeHtml(k.elolap)}</div>
                      <div class="card-row-back"><strong>A:</strong> ${escapeHtml(k.hatlap)}</div>
                      <div class="card-row-meta">
                        <span>EF: <strong>${Number(k.ef ?? 2.5).toFixed(2)}</strong></span>
                        <span>Intervallum: <strong>${k.intervallum ?? 0} nap</strong></span>
                        <span>Ismétlés: <strong>${k.ismetles ?? 0}×</strong></span>
                        <span class="${k.kovetkezo <= ma ? 'text-due' : ''}">
                          Esedékes: <strong>${escapeHtml(k.kovetkezo)}</strong>
                        </span>
                      </div>
                    </div>
                    <div class="card-row-actions">
                      <button type="button" class="btn btn-sm btn-secondary" data-edit-card="${escapeHtml(k.id)}">
                        Szerk.
                      </button>
                      <button type="button" class="btn btn-sm btn-secondary" data-reset-card="${escapeHtml(k.id)}" title="Ismétlési állapot alaphelyzetbe állítása (ma esedékes)">
                        Nulláz
                      </button>
                      <button type="button" class="btn btn-sm btn-danger" data-delete-card="${escapeHtml(k.id)}">
                        Törlés
                      </button>
                    </div>
                  </div>
                `
                    )
                    .join('')
            }
          </div>
        `
        }
      </section>
    </div>
  `;

  kotPakliEsKartyaEsemenyeket(kontener, kartyak);
}

function kotPakliEsKartyaEsemenyeket(kontener, kartyak) {
  // Pakli űrlap beküldése
  const pakliForm = kontener.querySelector('#form-deck');
  if (pakliForm) {
    pakliForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = kontener.querySelector('#deck-id').value.trim();
      const nev = kontener.querySelector('#deck-name').value.trim();
      const leiras = kontener.querySelector('#deck-desc').value.trim();

      try {
        const mentett = await mentPaklit({ id: id || undefined, nev, leiras });
        aktivPakliId = mentett.id;
        szerkesztettPakliId = null;
        mutasdUzenetet(`Pakli elmentve: „${mentett.nev}”`, 'success');
        if (onAdatValtozasCallback) onAdatValtozasCallback();
        await renderPaklikNezet();
      } catch (err) {
        mutasdUzenetet(err.message, 'error');
      }
    });
  }

  const cancelDeckBtn = kontener.querySelector('#btn-cancel-deck');
  if (cancelDeckBtn) {
    cancelDeckBtn.addEventListener('click', () => {
      szerkesztettPakliId = null;
      renderPaklikNezet();
    });
  }

  // Pakli kiválasztása
  kontener.querySelectorAll('[data-select-deck]').forEach((elem) => {
    elem.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      aktivPakliId = elem.getAttribute('data-select-deck');
      szerkesztettKartyaId = null;
      renderPaklikNezet();
    });
  });

  // Tanulás indítása adott pakliból
  kontener.querySelectorAll('[data-study-deck]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pakliId = btn.getAttribute('data-study-deck');
      beallitTanulasiPaklit(pakliId);
      document.querySelector('[data-nav="study"]')?.click();
    });
  });

  // Pakli szerkesztése
  kontener.querySelectorAll('[data-edit-deck]').forEach((btn) => {
    btn.addEventListener('click', () => {
      szerkesztettPakliId = btn.getAttribute('data-edit-deck');
      aktivPakliId = szerkesztettPakliId;
      renderPaklikNezet();
    });
  });

  // Pakli törlése
  kontener.querySelectorAll('[data-delete-deck]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pakliId = btn.getAttribute('data-delete-deck');
      if (!window.confirm('Biztosan törlöd ezt a paklit és az összes benne lévő kártyát?')) {
        return;
      }
      await torolPaklit(pakliId);
      if (aktivPakliId === pakliId) aktivPakliId = null;
      if (szerkesztettPakliId === pakliId) szerkesztettPakliId = null;
      mutasdUzenetet('Pakli és kártyái törölve.', 'info');
      if (onAdatValtozasCallback) onAdatValtozasCallback();
      await renderPaklikNezet();
    });
  });

  // Kártya űrlap beküldése
  const kartyaForm = kontener.querySelector('#form-card');
  if (kartyaForm) {
    kartyaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = kontener.querySelector('#card-id').value.trim();
      const elolap = kontener.querySelector('#card-front').value.trim();
      const hatlap = kontener.querySelector('#card-back').value.trim();

      try {
        await mentKartyat({
          id: id || undefined,
          pakliId: aktivPakliId,
          elolap,
          hatlap
        });
        szerkesztettKartyaId = null;
        mutasdUzenetet(id ? 'Kártya frissítve!' : 'Új kártya hozzáadva!', 'success');
        if (onAdatValtozasCallback) onAdatValtozasCallback();
        await renderPaklikNezet();
      } catch (err) {
        mutasdUzenetet(err.message, 'error');
      }
    });
  }

  const cancelCardBtn = kontener.querySelector('#btn-cancel-card');
  if (cancelCardBtn) {
    cancelCardBtn.addEventListener('click', () => {
      szerkesztettKartyaId = null;
      renderPaklikNezet();
    });
  }

  // Kártya keresőmező
  const searchInput = kontener.querySelector('#card-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      kartyaKeresoSzoveg = e.target.value;
      renderPaklikNezet();
    });
  }

  // Kártya szerkesztése
  kontener.querySelectorAll('[data-edit-card]').forEach((btn) => {
    btn.addEventListener('click', () => {
      szerkesztettKartyaId = btn.getAttribute('data-edit-card');
      renderPaklikNezet();
    });
  });

  // Kártya SM-2 állapotának visszaállítása (ma esedékesre)
  kontener.querySelectorAll('[data-reset-card]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-reset-card');
      const k = kartyak.find((item) => item.id === id);
      if (!k) return;
      await mentKartyat({
        ...k,
        ef: 2.5,
        intervallum: 0,
        ismetles: 0,
        kovetkezo: maiDatumStr(),
        utolsoIsmetles: null
      });
      mutasdUzenetet('Kártya ismétlési állapota alaphelyzetbe állítva (ma esedékes).', 'info');
      if (onAdatValtozasCallback) onAdatValtozasCallback();
      await renderPaklikNezet();
    });
  });

  // Kártya törlése
  kontener.querySelectorAll('[data-delete-card]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-card');
      await torolKartyat(id);
      if (szerkesztettKartyaId === id) szerkesztettKartyaId = null;
      mutasdUzenetet('Kártya törölve.', 'info');
      if (onAdatValtozasCallback) onAdatValtozasCallback();
      await renderPaklikNezet();
    });
  });
}
