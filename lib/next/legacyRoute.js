import { Readable } from "node:stream";

function createEmptyReadable() {
  return new Readable({
    read() {
      this.push(null);
    },
  });
}

function headersToObject(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

function toNodeRequest(request) {
  const bodyStream = request.body ? Readable.fromWeb(request.body) : createEmptyReadable();
  bodyStream.method = request.method;
  bodyStream.url = request.url;
  bodyStream.headers = headersToObject(request.headers);
  bodyStream.query = {};
  return bodyStream;
}

function buildResponseCollector(resolve) {
  const headers = new Headers();
  let statusCode = 200;
  let settled = false;

  const finish = (body = "") => {
    if (settled) return;
    settled = true;

    const nextBody =
      statusCode === 204 || statusCode === 304
        ? null
        : body == null
          ? ""
          : body;

    resolve(
      new Response(nextBody, {
        status: statusCode,
        headers,
      }),
    );
  };

  return {
    get settled() {
      return settled;
    },
    setHeader(name, value) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
      return this;
    },
    status(code) {
      statusCode = Number(code) || 200;
      return this;
    },
    json(value) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json; charset=utf-8");
      }
      finish(JSON.stringify(value));
      return this;
    },
    end(value = "") {
      finish(value);
      return this;
    },
  };
}

export function createLegacyRouteHandler(legacyHandler) {
  return async function handleRoute(request) {
    const req = toNodeRequest(request);

    return new Promise((resolve, reject) => {
      const res = buildResponseCollector(resolve);

      Promise.resolve(legacyHandler(req, res))
        .then(() => {
        if (!res.settled) {
          resolve(new Response(null, { status: 204 }));
        }
        })
        .catch(reject);
    });
  };
}
