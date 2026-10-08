// The visitor collection, kept in this browser. Each work is a physics
// snapshot, not a picture: positions and rotations of every fragment, the
// frozen instant of the debris and the liquid, and where the visitor stood.
//
// { id, number, title, creator, note, date, sourceArtwork,
//   state: [x,y,z, qx,qy,qz,qw, …], extra: { t, bursts, splash }, cam: { p, t, q } }

const KEY = 'museum-of-impact.collection.v2';

export function loadCollection(validIds) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((w) => w && validIds.includes(w.sourceArtwork) && Array.isArray(w.state)) : [];
  } catch {
    return [];
  }
}

export function saveCollection(list) {
  let l = list.slice();
  while (l.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(l));
      return l;
    } catch {
      l = l.slice(1); // storage full: the oldest work is deaccessioned
    }
  }
  return l;
}

export function newId() {
  return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Visitor works continue the permanent numbering: 006, 007, … */
export function nextNumber(list) {
  const max = list.reduce((m, w) => Math.max(m, parseInt(w.number, 10) || 0), 5);
  return String(max + 1).padStart(3, '0');
}
