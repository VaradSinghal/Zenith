import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch("http://api.open-notify.org/astros.json", {
      cache: "force-cache",
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch astros, status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Astros fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch astros data" },
      { status: 502 }
    );
  }
}
