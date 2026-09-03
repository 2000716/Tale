import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const webDir = resolve(root, "www");

mkdirSync(webDir, { recursive: true });
cpSync(resolve(root, "index.html"), resolve(webDir, "index.html"));
cpSync(resolve(root, "manifest.json"), resolve(webDir, "manifest.json"));
cpSync(resolve(root, "css"), resolve(webDir, "css"), { recursive: true });
cpSync(resolve(root, "js"), resolve(webDir, "js"), { recursive: true });

console.log("Webressurser synkronisert til www/");
