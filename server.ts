import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { fetchLatestEmails } from "./src/emailService.ts";

async function startServer() {
  // Production server entry point
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(cors()); // Enable CORS for cross-domain requests
  app.use(express.json());

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: {
        hasUser: !!process.env.EMAIL_USER,
        hasPass: !!process.env.EMAIL_PASS,
        nodeEnv: process.env.NODE_ENV
      }
    });
  });

  // API Route for syncing emails (Manual Config)
  app.post("/api/sync-emails", async (req, res) => {
    try {
      const config = req.body;
      console.log(`API: POST /api/sync-emails with host=${config.host}`);
      const emails = await fetchLatestEmails(config);
      res.json(emails);
    } catch (error) {
      console.error('Server sync error:', error);
      const message = error instanceof Error ? error.message : "Неизвестная ошибка на сервере";
      res.status(500).json({ error: "Failed to fetch emails", message });
    }
  });

  // API Route for syncing emails (Env Config)
  app.get("/api/sync-emails", async (req, res) => {
    try {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(400).json({ 
          error: "Email credentials not configured",
          message: "Пожалуйста, настройте EMAIL_USER и EMAIL_PASS в секретах проекта."
        });
      }
      const emails = await fetchLatestEmails();
      res.json(emails);
    } catch (error) {
      console.error('Server GET sync error:', error);
      const message = error instanceof Error ? error.message : "Неизвестная ошибка на сервере";
      res.status(500).json({ error: "Failed to fetch emails", message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    console.log(`Production mode: serving static files from ${distPath}`);
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      console.error('CRITICAL: dist/index.html not found! Make sure you ran "npm run build".');
    }
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
