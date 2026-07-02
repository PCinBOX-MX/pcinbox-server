import dotenv from "dotenv";
import path from "path";
import https from "https";
import axios from "axios";
import ImageKit from "imagekit";
import { writeErrorLogs } from "../services/index.service";

let envLoaded = false;

type ImageKitListedFile = {
  url?: string;
  name?: string;
  filePath?: string;
  type?: string;
  createdAt?: number;
};

function loadEnvOnce() {
  if (envLoaded) return;
  envLoaded = true;

  const envFile =
    process.env.NODE_ENV === "local" ||
    !process.env.NODE_ENV ||
    process.env.NODE_ENV === "development"
      ? ".env.local"
      : ".env.prod";

  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
}

function getImageKitCredentials() {
  loadEnvOnce();
  return {
    publicKey: process.env.IMAGEKIT_PUBLICKEY?.trim() || "",
    privateKey: process.env.IMAGEKIT_PRIVATEKEY?.trim() || "",
    urlEndpoint: process.env.IMAGEKIT_URLENDPOINT?.trim() || "",
  };
}

let imagekitClient: ImageKit | null = null;

function getImageKitClient(): ImageKit | null {
  loadEnvOnce();

  if (imagekitClient) return imagekitClient;

  const { publicKey, privateKey, urlEndpoint } = getImageKitCredentials();

  if (!publicKey || !privateKey || !urlEndpoint) {
    writeErrorLogs(
      "ImageKit no configurado: faltan IMAGEKIT_PUBLICKEY, IMAGEKIT_PRIVATEKEY o IMAGEKIT_URLENDPOINT",
    );
    return null;
  }

  imagekitClient = new ImageKit({
    publicKey,
    privateKey,
    urlEndpoint,
  });

  return imagekitClient;
}

function getLocalHttpsAgent(): https.Agent | undefined {
  if (process.env.NODE_ENV !== "local") return undefined;
  return new https.Agent({ rejectUnauthorized: false });
}

/** local | prod — prioriza IMAGEKIT_USER_ENV y trata dev como local. */
export function getUserPhotoEnvSegment(): "local" | "prod" {
  loadEnvOnce();

  const explicit = process.env.IMAGEKIT_USER_ENV?.trim().toLowerCase();
  if (explicit === "local" || explicit === "prod") {
    return explicit;
  }

  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (!nodeEnv || nodeEnv === "local" || nodeEnv === "development") {
    return "local";
  }

  return "prod";
}

/** Ruta de carpeta: /users/{local|prod}/{idUser} */
export function getUserPhotoFolder(idUser: string | number): string {
  return `/users/${getUserPhotoEnvSegment()}/${idUser}`;
}

function buildPublicUrlFromFile(file: ImageKitListedFile): string | null {
  if (file.url?.trim()) return file.url.trim();

  const urlEndpoint = getImageKitCredentials().urlEndpoint.replace(/\/$/, "");
  if (!urlEndpoint) return null;

  if (file.filePath?.trim()) {
    const filePath = file.filePath.startsWith("/")
      ? file.filePath
      : `/${file.filePath}`;
    return `${urlEndpoint}${filePath}`;
  }

  return null;
}

function normalizeListedFiles(data: unknown): ImageKitListedFile[] {
  if (!Array.isArray(data)) return [];

  return data.filter((file) => {
    const item = file as ImageKitListedFile;
    return item.type !== "folder" && (item.url || item.filePath || item.name);
  }) as ImageKitListedFile[];
}

/** Lista archivos de una carpeta; prueba variantes de path en ImageKit. */
async function listLatestUserPhoto(folderPath: string): Promise<ImageKitListedFile[]> {
  const { privateKey } = getImageKitCredentials();
  if (!privateKey) return [];

  const pathVariants = [
    folderPath,
    folderPath.endsWith("/") ? folderPath.slice(0, -1) : `${folderPath}/`,
  ];

  for (const folder of pathVariants) {
    try {
      const response = await axios.get<ImageKitListedFile[]>(
        "https://api.imagekit.io/v1/files/",
        {
          auth: { username: privateKey, password: "" },
          params: {
            path: folder,
            sort: "DESC_CREATED",
            limit: 10,
            fileType: "image",
          },
          httpsAgent: getLocalHttpsAgent(),
          timeout: 20000,
        },
      );

      const files = normalizeListedFiles(response.data);
      if (files.length > 0) return files;
    } catch (error) {
      writeErrorLogs(`ImageKit listFiles (${folder}): ${error}`);
    }
  }

  return [];
}

function resolveLatestPhotoUrl(files: ImageKitListedFile[]): string | null {
  const sorted = [...files].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );

  for (const file of sorted) {
    const url = buildPublicUrlFromFile(file);
    if (url) return url;
  }

  return null;
}

function buildUploadFileName(file: Express.Multer.File): string {
  const extension = path.extname(file.originalname || "") || ".jpg";
  const baseName =
    path
      .basename(file.originalname || "profile", extension)
      .replace(/[^\w.-]/g, "_")
      .slice(0, 80) || "profile";

  return `${baseName}${extension}`;
}

export const uploadPhotoUser = async (
  file: Express.Multer.File,
  idUser: string | number,
) => {
  try {
    const imagekit = getImageKitClient();
    if (!imagekit) return false;

    const folder = getUserPhotoFolder(idUser);
    const response = await imagekit.upload({
      file: file.buffer,
      fileName: buildUploadFileName(file),
      folder,
      useUniqueFileName: true,
    });

    return response.url;
  } catch (error) {
    writeErrorLogs(`Error en guardar${error}`);
    return false;
  }
};

export const getPhotoUserAWS = async (idUser: string | number) => {
  loadEnvOnce();

  const envSegment = getUserPhotoEnvSegment();
  const envFolder = getUserPhotoFolder(idUser);

  try {
    const envFiles = await listLatestUserPhoto(envFolder);
    const envPhoto = resolveLatestPhotoUrl(envFiles);
    if (envPhoto) return envPhoto;

    const legacyFiles = await listLatestUserPhoto(`/users/${idUser}`);
    const legacyPhoto = resolveLatestPhotoUrl(legacyFiles);
    if (legacyPhoto) return legacyPhoto;

    writeErrorLogs(
      `Sin foto en ImageKit para idUser ${idUser} (${envSegment}: ${envFolder})`,
    );
    return null;
  } catch (error) {
    writeErrorLogs(`❌ Error al obtener última foto (idUser ${idUser}): ${error}`);
    return null;
  }
};
