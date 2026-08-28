/** Committed checkpoint galleries under app/public/gallery/<id>/ (own-origin only). */
export interface GalleryRef {
  readonly id: string;
  readonly path: string;
}

export const GALLERIES: readonly GalleryRef[] = [{ id: 'e7', path: '/gallery/e7/' }];

/** Landing state: E7 on Track A, the generalist focused with the specialist as a ghost. */
export const LANDING = {
  galleryId: 'e7',
  trackId: 'track_a',
  focusStep: 8_000_000,
  ghostSteps: [13_000_000],
} as const;
