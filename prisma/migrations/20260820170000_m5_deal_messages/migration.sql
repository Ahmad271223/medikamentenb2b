-- M5/deal room: per-transaction message thread (chat deferred earlier, now delivered)
CREATE TABLE "DealMessage" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "orgId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DealMessage_transactionId_createdAt_idx" ON "DealMessage"("transactionId", "createdAt");

ALTER TABLE "DealMessage" ADD CONSTRAINT "DealMessage_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealMessage" ADD CONSTRAINT "DealMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DealMessage" ADD CONSTRAINT "DealMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
