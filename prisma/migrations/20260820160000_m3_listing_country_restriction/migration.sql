-- M3: COUNTRY_RESTRICTED visibility — allowed destination countries per listing
ALTER TABLE "Listing" ADD COLUMN     "restrictedToCountryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
