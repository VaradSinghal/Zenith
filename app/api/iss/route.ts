import { NextResponse } from "next/server";

export async function GET() {
  // TODO: Proxy OpenNotify ISS live position to avoid CORS issues
  return NextResponse.json({ status: "ok", data: {} });
}
