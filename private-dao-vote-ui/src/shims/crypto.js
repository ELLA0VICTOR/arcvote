export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function unsupported(name) {
  throw new Error(
    `${name} is not available in the browser shim. This code path should run on the ArcVote backend.`,
  );
}

export function createHash() {
  return unsupported("createHash");
}

export function createCipheriv() {
  return unsupported("createCipheriv");
}

export function createDecipheriv() {
  return unsupported("createDecipheriv");
}
