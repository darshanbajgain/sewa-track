-- 002_location_coordinates.sql: coordinates only where the map needs them.
--
-- Decision (2026-10-24, see docs/database.md §9):
--   * The map needs one point per LOCAL LEVEL (palika) only, not per ward. The heatmap uses
--     palika centroids weighted by the number of requests.
--   * Centroids come from a verified boundary file that follows Nepal's official 2020 map.
--     Until that file is chosen, local level coordinates stay NULL (unknown), never made up.
--
-- This is a NEW migration instead of an edit to 001, because 001 has already been applied.

-- Wards: remove the coordinate columns entirely. (Their CHECK constraints are dropped with them.)
ALTER TABLE wards
  DROP COLUMN lat,
  DROP COLUMN lng;

-- Local levels: coordinates become optional. The existing range CHECKs still apply when a
-- value is present (a CHECK passes for NULL).
ALTER TABLE local_levels
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lng DROP NOT NULL;

-- But never half a point: either both are set, or both are NULL.
ALTER TABLE local_levels
  ADD CONSTRAINT local_levels_coordinates_pair CHECK ((lat IS NULL) = (lng IS NULL));
