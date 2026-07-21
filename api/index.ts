import { createApiApp } from "../services/api-app.js";

// Vercel routes every /api/* request here (see vercel.json rewrites); the
// Express app inspects req.url itself and matches its own /api/... routes.
export default createApiApp();
