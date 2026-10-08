// The permanent collection, in the order a visitor meets it.
import shatter from './shatter.js';
import fracture from './fracture.js';
import splash from './splash.js';
import breakIce from './breakice.js';
import collapse from './collapse.js';

export const ARTWORKS = [shatter, fracture, splash, breakIce, collapse];
export const byId = Object.fromEntries(ARTWORKS.map((a) => [a.id, a]));
