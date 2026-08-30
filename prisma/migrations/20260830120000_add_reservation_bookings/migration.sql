CREATE TABLE "reservation_bookings" (
    "id" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "reservationDate" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservation_bookings_service_key_check" CHECK (
      "serviceKey" IN (
        'my-number-card',
        'legal-consultation',
        'bulky-waste',
        'civic-facility'
      )
    ),
    CONSTRAINT "reservation_bookings_start_minute_check" CHECK (
      "startMinute" BETWEEN 0 AND 1439
    )
);

CREATE INDEX "reservation_bookings_serviceKey_reservationDate_startMinute_idx"
  ON "reservation_bookings"("serviceKey", "reservationDate", "startMinute");

CREATE INDEX "reservation_bookings_reservationDate_isDemo_idx"
  ON "reservation_bookings"("reservationDate", "isDemo");
