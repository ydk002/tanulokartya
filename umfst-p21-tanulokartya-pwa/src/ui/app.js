// src/ui/app.js – Fő vezérlő: navigáció, Service Worker, minta pakli inicializálás, offline állapot

import {
  megnyitDb,
  listazPaklikat,
  lekerdezEsedekesKartyak,
  importalPakliJson,
  maiDatumStr
} from '../db.js';
import { initTanulasNezet, renderTanulasNezet } from './study.js';
import { initPaklikNezet, renderPaklikNezet } from './decks.js';
import { renderStatisztikaNezet } from './stats.js';
import { initIoNezet, renderIoNezet } from './io.js';
import { mutasdUzenetet } from './toast.js';

let aktivNezet = 'study';
let deferredInstallPrompt = null;

async function biztositAlapertelmezettMintaPaklit() {
  const paklik = await listazPaklikat(maiDatumStr());
  if (paklik.length > 0) {
    return;
  }

  try {
    const response = await fetch('./samples/anatomia.json');
    if (!response.ok) return;
    const jsonData = await response.json();
    await importalPakliJson(jsonData);
    mutasdUzenetet('Minta anatómia pakli (32 kártya, nervus vagus és agyidegek) betöltve!', 'info');
  } catch (err) {
    console.warn('Minta pakli automatikus betöltése sikertelen:', err);
  }
}

async function frissitFejlecJelvenyeket() {
  const ma = maiDatumStr();
  const esedekes = await lekerdezEsedekesKartyak(ma, null);
  const badge = document.getElementById('nav-due-badge');
  if (badge) {
    badge.textContent = String(esedekes.length);
    badge.hidden = esedekes.length === 0;
  }
}

async function valtNezetet(ujNezet) {
  aktivNezet = ujNezet;

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    const aktiv = btn.getAttribute('data-nav') === ujNezet;
    btn.classList.toggle('nav-btn-active', aktiv);
    btn.setAttribute('aria-current', aktiv ? 'page' : 'false');
  });

  const nezetek = ['study', 'decks', 'stats', 'io'];
  for (const n of nezetek) {
    const szekcio = document.getElementById(`view-${n}`);
    if (szekcio) {
      szekcio.hidden = n !== ujNezet;
    }
  }

  await frissitFejlecJelvenyeket();

  if (ujNezet === 'study') await renderTanulasNezet();
  else if (ujNezet === 'decks') await renderPaklikNezet();
  else if (ujNezet === 'stats') await renderStatisztikaNezet();
  else if (ujNezet === 'io') await renderIoNezet();
}

function beallitHalozatiAllapotot() {
  const jelzo = document.getElementById('network-status');
  if (!jelzo) return;

  const frissit = () => {
    const online = navigator.onLine;
    jelzo.textContent = online ? '🟢 Online (Offline-ra kész)' : '✈️ Offline mód (Helyi IndexedDB)';
    jelzo.className = `network-pill ${online ? 'net-online' : 'net-offline'}`;
  };

  window.addEventListener('online', () => {
    frissit();
    mutasdUzenetet('Kapcsolat helyreállt.', 'info');
  });
  window.addEventListener('offline', () => {
    frissit();
    mutasdUzenetet('Offline mód aktív – minden funkció és kártya elérhető helyileg!', 'info');
  });

  frissit();
}

function regisztralServiceWorkertEsTelepitest() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('./sw.js');
      } catch (err) {
        console.warn('Service Worker regisztrációs hiba:', err);
      }
    });
  }

  const installBtn = document.getElementById('btn-install-pwa');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtn) {
      installBtn.hidden = false;
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installBtn.hidden = true;
    });
  }
}

async function inditAlkalmazast() {
  await megnyitDb();
  await biztositAlapertelmezettMintaPaklit();

  const onAdatValtozas = () => {
    frissitFejlecJelvenyeket();
  };

  initTanulasNezet(onAdatValtozas);
  initPaklikNezet(onAdatValtozas);
  initIoNezet(onAdatValtozas);

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cel = btn.getAttribute('data-nav');
      if (cel) valtNezetet(cel);
    });
  });

  beallitHalozatiAllapotot();
  regisztralServiceWorkertEsTelepitest();

  await valtNezetet(aktivNezet);
}

document.addEventListener('DOMContentLoaded', () => {
  inditAlkalmazast().catch((err) => {
    console.error('Indítási hiba:', err);
    mutasdUzenetet(`Alkalmazás indítási hiba: ${err.message}`, 'error');
  });
});
