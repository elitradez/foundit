/**
 * Plain shared constants for the gym "Retrieve" tenant.
 *
 * IMPORTANT: this module has NO "use client" / "server-only" directive on
 * purpose. Values here are imported by BOTH server code (API routes, storage
 * helpers) and client components. If a constant like the storage bucket name
 * lived in a "use client" module, importing it from server code would give a
 * client-reference proxy instead of the real value at runtime — which is what
 * caused storage `.from(bucket)` to send a garbage bucket name and fail with
 * `400 Bucket name invalid`. Keep cross-boundary constants here.
 */

export const RETRIEVE_PHOTO_BUCKET = "retrieve-item-photos";
