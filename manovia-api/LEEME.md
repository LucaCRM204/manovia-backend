# Manovia — API y panel de administración

Backend en Node + MySQL para que Sofía y Martín carguen productos,
cambien precios y suban fotos sin tocar código.

```
manovia-api/
  src/
    servidor.js        arranca todo
    db.js              conexión a MySQL
    auth.js            login con JWT
    migrar.js          crea las tablas y carga los 19 productos actuales
    crear-usuario.js   da de alta a quien va a entrar al panel
    rutas/publico.js   GET /api/catalogo   (lo lee el sitio, sin login)
    rutas/admin.js     todo lo del panel   (exige login)
  panel/index.html     el panel, una sola página
  sql/esquema.sql      las tablas, para abrir en MySQL Workbench
```

---

## 1. Base de datos en Railway

New Project → **Add MySQL**. Railway crea la base y las credenciales solo.

## 2. El servicio del API

En el mismo proyecto: **Add Service → GitHub Repo**, elegí el repo de esta carpeta.

### Volumen para las fotos — NO LO SALTEES

El disco de Railway es efímero: **todo lo que se suba se borra en cada
redeploy**. Las fotos necesitan un volumen persistente.

Service → **Settings → Volumes → New Volume**
- Mount path: `/data`

### Variables (pestaña Variables)

| Variable | Valor |
|---|---|
| `MYSQL_URL` | `${{MySQL.MYSQL_URL}}` ← referencia al servicio MySQL |
| `JWT_SECRET` | una cadena larga al azar (ver abajo) |
| `ORIGENES` | `https://manovia.com.ar,https://www.manovia.com.ar` |
| `CARPETA_FOTOS` | `/data/fotos` |

Para generar el `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Si esta clave cambia, se cierran todas las sesiones abiertas. No pasa nada grave,
solo hay que volver a entrar.

## 3. Crear las tablas, el catálogo y el usuario — sin CLI

Agregá estas variables **temporalmente** y guardá. Al redeployar, el
servidor crea las tablas, carga las 5 secciones con los 19 productos
y da de alta al usuario del panel.

| Variable | Valor |
|---|---|
| `MIGRAR` | `1` |
| `ADMIN_EMAIL` | `sofia@manovia.com.ar` |
| `ADMIN_PASSWORD` | la clave del panel (8 caracteres o más) |
| `ADMIN_NOMBRE` | `Sofía` |

En los logs tiene que aparecer:

```
Migración lista · productos nuevos: 19/19 · fotos: 32
Usuario del panel listo: sofia@manovia.com.ar
```

**Después borrá `MIGRAR`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`.** Dejarlas no
rompe nada (todo es idempotente), pero la clave no tiene por qué quedar
guardada ahí.

Para cambiar la clave más adelante, o sumar a Martín: volvés a poner
`ADMIN_EMAIL` y `ADMIN_PASSWORD`, redeploya, y las sacás.

La clave se guarda hasheada con bcrypt: ni vos ni nadie puede leerla después.

### Con Railway CLI, si lo preferís

```bash
railway run npm run migrar
railway run node src/crear-usuario.js sofia@manovia.com.ar "clave" "Sofía"
```

## 5. Subir las fotos que ya existen

Las 32 fotos actuales están en el repo del sitio, en `img/`. Copialas al
volumen una sola vez (Railway CLI, o arrastrándolas desde el panel producto
por producto si son pocas):

```bash
railway run bash -c "mkdir -p /data/fotos"
# y después subí el contenido de img/ ahí
```

Mientras no estén, la web muestra el marcador bordó con el nombre: no se rompe.

## 6. Conectar el sitio

En el `index.html` del sitio, arriba del script:

```js
api: "https://TU-SERVICIO.up.railway.app",
```

Ese dato lo da Railway en Settings → Networking → Generate Domain.

---

## Usar MySQL Workbench

Railway → servicio MySQL → **Variables**. Ahí están:

| Workbench | Variable de Railway |
|---|---|
| Hostname | `MYSQLHOST` |
| Port | `MYSQLPORT` |
| Username | `MYSQLUSER` |
| Password | `MYSQLPASSWORD` |
| Default Schema | `MYSQLDATABASE` |

Connection Method: **Standard TCP/IP**. Railway acepta conexiones externas
sin túnel SSH.

---

## El panel

Entra en `https://TU-SERVICIO.up.railway.app/admin`

Permite: crear y editar productos, cambiar precios, subir y borrar fotos,
ocultar un producto sin borrarlo, y crear secciones nuevas.

Las fotos se recortan solas a 900x1200 (3:4) sin importar cómo vengan del
celular, así la grilla del sitio queda pareja.

## Seguridad

- La clave nunca viaja ni se guarda en texto plano (bcrypt, 12 rondas)
- El token vence a las 12 horas
- Máximo 8 intentos de login cada 15 minutos por IP
- El mensaje de error es el mismo con mail inexistente o clave mala,
  para no confirmarle a nadie qué mails existen
- Solo se aceptan imágenes, y se reprocesan con sharp (un archivo
  disfrazado de .jpg falla al procesarse)

## Si algo falla

El sitio tiene un catálogo de respaldo escrito en el propio `index.html`.
Si el API no responde, la web sigue mostrando los productos viejos en vez de
quedar vacía. En la consola del navegador queda el aviso.

Para volver al modo anterior por completo: `api: ""` en la config.
