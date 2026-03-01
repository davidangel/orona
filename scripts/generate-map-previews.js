const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { Map } = require('../src/map');

const MAP_SIZE = 256;
const TILE_SIZE = 32;
const WATER_TYPES = ['^', ' ', 'b'];
const TARGET_SIZE = 1024;

const mapsDir = path.join(__dirname, '..', 'maps');
const tilesetPath = path.join(__dirname, '..', 'images', 'base.png');

const mapFiles = fs.readdirSync(mapsDir)
  .filter(f => f.endsWith('.map') || f.endsWith('.bmp'))
  .filter(f => fs.statSync(path.join(mapsDir, f)).isFile());

async function generatePreviews() {
  const tileset = await sharp(tilesetPath).raw().toBuffer({ resolveWithObject: true });
  const tilesetData = tileset.data;
  const tilesetWidth = tileset.info.width;
  const tilesetHeight = tileset.info.height;
  
  const tilesX = Math.floor(tilesetWidth / TILE_SIZE);
  console.log(`Tileset: ${tilesetWidth}x${tilesetHeight}, tiles: ${tilesX}x${Math.floor(tilesetHeight / TILE_SIZE)}`);

  const getTilePixels = (tx, ty) => {
    const pixels = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        const srcIdx = ((ty * TILE_SIZE + py) * tilesetWidth + (tx * TILE_SIZE + px)) * 4;
        const dstIdx = (py * TILE_SIZE + px) * 4;
        pixels[dstIdx] = tilesetData[srcIdx];
        pixels[dstIdx + 1] = tilesetData[srcIdx + 1];
        pixels[dstIdx + 2] = tilesetData[srcIdx + 2];
        pixels[dstIdx + 3] = tilesetData[srcIdx + 3];
      }
    }
    return pixels;
  };

  const cache = {};
  const getCachedTile = (tx, ty) => {
    const key = `${tx},${ty}`;
    if (!cache[key]) {
      cache[key] = getTilePixels(tx, ty);
    }
    return cache[key];
  };

  let processed = 0;
  for (const mapFile of mapFiles) {
    const mapPath = path.isAbsolute(mapFile) ? mapFile : path.join(mapsDir, mapFile);
    processed++;
    if (processed % 100 === 0) {
      console.log(`Progress: ${processed}/${mapFiles.length}`);
    }

    try {
      const buffer = fs.readFileSync(mapPath);
      const map = Map.load(buffer);

      const TileStoringView = {
        onRetile(cell, tx, ty) {
          if (cell.mine && !cell.pill && !cell.base) {
            ty += 10;
          }
          cell.tile = [tx, ty];
        }
      };
      map.setView(TileStoringView);
      map.retile();

      let minX = MAP_SIZE, minY = MAP_SIZE, maxX = 0, maxY = 0;

      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          const cell = map.cellAtTile(x, y);
          if (!WATER_TYPES.includes(cell.type.ascii)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (minX > maxX) {
        minX = 0; minY = 0; maxX = MAP_SIZE - 1; maxY = MAP_SIZE - 1;
      }

      const cropOriginalWidth = maxX - minX + 1;
      const cropOriginalHeight = maxY - minY + 1;

      const oceanTile = getCachedTile(0, 0);
      
      const minTilesForOcean = 2;
      const targetTiles = TARGET_SIZE / TILE_SIZE;
      
      let cropWidth = cropOriginalWidth + minTilesForOcean * 2;
      let cropHeight = cropOriginalHeight + minTilesForOcean * 2;
      
      if (cropWidth < targetTiles) cropWidth = targetTiles;
      if (cropHeight < targetTiles) cropHeight = targetTiles;
      
      const size = Math.max(cropWidth, cropHeight);
      cropWidth = cropHeight = size;

      const startX = Math.floor((cropWidth - cropOriginalWidth) / 2);
      const startY = Math.floor((cropHeight - cropOriginalHeight) / 2);

      const rawData = Buffer.alloc(cropWidth * TILE_SIZE * cropHeight * TILE_SIZE * 4);

      for (let y = 0; y < cropHeight; y++) {
        for (let x = 0; x < cropWidth; x++) {
          let tilePixels = oceanTile;
          
          const mapX = minX + x - startX;
          const mapY = minY + y - startY;
          
          if (mapX >= 0 && mapX < MAP_SIZE && mapY >= 0 && mapY < MAP_SIZE) {
            const cell = map.cellAtTile(mapX, mapY);
            let tx = cell.tile ? cell.tile[0] : 0;
            let ty = cell.tile ? cell.tile[1] : 0;
            tilePixels = getCachedTile(tx, ty);
          }
          
          for (let py = 0; py < TILE_SIZE; py++) {
            for (let px = 0; px < TILE_SIZE; px++) {
              const srcIdx = (py * TILE_SIZE + px) * 4;
              const dstIdx = ((y * TILE_SIZE + py) * (cropWidth * TILE_SIZE) + (x * TILE_SIZE + px)) * 4;
              rawData[dstIdx] = tilePixels[srcIdx];
              rawData[dstIdx + 1] = tilePixels[srcIdx + 1];
              rawData[dstIdx + 2] = tilePixels[srcIdx + 2];
              rawData[dstIdx + 3] = tilePixels[srcIdx + 3];
            }
          }
        }
      }

      const outputWidth = cropWidth * TILE_SIZE;
      const outputHeight = cropHeight * TILE_SIZE;

      const previewFile = path.basename(mapFile).replace(/\.(map|bmp)$/, '.jpg');
      const previewPath = path.join(path.dirname(mapPath), previewFile);

      await sharp(rawData, {
        raw: {
          width: outputWidth,
          height: outputHeight,
          channels: 4
        }
      })
        .resize(TARGET_SIZE, TARGET_SIZE, {
          fit: 'contain'
        })
        .jpeg({ quality: 90 })
        .toFile(previewPath);

      console.log(`Created: ${previewPath}`);
    } catch (err) {
      console.error(`Error processing ${mapFile}: ${err.message}`);
    }
  }

  console.log(`Generated ${mapFiles.length} preview images`);
}

generatePreviews();
