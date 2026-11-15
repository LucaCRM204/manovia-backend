/* ============================================================
   Conexión a MySQL (Railway).
   Railway inyecta MYSQL_URL solo. Si estás local con Workbench,
   podés usar las variables sueltas del .env.
   ============================================================ */
const mysql = require("mysql2/promise");

function configurar(){
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (url){
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace("/", "")
    };
  }
  return {
    host: process.env.MYSQLHOST || "localhost",
    port: Number(process.env.MYSQLPORT || 3306),
    user: process.env.MYSQLUSER || "root",
    password: process.env.MYSQLPASSWORD || "",
    database: process.env.MYSQLDATABASE || "manovia"
  };
}

const pool = mysql.createPool({
  ...configurar(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  // Railway corta conexiones ociosas; esto evita el ECONNRESET clásico
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

module.exports = pool;
