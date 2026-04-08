const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Δημιουργία φακέλου assets αν δεν υπάρχει
const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

// Συνάρτηση για δημιουργία PNG με κείμενο
function createPNG(width, height, text, filename) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
  
  // Text
  ctx.fillStyle = '#FFD600';
  ctx.font = `bold ${Math.floor(height / 4)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  
  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, filename), buffer);
  console.log(`✓ Created ${filename} (${width}x${height})`);
}

// Δημιουργία όλων των assets
createPNG(1024, 1024, 'V', 'icon.png');
createPNG(1024, 1024, 'V', 'adaptive-icon.png');
createPNG(2048, 2048, 'VAICON', 'splash-icon.png');
createPNG(48, 48, 'V', 'favicon.png');

console.log('\n✅ All assets created successfully!');
