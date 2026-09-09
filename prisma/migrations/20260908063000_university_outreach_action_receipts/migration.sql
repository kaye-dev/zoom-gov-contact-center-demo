-- AlterTable
ALTER TABLE "university_call_attempts" ADD COLUMN     "requestDigest" TEXT;

-- AlterTable
ALTER TABLE "university_case_actions" ADD COLUMN     "handoffAt" TIMESTAMPTZ(3),
ADD COLUMN     "handoffRecipient" TEXT;

-- Preserve earlier attempts and case history without inventing verification records.
-- Existing handoff records must be reviewed before this constraint can be applied.
ALTER TABLE university_case_actions ADD CONSTRAINT university_handoff_receipt_check CHECK (
  "actionKind" <> 'handoff' OR (
    "handoffRecipient" IS NOT NULL AND length(trim("handoffRecipient")) > 0 AND "handoffAt" IS NOT NULL
  )
);
