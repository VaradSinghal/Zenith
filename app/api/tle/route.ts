import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const group = searchParams.get("group");

  if (!group) {
    return NextResponse.json(
      { error: "Missing 'group' query parameter" },
      { status: 400 }
    );
  }

  try {
    // Celestrak moved their TLE endpoints to the new gp.php API
    const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, {
      headers: {
        "User-Agent": "Project-Zenith/1.0",
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch TLE data for group: ${group}, status: ${response.status}`);
    }

    const text = await response.text();

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=7200",
      },
    });
  } catch (error) {
    console.error("TLE fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch TLE data from CelesTrak" },
      { status: 502 }
    );
  }
}
