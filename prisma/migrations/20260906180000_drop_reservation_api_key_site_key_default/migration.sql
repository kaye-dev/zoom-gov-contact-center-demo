-- ReservationApiKey.siteKey is now supplied explicitly by every issuance path.
ALTER TABLE "reservation_api_keys" ALTER COLUMN "siteKey" DROP DEFAULT;
