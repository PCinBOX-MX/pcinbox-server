import { createHash, randomUUID } from "crypto";
import { createReadStream } from "fs";
import {
  chmod,
  mkdir,
  open,
  rename,
  unlink,
} from "fs/promises";
import path from "path";

const PDF_SIGNATURE = Buffer.from("%PDF-");
export const MAX_QUOTE_FILE_SIZE = 15 * 1024 * 1024;

const isHostedEnvironment = () => {
  const environment = (
    process.env.COTIZACIONES_ENV ||
    process.env.NODE_ENV ||
    ""
  ).toLowerCase();
  return ["prod", "production", "qa"].includes(environment);
};

export const getQuoteStorageRoot = () => {
  const configured = process.env.COTIZACIONES_STORAGE_DIR?.trim();
  if (!configured && isHostedEnvironment()) {
    throw new Error(
      "COTIZACIONES_STORAGE_DIR es obligatorio en ambientes hospedados",
    );
  }

  return path.resolve(
    configured || path.join(process.cwd(), "storage", "cotizaciones"),
  );
};

export const getQuoteTempDirectory = () =>
  path.join(getQuoteStorageRoot(), ".tmp");

export const ensureQuoteStorage = async () => {
  await mkdir(getQuoteStorageRoot(), { recursive: true, mode: 0o750 });
  await mkdir(getQuoteTempDirectory(), { recursive: true, mode: 0o750 });
};

export const createTemporaryQuoteName = () => `${randomUUID()}.upload`;

const assertStorageKey = (storageKey: string) => {
  if (!/^[a-f0-9-]{36}$/.test(storageKey)) {
    throw new Error("Clave de almacenamiento inválida");
  }
};

export const resolveQuotePath = (storageKey: string) => {
  assertStorageKey(storageKey);
  const root = getQuoteStorageRoot();
  const target = path.resolve(root, `${storageKey}.pdf`);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Ruta de cotización inválida");
  }
  return target;
};

export const validatePdfAndHash = async (temporaryPath: string) => {
  const file = await open(temporaryPath, "r");
  try {
    const signature = Buffer.alloc(PDF_SIGNATURE.length);
    const { bytesRead } = await file.read(
      signature,
      0,
      PDF_SIGNATURE.length,
      0,
    );
    if (
      bytesRead !== PDF_SIGNATURE.length ||
      !signature.equals(PDF_SIGNATURE)
    ) {
      throw new Error("El archivo no contiene una firma PDF válida");
    }
  } finally {
    await file.close();
  }

  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(temporaryPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
};

export const commitTemporaryQuote = async (temporaryPath: string) => {
  const storageKey = randomUUID();
  const finalPath = resolveQuotePath(storageKey);
  await rename(temporaryPath, finalPath);
  await chmod(finalPath, 0o640);
  return { storageKey, finalPath };
};

export const removeFileIfPresent = async (filePath: string) => {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
};

