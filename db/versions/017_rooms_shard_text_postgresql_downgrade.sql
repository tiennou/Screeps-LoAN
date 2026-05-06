# Back to integer: drop rooms on shards that are not shard + digits (e.g. shardX).
ALTER TABLE rooms
    ALTER COLUMN shard DROP DEFAULT;

DELETE FROM rooms
WHERE shard::text !~ '^shard[0-9]+$';

ALTER TABLE rooms
    ALTER COLUMN shard TYPE integer USING (
        substring(shard::text FROM 6)::integer
    );

ALTER TABLE rooms
    ALTER COLUMN shard SET DEFAULT 0;
