-- Seller enquiries describe a unit that is not on Nawy yet, so they name an
-- area, a compound and a type instead of pointing at an existing listing.
ALTER TABLE "leads" ADD COLUMN "area_id" UUID;
ALTER TABLE "leads" ADD COLUMN "compound_id" UUID;
ALTER TABLE "leads" ADD COLUMN "property_type" VARCHAR(24);

CREATE INDEX "leads_area_id_idx" ON "leads"("area_id");
CREATE INDEX "leads_compound_id_idx" ON "leads"("compound_id");
CREATE INDEX "leads_source_idx" ON "leads"("source");

-- SET NULL, matching how a lead already survives its property being deleted:
-- the enquiry and the person behind it outlive any catalogue row.
ALTER TABLE "leads" ADD CONSTRAINT "leads_area_id_fkey"
  FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_compound_id_fkey"
  FOREIGN KEY ("compound_id") REFERENCES "compounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
