CREATE TABLE IF NOT EXISTS "TwoFactorCredential" (
    "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "secretCiphertext" TEXT,
    "pendingCiphertext" TEXT,
    "pendingExpiresAt" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER,
    "recoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3)
);
