# Full Screeps shard id as text (shard0, shardX, …) — not just a numeric suffix
ALTER TABLE rooms
    ALTER COLUMN shard DROP DEFAULT;

ALTER TABLE rooms
    ALTER COLUMN shard TYPE varchar(64) USING shard::text;

# Legacy int-as-text is "0"; normalize to API-style names. Rows already "shard…" stay unchanged.
UPDATE rooms
SET shard = 'shard' || shard
WHERE shard NOT LIKE 'shard%%';

ALTER TABLE rooms
    ALTER COLUMN shard SET DEFAULT 'shard0';
