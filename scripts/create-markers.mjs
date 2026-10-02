import { mkdir, writeFile } from 'node:fs/promises';
import { MARKER_CATEGORIES, markerSVG } from '../frontend/assets/js/marker-categories.js';
const directory = new URL('../frontend/assets/images/markers/', import.meta.url);
await mkdir(directory, { recursive: true });
await Promise.all(Object.keys(MARKER_CATEGORIES).map((id) => writeFile(new URL(`${id}.svg`, directory), markerSVG(id), 'utf8')));
