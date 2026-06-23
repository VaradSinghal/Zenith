const fs = require('fs');
const https = require('https');

https.get('https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const constLines = [];
    
    json.features.forEach(feature => {
      const id = feature.id; // e.g. "And"
      const coords = feature.geometry.coordinates; // Array of LineStrings, each LineString is Array of [ra, dec]
      
      coords.forEach(lineString => {
        const points = lineString.map(pt => [pt[0], pt[1]]);
        constLines.push([id, points]);
      });
    });

    const fileContent = `// Auto-generated from d3-celestial dataset\nexport const CONST_LINES: Array<[string, [number, number][]]> = ${JSON.stringify(constLines)};\n`;
    fs.writeFileSync('lib/constellations.ts', fileContent);
    console.log('Successfully generated lib/constellations.ts with ' + constLines.length + ' line segments.');
  });
});
