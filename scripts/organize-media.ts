// Files every asset under public/media, named after the piece that uses it (lib/media.ts).
// `npm run media` shows the plan; `npm run media -- --apply` carries it out.
import { organize } from "../lib/media.ts";

organize(process.cwd(), { apply: process.argv.includes("--apply") })
  .then(result => { console.log(result.report); })
  .catch((error: Error) => { console.error(error.message); process.exit(1); });
