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
import { uploadPhotoUser, getPhotoUserAWS, deletePhotoUserAWS } from "./../../imagekit/imagekit";
import "../../config/loadEnv";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { dispatchTemplateEmail } from "../../services/mail-dispatch.service";
import { hasUserPhone, maskUserPhone, buildPhoneReminderState } from "../../utils/phoneMask.util";
import {
  confirmRegisterVerificationCode,
  requestRegisterVerificationCode,
  resendRegisterVerificationCode,
} from "../../services/registerEmailVerification.service";
import { resolveClientIp } from "../../utils/http-rate-limiter.util";

const fechaLocal = DateTime.now().setZone("America/Mexico_City");

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

    // Obtener total de favoritos
    const totalFavorites = await prisma.favorites.count({
      where: {
        userId: Number(slcUser.idUser),
        active: 1,
      },
    });

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
        totalFavorites,
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

/**
 * Paso 1 del registro: valida datos, NO crea la cuenta, envía código al correo.
 * (Reemplaza la creación directa anterior.)
 */
function setRetryAfterHeader(
  res: Response,
  data: unknown,
): void {
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { retryAfterSeconds?: number }).retryAfterSeconds ===
      "number"
  ) {
    res.setHeader(
      "Retry-After",
      String((data as { retryAfterSeconds: number }).retryAfterSeconds),
    );
  }
}

export const Register = async (req: Request, res: Response) => {
  try {
    const { name, lastname, email, password, phone, deviceId } = req.body || {};
    const result = await requestRegisterVerificationCode({
      name,
      lastname,
      email,
      password,
      phone,
      clientIp: resolveClientIp(req),
      deviceId,
    });

    if (result.status === 429) {
      setRetryAfterHeader(res, result.data);
    }

    return res.status(result.status).json({
      ok: result.ok,
      message: result.message,
      ...(result.data ? { data: result.data } : {}),
      needsEmailVerification: result.ok,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor",
    });
  }
};

export const ResendRegisterCode = async (req: Request, res: Response) => {
  try {
    const { email, deviceId } = req.body || {};
    const result = await resendRegisterVerificationCode(email, {
      clientIp: resolveClientIp(req),
      deviceId,
    });

    if (result.status === 429) {
      setRetryAfterHeader(res, result.data);
    }

    return res.status(result.status).json({
      ok: result.ok,
      message: result.message,
      ...(result.data ? { data: result.data } : {}),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor",
    });
  }
};

/** Paso 2: valida el código y crea la cuenta. */
export const ConfirmRegister = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body || {};
    const result = await confirmRegisterVerificationCode({ email, code });
    return res.status(result.status).json({
      ok: result.ok,
      message: result.message,
      ...(result.data ? { data: result.data } : {}),
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
        await dispatchTemplateEmail(
          email,
          "Bienvenido a PCinBOX",
          "welcome-email-1",
          {
            NAME: name,
          },
        );
        // await SendEmailWelcomeUser(
        //   `${name}`,

        //   email,
        // );
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

    // Obtener total de favoritos
    const totalFavorites = await prisma.favorites.count({
      where: {
        userId: Number(slcUser.idUser),
        active: 1,
      },
    });

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
          totalFavorites,
        },
      });
  } catch (error: any) {
    writeErrorLogs(`LoginGoogle: ${error?.message || error}`);
    const isDev =
      !process.env.NODE_ENV ||
      process.env.NODE_ENV === "local" ||
      process.env.NODE_ENV === "development";
    return res.status(500).json({
      ok: false,
      error: error?.message || "Error desconocido",
      message: isDev
        ? error?.message || "Error interno del servidor"
        : "Error interno del servidor",
    });
  }
};

export const getPhone = async (req: CustomRequestI, res: Response) => {
  try {
    const user = await prisma.users.findUnique({
      where: {
        idUser: Number(req.idUser),
      },
      select: {
        phone: true,
        password: true,
        phonePromptDismissedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado",
      });
    }

    const phone = user.phone?.trim() || null;
    const hasPhone = hasUserPhone(phone);
    const isGoogleAccount = user.password === null;
    const reminder = buildPhoneReminderState({
      isGoogleAccount,
      hasPhone,
      dismissedAt: user.phonePromptDismissedAt,
    });

    return res.status(200).json({
      ok: true,
      message: "Teléfono obtenido correctamente",
      data: {
        hasPhone,
        // Nunca devolver el teléfono en claro en lecturas (solo máscara).
        phoneMasked: maskUserPhone(phone),
        isGoogleAccount,
        reminderDue: reminder.reminderDue,
        reminderAvailableAt: reminder.reminderAvailableAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const dismissPhonePrompt = async (req: CustomRequestI, res: Response) => {
  try {
    const user = await prisma.users.findUnique({
      where: {
        idUser: Number(req.idUser),
      },
      select: {
        idUser: true,
        phone: true,
        password: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado",
      });
    }

    const now = new Date();
    await prisma.users.update({
      where: { idUser: user.idUser },
      data: { phonePromptDismissedAt: now },
    });

    const hasPhone = hasUserPhone(user.phone);
    const isGoogleAccount = user.password === null;
    const reminder = buildPhoneReminderState({
      isGoogleAccount,
      hasPhone,
      dismissedAt: now,
    });

    return res.status(200).json({
      ok: true,
      message: "Recordatorio pospuesto",
      data: {
        reminderDue: reminder.reminderDue,
        reminderAvailableAt: reminder.reminderAvailableAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const updatePhone = async (req: CustomRequestI, res: Response) => {
  try {
    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone.trim().replace(/\s+/g, " ")
        : "";

    if (!/^\+\d{1,3} \d{10}$/.test(phone)) {
      return res.status(400).json({
        ok: false,
        message:
          "El teléfono debe incluir una LADA válida y 10 dígitos, por ejemplo: +52 4771234567",
      });
    }

    const user = await prisma.users.findUnique({
      where: {
        idUser: Number(req.idUser),
      },
      select: {
        idUser: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado",
      });
    }

    const updatedUser = await prisma.users.update({
      where: {
        idUser: user.idUser,
      },
      data: {
        phone,
        phonePromptDismissedAt: null,
      },
      select: {
        phone: true,
      },
    });

    const saved = updatedUser.phone?.trim() || phone;

    return res.status(200).json({
      ok: true,
      message: "Teléfono actualizado correctamente",
      data: {
        hasPhone: true,
        // El cliente ya conoce el valor que envió; no lo re-exponemos en claro.
        phoneMasked: maskUserPhone(saved),
        reminderDue: false,
        reminderAvailableAt: null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
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

export const deletePhoto = async (req: CustomRequestI, res: Response) => {
  try {
    await deletePhotoUserAWS(req.idUser);

    return res.status(200).json({
      ok: true,
      message: "Foto eliminada correctamente",
      data: {
        rutaImg: "",
      },
    });
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
      if (!slcUser.password) {
        return res.status(400).json({
          ok: false,
          message: "Esta cuenta fue creada con Google y no tiene contraseña. Intente desvincularla sin enviar contraseña.",
        });
      }
      const veryPass: boolean = await verifyPassword(pass, slcUser.password);

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
