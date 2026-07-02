import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const cwd = process.cwd();

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(cwd, fileName);
  if (!fs.existsSync(filePath)) return;

  dotenv.config({
    path: filePath,
    override: false,
  });
}

// Local primero; prod completa variables faltantes (sin pisar las ya definidas).
loadEnvFile(".env.local");
loadEnvFile(".env.prod");
