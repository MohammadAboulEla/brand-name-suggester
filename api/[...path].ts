import { createApiApp } from "../services/api-app";

// Vercel invokes this file for any /api/* request (catch-all route); the
// Express app inspects req.url itself and matches its own /api/... routes.
export default createApiApp();
