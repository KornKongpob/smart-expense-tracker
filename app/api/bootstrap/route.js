import legacyHandler from "../../../server/legacy-api/bootstrap.js";
import { createLegacyRouteHandler } from "../../../lib/next/legacyRoute.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const route = createLegacyRouteHandler(legacyHandler);

export const GET = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
export const OPTIONS = route;
