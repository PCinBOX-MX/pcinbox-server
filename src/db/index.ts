import mysql from "mysql2/promise";
import "../config/loadEnv";

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
