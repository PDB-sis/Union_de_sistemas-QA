import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const passwordSchema = z.string().min(12).max(128).refine(s => Buffer.byteLength(s, "utf8") <= 512);
let hashing = 0;
async function derive(password:string, salt:Buffer):Promise<Buffer> {
  // Bound memory use: each scrypt request uses approximately 128 MiB.
  if (hashing >= 2) throw new Error("HASH_CAPACITY");
  hashing++;
  try {
    return await new Promise((resolve,reject) => scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024},(error,key)=>error?reject(error):resolve(key)));
  } finally { hashing--; }
}
export async function hashPassword(password:string) {
  passwordSchema.parse(password);
  const salt = randomBytes(16);
  const key = await derive(password,salt);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(password:string, encoded:string|null) {
  if (!password || password.length > 128 || Buffer.byteLength(password,"utf8") > 512) return false;
  const match = encoded?.match(/^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  // Missing users take the same expensive path, without a known dummy password.
  const derived = await derive(password,Buffer.from(match?.[1] ?? "00".repeat(16),"hex"));
  return timingSafeEqual(derived,Buffer.from(match?.[2] ?? "00".repeat(64),"hex")) && Boolean(match);
}
