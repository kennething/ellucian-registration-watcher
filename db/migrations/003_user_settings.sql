
CREATE TABLE user_settings (
    uuid TEXT NOT NULL PRIMARY KEY UNIQUE,
    web_theme INTEGER NOT NULL DEFAULT 0,
    notify_new_terms INTEGER NOT NULL DEFAULT 1,
    notify_stale_terms INTEGER NOT NULL DEFAULT 1,
    notify_default_watchers INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (uuid) REFERENCES users(uuid) ON DELETE CASCADE
);

INSERT INTO user_settings (uuid, web_theme, notify_default_watchers) SELECT uuid, web_theme, default_notifications FROM users;

ALTER TABLE users DROP COLUMN default_notifications;
ALTER TABLE users DROP COLUMN web_theme;
