# NeuroCard SM-2 – Vizsgafelkészítő Tanulókártya PWA (`umfst-p21-tanulokartya-pwa`)

Anki-szerű, **100%-ban offline is működő, telepíthető Progresszív Webalkalmazás (PWA)** orvostanhallgatók és vizsgázók számára. Az alkalmazás a **SuperMemo-2 (SM-2)** térközös ismétlési (*spaced repetition*) algoritmus segítségével ütemezi a tanulókártyákat, az adatokat pedig helyileg a böngésző **IndexedDB** adatbázisában tárolja.

---

## 📁 Projekt felépítése (Szállítandók)

```text
umfst-p21-tanulokartya-pwa/
├── index.html                 # Fő alkalmazás felület (Tanulás, Paklik/Kártyák CRUD, Statisztika, Import/Export)
├── manifest.webmanifest       # Telepíthető PWA manifest
├── sw.js                      # Service Worker a teljes offline (repülő módú) működéshez
├── src/
│   ├── sm2.js                 # Tiszta függvény: SM-2 térközös ismétlési algoritmus
│   ├── db.js                  # Promise-alapú IndexedDB réteg, indexelt lekérdezések és JSON séma-validáció
│   └── ui/
│       ├── app.js             # Alkalmazás vezérlő, navigáció, SW regisztráció, minta pakli betöltés
│       ├── study.js           # Tanulási mód (Előlap -> Mutasd -> Hátlap -> 4 gombos értékelés + Space, 1–4)
│       ├── decks.js           # Paklik és kártyák CRUD kezelője
│       ├── stats.js           # Statisztika (ma esedékes, új, tanult) + 30 napos oszlopdiagram + 1000 kártyás benchmark
│       ├── io.js              # JSON Import/Export File API-val és előzetes séma-ellenőrzéssel
│       └── toast.js           # Visszajelző értesítések és XSS-védett HTML escape
├── samples/
│   └── anatomia.json          # 32 kártyás orvosi anatómia minta pakli (nervus vagus és agyidegek)
├── tests/
│   └── sm2.test.js            # 11 darab automatizált unit teszt az sm2.js-hez
└── README.md                  # Dokumentáció, SM-2 kézi számítási példa és IndexedDB séma
```

---

## 🧠 Az SM-2 algoritmus leírása saját szavakkal

A **térközös ismétlés (spaced repetition)** alapelve, hogy egy megtanult információt pontosan akkor érdemes újra átismételni, amikor a felejtési görbe alapján éppen elkezdene elhalványulni az emlékezetünkben. Ha túl korán ismétlünk, időt pazarlunk; ha túl későn, újra kell tanulnunk.

Az **SM-2 algoritmus** minden egyes kártyához három állapotváltozót tart nyilván:
1. **`ef` (Easiness Factor – Könnyűségi tényező):** Azt méri, mennyire könnyen megjegyezhető az adott kártya. Kezdőértéke **2,5**, és az intervallumok növekedési szorzójaként szolgál. Soha nem csökkenhet **1,3** alá.
2. **`ismetles` ($n$ – Sikeres ismétlések száma):** Hányszor sikerült egymás után helyesen ($q \ge 3$) megválaszolni a kártyát.
3. **`intervallum` ($I$ – Napok száma):** Hány nap múlva lesz újra esedékes a kártya.

### A 4 értékelő gomb leképezése a $q \in [0..5]$ minőségi skálára

A tanulási felületen a hátlap felfedése után 4 gombbal (vagy az `1`–`4` billentyűkkel) értékeljük a válaszunkat:

| Gomb | Billentyű | $q$ érték | Jelentés | Hatás az `ef` értékére ($\Delta EF$) |
| :--- | :---: | :---: | :--- | :---: |
| **Újra** | `1` | **1** | Elfelejtettem / hibás válasz ($q < 3$) | **$-0,54$** (min. 1,3) |
| **Nehéz** | `2` | **3** | Helyes válasz, de komoly erőfeszítéssel | **$-0,14$** (min. 1,3) |
| **Jó** | `3` | **4** | Helyes válasz kis gondolkodás után | **$0,00$** (változatlan) |
| **Könnyű** | `4` | **5** | Tökéletes, azonnali válasz | **$+0,10$** |

### Matematikai szabályok minden értékeléskor

1. **Intervallum és ismétlésszám frissítése:**
   - Ha **$q < 3$ („Újra”)**: a tanulási lánc megszakad, ezért az ismétlésszám nullázódik (`ismetles = 0`), és a kártyát már másnap újra át kell nézni (`intervallum = 1`).
   - Ha **$q \ge 3$ („Nehéz”, „Jó”, „Könnyű”)**: az `ismetles` értékét 1-gyel növeljük:
     - 1. sikeres ismétlés (`ismetles === 1`): `intervallum = 1` nap
     - 2. sikeres ismétlés (`ismetles === 2`): `intervallum = 6` nap
     - 3. és minden további sikeres ismétlés (`ismetles >= 3`):
       $$\text{intervallum} = \text{kerekít}(\text{intervallum} \times EF)$$

2. **Könnyűségi tényező ($EF$) frissítése:**
   $$EF' = EF + \left(0,1 - (5 - q) \cdot (0,08 + (5 - q) \cdot 0,02)\right)$$
   Ha $EF' < 1,3$, akkor $EF' = 1,3$.

---

## ✍️ Kézzel számolt SM-2 példa (5 egymást követő ismétlés)

Vegyük a minta pakli 1. kártyáját (*„Melyek a nervus vagus koponyaűri és nyaki ágai?”*) **2026-10-01** kezdődátummal:
- **Kezdeti állapot:** `ef = 2.50`, `intervallum = 0`, `ismetles = 0`, `kovetkezo = 2026-10-01`

### 1. tanulás (2026-10-01) → Válasz: **„Jó” ($q = 4$)**
- Mivel $q = 4 \ge 3$, a válasz sikeres: `ismetles` $= 0 + 1 = 1$.
- Első sikeres ismétlés szabálya: `intervallum` $= 1$ nap.
- $EF$ változás ($q = 4$):
  $$\Delta EF = 0,1 - (5 - 4) \cdot (0,08 + (5 - 4) \cdot 0,02) = 0,1 - 1 \cdot 0,10 = 0$$
  $$EF' = 2,50 + 0 = 2,50$$
- Következő esedékesség: `2026-10-01 + 1 nap` = **`2026-10-02`**.

### 2. tanulás (2026-10-02) → Válasz: **„Könnyű” ($q = 5$)**
- Mivel $q = 5 \ge 3$: `ismetles` $= 1 + 1 = 2$.
- Második sikeres ismétlés szabálya: `intervallum` $= 6$ nap.
- $EF$ változás ($q = 5$):
  $$\Delta EF = 0,1 - (5 - 5) \cdot (0,08 + 0) = +0,10$$
  $$EF' = 2,50 + 0,10 = 2,60$$
- Következő esedékesség: `2026-10-02 + 6 nap` = **`2026-10-08`**.

### 3. tanulás (2026-10-08) → Válasz: **„Nehéz” ($q = 3$)**
- Mivel $q = 3 \ge 3$: `ismetles` $= 2 + 1 = 3$.
- Harmadik ismétlés szabálya (még a belépő $EF = 2,60$-nal számolva):
  $$\text{intervallum} = \text{round}(6 \times 2,60) = \text{round}(15,6) = 16 \text{ nap}$$
- $EF$ változás ($q = 3$):
  $$\Delta EF = 0,1 - (5 - 3) \cdot (0,08 + (5 - 3) \cdot 0,02) = 0,1 - 2 \cdot 0,12 = -0,14$$
  $$EF' = 2,60 - 0,14 = 2,46$$
- Következő esedékesség: `2026-10-08 + 16 nap` = **`2026-10-24`**.

### 4. tanulás (2026-10-24) → Válasz: **„Újra” ($q = 1$)**
- Mivel $q = 1 < 3$ (elfelejtettük a választ):
  - `ismetles` visszaáll **0**-ra!
  - `intervallum` visszaáll **1** napra!
- $EF$ változás ($q = 1$):
  $$\Delta EF = 0,1 - (5 - 1) \cdot (0,08 + (5 - 1) \cdot 0,02) = 0,1 - 4 \cdot 0,16 = -0,54$$
  $$EF' = 2,46 - 0,54 = 1,92 \quad (\ge 1,3 \text{ alsó korlát érvényesül})$$
- Következő esedékesség: `2026-10-24 + 1 nap` = **`2026-10-25`**.

### 5. tanulás (2026-10-25) → Válasz: **„Jó” ($q = 4$)**
- Mivel $q = 4 \ge 3$: `ismetles` $= 0 + 1 = 1$.
- Első sikeres ismétlés az újrakezdés után: `intervallum` $= 1$ nap, $EF' = 1,92$.
- Következő esedékesség: **`2026-10-26`**.

### Összefoglaló táblázat a kézi számításról

| Lépés | Dátum | Válasz ($q$) | `ismetles` | `intervallum` | Új `ef` | `kovetkezo` |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: |
| Kezdet | 2026-10-01 | — | 0 | 0 nap | 2,50 | 2026-10-01 |
| **1.** | 2026-10-01 | Jó ($q=4$) | **1** | **1 nap** | **2,50** | **2026-10-02** |
| **2.** | 2026-10-02 | Könnyű ($q=5$) | **2** | **6 nap** | **2,60** | **2026-10-08** |
| **3.** | 2026-10-08 | Nehéz ($q=3$) | **3** | **16 nap** | **2,46** | **2026-10-24** |
| **4.** | 2026-10-24 | Újra ($q=1$) | **0** | **1 nap** | **1,92** | **2026-10-25** |
| **5.** | 2026-10-25 | Jó ($q=4$) | **1** | **1 nap** | **1,92** | **2026-10-26** |

---

## 🗄️ IndexedDB Séma (Object Store-ok és Indexek)

Az adatbázis neve: **`umfst_tanulokartya_db`** (Verzió: `1`).

### 1. Object Store: `paklik`
- **Elsődleges kulcs (`keyPath`):** `'id'` (pl. `"pakli_anatomia_alap"`)
- **Tárolt objektum felépítése:**
  ```json
  {
    "id": "pakli_anatomia_alap",
    "nev": "Neuroanatómia és tájanatómia – Vizsgapakli",
    "leiras": "32 kártyás orvosi anatómiai alappakli...",
    "letrehozva": "2026-10-29T18:00:00.000Z",
    "frissitve": "2026-10-29T18:00:00.000Z"
  }
  ```
- **Indexek:**
  - `by_nev` (`keyPath: 'nev'`, `unique: false`) – paklik név szerinti rendezéséhez/kereséséhez.

### 2. Object Store: `kartyak`
- **Elsődleges kulcs (`keyPath`):** `'id'` (pl. `"anat_01"`)
- **Tárolt objektum felépítése:**
  ```json
  {
    "id": "anat_01",
    "pakliId": "pakli_anatomia_alap",
    "elolap": "Melyek a nervus vagus (X. agyideg) koponyaűri és nyaki ágai?",
    "hatlap": "• Ramus meningeus...",
    "ef": 2.5,
    "intervallum": 0,
    "ismetles": 0,
    "kovetkezo": "2026-01-01",
    "letrehozva": "2026-10-29T18:00:00.000Z",
    "utolsoIsmetles": null
  }
  ```
- **Indexek a `kartyak` tárolón:**
  1. **`by_kovetkezo` (`keyPath: 'kovetkezo'`, `unique: false`)**
     - **Cél:** Az összes ma (vagy korábban) esedékes kártya azonnali, teljes táblabejárás nélküli ($O(\log N)$) lekérdezése `IDBKeyRange.upperBound(ma)` segítségével:
       ```js
       const index = store.index('by_kovetkezo');
       const range = IDBKeyRange.upperBound(ma); // pl. "2026-10-29"
       const esedekesKartyak = await promisifyRequest(index.getAll(range));
       ```
     - Mivel a dátumok ISO `YYYY-MM-DD` formátumú szövegek, a lexikografikus rendezés pontosan megegyezik az időrendi rendezéssel. **1000 kártyás pakli esetén a lekérdezés ideje ~1–4 ms (< 50 ms).**
  2. **`by_pakli` (`keyPath: 'pakliId'`, `unique: false`)**
     - **Cél:** Egy adott paklihoz tartozó kártyák listázása és kaszkádolt törlése.
  3. **`by_pakli_kovetkezo` (`keyPath: ['pakliId', 'kovetkezo']`, `unique: false`)**
     - **Cél:** Egy kiválasztott paklin belüli ma esedékes kártyák indexelt lekérdezése `IDBKeyRange.bound([pakliId, '0000-00-00'], [pakliId, ma])` tartománnyal.

---

## 🧪 Tesztelés és Futtatás

### Unit tesztek futtatása (`tests/sm2.test.js` – 11 teszteset)
```bash
node --test tests/sm2.test.js
```

### Helyi szerver indítása
```bash
npx serve .
```
Nyisd meg a böngészőben a megjelenő `http://localhost:3000` címet.

### Elfogadási kritériumok ellenőrzése a felületen
1. **SM-2 tesztek:** Futtasd a `node --test tests/sm2.test.js` parancsot (ellenőrzi az „Újra” $\to$ 1 nap visszaállást és az `EF >= 1.3` korlátot).
2. **1000 kártyás pakli lekérdezése < 50 ms:** Kattints a **📊 Statisztika (30 nap)** fülre, majd az **„1000 kártyás benchmark futtatása”** gombra. A felület valós időben kiírja az atomi import és az `IDBKeyRange.upperBound(ma)` indexelt lekérdezés idejét (jellemzően **1–5 ms**).
3. **Hibás JSON védelem:** Kattints a **🔄 Import / Export** fülre, majd a **„🧪 Hibás JSON védelem tesztelése”** gombra. A `validalPakliJson()` még a tranzakció indítása előtt elutasítja a hibás fájlt, így a meglévő paklik és kártyák érintetlenek maradnak.
4. **Offline (Repülő mód) működés:** A Chrome DevTools *Network* fülén állítsd be az **Offline** módot, majd frissítsd az oldalt (`F5`). A `sw.js` Service Worker a gyorsítótárból szolgálja ki a teljes alkalmazást, az IndexedDB pedig helyileg tárol és frissít minden kártyát.
