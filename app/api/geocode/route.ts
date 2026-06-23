import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  
  if (!q) {
    return NextResponse.json([]);
  }
  
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`, {
      headers: {
        'User-Agent': 'ProjectZenith/1.0',
      },
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Geocode failed' }, { status: res.status });
    }
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Geocode error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
