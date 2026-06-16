import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const ITERATIONS = 10000;
const DIGEST = "sha512";

export class AESHelper {
  static generateSalt(): string {
    return crypto.randomBytes(SALT_LENGTH).toString("hex");
  }

  static deriveKey(password: string, salt: string): Buffer {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  }

  static encrypt(
    plainText: string,
    key: Buffer,
    iv?: Buffer,
  ): {
    cipherText: string;
    iv: string;
  } {
    try {
      const usedIv = iv || crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, key, usedIv);

      let encrypted = cipher.update(plainText, "utf8", "hex");
      encrypted += cipher.final("hex");

      return {
        cipherText: encrypted,
        iv: usedIv.toString("hex"),
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  static decrypt(cipherText: string, key: Buffer, iv: string): string {
    try {
      const ivBuffer = Buffer.from(iv, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);

      let decrypted = decipher.update(cipherText, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : "Ciphertext may be tampered or key is incorrect"}`,
      );
    }
  }

  static generateIV(): string {
    return crypto.randomBytes(IV_LENGTH).toString("hex");
  }
}
