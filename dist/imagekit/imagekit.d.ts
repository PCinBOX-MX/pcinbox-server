import "../config/loadEnv";
/** local | prod — prioriza IMAGEKIT_USER_ENV y trata dev como local. */
export declare function getUserPhotoEnvSegment(): "local" | "prod";
/** Ruta de carpeta: /users/{local|prod}/{idUser} */
export declare function getUserPhotoFolder(idUser: string | number): string;
export declare const uploadPhotoUser: (file: Express.Multer.File, idUser: string | number) => Promise<string | false>;
export declare const getPhotoUserAWS: (idUser: string | number) => Promise<string | null>;
//# sourceMappingURL=imagekit.d.ts.map