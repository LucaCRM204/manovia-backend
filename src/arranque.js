/* ============================================================
   Tareas de puesta en marcha, para no depender del CLI.
   Se disparan con variables de entorno y son idempotentes:
   se pueden dejar puestas sin romper nada, aunque conviene
   sacarlas una vez que el sitio quedó andando.
   ============================================================ */
const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcryptjs");
const pool = require("./db");

const SECCIONES = [
  ["mujer",         "Mujer",         1],
  ["hombre",        "Hombre",        2],
  ["portalipstick", "Portalipstick", 3],
  ["billetera",     "Billeteras",    4],
  ["tabaquera",     "Tabaqueras",    5]
];

async function migrar(){
  const esquema = await fs.readFile(path.join(__dirname, "..", "sql", "esquema.sql"), "utf8");
  for (const sentencia of esquema.split(/;\s*\n/)){
    if (sentencia.trim().replace(/--.*$/gm, "").trim()) await pool.query(sentencia);
  }

  for (const [slug, nombre, orden] of SECCIONES){
    await pool.query(
      "INSERT INTO secciones (slug,nombre,orden) VALUES (?,?,?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), orden=VALUES(orden)",
      [slug, nombre, orden]
    );
  }

  const productos = JSON.parse(
    await fs.readFile(path.join(__dirname, "datos-iniciales.json"), "utf8")
  );

  let nuevos = 0, fotos = 0;
  for (const [i, p] of productos.entries()){
    const [r] = await pool.query(
      `INSERT INTO productos (slug,nombre,seccion,precio,detalle,descripcion,etiqueta,colores,talles,orden)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [p.id, p.nombre, p.seccion, p.precio, p.detalle || "", p.desc || "",
       p.etiqueta || null, JSON.stringify(p.colores || []), JSON.stringify(p.talles || []), i]
    );
    if (r.affectedRows === 1) nuevos++;
    for (const [j, archivo] of (p.fotos || []).entries()){
      const [f] = await pool.query(
        `INSERT INTO fotos (producto_id, archivo, orden)
         SELECT ?,?,? FROM DUAL
          WHERE NOT EXISTS (SELECT 1 FROM fotos WHERE producto_id = ? AND archivo = ?)`,
        [r.insertId, archivo, j, r.insertId, archivo]
      );
      if (f.affectedRows) fotos++;
    }
  }
  console.log(`Migración lista · productos nuevos: ${nuevos}/${productos.length} · fotos: ${fotos}`);
}

async function crearAdmin(){
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const clave = process.env.ADMIN_PASSWORD || "";
  if (!email || !clave) return;
  if (clave.length < 8){
    console.warn("ADMIN_PASSWORD es muy corta (mínimo 8). No se creó el usuario.");
    return;
  }
  const hash = await bcrypt.hash(clave, 12);
  await pool.query(
    `INSERT INTO usuarios (email, password_hash, nombre) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), nombre = VALUES(nombre)`,
    [email, hash, process.env.ADMIN_NOMBRE || null]
  );
  console.log("Usuario del panel listo:", email);
  console.log("Ya podés sacar ADMIN_EMAIL y ADMIN_PASSWORD de las variables.");
}

/* Trae al volumen las fotos que ya están publicadas en el sitio.
   Evita subir una por una desde el panel la primera vez.
   Solo baja las que faltan, así se puede dejar puesto sin costo. */
async function importarFotos(){
  const origen = (process.env.IMPORTAR_FOTOS || "").replace(/\/$/, "");
  if (!origen) return;

  const carpeta = process.env.CARPETA_FOTOS || "/data/fotos";
  await fs.mkdir(carpeta, { recursive: true });

  const [filas] = await pool.query("SELECT DISTINCT archivo FROM fotos");
  let bajadas = 0, yaEstaban = 0, fallaron = 0;

  for (const { archivo } of filas){
    const destino = path.join(carpeta, archivo);
    try { await fs.access(destino); yaEstaban++; continue; } catch {}
    try {
      const r = await fetch(`${origen}/img/${archivo}`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const datos = Buffer.from(await r.arrayBuffer());
      if (datos.length < 1024) throw new Error("archivo muy chico");
      await fs.writeFile(destino, datos);
      bajadas++;
    } catch (e) {
      fallaron++;
      console.warn(`  no se pudo traer ${archivo}: ${e.message}`);
    }
  }
  console.log(`Fotos · bajadas: ${bajadas} · ya estaban: ${yaEstaban} · fallaron: ${fallaron}`);
  if (!fallaron && bajadas) console.log("Ya podés sacar IMPORTAR_FOTOS de las variables.");
}

/* Nunca tumba el servidor: si algo de esto falla, el API igual levanta
   y el error queda en los logs. */
async function preparar(){
  try {
    if (process.env.MIGRAR === "1") await migrar();
    await crearAdmin();
    await importarFotos();
  } catch (e) {
    console.error("Arranque:", e.message);
  }
}

module.exports = { preparar };
