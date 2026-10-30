import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'public/ch');
const metadataPath = path.join(root, 'docs/channel-logo-sources.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const sources = {
  ch_sport5_live: ['5sport-il.png', 'sport-5-square.svg', 512, 631],
  ch_sport5_extra_live: ['5live-il.png', 'sport-5-live-square.svg', 512, 641],
  ch_sport5_plus: ['5plus-il.png', 'sport-5-plus-square.svg', 512, 642],
  ch_sport5_gold: ['5gold-il.png', 'sport-5-gold-square.svg', 512, 643],
  ch_sport5_stars: ['5stars-il.png', 'sport-5-stars-square.svg', 512, 641],
  ch_sport5_max: ['sport5max.webp', 'sport-5-max-square.svg', 200, 200],
  ch_one1: ['one-il.png', 'one-1-square.svg', 512, 107],
  ch_one2: ['one2-il.png', 'one-2-square.svg', 512, 111],
  ch_eurosport1: ['eurosport1.png', 'eurosport-1-square.svg', 576, 418],
  ch_eurosport2: ['eurosport2.png', 'eurosport-2-square.svg', 512, 307],
};
const colors = ['#00dc82', '#ff1744', '#ffe000', '#00e5ef'];
for (const entry of metadata) {
  if (!entry.streamSlug) continue;
  let artwork;
  let background = '#101820';
  const sportNumber = /^ch_sport([1-4])$/.exec(entry.channelID)?.[1];
  if (sportNumber) {
    const original = `originals/sport-${sportNumber}.svg`;
    const source = fs.readFileSync(path.join(directory, original), 'utf8');
    const viewBox = source.match(/viewBox="([^"]+)"/)[1];
    const body = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replaceAll('#FFF', colors[Number(sportNumber) - 1]);
    // Use the actual vector numeral and wordmark, retaining their proportions.
    const numeralWidth = sportNumber === '1' ? 6.5 : sportNumber === '4' ? 9.6 : 8.2;
    const displayWidth = numeralWidth / 13.6 * 290;
    artwork = `<svg x="${(512 - displayWidth) / 2}" y="38" width="${displayWidth}" height="290" viewBox="0 4.4 ${numeralWidth} 13.6">${body}</svg>\n<svg x="24" y="358" width="464" height="128" viewBox="${viewBox}">${body}</svg>`;
    entry.logo = `sport-${sportNumber}-square.svg`;
    entry.original = original;
    entry.layout = 'Official vector numeral above the complete wordmark';
  } else {
    const [filename, logo, width, height] = sources[entry.channelID];
    const original = `originals/square-sources/${filename}`;
    const type = filename.endsWith('.webp') ? 'webp' : 'png';
    const data = fs.readFileSync(path.join(directory, original)).toString('base64');
    const image = `<image width="${width}" height="${height}" href="data:image/${type};base64,${data}"/>`;
    const isMax = entry.channelID === 'ch_sport5_max';
    const isEuro = entry.channelID.startsWith('ch_eurosport');
    background = isMax || isEuro || entry.channelID.startsWith('ch_one') ? '#ffffff' : background;
    artwork = `<svg x="24" y="24" width="464" height="464" viewBox="${isMax ? '30 28 140 140' : `0 0 ${width} ${height}`}" preserveAspectRatio="xMidYMid meet">${image}</svg>`;
    entry.logo = logo;
    entry.original = original;
    entry.sourceUrl = isMax ? 'https://cms.freetv.tv/uploads/sport5max_7d0d681281.webp'
      : isEuro ? `https://i.imgur.com/${isEuro && entry.channelID === 'ch_eurosport1' ? 'olQJgm7' : 'f56dHgR'}.png`
      : `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/israel/${filename}`;
    entry.sourceDimensions = [width, height];
    entry.layout = isMax ? 'Compact logo; provider frame excluded' : 'Original artwork centered without stretching';
  }
  entry.dimensions = [512, 512];
  entry.background = background;
  fs.writeFileSync(path.join(directory, entry.logo), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n<rect width="512" height="512" rx="32" fill="${background}"/>\n${artwork}\n</svg>\n`);
}
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
