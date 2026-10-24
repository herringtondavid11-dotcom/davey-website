// Verifies App Store signed data (JWS): App Store Server Notifications v2 and StoreKit 2 signed transactions.
// The x5c chain must end in Apple Root CA - G3 (embedded below; SHA-256 fingerprint
// 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79, from
// https://www.apple.com/certificateauthority/), each certificate must be valid and signed by the next, the leaf and
// intermediate must carry Apple's App Store receipt-signing OIDs, and the JWS must be signed (ES256) by the leaf.
import * as x509 from "npm:@peculiar/x509@1.12.3";

x509.cryptoProvider.set(crypto);

const APPLE_ROOT_CA_G3 = "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";
/** Apple's App Store receipt-signing leaf certificate. */
export const LEAF_OID = "1.2.840.113635.100.6.11.1";
/** Apple Worldwide Developer Relations intermediate. */
export const INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";
export const BUNDLE_ID = "com.davidherrington.Davey";

export class AppStoreVerificationError extends Error {}

function base64Decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64Decode(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
}

function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const x = new Uint8Array(a), y = new Uint8Array(b);
  return x.length === y.length && x.every((byte, i) => byte === y[i]);
}

export const appleRootCertificate = new x509.X509Certificate(base64Decode(APPLE_ROOT_CA_G3));

export interface VerifyOptions {
  /** The trusted root (tests use their own); Apple Root CA - G3 by default. */
  root?: x509.X509Certificate;
  /** When the certificates must be valid; now by default. */
  now?: Date;
}

/** Verifies `jws` and returns its payload. Throws AppStoreVerificationError if anything doesn't check out. */
export async function verifyAppleJWS<T>(jws: string, options: VerifyOptions = {}): Promise<T> {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new AppStoreVerificationError("not a JWS");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: { alg?: string; x5c?: string[] };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)));
  } catch {
    throw new AppStoreVerificationError("bad header");
  }
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3) {
    throw new AppStoreVerificationError("unexpected header");
  }
  const [leaf, intermediate, root] = header.x5c.map((der) => new x509.X509Certificate(base64Decode(der)));
  const trustedRoot = options.root ?? appleRootCertificate;
  if (!sameBytes(root.rawData, trustedRoot.rawData)) throw new AppStoreVerificationError("untrusted root");

  const now = options.now ?? new Date();
  for (const certificate of [leaf, intermediate, root]) {
    if (now < certificate.notBefore || now > certificate.notAfter) {
      throw new AppStoreVerificationError("certificate outside its validity period");
    }
  }
  if (!(await intermediate.verify({ publicKey: root, signatureOnly: true }))) {
    throw new AppStoreVerificationError("intermediate not signed by root");
  }
  if (!(await leaf.verify({ publicKey: intermediate, signatureOnly: true }))) {
    throw new AppStoreVerificationError("leaf not signed by intermediate");
  }
  if (!leaf.getExtension(LEAF_OID) || !intermediate.getExtension(INTERMEDIATE_OID)) {
    throw new AppStoreVerificationError("missing Apple certificate extensions");
  }

  const key = await leaf.publicKey.export({ name: "ECDSA", namedCurve: "P-256" }, ["verify"]);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new AppStoreVerificationError("bad signature");
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as T;
  } catch {
    throw new AppStoreVerificationError("bad payload");
  }
}

/** A StoreKit 2 / App Store Server API transaction (the fields Davey uses). */
export interface TransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  environment?: string;
  signedDate?: number;
}

/** App Store Server Notifications v2 decoded payload (the fields Davey uses). */
export interface NotificationPayload {
  notificationType: string;
  subtype?: string;
  notificationUUID?: string;
  signedDate?: number;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}
