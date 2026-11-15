/* Crea o actualiza un usuario del panel.
   Uso:  node src/crear-usuario.js sofia@manovia.com.ar "clave segura" "Sofía"   */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("./db");

(async () => {
  const [email, clave, nombre] = process.argv.slice(2);
  if (!email || !clave){
    console.log('Uso: node src/crear-usuario.js <email> "<clave>" "<nombre>"');
    process.exit(1);
  }
  if (clave.length < 8){ console.log("La clave tiene que tener 8 caracteres o más."); process.exit(1); }

  const hash = await bcrypt.hash(clave, 12);
  await pool.query(
    `INSERT INTO usuarios (email, password_hash, nombre) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), nombre = VALUES(nombre)`,
    [email.trim().toLowerCase(), hash, nombre || null]
  );
  console.log("Listo:", email);
  process.exit(0);
})();
