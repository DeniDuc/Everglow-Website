// Test keys only. Integration tests use TEST_DATABASE_URL (a throwaway database).
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.BLIND_INDEX_KEY ??= Buffer.alloc(32, 9).toString("base64");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://everglow:everglow@localhost:5432/everglow_test";
