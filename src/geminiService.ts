
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
  const ai = getAI(customKey);
  const prompt = `Проанализируй обращение гражданина и классифицируй его по следующим категориям:
- ЖКХ (вопросы отопления, воды, содержания домов)
- Транспорт (дороги, общественный транспорт, парковки)
- Здравоохранение (больницы, лекарства, запись к врачу)
- Социальная поддержка (выплаты, пособия, льготы)
- Благоустройство (парки, освещение, детские площадки)
- Образование (школы, детские сады)
- Экология (мусор, загрязнение)
- Другое (если ни одна категория не подходит)

Верни ответ строго в формате JSON:
1. "category": Название категории из списка выше.
2. "summary": Краткое резюме сути обращения (1 предложение).
3. "suggestedResponse": Официальный, вежливый предварительный ответ на русском языке от имени администрации.
4. "priority": Уровень срочности (LOW, MEDIUM, HIGH).

Текст обращения:
"${content}"`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            summary: { type: Type.STRING },
            suggestedResponse: { type: Type.STRING },
            priority: { 
              type: Type.STRING,
              enum: ["LOW", "MEDIUM", "HIGH"]
            },
          },
          required: ["category", "summary", "suggestedResponse", "priority"],
        },
      },
    });

    const result = JSON.parse(response.text);
    return result as AnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Failed to analyze appeal");
  }
}
