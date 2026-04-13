-- Enables Postgres `fuzzystrmatch` for the search API's fuzzy
-- identifier fallback (levenshtein <= 2 on short IDs like HS-05827).
-- Lets the command palette surface "did you mean" suggestions when a
-- user transposes/drops a digit in a case number.
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
