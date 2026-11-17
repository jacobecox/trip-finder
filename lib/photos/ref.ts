/** What a page needs to show a resort's photo (safe to send to the browser). */
export interface Photo {
  kind: "google";
  src: string;
  credit: string | null; // photographer
  creditUrl: string | null;
}

export function photoOf(p: {
  propertyId: number;
  photoStatus: string;
  photoIndex: number;
  photoUrl: string | null;
  photoCredit: string | null;
  photoCreditUrl: string | null;
}): Photo | null {
  // a resort waiting to be re-picked keeps showing its current photo
  if (!p.photoUrl || p.photoStatus === "hidden" || p.photoStatus === "none") return null;
  // served by our route from private storage; the stored file's fingerprint in the address means a
  // newly picked photo isn't stuck behind the browser's cache
  return { kind: "google", src: `/api/photo/${p.propertyId}?v=${fingerprint(p.photoUrl)}`, credit: p.photoCredit, creditUrl: p.photoCreditUrl };
}

function fingerprint(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
