import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../src/auth/auth.service";

test("bootstrap returns an authenticated admin envelope after creating local defaults", async () => {
  const auditWrites: unknown[][] = [];
  const tx: any = {
    user: {
      count: async () => 0,
      create: async ({ data }: any) => ({ id: "admin-1", ...data }),
    },
    commercialSettings: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => ({ ...create }),
    },
    technique: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => ({ id: create.code, ...create }),
    },
    kiln: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => ({ id: create.code, ...create }),
    },
  };
  const prisma: any = {
    $transaction: async (work: (transaction: any) => Promise<unknown>) =>
      work(tx),
  };
  const jwt: any = {
    signAsync: async (payload: unknown) => {
      assert.deepEqual(payload, {
        id: "admin-1",
        email: "admin@example.com",
        displayName: "Admin Local",
        role: "ADMIN",
      });
      return "signed-admin-token";
    },
  };
  const config: any = { get: () => "bootstrap-secret" };
  const audit: any = {
    write: async (...args: unknown[]) => {
      auditWrites.push(args);
    },
  };
  const service = new AuthService(prisma, jwt, config, audit);

  const result = await service.bootstrap(
    {
      displayName: "Admin Local",
      email: "ADMIN@example.com",
      password: "a-long-local-password",
    } as any,
    "bootstrap-secret",
  );

  assert.deepEqual(result, {
    accessToken: "signed-admin-token",
    user: {
      id: "admin-1",
      email: "admin@example.com",
      displayName: "Admin Local",
      role: "ADMIN",
    },
  });
  assert.equal(auditWrites.length, 14);
  assert.equal(JSON.stringify(result).includes("passwordHash"), false);
});
