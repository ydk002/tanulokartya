// src/sm2.js – tiszta függvény (SM-2 térközös ismétlési algoritmus)

/**
 * A 4 értékelő gomb leképezése az SM-2 algoritmus q (0..5) skálájára:
 * - Újra (1): q = 1 (sikertelen válasz, < 3 -> nullázza az ismétlésszámot, intervallum = 1 nap)
 * - Nehéz (2): q = 3 (helyes válasz jelentős nehézséggel, EF csökken)
 * - Jó (3): q = 4 (helyes válasz némi gondolkodás után, EF változatlan marad)
 * - Könnyű (4): q = 5 (tökéletes válasz azonnal, EF nő)
 */
export const BUTTON_TO_Q = Object.freeze({
  ujra: 1,
  nehez: 3,
  jo: 4,
  konnyu: 5
});

/**
 * Kiszámítja a kártya következő ismétlési állapotát az SM-2 algoritmus alapján.
 * Tiszta függvény: nem módosítja a bemeneti objektumot.
 *
 * @param {{ ef?: number, intervallum?: number, ismetles?: number }} kartya
 * @param {number} q - A válasz minősége (0..5)
 * @param {Date|string} [ma=new Date()] - Referencia dátum
 * @returns {{ ef: number, intervallum: number, ismetles: number, kovetkezo: string }}
 */
export function sm2(kartya, q, ma = new Date()) {
  if (typeof q !== 'number' || Number.isNaN(q) || q < 0 || q > 5) {
    throw new RangeError('A válasz minősége (q) 0 és 5 közötti szám kell legyen.');
  }

  let ef = typeof kartya?.ef === 'number' ? kartya.ef : 2.5;
  let intervallum = typeof kartya?.intervallum === 'number' ? kartya.intervallum : 0;
  let ismetles = typeof kartya?.ismetles === 'number' ? kartya.ismetles : 0;

  if (q < 3) {
    ismetles = 0;
    intervallum = 1;
  } else {
    ismetles += 1;
    if (ismetles === 1) {
      intervallum = 1;
    } else if (ismetles === 2) {
      intervallum = 6;
    } else {
      intervallum = Math.round(intervallum * ef);
    }
  }

  // EF := EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  ef = Math.round((ef + delta) * 1000) / 1000;
  if (ef < 1.3) {
    ef = 1.3;
  }

  const alapDatum = ma instanceof Date ? new Date(ma.getTime()) : new Date(ma);
  // UTC alapú dátumléptetés az időzóna/nyári időszámítás elcsúszások elkerülésére
  const kovetkezo = new Date(Date.UTC(
    alapDatum.getUTCFullYear(),
    alapDatum.getUTCMonth(),
    alapDatum.getUTCDate() + intervallum
  ));

  return {
    ef,
    intervallum,
    ismetles,
    kovetkezo: kovetkezo.toISOString().slice(0, 10)
  };
}

/**
 * Előnézeti intervallumok mind a 4 gombhoz a tanulási felületen.
 * @param {{ ef?: number, intervallum?: number, ismetles?: number }} kartya
 * @param {Date|string} [ma=new Date()]
 */
export function elonezetIntervallumok(kartya, ma = new Date()) {
  return {
    ujra: sm2(kartya, BUTTON_TO_Q.ujra, ma).intervallum,
    nehez: sm2(kartya, BUTTON_TO_Q.nehez, ma).intervallum,
    jo: sm2(kartya, BUTTON_TO_Q.jo, ma).intervallum,
    konnyu: sm2(kartya, BUTTON_TO_Q.konnyu, ma).intervallum
  };
}
