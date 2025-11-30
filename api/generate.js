export default async function handler(req, res) {
  // 1. קבלת המפתח ממשתני הסביבה (מוגדר ב-Vercel Dashboard)
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY in environment variables' });
  }

  // 2. קבלת הפרומפט והכלים מהקליינט
  const { prompt, tools } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body' });
  }

  // בניית אובייקט הבקשה ל-Gemini
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  // הוספת כלי חיפוש אם נשלחו מהקליינט (למשל google_search)
  if (tools && Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
  }

  try {
    // 3. שליחת הבקשה ל-Gemini API
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json(); // נסיון לקבל פרטים נוספים על השגיאה
      console.error('Gemini API Error Details:', errorData);
      throw new Error(`Gemini API Error: ${geminiResponse.statusText}`);
    }

    const data = await geminiResponse.json();

    // 4. החזרת התשובה לקליינט (כמו שהיא)
    res.status(200).json(data);

  } catch (error) {
    console.error('Error calling Gemini:', error);
    res.status(500).json({ error: 'Failed to fetch from Gemini' });
  }
}
