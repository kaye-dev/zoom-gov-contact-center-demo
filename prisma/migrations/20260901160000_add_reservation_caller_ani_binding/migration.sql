ALTER TABLE "reservation_bookings"
  ADD COLUMN "callerAniDigest" TEXT;

ALTER TABLE "reservation_bookings"
  ADD CONSTRAINT "reservation_bookings_caller_ani_digest_check"
  CHECK (
    "callerAniDigest" IS NULL
    OR "callerAniDigest" ~ '^[0-9a-f]{64}$'
  ) NOT VALID;
