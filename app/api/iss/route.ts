import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("http://api.open-notify.org/iss-now.json", {
      cache: "no-store",
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ISS position, status: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    console.error("ISS fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ISS data from Open Notify" },
      { status: 502 }
    );
  }
}
