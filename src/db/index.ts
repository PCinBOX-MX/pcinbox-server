import mysql from "mysql2/promise";
import dotenv from "dotenv";

// const envFile = `.env.${process.env.NODE_ENV || "local"}`;
dotenv.config({ path: ".env.prod" });
const connectionDb = async () => {
  try {
    const pool = mysql.createPool(process.env.DATABASE_URL || "");
    const connection = await pool.getConnection();

    connection.release();
  } catch (err) {
    throw err;
  }
};

connectionDb();
