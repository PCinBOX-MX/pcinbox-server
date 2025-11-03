import dotenv from "dotenv";
import ImageKit from "imagekit";
import { writeErrorLogs } from "../services/index.service";

dotenv.config({ path: ".env.prod" });
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLICKEY || "",
  privateKey: process.env.IMAGEKIT_PRIVATEKEY || "",
  urlEndpoint: process.env.IMAGEKIT_URLENDPOINT || "",
});

export const uploadPhotoUser = async (
  file: Express.Multer.File,
  idUser: any
) => {
  try {
    const response = await imagekit.upload({
      file: file.buffer,
      fileName: `${idUser}.jpg`,
      folder: `/users/${idUser}`,
    });

    return response.url;
  } catch (error) {
    writeErrorLogs(`Error en guardar${error}`);
    return false;
  }
};

export const getPhotoUserAWS = async (idUser: any) => {
  try {
    const files = await imagekit.listFiles({
      path: `/users/${idUser}`,
      sort: "DESC_CREATED",
      limit: 1,
    });

    if (files.length === 0) return null;

    // Construir la URL manualmente
    const imageUrl = `https://ik.imagekit.io/pcinboxkit/users/${idUser}/${files[0]?.name}`;

    return imageUrl;
  } catch (error) {
    writeErrorLogs(`❌ Error al obtener última foto: ${error}`);
    return null;
  }
};
