/* ============================================================
   Login con JWT. La clave vive hasheada en la base (bcrypt),
   nunca en el código ni en el HTML.
   ============================================================ */
const jwt = require("jsonwebtoken");

const SECRETO = process.env.JWT_SECRET;
if (!SECRETO || SECRETO.length < 24){
  console.error("FALTA JWT_SECRET (mínimo 24 caracteres). Cargalo en las variables de Railway.");
  process.exit(1);
}

const firmar = usuario =>
  jwt.sign({ id: usuario.id, email: usuario.email }, SECRETO, { expiresIn: "12h" });

function exigirLogin(req, res, next){
  const cabecera = req.headers.authorization || "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Falta iniciar sesión" });
  try {
    req.usuario = jwt.verify(token, SECRETO);
    next();
  } catch {
    res.status(401).json({ error: "La sesión venció. Volvé a entrar." });
  }
}

module.exports = { firmar, exigirLogin };
