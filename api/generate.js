// Vercel serverless function: POST /api/generate  (Google Gemini "Nano Banana" version - FREE tier)
// Body: { image: "data:image/jpeg;base64,...", treatment: "implant" | "full-arch" | "veneers" }
// Returns: { url: "data:image/png;base64,..." } (generated after-photo)
//
// Env vars (set in Vercel dashboard):
//   GEMINI_API_KEY = AIza...   (free key from https://aistudio.google.com -> Get API key)
// Optional:
//   GEMINI_MODEL = model id, default "gemini-2.5-flash-image" (free tier ~500 images/day)

const MODEL = 'gemini-3.1-flash-lite-image';

const PROMPTS = {
  implant:
    'Edit this photo. Keep the same person, same face, same skin, same lighting and background. Only edit the mouth: replace missing or damaged teeth with natural-looking dental implant crowns that match the surrounding teeth in color and shape. Healthy gums, realistic natural smile. Photorealistic result. Do not change anything else in the image.',
  'full-arch':
    'Edit this photo. Keep the same person, same face, same skin, same lighting and background. Only edit the mouth: full-arch dental restoration - a complete set of straight, healthy, natural-looking teeth with a naturally bright (not artificially white) shade and healthy pink gums. Realistic confident smile. Photorealistic result. Do not change anything else in the image.',
  veneers:
    'Edit this photo. Keep the same person, same face, same skin, same lighting and background. Only edit the teeth: apply porcelain veneers - straight, well-proportioned, uniformly shaped teeth with a bright natural white shade. Subtle, believable, high-end cosmetic dentistry result. Photorealistic. Do not change anything else in the image.',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server not configured: missing GEMINI_API_KEY env var (free key at aistudio.google.com).' });
    }

    const { image, treatment } = req.body || {};
    const prompt = PROMPTS[treatment];
    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image || '');
    if (!match) {
      return res.status(400).json({ error: 'Missing or invalid image (expected base64 data URL, jpeg/png/webp).' });
    }
    if (!prompt) {
      return res.status(400).json({ error: 'Invalid treatment. Use: implant, full-arch, or veneers.' });
    }
    const [, mimeType, b64in] = match;
    if (b64in.length > 9_000_000) {
      return res.status(413).json({ error: 'Photo too large. Please use an image under 6 MB.' });
    }

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: b64in } },
            ],
          }],
        }),
      }
    );

    const json = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      let msg = json?.error?.message || `Gemini error ${apiRes.status}`;
      if (apiRes.status === 429) msg = 'Free-tier limit reached (about 10/minute, 500/day). Please wait a minute and try again.';
     if (apiRes.status === 429) msg = 'Gemini quota message: ' + (json?.error?.message || 'no detail');
      return res.status(502).json({ error: msg });
    }

    const parts = json.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
    const outB64 = imgPart?.inlineData?.data || imgPart?.inline_data?.data;
    if (!outB64) {
      const textPart = parts.find((p) => p.text)?.text || '';
      const block = json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason || '';
      return res.status(502).json({
        error: block === 'SAFETY' || /safety/i.test(textPart)
          ? 'The photo was declined by content safety filters. Please use a clear, standard portrait photo.'
          : 'No image returned by the model. Please try again.' + (textPart ? ` (${textPart.slice(0, 120)})` : ''),
      });
    }

    const outMime = imgPart.inlineData?.mimeType || imgPart.inline_data?.mime_type || 'image/png';
    return res.status(200).json({ url: `data:${outMime};base64,${outB64}` });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: err.message || 'Generation failed.' });
  }
}
