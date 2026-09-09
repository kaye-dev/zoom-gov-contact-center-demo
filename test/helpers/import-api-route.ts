import * as nodeModule from "node:module";

const { registerHooks } = nodeModule as unknown as {
  registerHooks(options: {
    resolve(specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown): unknown;
  }): { deregister(): void };
};

/** Reproduce Next's server-build marker alias only while loading the API. */
export async function importApiRoute() {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return next(specifier === "server-only" ? "next/dist/compiled/server-only/empty.js" : specifier, context);
    },
  });
  try {
    return await import("../../app/api/[[...route]]/route");
  } finally {
    hooks.deregister();
  }
}
