import { randomBytes, randomUUID } from 'node:crypto';

// Disallow easily confused characters (no 0/O, 1/I)
// so a booking reference read aloud at the door or over the phone is unambiguous.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters

export function newId() {
  return randomUUID();
}

// 32 characters divides 256 evenly, so `byte % 32` introduces no modulo bias.
export function referenceCode(length = 8) {
  const bytes = randomBytes(length);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

export const newReference = referenceCode;
