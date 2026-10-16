/**
 * Beneficios del entrenamiento para el cartel de festejo, por capacidad.
 * Cada frase resume un hallazgo de una revisión, metaanálisis o guía y lleva
 * su referencia. Son beneficios generales del tipo de entrenamiento, no una
 * promesa clínica para la persona.
 */
import { CapacityId, Routine, capacityMix } from './data';

export interface Benefit { text: string; ref: string }

export const BENEFITS: Record<CapacityId, Benefit[]> = {
  fuerza: [
    { text: 'Hacer ejercicios de fuerza se asocia con un 10–17 % menos de riesgo de mortalidad, enfermedad cardiovascular, cáncer y diabetes.', ref: 'Momma et al., 2022 · Br J Sports Med' },
    { text: 'La fuerza y la masa muscular mejoran con el entrenamiento a cualquier edad, también después de los 60.', ref: 'Fragala et al., 2019 · J Strength Cond Res (NSCA)' },
    { text: 'La OMS recomienda trabajar la fuerza de los grandes grupos musculares 2 o más días por semana.', ref: 'Bull et al., 2020 · Br J Sports Med (guías OMS)' },
  ],
  reactividad: [
    { text: 'El entrenamiento pliométrico (saltos) mejora la altura del salto.', ref: 'Markovic, 2007 · Br J Sports Med (metaanálisis)' },
    { text: 'La potencia —poder moverse rápido— es clave para mantener la autonomía al envejecer.', ref: 'Reid & Fielding, 2012 · Exerc Sport Sci Rev' },
    { text: 'Fuerza intensa combinada con impactos mejoró la densidad ósea de cadera y columna en mujeres posmenopáusicas.', ref: 'Watson et al., 2018 · J Bone Miner Res (LIFTMOR)' },
  ],
  movilidad: [
    { text: 'Entrenar fuerza en rangos completos mejora la movilidad tanto como estirar.', ref: 'Afonso et al., 2021 · Healthcare (metaanálisis)' },
    { text: 'Una sesión de estiramiento aumenta el rango de movimiento en el momento.', ref: 'Behm et al., 2016 · Appl Physiol Nutr Metab' },
  ],
  estabilidad: [
    { text: 'El ejercicio probablemente reduce el dolor de la lumbalgia crónica, comparado con no tratarla.', ref: 'Hayden et al., 2021 · Cochrane' },
    { text: 'Los ejercicios de control de la zona media logran resultados similares a otros tipos de ejercicio en el dolor lumbar.', ref: 'Saragiotto et al., 2016 · Cochrane' },
    { text: 'Tras una cirugía de hernia de disco, los programas de ejercicio parecen acelerar la mejora del dolor y la función.', ref: 'Oosterhuis et al., 2014 · Cochrane' },
  ],
  control_motor: [
    { text: 'Los ejercicios de equilibrio y funcionales reducen un 24 % la tasa de caídas en personas mayores.', ref: 'Sherrington et al., 2019 · Cochrane' },
    { text: 'El entrenamiento del equilibrio mejora el equilibrio estático y dinámico en adultos mayores.', ref: 'Lesinski et al., 2015 · Sports Med (metaanálisis)' },
  ],
  resistencia: [
    { text: 'La OMS recomienda entre 150 y 300 minutos semanales de actividad aeróbica moderada.', ref: 'Bull et al., 2020 · Br J Sports Med (guías OMS)' },
  ],
};

/** Hasta 3 beneficios, uno por cada capacidad más trabajada; rota según la sesión. */
export function benefitsFor(routine: Routine, seed: string): Array<Benefit & { capacity: CapacityId }> {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return capacityMix(routine)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(({ id }) => {
      const list = BENEFITS[id];
      return { ...list[h % list.length]!, capacity: id };
    });
}
