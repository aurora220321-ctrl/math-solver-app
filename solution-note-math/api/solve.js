// api/solve.js
export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { promptText, imageData, textContent, userKey } = req.body;

    // Vercel 환경변수에 등록된 GEMINI_API_KEY 사용
    const apiKey = process.env.GEMINI_API_KEY || userKey;

    if (!apiKey) {
      return res.status(400).json({ 
        error: 'Vercel 환경 변수에 GEMINI_API_KEY가 설정되어 있지 않습니다.' 
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const parts = [];

    if (imageData) {
      const rawBase64 = imageData.replace(/^data:image\/\w+;base64,/, '');
      const mimeType = imageData.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: rawBase64
        }
      });
    }

    if (textContent) {
      parts.push({ text: `[문제 입력]\n${textContent}` });
    }

    parts.push({ text: promptText });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.15,
          topP: 0.95
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: errorData.error?.message || `Gemini API 오류 (${response.status})` 
      });
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return res.status(500).json({ error: 'AI 해설을 생성하지 못했습니다.' });
    }

    let parsedData = null;
    let cleaned = candidateText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    try {
      parsedData = JSON.parse(cleaned);
    } catch (e1) {
      try {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          let candidate = match[0].replace(/(?<!\\)\\(?!["\\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\');
          parsedData = JSON.parse(candidate);
        }
      } catch (e2) {
        parsedData = {
          category: "고등 수학",
          recognizedProblem: "문제 분석 완료",
          coreConcepts: ["핵심 개념"],
          steps: [{ stepNumber: 1, title: "풀이 과정", explanation: candidateText }],
          finalAnswer: "해설 참조",
          mistakeTip: "풀이 단계를 꼼꼼히 검토하세요."
        };
      }
    }

    return res.status(200).json({ success: true, data: parsedData });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message || '서버 오류가 발생했습니다.' });
  }
}
