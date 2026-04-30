import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fetchLatestEmails } from "./src/emailService.ts";

async function startServer() {
  // Production server entry point
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for syncing emails
  app.post("/api/sync-emails", async (req, res) => {
    try {
      const config = req.body;
      const emails = await fetchLatestEmails(config);
      res.json(emails);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Неизвестная ошибка при получении почты";
      res.status(500).json({ error: "Failed to fetch emails", message });
    }
  });

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
      console.error(error);
      const message = error instanceof Error ? error.message : "Неизвестная ошибка при получении почты";
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
