// src/ui/io.js – Pakli JSON Import és Export (File API, letöltő link, előzetes séma-ellenőrzés)

import {
  listazPaklikat,
  validalPakliJson,
  importalPakliJson,
  exportalPakliJson,
  maiDatumStr
} from '../db.js';
import { escapeHtml, mutasdUzenetet } from './toast.js';

let onAdatValtozasCallback = null;
let utolsoValidaciosAllapot = null;

export function initIoNezet(onAdatValtozas) {
  onAdatValtozasCallback = onAdatValtozas;
}

export async function renderIoNezet() {
  const kontener = document.getElementById('io-container');
  if (!kontener) return;

  const paklik = await listazPaklikat(maiDatumStr());

  kontener.innerHTML = `
    <div class="crud-layout">
      <!-- BAL OSZLOP: JSON IMPORT SÉMA-ELLENŐRZÉSSEL -->
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>📥 Pakli importálása JSON fájlból</h2>
            <p class="muted-text">
              A rendszer mentés előtt ellenőrzi a teljes JSON sémát. Hibás fájl esetén a tranzakció el sem indul, így a meglévő adatok sértetlenek maradnak.
            </p>
          </div>
        </div>

        <div class="io-box">
          <label for="json-file-input" class="file-dropzone">
            <span class="dropzone-icon">📄</span>
            <strong>Válassz ki egy .json paklifájlt a gépedről</strong>
            <span class="muted-text">vagy illeszd be a JSON szöveget az alábbi mezőbe</span>
            <input type="file" id="json-file-input" accept=".json,application/json">
          </label>

          <div class="form-group" style="margin-top: 1rem;">
            <label for="json-textarea">JSON tartalom előnézete / szerkesztése:</label>
            <textarea
              id="json-textarea"
              class="input-textarea code-textarea"
              rows="9"
              placeholder='{\n  "pakli": { "nev": "Saját Anatómia Pakli" },\n  "kartyak": [\n    { "elolap": "Kérdés...", "hatlap": "Válasz..." }\n  ]\n}'
            ></textarea>
          </div>

          <div class="form-actions io-actions-wrap">
            <button type="button" class="btn btn-secondary" id="btn-load-sample">
              🩺 Minta anatómia pakli (samples/anatomia.json) betöltése
            </button>
            <button type="button" class="btn btn-secondary" id="btn-test-invalid-json">
              🧪 Hibás JSON védelem tesztelése
            </button>
            <button type="button" class="btn btn-primary" id="btn-validate-and-import">
              ✅ Séma-ellenőrzés és Importálás
            </button>
          </div>

          <div id="io-validation-feedback">
            ${
              utolsoValidaciosAllapot
                ? `
              <div class="validation-alert ${utolsoValidaciosAllapot.ok ? 'val-ok' : 'val-err'}">
                <strong>${escapeHtml(utolsoValidaciosAllapot.cim)}</strong>
                <p>${escapeHtml(utolsoValidaciosAllapot.reszletek)}</p>
              </div>
            `
                : ''
            }
          </div>
        </div>
      </section>

      <!-- JOBB OSZLOP: JSON EXPORT LETÖLTŐ LINKKEL -->
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>📤 Pakli exportálása és megosztása</h2>
            <p class="muted-text">
              Töltsd le bármelyik paklidat szabványos JSON fájlként, és oszd meg évfolyamtársaiddal!
            </p>
          </div>
        </div>

        <div class="export-list">
          ${
            paklik.length === 0
              ? `<p class="muted-text">Nincs exportálható pakli.</p>`
              : paklik
                  .map(
                    (p) => `
                <div class="export-item">
                  <div>
                    <div class="deck-item-title">${escapeHtml(p.nev)}</div>
                    <div class="muted-text">${p.kartyaSzam} kártya · Ma esedékes: ${p.esedekesSzam}</div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    data-export-deck="${escapeHtml(p.id)}"
                  >
                    ⬇️ JSON letöltése
                  </button>
                </div>
              `
                  )
                  .join('')
          }
        </div>
      </section>
    </div>
  `;

  kotIoEsemenyeket(kontener);
}

function kotIoEsemenyeket(kontener) {
  const fileInput = kontener.querySelector('#json-file-input');
  const textarea = kontener.querySelector('#json-textarea');

  if (fileInput && textarea) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        textarea.value = String(reader.result || '');
        try {
          const parsed = JSON.parse(textarea.value);
          const { pakli, kartyak } = validalPakliJson(parsed);
          utolsoValidaciosAllapot = {
            ok: true,
            cim: `✔️ Érvényes pakli séma („${pakli.nev}”)`,
            reszletek: `${kartyak.length} kártya ellenőrizve és készen áll az atomi tranzakciós importálásra.`
          };
        } catch (err) {
          utolsoValidaciosAllapot = {
            ok: false,
            cim: '❌ Séma-ellenőrzési hiba – az importálás le van tiltva erre a fájlra',
            reszletek: err.message
          };
        }
        frissitsValidaciosDoboz(kontener);
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  // Minta anatómia pakli betöltése
  const sampleBtn = kontener.querySelector('#btn-load-sample');
  if (sampleBtn && textarea) {
    sampleBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('./samples/anatomia.json');
        const text = await res.text();
        textarea.value = text;
        const eredmeny = await importalPakliJson(text);
        utolsoValidaciosAllapot = {
          ok: true,
          cim: '✔️ Minta anatómia pakli sikeresen importálva!',
          reszletek: `„${eredmeny.pakli.nev}” (${eredmeny.importaltKartyakSzama} db kártya) elmentve az IndexedDB-be.`
        };
        mutasdUzenetet('Minta anatómia pakli (32 kártya) importálva!', 'success');
        if (onAdatValtozasCallback) onAdatValtozasCallback();
        await renderIoNezet();
      } catch (err) {
        mutasdUzenetet(`Nem sikerült betölteni a mintát: ${err.message}`, 'error');
      }
    });
  }

  // Hibás JSON védelem demonstrációja
  const invalidBtn = kontener.querySelector('#btn-test-invalid-json');
  if (invalidBtn && textarea) {
    invalidBtn.addEventListener('click', async () => {
      const szandekosanHibas = JSON.stringify(
        {
          pakli: { nev: 'Hibás tesztpakli' },
          kartyak: [
            { elolap: 'Jó kártya', hatlap: 'Jó válasz', ef: 2.5 },
            { elolap: 'Hibás kártya üres hátlappal', hatlap: '', ef: 0.8 }
          ]
        },
        null,
        2
      );
      textarea.value = szandekosanHibas;
      try {
        await importalPakliJson(szandekosanHibas);
      } catch (err) {
        utolsoValidaciosAllapot = {
          ok: false,
          cim: '🛡️ Séma-ellenőrzés sikeresen megfogta a hibás JSON-t (meglévő adatok sértetlenek!)',
          reszletek: err.message
        };
        mutasdUzenetet(`Védelem működik: ${err.message}`, 'info');
        frissitsValidaciosDoboz(kontener);
      }
    });
  }

  // Validálás és importálás gomb
  const importBtn = kontener.querySelector('#btn-validate-and-import');
  if (importBtn && textarea) {
    importBtn.addEventListener('click', async () => {
      const nyersSzoveg = textarea.value.trim();
      if (!nyersSzoveg) {
        mutasdUzenetet('Válassz ki egy JSON fájlt vagy illeszd be a tartalmát!', 'error');
        return;
      }

      try {
        const eredmeny = await importalPakliJson(nyersSzoveg);
        utolsoValidaciosAllapot = {
          ok: true,
          cim: `✔️ Sikeres atomi import: „${eredmeny.pakli.nev}”`,
          reszletek: `${eredmeny.importaltKartyakSzama} kártya elmentve egyetlen IndexedDB tranzakcióban.`
        };
        mutasdUzenetet(
          `Importálva: „${eredmeny.pakli.nev}” (${eredmeny.importaltKartyakSzama} kártya)`,
          'success'
        );
        if (onAdatValtozasCallback) onAdatValtozasCallback();
        await renderIoNezet();
      } catch (err) {
        utolsoValidaciosAllapot = {
          ok: false,
          cim: '❌ Importálás visszautasítva – meglévő adatok nem módosultak',
          reszletek: err.message
        };
        mutasdUzenetet(err.message, 'error');
        frissitsValidaciosDoboz(kontener);
      }
    });
  }

  // Export letöltő link generálása
  kontener.querySelectorAll('[data-export-deck]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pakliId = btn.getAttribute('data-export-deck');
      try {
        const adat = await exportalPakliJson(pakliId);
        const jsonString = JSON.stringify(adat, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const fajlNevAlap = adat.pakli.nev
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        const a = document.createElement('a');
        a.href = url;
        a.download = `${fajlNevAlap || 'pakli'}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        mutasdUzenetet(`„${adat.pakli.nev}” exportálva JSON fájlba!`, 'success');
      } catch (err) {
        mutasdUzenetet(err.message, 'error');
      }
    });
  });
}

function frissitsValidaciosDoboz(kontener) {
  const cel = kontener.querySelector('#io-validation-feedback');
  if (!cel || !utolsoValidaciosAllapot) return;
  cel.innerHTML = `
    <div class="validation-alert ${utolsoValidaciosAllapot.ok ? 'val-ok' : 'val-err'}">
      <strong>${escapeHtml(utolsoValidaciosAllapot.cim)}</strong>
      <p>${escapeHtml(utolsoValidaciosAllapot.reszletek)}</p>
    </div>
  `;
}
