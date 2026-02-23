import fs from "fs";
import { Service } from "node-windows";

const daemonPath = "C:\\Users\\soporteit_cuatrod\\Documents\\Desarrollos\\API REDA_SAP\\daemon";
if (!fs.existsSync(daemonPath)) {
  fs.mkdirSync(daemonPath);
}

const svc = new Service({
  name: "REDA_Service",
  description: "Flujo REDA hacia Google Sheets",
  script: "C:\\Users\\soporteit_cuatrod\\Documents\\Desarrollos\\API REDA_SAP\\app.js",
  wait: 2,
  grow: 0.5,
  maxRestarts: 40,
});

svc.on("install", () => svc.start());
svc.install();
