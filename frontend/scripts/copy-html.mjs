// Frappe serves www/portal.html. The built index.html needs the session's CSRF token,
// which Frappe injects through the Jinja placeholder below.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../towel_portal")
const src = path.join(root, "public/frontend/index.html")
const dest = path.join(root, "www/portal.html")

fs.copyFileSync(src, dest)
console.log(`copied ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dest)}`)
