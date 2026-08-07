import { coverStylePromptFragment } from "./coverStylePresets";

// URL real da OpenAI para geração de imagem — sempre fixa aqui, mesmo que o
// usuário configure um baseUrl de proxy pro passo de chat completion (o
// proxy pode não ter esse endpoint). Mesma decisão do Qenna Writer.
const IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";

const PROMPT_ENGINEERING_SYSTEM_PROMPT = `You are the Art Director for this book cover design tool — you turn a short, informal request from an author into ONE dense, specific image-generation prompt, ready to send straight to an image model (GPT Image). Your job is not to repeat what was said: it's to build a complete art direction that fits the request and works as book cover key art.

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

/**
 * Passo 1: engenharia de prompt via chat completion.
 * Retorna o prompt de imagem final (string).
 */
export async function engineerCoverPrompt({ apiKey, baseUrl, model, description, stylePreset, title, author }) {
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

  if (!res.ok) {
    throw new Error(await extractApiError(res));
  }

  const data = await res.json();
  const prompt = data?.choices?.[0]?.message?.content?.trim();
  if (!prompt) throw new Error("The prompt-engineering step returned an empty response.");
  return prompt;
}

/**
 * Passo 2: geração da imagem em si. Retorna uma data URL (image/png).
 */
export async function generateCoverImage({ apiKey, prompt, model, quality }) {
  const res = await fetch(IMAGE_GENERATIONS_URL, {
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

  if (!res.ok) {
    throw new Error(await extractApiError(res));
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image API response did not include image data.");
  return `data:image/png;base64,${b64}`;
}

/** Roda os dois passos em sequência. Retorna { prompt, dataUrl }. */
export async function generateCoverArt({ apiKey, baseUrl, chatModel, imageModel, quality, description, stylePreset, title, author }) {
  const prompt = await engineerCoverPrompt({
    apiKey,
    baseUrl,
    model: chatModel,
    description,
    stylePreset,
    title,
    author,
  });
  const dataUrl = await generateCoverImage({ apiKey, prompt, model: imageModel, quality });
  return { prompt, dataUrl };
}
