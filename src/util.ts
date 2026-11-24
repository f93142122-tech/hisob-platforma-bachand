import { Decimal } from 'decimal.js';
import { z } from 'zod';
import type { Client } from './db.ts';
import { config } from './config.ts';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export { Decimal };

export const D = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0);
export const fmt = (d: Decimal) => d.toFixed(2);

/** Foydalanuvchiga ko'rsatiladigan xato (o'zbekcha matn + HTTP kod). */
export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}
export const bad = (msg: string, code = 'validation') => new AppError(400, msg, code);

// --- validatsiya sxemalari ---
export const zMoney = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(/\s/g, '').replace(',', '.'))
  .refine((v) => /^\d{1,13}(\.\d{1,2})?$/.test(v), 'Summa noto‘g‘ri')
  .transform((v) => new Decimal(v).toFixed(2));
export const zPositiveMoney = zMoney.refine((v) => new Decimal(v).gt(0), 'Summa 0 dan katta bo‘lishi kerak');
export const zUuid = z.string().uuid();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana noto‘g‘ri');
export const zText = (max = 500) => z.string().trim().max(max);
export const zOptText = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const i = r.error.issues[0];
    throw bad(`${i.path.join('.') || 'ma’lumot'}: ${i.message}`);
  }
  return r.data;
}

// --- sana (do'kon vaqt mintaqasida) ---
export function todayStr(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function dateOf(ts: Date): string {
  return todayStr(ts);
}

/** Qurilmadan kelgan vaqt: kelajakda (5 daqiqadan ko'p) yoki 60 kundan eski bo'lsa, rad etiladi. */
export function clientTime(iso: string | undefined | null): Date {
  if (!iso) return new Date();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw bad('Vaqt noto‘g‘ri');
  const now = Date.now();
  if (d.getTime() > now + 5 * 60_000) return new Date(now);
  if (d.getTime() < now - 60 * 86400_000) throw bad('Amal vaqti juda eski (60 kundan oshgan)');
  return d;
}

export async function audit(c: Client, userId: string | null, action: string, entity: string | null, entityId: string | null, details?: unknown) {
  await c.query('INSERT INTO audit_logs(user_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)', [
    userId, action, entity, entityId, details === undefined ? null : JSON.stringify(details),
  ]);
}
