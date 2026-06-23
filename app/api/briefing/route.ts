import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "missing_api_key" }, { status: 400 });
    }

    const body = await req.json();
    const { observer, overhead, planets, date, issNextPass } = body;

    interface SatData { name: string; az: number; el: number; }
    interface PlanetData { name: string; az: number; el: number; mag: number; }
    const topSats = overhead.slice(0, 5).map((s: SatData) => `${s.name} (Az: ${s.az.toFixed(0)}°, El: ${s.el.toFixed(0)}°)`).join(', ');
    const visPlanets = planets.filter((p: PlanetData) => p.el > 0).map((p: PlanetData) => `${p.name} (Az: ${p.az.toFixed(0)}°, El: ${p.el.toFixed(0)}°, Mag: ${p.mag.toFixed(1)})`).join(', ');
    
    let issStatus = "Not currently overhead.";
    if (issNextPass) {
      issStatus = `Next pass AOS: ${new Date(issNextPass.aosDate).toUTCString()}, max elevation: ${issNextPass.maxEl.toFixed(1)}°`;
    }

    const promptText = `
Observer at lat ${observer.lat}, lon ${observer.lon} at ${new Date(date).toUTCString()}.
Visible satellites: ${topSats || 'None'}
Planets overhead: ${visPlanets || 'None'}
ISS next pass: ${issStatus}

Write a 3-sentence natural language sky briefing for a casual stargazer.
Be specific with times and directions. Be enthusiastic but factual.
    `.trim();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are an astronomy guide. Write concise, exciting sky-watching briefings." }]
        },
        contents: [{
          role: "user",
          parts: [{ text: promptText }]
        }],
        generationConfig: {
          maxOutputTokens: 300
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Gemini API Error:", text);
      return NextResponse.json({ error: "api_error" }, { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (err) {
    console.error("Briefing error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
