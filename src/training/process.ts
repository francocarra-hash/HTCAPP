/** Etapas del proceso de entrenamiento de un alumno, definidas por el coach. */
import { z } from 'zod';

export const ProcessSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(60),
      title: z.string().trim().min(1).max(80),
      description: z.string().trim().max(400).nullable().optional(),
      status: z.enum(['done', 'current', 'next']),
    }),
  )
  .max(20);

export type ProcessPhase = z.infer<typeof ProcessSchema>[number];
