import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const sellerPatterns = [
  { name: "_CustId_", regex: /_CustId_(\d{5,})/i },
  { name: "seller_id:url", regex: /seller[_-]?id(?:%3A|:|%3D|=)(\d{5,})/i },
  { name: "seller_id", regex: /["']seller[_-]?id["']\s*[:=]\s*["']?(\d{5,})["']?/i },
  { name: "sellerId", regex: /["']sellerId["']\s*[:=]\s*["']?(\d{5,})["']?/i },
  { name: "seller.id", regex: /["']seller["']\s*:\s*\{[^{}]{0,600}?["']id["']\s*:\s*["']?(\d{5,})["']?/i },
  { name: "owner_id", regex: /["']owner[_-]?id["']\s*[:=]\s*["']?(\d{5,})["']?/i },
  { name: "ownerId", regex: /["']ownerId["']\s*[:=]\s*["']?(\d{5,})["']?/i },
  { name: "cust_id", regex: /["']cust[_-]?id["']\s*[:=]\s*["']?(\d{5,})["']?/i },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function isAllowedMercadoLibreUrl(url) {
  return /(^|\.)mercadolibre\.com(\.[a-z]{2})?$/.test(url.hostname)
    || /(^|\.)mercadolibre\.com\.ar$/.test(url.hostname)
    || /(^|\.)mercadolivre\.com\.br$/.test(url.hostname);
}

function parseInputUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Ingresá una URL válida.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("La URL debe empezar con http:// o https://.");
  }

  if (!isAllowedMercadoLibreUrl(url)) {
    throw new Error("Por seguridad, solo acepto URLs de MercadoLibre/MercadoLivre.");
  }

  return url;
}

function candidateUrls(inputUrl) {
  const urls = [inputUrl.toString()];
  const parts = inputUrl.pathname.split("/").filter(Boolean);
  const pageIndex = parts.findIndex((part) => part.toLowerCase() === "pagina");
  const storeIndex = parts.findIndex((part) => part.toLowerCase() === "tienda");

  if (pageIndex >= 0 && parts[pageIndex + 1]) {
    const nickname = decodeURIComponent(parts[pageIndex + 1]);
    const siteHost = inputUrl.hostname.endsWith(".br")
      ? "perfil.mercadolivre.com.br"
      : "perfil.mercadolibre.com.ar";
    urls.push(`https://${siteHost}/${encodeURIComponent(nickname)}`);
  }

  if (storeIndex >= 0 && parts[storeIndex + 1]) {
    const storeName = decodeURIComponent(parts[storeIndex + 1]);
    urls.push(`https://${inputUrl.hostname}/tienda/${encodeURIComponent(storeName)}`);
    urls.push(`https://${inputUrl.hostname}/pagina/${encodeURIComponent(storeName)}`);
  }

  return [...new Set(urls)];
}

function sellerNameFromUrl(inputUrl) {
  const parts = inputUrl.pathname.split("/").filter(Boolean);
  const pageIndex = parts.findIndex((part) => part.toLowerCase() === "pagina");
  const storeIndex = parts.findIndex((part) => part.toLowerCase() === "tienda");
  if (pageIndex >= 0 && parts[pageIndex + 1]) {
    return decodeURIComponent(parts[pageIndex + 1]);
  }

  if (storeIndex >= 0 && parts[storeIndex + 1]) {
    return decodeURIComponent(parts[storeIndex + 1]);
  }

  if (/^perfil\./i.test(inputUrl.hostname) && parts[0]) {
    return decodeURIComponent(parts[0]);
  }

  return "";
}

function extractSellerId(html) {
  for (const pattern of sellerPatterns) {
    const match = pattern.regex.exec(html);
    if (match) {
      const start = Math.max(0, match.index - 90);
      const end = Math.min(html.length, match.index + match[0].length + 90);
      return {
        id: match[1],
        matchedBy: pattern.name,
        snippet: html.slice(start, end).replace(/\s+/g, " ").trim(),
      };
    }
  }
  return null;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "es-AR,es;q=0.9,en;q=0.7",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  const html = await response.text();
  return {
    finalUrl: response.url,
    html,
    ok: response.ok,
    status: response.status,
  };
}

async function findSellerId(rawUrl) {
  const inputUrl = parseInputUrl(rawUrl);
  const sellerName = sellerNameFromUrl(inputUrl);
  const attempts = [];

  for (const url of candidateUrls(inputUrl)) {
    const result = await fetchHtml(url);
    const source = `${url}\n${result.finalUrl}\n${result.html}`;
    const extracted = extractSellerId(source);
    attempts.push({
      url,
      finalUrl: result.finalUrl,
      status: result.status,
      found: Boolean(extracted),
      matchedBy: extracted?.matchedBy,
    });

    if (extracted) {
      return {
        ...extracted,
        sellerName,
        sourceUrl: url,
        finalUrl: result.finalUrl,
        attempts,
      };
    }
  }

  return { id: null, sellerName, attempts };
}

async function findSellerIds(rawUrls) {
  const urls = rawUrls
    .map((url) => String(url || "").trim())
    .filter(Boolean);

  if (urls.length === 0) throw new Error("Pegá al menos un link.");
  if (urls.length > 100) throw new Error("Máximo 100 links por búsqueda.");

  const rows = [];
  for (const url of urls) {
    try {
      const result = await findSellerId(url);
      rows.push({
        sellerName: result.sellerName || "",
        ownerId: result.id || "",
        ok: Boolean(result.id),
        url,
      });
    } catch (error) {
      rows.push({
        sellerName: "",
        ownerId: "",
        ok: false,
        url,
        error: error.message || "No se pudo procesar.",
      });
    }
  }

  return { rows };
}

async function readRequestJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error("El pedido es demasiado grande.");
  }
  return JSON.parse(body || "{}");
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/find-seller-id") {
      const body = await readRequestJson(req);
      const urls = Array.isArray(body.urls)
        ? body.urls
        : String(body.url || "").split(/\n+/);
      const result = await findSellerIds(urls);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    res.writeHead(405, { allow: "GET, POST" });
    res.end("Method not allowed");
  } catch (error) {
    sendJson(res, 400, { error: error.message || "No se pudo procesar el pedido." });
  }
});

server.listen(port, host, () => {
  console.log(`Seller ID Finder listo en http://${host}:${port}`);
});
