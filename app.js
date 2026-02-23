//Desactiva la validación de certificados TLS 
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Importación de librerías necesarias
import cron from "node-cron";          // Para programar tareas automáticas
import fetch from "node-fetch";        // Para hacer peticiones HTTP a APIs
import { google } from "googleapis";   // Para interactuar con Google Sheets
import dotenv from "dotenv";           // Para cargar variables de entorno desde .env

dotenv.config(); // Carga las variables de entorno definidas en el archivo .env

// API Key para autenticación con REDA
const API_KEY = process.env.API_KEY;

// Diccionario de proyectos con su respectivo ID en REDA
const proyectos = {
  "Colina D Santiago": 10,
  "Puerto D Marqués": 30,
  "Hacienda D San Gabriel": 32,
  "LAGRAND": 35,
  "Senda D Santino": 57,
  "Villa D Nogal": 16,
  "Cerrada D Melocotón": 17,
  "MooD 08": 179,
};

// Construye la URL para obtener inventario de un proyecto
function buildUrlInventario(idProyecto) {
  return `https://api.reda.mx/integracion/recupera-inventario-proyecto?IdProyecto=${idProyecto}`;
}

// Construye la URL para obtener fondeo (ventas) de un proyecto
function buildUrlFondeo(idProyecto) {
  return `https://api.reda.mx/integracion/recupera-ventas-proyecto?IdProyecto=${idProyecto}`;
}

// Obtiene inventarios desde la API REDA
async function getInventories(idProyecto) {
  const res = await fetch(buildUrlInventario(idProyecto), {
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
  return res.json();
}

// Obtiene fondeo (ventas) desde la API REDA
async function getFondeo(idProyecto) {
  const res = await fetch(buildUrlFondeo(idProyecto), {
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
  return res.json();
}

// Formatea fechas ISO a formato dd/mm/yyyy
function formatDate(isoString) {
  if (!isoString) return 0;
  const date = new Date(isoString);
  if (isNaN(date)) return 0;
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

// Combina inventarios y fondeo en un solo dataset
async function combineData(idProyecto, nombreProyecto) {
  const [inventories, fondeo] = await Promise.all([
    getInventories(idProyecto),
    getFondeo(idProyecto),
  ]);

  // Mapeo de unidades de fondeo para fácil acceso
  const fondeoMap = new Map(
    fondeo
      .filter(f => f.unidad) // evita valores nulos
      .map(f => [f.unidad.trim().toLowerCase(), f])
  );

  // Une inventario con fondeo por unidad
  return inventories.map(inv => {
    const key = inv.nombreUnidad ? inv.nombreUnidad.trim().toLowerCase() : "";
    const fondeoData = fondeoMap.get(key);

    return {
      proyecto: nombreProyecto,
      nombreUnidad: inv.nombreUnidad || "N/A",
      estatus: inv.estatus || "N/A",
      m2: inv.m2 || 0,
      precio: inv.precio || 0,
      fechaBloqueo: inv.fechaBloqueo ? formatDate(inv.fechaBloqueo) : 0,
      fechaFormalizado: inv.fechaFormalizado ? formatDate(inv.fechaFormalizado) : 0,
      valorCobrado: fondeoData ? fondeoData.cobrado : 0,
    };
  });
}

// Verifica si existe la hoja en Google Sheets, si no la crea
async function ensureSheetExists(sheets, spreadsheetId, nombreProyecto) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = metadata.data.sheets.some(
    s => s.properties.title === nombreProyecto
  );

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: nombreProyecto },
            },
          },
        ],
      },
    });
    console.log(`Hoja creada: ${nombreProyecto}`);
  }
}

// Guarda los datos combinados en Google Sheets
async function saveToGoogleSheets(nombreProyecto, data) {
  // Autenticación con Google API usando credenciales locales
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\soporteit_cuatrod\\Documents\\Desarrollos\\API REDA_SAP\\credentials.json", 
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.spreadsheetId;

  // Asegura que la hoja exista
  await ensureSheetExists(sheets, spreadsheetId, nombreProyecto);

  // Timestamp de la ejecución
  const timestamp = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

  // Encabezados de la hoja
  const headers = [
    ["Hora de consulta", "Proyecto", "Unidad", "Estatus", "m2", "Precio", "Fecha Bloqueo", "Fecha Formalización", "Valor Cobrado"]
  ];

  // Datos a insertar
  const values = data.map(inv => [
    timestamp,
    inv.proyecto,
    inv.nombreUnidad,
    inv.estatus,
    inv.m2,
    inv.precio,
    inv.fechaBloqueo,
    inv.fechaFormalizado,
    inv.valorCobrado
  ]);

  // Reemplaza los datos en la hoja
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${nombreProyecto}!A1:I`,
    valueInputOption: "RAW",
    requestBody: { values: [...headers, ...values] },
  });

  console.log(`Datos reemplazados en hoja: ${nombreProyecto}`);
}

// Flujo principal: procesa todos los proyectos y guarda en Sheets
async function ejecutarFlujo() {
  try {
    for (const [nombreProyecto, idProyecto] of Object.entries(proyectos)) {
      console.log(`Procesando proyecto: ${nombreProyecto}`);
      const data = await combineData(idProyecto, nombreProyecto);
      if (data.length > 0) {
        await saveToGoogleSheets(nombreProyecto, data);
      }
    }
    console.log("✅ Todos los proyectos procesados y guardados en Google Sheets");
  } catch (err) {
    console.error("Error en la ejecución:", err.message);
  }
}

// Ejemplo de ejecución programada cada minuto (solo pruebas)
// cron.schedule("* * * * *", () => {
//   console.log("⏱️ Ejecutando flujo programado (cada minuto)...");
//   ejecutarFlujo();
// });

// Mantiene el proceso vivo (evita que termine)
setInterval(() => {}, 1000);

// Ejecución en producción: cada lunes a las 00:00
cron.schedule("0 0 * * 1", () => {
  console.log("⏱️ Ejecutando flujo semanal (lunes 00:00)...");
  ejecutarFlujo();
});
