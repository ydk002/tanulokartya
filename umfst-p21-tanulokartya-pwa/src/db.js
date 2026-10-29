// src/db.js – Promise-alapú IndexedDB adatbázis réteg, séma-validáció és statisztika

export const DB_NEV = 'umfst_tanulokartya_db';
export const DB_VERZIO = 1;
export const STORE_PAKLIK = 'paklik';
export const STORE_KARTYAK = 'kartyak';

let dbPeldany = null;

/**
 * Mai dátum YYYY-MM-DD formátumban (UTC vagy helyi dátum alapján).
 * @param {Date|string} [datum=new Date()]
 * @returns {string}
 */
export function maiDatumStr(datum = new Date()) {
  if (typeof datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return datum;
  }
  const d = datum instanceof Date ? datum : new Date(datum);
  return d.toISOString().slice(0, 10);
}

/**
 * Egyedi azonosító generálása.
 * @param {string} [prefix='id']
 * @returns {string}
 */
export function egyediId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * IDBRequest csomagolása Promise-ba.
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB kérés hiba'));
  });
}

/**
 * IDBTransaction lezárásának megvárása Promise-ban.
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function promisifyTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB tranzakciós hiba'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB tranzakció megszakítva'));
  });
}

/**
 * Megnyitja (és szükség esetén létrehozza/frissíti) az IndexedDB adatbázist.
 * @returns {Promise<IDBDatabase>}
 */
export function megnyitDb() {
  if (dbPeldany) {
    return Promise.resolve(dbPeldany);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NEV, DB_VERZIO);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_PAKLIK)) {
        const pakliStore = db.createObjectStore(STORE_PAKLIK, { keyPath: 'id' });
        pakliStore.createIndex('by_nev', 'nev', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_KARTYAK)) {
        const kartyaStore = db.createObjectStore(STORE_KARTYAK, { keyPath: 'id' });
        // Index az esedékes kártyák gyors lekérdezéséhez: IDBKeyRange.upperBound(ma)
        kartyaStore.createIndex('by_kovetkezo', 'kovetkezo', { unique: false });
        // Index a paklihoz tartozó kártyák lekérdezéséhez
        kartyaStore.createIndex('by_pakli', 'pakliId', { unique: false });
        // Összetett index pakli + esedékesség alapú azonnali lekérdezéshez
        kartyaStore.createIndex('by_pakli_kovetkezo', ['pakliId', 'kovetkezo'], { unique: false });
      }
    };

    request.onsuccess = () => {
      dbPeldany = request.result;
      dbPeldany.onversionchange = () => {
        dbPeldany.close();
        dbPeldany = null;
      };
      resolve(dbPeldany);
    };

    request.onerror = () => {
      reject(request.error || new Error('Nem sikerült megnyitni az IndexedDB adatbázist.'));
    };
  });
}

// ============================================================================
// PAKLI CRUD MŰVELETEK
// ============================================================================

/**
 * Összes pakli lekérdezése kártyaszámmal és esedékes kártyaszámmal együtt.
 * @param {string} [ma=maiDatumStr()]
 */
export async function listazPaklikat(ma = maiDatumStr()) {
  const db = await megnyitDb();
  const tx = db.transaction([STORE_PAKLIK, STORE_KARTYAK], 'readonly');
  const pakliStore = tx.objectStore(STORE_PAKLIK);
  const kartyaStore = tx.objectStore(STORE_KARTYAK);
  const pakliIndex = kartyaStore.index('by_pakli');
  const pakliKovetkezoIndex = kartyaStore.index('by_pakli_kovetkezo');

  const paklik = await promisifyRequest(pakliStore.getAll());

  const eredmeny = await Promise.all(
    paklik.map(async (pakli) => {
      const osszes = await promisifyRequest(pakliIndex.count(IDBKeyRange.only(pakli.id)));
      const esedekes = await promisifyRequest(
        pakliKovetkezoIndex.count(IDBKeyRange.bound([pakli.id, '0000-00-00'], [pakli.id, ma]))
      );
      return {
        ...pakli,
        kartyaSzam: osszes,
        esedekesSzam: esedekes
      };
    })
  );

  return eredmeny.sort((a, b) => a.nev.localeCompare(b.nev, 'hu'));
}

/**
 * Egy pakli lekérdezése ID alapján.
 * @param {string} id
 */
export async function lekerdezPaklit(id) {
  const db = await megnyitDb();
  const tx = db.transaction(STORE_PAKLIK, 'readonly');
  return promisifyRequest(tx.objectStore(STORE_PAKLIK).get(id));
}

/**
 * Új pakli létrehozása vagy meglévő frissítése.
 * @param {{ id?: string, nev: string, leiras?: string, letrehozva?: string }} pakliAdat
 */
export async function mentPaklit(pakliAdat) {
  const nev = String(pakliAdat?.nev || '').trim();
  if (!nev) {
    throw new Error('A pakli neve nem lehet üres.');
  }
  const db = await megnyitDb();
  const tx = db.transaction(STORE_PAKLIK, 'readwrite');
  const store = tx.objectStore(STORE_PAKLIK);

  const most = new Date().toISOString();
  let meglevo = null;
  if (pakliAdat.id) {
    meglevo = await promisifyRequest(store.get(pakliAdat.id));
  }

  const pakli = {
    id: pakliAdat.id || egyediId('pakli'),
    nev,
    leiras: String(pakliAdat?.leiras || '').trim(),
    letrehozva: meglevo?.letrehozva || pakliAdat.letrehozva || most,
    frissitve: most
  };

  store.put(pakli);
  await promisifyTransaction(tx);
  return pakli;
}

/**
 * Pakli és az összes hozzá tartozó kártya törlése egyetlen atomi tranzakcióban.
 * @param {string} pakliId
 */
export async function torolPaklit(pakliId) {
  const db = await megnyitDb();
  const tx = db.transaction([STORE_PAKLIK, STORE_KARTYAK], 'readwrite');
  const pakliStore = tx.objectStore(STORE_PAKLIK);
  const kartyaStore = tx.objectStore(STORE_KARTYAK);
  const byPakli = kartyaStore.index('by_pakli');

  pakliStore.delete(pakliId);

  const kartyaKulcsok = await promisifyRequest(byPakli.getAllKeys(IDBKeyRange.only(pakliId)));
  for (const kulcs of kartyaKulcsok) {
    kartyaStore.delete(kulcs);
  }

  await promisifyTransaction(tx);
}

// ============================================================================
// KÁRTYA CRUD MŰVELETEK
// ============================================================================

/**
 * Egy pakli összes kártyájának lekérdezése.
 * @param {string} [pakliId] - Ha nincs megadva, az összes kártyát visszaadja
 */
export async function listazKartyakat(pakliId) {
  const db = await megnyitDb();
  const tx = db.transaction(STORE_KARTYAK, 'readonly');
  const store = tx.objectStore(STORE_KARTYAK);

  if (pakliId) {
    const index = store.index('by_pakli');
    return promisifyRequest(index.getAll(IDBKeyRange.only(pakliId)));
  }
  return promisifyRequest(store.getAll());
}

/**
 * Új kártya létrehozása vagy meglévő kártya módosítása.
 * @param {object} kartyaAdat
 */
export async function mentKartyat(kartyaAdat) {
  const elolap = String(kartyaAdat?.elolap || '').trim();
  const hatlap = String(kartyaAdat?.hatlap || '').trim();
  const pakliId = String(kartyaAdat?.pakliId || '').trim();

  if (!pakliId) {
    throw new Error('A kártyának tartoznia kell egy paklihoz (pakliId kötelező).');
  }
  if (!elolap || !hatlap) {
    throw new Error('A kártya előlapja és hátlapja sem lehet üres.');
  }

  const db = await megnyitDb();
  const tx = db.transaction(STORE_KARTYAK, 'readwrite');
  const store = tx.objectStore(STORE_KARTYAK);

  let meglevo = null;
  if (kartyaAdat.id) {
    meglevo = await promisifyRequest(store.get(kartyaAdat.id));
  }

  const ma = maiDatumStr();
  const kartya = {
    id: kartyaAdat.id || egyediId('kartya'),
    pakliId,
    elolap,
    hatlap,
    ef: typeof kartyaAdat.ef === 'number' ? kartyaAdat.ef : (meglevo?.ef ?? 2.5),
    intervallum: typeof kartyaAdat.intervallum === 'number' ? kartyaAdat.intervallum : (meglevo?.intervallum ?? 0),
    ismetles: typeof kartyaAdat.ismetles === 'number' ? kartyaAdat.ismetles : (meglevo?.ismetles ?? 0),
    kovetkezo: kartyaAdat.kovetkezo || meglevo?.kovetkezo || ma,
    letrehozva: meglevo?.letrehozva || kartyaAdat.letrehozva || new Date().toISOString(),
    utolsoIsmetles: kartyaAdat.utolsoIsmetles ?? meglevo?.utolsoIsmetles ?? null
  };

  store.put(kartya);
  await promisifyTransaction(tx);
  return kartya;
}

/**
 * Kártya törlése ID alapján.
 * @param {string} kartyaId
 */
export async function torolKartyat(kartyaId) {
  const db = await megnyitDb();
  const tx = db.transaction(STORE_KARTYAK, 'readwrite');
  tx.objectStore(STORE_KARTYAK).delete(kartyaId);
  await promisifyTransaction(tx);
}

// ============================================================================
// ESEDÉKES KÁRTYÁK LEKÉRDEZÉSE INDEX ALAPJÁN (< 50 ms 1000+ kártyánál is)
// ============================================================================

/**
 * Lekérdezi a megadott napon (vagy annál korábban) esedékes kártyákat index segítségével.
 * - Ha nincs pakliId szűrés: a `by_kovetkezo` indexet használja `IDBKeyRange.upperBound(ma)`-val.
 * - Ha van pakliId szűrés: a `by_pakli_kovetkezo` összetett indexet használja.
 *
 * @param {string} [ma=maiDatumStr()] - YYYY-MM-DD formátumú dátum
 * @param {string|null} [pakliId=null] - Opcionális pakli szűrés
 * @returns {Promise<Array<object>>}
 */
export async function lekerdezEsedekesKartyak(ma = maiDatumStr(), pakliId = null) {
  const db = await megnyitDb();
  const tx = db.transaction(STORE_KARTYAK, 'readonly');
  const store = tx.objectStore(STORE_KARTYAK);

  if (pakliId) {
    const index = store.index('by_pakli_kovetkezo');
    const range = IDBKeyRange.bound([pakliId, '0000-00-00'], [pakliId, ma]);
    return promisifyRequest(index.getAll(range));
  }

  const index = store.index('by_kovetkezo');
  const range = IDBKeyRange.upperBound(ma);
  return promisifyRequest(index.getAll(range));
}

// ============================================================================
// STATISZTIKA ÉS 30 NAPOS ELŐREJELZÉS
// ============================================================================

/**
 * Statisztikai mutatók és 30 napos esedékességi előrejelzés kiszámítása.
 * @param {string} [ma=maiDatumStr()]
 * @param {string|null} [pakliId=null]
 */
export async function lekerdezStatisztika(ma = maiDatumStr(), pakliId = null) {
  const [esedekesKartyak, osszesKartya] = await Promise.all([
    lekerdezEsedekesKartyak(ma, pakliId),
    listazKartyakat(pakliId || undefined)
  ]);

  let uj = 0;
  let tanult = 0;

  for (const k of osszesKartya) {
    if ((k.ismetles || 0) === 0) {
      uj += 1;
    } else {
      tanult += 1;
    }
  }

  // 30 napos előrejelzés felépítése: ma .. ma + 29 nap
  const alap = new Date(`${ma}T00:00:00Z`);
  const napokMap = new Map();
  const elorejelzes30Nap = [];

  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.UTC(alap.getUTCFullYear(), alap.getUTCMonth(), alap.getUTCDate() + i));
    const datumStr = d.toISOString().slice(0, 10);
    const napObj = {
      datum: datumStr,
      cimke: datumStr.slice(5), // MM-DD
      napIndex: i,
      darab: 0
    };
    napokMap.set(datumStr, napObj);
    elorejelzes30Nap.push(napObj);
  }

  for (const k of osszesKartya) {
    const kov = k.kovetkezo || ma;
    if (kov <= ma) {
      // A már lejárt vagy ma esedékes kártyák a mai (0. napi) oszlopba kerülnek
      const maObj = napokMap.get(ma);
      if (maObj) maObj.darab += 1;
    } else if (napokMap.has(kov)) {
      napokMap.get(kov).darab += 1;
    }
  }

  return {
    esedekesMa: esedekesKartyak.length,
    uj,
    tanult,
    osszes: osszesKartya.length,
    elorejelzes30Nap
  };
}

// ============================================================================
// JSON IMPORT / EXPORT SÉMA-ELLENŐRZÉSSEL ÉS ATOMI TRANZAKCIÓVAL
// ============================================================================

const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Szigorú séma-ellenőrzés importálás előtt.
 * Ha bármelyik elem hibás, részletes hibaüzenettel dob kivételt,
 * mielőtt bármilyen adatbázis-tranzakció elindulna.
 *
 * @param {any} nyersAdat
 * @returns {{ pakli: object, kartyak: Array<object> }} Normalizált, mentésre kész struktúra
 */
export function validalPakliJson(nyersAdat) {
  if (!nyersAdat || typeof nyersAdat !== 'object' || Array.isArray(nyersAdat)) {
    throw new Error('Érvénytelen JSON gyökérobjektum: objektumot vártunk.');
  }

  const pakliBemeno = nyersAdat.pakli;
  if (!pakliBemeno || typeof pakliBemeno !== 'object' || Array.isArray(pakliBemeno)) {
    throw new Error('Hiányzó vagy érvénytelen "pakli" mező a JSON fájlban.');
  }

  if (typeof pakliBemeno.nev !== 'string' || pakliBemeno.nev.trim().length === 0) {
    throw new Error('A "pakli.nev" mezőnek nemüres szövegnek kell lennie.');
  }

  if (pakliBemeno.id !== undefined && (typeof pakliBemeno.id !== 'string' || !pakliBemeno.id.trim())) {
    throw new Error('A "pakli.id" mezőnek nemüres szövegnek kell lennie, ha meg van adva.');
  }

  if (!Array.isArray(nyersAdat.kartyak)) {
    throw new Error('Hiányzó vagy érvénytelen "kartyak" tömb a JSON fájlban.');
  }

  if (nyersAdat.kartyak.length === 0) {
    throw new Error('A "kartyak" tömb nem lehet üres.');
  }

  const pakliId = (pakliBemeno.id && pakliBemeno.id.trim()) || egyediId('pakli');
  const most = new Date().toISOString();
  const ma = maiDatumStr();

  const normalizaltPakli = {
    id: pakliId,
    nev: pakliBemeno.nev.trim(),
    leiras: typeof pakliBemeno.leiras === 'string' ? pakliBemeno.leiras.trim() : '',
    letrehozva: typeof pakliBemeno.letrehozva === 'string' ? pakliBemeno.letrehozva : most,
    frissitve: most
  };

  const normalizaltKartyak = nyersAdat.kartyak.map((k, idx) => {
    const poz = idx + 1;
    if (!k || typeof k !== 'object' || Array.isArray(k)) {
      throw new Error(`A(z) ${poz}. kártya nem érvényes objektum.`);
    }

    if (typeof k.elolap !== 'string' || k.elolap.trim().length === 0) {
      throw new Error(`A(z) ${poz}. kártya "elolap" mezője hiányzik vagy üres.`);
    }

    if (typeof k.hatlap !== 'string' || k.hatlap.trim().length === 0) {
      throw new Error(`A(z) ${poz}. kártya "hatlap" mezője hiányzik vagy üres.`);
    }

    const ef = k.ef !== undefined ? k.ef : 2.5;
    if (typeof ef !== 'number' || Number.isNaN(ef) || ef < 1.3 || ef > 5.0) {
      throw new Error(`A(z) ${poz}. kártya "ef" értéke érvénytelen (${ef}). 1.3 és 5.0 közötti szám kell legyen.`);
    }

    const intervallum = k.intervallum !== undefined ? k.intervallum : 0;
    if (typeof intervallum !== 'number' || !Number.isInteger(intervallum) || intervallum < 0) {
      throw new Error(`A(z) ${poz}. kártya "intervallum" értéke érvénytelen (${intervallum}). Nemnegatív egész szám kell legyen.`);
    }

    const ismetles = k.ismetles !== undefined ? k.ismetles : 0;
    if (typeof ismetles !== 'number' || !Number.isInteger(ismetles) || ismetles < 0) {
      throw new Error(`A(z) ${poz}. kártya "ismetles" értéke érvénytelen (${ismetles}). Nemnegatív egész szám kell legyen.`);
    }

    const kovetkezo = k.kovetkezo !== undefined ? k.kovetkezo : ma;
    if (typeof kovetkezo !== 'string' || !DATUM_REGEX.test(kovetkezo)) {
      throw new Error(`A(z) ${poz}. kártya "kovetkezo" dátuma érvénytelen ("${kovetkezo}"). Elvárt formátum: YYYY-MM-DD.`);
    }

    return {
      id: typeof k.id === 'string' && k.id.trim() ? k.id.trim() : egyediId(`kartya_${idx}`),
      pakliId,
      elolap: k.elolap.trim(),
      hatlap: k.hatlap.trim(),
      ef,
      intervallum,
      ismetles,
      kovetkezo,
      letrehozva: typeof k.letrehozva === 'string' ? k.letrehozva : most,
      utolsoIsmetles: k.utolsoIsmetles || null
    };
  });

  return {
    pakli: normalizaltPakli,
    kartyak: normalizaltKartyak
  };
}

/**
 * Validálja, majd egyetlen atomi `readwrite` tranzakcióban elmenti a paklit és kártyáit.
 * Hibás JSON esetén még a tranzakció megnyitása előtt kivételt dob, így a meglévő adatok
 * garantáltan sértetlenek maradnak.
 *
 * @param {string|object} jsonFajlTartalomVagyObjektum
 * @returns {Promise<{ pakli: object, importaltKartyakSzama: number }>}
 */
export async function importalPakliJson(jsonFajlTartalomVagyObjektum) {
  let nyers;
  if (typeof jsonFajlTartalomVagyObjektum === 'string') {
    try {
      nyers = JSON.parse(jsonFajlTartalomVagyObjektum);
    } catch (err) {
      throw new Error(`Érvénytelen JSON szintaxis: ${err.message}`);
    }
  } else {
    nyers = jsonFajlTartalomVagyObjektum;
  }

  // 1. lépés: Teljes séma-ellenőrzés a memóriában (tranzakció indítása előtt)
  const { pakli, kartyak } = validalPakliJson(nyers);

  // 2. lépés: Egyetlen atomi írási tranzakcióban mentünk mindent
  const db = await megnyitDb();
  const tx = db.transaction([STORE_PAKLIK, STORE_KARTYAK], 'readwrite');
  const pakliStore = tx.objectStore(STORE_PAKLIK);
  const kartyaStore = tx.objectStore(STORE_KARTYAK);

  pakliStore.put(pakli);
  for (const kartya of kartyak) {
    kartyaStore.put(kartya);
  }

  await promisifyTransaction(tx);

  return {
    pakli,
    importaltKartyakSzama: kartyak.length
  };
}

/**
 * Pakli és kártyáinak exportálása megosztható JSON struktúrába.
 * @param {string} pakliId
 */
export async function exportalPakliJson(pakliId) {
  const [pakli, kartyak] = await Promise.all([
    lekerdezPaklit(pakliId),
    listazKartyakat(pakliId)
  ]);

  if (!pakli) {
    throw new Error('A kiválasztott pakli nem található.');
  }

  return {
    verzio: 1,
    exportalva: new Date().toISOString(),
    pakli: {
      id: pakli.id,
      nev: pakli.nev,
      leiras: pakli.leiras || '',
      letrehozva: pakli.letrehozva
    },
    kartyak: kartyak.map((k) => ({
      id: k.id,
      elolap: k.elolap,
      hatlap: k.hatlap,
      ef: k.ef,
      intervallum: k.intervallum,
      ismetles: k.ismetles,
      kovetkezo: k.kovetkezo
    }))
  };
}

/**
 * Teljesítmény-benchmark: 1000 kártyás pakli importálása és az indexelt lekérdezés mérése.
 * Elfogadási kritérium: 1000 kártyás pakli importja után az esedékes kártyák lekérdezése < 50 ms.
 *
 * @param {boolean} [megtart=false] - Ha hamis, a mérés után kitörli a tesztpaklit
 */
export async function futtatTeljesitmenyBenchmark(megtart = false) {
  const ma = maiDatumStr();
  const tesztPakliId = 'pakli_benchmark_1000';
  const kartyak = [];

  for (let i = 1; i <= 1000; i++) {
    // A kártyák fele ma esedékes, másik fele jövőbeli dátumú
    const eltolasNap = i % 2 === 0 ? 0 : (i % 25) + 1;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + eltolasNap);
    kartyak.push({
      id: `bench_kartya_${i}`,
      elolap: `Anatómiai tesztkérdés #${i}: Melyik képlet halad át a foramen magnumon?`,
      hatlap: `Medulla oblongata, meninges, arteria vertebralis, nervus accessorius (#${i})`,
      ef: 2.5,
      intervallum: eltolasNap,
      ismetles: eltolasNap === 0 ? 0 : 2,
      kovetkezo: eltolasNap === 0 ? ma : d.toISOString().slice(0, 10)
    });
  }

  const importStart = performance.now();
  await importalPakliJson({
    pakli: {
      id: tesztPakliId,
      nev: '⚡ 1000 kártyás teljesítmény-benchmark pakli',
      leiras: 'Automatikusan generált 1000 kártyás pakli az IndexedDB index (< 50 ms) méréséhez.'
    },
    kartyak
  });
  const importIdoMs = Math.round((performance.now() - importStart) * 100) / 100;

  const lekerdezesStart = performance.now();
  const esedekes = await lekerdezEsedekesKartyak(ma, null);
  const lekerdezesIdoMs = Math.round((performance.now() - lekerdezesStart) * 100) / 100;

  if (!megtart) {
    await torolPaklit(tesztPakliId);
  }

  return {
    importaltKartyak: 1000,
    talaltEsedekes: esedekes.length,
    importIdoMs,
    lekerdezesIdoMs,
    sikeres: lekerdezesIdoMs < 50
  };
}
