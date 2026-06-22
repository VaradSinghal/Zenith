import { NextResponse } from "next/server";

export async function GET() {
  // TODO: Proxy CelesTrak TLE feeds to avoid CORS issues
  return NextResponse.json({ status: "ok", data: [] });
}
