import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function loadKey(): Buffer {
    const hex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). See .env.example.");
    }
    return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
    const key = loadKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(".");
}

export function decryptToken(payload: string): string {
    const key = loadKey();
    const [ivHex, authTagHex, ciphertextHex] = payload.split(".");
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return plaintext.toString("utf8");
}
