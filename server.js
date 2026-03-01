const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleAuth } = require('google-auth-library');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT?.trim();
const REGION = process.env.VERTEX_REGION?.trim() || 'us-central1';
const useVertex = !!PROJECT_ID;

const PROMPT = `Act as an expert Digital Logic and FPGA Engineer.
1. Analyze the provided circuit sketch image and identify all logic gates, connections, and components carefully.
2. Identify all primary inputs, outputs, and logic gates (AND, OR, NOT, NAND, NOR, XOR, XNOR) present in the circuit.
3. Determine the Boolean logic expression represented by the connections.
4. Write a clean, synthesizable Verilog module using dataflow (assign statements) that accurately represents the logic of the circuit.
5. Use standard naming convention (e.g., module circuit_top (input a, input b, output y);) and ensure the code is well-formatted and commented for clarity.
6. IMPORTANT: Output ONLY the Verilog code block. Do not include explanations, greetings, or markdown formatting outside the code block.`;

app.post('/api/synthesize', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Missing imageBase64 or mimeType' });
    }

    let data;

    if (useVertex) {
      // Vertex AI 
      const vertexUrl = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/publishers/google/models/gemini-2.0-flash:generateContent`;
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
      };
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const client = await auth.getClient();
      const tokenResult = await client.getAccessToken();
      const accessToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
      if (!accessToken) {
        throw new Error('Could not get access token. Run: gcloud auth application-default login');
      }
      const response = await fetch(vertexUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vertex AI error:', response.status, errorText);
        return res.status(response.status).json({ error: `Vertex AI error: ${response.status}`, details: errorText });
      }
      data = await response.json();
    } else {
      // Google AI Studio (API key) — fallback
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Missing GEMINI_API_KEY for fallback mode' });
      }
      const geminiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          },
        ],
      };
      const response = await fetch(`${geminiUrl}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini error:', response.status, errorText);
        return res.status(response.status).json({ error: `Gemini error: ${response.status}`, details: errorText });
      }
      data = await response.json();
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const rawText = parts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
    const verilog = rawText
      .replace(/^```(?:verilog)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    if (!verilog) {
      return res.status(502).json({
        error: 'Model returned empty response',
        details: JSON.stringify(data),
      });
    }

    return res.json({ verilog });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
