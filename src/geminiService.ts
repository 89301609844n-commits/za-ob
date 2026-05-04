
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "./types";

let aiInstance: GoogleGenAI | null = null;

function getAI(customKey?: string) {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. AI features will likely fail.");
  }
  return new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
}

export async function analyzeAppeal(content: string, customKey?: string): Promise<AnalysisResult> {
  try {
    const ai = getAI(customKey);
    const prompt = `Проанализируй обращение гражданина: "${content}"

Подготовь глубокий анализ для городской администрации:
1. "category": классификация (ЖКХ, Транспорт, Здравоохранение, Соцподдержка, Благоустройство, Образование, Экология, Другое).
2. "summary": краткая суть.
3. "priority": LOW, MEDIUM или HIGH.
4. "suggestedResponse": РАСШИРЕННЫЙ проект официального ответа (2-4 абзаца, вежливо, официально, с благодарностью за обращение).

Верни ответ в формате JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    let text = response.text;
    if (!text) throw new Error("Модель вернула пустой ответ.");
    
    // На всякий случай чистим от markdown
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const result = JSON.parse(text);
    return result as AnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("API key not valid")) {
      throw new Error("Неверный Gemini API Key. Проверьте его в Настройках.");
    }
    throw new Error("Ошибка ИИ: " + errorMsg);
  }
}
