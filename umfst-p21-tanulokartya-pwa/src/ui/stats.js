// src/ui/stats.js – Statisztika (ma esedékes, új, tanult) + 30 napos előrejelzés oszlopdiagramon

import {
  lekerdezStatisztika,
  listazPaklikat,
  futtatTeljesitmenyBenchmark,
  maiDatumStr
} from '../db.js';
import { escapeHtml, mutasdUzenetet } from './toast.js';

let kivalasztottStatPakliId = '';
let utolsoBenchmarkEredmeny = null;

export async function renderStatisztikaNezet() {
  const kontener = document.getElementById('stats-container');
  if (!kontener) return;

  const ma = maiDatumStr();
  const [paklik, stat] = await Promise.all([
    listazPaklikat(ma),
    lekerdezStatisztika(ma, kivalasztottStatPakliId || null)
  ]);

  const maxDarab = Math.max(1, ...stat.elorejelzes30Nap.map((n) => n.darab));

  const pakliOpciok = [
    `<option value="">Összes pakli együttesen</option>`,
    ...paklik.map(
      (p) =>
        `<option value="${escapeHtml(p.id)}" ${p.id === kivalasztottStatPakliId ? 'selected' : ''}>
          ${escapeHtml(p.nev)}
        </option>`
    )
  ].join('');

  kontener.innerHTML = `
    <div class="stats-header-bar">
      <div>
        <h2>📊 Tanulási statisztika és 30 napos előrejelzés</h2>
        <p class="muted-text">Az SM-2 algoritmus által ütemezett kártyák eloszlása</p>
      </div>
      <div class="study-deck-selector">
        <label for="stats-deck-select">Szűrés paklira:</label>
        <select id="stats-deck-select" class="input-select">${pakliOpciok}</select>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card kpi-due">
        <span class="kpi-label">Ma esedékes</span>
        <strong class="kpi-value" id="stat-due-count">${stat.esedekesMa}</strong>
        <span class="kpi-sub">kovetkezo ≤ ${ma}</span>
      </div>
      <div class="kpi-card kpi-new">
        <span class="kpi-label">Új (még nem tanult)</span>
        <strong class="kpi-value" id="stat-new-count">${stat.uj}</strong>
        <span class="kpi-sub">ismétlésszám = 0</span>
      </div>
      <div class="kpi-card kpi-learned">
        <span class="kpi-label">Tanult kártyák</span>
        <strong class="kpi-value" id="stat-learned-count">${stat.tanult}</strong>
        <span class="kpi-sub">ismétlésszám ≥ 1</span>
      </div>
      <div class="kpi-card kpi-total">
        <span class="kpi-label">Összes kártya</span>
        <strong class="kpi-value" id="stat-total-count">${stat.osszes}</strong>
        <span class="kpi-sub">IndexedDB-ben tárolva</span>
      </div>
    </div>

    <section class="panel chart-panel">
      <div class="panel-header">
        <h3>📅 30 napos esedékességi előrejelzés (Oszlopdiagram)</h3>
        <span class="muted-text">Napi esedékes kártyák száma a következő 30 napban</span>
      </div>

      <div class="bar-chart-scroll">
        <div class="bar-chart" role="img" aria-label="30 napos esedékességi előrejelzés oszlopdiagram">
          ${stat.elorejelzes30Nap
            .map((nap) => {
              const magassagSzazalek = nap.darab === 0 ? 3 : Math.max(8, Math.round((nap.darab / maxDarab) * 100));
              const maE = nap.napIndex === 0;
              return `
                <div class="bar-col ${maE ? 'bar-col-today' : ''}" title="${nap.datum}: ${nap.darab} esedékes kártya">
                  <span class="bar-count">${nap.darab > 0 ? nap.darab : ''}</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill ${nap.darab > 0 ? 'bar-fill-active' : 'bar-fill-zero'}"
                      style="height: ${magassagSzazalek}%"
                    ></div>
                  </div>
                  <span class="bar-label">${maE ? 'Ma' : escapeHtml(nap.cimke)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    </section>

    <section class="panel benchmark-panel">
      <div class="panel-header">
        <div>
          <h3>⚡ IndexedDB Index Teljesítmény-teszt (1000 kártya &lt; 50 ms)</h3>
          <p class="muted-text">
            Elfogadási kritérium: 1000 kártyás pakli importálása után a ma esedékes kártyák lekérdezése
            <code>by_kovetkezo</code> indexszel és <code>IDBKeyRange.upperBound(ma)</code> használatával 50 ms alatt lefut.
          </p>
        </div>
        <button type="button" class="btn btn-primary" id="btn-run-benchmark">
          1000 kártyás benchmark futtatása
        </button>
      </div>

      <div id="benchmark-result">
        ${
          utolsoBenchmarkEredmeny
            ? `
          <div class="benchmark-box ${utolsoBenchmarkEredmeny.sikeres ? 'bench-pass' : 'bench-fail'}">
            <strong>${utolsoBenchmarkEredmeny.sikeres ? '✅ SIKERES (< 50 ms)' : '❌ TÚLLÉPTE A KERETET'}</strong>
            <span>1000 kártya atomi import ideje: <strong>${utolsoBenchmarkEredmeny.importIdoMs} ms</strong></span>
            <span>Indexelt esedékesség lekérdezés: <strong>${utolsoBenchmarkEredmeny.lekerdezesIdoMs} ms</strong> (találat: ${utolsoBenchmarkEredmeny.talaltEsedekes} db)</span>
          </div>
        `
            : ''
        }
      </div>
    </section>
  `;

  const select = kontener.querySelector('#stats-deck-select');
  if (select) {
    select.addEventListener('change', (e) => {
      kivalasztottStatPakliId = e.target.value;
      renderStatisztikaNezet();
    });
  }

  const benchBtn = kontener.querySelector('#btn-run-benchmark');
  if (benchBtn) {
    benchBtn.addEventListener('click', async () => {
      benchBtn.disabled = true;
      benchBtn.textContent = 'Mérés folyamatban...';
      try {
        utolsoBenchmarkEredmeny = await futtatTeljesitmenyBenchmark(false);
        mutasdUzenetet(
          `Benchmark kész: lekérdezés ${utolsoBenchmarkEredmeny.lekerdezesIdoMs} ms (< 50 ms)!`,
          'success'
        );
        await renderStatisztikaNezet();
      } catch (err) {
        mutasdUzenetet(err.message, 'error');
      }
    });
  }
}
