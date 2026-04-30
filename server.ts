import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { fetchLatestEmails, sendReplyEmail } from "./src/emailService.ts";
import { analyzeAppeal } from "./src/geminiService.ts";

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
        hasGemini: !!process.env.GEMINI_API_KEY,
        nodeEnv: process.env.NODE_ENV
      }
    });
  });

  // API Route for AI analysis
  app.post("/api/analyze", async (req, res) => {
    try {
      const { content, geminiKey } = req.body;
      console.log(`API: POST /api/analyze`);
      const result = await analyzeAppeal(content, geminiKey);
      res.json(result);
    } catch (error) {
      console.error('Analysis Error:', error);
      const message = error instanceof Error ? error.message : "Ошибка при анализе";
      res.status(500).json({ error: "Failed to analyze", message });
    }
  });

  // API Route for sending reply
  app.post("/api/send-reply", async (req, res) => {
    try {
      const { to, subject, text, config } = req.body;
      console.log(`API: POST /api/send-reply to=${to}`);
      await sendReplyEmail(to, subject, text, config);
      res.json({ success: true });
    } catch (error) {
      console.error('SMTP Error:', error);
      const message = error instanceof Error ? error.message : "Ошибка при отправке почты";
      res.status(500).json({ error: "Failed to send email", message });
    }
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
    const indexHtml = path.join(distPath, 'index.html');
    
    if (fs.existsSync(indexHtml)) {
      console.log(`Production mode: serving static files from ${distPath}`);
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(indexHtml);
      });
    } else {
      console.warn("WARNING: 'dist/index.html' not found. Only API routes will be available.");
      app.get('*', (req, res) => {
        res.status(404).send("Front-end not built. Run 'npm run build' first.");
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
