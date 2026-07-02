import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import "../config/loadEnv";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import axios from "axios";
import xlsx from "xlsx";

export const hasPassword = async (password: string): Promise<string> => {
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  return hashedPassword;
};

export const verifyPassword = async (
  password: string,
  hashed: string,
): Promise<boolean> => {
  return bcrypt.compare(password, hashed);
};

function getJwtSecret(): string {
  const secret = process.env.KEY_JWT?.trim() || "";
  if (!secret) {
    throw new Error(
      "KEY_JWT no configurada en pcinbox-server (.env.local o .env.prod)",
    );
  }
  return secret;
}

export const signPayload = (
  obj: object | Buffer | string,
  expiresIn: number | any,
): string => {
  return jwt.sign(obj, getJwtSecret(), { expiresIn: expiresIn });
};

export function generateResetToken(): string {
  return nanoid(100);
}

export const writeErrorLogs = (error: any) => {
  const currentDate = new Date().toLocaleString();
  const fileLogs = path.join(__dirname, "logs.txt");
  const logEntry = `[${currentDate}] ${error}\n`;

  fs.appendFile(fileLogs, logEntry, (err: any) => {
    if (err) {
      console.error("Error al escribir en el archivo de log:", err);
    }
  });
};

export function parseBigInts(obj: any) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === "bigint" ? Number(value) : value,
    ),
  );
}

export const formatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export async function readExcelImageKit(url: string) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
  });

  // Leer el Excel desde el buffer
  const workbook = xlsx.read(response.data, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName!];

  const data = xlsx.utils.sheet_to_json(sheet!);

  return data;
}
