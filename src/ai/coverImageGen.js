import { coverStylePromptFragment } from "./coverStylePresets";

// URL real da OpenAI para geração de imagem — sempre fixa aqui, mesmo que o
// usuário configure um baseUrl de proxy pro passo de chat completion (o
// proxy pode não ter esse endpoint). Mesma decisão do Qenna Writer.
const OPENAI_IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const PROMPT_ENGINEERING_SYSTEM_PROMPT = `You are the Art Director for this book cover design tool — you turn a short, informal request from an author into ONE dense, specific image-generation prompt, ready to send straight to an image model. Your job is not to repeat what was said: it's to build a complete art direction that fits the request and works as book cover key art.

## Book cover constraints (always apply)
This image will be used as the BACKGROUND of a book cover — the title and author name will be overlaid on top of it afterward, usually near the top and/or bottom of the frame. Compose the scene so the top and bottom bands stay visually calm enough for text to sit on top of (avoid tiny critical details or business right at the very top/bottom edges); the main subject and visual interest should read clearly at a glance, like real book cover key art, not a busy poster. Always use a vertical/portrait composition.

## Sources of information
You may receive: (1) the author's current request — subject, scene, mood, genre; (2) a style direction (art direction only — lighting/technique, never overrides the requested scene); (3) the book's title and author name, for genre/tone context only — never render the title or author text into the image itself.

## How to build the prompt
Cover: subject/scene → key physical or visual details → pose/action or composition of objects → mood and emotion → setting and environment → lighting → framing and composition → atmosphere → finish. Prefer concrete, visually representable details over vague adjectives ("extremely beautiful, epic, stunning") — anchor mood in something concrete ("warm side light catching the texture of the coat"), not abstract feeling alone.

## Text, logos, and negatives
Never request the book's title, author name, or any other text, logo, or watermark to appear in the image — the design tool will add real text on top afterward. Don't stack a list of negative restrictions by default; give clear positive instructions instead.

## Final rules (non-negotiable)
Never return an empty prompt or a refusal — if the request brushes against something sensitive, produce the closest safe version instead of failing outright.

## Output
Reply with ONLY the final prompt as plain running text — no quotes, no title, no the word "Prompt:", no explanation, no multiple options, no markdown, no commentary.`;

function buildUserContent({ description, stylePreset, title, author }) {
  let content = String(description || "").trim();
  const styleFragment = coverStylePromptFragment(stylePreset);
  if (styleFragment) content += `\n\n${styleFragment}`;
  const context = [];
  if (title?.trim()) context.push(`Book title: ${title.trim()}`);
  if (author?.trim()) context.push(`Author: ${author.trim()}`);
  if (context.length) {
    content += `\n\n(Context only, do not render as text in the image — ${context.join(", ")})`;
  }
  return content;
}

async function extractApiError(res) {
  try {
    const data = await res.json();
    return data?.error?.message || res.statusText;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

// ── OpenAI ───────────────────────────────────────────────────────────────

async function engineerCoverPromptOpenAI({ apiKey, baseUrl, model, description, stylePreset, title, author }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PROMPT_ENGINEERING_SYSTEM_PROMPT },
        { role: "user", content: buildUserContent({ description, stylePreset, title, author }) },
      ],
    }),
  });

  if (!res.ok) throw new Error(await extractApiError(res));

  const data = await res.json();
  const prompt = data?.choices?.[0]?.message?.content?.trim();
  if (!prompt) throw new Error("The prompt-engineering step returned an empty response.");
  return prompt;
}

async function generateCoverImageOpenAI({ apiKey, prompt, model, quality }) {
  const res = await fetch(OPENAI_IMAGE_GENERATIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1536",
      quality,
      n: 1,
    }),
  });

  if (!res.ok) throw new Error(await extractApiError(res));

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image API response did not include image data.");
  return `data:image/png;base64,${b64}`;
}

// ── Gemini ("nano banana") ──────────────────────────────────────────────
// Auth via header x-goog-api-key (não Bearer). Sem endpoint de chat
// separado — tudo passa por generateContent, com systemInstruction no
// lugar da mensagem "system". A proporção de retrato é pedida via
// generationConfig.imageConfig.aspectRatio, sem parâmetro de "quality".

async function engineerCoverPromptGemini({ apiKey, model, description, stylePreset, title, author }) {
  const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PROMPT_ENGINEERING_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserContent({ description, stylePreset, title, author }) }] }],
    }),
  });

  if (!res.ok) throw new Error(await extractApiError(res));

  const data = await res.json();
  const prompt = data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text?.trim();
  if (!prompt) throw new Error("The prompt-engineering step returned an empty response.");
  return prompt;
}

async function generateCoverImageGemini({ apiKey, prompt, model }) {
  const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "2:3" },
      },
    }),
  });

  if (!res.ok) throw new Error(await extractApiError(res));

  const data = await res.json();
  const imagePart = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!imagePart) throw new Error("The image API response did not include image data.");
  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType || "image/png"};base64,${b64}`;
}

/** Roda os dois passos em sequência para o provedor escolhido. Retorna { prompt, dataUrl }. */
export async function generateCoverArt({ provider, apiKey, baseUrl, chatModel, imageModel, quality, description, stylePreset, title, author }) {
  if (provider === "gemini") {
    const prompt = await engineerCoverPromptGemini({ apiKey, model: chatModel, description, stylePreset, title, author });
    const dataUrl = await generateCoverImageGemini({ apiKey, prompt, model: imageModel });
    return { prompt, dataUrl };
  }
  const prompt = await engineerCoverPromptOpenAI({ apiKey, baseUrl, model: chatModel, description, stylePreset, title, author });
  const dataUrl = await generateCoverImageOpenAI({ apiKey, prompt, model: imageModel, quality });
  return { prompt, dataUrl };
}
