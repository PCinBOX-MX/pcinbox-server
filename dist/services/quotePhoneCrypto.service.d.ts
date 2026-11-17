/** Cifra teléfono capturado. Formato: v1.<iv>.<tag>.<cipher> (base64url). */
export declare const encryptCapturedPhone: (plain: string) => string;
/**
 * Descifra para admin. Acepta plaintext legacy (`+52 …`) si aún no estaba cifrado.
 */
export declare const decryptCapturedPhone: (stored: string | null | undefined) => string | null;
//# sourceMappingURL=quotePhoneCrypto.service.d.ts.map