const mysql = require('mysql2/promise');

async function compareDatabases() {
  const localConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'pcinbox_db',
    port: 3306
  };

  const prodConfig = {
    host: '136.113.205.140',
    user: 'root',
    password: '{O38c34Y}1e}zF(`',
    database: 'pcinbox_db',
    port: 3306
  };

  try {
    const localConn = await mysql.createConnection(localConfig);
    const prodConn = await mysql.createConnection(prodConfig);

    const query = `
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'pcinbox_db'
    `;

    const [localCols] = await localConn.query(query);
    const [prodCols] = await prodConn.query(query);

    const localDb = {};
    for (const row of localCols) {
      if (!localDb[row.TABLE_NAME]) localDb[row.TABLE_NAME] = {};
      localDb[row.TABLE_NAME][row.COLUMN_NAME] = row;
    }

    const prodDb = {};
    for (const row of prodCols) {
      if (!prodDb[row.TABLE_NAME]) prodDb[row.TABLE_NAME] = {};
      prodDb[row.TABLE_NAME][row.COLUMN_NAME] = row;
    }

    const missingTablesInProd = [];
    const missingColumnsInProd = {};
    const typeMismatches = {};

    for (const tableName in localDb) {
      if (!prodDb[tableName]) {
        missingTablesInProd.push(tableName);
      } else {
        for (const colName in localDb[tableName]) {
          if (!prodDb[tableName][colName]) {
            if (!missingColumnsInProd[tableName]) missingColumnsInProd[tableName] = [];
            missingColumnsInProd[tableName].push(colName);
          } else {
            const localType = localDb[tableName][colName].COLUMN_TYPE;
            const prodType = prodDb[tableName][colName].COLUMN_TYPE;
            if (localType !== prodType) {
              if (!typeMismatches[tableName]) typeMismatches[tableName] = [];
              typeMismatches[tableName].push({
                column: colName,
                local: localType,
                prod: prodType
              });
            }
          }
        }
      }
    }

    console.log("=== ANÁLISIS DE BASE DE DATOS: LOCAL VS PRODUCCIÓN ===");
    console.log("\n1. TABLAS FALTANTES EN PRODUCCIÓN:");
    if (missingTablesInProd.length === 0) {
      console.log("   Ninguna tabla falta en producción.");
    } else {
      missingTablesInProd.forEach(t => console.log(`   - ${t}`));
    }

    console.log("\n2. COLUMNAS FALTANTES EN PRODUCCIÓN (en tablas existentes):");
    if (Object.keys(missingColumnsInProd).length === 0) {
      console.log("   Ninguna columna falta en producción.");
    } else {
      for (const table in missingColumnsInProd) {
        console.log(`   Tabla '${table}':`);
        missingColumnsInProd[table].forEach(c => console.log(`     - ${c}`));
      }
    }

    console.log("\n3. COLUMNAS CON DIFERENTES TIPOS DE DATOS:");
    if (Object.keys(typeMismatches).length === 0) {
      console.log("   No hay diferencias en tipos de datos.");
    } else {
      for (const table in typeMismatches) {
        console.log(`   Tabla '${table}':`);
        typeMismatches[table].forEach(m => {
          console.log(`     - Columna '${m.column}': Local=(${m.local}), Prod=(${m.prod})`);
        });
      }
    }

    await localConn.end();
    await prodConn.end();

  } catch (error) {
    console.error("Error connecting or querying databases:", error);
  }
}

compareDatabases();
