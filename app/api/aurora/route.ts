import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", {
      next: { revalidate: 900 }, // Cache for 15 minutes
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Kp index, status: ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[data.length - 1];
      return NextResponse.json({ kp: latest.kp_index });
    }
    
    return NextResponse.json({ kp: 0 });
  } catch (error) {
    console.error("Aurora fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch aurora data", kp: 0 }, { status: 502 });
  }
}
