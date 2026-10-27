CREATE TABLE temp_table AS SELECT * FROM watchers;

DROP TABLE watchers;

CREATE TABLE watchers (
    uuid              TEXT    UNIQUE
                              PRIMARY KEY
                              NOT NULL,
    owner_uuid        TEXT    NOT NULL
                              REFERENCES users (uuid) ON DELETE CASCADE,
    is_active         INTEGER NOT NULL,
    last_notified     INTEGER,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    term_id           TEXT    NOT NULL,
    crn               TEXT    NOT NULL,
    notify_when       INTEGER NOT NULL,
    notify_when_value INTEGER NOT NULL
);

INSERT INTO watchers (
                         uuid,
                         owner_uuid,
                         is_active,
                         last_notified,
                         created_at,
                         updated_at,
                         term_id,
                         crn,
                         notify_when,
                         notify_when_value
                     )
                     SELECT uuid,
                            owner_uuid,
                            is_active,
                            last_notified,
                            created_at,
                            created_at AS updated_at,
                            term_id,
                            crn,
                            notify_when,
                            notify_when_value
                       FROM temp_table;

DROP TABLE temp_table;

CREATE TABLE temp_table_2 AS SELECT * FROM schedules;

DROP TABLE schedules;

CREATE TABLE schedules (
    uuid       TEXT    NOT NULL
                       UNIQUE
                       PRIMARY KEY,
    owner_uuid TEXT    NOT NULL
                       REFERENCES users (uuid) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    term_id    TEXT    NOT NULL
);

INSERT INTO schedules (
                          uuid,
                          owner_uuid,
                          created_at,
                          updated_at,
                          name,
                          term_id
                      )
                      SELECT uuid,
                             owner_uuid,
                             created_at,
                             created_at AS updated_at,
                             name,
                             term_id
                        FROM temp_table_2;

DROP TABLE temp_table_2;
