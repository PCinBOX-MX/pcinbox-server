import { prisma } from "../../db/prismaClient";
import { Request, Response } from "express";
import {
  hasPassword,
  signPayload,
  verifyPassword,
  writeErrorLogs,
} from "./../../services/index.service";
import { SendEmailWelcomeUser } from "../../services/sendgrid.service";
import { DateTime } from "luxon";
import { uploadPhotoUser, getPhotoUserAWS } from "./../../imagekit/imagekit";
import dotenv from "dotenv";
import CustomRequestI from "./../../interfaces/customrequest.interface";

const fechaLocal = DateTime.now().setZone("America/Mexico_City");

dotenv.config({ path: ".env.prod" });
export const Login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, message: "Faltan campos en el body json" });
    }

    const slcUser = await prisma.users.findFirst({
      select: {
        idUser: true,
        password: true,
        email: true,
        role: true,
        name: true,
        lastname: true,
      },
      where: {
        email: email,
        active: 1,
      },
    });

    if (!slcUser) {
      return res.status(403).json({
        ok: false,
        message: `La cuenta con el correo ${email} no existe en el sistema o se eliminó`,
      });
    }

    if (!slcUser.password) {
      return res.status(400).json({
        ok: false,
        message: `El usuario ${slcUser.email} no tiene contraseña`,
      });
    }
    //Verificamos que si este correcta su password
    const veryPass: boolean = await verifyPassword(password, slcUser.password!);

    if (!veryPass) {
      return res.status(400).json({
        ok: false,
        message: "La contraseña o el correo electrónico son incorrectos",
      });
    }

    let sendToken = null;

    //Generamos el token y dura 3 dias
    sendToken = signPayload(
      {
        email,
        idUser: slcUser.idUser.toString(),
        rol: slcUser.role,
      },
      "3d",
    );

    return res.status(200).json({
      ok: true,
      message: "Logueado!!",
      data: {
        token: sendToken,
        email: slcUser.email,
        name: slcUser.name,
        lastname: slcUser.lastname,
        idUser: slcUser.idUser.toString(),
        role: slcUser?.role,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor",
    });
  }
};

export const Register = async (req: Request, res: Response) => {
  try {
    const {
      name,
      lastname,
      email,
      password,
      rol,
      phone,
    }: {
      name: string;
      lastname: string;
      email: string;
      password: string;
      rol: any;
      phone: string;
    } = req.body;

    if (!name || !email || !password || !lastname || !phone)
      return res
        .status(400)
        .json({ ok: false, message: "Completa los campos" });

    //Validamos que no este registrado el email entrante en la DB

    const isExistEmail = await prisma.users.findFirst({
      where: {
        email: email.toString().trim(),
      },
      select: {
        email: true,
      },
    });

    if (isExistEmail) {
      return res.status(400).json({
        ok: false,
        message: `El correo ${email} ya está registrado o se desvinculó del sistema`,
      });
    }

    //Encriptamos la password
    const hPass: string = await hasPassword(password);

    await prisma.users.create({
      data: {
        name: name,
        email: email,
        password: hPass,
        lastname: lastname,
        createdAT: fechaLocal.toISO(),
        role: !rol ? "customer" : rol,
        phone: phone,
      },
    });

    try {
      await SendEmailWelcomeUser(`${name} ${lastname}`, email);
    } catch (error: any) {
      //Notificar cuando no se haya enviado el correo
      writeErrorLogs(error);
    }

    return res.status(200).json({
      ok: true,
      mesage: `Usuario ${name} registrado correctamente`,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor",
    });
  }
};

export const LoginGoogle = async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res
        .status(400)
        .json({ ok: false, message: "Faltan campos en el body json" });
    }

    let slcUser = null;

    slcUser = await prisma.users.findFirst({
      where: {
        email: email,
      },
      select: {
        idUser: true,
        role: true,
        email: true,
        name: true,
        lastname: true,
        active: true,
      },
    });

    if (!slcUser) {
      slcUser = await prisma.users.create({
        data: {
          email: email,
          name: name,
          password: null,
          lastname: null,
        },
        select: {
          idUser: true,
          role: true,
          email: true,
          name: true,
          lastname: true,
          active: true,
        },
      });

      try {
        await SendEmailWelcomeUser(
          `${name}`,

          email,
        );
      } catch (error: any) {
        //Notificar cuando no se haya enviado el correo
        writeErrorLogs(error);
      }
    } else if (slcUser.active == 0) {
      return res.status(400).json({
        ok: false,
        message: `La cuenta ${slcUser.email} se desvinculó y ya no se podrá usar`,
      });
    }

    let sendToken = null;

    //Generamos el token y dura 3 dias
    sendToken = signPayload(
      {
        email,
        idUser: slcUser.idUser.toString(),
        rol: slcUser.role,
      },
      "3d",
    );

    return res
      .status(200)

      .json({
        ok: true,
        message: "Logueado!!",
        data: {
          token: sendToken,
          email: slcUser.email,
          name: slcUser.name,
          lastname: slcUser.lastname,
          idUser: Number(slcUser.idUser.toString()),
          active: slcUser.active,
        },
      });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor",
    });
  }
};

export const uploadPhoto = async (req: CustomRequestI, res: Response) => {
  try {
    const file = (req as any).file;

    if (!file)
      return res.status(400).json({ ok: false, message: "Foto no subida" });

    const result = await uploadPhotoUser(file, req.idUser);

    if (result) {
      return res.status(200).json({
        ok: true,
        message: "Foto actualizada correctamente",
        data: {
          rutaImg: result,
        },
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const getPhotoUser = async (req: CustomRequestI, res: Response) => {
  try {
    const result = await getPhotoUserAWS(req.idUser);

    if (!result) {
      return res.status(200).json({
        ok: false,
        message: "Sin imagen",
        data: {
          rutaImg: "",
        },
      });
    }

    if (result) {
      return res.status(200).json({
        ok: true,
        message: "Imagen obtenida",
        data: {
          rutaImg: result,
        },
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const ChangePassword = async (req: CustomRequestI, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const findPassHas = await prisma.users.findFirst({
      where: {
        idUser: req.idUser,
      },
      select: {
        password: true,
      },
    });

    if (!findPassHas?.password) {
      return res
        .status(400)
        .json({ ok: false, message: "Contrasena no encontrada" });
    }

    let verifyCurrentPass = await verifyPassword(
      currentPassword,
      findPassHas.password,
    );

    if (!verifyCurrentPass) {
      return res
        .status(400)
        .json({ ok: false, message: "La contraseña actual es incorrecta" });
    }
    const createdAt = DateTime.now()
      .setZone("America/Mexico_City", { keepLocalTime: true })
      .toJSDate();

    let newPasswordInsert = await hasPassword(newPassword);

    const insertNewPass = await prisma.users.update({
      where: {
        idUser: req.idUser,
      },
      data: {
        password: newPasswordInsert,
      },
    });

    if (insertNewPass) {
      await prisma.changepassword.create({
        data: {
          userId: req.idUser,
          createdAt: createdAt,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Contraseña actualizada correctamente.",
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const removeAccount = async (req: CustomRequestI, res: Response) => {
  try {
    const { pass } = req.body;

    const slcUser = await prisma.users.findFirst({
      where: {
        idUser: Number(req.idUser),
      },
    });

    if (!slcUser) {
      return res.status(400).json({
        ok: false,
        message: "Usuario no encontrado con el id " + req.idUser,
      });
    }

    if (pass != "") {
      const veryPass: boolean = await verifyPassword(pass, slcUser.password!);

      if (!veryPass) {
        return res.status(400).json({
          ok: false,
          message:
            "La contraseña no coincide con la cuenta, intentelo de nuevo",
        });
      }
      await prisma.users.update({
        where: {
          idUser: Number(req.idUser),
        },
        data: {
          active: 0,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Cuenta eliminada correctamente",
      });
    } else {
      await prisma.users.update({
        where: {
          idUser: Number(req.idUser),
        },
        data: {
          active: 0,
        },
      });

      return res.status(200).json({
        ok: true,
        message: "Cuenta eliminada correctamente",
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.mesage,
    });
  }
};
