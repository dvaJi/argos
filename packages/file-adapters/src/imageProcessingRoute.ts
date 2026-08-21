/**
 * Route caller used by ImageFileAdapter to reach the image processing route
 * ("image.process"). Hosts inject the transport (the desktop wires this to its
 * daemon HTTP proxy). Calling without a configured transport throws; image
 * processing is not part of knowledge ingestion (images are excluded there).
 */
type RouteCaller = <T>(route: string, input: unknown) => Promise<T>;

let routeCaller: RouteCaller | null = null;

export function setImageProcessingRouteCaller(caller: RouteCaller | null): void {
  routeCaller = caller;
}

export async function callImageProcessingRoute<T>(route: string, input: unknown): Promise<T> {
  if (!routeCaller) {
    throw new Error("Image processing route caller is not configured in this host");
  }
  return await routeCaller<T>(route, input);
}
