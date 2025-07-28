ALTER TABLE
    users
ADD
    COLUMN alliance_role character varying(50) DEFAULT 'member' NOT NULL;