/** What a page needs to show a resort's photo (safe to send to the browser). */
export interface Photo {
  kind: "google" | "wiki";
  src: string;
  credit: string | null; // photographer (Google) or "Wikipedia"
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
  if (!p.photoUrl) return null;
  if (p.photoStatus === "google")
    // served by our route from private storage; the index in the address means a newly picked
    // photo isn't stuck behind the browser's cache
    return { kind: "google", src: `/api/photo/${p.propertyId}?v=${p.photoIndex}`, credit: p.photoCredit, creditUrl: p.photoCreditUrl };
  if (p.photoStatus === "wiki") return { kind: "wiki", src: p.photoUrl, credit: "Wikipedia", creditUrl: p.photoCreditUrl };
  return null;
}
