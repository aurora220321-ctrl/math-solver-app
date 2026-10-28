// api/solve.js
export const config = {
  maxDuration: 60, // 최대 60초 실행 허용 (고난도 킬러 문제 연산 대응)
};

export default async function handler(req, res) {
  // CORS 및 메서드 제어
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, promptText, imageData, textContent, userKey } = req.body;

    // Vercel 환경변수 또는 사용자 전달 키 사용
    const apiKey = process.env.GEMINI_API_KEY || userKey;

    if (!apiKey) {
      return res.status(400).json({ 
        error: 'API 키가 설정되지 않았습니다. Vercel 환경 변수(GEMINI_API_KEY)에 등록하거나 화면에서 API 키를 입력해주세요.' 
      });
    }

    const endpoint = `[https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$){apiKey}`;

    const parts = [];

    // 이미지 페이로드 구성
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

    // 텍스트 문제 페이로드 구성
    if (textContent) {
      parts.push({ text: `[문제 입력]\n${textContent}` });
    }

    // 메인 시스템 프롬프트
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
        error: errorData.error?.message || 'Gemini API 호출에 실패했습니다.' 
      });
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return res.status(500).json({ error: 'AI 해설을 생성하지 못했습니다.' });
    }

    // 수식 이스케이프 보정 및 JSON 파싱
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
    return res.status(500).json({ error: error.message || '서버 내부 오류가 발생했습니다.' });
  }
}