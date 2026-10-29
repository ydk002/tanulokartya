// tests/sm2.test.js – Unit tesztek az src/sm2.js tiszta függvényhez (12 teszteset)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sm2, BUTTON_TO_Q, elonezetIntervallumok } from '../src/sm2.js';

const FIX_MA = new Date('2026-10-29T12:00:00Z');

describe('SM-2 térközös ismétlési algoritmus (src/sm2.js)', () => {
  // 1. teszteset: Első sikeres ismétlés ("Jó", q = 4) -> intervallum 1 nap, ismétlés = 1, EF változatlan (2.5)
  it('1. Új kártya első sikeres ismétlése (q=4, Jó) 1 napos intervallumot és változatlan EF-et (2.5) ad', () => {
    const kartya = { ef: 2.5, intervallum: 0, ismetles: 0 };
    const eredmeny = sm2(kartya, BUTTON_TO_Q.jo, FIX_MA);

    assert.equal(eredmeny.ismetles, 1);
    assert.equal(eredmeny.intervallum, 1);
    assert.equal(eredmeny.ef, 2.5);
    assert.equal(eredmeny.kovetkezo, '2026-10-30');
  });

  // 2. teszteset: Második sikeres ismétlés ("Jó", q = 4) -> intervallum 6 nap, ismétlés = 2
  it('2. Második sikeres ismétléskor (ismetles: 1 -> 2) az intervallum pontosan 6 napra ugorjon', () => {
    const kartya = { ef: 2.5, intervallum: 1, ismetles: 1 };
    const eredmeny = sm2(kartya, BUTTON_TO_Q.jo, FIX_MA);

    assert.equal(eredmeny.ismetles, 2);
    assert.equal(eredmeny.intervallum, 6);
    assert.equal(eredmeny.ef, 2.5);
    assert.equal(eredmeny.kovetkezo, '2026-11-04');
  });

  // 3. teszteset: Harmadik és további sikeres ismétlés -> Math.round(intervallum * ef)
  it('3. Harmadik ismétléstől az intervallum Math.round(intervallum * ef) legyen (6 * 2.5 = 15 nap)', () => {
    const kartya = { ef: 2.5, intervallum: 6, ismetles: 2 };
    const eredmeny = sm2(kartya, BUTTON_TO_Q.jo, FIX_MA);

    assert.equal(eredmeny.ismetles, 3);
    assert.equal(eredmeny.intervallum, 15);
    assert.equal(eredmeny.ef, 2.5);
    assert.equal(eredmeny.kovetkezo, '2026-11-13');
  });

  // 4. teszteset (Elfogadási kritérium): "Újra" (q = 1 < 3) válasz után az intervallum 1 napra áll vissza és az ismétlésszám nullázódik
  it('4. „Újra” (q=1) válasz után egy már tanult kártya intervalluma 1 napra áll vissza és ismétlésszáma 0 lesz', () => {
    const haladoKartya = { ef: 2.6, intervallum: 38, ismetles: 4 };
    const eredmeny = sm2(haladoKartya, BUTTON_TO_Q.ujra, FIX_MA);

    assert.equal(eredmeny.intervallum, 1);
    assert.equal(eredmeny.ismetles, 0);
    assert.equal(eredmeny.kovetkezo, '2026-10-30');
    // q=1 esetén delta = 0.1 - 4*(0.08 + 0.08) = -0.54 -> 2.6 - 0.54 = 2.06
    assert.equal(eredmeny.ef, 2.06);
  });

  // 5. teszteset (Elfogadási kritérium): Az EF soha nem megy 1.3 alá még sorozatos "Újra" (q=0 vagy q=1) válaszok esetén sem
  it('5. Az EF (könnyűségi tényező) alsó korlátja szigorúan 1.3 – soha nem csökken 1.3 alá', () => {
    let kartya = { ef: 1.35, intervallum: 6, ismetles: 2 };
    kartya = sm2(kartya, 0, FIX_MA);
    assert.equal(kartya.ef, 1.3);

    // Még egy sikertelen válasz 1.3-as EF-ről indítva
    const ujabb = sm2(kartya, BUTTON_TO_Q.ujra, FIX_MA);
    assert.equal(ujabb.ef, 1.3);
    assert.equal(ujabb.intervallum, 1);
  });

  // 6. teszteset: "Könnyű" (q = 5) válasz növeli az EF értékét +0.1-del
  it('6. „Könnyű” (q=5) válasz esetén az EF pontosan 0.1-del nő (2.5 -> 2.6)', () => {
    const kartya = { ef: 2.5, intervallum: 6, ismetles: 2 };
    const eredmeny = sm2(kartya, BUTTON_TO_Q.konnyu, FIX_MA);

    assert.equal(eredmeny.ef, 2.6);
    assert.equal(eredmeny.intervallum, 15);
    assert.equal(eredmeny.ismetles, 3);
  });

  // 7. teszteset: "Nehéz" (q = 3) válasz megtartja a sikeres ismétlési láncot, de 0.14-gyel csökkenti az EF-et
  it('7. „Nehéz” (q=3) válasz növeli az ismétlésszámot, de az EF-et 0.14-gyel csökkenti (2.5 -> 2.36)', () => {
    const kartya = { ef: 2.5, intervallum: 6, ismetles: 2 };
    const eredmeny = sm2(kartya, BUTTON_TO_Q.nehez, FIX_MA);

    assert.equal(eredmeny.ismetles, 3);
    assert.equal(eredmeny.intervallum, 15);
    assert.equal(eredmeny.ef, 2.36);
  });

  // 8. teszteset: Tiszta függvény (immutabilitás) ellenőrzése – a bemeneti kártya objektum nem módosulhat
  it('8. Az sm2() tiszta függvény: nem módosítja a paraméterként átadott kártya objektumot', () => {
    const eredeti = Object.freeze({ ef: 2.5, intervallum: 6, ismetles: 2 });
    const eredmeny = sm2(eredeti, BUTTON_TO_Q.konnyu, FIX_MA);

    assert.equal(eredeti.ef, 2.5);
    assert.equal(eredeti.intervallum, 6);
    assert.equal(eredeti.ismetles, 2);
    assert.notEqual(eredmeny, eredeti);
  });

  // 9. teszteset: Hónap- és évváltás helyes kezelése a következő esedékességi dátum számításakor
  it('9. Év- és hónapváltáskor is pontos ISO dátumot (YYYY-MM-DD) számol', () => {
    const szilveszter = new Date('2026-12-30T00:00:00Z');
    const kartya = { ef: 2.5, intervallum: 1, ismetles: 1 };
    const eredmeny = sm2(kartya, BUTTON_TO_Q.jo, szilveszter);

    assert.equal(eredmeny.intervallum, 6);
    assert.equal(eredmeny.kovetkezo, '2027-01-05');
  });

  // 10. teszteset: Érvénytelen q értékre (< 0 vagy > 5) RangeError kivételt dob
  it('10. Érvénytelen q minőségi értékre (pl. -1 vagy 6) RangeError kivételt dob', () => {
    const kartya = { ef: 2.5, intervallum: 0, ismetles: 0 };
    assert.throws(() => sm2(kartya, -1, FIX_MA), RangeError);
    assert.throws(() => sm2(kartya, 6, FIX_MA), RangeError);
  });

  // 11. teszteset: Előnézeti intervallumok számítása mind a 4 gombra
  it('11. Az elonezetIntervallumok() helyesen adja vissza mind a 4 értékelő gomb várható intervallumát', () => {
    const kartya = { ef: 2.5, intervallum: 6, ismetles: 2 };
    const elonezet = elonezetIntervallumok(kartya, FIX_MA);

    assert.deepEqual(elonezet, {
      ujra: 1,
      nehez: 15,
      jo: 15,
      konnyu: 15
    });
  });
});
