import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("http://api.open-notify.org/astros.json", {
      next: { revalidate: 3600 },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch astros, status: ${response.status}`);
    }

    const data = await response.json();
    const issCrew = data.people ? data.people.filter((p: any) => p.craft === "ISS") : [];
    return NextResponse.json({ crew: issCrew });
  } catch (error) {
    console.error("Astros fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch astros data" },
      { status: 502 }
    );
  }
}
