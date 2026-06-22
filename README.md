# MercadoLibre Seller ID Finder

Web local para pegar varios links de MercadoLibre y extraer `ownerID` / `seller_id` cuando aparece en la URL, en redirecciones o en la fuente publica de la pagina.

La salida queda en dos columnas listas para copiar a Excel:

- `Nombre del seller`
- `ownerID`

El boton **Copiar para Excel** copia solo los datos, sin encabezado.

## Uso local

Requiere Node.js 18 o superior.

```bash
npm start
```

Abrir:

```text
http://127.0.0.1:4173
```

Para cambiar el puerto:

```bash
PORT=3000 npm start
```

## Como funciona

- Links `/pagina/nombre`: usa `nombre` como nombre del seller y prueba tambien el perfil del vendedor.
- Links `/tienda/nombre`: usa `nombre` como nombre del seller y prueba variantes de tienda/listado.
- Links de producto: si el link trae `seller_id%3A123` o `seller_id=123`, extrae ese ID directamente.
- Si MercadoLibre responde con verificacion de trafico (`/gz/account-verification`) y no incluye `_CustId_` ni `seller_id`, no hay ID publico para extraer desde esa respuesta.

## Scripts

```bash
npm start
npm run check
```

## Deploy en Vercel

Este repo esta preparado para Vercel:

- `public/index.html` sirve la interfaz.
- `api/find-seller-id.mjs` sirve el endpoint serverless `/api/find-seller-id`.
- `server.mjs` queda para uso local.

Pasos:

1. Subir el repo a GitHub.
2. Entrar a Vercel.
3. New Project.
4. Importar `iFaaka/meli-seller-id-finder`.
5. Framework Preset: `Other`.
6. Build Command: `npm run build` o dejar el default si Vercel lo detecta.
7. Output Directory: dejar vacio.
8. Deploy.

La URL final de Vercel va a servir la app y el frontend va a llamar automaticamente a `/api/find-seller-id`.

## Estructura

```text
.
├── api/
│   └── find-seller-id.mjs
├── public/
│   └── index.html
├── server.mjs
├── package.json
└── README.md
```
