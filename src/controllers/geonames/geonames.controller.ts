import dotenv from "dotenv";
import axios from "axios";
import { Request, Response } from "express";

dotenv.config({ path: ".env.prod" });
const apiGeoNames = axios.create({
  baseURL: `http://api.geonames.org`,
  params: {
    username: process.env.KEY_GEONAMES,
  },
});

export const getAddressWithPostalCode = async (req: Request, res: Response) => {
  try {
    const { postalCode } = req.body;

    if (!postalCode) {
      return res.status(400).json({ ok: false, message: "Faltan campos" });
    }

    const response = await apiGeoNames.get(
      `/postalCodeLookupJSON?postalcode=${postalCode}&country=MX`
    );

    if (response.status == 200) {
      const data = await response.data;
      return res.status(200).json({
        ok: true,
        message: "OK!",
        data: data,
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      ok: true,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};
