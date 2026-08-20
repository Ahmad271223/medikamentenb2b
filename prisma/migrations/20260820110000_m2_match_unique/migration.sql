-- M2: one match per (listing, demand) pair
CREATE UNIQUE INDEX "Match_listingId_demandId_key" ON "Match"("listingId", "demandId");
